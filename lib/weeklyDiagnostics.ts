import fs from "node:fs/promises";
import path from "node:path";
import {
  GENERATED_ARCHIVED_RACES,
  GENERATED_COMPLETED_RACES,
  type GeneratedReviewRace,
} from "@/lib/generatedRaceSchedule";
import {
  RACE_DIAGNOSTIC_SEGMENTS,
  getRaceTargetFlags,
  matchesRaceDiagnosticSegment,
} from "@/lib/raceSegmentation.mjs";
import { buildDiagnosticRecommendations } from "@/lib/diagnosticRecommendations";
import {
  DEFAULT_PREDICTION_ORIGIN,
  DEFAULT_SCORING_VERSION,
  normalizePredictionOrigin,
  normalizeScoringVersion,
} from "@/lib/predictionSnapshots";
import {
  getWidePayoutByHorseNumbers,
  hasWidePayoutTable,
  loadHorseNumbersByRaceId,
  loadWidePayoutsByRaceId,
  type RaceHorseNumbers,
  type RaceWidePayouts,
} from "@/lib/widePayouts";
import type {
  DiagnosticsAggregationScope,
  PredictionOrigin,
  PredictionSnapshot,
  RaceDiagnosticsSegmentKey,
  WeeklyDiagnostics,
  WeeklyDiagnosticsEvaluation,
  WeeklyDiagnosticsMissTag,
  WeeklyDiagnosticsMissTagCount,
  WeeklyDiagnosticsMissTagDetail,
  WeeklyDiagnosticsMissPatternCounts,
  WeeklyDiagnosticsPopularityBand,
  WeeklyDiagnosticsRaceMiss,
  WeeklyDiagnosticsRepresentativeRace,
  WeeklyDiagnosticsSegmentSummary,
  WeeklyDiagnosticsWideBoxStats,
  WeeklyDiagnosticsWidePairStats,
  WeeklyDiagnosticsWideStats,
} from "@/lib/types";

const ROOT = process.cwd();
const STATE_PATH = path.join(ROOT, "data", "routine-state.json");
const SNAPSHOT_PATH = path.join(ROOT, "data", "prediction-snapshots.jsonl");
const GENERATED_REVIEWS_PATH = path.join(ROOT, "data", "generated-reviews.json");
export const WEEKLY_DIAGNOSTICS_PATH = path.join(ROOT, "data", "weekly-diagnostics.json");

type SettlementStatus = "pending_result" | "pending_payouts" | "settled";
type BetOutcome = "not_settled" | "hit" | "miss" | "hit_missing_payout";
type PayoutSource = "official" | "missing";
type PickType = "win" | "value";
type PopularityBandKey = "top3" | "mid" | "longshot";

type RecommendationRecord = {
  courseId?: unknown;
  raceId?: unknown;
  raceLabel?: unknown;
  pickType?: unknown;
  scoringVersion?: unknown;
  predictionOrigin?: unknown;
  source?: unknown;
  horseId?: unknown;
  horseName?: unknown;
  postedAt?: unknown;
  settledAt?: unknown;
  settlementStatus?: unknown;
  tanOutcome?: unknown;
  fukuOutcome?: unknown;
  tanPayout?: unknown;
  fukuPayout?: unknown;
  tanPayoutSource?: unknown;
  fukuPayoutSource?: unknown;
  actualWinnerHorseId?: unknown;
  actualTop3HorseIds?: unknown;
  realOdds?: unknown;
  placeOdds?: unknown;
  winProb?: unknown;
  placeProb?: unknown;
  placeScore?: unknown;
  valueScore?: unknown;
  selectionReason?: unknown;
  scoreGap?: unknown;
  runnerUpHorseId?: unknown;
  runnerUpHorseName?: unknown;
  runnerUpPlaceScore?: unknown;
  runnerUpPlaceProb?: unknown;
  overbetLabel?: unknown;
};

type RecommendationSettlement = {
  courseId: string;
  raceId: string | null;
  raceLabel: string | null;
  pickType: PickType;
  predictionOrigin: PredictionOrigin;
  scoringVersion: string;
  horseId: string;
  horseName: string;
  postedAt: string | null;
  settledAt: string | null;
  settlementStatus: SettlementStatus;
  tanOutcome: BetOutcome;
  fukuOutcome: BetOutcome;
  tanPayout: number;
  fukuPayout: number;
  tanPayoutSource: PayoutSource;
  fukuPayoutSource: PayoutSource;
  actualWinnerHorseId: string | null;
  actualTop3HorseIds: string[];
  realOdds: number;
  placeOdds: number;
  winProb: number;
  placeProb: number;
  placeScore: number;
  valueScore: number;
  selectionReason: string | null;
  scoreGap: number;
  runnerUpHorseId: string | null;
  runnerUpHorseName: string | null;
  runnerUpPlaceScore: number;
  runnerUpPlaceProb: number;
  overbetLabel: string | null;
};

type RecommendationSettlementBundle = {
  courseId: string;
  raceId: string | null;
  raceLabel: string | null;
  win: RecommendationSettlement | null;
  value: RecommendationSettlement | null;
};

type GeneratedReviewRecord = {
  raceId?: string;
  courseId?: string;
  updatedAt?: string;
  summary?: string | null;
  xPostText?: string | null;
};

type DiagnosticsContext = {
  scope: DiagnosticsAggregationScope;
  races: GeneratedReviewRace[];
  snapshotsByRaceId: Record<string, PredictionSnapshot>;
  settlementsByRaceId: Record<string, RecommendationSettlementBundle>;
  reviewsByRaceId: Record<string, GeneratedReviewRecord>;
  widePayoutsByRaceId: Record<string, RaceWidePayouts>;
  horseNumbersByRaceId: Record<string, RaceHorseNumbers>;
};

type WeeklyDiagnosticsCore = Omit<WeeklyDiagnostics, "meta" | "segments" | "recommendations">;

const SEGMENT_LABELS: Record<RaceDiagnosticsSegmentKey, string> = {
  special_only: "special_only",
  final12_only: "final12_only",
  all_expanded: "all_expanded",
  special_non_final: "special_non_final",
  special_final12: "special_final12",
};

function normalizeString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function normalizeNumber(value: unknown): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function normalizeSettlementStatus(value: unknown): SettlementStatus {
  return value === "pending_payouts" || value === "settled" ? value : "pending_result";
}

function normalizeBetOutcome(value: unknown): BetOutcome {
  return value === "hit" || value === "miss" || value === "hit_missing_payout" ? value : "not_settled";
}

function normalizePayoutSource(value: unknown): PayoutSource {
  return value === "official" ? "official" : "missing";
}

function normalizeAggregationScope(value: DiagnosticsAggregationScope | string | null | undefined): DiagnosticsAggregationScope {
  return value === "saved_only" ? "saved_only" : "all";
}

function inferRecommendationOrigin(record: RecommendationRecord): PredictionOrigin {
  if (record.source === "backfill") return "backfill";
  if (typeof record.source === "string" && String(record.source).includes("backfill")) return "backfill";
  return normalizePredictionOrigin(record.predictionOrigin, "saved_live");
}

function includePredictionOrigin(origin: PredictionOrigin, scope: DiagnosticsAggregationScope) {
  return scope === "all" || origin !== "backfill";
}

function extractRaceId(courseId: string): string | null {
  const match = courseId.match(/(\d{12})$/);
  return match?.[1] ?? null;
}

function isRecommendationPickType(value: unknown): value is PickType {
  return value === "win" || value === "value";
}

function toTimestamp(value: string | null | undefined): number {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentage(hit: number, total: number) {
  return total > 0 ? (hit / total) * 100 : 0;
}

function roi(totalPayout: number, raceCount: number) {
  const totalStake = raceCount * 100;
  return totalStake > 0 ? (totalPayout / totalStake) * 100 : 0;
}

function returnRate(totalPayout: number, totalStake: number) {
  return totalStake > 0 ? (totalPayout / totalStake) * 100 : 0;
}

function compareRecommendations(a: RecommendationSettlement | null, b: RecommendationSettlement): RecommendationSettlement {
  if (!a) return b;
  const aStatus = a.settlementStatus === "settled" ? 2 : a.settlementStatus === "pending_payouts" ? 1 : 0;
  const bStatus = b.settlementStatus === "settled" ? 2 : b.settlementStatus === "pending_payouts" ? 1 : 0;
  if (aStatus !== bStatus) return bStatus > aStatus ? b : a;

  const aPosted = toTimestamp(a.postedAt);
  const bPosted = toTimestamp(b.postedAt);
  if (aPosted !== bPosted) return bPosted > aPosted ? b : a;

  return toTimestamp(b.settledAt) >= toTimestamp(a.settledAt) ? b : a;
}

function getBundleTimestamp(bundle: RecommendationSettlementBundle) {
  return Math.max(
    toTimestamp(bundle.win?.settledAt ?? bundle.win?.postedAt),
    toTimestamp(bundle.value?.settledAt ?? bundle.value?.postedAt)
  );
}

function normalizeRecommendation(value: unknown): RecommendationSettlement | null {
  if (!value || typeof value !== "object") return null;
  const record = value as RecommendationRecord;
  const courseId = normalizeString(record.courseId);
  const horseId = normalizeString(record.horseId);
  const horseName = normalizeString(record.horseName);
  if (!courseId || !horseId || !horseName || !isRecommendationPickType(record.pickType)) return null;

  return {
    courseId,
    raceId: normalizeString(record.raceId) ?? extractRaceId(courseId),
    raceLabel: normalizeString(record.raceLabel),
    pickType: record.pickType,
    predictionOrigin: inferRecommendationOrigin(record),
    scoringVersion: normalizeScoringVersion(record.scoringVersion, DEFAULT_SCORING_VERSION),
    horseId,
    horseName,
    postedAt: normalizeString(record.postedAt),
    settledAt: normalizeString(record.settledAt),
    settlementStatus: normalizeSettlementStatus(record.settlementStatus),
    tanOutcome: normalizeBetOutcome(record.tanOutcome),
    fukuOutcome: normalizeBetOutcome(record.fukuOutcome),
    tanPayout: normalizeNumber(record.tanPayout),
    fukuPayout: normalizeNumber(record.fukuPayout),
    tanPayoutSource: normalizePayoutSource(record.tanPayoutSource),
    fukuPayoutSource: normalizePayoutSource(record.fukuPayoutSource),
    actualWinnerHorseId: normalizeString(record.actualWinnerHorseId),
    actualTop3HorseIds: Array.isArray(record.actualTop3HorseIds)
      ? record.actualTop3HorseIds.map((id) => String(id ?? "").trim()).filter(Boolean)
      : [],
    realOdds: normalizeNumber(record.realOdds),
    placeOdds: normalizeNumber(record.placeOdds),
    winProb: normalizeNumber(record.winProb),
    placeProb: normalizeNumber(record.placeProb),
    placeScore: normalizeNumber(record.placeScore),
    valueScore: normalizeNumber(record.valueScore),
    selectionReason: normalizeString(record.selectionReason),
    scoreGap: normalizeNumber(record.scoreGap),
    runnerUpHorseId: normalizeString(record.runnerUpHorseId),
    runnerUpHorseName: normalizeString(record.runnerUpHorseName),
    runnerUpPlaceScore: normalizeNumber(record.runnerUpPlaceScore),
    runnerUpPlaceProb: normalizeNumber(record.runnerUpPlaceProb),
    overbetLabel: typeof record.overbetLabel === "string" ? record.overbetLabel : null,
  };
}

function isPredictionSnapshot(value: unknown): value is PredictionSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<PredictionSnapshot>;
  return (
    typeof snapshot.snapshotId === "string" &&
    typeof snapshot.raceId === "string" &&
    typeof snapshot.courseId === "string" &&
    typeof snapshot.capturedAt === "string" &&
    Array.isArray(snapshot.rankedRows)
  );
}

function toNormalizedSnapshot(snapshot: PredictionSnapshot): PredictionSnapshot {
  return {
    ...snapshot,
    predictionOrigin: normalizePredictionOrigin(snapshot.predictionOrigin, DEFAULT_PREDICTION_ORIGIN),
    scoringVersion: normalizeScoringVersion(snapshot.scoringVersion, DEFAULT_SCORING_VERSION),
  };
}

async function loadLatestSnapshotsByRaceId(scope: DiagnosticsAggregationScope) {
  try {
    const raw = await fs.readFile(SNAPSHOT_PATH, "utf8");
    const latestByRaceId: Record<string, PredictionSnapshot> = {};
    for (const line of raw.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isPredictionSnapshot(parsed)) continue;
      const normalized = toNormalizedSnapshot(parsed);
      if (!normalized.raceId || !includePredictionOrigin(normalized.predictionOrigin, scope)) continue;
      const existing = latestByRaceId[normalized.raceId];
      if (!existing || toTimestamp(normalized.capturedAt) >= toTimestamp(existing.capturedAt)) {
        latestByRaceId[normalized.raceId] = normalized;
      }
    }
    return latestByRaceId;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return {};
    throw error;
  }
}

async function loadSettlementsByRaceId(scope: DiagnosticsAggregationScope) {
  const raw = await fs.readFile(STATE_PATH, "utf8");
  const state = JSON.parse(raw.replace(/^\uFEFF/, ""));
  const settlementsByCourseId: Record<string, RecommendationSettlementBundle> = {};
  const rawRecommendations = Array.isArray(state.tanpukuRecommendations) ? state.tanpukuRecommendations : [];

  for (const rawRecommendation of rawRecommendations) {
    const recommendation = normalizeRecommendation(rawRecommendation);
    if (!recommendation) continue;
    if (!includePredictionOrigin(recommendation.predictionOrigin, scope)) continue;

    const existing = settlementsByCourseId[recommendation.courseId] ?? {
      courseId: recommendation.courseId,
      raceId: recommendation.raceId,
      raceLabel: recommendation.raceLabel,
      win: null,
      value: null,
    };

    settlementsByCourseId[recommendation.courseId] = {
      ...existing,
      raceId: existing.raceId ?? recommendation.raceId,
      raceLabel: existing.raceLabel ?? recommendation.raceLabel,
      win: recommendation.pickType === "win" ? compareRecommendations(existing.win, recommendation) : existing.win,
      value: recommendation.pickType === "value" ? compareRecommendations(existing.value, recommendation) : existing.value,
    };
  }

  const settlementsByRaceId: Record<string, RecommendationSettlementBundle> = {};
  for (const bundle of Object.values(settlementsByCourseId)) {
    if (!bundle.raceId) continue;
    const existing = settlementsByRaceId[bundle.raceId];
    if (!existing || getBundleTimestamp(bundle) >= getBundleTimestamp(existing)) {
      settlementsByRaceId[bundle.raceId] = bundle;
    }
  }

  return settlementsByRaceId;
}

async function loadGeneratedReviewsByRaceId() {
  try {
    const raw = await fs.readFile(GENERATED_REVIEWS_PATH, "utf8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
    if (!parsed || typeof parsed !== "object") return {};
    const result: Record<string, GeneratedReviewRecord> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, GeneratedReviewRecord>)) {
      const raceId = normalizeString(value.raceId) ?? normalizeString(key);
      if (!raceId) continue;
      result[raceId] = value;
    }
    return result;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return {};
    throw error;
  }
}

function hasConfirmedResult(race: GeneratedReviewRace) {
  return Boolean(race.result?.winnerHorseId && race.result?.top3HorseIds?.length);
}

function getPopularityBand(rank: number): PopularityBandKey {
  if (rank <= 3) return "top3";
  if (rank <= 6) return "mid";
  return "longshot";
}

function getHorsePopularityRank(race: GeneratedReviewRace, horseId: string): number | null {
  const ranked = [...race.horses]
    .filter((horse) => Number.isFinite(Number(horse.realOdds)) && Number(horse.realOdds) > 0)
    .sort((a, b) => Number(a.realOdds) - Number(b.realOdds) || String(a.id).localeCompare(String(b.id)));
  const index = ranked.findIndex((horse) => String(horse.id) === horseId);
  return index >= 0 ? index + 1 : null;
}

function createPopularityBandMap(): Record<PopularityBandKey, WeeklyDiagnosticsPopularityBand> {
  return {
    top3: { band: "top3", raceCount: 0, placeHitCount: 0, placeRate: 0, placeReturnRate: 0 },
    mid: { band: "mid", raceCount: 0, placeHitCount: 0, placeRate: 0, placeReturnRate: 0 },
    longshot: { band: "longshot", raceCount: 0, placeHitCount: 0, placeRate: 0, placeReturnRate: 0 },
  };
}

function createWidePairStats(): WeeklyDiagnosticsWidePairStats {
  return {
    targetRaceCount: 0,
    valueCandidateRaceCount: 0,
    settledRaceCount: 0,
    pendingRaceCount: 0,
    hitCount: 0,
    hitRate: 0,
    totalStake: 0,
    totalPayout: 0,
    returnRate: 0,
    averagePayout: 0,
  };
}

function createWideBoxStats(): WeeklyDiagnosticsWideBoxStats {
  return {
    targetRaceCount: 0,
    settledRaceCount: 0,
    pendingRaceCount: 0,
    hitRaceCount: 0,
    hitRate: 0,
    totalStake: 0,
    totalPayout: 0,
    returnRate: 0,
    averagePayout: 0,
  };
}

function getHorseNumberByHorseId(
  race: GeneratedReviewRace,
  horseNumbersByRaceId: Record<string, RaceHorseNumbers>,
  horseId: string | null | undefined
): number | null {
  if (!horseId) return null;
  const raceId = String(race.raceId ?? "");
  const mappedHorseNumber = Number(horseNumbersByRaceId[raceId]?.[horseId]);
  if (Number.isFinite(mappedHorseNumber) && mappedHorseNumber > 0) return mappedHorseNumber;
  const finisher = race.result?.finishers?.find((entry) => String(entry.horseId ?? "") === String(horseId));
  const horseNumber = Number(finisher?.horseNumber);
  return Number.isFinite(horseNumber) && horseNumber > 0 ? horseNumber : null;
}

function finalizeWidePairStats(stats: WeeklyDiagnosticsWidePairStats) {
  stats.hitRate = percentage(stats.hitCount, stats.settledRaceCount);
  stats.returnRate = returnRate(stats.totalPayout, stats.totalStake);
  stats.averagePayout = stats.hitCount > 0 ? round2(stats.totalPayout / stats.hitCount) : 0;
}

function finalizeWideBoxStats(stats: WeeklyDiagnosticsWideBoxStats) {
  stats.hitRate = percentage(stats.hitRaceCount, stats.settledRaceCount);
  stats.returnRate = returnRate(stats.totalPayout, stats.totalStake);
  stats.averagePayout = stats.hitRaceCount > 0 ? round2(stats.totalPayout / stats.hitRaceCount) : 0;
}

function getDateRange(races: GeneratedReviewRace[]) {
  const dates = races.map((race) => race.date).filter(Boolean).sort();
  return {
    start: dates[0] ?? null,
    end: dates[dates.length - 1] ?? null,
  };
}

function buildWeekKey(races: GeneratedReviewRace[]) {
  const range = getDateRange(races);
  if (range.start && range.end) return `${range.start}_to_${range.end}`;
  return "unknown_week";
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function getHorseName(snapshot: PredictionSnapshot | undefined, horseId: string | null) {
  if (!snapshot || !horseId) return null;
  return snapshot.rankedRows.find((row) => row.horseId === horseId)?.horseName ?? null;
}

const MISS_TAG_ORDER: WeeklyDiagnosticsMissTag[] = [
  "top3_total_miss",
  "rank_error",
  "market_overfade",
  "place_prob_overestimate",
  "longshot_overreach",
  "value_misallocation",
  "data_insufficient",
];

const PLACE_PROB_OVER_ESTIMATE_THRESHOLD = 0.55;
const PLACE_PROB_OVER_ESTIMATE_HIGH_THRESHOLD = 0.75;
const PLACE_PROB_OVER_ESTIMATE_CEILING = 0.85;
const LONGSHOT_ODDS_THRESHOLD = 20;
const LONGSHOT_POPULARITY_THRESHOLD = 8;

function getSnapshotRankRow(snapshot: PredictionSnapshot | undefined, rank: 1 | 2 | 3) {
  return snapshot?.rankedRows.find((row) => row.rank === rank) ?? null;
}

function getSnapshotTopRows(snapshot: PredictionSnapshot | undefined) {
  return [1, 2, 3]
    .map((rank) => getSnapshotRankRow(snapshot, rank as 1 | 2 | 3))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

function addMissTag(
  details: WeeklyDiagnosticsMissTagDetail[],
  tag: WeeklyDiagnosticsMissTag,
  reason: string,
  evidence: Record<string, number | string | boolean | null>
) {
  if (details.some((detail) => detail.tag === tag)) return;
  details.push({ tag, reason, evidence });
}

function getPrimaryMissTag(details: WeeklyDiagnosticsMissTagDetail[]): WeeklyDiagnosticsMissTag | null {
  for (const tag of MISS_TAG_ORDER) {
    if (details.some((detail) => detail.tag === tag)) return tag;
  }
  return null;
}

function buildMissTagCounts(
  raceMisses: WeeklyDiagnosticsRaceMiss[],
  mode: "primary" | "all"
): WeeklyDiagnosticsMissTagCount[] {
  const counts = new Map<WeeklyDiagnosticsMissTag, number>(MISS_TAG_ORDER.map((tag) => [tag, 0]));
  for (const miss of raceMisses) {
    const tags = mode === "primary" ? (miss.primaryMissTag ? [miss.primaryMissTag] : []) : miss.missTags;
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return MISS_TAG_ORDER.map((tag) => {
    const raceCount = counts.get(tag) ?? 0;
    return {
      tag,
      raceCount,
      rate: raceMisses.length > 0 ? round2((raceCount / raceMisses.length) * 100) : 0,
    };
  });
}

function getStrongMarketFinisher(
  race: GeneratedReviewRace,
  excludedHorseIds: Set<string>
): { horseId: string; horseName: string; popularityRank: number } | null {
  const finishers = race.result?.finishers
    ?.slice()
    .sort((left, right) => left.position - right.position)
    .slice(0, 3) ?? [];

  for (const finisher of finishers) {
    const horseId = normalizeString(finisher.horseId);
    if (!horseId || excludedHorseIds.has(horseId)) continue;
    const popularityRank = Number.isFinite(Number(finisher.popularity))
      ? Number(finisher.popularity)
      : getHorsePopularityRank(race, horseId);
    if (!popularityRank || popularityRank > 3) continue;
    return {
      horseId,
      horseName: finisher.name,
      popularityRank,
    };
  }

  return null;
}

function buildRaceMissDiagnostics(
  race: GeneratedReviewRace,
  snapshot: PredictionSnapshot | undefined,
  settlement: RecommendationSettlementBundle | undefined
): WeeklyDiagnosticsRaceMiss | null {
  const targetFlags = getRaceTargetFlags(race);
  const raceId = String(race.raceId ?? "");
  const top3HorseIds = race.result?.top3HorseIds.map((id) => String(id)) ?? [];
  const snapshotPlaced = snapshot?.honmeiHorseId ? top3HorseIds.includes(snapshot.honmeiHorseId) : false;
  const routineSettled = settlement?.win?.settlementStatus === "settled";
  const routinePlaced = routineSettled ? settlement?.win?.fukuOutcome === "hit" : false;
  const valueSettled = settlement?.value?.settlementStatus === "settled";
  const valuePlaced = valueSettled ? settlement?.value?.fukuOutcome === "hit" : false;
  const missRace = routineSettled ? !routinePlaced : snapshot?.honmeiHorseId ? !snapshotPlaced : false;

  if (!missRace) return null;

  const snapshotTopRows = getSnapshotTopRows(snapshot);
  const sim2 = getSnapshotRankRow(snapshot, 2);
  const sim3 = getSnapshotRankRow(snapshot, 3);
  const sim2Placed = Boolean(sim2 && top3HorseIds.includes(String(sim2.horseId)));
  const sim3Placed = Boolean(sim3 && top3HorseIds.includes(String(sim3.horseId)));
  const simTop3PlacedCount = snapshotTopRows.filter((row) => top3HorseIds.includes(String(row.horseId))).length;
  const runnerUpHit = Boolean(settlement?.win?.runnerUpHorseId && top3HorseIds.includes(settlement.win.runnerUpHorseId));
  const details: WeeklyDiagnosticsMissTagDetail[] = [];

  if (!snapshot && !routineSettled && !valueSettled) {
    addMissTag(details, "data_insufficient", "missing_snapshot_and_settlement_context", {
      hasSnapshot: false,
      hasRoutineSettlement: false,
      hasValueSettlement: false,
    });
  }

  if (runnerUpHit) {
    addMissTag(details, "rank_error", "runner_up_hit_after_honmei_miss", {
      honmeiHorseId: settlement?.win?.horseId ?? snapshot?.honmeiHorseId ?? null,
      runnerUpHorseId: settlement?.win?.runnerUpHorseId ?? null,
      runnerUpPlaceProb: settlement?.win?.runnerUpPlaceProb ?? null,
      runnerUpPlaceScore: settlement?.win?.runnerUpPlaceScore ?? null,
    });
  } else if (!snapshotPlaced && sim2Placed) {
    addMissTag(details, "rank_error", "sim1_out_but_sim2_hit", {
      sim1HorseId: snapshot?.honmeiHorseId ?? null,
      sim2HorseId: sim2?.horseId ?? null,
      sim2WinProb: sim2?.winProb ?? null,
    });
  } else if (!snapshotPlaced && sim3Placed) {
    addMissTag(details, "rank_error", "sim1_out_but_sim3_hit", {
      sim1HorseId: snapshot?.honmeiHorseId ?? null,
      sim3HorseId: sim3?.horseId ?? null,
      sim3WinProb: sim3?.winProb ?? null,
    });
  }

  const fadeExcludedHorseIds = new Set(
    [
      settlement?.win?.horseId,
      settlement?.value?.horseId,
      ...snapshotTopRows.map((row) => String(row.horseId)),
    ].filter((horseId): horseId is string => Boolean(horseId))
  );
  const strongMarketFinisher = getStrongMarketFinisher(race, fadeExcludedHorseIds);
  if (strongMarketFinisher) {
    addMissTag(
      details,
      "market_overfade",
      strongMarketFinisher.popularityRank === 1 ? "market_favorite_hit_after_fade" : "market_top3_hit_after_fade",
      {
        horseId: strongMarketFinisher.horseId,
        horseName: strongMarketFinisher.horseName,
        popularityRank: strongMarketFinisher.popularityRank,
        routineHorseId: settlement?.win?.horseId ?? null,
        valueHorseId: settlement?.value?.horseId ?? null,
      }
    );
  }

  if (routineSettled && settlement?.win && settlement.win.fukuOutcome === "miss" && settlement.win.placeProb >= PLACE_PROB_OVER_ESTIMATE_THRESHOLD) {
    const reason =
      settlement.win.placeProb >= PLACE_PROB_OVER_ESTIMATE_CEILING
        ? "placeProb_ceiling_and_out"
        : settlement.win.placeProb >= PLACE_PROB_OVER_ESTIMATE_HIGH_THRESHOLD
          ? "placeProb>=0.75_and_out"
          : "placeProb>=0.55_and_out";
    addMissTag(details, "place_prob_overestimate", reason, {
      horseId: settlement.win.horseId,
      horseName: settlement.win.horseName,
      placeProb: settlement.win.placeProb,
      placeScore: settlement.win.placeScore,
      overbetLabel: settlement.win.overbetLabel,
    });
  }

  if (valueSettled && settlement?.value && settlement.value.fukuOutcome === "miss") {
    const valuePopularityRank = getHorsePopularityRank(race, settlement.value.horseId);
    const isLongshot =
      settlement.value.realOdds >= LONGSHOT_ODDS_THRESHOLD ||
      (valuePopularityRank !== null && valuePopularityRank >= LONGSHOT_POPULARITY_THRESHOLD);

    if (isLongshot && settlement.value.placeProb >= 0.25) {
      addMissTag(details, "longshot_overreach", "value_longshot_gate_passed_but_out", {
        horseId: settlement.value.horseId,
        horseName: settlement.value.horseName,
        realOdds: settlement.value.realOdds,
        popularityRank: valuePopularityRank,
        placeProb: settlement.value.placeProb,
        valueScore: settlement.value.valueScore,
      });
    }

    const valueAltReason:
      | { reason: string; evidence: Record<string, string | number | boolean | null> }
      | null = strongMarketFinisher && strongMarketFinisher.horseId !== settlement.value.horseId
      ? {
          reason: "value_miss_but_market_hit",
          evidence: {
            valueHorseId: settlement.value.horseId,
            marketHorseId: strongMarketFinisher.horseId,
            marketPopularityRank: strongMarketFinisher.popularityRank,
            valueScoreGap: settlement.value.scoreGap,
          },
        }
      : runnerUpHit && settlement.win?.runnerUpHorseId !== settlement.value.horseId
        ? {
            reason: "value_miss_but_runner_up_hit",
            evidence: {
              valueHorseId: settlement.value.horseId,
              runnerUpHorseId: settlement.win?.runnerUpHorseId ?? null,
              runnerUpPlaceProb: settlement.win?.runnerUpPlaceProb ?? null,
              valueScoreGap: settlement.value.scoreGap,
            },
          }
        : sim2Placed && sim2?.horseId !== settlement.value.horseId
          ? {
              reason: "value_miss_but_sim2_hit",
              evidence: {
                valueHorseId: settlement.value.horseId,
                sim2HorseId: sim2?.horseId ?? null,
                valueScoreGap: settlement.value.scoreGap,
              },
            }
          : sim3Placed && sim3?.horseId !== settlement.value.horseId
            ? {
                reason: "value_miss_but_sim3_hit",
                evidence: {
                  valueHorseId: settlement.value.horseId,
                  sim3HorseId: sim3?.horseId ?? null,
                  valueScoreGap: settlement.value.scoreGap,
                },
              }
            : null;

    if (valueAltReason) {
      addMissTag(details, "value_misallocation", valueAltReason.reason, {
        horseId: settlement.value.horseId,
        horseName: settlement.value.horseName,
        realOdds: settlement.value.realOdds,
        placeProb: settlement.value.placeProb,
        valueScore: settlement.value.valueScore,
        scoreGap: settlement.value.scoreGap,
        ...valueAltReason.evidence,
      });
    }
  }

  if (snapshot && simTop3PlacedCount === 0 && !valuePlaced) {
    addMissTag(details, "top3_total_miss", "sim_top3_all_out_and_value_out", {
      simTop3PlacedCount,
      hasValueCandidate: valueSettled,
      valueHorseId: settlement?.value?.horseId ?? snapshot.valueHorseId ?? null,
    });
  }

  if (details.length === 0) {
    addMissTag(details, "data_insufficient", "miss_without_clear_rule_match", {
      hasSnapshot: Boolean(snapshot),
      hasRoutineSettlement: routineSettled,
      hasValueSettlement: valueSettled,
      snapshotTop3PlacedCount: snapshot ? simTop3PlacedCount : null,
    });
  }

  return {
    raceId,
    courseId: race.courseId,
    label: race.label,
    date: race.date,
    raceNumber: targetFlags.raceNumber,
    isSpecialRace: targetFlags.isSpecialRace,
    isFinalRace: targetFlags.isFinalRace,
    isJumpRace: targetFlags.isJumpRace,
    raceSegment: targetFlags.raceSegment,
    primaryMissTag: getPrimaryMissTag(details),
    missTags: details.map((detail) => detail.tag),
    missTagDetails: details,
  };
}

function toRepresentativeRace(
  race: GeneratedReviewRace,
  snapshot: PredictionSnapshot | undefined,
  settlement: RecommendationSettlementBundle | undefined,
  reviewsByRaceId: Record<string, GeneratedReviewRecord>,
  category: WeeklyDiagnosticsRepresentativeRace["category"],
  raceMiss: WeeklyDiagnosticsRaceMiss | null = null
): WeeklyDiagnosticsRepresentativeRace {
  const targetFlags = getRaceTargetFlags(race);
  const top3HorseIds = race.result?.top3HorseIds.map((id) => String(id)) ?? [];
  const raceReview = reviewsByRaceId[String(race.raceId ?? "")];
  const snapshotHonmeiHorseId = snapshot?.honmeiHorseId ?? null;
  const routineHonmeiHorseId = settlement?.win?.horseId ?? null;
  const valueHorseId = settlement?.value?.horseId ?? snapshot?.valueHorseId ?? null;

  return {
    raceId: String(race.raceId ?? ""),
    courseId: race.courseId,
    label: race.label,
    date: race.date,
    raceNumber: targetFlags.raceNumber,
    isSpecialRace: targetFlags.isSpecialRace,
    isFinalRace: targetFlags.isFinalRace,
    isJumpRace: targetFlags.isJumpRace,
    raceSegment: targetFlags.raceSegment,
    category,
    resultTop3HorseIds: top3HorseIds,
    resultTop3HorseNames: race.result?.top3HorseNames ?? [],
    snapshotHonmeiHorseId,
    snapshotHonmeiHorseName: getHorseName(snapshot, snapshotHonmeiHorseId),
    snapshotHonmeiPlaced: snapshotHonmeiHorseId ? top3HorseIds.includes(snapshotHonmeiHorseId) : null,
    routineHonmeiHorseId,
    routineHonmeiHorseName: settlement?.win?.horseName ?? null,
    routineHonmeiPlaced: routineHonmeiHorseId ? top3HorseIds.includes(routineHonmeiHorseId) : null,
    valueHorseId,
    valueHorseName: settlement?.value?.horseName ?? getHorseName(snapshot, valueHorseId),
    valuePlaced: valueHorseId ? top3HorseIds.includes(valueHorseId) : null,
    valueReturnRate: settlement?.value?.fukuPayout ? settlement.value.fukuPayout : null,
    primaryMissTag: raceMiss?.primaryMissTag ?? null,
    missTags: raceMiss?.missTags ?? [],
    missTagDetails: raceMiss?.missTagDetails ?? [],
    reviewSummary: raceReview?.summary ?? race.review?.summary ?? null,
  };
}

export async function loadWeeklyDiagnosticsContext(scope: DiagnosticsAggregationScope = "all"): Promise<DiagnosticsContext> {
  const normalizedScope = normalizeAggregationScope(scope);
  const [snapshotsByRaceId, settlementsByRaceId, reviewsByRaceId, widePayoutsByRaceId, horseNumbersByRaceId] = await Promise.all([
    loadLatestSnapshotsByRaceId(normalizedScope),
    loadSettlementsByRaceId(normalizedScope),
    loadGeneratedReviewsByRaceId(),
    loadWidePayoutsByRaceId(),
    loadHorseNumbersByRaceId(),
  ]);

  return {
    scope: normalizedScope,
    races: [...GENERATED_COMPLETED_RACES, ...GENERATED_ARCHIVED_RACES],
    snapshotsByRaceId,
    settlementsByRaceId,
    reviewsByRaceId,
    widePayoutsByRaceId,
    horseNumbersByRaceId,
  };
}

function buildWeeklyDiagnosticsBase(context: DiagnosticsContext): Omit<WeeklyDiagnostics, "segments"> {
  const confirmedRaces = context.races.filter(hasConfirmedResult);
  const dateRange = getDateRange(context.races);
  const weekKey = buildWeekKey(context.races);
  const recommendationScoringVersions = Array.from(
    new Set(
      confirmedRaces
        .flatMap((race) => {
          const settlement = context.settlementsByRaceId[String(race.raceId ?? "")];
          return [settlement?.win?.scoringVersion, settlement?.value?.scoringVersion];
        })
        .filter((value): value is string => Boolean(value))
    )
  ).sort();
  const snapshotScoringVersions = Array.from(
    new Set(
      confirmedRaces
        .map((race) => context.snapshotsByRaceId[String(race.raceId ?? "")]?.scoringVersion)
        .filter((value): value is string => Boolean(value))
    )
  ).sort();
  const scoringVersions = recommendationScoringVersions.length > 0 ? recommendationScoringVersions : snapshotScoringVersions;

  const modelVersions = Array.from(
    new Set(
      confirmedRaces
        .map((race) => context.snapshotsByRaceId[String(race.raceId ?? "")]?.modelVersion)
        .filter((value): value is string => Boolean(value))
    )
  ).sort();

  const scoringConfigHashes = Array.from(
    new Set(
      confirmedRaces
        .map((race) => context.snapshotsByRaceId[String(race.raceId ?? "")]?.scoringConfigHash)
        .filter((value): value is string => Boolean(value))
    )
  ).sort();

  const placeCore = {
    snapshotHonmei: { raceCount: 0, placeHitCount: 0, placeRate: 0 },
    routineHonmei: { raceCount: 0, placeHitCount: 0, placeRate: 0, placeReturnRate: 0 },
    snapshotRanks: [
      { rank: 1 as const, raceCount: 0, placeHitCount: 0, placeRate: 0 },
      { rank: 2 as const, raceCount: 0, placeHitCount: 0, placeRate: 0 },
      { rank: 3 as const, raceCount: 0, placeHitCount: 0, placeRate: 0 },
    ],
  };

  const valueBandMap = createPopularityBandMap();
  const valueCore = {
    raceCount: 0,
    skippedCount: 0,
    placeHitCount: 0,
    placeRate: 0,
    placeReturnRate: 0,
    candidateRate: 0,
    popularityBands: [] as WeeklyDiagnosticsPopularityBand[],
    longshot: { raceCount: 0, placeHitCount: 0, placeRate: 0, placeReturnRate: 0 },
  };

  const wideStats: WeeklyDiagnosticsWideStats = {
    tanpukuHonmeiValueCandidate: createWidePairStats(),
    simHonmeiTanpukuHonmeiValueCandidateBox: createWideBoxStats(),
  };

  const agreement = {
    raceCount: 0,
    sameHonmeiCount: 0,
    agreementRate: 0,
    samePlaceRate: 0,
    disagreementSnapshotPlaceRate: 0,
    disagreementRoutinePlaceRate: 0,
  };

  const disagreement = {
    raceCount: 0,
    snapshotPlaceRate: 0,
    routinePlaceRate: 0,
    valuePlaceCount: 0,
    snapshotOnlyPlaceCount: 0,
    routineOnlyPlaceCount: 0,
  };
  const missPatternCounts: WeeklyDiagnosticsMissPatternCounts = {
    rankError: 0,
    top3TotalMiss: 0,
    valueRescueHit: 0,
    honmeiAndValueMiss: 0,
  };
  let honmeiValueComparableRaceCount = 0;
  let honmeiValueDivergenceCount = 0;

  const marketHeatCounts = {
    honmeiOverbetCount: 0,
    honmeiOverbetPlaceHitCount: 0,
    honmeiNonOverbetCount: 0,
    honmeiNonOverbetPlaceHitCount: 0,
  };

  const bestHitCandidates: Array<{ score: number; race: WeeklyDiagnosticsRepresentativeRace }> = [];
  const worstMissCandidates: Array<{ score: number; race: WeeklyDiagnosticsRepresentativeRace }> = [];
  const disagreementCandidates: Array<{ score: number; race: WeeklyDiagnosticsRepresentativeRace }> = [];
  const valueHitCandidates: Array<{ score: number; race: WeeklyDiagnosticsRepresentativeRace }> = [];
  const raceMisses: WeeklyDiagnosticsRaceMiss[] = [];

  for (const race of confirmedRaces) {
    const raceId = String(race.raceId ?? "");
    const snapshot = context.snapshotsByRaceId[raceId];
    const settlement = context.settlementsByRaceId[raceId];
    const widePayouts = context.widePayoutsByRaceId[raceId];
    const top3HorseIds = race.result?.top3HorseIds.map((id) => String(id)) ?? [];
    const winnerHorseId = String(race.result?.winnerHorseId ?? "");
    const raceMiss = buildRaceMissDiagnostics(race, snapshot, settlement);

    if (raceMiss) {
      raceMisses.push(raceMiss);
    }

    if (settlement?.win?.settlementStatus === "settled") {
      wideStats.tanpukuHonmeiValueCandidate.targetRaceCount += 1;
      const valueCandidate = settlement.value?.settlementStatus === "settled" ? settlement.value : null;
      const pairHorseIds = valueCandidate
        ? [...new Set([settlement.win.horseId, valueCandidate.horseId].filter(Boolean))]
        : [];

      if (pairHorseIds.length === 2) {
        wideStats.tanpukuHonmeiValueCandidate.valueCandidateRaceCount += 1;
        const firstHorseNumber = getHorseNumberByHorseId(race, context.horseNumbersByRaceId, settlement.win.horseId);
        const secondHorseNumber = getHorseNumberByHorseId(race, context.horseNumbersByRaceId, valueCandidate?.horseId);
        const hasWideTable = hasWidePayoutTable(widePayouts);

        if (hasWideTable && firstHorseNumber && secondHorseNumber) {
          const pairPayout =
            getWidePayoutByHorseNumbers(widePayouts, [firstHorseNumber, secondHorseNumber]) ?? null;
          if (pairPayout !== null) {
            wideStats.tanpukuHonmeiValueCandidate.settledRaceCount += 1;
            wideStats.tanpukuHonmeiValueCandidate.totalStake += 100;
            wideStats.tanpukuHonmeiValueCandidate.totalPayout += pairPayout;
            if (pairPayout > 0) wideStats.tanpukuHonmeiValueCandidate.hitCount += 1;
          } else {
            wideStats.tanpukuHonmeiValueCandidate.pendingRaceCount += 1;
          }
        } else {
          wideStats.tanpukuHonmeiValueCandidate.pendingRaceCount += 1;
        }
      }
    }

    const boxHorseIds = [...new Set([snapshot?.honmeiHorseId, settlement?.win?.horseId, settlement?.value?.horseId].filter(Boolean))];
    const boxIsEligible =
      snapshot?.honmeiHorseId &&
      settlement?.win?.settlementStatus === "settled" &&
      settlement?.value?.settlementStatus === "settled" &&
      boxHorseIds.length === 3;

    if (boxIsEligible) {
      wideStats.simHonmeiTanpukuHonmeiValueCandidateBox.targetRaceCount += 1;

      const boxHorseNumbers = boxHorseIds
        .map((horseId) => getHorseNumberByHorseId(race, context.horseNumbersByRaceId, horseId))
        .filter((horseNumber): horseNumber is number => Boolean(horseNumber));
      const hasWideTable = hasWidePayoutTable(widePayouts);

      if (hasWideTable && boxHorseNumbers.length === 3) {
        const pairPayouts = [
          getWidePayoutByHorseNumbers(widePayouts, [boxHorseNumbers[0], boxHorseNumbers[1]]),
          getWidePayoutByHorseNumbers(widePayouts, [boxHorseNumbers[0], boxHorseNumbers[2]]),
          getWidePayoutByHorseNumbers(widePayouts, [boxHorseNumbers[1], boxHorseNumbers[2]]),
        ];

        if (pairPayouts.every((payout): payout is number => payout !== null)) {
          const racePayout = pairPayouts.reduce((sum, payout) => sum + payout, 0);
          wideStats.simHonmeiTanpukuHonmeiValueCandidateBox.settledRaceCount += 1;
          wideStats.simHonmeiTanpukuHonmeiValueCandidateBox.totalStake += 300;
          wideStats.simHonmeiTanpukuHonmeiValueCandidateBox.totalPayout += racePayout;
          if (racePayout > 0) wideStats.simHonmeiTanpukuHonmeiValueCandidateBox.hitRaceCount += 1;
        } else {
          wideStats.simHonmeiTanpukuHonmeiValueCandidateBox.pendingRaceCount += 1;
        }
      } else {
        wideStats.simHonmeiTanpukuHonmeiValueCandidateBox.pendingRaceCount += 1;
      }
    }

    if (snapshot?.honmeiHorseId) {
      placeCore.snapshotHonmei.raceCount += 1;
      const snapshotPlaced = top3HorseIds.includes(snapshot.honmeiHorseId);
      if (snapshotPlaced) placeCore.snapshotHonmei.placeHitCount += 1;
    }

    for (const rank of [1, 2, 3] as const) {
      const row = snapshot?.rankedRows.find((entry) => entry.rank === rank);
      if (!row) continue;
      const bucket = placeCore.snapshotRanks[rank - 1];
      bucket.raceCount += 1;
      if (top3HorseIds.includes(String(row.horseId))) bucket.placeHitCount += 1;
    }

    if (settlement?.win?.settlementStatus === "settled") {
      placeCore.routineHonmei.raceCount += 1;
      const winPlaced = settlement.win.fukuOutcome === "hit";
      if (winPlaced) placeCore.routineHonmei.placeHitCount += 1;
      placeCore.routineHonmei.placeReturnRate += settlement.win.fukuPayout;

      if (settlement.win.overbetLabel) {
        marketHeatCounts.honmeiOverbetCount += 1;
        if (winPlaced) marketHeatCounts.honmeiOverbetPlaceHitCount += 1;
      } else {
        marketHeatCounts.honmeiNonOverbetCount += 1;
        if (winPlaced) marketHeatCounts.honmeiNonOverbetPlaceHitCount += 1;
      }
    }

    if (settlement?.value?.settlementStatus === "settled") {
      valueCore.raceCount += 1;
      const valuePlaced = settlement.value.fukuOutcome === "hit";
      if (valuePlaced) valueCore.placeHitCount += 1;
      valueCore.placeReturnRate += settlement.value.fukuPayout;

      const popularityRank = getHorsePopularityRank(race, settlement.value.horseId);
      if (popularityRank) {
        const band = valueBandMap[getPopularityBand(popularityRank)];
        band.raceCount += 1;
        if (valuePlaced) band.placeHitCount += 1;
        band.placeReturnRate += settlement.value.fukuPayout;
      }
    } else if (settlement?.win?.settlementStatus === "settled" && !settlement?.value) {
      // Win candidate exists but no value candidate: quality gate filtered all out
      valueCore.skippedCount += 1;
    }

    if (snapshot?.honmeiHorseId && settlement?.win) {
      const snapshotPlaced = top3HorseIds.includes(snapshot.honmeiHorseId);
      const routinePlaced = top3HorseIds.includes(settlement.win.horseId);

      agreement.raceCount += 1;
      if (snapshot.honmeiHorseId === settlement.win.horseId) {
        agreement.sameHonmeiCount += 1;
        if (snapshotPlaced) agreement.samePlaceRate += 1;
      } else {
        disagreement.raceCount += 1;
        if (snapshotPlaced) {
          agreement.disagreementSnapshotPlaceRate += 1;
          disagreement.snapshotPlaceRate += 1;
          disagreement.snapshotOnlyPlaceCount += routinePlaced ? 0 : 1;
        }
        if (routinePlaced) {
          agreement.disagreementRoutinePlaceRate += 1;
          disagreement.routinePlaceRate += 1;
          disagreement.routineOnlyPlaceCount += snapshotPlaced ? 0 : 1;
        }
        if (settlement.value?.settlementStatus === "settled" && settlement.value.fukuOutcome === "hit") {
          disagreement.valuePlaceCount += 1;
        }
        disagreementCandidates.push({
          score: (snapshotPlaced ? 1 : 0) + (routinePlaced ? 1 : 0) + (settlement.value?.fukuPayout ?? 0) / 1000,
          race: toRepresentativeRace(
            race,
            snapshot,
            settlement,
            context.reviewsByRaceId,
            "disagreement",
            raceMiss ?? null
          ),
        });
      }
    }

    const snapshotPlaced = snapshot?.honmeiHorseId ? top3HorseIds.includes(snapshot.honmeiHorseId) : false;
    const routinePlaced = settlement?.win ? top3HorseIds.includes(settlement.win.horseId) : false;
    const valuePlaced = settlement?.value ? top3HorseIds.includes(settlement.value.horseId) : false;
    const simTopRows = snapshot
      ? [1, 2, 3]
          .map((rank) => snapshot.rankedRows.find((row) => row.rank === rank))
          .filter((row): row is NonNullable<typeof row> => Boolean(row))
      : [];
    const simTop3PlacedCount = simTopRows.filter((row) => top3HorseIds.includes(String(row.horseId))).length;

    if (snapshot?.honmeiHorseId && settlement?.value) {
      honmeiValueComparableRaceCount += 1;
      if (snapshot.honmeiHorseId !== settlement.value.horseId) {
        honmeiValueDivergenceCount += 1;
      }
    }
    if (snapshot && !snapshotPlaced && simTop3PlacedCount > 0) missPatternCounts.rankError += 1;
    if (snapshot && simTop3PlacedCount === 0) missPatternCounts.top3TotalMiss += 1;
    if (settlement?.win?.settlementStatus === "settled" && settlement?.value?.settlementStatus === "settled") {
      if (!routinePlaced && valuePlaced) missPatternCounts.valueRescueHit += 1;
      if (!routinePlaced && !valuePlaced) missPatternCounts.honmeiAndValueMiss += 1;
    }

    if (snapshotPlaced || routinePlaced) {
      bestHitCandidates.push({
        score:
          (winnerHorseId === snapshot?.honmeiHorseId ? 3 : 0) +
          (winnerHorseId === settlement?.win?.horseId ? 3 : 0) +
          (snapshotPlaced ? 2 : 0) +
          (routinePlaced ? 2 : 0) +
          (valuePlaced ? 1 : 0),
        race: toRepresentativeRace(
          race,
          snapshot,
          settlement,
          context.reviewsByRaceId,
          "best_hit",
          raceMiss ?? null
        ),
      });
    }

    if (snapshot && settlement?.win && !snapshotPlaced && !routinePlaced) {
      const snapshotTopRow = snapshot.rankedRows.find((row) => row.rank === 1);
      worstMissCandidates.push({
        score: Number(snapshotTopRow?.winProb ?? 0) + Number(snapshotTopRow?.realOdds ? 100 / snapshotTopRow.realOdds : 0),
        race: toRepresentativeRace(
          race,
          snapshot,
          settlement,
          context.reviewsByRaceId,
          "worst_miss",
          raceMiss ?? null
        ),
      });
    }

    if (settlement?.value?.settlementStatus === "settled" && settlement.value.fukuOutcome === "hit") {
      valueHitCandidates.push({
        score: settlement.value.fukuPayout + (valuePlaced ? 50 : 0),
        race: toRepresentativeRace(
          race,
          snapshot,
          settlement,
          context.reviewsByRaceId,
          "value_hit",
          raceMiss ?? null
        ),
      });
    }
  }

  placeCore.snapshotHonmei.placeRate = percentage(
    placeCore.snapshotHonmei.placeHitCount,
    placeCore.snapshotHonmei.raceCount
  );
  placeCore.routineHonmei.placeRate = percentage(
    placeCore.routineHonmei.placeHitCount,
    placeCore.routineHonmei.raceCount
  );
  placeCore.routineHonmei.placeReturnRate = roi(
    placeCore.routineHonmei.placeReturnRate,
    placeCore.routineHonmei.raceCount
  );
  for (const bucket of placeCore.snapshotRanks) {
    bucket.placeRate = percentage(bucket.placeHitCount, bucket.raceCount);
  }

  valueCore.placeRate = percentage(valueCore.placeHitCount, valueCore.raceCount);
  valueCore.placeReturnRate = roi(valueCore.placeReturnRate, valueCore.raceCount);
  const valueTotalEligible = valueCore.raceCount + valueCore.skippedCount;
  valueCore.candidateRate = valueTotalEligible > 0 ? round2((valueCore.raceCount / valueTotalEligible) * 100) : 0;
  for (const band of Object.values(valueBandMap)) {
    band.placeRate = percentage(band.placeHitCount, band.raceCount);
    band.placeReturnRate = roi(band.placeReturnRate, band.raceCount);
  }
  valueCore.popularityBands = [valueBandMap.top3, valueBandMap.mid, valueBandMap.longshot];
  valueCore.longshot = {
    raceCount: valueBandMap.longshot.raceCount,
    placeHitCount: valueBandMap.longshot.placeHitCount,
    placeRate: valueBandMap.longshot.placeRate,
    placeReturnRate: valueBandMap.longshot.placeReturnRate,
  };

  finalizeWidePairStats(wideStats.tanpukuHonmeiValueCandidate);
  finalizeWideBoxStats(wideStats.simHonmeiTanpukuHonmeiValueCandidateBox);

  agreement.agreementRate = percentage(agreement.sameHonmeiCount, agreement.raceCount);
  agreement.samePlaceRate = percentage(agreement.samePlaceRate, agreement.sameHonmeiCount);
  agreement.disagreementSnapshotPlaceRate = percentage(
    agreement.disagreementSnapshotPlaceRate,
    disagreement.raceCount
  );
  agreement.disagreementRoutinePlaceRate = percentage(
    agreement.disagreementRoutinePlaceRate,
    disagreement.raceCount
  );

  disagreement.snapshotPlaceRate = percentage(disagreement.snapshotPlaceRate, disagreement.raceCount);
  disagreement.routinePlaceRate = percentage(disagreement.routinePlaceRate, disagreement.raceCount);

  const missDiagnostics = {
    missRaceCount: raceMisses.length,
    primary: buildMissTagCounts(raceMisses, "primary"),
    all: buildMissTagCounts(raceMisses, "all"),
    races: [...raceMisses].sort((left, right) => right.date.localeCompare(left.date) || left.label.localeCompare(right.label)),
  };

  const representativeRaces = {
    bestHits: bestHitCandidates
      .sort((a, b) => b.score - a.score || b.race.date.localeCompare(a.race.date))
      .slice(0, 3)
      .map((entry) => entry.race),
    worstMisses: worstMissCandidates
      .sort((a, b) => b.score - a.score || b.race.date.localeCompare(a.race.date))
      .slice(0, 3)
      .map((entry) => entry.race),
    disagreementCases: disagreementCandidates
      .sort((a, b) => b.score - a.score || b.race.date.localeCompare(a.race.date))
      .slice(0, 3)
      .map((entry) => entry.race),
    valueHits: valueHitCandidates
      .sort((a, b) => b.score - a.score || b.race.date.localeCompare(a.race.date))
      .slice(0, 3)
      .map((entry) => entry.race),
  };

  const signals = {
    snapshotHonmeiUnderperformsRoutineHonmei:
      placeCore.snapshotHonmei.raceCount > 0 &&
      placeCore.routineHonmei.raceCount > 0 &&
      placeCore.snapshotHonmei.placeRate < placeCore.routineHonmei.placeRate,
    secondRankOutperformsFirstRank:
      placeCore.snapshotRanks[1].raceCount > 0 &&
      placeCore.snapshotRanks[1].placeRate > placeCore.snapshotRanks[0].placeRate,
    thirdRankOutperformsFirstRank:
      placeCore.snapshotRanks[2].raceCount > 0 &&
      placeCore.snapshotRanks[2].placeRate > placeCore.snapshotRanks[0].placeRate,
    valueCandidateWorksBetterInLongshots:
      valueCore.longshot.raceCount > 0 &&
      valueCore.longshot.placeReturnRate > valueCore.placeReturnRate,
    agreementImprovesPlaceRate:
      agreement.sameHonmeiCount > 0 &&
      agreement.samePlaceRate >
        Math.max(agreement.disagreementSnapshotPlaceRate, agreement.disagreementRoutinePlaceRate),
    disagreementFavoursRoutine:
      disagreement.raceCount > 0 &&
      agreement.disagreementRoutinePlaceRate > agreement.disagreementSnapshotPlaceRate,
    disagreementFavoursSnapshot:
      disagreement.raceCount > 0 &&
      agreement.disagreementSnapshotPlaceRate > agreement.disagreementRoutinePlaceRate,
  };

  const evaluation: WeeklyDiagnosticsEvaluation = {
    primaryKpis: {
      tanpukuHonmeiPlaceHitRate: placeCore.routineHonmei.placeRate,
      tanpukuHonmeiPlaceRoi: placeCore.routineHonmei.placeReturnRate,
    },
    secondaryKpis: {
      sim1VsSim2PlaceGap:
        placeCore.snapshotRanks[0].raceCount > 0 && placeCore.snapshotRanks[1].raceCount > 0
          ? round2(placeCore.snapshotRanks[1].placeRate - placeCore.snapshotRanks[0].placeRate)
          : null,
      honmeiValueDivergenceRate:
        honmeiValueComparableRaceCount > 0
          ? round2((honmeiValueDivergenceCount / honmeiValueComparableRaceCount) * 100)
          : null,
      missPatternCounts,
      marketHeatCounts,
    },
  };

  const diagnosticsBase = {
    meta: {
      weekKey,
      generatedAt: new Date().toISOString(),
      aggregationScope: context.scope,
      scoringVersion: scoringVersions.length === 1 ? scoringVersions[0] : null,
      modelVersion: modelVersions.length === 1 ? modelVersions[0] : null,
      scoringConfigHash: scoringConfigHashes.length === 1 ? scoringConfigHashes[0] : null,
      scoringVersions,
      modelVersions,
      scoringConfigHashes,
      raceCount: context.races.length,
      settledRaceCount: confirmedRaces.length,
      dateRange,
    },
    placeCore,
    valueCore,
    wideStats,
    agreement,
    disagreement,
    representativeRaces,
    missDiagnostics,
    signals,
    evaluation,
  };

  return {
    ...diagnosticsBase,
    recommendations: buildDiagnosticRecommendations(diagnosticsBase),
  };
}

function buildSegmentSummary(
  context: DiagnosticsContext,
  segmentKey: RaceDiagnosticsSegmentKey
): WeeklyDiagnosticsSegmentSummary {
  const segmentRaces = context.races.filter((race) => matchesRaceDiagnosticSegment(race, segmentKey));
  const segmentDiagnostics = buildWeeklyDiagnosticsBase({
    ...context,
    races: segmentRaces,
  });

  return {
    key: segmentKey,
    label: SEGMENT_LABELS[segmentKey],
    raceCount: segmentRaces.length,
    settledRaceCount: segmentRaces.filter(hasConfirmedResult).length,
    placeCore: segmentDiagnostics.placeCore,
    valueCore: segmentDiagnostics.valueCore,
    wideStats: segmentDiagnostics.wideStats,
    agreement: segmentDiagnostics.agreement,
    disagreement: segmentDiagnostics.disagreement,
    missDiagnostics: segmentDiagnostics.missDiagnostics,
  };
}

export function buildWeeklyDiagnostics(context: DiagnosticsContext): WeeklyDiagnostics {
  const diagnostics = buildWeeklyDiagnosticsBase(context);
  const segments = Object.fromEntries(
    RACE_DIAGNOSTIC_SEGMENTS.map((segmentKey) => [segmentKey, buildSegmentSummary(context, segmentKey)])
  ) as Record<RaceDiagnosticsSegmentKey, WeeklyDiagnosticsSegmentSummary>;

  return {
    ...diagnostics,
    segments,
  };
}

export async function getWeeklyDiagnostics(scope: DiagnosticsAggregationScope = "all"): Promise<WeeklyDiagnostics> {
  const context = await loadWeeklyDiagnosticsContext(scope);
  return buildWeeklyDiagnostics(context);
}
