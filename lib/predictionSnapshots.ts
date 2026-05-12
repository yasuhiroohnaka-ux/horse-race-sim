import { buildRaceAnalysisRows, getScenarioProfile, round1 } from "./raceAnalysis";
import {
  buildRecommendedBetDecision,
  buildUnknownRecommendedBetDecision,
} from "@/lib/recommendedBetAction";
import {
  Course,
  Horse,
  PredictionOrigin,
  PredictionSnapshot,
  PredictionSnapshotContributor,
  PredictionSnapshotContributorKey,
  PredictionSnapshotSelectionLog,
  PredictionSnapshotSelectionLogEntry,
  PredictionSnapshotSourceStatus,
  PredictionSnapshotExpectation,
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

function normalizeString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeNumber(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizeCapturedAt(value: unknown): string {
  const normalized = normalizeString(value);
  const parsed = normalized ? new Date(normalized) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}

function parseTime(value: string | null | undefined): number | null {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function inferPredictionSnapshotSourceStatus(params: {
  predictionOrigin: PredictionOrigin;
  snapshotType?: "manual_snapshot" | "pre_race_final";
  capturedAt: string;
  scheduledStartTime?: string | null;
}): PredictionSnapshotSourceStatus {
  if (params.predictionOrigin === "backfill") return "retrospective";
  if (params.predictionOrigin === "saved_manual" || params.snapshotType === "manual_snapshot") return "manual_snapshot";

  const capturedTime = parseTime(params.capturedAt);
  const scheduledTime = parseTime(params.scheduledStartTime);
  if (capturedTime !== null && scheduledTime !== null) {
    return capturedTime < scheduledTime ? "live_pre_race" : "retrospective";
  }

  return "unknown";
}

function derivePreviousRaceSource(horse: Horse & Record<string, unknown>): string | null {
  const explicitSource = normalizeString(horse.previousRaceSource);
  if (explicitSource) return explicitSource;
  if (horse.runnerPreviousRaceOverrideApplied === true) return "manual-override";
  if (normalizeString(horse.previousRaceName) || normalizeString(horse.previousRaceDisplayName)) return "generated";
  return null;
}

function buildSelectionLogEntryFromRow(params: {
  role: PredictionSnapshotSelectionLogEntry["role"];
  row: ReturnType<typeof buildRaceAnalysisRows>[number] | null;
  rank: number | null;
  selectionMethod: PredictionSnapshotSelectionLogEntry["selectionMethod"];
  selectionReason?: string | null;
}): PredictionSnapshotSelectionLogEntry | null {
  const { row } = params;
  if (!row) return null;
  return {
    role: params.role,
    horseId: row.horseId,
    horseName: row.name,
    rank: params.rank,
    selectionMethod: params.selectionMethod,
    selectionReason: normalizeString(params.selectionReason),
    recommendedBetAction: "unknown",
    recommendedBetDecision: buildUnknownRecommendedBetDecision(["missing_classification_hint"], ["selection_log_available"]),
    score: normalizeNumber(row.abilityScore),
    winProb: normalizeNumber(row.simWinRate),
    realOdds: normalizeNumber(row.officialOdds),
    placeOdds: null,
    placeProb: null,
    placeScore: null,
    valueScore: null,
    top3Stability: null,
    overbetLabel: null,
    scoreGap: null,
    runnerUpHorseId: null,
    runnerUpHorseName: null,
    runnerUpPlaceScore: null,
    runnerUpPlaceProb: null,
  };
}

function buildSelectionLogEntryFromPair(params: {
  role: PredictionSnapshotSelectionLogEntry["role"];
  entry: Record<string, unknown> | null;
  rank: number | null;
  selectionMethod: PredictionSnapshotSelectionLogEntry["selectionMethod"];
  runnerUp?: Record<string, unknown> | null;
  sourceStatus: PredictionSnapshotSourceStatus;
  livePreRaceEligible: boolean;
  fieldSize: number | null;
  oddsSource: string | null;
  simulationLeaderHorseId?: string | null;
}): PredictionSnapshotSelectionLogEntry | null {
  const horse = (params.entry?.horse ?? null) as Record<string, unknown> | null;
  const horseId = normalizeString(horse?.id ?? params.entry?.horseId);
  if (!horseId) return null;
  const runnerUp = params.runnerUp ?? null;
  const classificationHint =
    params.entry?.classificationHint && typeof params.entry.classificationHint === "object"
      ? (params.entry.classificationHint as PredictionSnapshotSelectionLogEntry["classificationHint"])
      : undefined;
  const recommendedBetDecision = buildRecommendedBetDecision({
    sourceStatus: params.sourceStatus,
    livePreRaceEligible: params.livePreRaceEligible,
    classificationHint,
    explicitAction: params.entry?.recommendedBetAction,
    winProb: normalizeNumber(params.entry?.winProb),
    tanRoi: normalizeNumber(params.entry?.tanRoi),
    scoreGap: normalizeNumber(params.entry?.scoreGap),
    placeProb: normalizeNumber(params.entry?.placeProb),
    top3Stability: normalizeNumber(params.entry?.top3Stability),
    valueScore: normalizeNumber(params.entry?.valueScore),
    fieldSize: params.fieldSize,
    engineAgreement:
      params.role === "honmei" && params.simulationLeaderHorseId
        ? params.simulationLeaderHorseId === horseId
        : null,
    overbetLabel: normalizeString(params.entry?.overbetLabel),
    oddsSource: normalizeString(horse?.oddsSource ?? params.entry?.oddsSource ?? params.oddsSource),
    runningStyleSource: normalizeString(horse?.runningStyleSource),
    previousRaceSource: normalizeString(horse?.previousRaceSource),
    hasSelectionLog: true,
  });
  return {
    role: params.role,
    horseId,
    horseName: normalizeString(horse?.name ?? params.entry?.horseName),
    rank: params.rank,
    selectionMethod: params.selectionMethod,
    selectionReason: normalizeString(params.entry?.selectionReason),
    classificationHint,
    recommendedBetAction: recommendedBetDecision.action,
    recommendedBetDecision,
    score: normalizeNumber(params.entry?.score),
    winProb: normalizeNumber(params.entry?.winProb),
    realOdds: normalizeNumber(horse?.realOdds ?? params.entry?.realOdds),
    placeOdds: normalizeNumber(params.entry?.placeOdds),
    placeProb: normalizeNumber(params.entry?.placeProb),
    placeScore: normalizeNumber(params.entry?.placeScore),
    valueScore: normalizeNumber(params.entry?.valueScore),
    top3Stability: normalizeNumber(params.entry?.top3Stability),
    overbetLabel: normalizeString(params.entry?.overbetLabel),
    scoreGap: normalizeNumber(params.entry?.scoreGap),
    runnerUpHorseId: normalizeString(params.entry?.runnerUpHorseId ?? runnerUp?.horseId),
    runnerUpHorseName: normalizeString(params.entry?.runnerUpHorseName ?? runnerUp?.horseName),
    runnerUpPlaceScore: normalizeNumber(params.entry?.runnerUpPlaceScore ?? runnerUp?.placeScore),
    runnerUpPlaceProb: normalizeNumber(params.entry?.runnerUpPlaceProb ?? runnerUp?.placeProb),
  };
}

function createSelectionLog(params: {
  capturedAt: string;
  scoringVersion: string;
  rows: ReturnType<typeof buildRaceAnalysisRows>;
  honmeiHorseId: string | null;
  watchHorseId: string | null;
  tanpukuPair?: unknown;
  opponentOverride?: {
    horseId: string;
    selectionMethod?: "rank2" | "light_adjusted" | "legacy_value" | "stable_next";
  } | null;
  valueHorseId?: string | null;
  sourceStatus: PredictionSnapshotSourceStatus;
  livePreRaceEligible: boolean;
  fieldSize: number | null;
  oddsSource: string | null;
}): PredictionSnapshotSelectionLog {
  const pair =
    params.tanpukuPair && typeof params.tanpukuPair === "object"
      ? (params.tanpukuPair as Record<string, unknown>)
      : {};
  const rankByHorseId = new Map(params.rows.map((row, index) => [row.horseId, index + 1]));
  const rowByHorseId = new Map(params.rows.map((row) => [row.horseId, row]));
  const entries: PredictionSnapshotSelectionLogEntry[] = [];

  const simulationLeader = buildSelectionLogEntryFromRow({
    role: "simulation_leader",
    row: params.rows[0] ?? null,
    rank: params.rows.length ? 1 : null,
    selectionMethod: "simulation_rank",
  });
  if (simulationLeader) entries.push(simulationLeader);

  const winPick = (pair.winPick ?? null) as Record<string, unknown> | null;
  const opponentPick = (pair.opponentPick ?? null) as Record<string, unknown> | null;
  const widePick = (pair.widePick ?? null) as Record<string, unknown> | null;
  const valuePick = (pair.valuePick ?? null) as Record<string, unknown> | null;
  const winRunnerUp = (pair.winRunnerUp ?? null) as Record<string, unknown> | null;
  const valueRunnerUp = (pair.valueRunnerUp ?? null) as Record<string, unknown> | null;

  const honmeiEntry =
    buildSelectionLogEntryFromPair({
      role: "honmei",
      entry: winPick,
      rank: rankByHorseId.get(normalizeString((winPick?.horse as Record<string, unknown> | undefined)?.id) ?? "") ?? null,
      selectionMethod: "rank2",
      runnerUp: winRunnerUp,
      sourceStatus: params.sourceStatus,
      livePreRaceEligible: params.livePreRaceEligible,
      fieldSize: params.fieldSize,
      oddsSource: params.oddsSource,
      simulationLeaderHorseId: params.rows[0]?.horseId ?? null,
    }) ??
    buildSelectionLogEntryFromRow({
      role: "honmei",
      row: params.honmeiHorseId ? rowByHorseId.get(params.honmeiHorseId) ?? null : null,
      rank: params.honmeiHorseId ? rankByHorseId.get(params.honmeiHorseId) ?? null : null,
      selectionMethod: "simulation_rank",
    });
  if (honmeiEntry) entries.push(honmeiEntry);

  const opponentEntry = buildSelectionLogEntryFromPair({
    role: "opponent",
    entry: opponentPick,
    rank: rankByHorseId.get(normalizeString((opponentPick?.horse as Record<string, unknown> | undefined)?.id) ?? "") ?? null,
    selectionMethod: params.opponentOverride?.selectionMethod ?? "stable_next",
    sourceStatus: params.sourceStatus,
    livePreRaceEligible: params.livePreRaceEligible,
    fieldSize: params.fieldSize,
    oddsSource: params.oddsSource,
    simulationLeaderHorseId: params.rows[0]?.horseId ?? null,
  });
  if (opponentEntry) entries.push(opponentEntry);

  const wideEntry = buildSelectionLogEntryFromPair({
    role: "wide",
    entry: widePick,
    rank: rankByHorseId.get(normalizeString((widePick?.horse as Record<string, unknown> | undefined)?.id) ?? "") ?? null,
    selectionMethod: "light_adjusted",
    runnerUp: valueRunnerUp,
    sourceStatus: params.sourceStatus,
    livePreRaceEligible: params.livePreRaceEligible,
    fieldSize: params.fieldSize,
    oddsSource: params.oddsSource,
    simulationLeaderHorseId: params.rows[0]?.horseId ?? null,
  });
  if (wideEntry) entries.push(wideEntry);

  if (valuePick && valuePick !== widePick) {
    const valueEntry = buildSelectionLogEntryFromPair({
      role: "value",
      entry: valuePick,
      rank: rankByHorseId.get(normalizeString((valuePick?.horse as Record<string, unknown> | undefined)?.id) ?? "") ?? null,
      selectionMethod: "legacy_value",
      runnerUp: valueRunnerUp,
      sourceStatus: params.sourceStatus,
      livePreRaceEligible: params.livePreRaceEligible,
      fieldSize: params.fieldSize,
      oddsSource: params.oddsSource,
      simulationLeaderHorseId: params.rows[0]?.horseId ?? null,
    });
    if (valueEntry) entries.push(valueEntry);
  }

  const watchRow = params.watchHorseId ? rowByHorseId.get(params.watchHorseId) ?? null : null;
  const watchEntry = buildSelectionLogEntryFromRow({
    role: "watch",
    row: watchRow,
    rank: params.watchHorseId ? rankByHorseId.get(params.watchHorseId) ?? null : null,
    selectionMethod: "market_watch",
  });
  if (watchEntry) entries.push(watchEntry);

  return {
    createdAt: params.capturedAt,
    scoringVersion: params.scoringVersion,
    entries,
    valueCandidateCount: normalizeNumber(pair.valueCandidateCount),
    marketHeatSummary:
      pair.marketHeatSummary && typeof pair.marketHeatSummary === "object"
        ? (pair.marketHeatSummary as Record<string, unknown>)
        : null,
  };
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
  capturedAt?: string | null;
  sourceStatus?: PredictionSnapshotSourceStatus | null;
  dataUpdatedAt?: string | null;
  weeklyRacesUpdatedAt?: string | null;
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
  expectation?: PredictionSnapshotExpectation | null;
  tanpukuPair?: unknown;
  selectionLog?: PredictionSnapshotSelectionLog | null;
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
    capturedAt: capturedAtParam = null,
    sourceStatus: explicitSourceStatus = null,
    dataUpdatedAt = null,
    weeklyRacesUpdatedAt = null,
    snapshotType = "manual_snapshot",
    oddsFetchedAt = null,
    oddsSource = null,
    predictionOrigin = DEFAULT_PREDICTION_ORIGIN,
    scoringVersion = DEFAULT_SCORING_VERSION,
    opponentOverride = null,
    valueHorseId = null,
    expectation = null,
    tanpukuPair = null,
    selectionLog = null,
  } = params;

  const capturedAt = normalizeCapturedAt(capturedAtParam);
  const rows = buildRaceAnalysisRows(results, horses, course, condition);
  const scoringConfigHash = await getScoringConfigHash();
  const normalizedScoringVersion = normalizeScoringVersion(scoringVersion);
  const resolvedOddsSource = resolveOddsSource(horses, oddsSource);
  const sourceStatus =
    explicitSourceStatus ??
    inferPredictionSnapshotSourceStatus({
      predictionOrigin,
      snapshotType,
      capturedAt,
      scheduledStartTime,
    });
  const scheduledTime = parseTime(scheduledStartTime);
  const capturedTime = parseTime(capturedAt);
  const capturedBeforeScheduledStart =
    scheduledTime !== null && capturedTime !== null ? capturedTime < scheduledTime : null;
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
      externalHorseId: normalizeString((horse as Horse & { externalHorseId?: unknown }).externalHorseId),
      horseName: row.name,
      rank: index + 1,
      score: row.abilityScore,
      winProb: row.simWinRate,
      baseScore: row.baseScore,
      trendAdjustment: row.trendAdjustment,
      adjustedScore: row.adjustedScore,
      originalRank: row.originalRank,
      adjustedRank: row.adjustedRank,
      matchedTrendHints: row.matchedTrendHints,
      fairOdds: row.fairOdds,
      realOdds: row.officialOdds,
      edge: round1(row.simWinRate - row.officialImplied),
      runningStyle: horse.runningStyle,
      runningStyleSource: normalizeString((horse as Horse & Record<string, unknown>).runningStyleSource),
      runningStyleInitialSource: normalizeString((horse as Horse & Record<string, unknown>).runningStyleInitialSource),
      gateNumber: row.gateNumber,
      jockey: row.jockey,
      oddsSource: resolveOddsSource([horse], resolvedOddsSource),
      oddsFetchedAt,
      previousRaceName: normalizeString(horse.previousRaceName),
      previousRaceDisplayName: normalizeString(horse.previousRaceDisplayName),
      previousFinish: normalizeNumber(horse.previousFinish),
      previousRaceSource: derivePreviousRaceSource(horse as Horse & Record<string, unknown>),
      runnerPreviousRaceOverrideApplied: normalizeBoolean((horse as Horse & Record<string, unknown>).runnerPreviousRaceOverrideApplied),
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

  const finalSelectionLog =
    selectionLog ??
    createSelectionLog({
      capturedAt,
      scoringVersion: normalizedScoringVersion,
      rows,
      honmeiHorseId,
      watchHorseId,
      tanpukuPair,
      opponentOverride,
      valueHorseId,
      sourceStatus,
      livePreRaceEligible: sourceStatus === "live_pre_race",
      fieldSize: horses.length,
      oddsSource: resolvedOddsSource,
    });

  return {
    snapshotId: createSnapshotId(),
    raceId: raceId ? String(raceId) : extractRaceId(course.id),
    courseId: course.id,
    capturedAt,
    snapshotTakenAt: capturedAt,
    snapshotType,
    raceDate,
    raceName: raceName ?? course.displayName ?? course.name,
    venue: venue ?? course.venue ?? null,
    venueKey,
    raceNumber: Number.isFinite(Number(raceNumber)) ? Number(raceNumber) : course.raceNumber ?? null,
    scheduledStartTime,
    sourceStatus,
    livePreRaceEligible: sourceStatus === "live_pre_race",
    dataLineage: {
      sourceStatus,
      predictionOrigin,
      capturedAt,
      scheduledStartTime,
      capturedBeforeScheduledStart,
      dataUpdatedAt: normalizeString(dataUpdatedAt),
      weeklyRacesUpdatedAt: normalizeString(weeklyRacesUpdatedAt),
      oddsSource: resolvedOddsSource,
      oddsFetchedAt,
    },
    predictionOrigin,
    scoringVersion: normalizedScoringVersion,
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
    expectation,
    selectionLog: finalSelectionLog,
    signalReasons,
    marketMeta: {
      fieldSize: horses.length,
      oddsFetchedAt,
      oddsSource: resolvedOddsSource,
    },
  };
}
