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
  performance: {
    weekly?: PerfBucket;
    total?: PerfBucket;
    updatedAt?: string;
  } | null;
  updatedAt?: string | null;
};

function pct(numerator: number, denominator: number): string {
  if (!denominator) return "0.0";
  return ((numerator / denominator) * 100).toFixed(1);
}

export function PerformancePanel() {
  const [data, setData] = useState<PerfPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/performance", { cache: "no-store" });
        const json = (await res.json()) as PerfPayload;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      }
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const weekly = data?.performance?.weekly;
  const total = data?.performance?.total;
  const updatedAt = data?.performance?.updatedAt || data?.updatedAt || null;

  return (
    <section className="rounded-[var(--r-lg)] border border-line bg-card p-6 ">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="t-label">TRACK RECORD</p>
          <h2 className="mt-1 text-2xl font-bold text-ink">単複おすすめ成績</h2>
        </div>
        <p className="text-xs text-ink-2">
          {updatedAt ? `最終更新: ${new Date(updatedAt).toLocaleString("ja-JP")}` : "毎週更新"}
        </p>
      </div>

      {!weekly && !total && <p className="text-sm text-ink-2">まだ集計データがありません。</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[var(--r-md)] bg-paper-sunk p-4">
          <p className="text-sm font-bold text-ink">週次 {weekly?.weekOf ? `(${weekly.weekOf})` : ""}</p>
          <div className="mt-3 space-y-2 text-sm text-ink-2">
            <p>単: 的中率 {pct(weekly?.tanHits ?? 0, weekly?.bets ?? 0)}% / 回収率 {pct(weekly?.tanPayout ?? 0, weekly?.tanStake ?? 0)}%</p>
            <p>複: 的中率 {pct(weekly?.fukuHits ?? 0, weekly?.bets ?? 0)}% / 回収率 {pct(weekly?.fukuPayout ?? 0, weekly?.fukuStake ?? 0)}%</p>
          </div>
        </div>

        <div className="rounded-[var(--r-md)] bg-paper-sunk p-4">
          <p className="text-sm font-bold text-ink">累計</p>
          <div className="mt-3 space-y-2 text-sm text-ink-2">
            <p>単: 的中率 {pct(total?.tanHits ?? 0, total?.bets ?? 0)}% / 回収率 {pct(total?.tanPayout ?? 0, total?.tanStake ?? 0)}%</p>
            <p>複: 的中率 {pct(total?.fukuHits ?? 0, total?.bets ?? 0)}% / 回収率 {pct(total?.fukuPayout ?? 0, total?.fukuStake ?? 0)}%</p>
          </div>
        </div>
      </div>
    </section>
  );
}
