import { NextResponse } from "next/server";
import { buildWeeklyDiagnostics, loadWeeklyDiagnosticsContext } from "@/lib/weeklyDiagnostics";
import { loadReviewRecords } from "@/lib/reviewRecords";
import type { DiagnosticsAggregationScope, RaceReviewRecord, ReviewLegacyValueSelection, ReviewSelectionHorse } from "@/lib/types";

type GapBucket = {
  label: string;
  raceCount: number;
  opponentPlaceCount: number;
  opponentPlaceRate: number;
  wideHitCount: number;
  wideHitRate: number;
};

type SummaryPayload = {
  counts: {
    targetRaceCount: number;
    readyCount: number;
    pendingCount: number;
    failedCount: number;
    legacyCount: number;
  };
  honmei: {
    raceCount: number;
    winCount: number;
    placeCount: number;
    winRate: number;
    placeRate: number;
    tanRoi: number;
    fukuRoi: number;
  };
  opponent: {
    raceCount: number;
    placeCount: number;
    placeRate: number;
    fukuRoi: number;
  };
  pair: {
    raceCount: number;
    wideHitCount: number;
    wideHitRate: number;
    wideReturnRate: number;
    simultaneousPlaceCount: number;
    simultaneousPlaceRate: number;
  };
  rankGapBuckets: GapBucket[];
  scoreGapBuckets: GapBucket[];
};

function normalizeScope(value: string | null | undefined): DiagnosticsAggregationScope {
  return value === "saved_only" ? "saved_only" : "all";
}

function pct(hit: number, total: number) {
  return total > 0 ? (hit / total) * 100 : 0;
}

function roi(totalPayout: number, raceCount: number) {
  return raceCount > 0 ? (totalPayout / (raceCount * 100)) * 100 : 0;
}

function buildGapBuckets(labels: string[]) {
  return labels.map((label) => ({
    label,
    raceCount: 0,
    opponentPlaceCount: 0,
    opponentPlaceRate: 0,
    wideHitCount: 0,
    wideHitRate: 0,
  }));
}

function classifyRankGap(rankGap: number | null | undefined) {
  if (!Number.isFinite(Number(rankGap))) return "unknown";
  if (Number(rankGap) <= 1) return "1";
  if (Number(rankGap) === 2) return "2";
  return "3+";
}

function classifyScoreGap(scoreGap: number | null | undefined) {
  const value = Number(scoreGap);
  if (!Number.isFinite(value)) return "unknown";
  if (value < 0.02) return "<0.02";
  if (value < 0.05) return "0.02-0.05";
  return "0.05+";
}

function isReadyRecord(record: RaceReviewRecord) {
  return record.status === "review_ready" && record.reviewReady;
}

function normalizeSelectionBundle(selection: ReviewSelectionHorse | ReviewLegacyValueSelection | null, postedAt: string | null | undefined) {
  if (!selection) return null;
  const normalized = selection as Partial<ReviewSelectionHorse & ReviewLegacyValueSelection>;
  return {
    horseId: selection.horseId,
    horseName: selection.horseName ?? selection.horseId,
    postedAt,
    settlementStatus: normalized.settlementStatus ?? "pending_result",
    tanOutcome: normalized.tanOutcome ?? "not_settled",
    fukuOutcome: normalized.fukuOutcome ?? "not_settled",
    tanPayout: Number(normalized.tanPayout ?? 0),
    fukuPayout: Number(normalized.fukuPayout ?? 0),
    tanPayoutSource: normalized.tanPayoutSource ?? "missing",
    fukuPayoutSource: normalized.fukuPayoutSource ?? "missing",
    realOdds: Number(normalized.realOdds ?? 0),
    placeOdds: Number(normalized.placeOdds ?? 0),
    winProb: Number(normalized.winProb ?? 0),
    placeProb: Number(normalized.placeProb ?? 0),
    placeScore: Number(normalized.placeScore ?? 0),
    valueScore: Number(normalized.valueScore ?? 0),
    selectionReason: normalized.selectionReason ?? null,
    scoreGap: Number(normalized.scoreGap ?? 0),
    runnerUpHorseId: normalized.runnerUpHorseId ?? null,
    runnerUpHorseName: normalized.runnerUpHorseName ?? null,
    runnerUpPlaceScore: Number(normalized.runnerUpPlaceScore ?? 0),
    runnerUpPlaceProb: Number(normalized.runnerUpPlaceProb ?? 0),
    overbetLabel: normalized.overbetLabel ?? null,
  };
}

function settlementBundle(record: RaceReviewRecord) {
  const opponent = normalizeSelectionBundle(record.opponent, record.snapshotTakenAt);
  const legacyValue = normalizeSelectionBundle(record.legacyValue, record.snapshotTakenAt);

  return {
    win: record.honmei
      ? {
          horseId: record.honmei.horseId,
          horseName: record.honmei.horseName ?? record.honmei.horseId,
          postedAt: record.snapshotTakenAt,
          settlementStatus: record.honmei.settlementStatus ?? "pending_result",
          tanOutcome: record.honmei.tanOutcome ?? "not_settled",
          fukuOutcome: record.honmei.fukuOutcome ?? "not_settled",
          tanPayout: Number(record.honmei.tanPayout ?? 0),
          fukuPayout: Number(record.honmei.fukuPayout ?? 0),
          tanPayoutSource: record.honmei.tanPayoutSource ?? "missing",
          fukuPayoutSource: record.honmei.fukuPayoutSource ?? "missing",
          realOdds: Number(record.honmei.realOdds ?? 0),
          placeOdds: Number(record.honmei.placeOdds ?? 0),
          winProb: Number(record.honmei.winProb ?? 0),
          placeProb: Number(record.honmei.placeProb ?? 0),
          placeScore: Number(record.honmei.placeScore ?? 0),
          valueScore: Number(record.honmei.valueScore ?? 0),
          selectionReason: record.honmei.selectionReason ?? null,
          scoreGap: Number(record.honmei.scoreGap ?? 0),
          runnerUpHorseId: record.honmei.runnerUpHorseId ?? null,
          runnerUpHorseName: record.honmei.runnerUpHorseName ?? null,
          runnerUpPlaceScore: Number(record.honmei.runnerUpPlaceScore ?? 0),
          runnerUpPlaceProb: Number(record.honmei.runnerUpPlaceProb ?? 0),
          overbetLabel: record.honmei.overbetLabel ?? null,
        }
      : null,
    opponent,
    value: opponent ?? legacyValue,
    legacyValue,
    meta: {
      status: record.status,
      reviewReady: record.reviewReady,
      compatibilityMode: record.compatibilityMode,
      scheduledStartTime: record.meta.scheduledStartTime,
      raceDate: record.meta.raceDate,
      raceName: record.meta.raceName,
      pair: record.pair,
    },
  };
}

function accumulateWeeklyPerformance(records: RaceReviewRecord[]) {
  const totals = {
    bets: 0,
    tanHits: 0,
    fukuHits: 0,
    tanStake: 0,
    tanPayout: 0,
    fukuStake: 0,
    fukuPayout: 0,
  };

  for (const record of records) {
    if (!isReadyRecord(record) || !record.honmei) continue;
    totals.bets += 1;
    totals.tanStake += 100;
    totals.fukuStake += 100;
    if (record.honmei.tanOutcome === "hit") totals.tanHits += 1;
    if (record.honmei.fukuOutcome === "hit") totals.fukuHits += 1;
    totals.tanPayout += Number(record.honmei.tanPayout ?? 0);
    totals.fukuPayout += Number(record.honmei.fukuPayout ?? 0);
  }

  return totals;
}

function buildSummary(records: RaceReviewRecord[]): SummaryPayload {
  const readyRecords = records.filter(isReadyRecord);
  const rankGapBuckets = buildGapBuckets(["1", "2", "3+", "unknown"]);
  const scoreGapBuckets = buildGapBuckets(["<0.02", "0.02-0.05", "0.05+", "unknown"]);

  const summary: SummaryPayload = {
    counts: {
      targetRaceCount: records.length,
      readyCount: readyRecords.length,
      pendingCount: records.filter((record) => record.status !== "review_ready" && record.status !== "review_failed").length,
      failedCount: records.filter((record) => record.status === "review_failed").length,
      legacyCount: records.filter((record) => record.compatibilityMode === "legacy_value_candidate").length,
    },
    honmei: {
      raceCount: 0,
      winCount: 0,
      placeCount: 0,
      winRate: 0,
      placeRate: 0,
      tanRoi: 0,
      fukuRoi: 0,
    },
    opponent: {
      raceCount: 0,
      placeCount: 0,
      placeRate: 0,
      fukuRoi: 0,
    },
    pair: {
      raceCount: 0,
      wideHitCount: 0,
      wideHitRate: 0,
      wideReturnRate: 0,
      simultaneousPlaceCount: 0,
      simultaneousPlaceRate: 0,
    },
    rankGapBuckets,
    scoreGapBuckets,
  };

  for (const record of readyRecords) {
    const honmei = record.honmei;
    const opponent = record.opponent;
    if (honmei) {
      summary.honmei.raceCount += 1;
      if (honmei.tanOutcome === "hit") summary.honmei.winCount += 1;
      if (honmei.fukuOutcome === "hit") summary.honmei.placeCount += 1;
      summary.honmei.tanRoi += Number(honmei.tanPayout ?? 0);
      summary.honmei.fukuRoi += Number(honmei.fukuPayout ?? 0);
    }

    if (opponent) {
      summary.opponent.raceCount += 1;
      if (opponent.fukuOutcome === "hit") summary.opponent.placeCount += 1;
      summary.opponent.fukuRoi += Number(opponent.fukuPayout ?? 0);
    }

    if (honmei && opponent) {
      summary.pair.raceCount += 1;
      if (record.pair.wideOutcome === "hit") summary.pair.wideHitCount += 1;
      if (record.pair.sameTop3) summary.pair.simultaneousPlaceCount += 1;
      summary.pair.wideReturnRate += Number(record.pair.widePayout ?? 0);

      const rankBucket = rankGapBuckets.find((bucket) => bucket.label === classifyRankGap(record.pair.rankGap));
      const scoreBucket = scoreGapBuckets.find((bucket) => bucket.label === classifyScoreGap(record.pair.scoreGap));
      for (const bucket of [rankBucket, scoreBucket]) {
        if (!bucket) continue;
        bucket.raceCount += 1;
        if (opponent.fukuOutcome === "hit") bucket.opponentPlaceCount += 1;
        if (record.pair.wideOutcome === "hit") bucket.wideHitCount += 1;
      }
    }
  }

  summary.honmei.winRate = pct(summary.honmei.winCount, summary.honmei.raceCount);
  summary.honmei.placeRate = pct(summary.honmei.placeCount, summary.honmei.raceCount);
  summary.honmei.tanRoi = roi(summary.honmei.tanRoi, summary.honmei.raceCount);
  summary.honmei.fukuRoi = roi(summary.honmei.fukuRoi, summary.honmei.raceCount);
  summary.opponent.placeRate = pct(summary.opponent.placeCount, summary.opponent.raceCount);
  summary.opponent.fukuRoi = roi(summary.opponent.fukuRoi, summary.opponent.raceCount);
  summary.pair.wideHitRate = pct(summary.pair.wideHitCount, summary.pair.raceCount);
  summary.pair.simultaneousPlaceRate = pct(summary.pair.simultaneousPlaceCount, summary.pair.raceCount);
  summary.pair.wideReturnRate = roi(summary.pair.wideReturnRate, summary.pair.raceCount);

  for (const bucket of [...rankGapBuckets, ...scoreGapBuckets]) {
    bucket.opponentPlaceRate = pct(bucket.opponentPlaceCount, bucket.raceCount);
    bucket.wideHitRate = pct(bucket.wideHitCount, bucket.raceCount);
  }

  return summary;
}

function getCurrentWeek(records: RaceReviewRecord[]) {
  const latest = records
    .map((record) => record.meta.weekOf)
    .filter((value): value is string => Boolean(value))
    .sort()
    .slice(-1)[0];
  return latest ?? null;
}

function filterScope(records: RaceReviewRecord[], scope: DiagnosticsAggregationScope) {
  if (scope === "all") return records;
  return records.filter((record) => record.snapshot?.predictionOrigin !== "backfill");
}

function hasNativeOpponent(record: RaceReviewRecord) {
  return record.compatibilityMode === "native_opponent" && Boolean(record.opponent);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = normalizeScope(searchParams.get("scope"));
    const [reviewRecordsByRaceId, diagnosticsContext] = await Promise.all([
      loadReviewRecords(),
      loadWeeklyDiagnosticsContext(scope),
    ]);

    const filteredRecords = filterScope(Object.values(reviewRecordsByRaceId), scope).sort((a, b) =>
      String(b.meta.scheduledStartTime ?? b.updatedAt).localeCompare(String(a.meta.scheduledStartTime ?? a.updatedAt))
    );
    const currentWeek = getCurrentWeek(filteredRecords);
    const weeklyRecords = filteredRecords.filter((record) => record.meta.weekOf === currentWeek);
    const totalPerf = accumulateWeeklyPerformance(filteredRecords);
    const weeklyPerf = accumulateWeeklyPerformance(weeklyRecords);
    const summary = buildSummary(filteredRecords.filter((record) => record.reviewReady || hasNativeOpponent(record) || record.honmei));
    const diagnostics = buildWeeklyDiagnostics(diagnosticsContext);

    return NextResponse.json({
      scope,
      performance: {
        weekly: {
          weekOf: currentWeek,
          ...weeklyPerf,
        },
        total: totalPerf,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
      reviewRecordsByRaceId,
      settlementsByRaceId: Object.fromEntries(
        filteredRecords.map((record) => [record.raceId, settlementBundle(record)])
      ),
      settlementsByCourseId: Object.fromEntries(
        filteredRecords.map((record) => [record.courseId, settlementBundle(record)])
      ),
      summary,
      diagnostics,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to load performance";
    return NextResponse.json(
      {
        scope: "all",
        performance: null,
        updatedAt: null,
        reviewRecordsByRaceId: {},
        settlementsByRaceId: {},
        settlementsByCourseId: {},
        summary: null,
        diagnostics: null,
        error: message,
      },
      { status: 500 }
    );
  }
}
