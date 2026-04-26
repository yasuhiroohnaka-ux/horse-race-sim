import fs from "node:fs/promises";
import path from "node:path";
import { buildBettingExpectationView, type BettingPickEntry } from "@/lib/bettingExpectation";
import type {
  ExpectationGrade,
  PredictionOrigin,
  PredictionSnapshot,
  PredictionSnapshotExpectation,
  PredictionSnapshotRow,
  RaceReviewRecord,
  ReviewRecordStore,
  ReviewSelectionHorse,
} from "@/lib/types";
import type { RaceAnalysisRow } from "@/lib/raceAnalysis";

const ROOT = process.cwd();
const REVIEW_RECORDS_PATH = path.join(ROOT, "data", "review-records.json");
const SNAPSHOTS_PATH = path.join(ROOT, "data", "prediction-snapshots.jsonl");
const SUPPORTED_SCORING_VERSION = "tanpuku-place-v2.3";

type FailureReason =
  | "no_snapshot"
  | "no_ranked_rows"
  | "no_tanpuku_pick"
  | "missing_scores"
  | "unsupported_version";

type BackfillResult =
  | { ok: true; expectation: PredictionSnapshotExpectation; originOverride: PredictionOrigin | null }
  | { ok: false; reason: FailureReason };

type Summary = {
  write: boolean;
  attemptedAt: string;
  records: {
    targetCount: number;
    successCount: number;
    failureCount: number;
    skippedExistingCount: number;
    failureReasons: Record<FailureReason, number>;
    gradeDistribution: Record<ExpectationGrade, number>;
    originAdjustedToBackfill: number;
  };
  snapshots: {
    targetCount: number;
    successCount: number;
    failureCount: number;
    skippedExistingCount: number;
    parseFailureCount: number;
    failureReasons: Record<FailureReason, number>;
    gradeDistribution: Record<ExpectationGrade, number>;
    originAdjustedToBackfill: number;
  };
  backupDir: string | null;
};

type ReviewRecordWithBackfill = RaceReviewRecord & {
  expectationBackfill?: {
    status: "success" | "failed";
    attemptedAt: string;
    source: "review-records" | "prediction-snapshots";
    reason?: FailureReason;
  };
};

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`) || process.argv.includes(`--${name}=true`);
}

function createEmptyReasonCounts(): Record<FailureReason, number> {
  return {
    no_snapshot: 0,
    no_ranked_rows: 0,
    no_tanpuku_pick: 0,
    missing_scores: 0,
    unsupported_version: 0,
  };
}

function createEmptyGradeCounts(): Record<ExpectationGrade, number> {
  return { S: 0, A: 0, B: 0, C: 0 };
}

function increment<T extends string>(target: Record<T, number>, key: T) {
  target[key] = (target[key] ?? 0) + 1;
}

function normalizeRaceId(value: unknown) {
  const normalized = String(value ?? "").trim();
  const match = normalized.match(/(\d{12})$/);
  return match?.[1] ?? normalized;
}

function finite(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function hasExpectation(value: unknown): value is PredictionSnapshotExpectation {
  if (!value || typeof value !== "object") return false;
  const expectation = value as Partial<PredictionSnapshotExpectation>;
  return Boolean(expectation.simulationLeader?.grade && expectation.tanpukuHonmei?.grade);
}

function hasRequiredHonmeiScores(honmei: ReviewSelectionHorse) {
  return (
    finite(honmei.placeScore) !== null &&
    finite(honmei.placeProb) !== null &&
    finite(honmei.winProb) !== null &&
    finite(honmei.scoreGap) !== null &&
    finite(honmei.realOdds) !== null
  );
}

function toRaceAnalysisRows(snapshot: PredictionSnapshot): RaceAnalysisRow[] {
  return [...snapshot.rankedRows]
    .sort((left, right) => left.rank - right.rank)
    .map((row, index) => ({
      horseId: String(row.horseId),
      name: row.horseName,
      gateNumber: row.gateNumber,
      jockey: row.jockey,
      abilityScore: finite(row.score) ?? 0,
      displayAbilityScore: finite(row.score) ?? 0,
      simWinRate: finite(row.winProb) ?? 0,
      bestTime: 0,
      fairOdds: finite(row.fairOdds),
      officialOdds: finite(row.realOdds),
      officialImplied: finite(row.realOdds) && finite(row.realOdds)! > 0 ? 100 / finite(row.realOdds)! : 0,
      officialRank: index + 1,
      expertOdds: null,
      expertImplied: 0,
      expertRank: index + 1,
      buzzShare: 0,
      favoriteCount: 0,
      officialGap: 0,
      expertGap: 0,
      marketExpertGap: 0,
      signalLabel: snapshot.signalReasons?.[row.horseId]?.signalLabel ?? "",
      signalDetailLabel: snapshot.signalReasons?.[row.horseId]?.signalDetailLabel ?? null,
      signalReason: snapshot.signalReasons?.[row.horseId]?.signalReason ?? null,
      horse: {
        id: String(row.horseId),
        name: row.horseName,
        speed: 0,
        stamina: 0,
        power: 0,
        guts: 0,
        runningStyle: row.runningStyle,
        gateNumber: row.gateNumber,
        jockey: row.jockey,
        predictionCount: 0,
        realOdds: finite(row.realOdds) ?? undefined,
      },
    }));
}

function toPickEntryFromHonmei(honmei: ReviewSelectionHorse): BettingPickEntry {
  return {
    horse: {
      id: honmei.horseId,
      name: honmei.horseName,
    },
    odds: finite(honmei.realOdds),
    placeOdds: finite(honmei.placeOdds),
    winProb: finite(honmei.winProb),
    placeProb: finite(honmei.placeProb),
    placeScore: finite(honmei.placeScore),
    valueScore: finite(honmei.valueScore),
    scoreGap: finite(honmei.scoreGap),
    overbetLabel: honmei.overbetLabel,
    classificationHint: honmei.classificationHint,
  };
}

function toPickEntryFromSnapshotRow(row: PredictionSnapshotRow | null): BettingPickEntry | null {
  if (!row) return null;
  return {
    horse: {
      id: row.horseId,
      name: row.horseName,
    },
    odds: finite(row.realOdds),
    winProb: (finite(row.winProb) ?? 0) / 100,
  };
}

function isSnapshotAfterRace(snapshot: PredictionSnapshot, record?: RaceReviewRecord | null) {
  const snapshotTime = Date.parse(String(snapshot.snapshotTakenAt ?? snapshot.capturedAt ?? ""));
  const raceDate = record?.meta.raceDate ?? snapshot.raceDate ?? null;
  if (!Number.isFinite(snapshotTime) || !raceDate) return false;

  const scheduled = record?.meta.scheduledStartTime ?? snapshot.scheduledStartTime ?? null;
  if (scheduled && /^\d{4}-\d{2}-\d{2}T/.test(scheduled)) {
    const raceTime = Date.parse(scheduled);
    return Number.isFinite(raceTime) ? snapshotTime > raceTime : false;
  }
  if (scheduled && /^\d{1,2}:\d{2}$/.test(scheduled)) {
    const raceTime = Date.parse(`${raceDate}T${scheduled}:00+09:00`);
    return Number.isFinite(raceTime) ? snapshotTime > raceTime : false;
  }

  const snapshotDate = new Date(snapshotTime).toISOString().slice(0, 10);
  return snapshotDate > raceDate;
}

function buildExpectation(params: {
  snapshot: PredictionSnapshot | null | undefined;
  honmei: ReviewSelectionHorse | null | undefined;
  record?: RaceReviewRecord | null;
}): BackfillResult {
  const { snapshot, honmei, record = null } = params;
  if (!snapshot) return { ok: false, reason: "no_snapshot" };
  if (snapshot.scoringVersion !== SUPPORTED_SCORING_VERSION) return { ok: false, reason: "unsupported_version" };
  if (!Array.isArray(snapshot.rankedRows) || snapshot.rankedRows.length === 0) return { ok: false, reason: "no_ranked_rows" };
  if (!honmei?.horseId) return { ok: false, reason: "no_tanpuku_pick" };
  if (!hasRequiredHonmeiScores(honmei)) return { ok: false, reason: "missing_scores" };

  const rows = toRaceAnalysisRows(snapshot);
  const sortedSnapshotRows = [...snapshot.rankedRows].sort((left, right) => left.rank - right.rank);
  const simulationLeaderRow = sortedSnapshotRows[0] ?? null;
  const simulationLeaderEntry =
    simulationLeaderRow && String(simulationLeaderRow.horseId) === String(honmei.horseId)
      ? toPickEntryFromHonmei(honmei)
      : toPickEntryFromSnapshotRow(simulationLeaderRow);

  const expectationView = buildBettingExpectationView({
    rows,
    simulationLeaderEntry,
    tanpukuHonmeiEntry: toPickEntryFromHonmei(honmei),
    course: { raceNumber: record?.meta.raceNumber ?? snapshot.raceNumber ?? undefined },
  });

  const expectation: PredictionSnapshotExpectation = {
    simulationLeader: {
      horseId: simulationLeaderRow?.horseId ?? null,
      grade: expectationView.simulationLeader.bettingGrade,
      reasons: expectationView.simulationLeader.reasons,
    },
    tanpukuHonmei: {
      horseId: honmei.horseId,
      grade: expectationView.tanpukuHonmei.expectationGrade,
      reasons: expectationView.tanpukuHonmei.reasons,
    },
    agreement: {
      sameHorse: expectationView.agreement.sameHorse,
      summary: expectationView.agreement.summary,
    },
  };

  return {
    ok: true,
    expectation,
    originOverride: isSnapshotAfterRace(snapshot, record) ? "backfill" : null,
  };
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

async function readSnapshotLines() {
  const raw = await fs.readFile(SNAPSHOTS_PATH, "utf8").catch((error) => {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return "";
    throw error;
  });
  return raw.split(/\r?\n/).filter(Boolean);
}

async function backupDataFiles(attemptedAt: string) {
  const stamp = attemptedAt.replace(/[:.]/g, "-");
  const backupDir = path.join(process.env.TEMP ?? ROOT, "horse-race-sim-backups", `expectation-backfill-${stamp}`);
  await fs.mkdir(backupDir, { recursive: true });
  await fs.copyFile(REVIEW_RECORDS_PATH, path.join(backupDir, "review-records.json"));
  await fs.copyFile(SNAPSHOTS_PATH, path.join(backupDir, "prediction-snapshots.jsonl")).catch((error) => {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code !== "ENOENT") throw error;
  });
  return backupDir;
}

async function main() {
  const write = hasFlag("write");
  const attemptedAt = new Date().toISOString();
  const store = await readJson<ReviewRecordStore>(REVIEW_RECORDS_PATH);
  const snapshotLines = await readSnapshotLines();
  const snapshotsByRaceId = new Map<string, PredictionSnapshot>();
  const parsedSnapshotLines = snapshotLines.map((line) => {
    try {
      const snapshot = JSON.parse(line) as PredictionSnapshot;
      const raceId = normalizeRaceId(snapshot.raceId);
      if (raceId && !snapshotsByRaceId.has(raceId)) snapshotsByRaceId.set(raceId, snapshot);
      return { line, snapshot, parseError: false };
    } catch {
      return { line, snapshot: null, parseError: true };
    }
  });

  const summary: Summary = {
    write,
    attemptedAt,
    records: {
      targetCount: 0,
      successCount: 0,
      failureCount: 0,
      skippedExistingCount: 0,
      failureReasons: createEmptyReasonCounts(),
      gradeDistribution: createEmptyGradeCounts(),
      originAdjustedToBackfill: 0,
    },
    snapshots: {
      targetCount: 0,
      successCount: 0,
      failureCount: 0,
      skippedExistingCount: 0,
      parseFailureCount: 0,
      failureReasons: createEmptyReasonCounts(),
      gradeDistribution: createEmptyGradeCounts(),
      originAdjustedToBackfill: 0,
    },
    backupDir: null,
  };

  const records = store.records as Record<string, ReviewRecordWithBackfill>;
  for (const record of Object.values(records)) {
    if (hasExpectation(record.expectation)) {
      summary.records.skippedExistingCount += 1;
      continue;
    }
    summary.records.targetCount += 1;
    const raceId = normalizeRaceId(record.raceId);
    const snapshot = record.snapshot ?? snapshotsByRaceId.get(raceId) ?? null;
    const result = buildExpectation({ snapshot, honmei: record.honmei, record });
    if (!result.ok) {
      summary.records.failureCount += 1;
      increment(summary.records.failureReasons, result.reason);
      record.expectationBackfill = {
        status: "failed",
        attemptedAt,
        source: "review-records",
        reason: result.reason,
      };
      continue;
    }

    summary.records.successCount += 1;
    increment(summary.records.gradeDistribution, result.expectation.simulationLeader.grade ?? "C");
    record.expectation = result.expectation;
    record.expectationBackfill = {
      status: "success",
      attemptedAt,
      source: "review-records",
    };
    if (record.snapshot) {
      record.snapshot.expectation = result.expectation;
      if (result.originOverride && record.snapshot.predictionOrigin !== result.originOverride) {
        record.snapshot.predictionOrigin = result.originOverride;
        summary.records.originAdjustedToBackfill += 1;
      }
    }
  }

  const nextSnapshotLines = parsedSnapshotLines.map(({ line, snapshot, parseError }) => {
    if (parseError || !snapshot) {
      summary.snapshots.parseFailureCount += 1;
      return line;
    }
    if (hasExpectation(snapshot.expectation)) {
      summary.snapshots.skippedExistingCount += 1;
      return JSON.stringify(snapshot);
    }

    summary.snapshots.targetCount += 1;
    const raceId = normalizeRaceId(snapshot.raceId);
    const record = records[raceId] ?? null;
    const result = buildExpectation({ snapshot, honmei: record?.honmei, record });
    if (!result.ok) {
      summary.snapshots.failureCount += 1;
      increment(summary.snapshots.failureReasons, result.reason);
      return JSON.stringify({
        ...snapshot,
        expectationBackfill: {
          status: "failed",
          attemptedAt,
          source: "prediction-snapshots",
          reason: result.reason,
        },
      });
    }

    summary.snapshots.successCount += 1;
    increment(summary.snapshots.gradeDistribution, result.expectation.simulationLeader.grade ?? "C");
    const nextSnapshot: PredictionSnapshot & { expectationBackfill?: ReviewRecordWithBackfill["expectationBackfill"] } = {
      ...snapshot,
      expectation: result.expectation,
      expectationBackfill: {
        status: "success",
        attemptedAt,
        source: "prediction-snapshots",
      },
    };
    if (result.originOverride && nextSnapshot.predictionOrigin !== result.originOverride) {
      nextSnapshot.predictionOrigin = result.originOverride;
      summary.snapshots.originAdjustedToBackfill += 1;
    }
    return JSON.stringify(nextSnapshot);
  });

  if (write) {
    summary.backupDir = await backupDataFiles(attemptedAt);
    await fs.writeFile(REVIEW_RECORDS_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    await fs.writeFile(SNAPSHOTS_PATH, `${nextSnapshotLines.join("\n")}\n`, "utf8");
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
