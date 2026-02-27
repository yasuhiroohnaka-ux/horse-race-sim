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
    load();
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
    <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6 mb-4">
      <h2 className="text-lg font-bold text-slate-800 mb-2">単複おすすめ 成績</h2>
      <p className="text-xs text-slate-500 mb-4">
        日曜16時に週次集計。毎週積算で更新。
        {updatedAt ? ` 最終更新: ${new Date(updatedAt).toLocaleString("ja-JP")}` : ""}
      </p>
      {!weekly && !total && <p className="text-sm text-slate-500">まだ集計データがありません。</p>}
      {weekly && (
        <div className="mb-4">
          <p className="text-sm font-bold text-slate-700">週次 ({weekly.weekOf ?? "-"})</p>
          <p className="text-sm text-slate-600">
            単: 的中率 {pct(weekly.tanHits, weekly.bets)}% / 回収率 {pct(weekly.tanPayout, weekly.tanStake)}%
          </p>
          <p className="text-sm text-slate-600">
            複: 的中率 {pct(weekly.fukuHits, weekly.bets)}% / 回収率 {pct(weekly.fukuPayout, weekly.fukuStake)}%
          </p>
        </div>
      )}
      {total && (
        <div>
          <p className="text-sm font-bold text-slate-700">累計</p>
          <p className="text-sm text-slate-600">
            単: 的中率 {pct(total.tanHits, total.bets)}% / 回収率 {pct(total.tanPayout, total.tanStake)}%
          </p>
          <p className="text-sm text-slate-600">
            複: 的中率 {pct(total.fukuHits, total.bets)}% / 回収率 {pct(total.fukuPayout, total.fukuStake)}%
          </p>
        </div>
      )}
    </div>
  );
}

