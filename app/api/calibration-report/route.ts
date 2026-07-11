import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { loadReviewRecords } from "@/lib/reviewRecords";
import { isLivePreRaceEligible } from "@/lib/sourceStatus";
import type { RaceReviewRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

const REPORT_PATH = path.join(process.cwd(), "data", "analysis", "calibration-report.json");

export type WeeklyTrendPoint = {
  weekOf: string;
  bets: number;
  tanRoi: number;
  fukuRoi: number;
  wideBets: number;
  wideRoi: number | null;
};

function roi(totalPayout: number, betCount: number): number {
  return betCount > 0 ? (totalPayout / (betCount * 100)) * 100 : 0;
}

/**
 * live_pre_race の確定済み本命を weekOf 単位に集計する。
 * ワイドは pair 決済が存在するレースのみ分母に含める (calibration-report と同じ扱い)。
 */
function buildWeeklyTrend(records: RaceReviewRecord[]): WeeklyTrendPoint[] {
  const byWeek = new Map<
    string,
    { bets: number; tanPayout: number; fukuPayout: number; wideBets: number; widePayout: number }
  >();

  for (const record of records) {
    if (!isLivePreRaceEligible(record.snapshot, record)) continue;
    const honmei = record.honmei;
    if (!honmei || honmei.settlementStatus !== "settled") continue;
    const weekOf = record.meta.weekOf;
    if (!weekOf) continue;

    const bucket =
      byWeek.get(weekOf) ?? { bets: 0, tanPayout: 0, fukuPayout: 0, wideBets: 0, widePayout: 0 };
    bucket.bets += 1;
    bucket.tanPayout += Number(honmei.tanPayout ?? 0);
    bucket.fukuPayout += Number(honmei.fukuPayout ?? 0);
    if (record.pair && record.pair.wideOutcome !== "not_settled") {
      bucket.wideBets += 1;
      bucket.widePayout += Number(record.pair.widePayout ?? 0);
    }
    byWeek.set(weekOf, bucket);
  }

  return Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekOf, bucket]) => ({
      weekOf,
      bets: bucket.bets,
      tanRoi: roi(bucket.tanPayout, bucket.bets),
      fukuRoi: roi(bucket.fukuPayout, bucket.bets),
      wideBets: bucket.wideBets,
      wideRoi: bucket.wideBets > 0 ? roi(bucket.widePayout, bucket.wideBets) : null,
    }));
}

export async function GET() {
  try {
    const [reportRaw, reviewRecordsByRaceId] = await Promise.all([
      fs.readFile(REPORT_PATH, "utf8"),
      loadReviewRecords(),
    ]);
    const report = JSON.parse(reportRaw.charCodeAt(0) === 0xfeff ? reportRaw.slice(1) : reportRaw) as Record<string, unknown>;
    const weeklyTrend = buildWeeklyTrend(Object.values(reviewRecordsByRaceId));

    return NextResponse.json({ report, weeklyTrend, updatedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to load calibration report";
    return NextResponse.json(
      { report: null, weeklyTrend: [], updatedAt: null, error: message },
      { status: 500 }
    );
  }
}
