import { NextResponse } from "next/server";
import { loadReviewRecords } from "@/lib/reviewRecords";
import { normalizeRecommendedBetAction } from "@/lib/recommendedBetAction";
import { isLivePreRaceEligible, resolveReviewRecordSourceStatus } from "@/lib/sourceStatus";
import { TANPUKU_SCORING_VERSION } from "@/lib/tanpukuSelection.mjs";
import type { PredictionSnapshotSourceStatus, RaceReviewRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

type SourceFilter = PredictionSnapshotSourceStatus | "all";
type ActionFilter = "win" | "place" | "skip" | "all";
type Bucket = { bets: number; tanHits: number; fukuHits: number; tanStake: number; tanPayout: number; fukuStake: number; fukuPayout: number };

function emptyBucket(): Bucket {
  return { bets: 0, tanHits: 0, fukuHits: 0, tanStake: 0, tanPayout: 0, fukuStake: 0, fukuPayout: 0 };
}

function aggregate(records: RaceReviewRecord[]): Bucket {
  const bucket = emptyBucket();
  for (const record of records) {
    if (!record.honmei || record.honmei.settlementStatus !== "settled" || record.status !== "review_ready") continue;
    bucket.bets += 1;
    bucket.tanStake += 100;
    bucket.fukuStake += 100;
    if (record.honmei.tanOutcome === "hit") bucket.tanHits += 1;
    if (record.honmei.fukuOutcome === "hit") bucket.fukuHits += 1;
    bucket.tanPayout += Number(record.honmei.tanPayout ?? 0);
    bucket.fukuPayout += Number(record.honmei.fukuPayout ?? 0);
  }
  return bucket;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const version = params.get("version")?.trim() || TANPUKU_SCORING_VERSION;
  const sourceValue = params.get("sourceStatus") ?? "live_pre_race";
  const actionValue = params.get("action") ?? "win";
  if (!["all", "live_pre_race", "retrospective", "manual_snapshot", "unknown"].includes(sourceValue) ||
      !["all", "win", "place", "skip"].includes(actionValue)) {
    return NextResponse.json({ error: "invalid scope" }, { status: 400 });
  }
  const sourceStatus = sourceValue as SourceFilter;
  const action = actionValue as ActionFilter;
  try {
    const byRaceId = await loadReviewRecords();
    const scoped = Object.values(byRaceId).filter((record) =>
      !record.excludedReason && record.snapshot?.dataQuality?.fieldComplete !== false &&
      record.snapshot?.scoringVersion === version &&
      (sourceStatus === "all" || (sourceStatus === "live_pre_race"
        ? isLivePreRaceEligible(record.snapshot, record) && resolveReviewRecordSourceStatus(record) === "live_pre_race"
        : resolveReviewRecordSourceStatus(record) === sourceStatus)) &&
      (action === "all" || normalizeRecommendedBetAction(record.honmei?.recommendedBetAction) === action)
    );
    const latestWeek = scoped.map((record) => record.meta.weekOf).filter(Boolean).sort().at(-1) ?? null;
    const settled = scoped.filter((record) => record.status === "review_ready" && record.honmei?.settlementStatus === "settled");
    const lastSettledAt = settled.map((record) => record.payoutFetchedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
    return NextResponse.json({
      scope: { version, sourceStatus, action, fieldComplete: true },
      performance: { weekly: { weekOf: latestWeek, ...aggregate(settled.filter((record) => record.meta.weekOf === latestWeek)) }, total: aggregate(settled) },
      lastSettledAt,
    });
  } catch {
    return NextResponse.json({ error: "failed to load performance summary" }, { status: 500 });
  }
}
