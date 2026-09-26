"use client";

import { useEffect, useState } from "react";

type PerfBucket = {
  weekOf?: string;
  bets: number;
  tanHits: number;
  fukuHits: number;
  tanStake: number;
  tanPayout: number;
  fukuStake: number;
  fukuPayout: number;
};

type PerfPayload = {
  scope?: { version: string; sourceStatus: string; action: string; fieldComplete: boolean };
  performance: {
    weekly?: PerfBucket;
    total?: PerfBucket;
  } | null;
  lastSettledAt?: string | null;
};

function pct(numerator: number, denominator: number): string {
  if (!denominator) return "-";
  return ((numerator / denominator) * 100).toFixed(1);
}

export function PerformancePanel() {
  const [data, setData] = useState<PerfPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/performance/summary", { cache: "no-store" });
        const json = (await res.json()) as PerfPayload;
        if (!cancelled) setData(res.ok ? json : null);
      } catch {
        if (!cancelled) setData(null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const weekly = data?.performance?.weekly;
  const total = data?.performance?.total;
  const lastSettledAt = data?.lastSettledAt ?? null;
  const scope = data?.scope;

  return (
    <section className="rounded-[var(--r-lg)] border border-line bg-card p-6 ">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="t-label">TRACK RECORD</p>
          <h2 className="mt-1 text-2xl font-bold text-ink">単複おすすめ成績</h2>
        </div>
        <p className="text-xs text-ink-2">
          {lastSettledAt ? `最終決済: ${new Date(lastSettledAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}` : "集計前"}
        </p>
      </div>

      <p className="mb-3 text-xs text-ink-2">
        {scope ? `${scope.version} / ${scope.action === "win" ? "単勝勝負のみ" : scope.action} / ${scope.sourceStatus === "live_pre_race" ? "ライブ" : scope.sourceStatus} / 出走馬データ完全` : "集計範囲を読み込み中"}
      </p>

      {!weekly && !total && <p className="text-sm text-ink-2">まだ集計データがありません。</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[var(--r-md)] bg-paper-sunk p-4">
          <p className="text-sm font-bold text-ink">週次 {weekly?.weekOf ? `(${weekly.weekOf})` : ""}</p>
          {weekly?.bets ? <div className="mt-3 space-y-2 text-sm text-ink-2">
            <p>単: 的中率 {pct(weekly.tanHits, weekly.bets)}% / 回収率 {pct(weekly.tanPayout, weekly.tanStake)}%</p>
            <p>本命複勝 (参考): 的中率 {pct(weekly.fukuHits, weekly.bets)}% / 回収率 {pct(weekly.fukuPayout, weekly.fukuStake)}%</p>
          </div> : <p className="mt-3 text-sm text-ink-2">集計前</p>}
        </div>

        <div className="rounded-[var(--r-md)] bg-paper-sunk p-4">
          <p className="text-sm font-bold text-ink">累計</p>
          {total?.bets ? <div className="mt-3 space-y-2 text-sm text-ink-2">
            <p>単: 的中率 {pct(total.tanHits, total.bets)}% / 回収率 {pct(total.tanPayout, total.tanStake)}%</p>
            <p>本命複勝 (参考): 的中率 {pct(total.fukuHits, total.bets)}% / 回収率 {pct(total.fukuPayout, total.fukuStake)}%</p>
          </div> : <p className="mt-3 text-sm text-ink-2">集計前</p>}
        </div>
      </div>
    </section>
  );
}
