import fs from "node:fs/promises";
import path from "node:path";
import { buildRecommendedBetDecision } from "../lib/recommendedBetAction";
import type {
  PredictionSnapshot,
  PredictionSnapshotSelectionLogEntry,
  RaceReviewRecord,
  RecommendedBetDecision,
  ReviewSelectionHorse,
} from "../lib/types";

const ROOT = process.cwd();
const REVIEW_RECORDS_PATH = path.join(ROOT, "data", "review-records.json");
const SNAPSHOTS_PATH = path.join(ROOT, "data", "prediction-snapshots.jsonl");
const JST_SHIFT_MS = 9 * 60 * 60 * 1000;
const MAX_PRE_RACE_LEAD_MS = 14 * 60 * 60 * 1000;

type MutableSnapshot = PredictionSnapshot & Record<string, unknown>;
type MutableLogEntry = PredictionSnapshotSelectionLogEntry & Record<string, unknown>;
type MutableSelection = ReviewSelectionHorse & Record<string, unknown>;
type MutableReviewRecord = RaceReviewRecord & Record<string, unknown>;

type RepairStats = {
  reviewRecordsRepaired: number;
  jsonlSnapshotsRepaired: number;
  timestampsShifted: number;
  selectionLogDecisionsRecomputed: number;
  reviewSelectionDecisionsRecomputed: number;
  actionChanges: Record<string, number>;
};

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`) || process.argv.includes(name);
}

function normalizeString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseTimestamp(value: unknown): number | null {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toIso(timestamp: number) {
  return new Date(timestamp).toISOString();
}

function jstDate(timestamp: number) {
  return new Date(timestamp + JST_SHIFT_MS).toISOString().slice(0, 10);
}

function increment(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function actionOf(decision: unknown) {
  if (decision && typeof decision === "object") {
    return String((decision as RecommendedBetDecision).action ?? "unknown");
  }
  return "unknown";
}

function trackDecisionChange(stats: RepairStats, before: unknown, after: RecommendedBetDecision) {
  const previous = actionOf(before);
  const next = after.action;
  if (previous !== next) increment(stats.actionChanges, `${previous}->${next}`);
}

function isTimezoneShiftCandidate(snapshot: Partial<PredictionSnapshot> | null | undefined) {
  if (!snapshot) return false;
  if (snapshot.predictionOrigin !== "saved_live") return false;
  if (snapshot.snapshotType !== "pre_race_final") return false;
  if (snapshot.livePreRaceEligible === true || snapshot.sourceStatus === "live_pre_race") return false;

  const storedSourceStatus = snapshot.sourceStatus ?? snapshot.dataLineage?.sourceStatus;
  if (storedSourceStatus !== "retrospective") return false;

  const captured = parseTimestamp(snapshot.snapshotTakenAt ?? snapshot.capturedAt);
  const scheduled = parseTimestamp(snapshot.scheduledStartTime ?? snapshot.dataLineage?.scheduledStartTime);
  if (captured === null || scheduled === null) return false;

  const shiftedCaptured = captured - JST_SHIFT_MS;
  if (captured < scheduled || shiftedCaptured >= scheduled) return false;
  if (scheduled - shiftedCaptured > MAX_PRE_RACE_LEAD_MS) return false;

  const raceDate = normalizeString(snapshot.raceDate);
  return !raceDate || jstDate(shiftedCaptured) === raceDate;
}

function shiftTimestampField(target: Record<string, unknown>, key: string, stats: RepairStats) {
  const parsed = parseTimestamp(target[key]);
  if (parsed === null) return;
  target[key] = toIso(parsed - JST_SHIFT_MS);
  stats.timestampsShifted += 1;
}

function snapshotRow(snapshot: Partial<PredictionSnapshot>, horseId: unknown) {
  const id = normalizeString(horseId);
  if (!id) return null;
  return snapshot.rankedRows?.find((row) => String(row.horseId) === id) ?? null;
}

function fieldSize(snapshot: Partial<PredictionSnapshot>) {
  return normalizeNumber(snapshot.marketMeta?.fieldSize) ?? snapshot.rankedRows?.length ?? null;
}

function snapshotOddsSource(snapshot: Partial<PredictionSnapshot>, horseId: unknown) {
  const row = snapshotRow(snapshot, horseId);
  return (
    normalizeString((row as Record<string, unknown> | null)?.oddsSource) ??
    normalizeString(snapshot.marketMeta?.oddsSource) ??
    normalizeString(snapshot.dataLineage?.oddsSource)
  );
}

function recomputeLogEntryDecision(snapshot: MutableSnapshot, entry: MutableLogEntry, stats: RepairStats) {
  const row = snapshotRow(snapshot, entry.horseId);
  const simulationLeaderHorseId = normalizeString(snapshot.rankedRows?.[0]?.horseId);
  const horseId = normalizeString(entry.horseId);
  const beforeDecision = entry.recommendedBetDecision;
  const decision = buildRecommendedBetDecision({
    sourceStatus: "live_pre_race",
    livePreRaceEligible: true,
    classificationHint: entry.classificationHint,
    explicitAction: entry.recommendedBetAction,
    winProb: normalizeNumber(entry.winProb) ?? normalizeNumber(row?.winProb),
    scoreGap: normalizeNumber(entry.scoreGap),
    placeProb: normalizeNumber(entry.placeProb),
    top3Stability: normalizeNumber(entry.top3Stability),
    valueScore: normalizeNumber(entry.valueScore),
    fieldSize: fieldSize(snapshot),
    engineAgreement:
      entry.role === "honmei" && simulationLeaderHorseId && horseId
        ? simulationLeaderHorseId === horseId
        : null,
    overbetLabel: normalizeString(entry.overbetLabel),
    oddsSource: snapshotOddsSource(snapshot, horseId),
    hasSelectionLog: true,
  });
  entry.recommendedBetAction = decision.action;
  entry.recommendedBetDecision = decision;
  stats.selectionLogDecisionsRecomputed += 1;
  trackDecisionChange(stats, beforeDecision, decision);
}

function repairSnapshot(snapshot: MutableSnapshot | null | undefined, stats: RepairStats) {
  if (!snapshot || !isTimezoneShiftCandidate(snapshot)) return false;

  shiftTimestampField(snapshot, "capturedAt", stats);
  shiftTimestampField(snapshot, "snapshotTakenAt", stats);
  snapshot.sourceStatus = "live_pre_race";
  snapshot.livePreRaceEligible = true;

  if (snapshot.dataLineage && typeof snapshot.dataLineage === "object") {
    const lineage = snapshot.dataLineage as unknown as Record<string, unknown>;
    shiftTimestampField(lineage, "capturedAt", stats);
    lineage.sourceStatus = "live_pre_race";
    lineage.capturedBeforeScheduledStart = true;
  }

  if (snapshot.selectionLog && typeof snapshot.selectionLog === "object") {
    shiftTimestampField(snapshot.selectionLog as unknown as Record<string, unknown>, "createdAt", stats);
    const entries = Array.isArray(snapshot.selectionLog.entries) ? snapshot.selectionLog.entries : [];
    for (const entry of entries) recomputeLogEntryDecision(snapshot, entry as MutableLogEntry, stats);
  }

  return true;
}

function findLogEntry(snapshot: Partial<PredictionSnapshot>, horseId: unknown, roles: string[]) {
  const id = normalizeString(horseId);
  if (!id) return null;
  const entries = snapshot.selectionLog?.entries?.filter((entry) => String(entry.horseId ?? "") === id) ?? [];
  return roles.flatMap((role) => entries.filter((entry) => entry.role === role)).at(0) ?? null;
}

function recomputeSelectionFallbackDecision(
  snapshot: Partial<PredictionSnapshot>,
  selection: MutableSelection,
  hasSelectionLog: boolean
) {
  return buildRecommendedBetDecision({
    sourceStatus: "live_pre_race",
    livePreRaceEligible: true,
    classificationHint: selection.classificationHint,
    explicitAction: selection.recommendedBetAction,
    winProb: normalizeNumber(selection.winProb),
    scoreGap: normalizeNumber(selection.scoreGap),
    placeProb: normalizeNumber(selection.placeProb),
    top3Stability: normalizeNumber(selection.top3Stability),
    valueScore: normalizeNumber(selection.valueScore),
    fieldSize: fieldSize(snapshot),
    overbetLabel: normalizeString(selection.overbetLabel),
    oddsSource: snapshotOddsSource(snapshot, selection.horseId),
    hasSelectionLog,
  });
}

function applySelectionDecision(
  record: MutableReviewRecord,
  key: "honmei" | "opponent" | "wide",
  roles: string[],
  stats: RepairStats
) {
  const selection = record[key] as MutableSelection | null;
  const snapshot = record.snapshot;
  if (!selection || !snapshot) return;

  const entry = findLogEntry(snapshot, selection.horseId, roles);
  const beforeDecision = selection.recommendedBetDecision;
  const decision =
    entry?.recommendedBetDecision ??
    recomputeSelectionFallbackDecision(snapshot, selection, Boolean(snapshot.selectionLog?.entries?.length));

  if (entry?.classificationHint) selection.classificationHint = entry.classificationHint;
  selection.recommendedBetAction = decision.action;
  selection.recommendedBetDecision = decision;
  stats.reviewSelectionDecisionsRecomputed += 1;
  trackDecisionChange(stats, beforeDecision, decision);
}

async function repairReviewRecords(stats: RepairStats) {
  const raw = await fs.readFile(REVIEW_RECORDS_PATH, "utf8");
  const store = JSON.parse(raw) as { records?: Record<string, MutableReviewRecord> };
  const records = store.records ?? {};

  for (const record of Object.values(records)) {
    if (!repairSnapshot(record.snapshot as MutableSnapshot | null, stats)) continue;
    const snapshot = record.snapshot as MutableSnapshot;
    record.snapshotTakenAt = normalizeString(snapshot.snapshotTakenAt ?? snapshot.capturedAt);
    record.snapshotSourceStatus = "live_pre_race";
    record.livePreRaceEligible = true;
    applySelectionDecision(record, "honmei", ["honmei", "simulation_leader"], stats);
    applySelectionDecision(record, "opponent", ["opponent", "honmei", "simulation_leader"], stats);
    applySelectionDecision(record, "wide", ["wide", "value", "honmei", "simulation_leader"], stats);
    stats.reviewRecordsRepaired += 1;
  }

  return `${JSON.stringify(store, null, 2)}\n`;
}

async function repairJsonlSnapshots(stats: RepairStats) {
  const raw = await fs.readFile(SNAPSHOTS_PATH, "utf8");
  const hadTrailingNewline = raw.endsWith("\n");
  const lines = raw.split(/\r?\n/);
  const repaired = lines.map((line) => {
    if (!line.trim()) return line;
    const snapshot = JSON.parse(line) as MutableSnapshot;
    if (repairSnapshot(snapshot, stats)) {
      stats.jsonlSnapshotsRepaired += 1;
      return JSON.stringify(snapshot);
    }
    return line;
  });
  const output = repaired.join("\n");
  return hadTrailingNewline ? output : output.replace(/\n$/, "");
}

async function main() {
  const write = hasFlag("write");
  const stats: RepairStats = {
    reviewRecordsRepaired: 0,
    jsonlSnapshotsRepaired: 0,
    timestampsShifted: 0,
    selectionLogDecisionsRecomputed: 0,
    reviewSelectionDecisionsRecomputed: 0,
    actionChanges: {},
  };

  const nextReviewRecords = await repairReviewRecords(stats);
  const nextSnapshots = await repairJsonlSnapshots(stats);

  if (write) {
    await fs.writeFile(REVIEW_RECORDS_PATH, nextReviewRecords, "utf8");
    await fs.writeFile(SNAPSHOTS_PATH, nextSnapshots, "utf8");
  }

  console.log(
    JSON.stringify(
      {
        mode: write ? "write" : "dry-run",
        ...stats,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
