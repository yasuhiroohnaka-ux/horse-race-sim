"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  GENERATED_ARCHIVED_RACES,
  GENERATED_COMPLETED_RACES,
  type GeneratedReviewRace,
} from "@/lib/generatedRaceSchedule";
import type { PredictionSnapshot, WeeklyDiagnosticsWideStats } from "@/lib/types";

type ReviewCard = GeneratedReviewRace & { archived?: boolean };

type SnapshotLookupResponse = {
  ok: boolean;
  snapshotsByRaceId: Record<string, PredictionSnapshot>;
};

type SettlementStatus = "pending_result" | "pending_payouts" | "settled";
type BetOutcome = "not_settled" | "hit" | "miss" | "hit_missing_payout";
type PayoutSource = "official" | "missing";

type RecommendationSettlement = {
  horseId: string;
  horseName: string;
  postedAt: string | null;
  settlementStatus: SettlementStatus;
  tanOutcome: BetOutcome;
  fukuOutcome: BetOutcome;
  tanPayout: number;
  fukuPayout: number;
  tanPayoutSource: PayoutSource;
  fukuPayoutSource: PayoutSource;
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

type AggregateSummary = {
  counts: { targetRaceCount: number; readyCount: number; pendingCount: number; failedCount: number; legacyCount: number };
  honmei: { raceCount: number; winCount: number; placeCount: number; winRate: number; placeRate: number; tanRoi: number; fukuRoi: number };
  opponent: { raceCount: number; placeCount: number; placeRate: number; fukuRoi: number };
  pair: {
    raceCount: number;
    wideHitCount: number;
    wideHitRate: number;
    wideReturnRate: number;
    simultaneousPlaceCount: number;
    simultaneousPlaceRate: number;
  };
  rankGapBuckets: Array<{ label: string; raceCount: number; opponentPlaceRate: number; wideHitCount: number; wideHitRate: number }>;
  scoreGapBuckets: Array<{ label: string; raceCount: number; opponentPlaceRate: number; wideHitCount: number; wideHitRate: number }>;
};

type RecommendationSettlementBundle = {
  win: RecommendationSettlement | null;
  opponent?: RecommendationSettlement | null;
  wide?: RecommendationSettlement | null;
  value?: RecommendationSettlement | null;
  meta?: { status?: string; reviewReady?: boolean; compatibilityMode?: "native_opponent" | "legacy_value_candidate" } | null;
};

type PerformanceLookupResponse = {
  settlementsByCourseId: Record<string, RecommendationSettlementBundle>;
  settlementsByRaceId: Record<string, RecommendationSettlementBundle>;
  summary: AggregateSummary | null;
  diagnostics?: { wideStats: WeeklyDiagnosticsWideStats } | null;
};

function formatSurface(surface: "Turf" | "Dirt") {
  return surface === "Dirt" ? "ダート" : "芝";
}

function formatRate(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatTimestamp(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(parsed);
}

function formatSettlementStatus(status: SettlementStatus) {
  if (status === "settled") return "精算済み";
  if (status === "pending_payouts") return "払戻待ち";
  return "結果待ち";
}

function formatOutcome(outcome: BetOutcome, kind: "tan" | "fuku") {
  if (outcome === "hit") return kind === "tan" ? "単勝的中" : "複勝的中";
  if (outcome === "miss") return kind === "tan" ? "単勝不的中" : "複勝圏外";
  if (outcome === "hit_missing_payout") return kind === "tan" ? "単勝的中(払戻未取得)" : "複勝的中(払戻未取得)";
  return "未精算";
}

function formatPayout(value: number) {
  return value > 0 ? `${Math.round(value)}円` : "-";
}

function formatPayoutSource(source: PayoutSource) {
  return source === "official" ? "公式" : "未取得";
}

function getRaceKey(race: ReviewCard) {
  const raceId = String(race.raceId ?? "").trim();
  if (raceId) return { raceId, courseId: String(race.courseId ?? "") };
  const courseId = String(race.courseId ?? "");
  const match = courseId.match(/(\d{12})$/);
  return { raceId: match?.[1] ?? null, courseId };
}

function getHorseNameFromSnapshot(snapshot: PredictionSnapshot | undefined, horseId?: string | null) {
  if (!snapshot || !horseId) return "";
  return snapshot.rankedRows.find((row) => row.horseId === horseId)?.horseName ?? "";
}

function getSnapshotHorseDisplay(snapshot: PredictionSnapshot | undefined, horseId?: string | null) {
  if (!horseId) return "-";
  const name = getHorseNameFromSnapshot(snapshot, horseId);
  return name ? `${name} (${horseId})` : String(horseId);
}

function getSnapshotFinishLabel(race: ReviewCard, horseId?: string | null) {
  if (!horseId) return "対象なし";
  const winnerHorseId = String(race.result?.winnerHorseId ?? "");
  const top3 = race.result?.top3HorseIds?.map((id) => String(id)) ?? [];
  if (!winnerHorseId && top3.length === 0) return "結果待ち";
  if (winnerHorseId === horseId) return "1着";
  if (top3.includes(horseId)) return "3着内";
  return "圏外";
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-500">{label}</span><span className="font-semibold text-slate-800">{value}</span></div>;
}

function SummaryCard({ title, tone, children }: { title: string; tone: string; children: React.ReactNode }) {
  return <div className={`rounded-lg border px-4 py-4 ${tone}`}><p className="text-sm font-bold">{title}</p><div className="mt-3 space-y-2">{children}</div></div>;
}

function renderAggregateSummary(summary: AggregateSummary | null) {
  if (!summary) return null;
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">週次回顧サマリー</h2>
        <p className="mt-1 text-sm text-slate-500">review_ready の review record だけを対象に、本命候補と相手候補の成績を確認します。</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryCard title="処理状況" tone="border-slate-200 bg-white text-slate-800">
          <SummaryMetric label="対象レース数" value={`${summary.counts.targetRaceCount}R`} />
          <SummaryMetric label="ready件数" value={`${summary.counts.readyCount}R`} />
          <SummaryMetric label="pending件数" value={`${summary.counts.pendingCount}R`} />
          <SummaryMetric label="failed件数" value={`${summary.counts.failedCount}R`} />
        </SummaryCard>
        <SummaryCard title="本命候補" tone="border-amber-200 bg-amber-50 text-amber-800">
          <SummaryMetric label="単勝率" value={formatRate(summary.honmei.winRate)} />
          <SummaryMetric label="複勝率" value={formatRate(summary.honmei.placeRate)} />
          <SummaryMetric label="単回収率" value={formatRate(summary.honmei.tanRoi)} />
          <SummaryMetric label="複回収率" value={formatRate(summary.honmei.fukuRoi)} />
        </SummaryCard>
        <SummaryCard title="相手候補" tone="border-emerald-200 bg-emerald-50 text-emerald-800">
          <SummaryMetric label="対象レース数" value={`${summary.opponent.raceCount}R`} />
          <SummaryMetric label="複勝率" value={formatRate(summary.opponent.placeRate)} />
          <SummaryMetric label="複回収率" value={formatRate(summary.opponent.fukuRoi)} />
        </SummaryCard>
        <SummaryCard title="本命-相手ペア" tone="border-violet-200 bg-violet-50 text-violet-800">
          <SummaryMetric label="ワイド的中率" value={formatRate(summary.pair.wideHitRate)} />
          <SummaryMetric label="ワイド回収率" value={formatRate(summary.pair.wideReturnRate)} />
          <SummaryMetric label="同時好走率" value={formatRate(summary.pair.simultaneousPlaceRate)} />
        </SummaryCard>
      </div>
    </section>
  );
}

function renderWideStatsSummary(wideStats: WeeklyDiagnosticsWideStats | null) {
  if (!wideStats) return null;
  const pair = wideStats.tanpukuHonmeiValueCandidate;
  const box = wideStats.simHonmeiTanpukuHonmeiValueCandidateBox;
  return (
    <section className="mt-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">ワイド検証</h2>
        <p className="mt-1 text-sm text-slate-500">本命候補とワイド高配当狙いのワイド成績を補助的に確認します。</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryCard title="本命候補 × ワイド高配当狙い" tone="border-cyan-200 bg-cyan-50 text-cyan-900">
          <SummaryMetric label="対象レース数" value={`${pair.targetRaceCount}R`} />
          <SummaryMetric label="ワイド高配当狙いあり" value={`${pair.valueCandidateRaceCount}R`} />
          <SummaryMetric label="的中率" value={formatRate(pair.hitRate)} />
          <SummaryMetric label="回収率" value={formatRate(pair.returnRate)} />
        </SummaryCard>
        <SummaryCard title="シミュ本命 / 本命候補 / ワイド高配当狙い BOX" tone="border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900">
          <SummaryMetric label="対象レース数" value={`${box.targetRaceCount}R`} />
          <SummaryMetric label="的中率" value={formatRate(box.hitRate)} />
          <SummaryMetric label="回収率" value={formatRate(box.returnRate)} />
        </SummaryCard>
      </div>
    </section>
  );
}

function renderReviewCard(race: ReviewCard, snapshot: PredictionSnapshot | undefined, settlement: RecommendationSettlementBundle | null) {
  const opponent =
    settlement?.opponent ??
    (settlement?.meta?.compatibilityMode === "legacy_value_candidate" ? settlement?.value ?? null : null);
  const opponentHorseId = snapshot?.opponentHorseId ?? null;
  const wideHorseId = snapshot?.valueHorseId ?? null;
  const topRows = snapshot ? [...snapshot.rankedRows].sort((a, b) => a.rank - b.rank).slice(0, 3) : [];
  const resultText = race.result?.top3HorseNames?.length ? `1着 ${race.result?.top3HorseNames?.[0] ?? "-"} / 2着 ${race.result?.top3HorseNames?.[1] ?? "-"} / 3着 ${race.result?.top3HorseNames?.[2] ?? "-"}` : null;

  return (
    <article key={`${race.courseId}-${race.date}`} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{race.date} / {formatSurface(race.surface)} {race.distance}m / {race.grade}</p>
          <h3 className="mt-1 text-xl font-bold text-slate-900">{race.label}</h3>
          {resultText ? <p className="mt-2 text-sm text-slate-600">結果: {resultText}</p> : null}
        </div>
        <Link href={`/sim?course=${encodeURIComponent(race.courseId)}`} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900">Replay</Link>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-semibold text-slate-800">snapshot</p>
          {snapshot ? (
            <>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
                <span className="rounded-full bg-white px-3 py-1">取得 {formatTimestamp(snapshot.snapshotTakenAt ?? snapshot.capturedAt)}</span>
                <span className="rounded-full bg-sky-100 px-3 py-1">シミュ本命 {getSnapshotHorseDisplay(snapshot, snapshot.honmeiHorseId)}</span>
                <span className="rounded-full bg-emerald-100 px-3 py-1">相手候補 {getSnapshotHorseDisplay(snapshot, opponentHorseId)}</span>
                {wideHorseId ? <span className="rounded-full bg-rose-100 px-3 py-1">ワイド高配当狙い {getSnapshotHorseDisplay(snapshot, wideHorseId)}</span> : null}
              </div>
              <div className="mt-3 space-y-2">
                {topRows.map((row) => (
                  <div key={`${row.rank}-${row.horseId}`} className="rounded-md border border-white bg-white px-3 py-3">
                    <p className="text-sm font-semibold text-slate-800">{row.rank}位 {row.horseName}</p>
                    <p className="mt-1 text-xs text-slate-500">win {row.winProb.toFixed(1)}% / real {row.realOdds?.toFixed(1) ?? "-"} / edge {row.edge.toFixed(1)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <SummaryMetric label="本命結果" value={getSnapshotFinishLabel(race, snapshot.honmeiHorseId)} />
                <SummaryMetric label="相手結果" value={getSnapshotFinishLabel(race, opponentHorseId)} />
              </div>
            </>
          ) : <p className="mt-2 text-sm text-slate-500">このレースの snapshot はありません。</p>}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-semibold text-slate-800">review record</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-amber-100 bg-amber-50 px-3 py-3">
              <p className="text-xs font-semibold text-amber-800">本命候補</p>
              {settlement?.win ? (
                <div className="mt-2 space-y-2 text-sm text-slate-700">
                  <p className="font-semibold text-slate-800">{settlement.win.horseName} ({settlement.win.horseId})</p>
                  <SummaryMetric label="精算状態" value={formatSettlementStatus(settlement.win.settlementStatus)} />
                  <SummaryMetric label="単勝" value={formatOutcome(settlement.win.tanOutcome, "tan")} />
                  <SummaryMetric label="複勝" value={formatOutcome(settlement.win.fukuOutcome, "fuku")} />
                  <SummaryMetric label="単勝払戻" value={formatPayout(settlement.win.tanPayout)} />
                  <SummaryMetric label="複勝払戻" value={formatPayout(settlement.win.fukuPayout)} />
                </div>
              ) : <p className="mt-2 text-sm text-slate-500">本命候補は未取得です。</p>}
            </div>
            <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-3">
              <p className="text-xs font-semibold text-emerald-800">相手候補</p>
              {opponent ? (
                <div className="mt-2 space-y-2 text-sm text-slate-700">
                  <p className="font-semibold text-slate-800">{opponent.horseName} ({opponent.horseId})</p>
                  <SummaryMetric label="精算状態" value={formatSettlementStatus(opponent.settlementStatus)} />
                  <SummaryMetric label="複勝" value={formatOutcome(opponent.fukuOutcome, "fuku")} />
                  <SummaryMetric label="複勝払戻" value={formatPayout(opponent.fukuPayout)} />
                  <SummaryMetric label="複勝払戻元" value={formatPayoutSource(opponent.fukuPayoutSource)} />
                </div>
              ) : <p className="mt-2 text-sm text-slate-500">相手候補は未取得です。</p>}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function ArchivePage() {
  const [snapshotsByRaceId, setSnapshotsByRaceId] = useState<Record<string, PredictionSnapshot>>({});
  const [settlementsByRaceId, setSettlementsByRaceId] = useState<Record<string, RecommendationSettlementBundle>>({});
  const [settlementsByCourseId, setSettlementsByCourseId] = useState<Record<string, RecommendationSettlementBundle>>({});
  const [aggregateSummary, setAggregateSummary] = useState<AggregateSummary | null>(null);
  const [wideStats, setWideStats] = useState<WeeklyDiagnosticsWideStats | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const [snapshotRes, performanceRes] = await Promise.all([fetch("/api/prediction-snapshots", { cache: "no-store" }), fetch("/api/performance", { cache: "no-store" })]);
        const snapshotJson = (await snapshotRes.json()) as SnapshotLookupResponse;
        const performanceJson = (await performanceRes.json()) as PerformanceLookupResponse;
        if (!isMounted) return;
        setSnapshotsByRaceId(snapshotJson.snapshotsByRaceId ?? {});
        setSettlementsByRaceId(performanceJson.settlementsByRaceId ?? {});
        setSettlementsByCourseId(performanceJson.settlementsByCourseId ?? {});
        setAggregateSummary(performanceJson.summary ?? null);
        setWideStats(performanceJson.diagnostics?.wideStats ?? null);
      } catch (error) {
        console.warn("failed to load archive comparison data", error);
      }
    }
    void load();
    return () => { isMounted = false; };
  }, []);

  const generatedCards = useMemo<ReviewCard[]>(() => [
    ...GENERATED_COMPLETED_RACES.map((race) => ({ ...race, archived: false })),
    ...GENERATED_ARCHIVED_RACES.map((race) => ({ ...race, archived: true })),
  ], []);

  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">回顧アーカイブ</h1>
          <p className="mt-2 text-sm text-slate-500">保存済み snapshot と review record を並べて見比べ、本命候補と相手候補がどう機能したかを確認できます。</p>
        </div>

        {renderAggregateSummary(aggregateSummary)}
        {renderWideStatsSummary(wideStats)}

        <section className="mt-10 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">現行データ回顧</h2>
            <p className="mt-1 text-sm text-slate-500">保存済み snapshot と結果、review record をまとめて確認できます。</p>
          </div>
          <div className="space-y-6">
            {generatedCards.map((race) => {
              const { raceId, courseId } = getRaceKey(race);
              const snapshot = raceId ? snapshotsByRaceId[raceId] : undefined;
              const settlement = (raceId ? settlementsByRaceId[raceId] : null) ?? settlementsByCourseId[courseId] ?? null;
              return renderReviewCard(race, snapshot, settlement);
            })}
          </div>
        </section>

        <section className="mt-10 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          旧データ期間は互換表示を簡略化しています。新UIの主軸は、相手候補を持つ新しい review record です。
        </section>
      </div>
    </main>
  );
}
