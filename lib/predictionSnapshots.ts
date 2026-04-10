import { buildRaceAnalysisRows, getScenarioProfile, round1 } from "./raceAnalysis";
import {
  Course,
  Horse,
  PredictionOrigin,
  PredictionSnapshot,
  PredictionSnapshotContributor,
  PredictionSnapshotContributorKey,
  RaceCondition,
} from "./types";

const CONTRIBUTOR_LABELS: Record<PredictionSnapshotContributorKey, string> = {
  abilityScore: "能力指数",
  courseFit: "コース適性",
  distanceFit: "距離適性",
  groundFit: "馬場適性",
  paceFit: "展開適性",
  marketEdge: "市場差",
};

export const PREDICTION_SNAPSHOT_MODEL_FAMILY = "manual-sim-montecarlo";
export const PREDICTION_SNAPSHOT_MODEL_VERSION = "sim-page-v1";
export const DEFAULT_PREDICTION_ORIGIN: PredictionOrigin = "saved_manual";
export const DEFAULT_SCORING_VERSION = "tanpuku-place-v2.3";

const SCORING_CONFIG_SOURCE = {
  engine: "runMonteCarlo",
  rankingSource: "buildRaceAnalysisRows",
  scoreField: "abilityScore",
  winProbabilityField: "simWinRate",
  edgeField: "simWinRate - officialImplied",
  honmeiRule: "rows[0]",
  opponentRule: "tanpukuPair.opponentPick(placeProb -> top3Stability -> placeScore -> simWinProb)",
  watchRule: "official top4 sorted by officialImplied - simWinRate",
  contributors: [
    "abilityScore",
    "courseFit",
    "distanceFit",
    "groundFit",
    "paceFit",
    "marketEdge",
  ],
  topContributors: 3,
} as const;

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalize(entryValue)}`);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function createSnapshotId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function extractRaceId(courseId: string): string {
  const match = String(courseId ?? "").match(/(\d{12})$/);
  return match?.[1] ?? String(courseId ?? "");
}

export function normalizePredictionOrigin(value: unknown, fallback: PredictionOrigin = DEFAULT_PREDICTION_ORIGIN): PredictionOrigin {
  return value === "saved_live" || value === "saved_manual" || value === "backfill" ? value : fallback;
}

export function normalizeScoringVersion(value: unknown, fallback = DEFAULT_SCORING_VERSION): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function resolveOddsSource(horses: Horse[], explicitOddsSource?: string | null): string | null {
  if (explicitOddsSource) return explicitOddsSource;
  const candidate = horses.find((horse) => String(horse.oddsSource ?? "").trim())?.oddsSource ?? "";
  return candidate ? String(candidate) : null;
}

export async function getScoringConfigHash(): Promise<string> {
  return sha256Hex(canonicalize(SCORING_CONFIG_SOURCE));
}

export function pickMajorContributors(params: {
  abilityScore: number;
  courseFit: number;
  distanceFit: number;
  groundFit: number;
  paceFit: number;
  marketEdge: number;
}): PredictionSnapshotContributor[] {
  const candidates: Array<PredictionSnapshotContributor & { sortValue: number }> = [
    {
      key: "abilityScore",
      label: CONTRIBUTOR_LABELS.abilityScore,
      value: round1(params.abilityScore),
      sortValue: params.abilityScore,
    },
    {
      key: "courseFit",
      label: CONTRIBUTOR_LABELS.courseFit,
      value: round1(params.courseFit),
      sortValue: params.courseFit - 72,
    },
    {
      key: "distanceFit",
      label: CONTRIBUTOR_LABELS.distanceFit,
      value: round1(params.distanceFit),
      sortValue: params.distanceFit - 72,
    },
    {
      key: "groundFit",
      label: CONTRIBUTOR_LABELS.groundFit,
      value: round1(params.groundFit),
      sortValue: params.groundFit - 72,
    },
    {
      key: "paceFit",
      label: CONTRIBUTOR_LABELS.paceFit,
      value: round1(params.paceFit),
      sortValue: params.paceFit - 72,
    },
    {
      key: "marketEdge",
      label: CONTRIBUTOR_LABELS.marketEdge,
      value: round1(params.marketEdge),
      sortValue: params.marketEdge,
    },
  ];

  return candidates
    .sort((left, right) => right.sortValue - left.sortValue)
    .slice(0, 3)
    .map(({ sortValue: _sortValue, ...contributor }) => contributor);
}

export async function buildPredictionSnapshot(params: {
  results: { horseId: string; winCount: number; bestTime: number }[];
  horses: Horse[];
  course: Course;
  condition: RaceCondition;
  simulationCount: number;
  raceId?: string | null;
  raceDate?: string | null;
  raceName?: string | null;
  venue?: string | null;
  venueKey?: string | null;
  raceNumber?: number | null;
  scheduledStartTime?: string | null;
  snapshotType?: "manual_snapshot" | "pre_race_final";
  oddsFetchedAt?: string | null;
  oddsSource?: string | null;
  predictionOrigin?: PredictionOrigin;
  scoringVersion?: string | null;
  opponentOverride?: {
    horseId: string;
    selectionMethod?: "rank2" | "light_adjusted" | "legacy_value" | "stable_next";
    score?: number | null;
    rank?: number | null;
    pairScoreGap?: number | null;
    pairRankGap?: number | null;
  } | null;
  valueHorseId?: string | null;
}): Promise<PredictionSnapshot> {
  const {
    results,
    horses,
    course,
    condition,
    simulationCount,
    raceId = null,
    raceDate = null,
    raceName = null,
    venue = null,
    venueKey = null,
    raceNumber = null,
    scheduledStartTime = null,
    snapshotType = "manual_snapshot",
    oddsFetchedAt = null,
    oddsSource = null,
    predictionOrigin = DEFAULT_PREDICTION_ORIGIN,
    scoringVersion = DEFAULT_SCORING_VERSION,
    opponentOverride = null,
    valueHorseId = null,
  } = params;

  const rows = buildRaceAnalysisRows(results, horses, course, condition);
  const scoringConfigHash = await getScoringConfigHash();
  const honmeiHorseId = rows[0]?.horseId ?? null;
  const defaultOpponentRow = rows.find((row) => row.horseId !== honmeiHorseId) ?? null;
  const opponentHorseId = opponentOverride?.horseId ?? defaultOpponentRow?.horseId ?? null;
  const opponentRow = rows.find((row) => row.horseId === opponentHorseId) ?? defaultOpponentRow ?? null;
  const watchHorseId =
    [...rows]
      .filter((row) => row.officialRank <= Math.min(4, rows.length))
      .sort((left, right) => (right.officialImplied - right.simWinRate) - (left.officialImplied - left.simWinRate))[0]
      ?.horseId ?? null;
  const honmeiRow = rows.find((row) => row.horseId === honmeiHorseId) ?? null;

  const signalReasons = Object.fromEntries(
    rows.map((row) => [
      row.horseId,
      {
        signalLabel: row.signalLabel,
        signalDetailLabel: row.signalDetailLabel,
        signalReason: row.signalReason,
      },
    ])
  );

  const rankedRows = rows.map((row, index) => {
    const horse = row.horse;
    const profile = getScenarioProfile(horse, course, condition);
    return {
      horseId: row.horseId,
      horseName: row.name,
      rank: index + 1,
      score: row.abilityScore,
      winProb: row.simWinRate,
      fairOdds: row.fairOdds,
      realOdds: row.officialOdds,
      edge: round1(row.simWinRate - row.officialImplied),
      runningStyle: horse.runningStyle,
      gateNumber: row.gateNumber,
      jockey: row.jockey,
      majorContributors: pickMajorContributors({
        abilityScore: row.abilityScore,
        courseFit: profile.traitScores.courseFit,
        distanceFit: profile.traitScores.distanceFit,
        groundFit: profile.traitScores.groundFit,
        paceFit: profile.traitScores.paceFit,
        marketEdge: row.simWinRate - row.officialImplied,
      }),
    };
  });

  return {
    snapshotId: createSnapshotId(),
    raceId: raceId ? String(raceId) : extractRaceId(course.id),
    courseId: course.id,
    capturedAt: new Date().toISOString(),
    snapshotTakenAt: new Date().toISOString(),
    snapshotType,
    raceDate,
    raceName: raceName ?? course.displayName ?? course.name,
    venue: venue ?? course.venue ?? null,
    venueKey,
    raceNumber: Number.isFinite(Number(raceNumber)) ? Number(raceNumber) : course.raceNumber ?? null,
    scheduledStartTime,
    predictionOrigin,
    scoringVersion: normalizeScoringVersion(scoringVersion),
    modelFamily: PREDICTION_SNAPSHOT_MODEL_FAMILY,
    modelVersion: PREDICTION_SNAPSHOT_MODEL_VERSION,
    scoringConfigHash,
    simulationCount,
    condition,
    rankedRows,
    honmeiHorseId,
    opponentHorseId,
    opponentSelectionMethod: opponentHorseId ? opponentOverride?.selectionMethod ?? "rank2" : undefined,
    opponentScore:
      opponentHorseId && opponentOverride?.score !== undefined && opponentOverride?.score !== null
        ? round1(opponentOverride.score)
        : opponentRow
          ? round1(opponentRow.abilityScore)
          : null,
    opponentRank:
      opponentHorseId && opponentOverride?.rank !== undefined && opponentOverride?.rank !== null
        ? opponentOverride.rank
        : opponentRow
          ? rows.findIndex((row) => row.horseId === opponentRow.horseId) + 1
          : null,
    honmeiScore: honmeiRow ? round1(honmeiRow.abilityScore) : null,
    honmeiRank: honmeiRow ? rows.findIndex((row) => row.horseId === honmeiRow.horseId) + 1 : null,
    pairScoreGap:
      opponentOverride?.pairScoreGap !== undefined && opponentOverride?.pairScoreGap !== null
        ? round1(opponentOverride.pairScoreGap)
        : honmeiRow && opponentRow
          ? round1(honmeiRow.abilityScore - opponentRow.abilityScore)
          : null,
    pairRankGap:
      opponentOverride?.pairRankGap !== undefined && opponentOverride?.pairRankGap !== null
        ? opponentOverride.pairRankGap
        : honmeiRow && opponentRow
          ? 1
          : null,
    valueHorseId,
    watchHorseId,
    signalReasons,
    marketMeta: {
      fieldSize: horses.length,
      oddsFetchedAt,
      oddsSource: resolveOddsSource(horses, oddsSource),
    },
  };
}
