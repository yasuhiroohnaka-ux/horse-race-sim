import fs from "node:fs/promises";
import path from "node:path";
import {
  GENERATED_ARCHIVED_RACES,
  GENERATED_COMPLETED_RACES,
  type GeneratedReviewRace,
} from "@/lib/generatedRaceSchedule";
import { buildDiagnosticRecommendations } from "@/lib/diagnosticRecommendations";
import type {
  PredictionSnapshot,
  WeeklyDiagnostics,
  WeeklyDiagnosticsPopularityBand,
  WeeklyDiagnosticsRepresentativeRace,
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
  raceLabel?: unknown;
  pickType?: unknown;
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
};

type RecommendationSettlement = {
  courseId: string;
  raceId: string | null;
  raceLabel: string | null;
  pickType: PickType;
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
  races: GeneratedReviewRace[];
  snapshotsByRaceId: Record<string, PredictionSnapshot>;
  settlementsByRaceId: Record<string, RecommendationSettlementBundle>;
  reviewsByRaceId: Record<string, GeneratedReviewRecord>;
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
    raceId: extractRaceId(courseId),
    raceLabel: normalizeString(record.raceLabel),
    pickType: record.pickType,
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

async function loadLatestSnapshotsByRaceId() {
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
      if (!isPredictionSnapshot(parsed) || !parsed.raceId) continue;
      const existing = latestByRaceId[parsed.raceId];
      if (!existing || toTimestamp(parsed.capturedAt) >= toTimestamp(existing.capturedAt)) {
        latestByRaceId[parsed.raceId] = parsed;
      }
    }
    return latestByRaceId;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return {};
    throw error;
  }
}

async function loadSettlementsByRaceId() {
  const raw = await fs.readFile(STATE_PATH, "utf8");
  const state = JSON.parse(raw.replace(/^\uFEFF/, ""));
  const settlementsByCourseId: Record<string, RecommendationSettlementBundle> = {};
  const rawRecommendations = Array.isArray(state.tanpukuRecommendations) ? state.tanpukuRecommendations : [];

  for (const rawRecommendation of rawRecommendations) {
    const recommendation = normalizeRecommendation(rawRecommendation);
    if (!recommendation) continue;

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

function getHorseName(snapshot: PredictionSnapshot | undefined, horseId: string | null) {
  if (!snapshot || !horseId) return null;
  return snapshot.rankedRows.find((row) => row.horseId === horseId)?.horseName ?? null;
}

function toRepresentativeRace(
  race: GeneratedReviewRace,
  snapshot: PredictionSnapshot | undefined,
  settlement: RecommendationSettlementBundle | undefined,
  reviewsByRaceId: Record<string, GeneratedReviewRecord>,
  category: WeeklyDiagnosticsRepresentativeRace["category"]
): WeeklyDiagnosticsRepresentativeRace {
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
    reviewSummary: raceReview?.summary ?? race.review?.summary ?? null,
  };
}

export async function loadWeeklyDiagnosticsContext(): Promise<DiagnosticsContext> {
  const [snapshotsByRaceId, settlementsByRaceId, reviewsByRaceId] = await Promise.all([
    loadLatestSnapshotsByRaceId(),
    loadSettlementsByRaceId(),
    loadGeneratedReviewsByRaceId(),
  ]);

  return {
    races: [...GENERATED_COMPLETED_RACES, ...GENERATED_ARCHIVED_RACES],
    snapshotsByRaceId,
    settlementsByRaceId,
    reviewsByRaceId,
  };
}

export function buildWeeklyDiagnostics(context: DiagnosticsContext): WeeklyDiagnostics {
  const confirmedRaces = context.races.filter(hasConfirmedResult);
  const dateRange = getDateRange(context.races);
  const weekKey = buildWeekKey(context.races);

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
    placeHitCount: 0,
    placeRate: 0,
    placeReturnRate: 0,
    popularityBands: [] as WeeklyDiagnosticsPopularityBand[],
    longshot: { raceCount: 0, placeHitCount: 0, placeRate: 0, placeReturnRate: 0 },
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

  const bestHitCandidates: Array<{ score: number; race: WeeklyDiagnosticsRepresentativeRace }> = [];
  const worstMissCandidates: Array<{ score: number; race: WeeklyDiagnosticsRepresentativeRace }> = [];
  const disagreementCandidates: Array<{ score: number; race: WeeklyDiagnosticsRepresentativeRace }> = [];
  const valueHitCandidates: Array<{ score: number; race: WeeklyDiagnosticsRepresentativeRace }> = [];

  for (const race of confirmedRaces) {
    const raceId = String(race.raceId ?? "");
    const snapshot = context.snapshotsByRaceId[raceId];
    const settlement = context.settlementsByRaceId[raceId];
    const top3HorseIds = race.result?.top3HorseIds.map((id) => String(id)) ?? [];
    const winnerHorseId = String(race.result?.winnerHorseId ?? "");

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
      if (settlement.win.fukuOutcome === "hit") placeCore.routineHonmei.placeHitCount += 1;
      placeCore.routineHonmei.placeReturnRate += settlement.win.fukuPayout;
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
          race: toRepresentativeRace(race, snapshot, settlement, context.reviewsByRaceId, "disagreement"),
        });
      }
    }

    const snapshotPlaced = snapshot?.honmeiHorseId ? top3HorseIds.includes(snapshot.honmeiHorseId) : false;
    const routinePlaced = settlement?.win ? top3HorseIds.includes(settlement.win.horseId) : false;
    const valuePlaced = settlement?.value ? top3HorseIds.includes(settlement.value.horseId) : false;

    if (snapshotPlaced || routinePlaced) {
      bestHitCandidates.push({
        score:
          (winnerHorseId === snapshot?.honmeiHorseId ? 3 : 0) +
          (winnerHorseId === settlement?.win?.horseId ? 3 : 0) +
          (snapshotPlaced ? 2 : 0) +
          (routinePlaced ? 2 : 0) +
          (valuePlaced ? 1 : 0),
        race: toRepresentativeRace(race, snapshot, settlement, context.reviewsByRaceId, "best_hit"),
      });
    }

    if (snapshot && settlement?.win && !snapshotPlaced && !routinePlaced) {
      const snapshotTopRow = snapshot.rankedRows.find((row) => row.rank === 1);
      worstMissCandidates.push({
        score: Number(snapshotTopRow?.winProb ?? 0) + Number(snapshotTopRow?.realOdds ? 100 / snapshotTopRow.realOdds : 0),
        race: toRepresentativeRace(race, snapshot, settlement, context.reviewsByRaceId, "worst_miss"),
      });
    }

    if (settlement?.value?.settlementStatus === "settled" && settlement.value.fukuOutcome === "hit") {
      valueHitCandidates.push({
        score: settlement.value.fukuPayout + (valuePlaced ? 50 : 0),
        race: toRepresentativeRace(race, snapshot, settlement, context.reviewsByRaceId, "value_hit"),
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

  const diagnosticsBase = {
    meta: {
      weekKey,
      generatedAt: new Date().toISOString(),
      modelVersion: modelVersions.length === 1 ? modelVersions[0] : null,
      scoringConfigHash: scoringConfigHashes.length === 1 ? scoringConfigHashes[0] : null,
      modelVersions,
      scoringConfigHashes,
      raceCount: context.races.length,
      settledRaceCount: confirmedRaces.length,
      dateRange,
    },
    placeCore,
    valueCore,
    agreement,
    disagreement,
    representativeRaces,
    signals,
  };

  return {
    ...diagnosticsBase,
    recommendations: buildDiagnosticRecommendations(diagnosticsBase),
  };
}

export async function getWeeklyDiagnostics(): Promise<WeeklyDiagnostics> {
  const context = await loadWeeklyDiagnosticsContext();
  return buildWeeklyDiagnostics(context);
}
