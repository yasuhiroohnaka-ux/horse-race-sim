"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  GENERATED_ARCHIVED_RACES,
  GENERATED_COMPLETED_RACES,
  type GeneratedReviewRace,
} from "@/lib/generatedRaceSchedule";
import type { PredictionSnapshot } from "@/lib/types";

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
  classificationHint?: { classification: string; confidence: number; reason: string | null } | null;
};

type ReviewMeta = {
  status?: string;
  reviewReady?: boolean;
  compatibilityMode?: "native_opponent" | "legacy_value_candidate";
  missingReasons?: string[];
  missingReasonLabels?: string[];
  retryCount?: number;
  lastRetryAt?: string | null;
  nextRetryAt?: string | null;
  lastError?: string | null;
} | null;

type AggregateSummary = {
  counts: { targetRaceCount: number; readyCount: number; pendingCount: number; failedCount: number; legacyCount: number };
  honmei: { raceCount: number; winCount: number; placeCount: number; winRate: number; placeRate: number; tanRoi: number; fukuRoi: number };
  // Legacy fields kept for data compatibility — not displayed in UI
  opponent?: { raceCount: number; placeCount: number; placeRate: number; fukuRoi: number };
  pair?: {
    raceCount: number;
    wideHitCount: number;
    wideHitRate: number;
    wideReturnRate: number;
    simultaneousPlaceCount: number;
    simultaneousPlaceRate: number;
  };
  rankGapBuckets?: unknown[];
  scoreGapBuckets?: unknown[];
  classificationComparison?: {
    all: { raceCount: number; winRate: number; placeRate: number; tanRoi: number; fukuRoi: number };
    classified: { raceCount: number; winRate: number; placeRate: number; tanRoi: number; fukuRoi: number };
    excludeSkip: { raceCount: number; winRate: number; placeRate: number; tanRoi: number; fukuRoi: number };
    byClassification: { classification: string; raceCount: number; winRate: number; placeRate: number; tanRoi: number; fukuRoi: number }[];
    unclassifiedCount: number;
  };
};

type RecommendationSettlementBundle = {
  win: RecommendationSettlement | null;
  opponent?: RecommendationSettlement | null;
  wide?: RecommendationSettlement | null;
  value?: RecommendationSettlement | null;
  meta?: ReviewMeta;
};

type PerformanceLookupResponse = {
  settlementsByCourseId: Record<string, RecommendationSettlementBundle>;
  settlementsByRaceId: Record<string, RecommendationSettlementBundle>;
  summary: AggregateSummary | null;
};

type RepairResponse = {
  ok: boolean;
  error?: string;
};

type CardState = {
  key: "ready" | "retrying" | "retry_scheduled" | "partial" | "failed" | "discovered";
  label: string;
  tone: string;
  detail: string | null;
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
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function formatSettlementStatus(status: SettlementStatus) {
  if (status === "settled") return "確定";
  if (status === "pending_payouts") return "払戻待ち";
  return "結果待ち";
}

function formatOutcome(outcome: BetOutcome, kind: "tan" | "fuku") {
  if (outcome === "hit") return kind === "tan" ? "単勝 的中" : "複勝 的中";
  if (outcome === "miss") return kind === "tan" ? "単勝 不的中" : "複勝 不的中";
  if (outcome === "hit_missing_payout") return kind === "tan" ? "単勝 的中(払戻未取得)" : "複勝 的中(払戻未取得)";
  return "未確定";
}

function formatPayout(value: number) {
  return value > 0 ? `${Math.round(value)}円` : "-";
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

function StatusChip({ state }: { state: CardState }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${state.tone}`}>{state.label}</span>;
}

function hasMissingReason(meta: ReviewMeta, reason: string) {
  return Boolean(meta?.missingReasons?.includes(reason));
}

function getCardState(params: {
  snapshot?: PredictionSnapshot;
  settlement: RecommendationSettlementBundle | null;
  isRepairing: boolean;
}): CardState {
  const { snapshot, settlement, isRepairing } = params;
  const meta = settlement?.meta ?? null;
  const missingLabels = meta?.missingReasonLabels ?? [];
  const resultPending = hasMissingReason(meta, "UPSTREAM_NOT_READY");
  const payoutPending = hasMissingReason(meta, "UPSTREAM_PAYOUT_NOT_READY");
  const resultStale = hasMissingReason(meta, "NO_RESULT");
  const payoutIncomplete = hasMissingReason(meta, "NO_PAYOUT");
  const nextRetryAt = meta?.nextRetryAt ? `次回 ${formatTimestamp(meta.nextRetryAt)}` : null;
  const baseDetail = missingLabels.length > 0 ? missingLabels.join(" / ") : nextRetryAt;

  if (isRepairing) {
    return { key: "retrying", label: "再取得中", tone: "bg-sky-100 text-sky-700", detail: "不足項目を即時再取得しています。" };
  }
  if (meta?.reviewReady) {
    return { key: "ready", label: "完了", tone: "bg-emerald-100 text-emerald-700", detail: "本命候補の単勝・複勝が確定しています。" };
  }
  if (meta?.status === "review_failed") {
    return { key: "failed", label: "失敗", tone: "bg-rose-100 text-rose-700", detail: meta.lastError ?? baseDetail ?? "再試行上限に到達しました。" };
  }
  if (resultPending) {
    return { key: "retry_scheduled", label: "結果待ち", tone: "bg-sky-50 text-sky-700", detail: baseDetail ?? "結果 source の反映待ちです。" };
  }
  if (payoutPending) {
    return { key: "retry_scheduled", label: "払戻待ち", tone: "bg-cyan-50 text-cyan-700", detail: baseDetail ?? "払戻 source の反映待ちです。" };
  }
  if (resultStale) {
    return { key: "partial", label: "結果未反映", tone: "bg-amber-100 text-amber-800", detail: baseDetail ?? "source には結果がありますが review record に反映しきれていません。" };
  }
  if (payoutIncomplete) {
    return { key: "partial", label: "払戻不完全", tone: "bg-amber-100 text-amber-800", detail: baseDetail ?? "source に結果はありますが払戻の反映が不完全です。" };
  }
  if (meta?.status === "review_partial") {
    return { key: "partial", label: "一部のみ取得済み", tone: "bg-amber-100 text-amber-800", detail: baseDetail ?? "不足項目を補完中です。" };
  }
  if (meta?.status === "retry_scheduled" || meta?.nextRetryAt) {
    return { key: "retry_scheduled", label: "再取得待ち", tone: "bg-sky-50 text-sky-700", detail: baseDetail ?? "不足項目の再取得を予定しています。" };
  }
  if (snapshot || settlement?.win) {
    return { key: "partial", label: "一部のみ取得済み", tone: "bg-amber-100 text-amber-800", detail: baseDetail ?? "不足項目を補完中です。" };
  }
  return { key: "discovered", label: "対象認識済み", tone: "bg-slate-100 text-slate-700", detail: "review record を作成し、再取得待ちです。" };
}

function renderAggregateSummary(summary: AggregateSummary | null, counts: AggregateSummary["counts"]) {
  if (!summary) return null;

  const comp = summary.classificationComparison;
  let compNode = null;

  if (comp) {
    if (comp.classified.raceCount === 0) {
      compNode = (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
          classification付きデータがまだないため、分類別比較は今後のレースで表示されます。
          {comp.unclassifiedCount > 0 && `（未分類: ${comp.unclassifiedCount}件）`}
        </div>
      );
    } else {
      const rows = [
        { label: "全体", ...comp.all },
        { label: "分類済 (classified)", ...comp.classified },
        ...comp.byClassification.map((b) => ({ label: `判定: ${b.classification}`, ...b })),
        { label: "skip除外後 (win+place)", ...comp.excludeSkip },
      ];

      compNode = (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-slate-800">分類別比較 (classificationHint検証)</h3>
          {comp.unclassifiedCount > 0 && (
            <p className="mt-1 text-xs text-slate-500">※レガシーデータ（未分類） {comp.unclassifiedCount}件</p>
          )}
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">条件</th>
                  <th className="px-4 py-2 font-medium text-right">R数</th>
                  <th className="px-4 py-2 font-medium text-right">単勝率</th>
                  <th className="px-4 py-2 font-medium text-right">複勝率</th>
                  <th className="px-4 py-2 font-medium text-right">単回値</th>
                  <th className="px-4 py-2 font-medium text-right">複回値</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((r, i) => (
                  <tr key={i} className={r.label.startsWith("skip除外") ? "bg-amber-50" : "bg-white"}>
                    <td className="px-4 py-2 font-medium text-slate-700">{r.label}</td>
                    <td className="px-4 py-2 text-right">{r.raceCount}</td>
                    <td className="px-4 py-2 text-right">{r.winRate.toFixed(1)}%</td>
                    <td className="px-4 py-2 text-right">{r.placeRate.toFixed(1)}%</td>
                    <td className="px-4 py-2 text-right">{Math.round(r.tanRoi)}%</td>
                    <td className="px-4 py-2 text-right">{Math.round(r.fukuRoi)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">週次回顧サマリー</h2>
        <p className="mt-1 text-sm text-slate-500">本命候補を中心に単勝・複勝の成績を検証しています。</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryCard title="処理件数" tone="border-slate-200 bg-white text-slate-800">
          <SummaryMetric label="対象レース数" value={`${counts.targetRaceCount}R`} />
          <SummaryMetric label="ready件数" value={`${counts.readyCount}R`} />
          <SummaryMetric label="pending件数" value={`${counts.pendingCount}R`} />
          <SummaryMetric label="failed件数" value={`${counts.failedCount}R`} />
        </SummaryCard>
        <SummaryCard title="本命候補" tone="border-amber-200 bg-amber-50 text-amber-800">
          <SummaryMetric label="単勝率" value={formatRate(summary.honmei.winRate)} />
          <SummaryMetric label="複勝率" value={formatRate(summary.honmei.placeRate)} />
          <SummaryMetric label="単回収率" value={formatRate(summary.honmei.tanRoi)} />
          <SummaryMetric label="複回収率" value={formatRate(summary.honmei.fukuRoi)} />
        </SummaryCard>
      </div>
      {compNode}
    </section>
  );
}

function RepairButton({ raceId, busy, onReplay }: { raceId: string | null; busy: boolean; onReplay: () => Promise<void> }) {
  const handleClick = async () => {
    if (!raceId || busy) return;
    await onReplay();
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={!raceId || busy}
      className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? "再取得中..." : "Replay"}
    </button>
  );
}

function renderReviewCard(params: {
  race: ReviewCard;
  raceId: string | null;
  snapshot: PredictionSnapshot | undefined;
  settlement: RecommendationSettlementBundle | null;
  state: CardState;
  isRepairing: boolean;
  onRefresh: () => Promise<void>;
}) {
  const { race, raceId, snapshot, settlement, state, isRepairing, onRefresh } = params;
  const topRows = snapshot ? [...snapshot.rankedRows].sort((a, b) => a.rank - b.rank).slice(0, 3) : [];
  const resultText = race.result?.top3HorseNames?.length ? `1着 ${race.result?.top3HorseNames?.[0] ?? "-"} / 2着 ${race.result?.top3HorseNames?.[1] ?? "-"} / 3着 ${race.result?.top3HorseNames?.[2] ?? "-"}` : null;
  const meta = settlement?.meta ?? null;

  return (
    <article key={`${race.courseId}-${race.date}`} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{race.date} / {formatSurface(race.surface)} {race.distance}m / {race.grade}</p>
          <h3 className="mt-1 text-xl font-bold text-slate-900">{race.label}</h3>
          {resultText ? <p className="mt-2 text-sm text-slate-600">結果: {resultText}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusChip state={state} />
            {state.detail ? <span className="text-xs text-slate-500">{state.detail}</span> : null}
          </div>
          {meta?.missingReasonLabels?.length ? <p className="mt-2 text-xs text-slate-500">不足: {meta.missingReasonLabels.join(" / ")}</p> : null}
        </div>
        <RepairButton raceId={raceId} busy={isRepairing} onReplay={onRefresh} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-semibold text-slate-800">snapshot</p>
          {snapshot ? (
            <>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
                <span className="rounded-full bg-white px-3 py-1">取得 {formatTimestamp(snapshot.snapshotTakenAt ?? snapshot.capturedAt)}</span>
                <span className="rounded-full bg-sky-100 px-3 py-1">シミュ本命 {getSnapshotHorseDisplay(snapshot, snapshot.honmeiHorseId)}</span>
              </div>
              <div className="mt-3 space-y-2">
                {topRows.map((row) => (
                  <div key={`${row.rank}-${row.horseId}`} className="rounded-md border border-white bg-white px-3 py-3">
                    <p className="text-sm font-semibold text-slate-800">{row.rank}位 {row.horseName}</p>
                    <p className="mt-1 text-xs text-slate-500">win {row.winProb.toFixed(1)}% / real {row.realOdds?.toFixed(1) ?? "-"} / edge {row.edge.toFixed(1)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <SummaryMetric label="本命結果" value={getSnapshotFinishLabel(race, snapshot.honmeiHorseId)} />
              </div>
            </>
          ) : <p className="mt-2 text-sm text-slate-500">snapshot は未取得です。自動再取得または Replay で補完します。</p>}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-semibold text-slate-800">review record</p>
          <div className="mt-3">
            <div className="rounded-md border border-amber-100 bg-amber-50 px-3 py-3">
              <p className="text-xs font-semibold text-amber-800">本命候補</p>
              {settlement?.win ? (
                <div className="mt-2 space-y-2 text-sm text-slate-700">
                  <p className="font-semibold text-slate-800">{settlement.win.horseName} ({settlement.win.horseId})</p>
                  {settlement.win.classificationHint && (
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        settlement.win.classificationHint.classification === "win" ? "bg-orange-100 text-orange-800"
                          : settlement.win.classificationHint.classification === "place" ? "bg-blue-100 text-blue-800"
                          : "bg-slate-200 text-slate-600"
                      }`}>
                        {settlement.win.classificationHint.classification === "win" ? "単勝向き"
                          : settlement.win.classificationHint.classification === "place" ? "複勝向き"
                          : "見送り"}
                      </span>
                      {settlement.win.classificationHint.reason && (
                        <span className="text-[10px] text-slate-500">{settlement.win.classificationHint.reason}</span>
                      )}
                    </div>
                  )}
                  <SummaryMetric label="状態" value={formatSettlementStatus(settlement.win.settlementStatus)} />
                  <SummaryMetric label="単勝" value={formatOutcome(settlement.win.tanOutcome, "tan")} />
                  <SummaryMetric label="複勝" value={formatOutcome(settlement.win.fukuOutcome, "fuku")} />
                  <SummaryMetric label="単払戻" value={formatPayout(settlement.win.tanPayout)} />
                  <SummaryMetric label="複払戻" value={formatPayout(settlement.win.fukuPayout)} />
                </div>
              ) : <p className="mt-2 text-sm text-slate-500">本命候補は未取得です。自動再取得対象です。</p>}
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
  const [repairingRaceIds, setRepairingRaceIds] = useState<Record<string, boolean>>({});
  const autoRepairStartedRef = useRef(false);

  const generatedCards = useMemo<ReviewCard[]>(() => [
    ...GENERATED_COMPLETED_RACES.map((race) => ({ ...race, archived: false })),
    ...GENERATED_ARCHIVED_RACES.map((race) => ({ ...race, archived: true })),
  ], []);

  const load = async () => {
    const [snapshotRes, performanceRes] = await Promise.all([
      fetch("/api/prediction-snapshots", { cache: "no-store" }),
      fetch("/api/performance", { cache: "no-store" }),
    ]);
    const snapshotJson = (await snapshotRes.json()) as SnapshotLookupResponse;
    const performanceJson = (await performanceRes.json()) as PerformanceLookupResponse;
    setSnapshotsByRaceId(snapshotJson.snapshotsByRaceId ?? {});
    setSettlementsByRaceId(performanceJson.settlementsByRaceId ?? {});
    setSettlementsByCourseId(performanceJson.settlementsByCourseId ?? {});
    setAggregateSummary(performanceJson.summary ?? null);
  };

  useEffect(() => {
    void load().catch((error) => {
      console.warn("failed to load archive comparison data", error);
    });
  }, []);

  useEffect(() => {
    if (autoRepairStartedRef.current) return;
    autoRepairStartedRef.current = true;
    void fetch("/api/review-repair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ includeArchives: true }),
    })
      .then((response) => response.json() as Promise<RepairResponse>)
      .then(() => load())
      .catch((error) => {
        console.warn("failed to run archive auto-repair", error);
      });
  }, []);

  const derivedCounts = useMemo(() => {
    return generatedCards.reduce(
      (acc, race) => {
        const { raceId, courseId } = getRaceKey(race);
        const snapshot = raceId ? snapshotsByRaceId[raceId] : undefined;
        const settlement = (raceId ? settlementsByRaceId[raceId] : null) ?? settlementsByCourseId[courseId] ?? null;
        const state = getCardState({
          snapshot,
          settlement,
          isRepairing: Boolean(raceId && repairingRaceIds[raceId]),
        });

        acc.targetRaceCount += 1;
        if (state.key === "ready") acc.readyCount += 1;
        else if (state.key === "failed") acc.failedCount += 1;
        else acc.pendingCount += 1;
        return acc;
      },
      { targetRaceCount: 0, readyCount: 0, pendingCount: 0, failedCount: 0, legacyCount: aggregateSummary?.counts.legacyCount ?? 0 }
    );
  }, [aggregateSummary?.counts.legacyCount, generatedCards, repairingRaceIds, settlementsByCourseId, settlementsByRaceId, snapshotsByRaceId]);

  const refreshAfterReplay = async (raceId: string | null) => {
    if (!raceId) return;
    setRepairingRaceIds((prev) => ({ ...prev, [raceId]: true }));
    try {
      await fetch("/api/review-repair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raceId, includeArchives: true, forceRetryNow: true }),
      });
      await load();
    } finally {
      setRepairingRaceIds((prev) => ({ ...prev, [raceId]: false }));
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">回顧アーカイブ</h1>
          <p className="mt-2 text-sm text-slate-500">本命候補の単勝・複勝成績を中心に回顧します。不足項目は自動再取得します。</p>
        </div>

        {renderAggregateSummary(aggregateSummary, derivedCounts)}

        <section className="mt-10 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">個別カード</h2>
            <p className="mt-1 text-sm text-slate-500">各レースの本命候補の結果を確認できます。</p>
          </div>
          <div className="space-y-6">
            {generatedCards.map((race) => {
              const { raceId, courseId } = getRaceKey(race);
              const snapshot = raceId ? snapshotsByRaceId[raceId] : undefined;
              const settlement = (raceId ? settlementsByRaceId[raceId] : null) ?? settlementsByCourseId[courseId] ?? null;
              const state = getCardState({
                snapshot,
                settlement,
                isRepairing: Boolean(raceId && repairingRaceIds[raceId]),
              });
              return renderReviewCard({
                race,
                raceId,
                snapshot,
                settlement,
                state,
                isRepairing: Boolean(raceId && repairingRaceIds[raceId]),
                onRefresh: () => refreshAfterReplay(raceId),
              });
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
