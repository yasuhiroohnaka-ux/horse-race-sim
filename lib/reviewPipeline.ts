import fs from "node:fs/promises";
import path from "node:path";
import { buildPredictionSnapshot } from "@/lib/predictionSnapshots";
import {
  buildRaceDateFromWeekOf,
  buildReviewRaceMeta,
  buildSelectionHorseFromSnapshot,
  combineRaceDateAndTime,
  createDiscoveredReviewRecord,
  createReviewRecordFromSnapshot,
  extractRaceId,
  loadReviewRecords,
  normalizeReviewRecord,
  upsertManyReviewRecords,
} from "@/lib/reviewRecords";
import {
  deriveIncompleteStatus,
  getMissingReasons,
  getNextRetryAt,
  isReviewComplete,
  shouldRetryReviewRecord,
} from "@/lib/reviewStatus";
import { runMonteCarlo } from "@/lib/simulation";
import { MONTE_CARLO_RUNS } from "@/lib/simulationConfig";
import type { PredictionSnapshot, RaceReviewRecord, ReviewSelectionHorse } from "@/lib/types";

const ROOT = process.cwd();
const WEEKLY_RACES_PATH = path.join(ROOT, "data", "weekly-races.json");
const SNAPSHOT_PATH = path.join(ROOT, "data", "prediction-snapshots.jsonl");
const PROCESS_LOCK_PATH = path.join(ROOT, "data", "review-records.lock");

type DayLabel = "Sat" | "Sun";

export type ReviewPipelinePhase = "snapshot" | "settle" | "all";

type WeeklyRace = {
  courseId: string;
  raceId?: string;
  label?: string;
  weekOf?: string;
  day?: string;
  raceDate?: string;
  venue?: string;
  venueKey?: string;
  raceNumber?: number;
  surface?: "Turf" | "Dirt";
  distance?: number;
  straightLength?: number;
  scheduledStartTime?: string;
  oddsSource?: string;
  horses: Array<Record<string, unknown>>;
  result?: {
    winnerHorseId?: string;
    top3HorseIds?: string[];
    finishers?: Array<Record<string, unknown>>;
    payouts?: {
      tansho?: { resultNumbers?: number[]; payouts?: number[] };
      fukusho?: { resultNumbers?: number[]; payouts?: number[] };
      wide?: { resultNumbers?: number[][]; payouts?: number[] };
    };
  };
};

type WeeklyRacesFile = {
  currentWeek?: {
    weekOf?: string;
    races?: WeeklyRace[];
  };
  archives?: Array<{
    weekOf?: string;
    races?: WeeklyRace[];
  }>;
};

type RaceScope = {
  weekOf: string | null;
  race: WeeklyRace;
};

type SnapshotMatch = {
  snapshot: PredictionSnapshot | null;
  joinKeyMismatch: boolean;
};

type SnapshotIndex = {
  byRaceId: Map<string, PredictionSnapshot>;
  byCourseId: Map<string, PredictionSnapshot>;
};

export type ReviewPipelineOptions = {
  phase: ReviewPipelinePhase;
  now?: Date;
  dayFilter?: DayLabel | null;
  raceIdFilter?: string | null;
  includeArchives?: boolean;
  refreshExisting?: boolean;
  forceRetryNow?: boolean;
  debug?: boolean;
};

export type ReviewPipelineResult = {
  ok: true;
  phase: ReviewPipelinePhase;
  includeArchives: boolean;
  refreshExisting: boolean;
  forceRetryNow: boolean;
  targetRaceCount: number;
  recordsDiscovered: number;
  snapshotsCreated: number;
  repairsApplied: number;
  reviewsSettled: number;
  failedCount: number;
  now: string;
  dayFilter: DayLabel | null;
  raceIdFilter: string | null;
};

function normalizeString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeNumber(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function jstNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
}

function toIso(value: Date) {
  return value.toISOString();
}

function debugLog(enabled: boolean, message: string, payload?: Record<string, unknown>) {
  if (!enabled) return;
  const suffix = payload ? ` ${JSON.stringify(payload)}` : "";
  console.info(`[review-pipeline] ${message}${suffix}`);
}

function safeRaceDate(race: WeeklyRace, weekOf: string | null) {
  return normalizeString(race.raceDate) ?? buildRaceDateFromWeekOf(weekOf, normalizeString(race.day));
}

function createDefaultCondition(courseId: string) {
  return {
    courseId,
    trackBias: { innerOuter: 0, frontBack: 0 },
    groundCondition: "Firm" as const,
    weather: "Sunny" as const,
    windDirection: "Crosswind" as const,
    windSpeed: 3,
    paceScenario: "Average" as const,
  };
}

function hasConfirmedResult(race: WeeklyRace) {
  const winnerHorseId = normalizeString(race.result?.winnerHorseId);
  const top3HorseIds = Array.isArray(race.result?.top3HorseIds) ? race.result?.top3HorseIds.filter(Boolean) : [];
  return Boolean(winnerHorseId && top3HorseIds.length > 0);
}

function hasPayoutTable(table: { resultNumbers?: unknown; payouts?: unknown } | undefined) {
  return Boolean(Array.isArray(table?.resultNumbers) && table.resultNumbers.length > 0 && Array.isArray(table?.payouts) && table.payouts.length > 0);
}

function hasAllRequiredPayouts(race: WeeklyRace) {
  return hasPayoutTable(race.result?.payouts?.tansho) && hasPayoutTable(race.result?.payouts?.fukusho) && hasPayoutTable(race.result?.payouts?.wide);
}

function isCancelledHorse(horse: Record<string, unknown> | null | undefined) {
  const text = [
    horse?.status,
    horse?.raceStatus,
    horse?.entryStatus,
    horse?.withdrawStatus,
    horse?.scratchStatus,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  return ["scratched", "scratch", "withdrawn", "withdraw", "cancelled", "canceled", "除外", "取消"].some((token) =>
    text.includes(token.toLowerCase())
  );
}

async function withProcessLock<T>(fn: () => Promise<T>): Promise<T> {
  await fs.mkdir(path.dirname(PROCESS_LOCK_PATH), { recursive: true });
  const startedAt = Date.now();

  while (true) {
    try {
      const handle = await fs.open(PROCESS_LOCK_PATH, "wx");
      await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`, "utf8");
      try {
        return await fn();
      } finally {
        await handle.close();
        await fs.rm(PROCESS_LOCK_PATH, { force: true });
      }
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST") throw error;
      if (Date.now() - startedAt > 30_000) {
        throw new Error(`timed out waiting for process lock: ${PROCESS_LOCK_PATH}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

async function readWeeklyRaces(): Promise<WeeklyRacesFile> {
  const raw = await fs.readFile(WEEKLY_RACES_PATH, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

function collectRaceScopes(weekly: WeeklyRacesFile, includeArchives: boolean): RaceScope[] {
  const scopes: RaceScope[] = [];
  const currentWeekOf = normalizeString(weekly.currentWeek?.weekOf);
  const currentRaces = Array.isArray(weekly.currentWeek?.races) ? weekly.currentWeek?.races ?? [] : [];
  for (const race of currentRaces) {
    scopes.push({ weekOf: currentWeekOf, race });
  }

  if (!includeArchives) {
    return scopes;
  }

  const archives = Array.isArray(weekly.archives) ? weekly.archives : [];
  for (const archive of archives) {
    const archiveWeekOf = normalizeString(archive.weekOf);
    const archiveRaces = Array.isArray(archive.races) ? archive.races ?? [] : [];
    for (const race of archiveRaces) {
      scopes.push({ weekOf: archiveWeekOf, race });
    }
  }

  return scopes;
}

async function readSnapshots(): Promise<PredictionSnapshot[]> {
  const raw = await fs.readFile(SNAPSHOT_PATH, "utf8").catch((error) => {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return "";
    throw error;
  });

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as PredictionSnapshot];
      } catch {
        return [];
      }
    });
}

function buildSnapshotIndex(snapshots: PredictionSnapshot[], records: Record<string, RaceReviewRecord>) {
  const byRaceId = new Map<string, PredictionSnapshot>();
  const byCourseId = new Map<string, PredictionSnapshot>();

  const candidates = [
    ...snapshots,
    ...Object.values(records)
      .map((record) => record.snapshot)
      .filter((snapshot): snapshot is PredictionSnapshot => Boolean(snapshot)),
  ];

  for (const snapshot of candidates) {
    const raceId = extractRaceId(snapshot.raceId);
    const courseId = normalizeString(snapshot.courseId);
    if (raceId && !byRaceId.has(raceId)) {
      byRaceId.set(raceId, snapshot);
    }
    if (courseId && !byCourseId.has(courseId)) {
      byCourseId.set(courseId, snapshot);
    }
  }

  return { byRaceId, byCourseId };
}

function createTieBrokenScoredRows(scoredRows: Array<Record<string, unknown>>) {
  return [...scoredRows].sort((left, right) => {
    const placeScoreDiff = Number((right.placeScore ?? 0)) - Number((left.placeScore ?? 0));
    if (placeScoreDiff !== 0) return placeScoreDiff;
    const placeProbDiff = Number((right.placeProb ?? 0)) - Number((left.placeProb ?? 0));
    if (placeProbDiff !== 0) return placeProbDiff;
    const leftGate = Number((left.horse as Record<string, unknown> | undefined)?.gateNumber ?? 999);
    const rightGate = Number((right.horse as Record<string, unknown> | undefined)?.gateNumber ?? 999);
    if (leftGate !== rightGate) return leftGate - rightGate;
    return String(((left.horse as Record<string, unknown> | undefined)?.id ?? "")).localeCompare(
      String(((right.horse as Record<string, unknown> | undefined)?.id ?? ""))
    );
  });
}

function raceHorseById(race: WeeklyRace, horseId: string | null | undefined) {
  if (!horseId) return null;
  return race.horses.find((horse) => String(horse.id ?? "") === String(horseId)) ?? null;
}

function buildSelectionHorseFromPairEntry(
  entry: Record<string, unknown> | null,
  selectionMethod: "rank2" | "light_adjusted" | "stable_next"
): ReviewSelectionHorse | null {
  if (!entry) return null;
  const horse = (entry.horse ?? null) as Record<string, unknown> | null;
  const horseId = normalizeString(horse?.id);
  if (!horseId) return null;
  return {
    horseId,
    horseName: normalizeString(horse?.name),
    rank: normalizeNumber(entry.rank) ?? null,
    score: normalizeNumber(entry.placeScore) ?? normalizeNumber(entry.valueScore),
    winProb: normalizeNumber(entry.winProb),
    realOdds: normalizeNumber(horse?.realOdds),
    placeOdds: normalizeNumber(entry.placeOdds),
    placeProb: normalizeNumber(entry.placeProb),
    placeScore: normalizeNumber(entry.placeScore),
    valueScore: normalizeNumber(entry.valueScore),
    selectionMethod,
    selectionReason: normalizeString(entry.selectionReason),
    overbetLabel: normalizeString(entry.overbetLabel),
    scoreGap: normalizeNumber(entry.scoreGap),
    runnerUpHorseId: normalizeString(entry.runnerUpHorseId),
    runnerUpHorseName: normalizeString(entry.runnerUpHorseName),
    runnerUpPlaceScore: normalizeNumber(entry.runnerUpPlaceScore),
    runnerUpPlaceProb: normalizeNumber(entry.runnerUpPlaceProb),
    settlementStatus: "pending_result",
    tanOutcome: "not_settled",
    fukuOutcome: "not_settled",
    tanPayout: 0,
    fukuPayout: 0,
    tanPayoutSource: "missing",
    fukuPayoutSource: "missing",
  };
}

async function buildSnapshotBundle(params: { race: WeeklyRace; weekOf: string | null }) {
  const { race, weekOf } = params;
  const raceId = extractRaceId(race.raceId ?? race.courseId);
  if (!raceId) return null;

  const course = {
    id: race.courseId,
    name: normalizeString(race.label) ?? race.courseId,
    displayName: normalizeString(race.label) ?? race.courseId,
    venue: normalizeString(race.venue) ?? undefined,
    raceNumber: normalizeNumber(race.raceNumber) ?? undefined,
    distance: normalizeNumber(race.distance) ?? 0,
    surface: race.surface ?? "Turf",
    segments: [],
    straightLength: normalizeNumber(race.straightLength) ?? 360,
    hashtag: `#${normalizeString(race.label)?.replace(/\s+/g, "") ?? raceId}`,
  };
  const condition = createDefaultCondition(race.courseId);
  const horses = race.horses as never[];
  const simulationResults = runMonteCarlo(horses, course, condition, MONTE_CARLO_RUNS);
  const tanpukuSelectionModule = await import("../lib/tanpukuSelection.mjs");
  const tanpukuPair = tanpukuSelectionModule.pickTanpukuPair(
    {
      courseId: race.courseId,
      label: normalizeString(race.label) ?? race.courseId,
      distance: normalizeNumber(race.distance) ?? 0,
      straightLength: normalizeNumber(race.straightLength) ?? 360,
      trackBias: { innerOuter: 0, frontBack: 0 },
      horses,
    },
    false,
    true
  );

  const raceDate = safeRaceDate(race, weekOf);
  const scheduledStart = combineRaceDateAndTime(raceDate, normalizeString(race.scheduledStartTime));
  const snapshot = await buildPredictionSnapshot({
    results: simulationResults,
    horses,
    course,
    condition,
    simulationCount: MONTE_CARLO_RUNS,
    raceId,
    raceDate,
    raceName: normalizeString(race.label),
    venue: normalizeString(race.venue),
    venueKey: normalizeString(race.venueKey),
    raceNumber: normalizeNumber(race.raceNumber),
    scheduledStartTime: scheduledStart,
    snapshotType: "pre_race_final",
    oddsSource: normalizeString(race.oddsSource),
    predictionOrigin: "saved_live",
  });

  const scoredRows = Array.isArray(tanpukuPair?.scored) ? tanpukuPair.scored : [];
  const eligibleScoredRows = createTieBrokenScoredRows(
    scoredRows.filter((entry: Record<string, unknown>) => !isCancelledHorse((entry.horse ?? null) as Record<string, unknown> | null))
  );
  const rankMap = new Map(eligibleScoredRows.map((entry: Record<string, unknown>, index: number) => [String((entry.horse as Record<string, unknown>)?.id ?? ""), index + 1]));
  const honmei = buildSelectionHorseFromPairEntry(
    tanpukuPair?.winPick ? { ...tanpukuPair.winPick, rank: rankMap.get(String(tanpukuPair.winPick.horse.id)) ?? 1 } : null,
    "rank2"
  );
  const fallbackOpponentEntry = tanpukuSelectionModule.pickOpponentEntry(
    scoredRows,
    honmei?.horseId ?? tanpukuPair?.winPick?.horse?.id ?? null
  ).entry;
  const selectedOpponentSource =
    tanpukuPair?.opponentPick &&
    !isCancelledHorse(raceHorseById(race, tanpukuPair.opponentPick.horse.id) as Record<string, unknown> | null)
      ? tanpukuPair.opponentPick
      : fallbackOpponentEntry;
  const opponentBase = selectedOpponentSource
    ? {
        ...(scoredRows.find((entry: Record<string, unknown>) => String((entry.horse as Record<string, unknown>)?.id ?? "") === String(selectedOpponentSource.horse.id ?? selectedOpponentSource.horseId)) ??
          {
            horse: {
              id: selectedOpponentSource.horse?.id ?? selectedOpponentSource.horseId,
              name: selectedOpponentSource.horse?.name ?? selectedOpponentSource.horseName,
              realOdds: raceHorseById(race, selectedOpponentSource.horse?.id ?? selectedOpponentSource.horseId)?.realOdds ?? null,
            },
          }),
        rank: rankMap.get(String(selectedOpponentSource.horse?.id ?? selectedOpponentSource.horseId)) ?? 2,
        placeScore: selectedOpponentSource.placeScore,
        placeProb: selectedOpponentSource.placeProb,
        top3Stability: selectedOpponentSource.top3Stability,
        winProb: selectedOpponentSource.winProb,
        selectionReason: selectedOpponentSource.selectionReason,
        scoreGap:
          honmei?.placeScore !== null &&
          honmei?.placeScore !== undefined &&
          selectedOpponentSource.placeScore !== null &&
          selectedOpponentSource.placeScore !== undefined
            ? Number((honmei.placeScore - Number(selectedOpponentSource.placeScore)).toFixed(3))
            : null,
      }
    : null;
  const opponent = buildSelectionHorseFromPairEntry(opponentBase, "stable_next");
  const widePick = tanpukuPair?.widePick ?? tanpukuPair?.valuePick ?? null;
  const wide = buildSelectionHorseFromPairEntry(
    widePick
      ? {
          ...widePick,
          rank: rankMap.get(String(widePick.horse.id)) ?? null,
        }
      : null,
    "light_adjusted"
  );

  if (opponent?.horseId) {
    snapshot.opponentHorseId = opponent.horseId;
    snapshot.opponentSelectionMethod = "stable_next";
    snapshot.opponentScore = opponent.score ?? null;
    snapshot.opponentRank = opponent.rank ?? null;
    snapshot.pairScoreGap =
      honmei?.score !== null && honmei?.score !== undefined && opponent.score !== null && opponent.score !== undefined
        ? Number((honmei.score - opponent.score).toFixed(3))
        : snapshot.pairScoreGap ?? null;
    snapshot.pairRankGap =
      honmei?.rank !== null && honmei?.rank !== undefined && opponent.rank !== null && opponent.rank !== undefined
        ? opponent.rank - honmei.rank
        : snapshot.pairRankGap ?? null;
  }

  if (wide?.horseId) {
    snapshot.valueHorseId = wide.horseId;
  }

  return { snapshot, honmei, opponent, wide };
}

function hydrateSelectionsFromSnapshot(record: RaceReviewRecord): RaceReviewRecord {
  if (!record.snapshot) return record;
  return {
    ...record,
    honmei: record.honmei ?? buildSelectionHorseFromSnapshot(record.snapshot, record.snapshot.honmeiHorseId),
    opponent: record.opponent ?? buildSelectionHorseFromSnapshot(record.snapshot, record.snapshot.opponentHorseId ?? null),
    wide: record.wide ?? buildSelectionHorseFromSnapshot(record.snapshot, record.snapshot.valueHorseId ?? null),
  };
}

function findHorseFinisher(race: WeeklyRace, horseId: string | null | undefined) {
  if (!horseId) return null;
  const finishers = Array.isArray(race.result?.finishers) ? race.result?.finishers ?? [] : [];
  return finishers.find((finisher) => String(finisher.horseId ?? "") === String(horseId)) ?? null;
}

function payoutForHorseNumber(
  table: { resultNumbers?: unknown[]; payouts?: unknown[] } | undefined,
  horseNumber: number | null | undefined
) {
  if (!hasPayoutTable(table) || !(Number(horseNumber) > 0)) return null;
  const resultNumbers = (table?.resultNumbers ?? []).map((value) => Number(value));
  const payouts = (table?.payouts ?? []).map((value) => Number(value));
  const index = resultNumbers.findIndex((value) => value === Number(horseNumber));
  if (index < 0) return null;
  const payout = payouts[index];
  return Number.isFinite(payout) ? Math.round(payout) : null;
}

function payoutForWidePair(
  table: { resultNumbers?: unknown[]; payouts?: unknown[] } | undefined,
  horseNumbers: [number, number] | null
) {
  if (!table || !Array.isArray(table.resultNumbers) || !Array.isArray(table.payouts) || !horseNumbers) return null;
  const sortedTarget = [...horseNumbers].sort((a, b) => a - b);
  for (let index = 0; index < table.resultNumbers.length; index += 1) {
    const rawPair = table.resultNumbers[index];
    const pair = Array.isArray(rawPair) ? rawPair : [];
    const normalizedPair = pair
      .map((value: unknown) => Number(value))
      .filter((value): value is number => Number.isFinite(value))
      .sort((a: number, b: number) => a - b);
    if (normalizedPair.length === 2 && normalizedPair[0] === sortedTarget[0] && normalizedPair[1] === sortedTarget[1]) {
      const payout = Number(table.payouts[index]);
      return Number.isFinite(payout) ? Math.round(payout) : null;
    }
  }
  return null;
}

function settleSelection(
  race: WeeklyRace,
  selection: ReviewSelectionHorse | null,
  includeTan: boolean
): ReviewSelectionHorse | null {
  if (!selection) return null;
  const winnerHorseId = normalizeString(race.result?.winnerHorseId);
  const top3HorseIds = Array.isArray(race.result?.top3HorseIds) ? race.result?.top3HorseIds.map((value) => String(value)) : [];
  const finisher = findHorseFinisher(race, selection.horseId);
  const horseNumber = normalizeNumber(finisher?.horseNumber);
  const tanPayout = includeTan ? payoutForHorseNumber(race.result?.payouts?.tansho, horseNumber) : 0;
  const fukuPayout = payoutForHorseNumber(race.result?.payouts?.fukusho, horseNumber);
  const tanHit = includeTan && winnerHorseId === selection.horseId;
  const fukuHit = top3HorseIds.includes(selection.horseId);
  const hasTan = includeTan ? hasPayoutTable(race.result?.payouts?.tansho) : true;
  const hasFuku = hasPayoutTable(race.result?.payouts?.fukusho);
  const settlementStatus =
    !winnerHorseId || top3HorseIds.length === 0
      ? "pending_result"
      : !hasTan || !hasFuku || (tanHit && tanPayout === null) || (fukuHit && fukuPayout === null)
        ? "pending_payouts"
        : "settled";

  return {
    ...selection,
    settlementStatus,
    tanOutcome: includeTan ? (tanHit ? (tanPayout !== null ? "hit" : "hit_missing_payout") : "miss") : "not_settled",
    fukuOutcome: fukuHit ? (fukuPayout !== null ? "hit" : "hit_missing_payout") : "miss",
    tanPayout: tanHit && tanPayout !== null ? tanPayout : 0,
    fukuPayout: fukuHit && fukuPayout !== null ? fukuPayout : 0,
    tanPayoutSource: hasTan ? "official" : "missing",
    fukuPayoutSource: hasFuku ? "official" : "missing",
  };
}

function shouldAttemptSnapshot(params: {
  race: WeeklyRace;
  weekOf: string | null;
  now: Date;
  manual: boolean;
}) {
  if (params.manual) return true;
  const raceDate = safeRaceDate(params.race, params.weekOf);
  const scheduledStart = combineRaceDateAndTime(raceDate, normalizeString(params.race.scheduledStartTime));
  if (scheduledStart) {
    const snapshotDueAt = new Date(new Date(scheduledStart).getTime() - 5 * 60_000);
    return params.now.getTime() >= snapshotDueAt.getTime();
  }
  return hasConfirmedResult(params.race);
}

function pickExistingSnapshot(params: {
  raceId: string;
  courseId: string;
  index: SnapshotIndex;
}): SnapshotMatch {
  const byRaceId = params.index.byRaceId.get(params.raceId) ?? null;
  if (byRaceId) {
    return { snapshot: { ...byRaceId, raceId: params.raceId, courseId: params.courseId }, joinKeyMismatch: false };
  }

  const byCourseId = params.index.byCourseId.get(params.courseId) ?? null;
  if (byCourseId) {
    return {
      snapshot: {
        ...byCourseId,
        raceId: params.raceId,
        courseId: params.courseId,
      },
      joinKeyMismatch: extractRaceId(byCourseId.raceId) !== params.raceId,
    };
  }

  return { snapshot: null, joinKeyMismatch: false };
}

async function appendSnapshots(snapshots: PredictionSnapshot[]) {
  if (snapshots.length === 0) return;
  await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
  await fs.appendFile(
    SNAPSHOT_PATH,
    snapshots.map((snapshot) => JSON.stringify(snapshot)).join("\n").concat("\n"),
    "utf8"
  );
}

export async function runReviewPipeline(options: ReviewPipelineOptions): Promise<ReviewPipelineResult> {
  const {
    phase,
    now = jstNow(),
    dayFilter = null,
    raceIdFilter = null,
    includeArchives = false,
    refreshExisting = false,
    forceRetryNow = false,
    debug = process.env.REVIEW_DEBUG === "1",
  } = options;

  if (Number.isNaN(now.getTime())) {
    throw new Error(`invalid pipeline time: ${String(now)}`);
  }

  return withProcessLock(async () => {
    const weekly = await readWeeklyRaces();
    const races = collectRaceScopes(weekly, includeArchives);
    const [recordsByRaceId, snapshots] = await Promise.all([loadReviewRecords(), readSnapshots()]);
    const snapshotIndex = buildSnapshotIndex(snapshots, recordsByRaceId);
    const nextRecords: RaceReviewRecord[] = [];
    const snapshotsToAppend: PredictionSnapshot[] = [];

    let recordsDiscovered = 0;
    let snapshotsCreated = 0;
    let repairsApplied = 0;
    let reviewsSettled = 0;
    let failedCount = 0;

    for (const { race, weekOf } of races) {
      const raceId = extractRaceId(race.raceId ?? race.courseId);
      if (!raceId) continue;
      if (dayFilter && race.day !== dayFilter) continue;
      if (raceIdFilter && raceId !== raceIdFilter) continue;

      const raceDate = safeRaceDate(race, weekOf);
      const scheduledStart = combineRaceDateAndTime(raceDate, normalizeString(race.scheduledStartTime));
      const meta = buildReviewRaceMeta({
        raceId,
        courseId: race.courseId,
        raceDate,
        weekOf,
        day: normalizeString(race.day),
        raceName: normalizeString(race.label),
        venue: normalizeString(race.venue),
        venueKey: normalizeString(race.venueKey),
        raceNumber: normalizeNumber(race.raceNumber),
        scheduledStartTime: scheduledStart,
      });

      let record =
        recordsByRaceId[raceId] ??
        createDiscoveredReviewRecord({
          meta,
          now: toIso(now),
        });
      record = normalizeReviewRecord({
        ...record,
        meta,
        raceId,
        courseId: meta.courseId,
      });

      const wasExisting = Boolean(recordsByRaceId[raceId]);
      if (!wasExisting) {
        recordsDiscovered += 1;
        debugLog(debug, "discovered", { raceId, courseId: meta.courseId });
      }

      const retryDue = forceRetryNow || shouldRetryReviewRecord(record, now);
      let joinKeyMismatch = false;
      let changed = !wasExisting;
      let attemptedRepair = false;

      if (!record.snapshot || refreshExisting) {
        const recovered = pickExistingSnapshot({ raceId, courseId: meta.courseId, index: snapshotIndex });
        if (recovered.snapshot) {
          record = normalizeReviewRecord({
            ...record,
            snapshot: recovered.snapshot,
            snapshotTakenAt: normalizeString(recovered.snapshot.snapshotTakenAt ?? recovered.snapshot.capturedAt),
          });
          joinKeyMismatch = recovered.joinKeyMismatch;
          changed = true;
          repairsApplied += 1;
          debugLog(debug, "recovered-snapshot", {
            raceId,
            snapshotRaceId: recovered.snapshot.raceId,
            snapshotCourseId: recovered.snapshot.courseId,
            joinKeyMismatch,
          });
        }
      }

      {
        const hydrated = hydrateSelectionsFromSnapshot(record);
        if (JSON.stringify(hydrated) !== JSON.stringify(record)) {
          record = hydrated;
          changed = true;
          repairsApplied += 1;
          debugLog(debug, "hydrated-from-snapshot", { raceId });
        } else {
          record = hydrated;
        }
      }

      if ((phase === "snapshot" || phase === "all") && (!record.snapshot || refreshExisting) && retryDue) {
        if (shouldAttemptSnapshot({ race, weekOf, now, manual: forceRetryNow })) {
          const built = await buildSnapshotBundle({ race, weekOf });
          if (built) {
            const rebuilt = normalizeReviewRecord(
              createReviewRecordFromSnapshot({
                meta,
                snapshot: built.snapshot,
                honmei: built.honmei,
                opponent: built.opponent,
                wide: built.wide,
                now: toIso(now),
              })
            );
            record = normalizeReviewRecord({
              ...record,
              ...rebuilt,
              meta,
              createdAt: record.createdAt,
              updatedAt: toIso(now),
            });
            snapshotsToAppend.push(built.snapshot);
            snapshotIndex.byRaceId.set(raceId, built.snapshot);
            snapshotIndex.byCourseId.set(meta.courseId, built.snapshot);
            snapshotsCreated += 1;
            repairsApplied += 1;
            attemptedRepair = true;
            changed = true;
            debugLog(debug, "created-snapshot", { raceId, courseId: meta.courseId });
          }
        }
      }

      {
        const hydrated = hydrateSelectionsFromSnapshot(record);
        if (JSON.stringify(hydrated) !== JSON.stringify(record)) {
          record = hydrated;
          changed = true;
          repairsApplied += 1;
          debugLog(debug, "hydrated-from-snapshot", { raceId });
        } else {
          record = hydrated;
        }
      }

      const resultAvailable = hasConfirmedResult(race);
      const payoutsAvailable = hasAllRequiredPayouts(race);
      if (resultAvailable) {
        record = normalizeReviewRecord({
          ...record,
          actualWinnerHorseId: normalizeString(race.result?.winnerHorseId),
          actualTop3HorseIds: Array.isArray(race.result?.top3HorseIds) ? race.result?.top3HorseIds.map((value) => String(value)).filter(Boolean) : [],
          resultFetchedAt: record.resultFetchedAt ?? toIso(now),
        });
        changed = true;
      }

      if ((phase === "settle" || phase === "all") && retryDue && resultAvailable && record.snapshot) {
        const settledHonmei = settleSelection(race, record.honmei, true);
        const settledOpponent = settleSelection(race, record.opponent, false);
        const settledWide = settleSelection(race, record.wide, false);
        const honmeiFinisher = findHorseFinisher(race, record.honmei?.horseId);
        const opponentFinisher = findHorseFinisher(race, record.opponent?.horseId);
        const top3HorseIds = Array.isArray(race.result?.top3HorseIds) ? race.result?.top3HorseIds.map((value) => String(value)) : [];
        const widePayout = payoutForWidePair(
          race.result?.payouts?.wide,
          honmeiFinisher && opponentFinisher
            ? [Number(honmeiFinisher.horseNumber), Number(opponentFinisher.horseNumber)].sort((a, b) => a - b) as [number, number]
            : null
        );
        const hasWide = hasPayoutTable(race.result?.payouts?.wide);
        const wideOutcome =
          honmeiFinisher && opponentFinisher && top3HorseIds.includes(String(record.honmei?.horseId)) && top3HorseIds.includes(String(record.opponent?.horseId))
            ? widePayout !== null
              ? "hit"
              : "hit_missing_payout"
            : resultAvailable
              ? "miss"
              : "not_settled";

        const settledRecord = normalizeReviewRecord({
          ...record,
          honmei: settledHonmei,
          opponent: settledOpponent,
          wide: settledWide,
          payoutFetchedAt: payoutsAvailable ? toIso(now) : record.payoutFetchedAt,
          pair: {
            ...record.pair,
            honmeiHorseId: record.honmei?.horseId ?? null,
            opponentHorseId: record.opponent?.horseId ?? null,
            sameTop3:
              record.honmei?.horseId && record.opponent?.horseId
                ? top3HorseIds.includes(record.honmei.horseId) && top3HorseIds.includes(record.opponent.horseId)
                : null,
            wideOutcome,
            widePayout: widePayout ?? 0,
            widePayoutSource: hasWide ? "official" : "missing",
          },
        });
        if (JSON.stringify(record) !== JSON.stringify(settledRecord)) {
          record = settledRecord;
          attemptedRepair = true;
          changed = true;
          reviewsSettled += 1;
          debugLog(debug, "settled", {
            raceId,
            honmeiStatus: record.honmei?.settlementStatus ?? null,
            opponentStatus: record.opponent?.settlementStatus ?? null,
            wideOutcome: record.pair.wideOutcome,
          });
        }
      }

      const missingReasons = getMissingReasons({
        record,
        resultAvailable,
        payoutsAvailable,
        joinKeyMismatch,
      });
      const isComplete = isReviewComplete({
        record,
        resultAvailable,
        payoutsAvailable,
        joinKeyMismatch,
      });

      if (isComplete) {
        record = normalizeReviewRecord({
          ...record,
          status: "review_ready",
          reviewReady: true,
          missingReasons: [],
          nextRetryAt: null,
          lastError: null,
          updatedAt: toIso(now),
          lastTriedAt: toIso(now),
          lastRetryAt: attemptedRepair || forceRetryNow ? toIso(now) : record.lastRetryAt,
          resultFetchedAt: resultAvailable ? record.resultFetchedAt ?? toIso(now) : record.resultFetchedAt,
          payoutFetchedAt: payoutsAvailable ? record.payoutFetchedAt ?? toIso(now) : record.payoutFetchedAt,
        });
      } else {
        const nextRetryCount =
          attemptedRepair &&
          missingReasons.some((reason) => reason !== "UPSTREAM_NOT_READY" && reason !== "UPSTREAM_PAYOUT_NOT_READY")
            ? record.retryCount + 1
            : record.retryCount;
        const nextStatus = deriveIncompleteStatus({
          record: { ...record, retryCount: nextRetryCount },
          missingReasons,
        });
        record = normalizeReviewRecord({
          ...record,
          status: nextStatus,
          reviewReady: false,
          retryCount: nextRetryCount,
          missingReasons,
          lastTriedAt: toIso(now),
          lastRetryAt: attemptedRepair || forceRetryNow ? toIso(now) : record.lastRetryAt,
          nextRetryAt: nextStatus === "review_failed" ? null : getNextRetryAt(now, nextRetryCount),
          lastError: nextStatus === "review_failed" ? missingReasons.join(", ") : null,
          updatedAt: toIso(now),
        });
        if (nextStatus === "review_failed") {
          failedCount += 1;
          debugLog(debug, "failed", { raceId, retryCount: nextRetryCount, missingReasons });
        } else {
          debugLog(debug, "incomplete", {
            raceId,
            status: nextStatus,
            retryCount: nextRetryCount,
            missingReasons,
            nextRetryAt: record.nextRetryAt,
          });
        }
      }

      if (changed || forceRetryNow || refreshExisting) {
        nextRecords.push(record);
      }
    }

    await upsertManyReviewRecords(nextRecords);
    await appendSnapshots(snapshotsToAppend);

    return {
      ok: true,
      phase,
      includeArchives,
      refreshExisting,
      forceRetryNow,
      targetRaceCount: races.length,
      recordsDiscovered,
      snapshotsCreated,
      repairsApplied,
      reviewsSettled,
      failedCount,
      now: toIso(now),
      dayFilter,
      raceIdFilter,
    };
  });
}
