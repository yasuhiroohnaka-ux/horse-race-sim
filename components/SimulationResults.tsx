"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Course, Horse, RaceCondition } from "@/lib/types";
import { buildRaceAnalysisRows } from "@/lib/raceAnalysis";
import { getFrameColor, getFrameNumber } from "@/lib/frameColor";

interface SimulationResultsProps {
  results: { horseId: string; winCount: number; bestTime: number }[];
  horses: Horse[];
  course: Course;
  condition: RaceCondition;
  onReset: () => void;
  onPostToX: () => void;
  onRunAgain: () => void;
  isRunning: boolean;
}

function getSignalTone(label: string): string {
  switch (label) {
    case "危険人気":
      return "text-red-600 bg-red-50";
    case "市場盲点":
    case "プロ先行妙味":
      return "text-emerald-700 bg-emerald-50";
    case "ガチ勢先行":
      return "text-amber-700 bg-amber-50";
    case "一般人気先行":
      return "text-blue-700 bg-blue-50";
    default:
      return "text-slate-600 bg-slate-100";
  }
}

export function SimulationResults({
  results,
  horses,
  course,
  condition,
  onReset,
  onPostToX,
  onRunAgain,
  isRunning,
}: SimulationResultsProps) {
  const rows = buildRaceAnalysisRows(results, horses, course, condition);
  const chartRows = rows.slice(0, Math.min(rows.length, 10)).map((row) => ({
    name: row.name.length > 8 ? `${row.name.slice(0, 8)}…` : row.name,
    fullName: row.name,
    試走: row.simWinRate,
    公式: row.officialImplied,
    ガチ勢: row.expertImplied,
  }));

  const strongest = rows[0];
  const riskyFavorite = [...rows]
    .filter((row) => row.officialRank <= Math.min(4, rows.length))
    .sort((a, b) => (b.officialImplied - b.simWinRate) - (a.officialImplied - a.simWinRate))[0];
  const valueHorse = [...rows]
    .sort(
      (a, b) =>
        (b.simWinRate - b.officialImplied + Math.max(0, b.marketExpertGap) * 0.6) -
        (a.simWinRate - a.officialImplied + Math.max(0, a.marketExpertGap) * 0.6)
    )[0];
  const disagreement = [...rows].sort((a, b) => Math.abs(b.marketExpertGap) - Math.abs(a.marketExpertGap))[0];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-slate-400">SIMULATION RESULT</p>
          <h2 className="text-lg font-bold text-slate-900">100回試走の結果</h2>
          <p className="mt-1 text-xs text-slate-500">
            青は試走勝率、濃紺は公式オッズの期待値、金はガチ勢換算オッズの期待値です。
          </p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {course.name}
        </div>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-[11px] font-semibold tracking-wide text-blue-500">勝ちやすい馬</p>
          <p className="mt-1 text-base font-bold text-slate-900">{strongest?.name ?? "-"}</p>
          <p className="mt-1 text-xs text-slate-600">試走 {strongest?.simWinRate?.toFixed(1) ?? "-"}% / フェア {strongest?.fairOdds?.toFixed(1) ?? "-"}倍</p>
        </div>
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
          <p className="text-[11px] font-semibold tracking-wide text-red-500">危険な人気馬</p>
          <p className="mt-1 text-base font-bold text-slate-900">{riskyFavorite?.name ?? "-"}</p>
          <p className="mt-1 text-xs text-slate-600">公式 {riskyFavorite?.officialImplied?.toFixed(1) ?? "-"}% に対し試走 {riskyFavorite?.simWinRate?.toFixed(1) ?? "-"}%</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-[11px] font-semibold tracking-wide text-emerald-600">妙味候補</p>
          <p className="mt-1 text-base font-bold text-slate-900">{valueHorse?.name ?? "-"}</p>
          <p className="mt-1 text-xs text-slate-600">試走 {valueHorse?.simWinRate?.toFixed(1) ?? "-"}% / 公式 {valueHorse?.officialOdds?.toFixed(1) ?? "-"}倍</p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <p className="text-[11px] font-semibold tracking-wide text-amber-600">公式 vs ガチ勢</p>
          <p className="mt-1 text-base font-bold text-slate-900">{disagreement?.name ?? "-"}</p>
          <p className="mt-1 text-xs text-slate-600">期待値差 {disagreement?.marketExpertGap?.toFixed(1) ?? "-"}pt</p>
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
          <span className="rounded-full bg-white px-3 py-1">馬場 {condition.groundCondition}</span>
          <span className="rounded-full bg-white px-3 py-1">天気 {condition.weather}</span>
          <span className="rounded-full bg-white px-3 py-1">風 {condition.windDirection} {condition.windSpeed}m/s</span>
          <span className="rounded-full bg-white px-3 py-1">展開 {condition.paceScenario}</span>
        </div>
        <div style={{ height: Math.max(320, chartRows.length * 42) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: "#e2e8f0" }}
                formatter={(value: number | string | undefined) => typeof value === "number" ? `${value.toFixed(1)}%` : value ?? "-"}
                labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName ?? label}
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 10px 15px -3px rgb(15 23 42 / 0.08)" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="試走" fill="#2563eb" radius={[0, 4, 4, 0]} />
              <Bar dataKey="公式" fill="#0f172a" radius={[0, 4, 4, 0]} />
              <Bar dataKey="ガチ勢" fill="#d97706" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1180px] w-full border-collapse text-xs">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50 text-slate-500">
              <th className="px-2 py-2 text-center">順位</th>
              <th className="px-2 py-2 text-center">馬番</th>
              <th className="px-2 py-2 text-left">馬名</th>
              <th className="px-2 py-2 text-right">能力</th>
              <th className="px-2 py-2 text-right">試走勝率</th>
              <th className="px-2 py-2 text-right">フェア</th>
              <th className="px-2 py-2 text-right">公式</th>
              <th className="px-2 py-2 text-right">ガチ勢</th>
              <th className="px-2 py-2 text-right">公式差</th>
              <th className="px-2 py-2 text-right">ガチ勢差</th>
              <th className="px-2 py-2 text-right">市場vsガチ勢</th>
              <th className="px-2 py-2 text-right">評判</th>
              <th className="px-2 py-2 text-center">判定</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const frameNo = getFrameNumber(row.gateNumber, horses.length);
              const frameColor = getFrameColor(frameNo);

              return (
                <tr key={row.horseId} className="border-b border-slate-100 hover:bg-slate-50/70">
                  <td className="px-2 py-2 text-center font-semibold text-slate-500">#{index + 1}</td>
                  <td className="px-2 py-2 text-center">
                    <span
                      className="inline-flex min-w-8 items-center justify-center rounded border px-2 py-1 font-bold"
                      style={{
                        backgroundColor: frameColor.bg,
                        color: frameColor.text,
                        borderColor: frameColor.border,
                      }}
                    >
                      {row.gateNumber}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="font-semibold text-slate-900">{row.name}</div>
                    <div className="text-[10px] text-slate-400">{row.jockey}</div>
                  </td>
                  <td className="px-2 py-2 text-right font-semibold text-slate-900">{row.abilityScore.toFixed(1)}</td>
                  <td className="px-2 py-2 text-right font-semibold text-blue-600">{row.simWinRate.toFixed(1)}%</td>
                  <td className="px-2 py-2 text-right text-slate-600">{row.fairOdds ? `${row.fairOdds.toFixed(1)}倍` : "-"}</td>
                  <td className="px-2 py-2 text-right">
                    <div className="font-medium text-slate-900">{row.officialOdds ? `${row.officialOdds.toFixed(1)}倍` : "-"}</div>
                    <div className="text-[10px] text-slate-400">{row.officialImplied.toFixed(1)}%</div>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <div className="font-medium text-amber-700">{row.expertOdds ? `${row.expertOdds.toFixed(1)}倍` : "-"}</div>
                    <div className="text-[10px] text-amber-500">{row.expertImplied.toFixed(1)}%</div>
                  </td>
                  <td className={`px-2 py-2 text-right font-semibold ${row.officialGap >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {row.officialGap >= 0 ? `+${row.officialGap.toFixed(1)}` : row.officialGap.toFixed(1)}pt
                  </td>
                  <td className={`px-2 py-2 text-right font-semibold ${row.expertGap >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {row.expertGap >= 0 ? `+${row.expertGap.toFixed(1)}` : row.expertGap.toFixed(1)}pt
                  </td>
                  <td className={`px-2 py-2 text-right font-semibold ${row.marketExpertGap >= 0 ? "text-amber-600" : "text-blue-600"}`}>
                    {row.marketExpertGap >= 0 ? `+${row.marketExpertGap.toFixed(1)}` : row.marketExpertGap.toFixed(1)}pt
                  </td>
                  <td className="px-2 py-2 text-right text-slate-600">{row.buzzShare.toFixed(1)}%</td>
                  <td className="px-2 py-2 text-center">
                    <span className={`inline-flex rounded-full px-3 py-1 font-semibold ${getSignalTone(row.signalLabel)}`}>
                      {row.signalLabel}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button
          onClick={onReset}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          条件を見直す
        </button>
        <button
          onClick={onRunAgain}
          disabled={isRunning}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {isRunning ? "再試走中..." : "もう一度100回試走"}
        </button>
        <button
          onClick={onPostToX}
          className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          分析をXに投稿
        </button>
      </div>
    </div>
  );
}

