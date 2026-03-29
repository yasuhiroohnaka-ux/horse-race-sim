import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  GENERATED_ARCHIVED_RACES,
  GENERATED_COMPLETED_RACES,
  type GeneratedReviewRace,
} from "@/lib/generatedRaceSchedule";
import type { PredictionSnapshot } from "@/lib/types";

const ROOT = process.cwd();
const STATE_PATH = path.join(ROOT, "data", "routine-state.json");
const SNAPSHOT_PATH = path.join(ROOT, "data", "prediction-snapshots.jsonl");

type SettlementStatus = "pending_result" | "pending_payouts" | "settled";
type BetOutcome = "not_settled" | "hit" | "miss" | "hit_missing_payout";
type PayoutSource = "official" | "missing";
type PickType = "win" | "value";
type PopularityBandKey = "fav_1_3" | "fav_4_6" | "fav_7_plus";

type RecommendationRecord = {
  courseId?: unknown;
  raceId?: unknown;
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

type BaseSummary = {
  raceCount: number;
  placeCount: number;
  placeRate: number;
};

type SnapshotHonmeiSummary = BaseSummary & {
  firstCount: number;
  winRate: number;
};

type RoutineHonmeiSummary = {
  raceCount: number;
  tanHitCount: number;
  fukuHitCount: number;
  tanHitRate: number;
  fukuHitRate: number;
  tanRoi: number;
  fukuRoi: number;
  pendingCount: number;
};

type ValueCandidateSummary = {
  raceCount: number;
  placeCount: number;
  placeRate: number;
  fukuRoi: number;
  pendingCount: number;
};

type AgreementSummary = {
  raceCount: number;
  samePickCount: number;
  samePickRate: number;
  samePickPlaceCount: number;
  samePickPlaceRate: number;
  differentPickCount: number;
  snapshotPlaceCountWhenDifferent: number;
  snapshotPlaceRateWhenDifferent: number;
  routinePlaceCountWhenDifferent: number;
  routinePlaceRateWhenDifferent: number;
};

type PopularityBandSummary = {
  raceCount: number;
  placeCount: number;
  placeRate: number;
  fukuRoi: number;
};

type SnapshotRankSummary = {
  rank: number;
  raceCount: number;
  placeCount: number;
  placeRate: number;
};

type DisagreementDetailSummary = {
  raceCount: number;
  snapshotPlaceRate: number;
  routinePlaceRate: number;
  valuePlaceCount: number;
  snapshotMissRoutinePlaceCount: number;
  routineMissSnapshotPlaceCount: number;
};

type AggregateSummary = {
  snapshotHonmei: SnapshotHonmeiSummary;
  routineHonmei: RoutineHonmeiSummary;
  valueCandidate: ValueCandidateSummary;
  agreement: AgreementSummary;
  popularityBands: {
    routineHonmei: Record<PopularityBandKey, PopularityBandSummary>;
    valueCandidate: Record<PopularityBandKey, PopularityBandSummary>;
  };
  snapshotRanks: SnapshotRankSummary[];
  disagreementDetail: DisagreementDetailSummary;
};

function createPopularityBandSummary(): PopularityBandSummary {
  return { raceCount: 0, placeCount: 0, placeRate: 0, fukuRoi: 0 };
}

function createEmptySummary(): AggregateSummary {
  return {
    snapshotHonmei: { raceCount: 0, firstCount: 0, placeCount: 0, winRate: 0, placeRate: 0 },
    routineHonmei: { raceCount: 0, tanHitCount: 0, fukuHitCount: 0, tanHitRate: 0, fukuHitRate: 0, tanRoi: 0, fukuRoi: 0, pendingCount: 0 },
    valueCandidate: { raceCount: 0, placeCount: 0, placeRate: 0, fukuRoi: 0, pendingCount: 0 },
    agreement: {
      raceCount: 0,
      samePickCount: 0,
      samePickRate: 0,
      samePickPlaceCount: 0,
      samePickPlaceRate: 0,
      differentPickCount: 0,
      snapshotPlaceCountWhenDifferent: 0,
      snapshotPlaceRateWhenDifferent: 0,
      routinePlaceCountWhenDifferent: 0,
      routinePlaceRateWhenDifferent: 0,
    },
    popularityBands: {
      routineHonmei: {
        fav_1_3: createPopularityBandSummary(),
        fav_4_6: createPopularityBandSummary(),
        fav_7_plus: createPopularityBandSummary(),
      },
      valueCandidate: {
        fav_1_3: createPopularityBandSummary(),
        fav_4_6: createPopularityBandSummary(),
        fav_7_plus: createPopularityBandSummary(),
      },
    },
    snapshotRanks: [
      { rank: 1, raceCount: 0, placeCount: 0, placeRate: 0 },
      { rank: 2, raceCount: 0, placeCount: 0, placeRate: 0 },
      { rank: 3, raceCount: 0, placeCount: 0, placeRate: 0 },
    ],
    disagreementDetail: {
      raceCount: 0,
      snapshotPlaceRate: 0,
      routinePlaceRate: 0,
      valuePlaceCount: 0,
      snapshotMissRoutinePlaceCount: 0,
      routineMissSnapshotPlaceCount: 0,
    },
  };
}

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

function roi(payout: number, raceCount: number) {
  const stake = raceCount * 100;
  return stake > 0 ? (payout / stake) * 100 : 0;
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
  return typeof snapshot.raceId === "string" && typeof snapshot.courseId === "string" && typeof snapshot.capturedAt === "string" && Array.isArray(snapshot.rankedRows);
}

async function loadLatestSnapshotsByRaceId(): Promise<Record<string, PredictionSnapshot>> {
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
      if (!parsed.raceId) continue;
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

function getPopularityBand(rank: number): PopularityBandKey {
  if (rank <= 3) return "fav_1_3";
  if (rank <= 6) return "fav_4_6";
  return "fav_7_plus";
}

function getHorsePopularityRank(race: GeneratedReviewRace, horseId: string): number | null {
  const ranked = [...race.horses]
    .filter((horse) => Number.isFinite(Number(horse.realOdds)) && Number(horse.realOdds) > 0)
    .sort((a, b) => Number(a.realOdds) - Number(b.realOdds) || String(a.id).localeCompare(String(b.id)));
  const index = ranked.findIndex((horse) => String(horse.id) === horseId);
  return index >= 0 ? index + 1 : null;
}

function hasConfirmedResult(race: GeneratedReviewRace) {
  return Boolean(race.result?.winnerHorseId && race.result?.top3HorseIds?.length);
}

function applyPopularityBandSummary(
  target: Record<PopularityBandKey, PopularityBandSummary>,
  race: GeneratedReviewRace,
  horseId: string,
  fukuOutcome: BetOutcome,
  fukuPayout: number
) {
  const popularityRank = getHorsePopularityRank(race, horseId);
  if (!popularityRank) return;
  const band = target[getPopularityBand(popularityRank)];
  band.raceCount += 1;
  if (fukuOutcome === "hit") band.placeCount += 1;
  band.fukuRoi += fukuPayout;
}

function buildAggregateSummary(
  races: GeneratedReviewRace[],
  snapshotsByRaceId: Record<string, PredictionSnapshot>,
  settlementsByRaceId: Record<string, RecommendationSettlementBundle>
): AggregateSummary {
  const summary = createEmptySummary();

  for (const race of races) {
    if (!hasConfirmedResult(race)) continue;
    const raceId = String(race.raceId ?? "");
    const top3HorseIds = race.result?.top3HorseIds.map((id) => String(id)) ?? [];
    const winnerHorseId = String(race.result?.winnerHorseId ?? "");
    const snapshot = snapshotsByRaceId[raceId];
    const settlement = settlementsByRaceId[raceId];

    if (snapshot?.honmeiHorseId) {
      summary.snapshotHonmei.raceCount += 1;
      if (snapshot.honmeiHorseId === winnerHorseId) summary.snapshotHonmei.firstCount += 1;
      if (top3HorseIds.includes(snapshot.honmeiHorseId)) summary.snapshotHonmei.placeCount += 1;
    }

    for (const rank of [1, 2, 3] as const) {
      const row = snapshot?.rankedRows.find((entry) => entry.rank === rank);
      if (!row) continue;
      const bucket = summary.snapshotRanks[rank - 1];
      bucket.raceCount += 1;
      if (top3HorseIds.includes(String(row.horseId))) bucket.placeCount += 1;
    }

    const routineWin = settlement?.win ?? null;
    const value = settlement?.value ?? null;

    if (snapshot?.honmeiHorseId && routineWin) {
      summary.agreement.raceCount += 1;
      const snapshotPlaced = top3HorseIds.includes(snapshot.honmeiHorseId);
      const routinePlaced = top3HorseIds.includes(routineWin.horseId);
      if (snapshot.honmeiHorseId === routineWin.horseId) {
        summary.agreement.samePickCount += 1;
        if (snapshotPlaced) summary.agreement.samePickPlaceCount += 1;
      } else {
        summary.agreement.differentPickCount += 1;
        if (snapshotPlaced) summary.agreement.snapshotPlaceCountWhenDifferent += 1;
        if (routinePlaced) summary.agreement.routinePlaceCountWhenDifferent += 1;

        summary.disagreementDetail.raceCount += 1;
        if (snapshotPlaced) summary.disagreementDetail.snapshotPlaceRate += 1;
        if (routinePlaced) summary.disagreementDetail.routinePlaceRate += 1;
        if (value && top3HorseIds.includes(value.horseId)) summary.disagreementDetail.valuePlaceCount += 1;
        if (!snapshotPlaced && routinePlaced) summary.disagreementDetail.snapshotMissRoutinePlaceCount += 1;
        if (snapshotPlaced && !routinePlaced) summary.disagreementDetail.routineMissSnapshotPlaceCount += 1;
      }
    }
  }

  for (const bundle of Object.values(settlementsByRaceId)) {
    const race = races.find((entry) => String(entry.raceId ?? "") === String(bundle.raceId ?? ""));
    if (bundle.win) {
      if (bundle.win.settlementStatus === "settled") {
        summary.routineHonmei.raceCount += 1;
        if (bundle.win.tanOutcome === "hit") summary.routineHonmei.tanHitCount += 1;
        if (bundle.win.fukuOutcome === "hit") summary.routineHonmei.fukuHitCount += 1;
        summary.routineHonmei.tanRoi += bundle.win.tanPayout;
        summary.routineHonmei.fukuRoi += bundle.win.fukuPayout;
        if (race) {
          applyPopularityBandSummary(
            summary.popularityBands.routineHonmei,
            race,
            bundle.win.horseId,
            bundle.win.fukuOutcome,
            bundle.win.fukuPayout
          );
        }
      } else {
        summary.routineHonmei.pendingCount += 1;
      }
    }

    if (bundle.value) {
      if (bundle.value.settlementStatus === "settled") {
        summary.valueCandidate.raceCount += 1;
        if (bundle.value.fukuOutcome === "hit") summary.valueCandidate.placeCount += 1;
        summary.valueCandidate.fukuRoi += bundle.value.fukuPayout;
        if (race) {
          applyPopularityBandSummary(
            summary.popularityBands.valueCandidate,
            race,
            bundle.value.horseId,
            bundle.value.fukuOutcome,
            bundle.value.fukuPayout
          );
        }
      } else {
        summary.valueCandidate.pendingCount += 1;
      }
    }
  }

  summary.snapshotHonmei.winRate = percentage(summary.snapshotHonmei.firstCount, summary.snapshotHonmei.raceCount);
  summary.snapshotHonmei.placeRate = percentage(summary.snapshotHonmei.placeCount, summary.snapshotHonmei.raceCount);
  summary.routineHonmei.tanHitRate = percentage(summary.routineHonmei.tanHitCount, summary.routineHonmei.raceCount);
  summary.routineHonmei.fukuHitRate = percentage(summary.routineHonmei.fukuHitCount, summary.routineHonmei.raceCount);
  summary.routineHonmei.tanRoi = roi(summary.routineHonmei.tanRoi, summary.routineHonmei.raceCount);
  summary.routineHonmei.fukuRoi = roi(summary.routineHonmei.fukuRoi, summary.routineHonmei.raceCount);
  summary.valueCandidate.placeRate = percentage(summary.valueCandidate.placeCount, summary.valueCandidate.raceCount);
  summary.valueCandidate.fukuRoi = roi(summary.valueCandidate.fukuRoi, summary.valueCandidate.raceCount);
  summary.agreement.samePickRate = percentage(summary.agreement.samePickCount, summary.agreement.raceCount);
  summary.agreement.samePickPlaceRate = percentage(summary.agreement.samePickPlaceCount, summary.agreement.samePickCount);
  summary.agreement.snapshotPlaceRateWhenDifferent = percentage(summary.agreement.snapshotPlaceCountWhenDifferent, summary.agreement.differentPickCount);
  summary.agreement.routinePlaceRateWhenDifferent = percentage(summary.agreement.routinePlaceCountWhenDifferent, summary.agreement.differentPickCount);

  for (const bucket of summary.snapshotRanks) {
    bucket.placeRate = percentage(bucket.placeCount, bucket.raceCount);
  }
  for (const record of [summary.popularityBands.routineHonmei, summary.popularityBands.valueCandidate]) {
    for (const key of Object.keys(record) as PopularityBandKey[]) {
      record[key].placeRate = percentage(record[key].placeCount, record[key].raceCount);
      record[key].fukuRoi = roi(record[key].fukuRoi, record[key].raceCount);
    }
  }

  summary.disagreementDetail.snapshotPlaceRate = percentage(
    summary.disagreementDetail.snapshotPlaceRate,
    summary.disagreementDetail.raceCount
  );
  summary.disagreementDetail.routinePlaceRate = percentage(
    summary.disagreementDetail.routinePlaceRate,
    summary.disagreementDetail.raceCount
  );

  return summary;
}

export async function GET() {
  try {
    const [stateRaw, snapshotsByRaceId] = await Promise.all([
      fs.readFile(STATE_PATH, "utf8"),
      loadLatestSnapshotsByRaceId(),
    ]);
    const state = JSON.parse(stateRaw.replace(/^\uFEFF/, ""));

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

    const races = [...GENERATED_COMPLETED_RACES, ...GENERATED_ARCHIVED_RACES];
    const summary = buildAggregateSummary(races, snapshotsByRaceId, settlementsByRaceId);

    return NextResponse.json({
      performance: state.performance ?? null,
      updatedAt: state.performance?.updatedAt ?? null,
      settlementsByCourseId,
      settlementsByRaceId,
      summary,
    });
  } catch {
    return NextResponse.json({
      performance: null,
      updatedAt: null,
      settlementsByCourseId: {},
      settlementsByRaceId: {},
      summary: createEmptySummary(),
    });
  }
}
