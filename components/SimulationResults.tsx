"use client";

import { Horse, RaceResult } from "@/lib/types";
import { calculateCrowdWinRate } from "@/lib/simulation";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SimulationResultsProps {
    results: { horseId: string; winCount: number; bestTime: number }[];
    horses: Horse[];
    onReset: () => void;
    onPostToX: () => void;
    onRunAgain: () => void;
    isRunning: boolean;
    hashtag?: string;
}

export function SimulationResults({ results, horses, onReset, onPostToX, onRunAgain, isRunning, hashtag = '#競馬' }: SimulationResultsProps) {
    // 集合知勝率（predictionCount の割合）を物理シミュとは独立して計算
    const crowdWinMap = calculateCrowdWinRate(horses);

    // Merge results with horse names
    const data = results.map(r => {
        const horse = horses.find(h => h.id === r.horseId);
        const physWin = r.winCount;
        const crowdWin = crowdWinMap.get(r.horseId) ?? 0;
        const diff = physWin - crowdWin; // 正=物理優位 / 負=世論優位
        return {
            name: horse ? horse.name : "Unknown",
            wins: physWin,
            crowdWin,
            diff,
            bestTime: r.bestTime.toFixed(1) + "s",
            odds: horse?.simulatedOdds?.toFixed(1) || "-",
            horse: horse
        };
    });

    // X 人気ランキング（predictionCount 降順、0票は除外）
    const popularityRanking = [...horses]
        .sort((a, b) => b.predictionCount - a.predictionCount)
        .filter(h => h.predictionCount > 0);
    const maxCount = popularityRanking[0]?.predictionCount ?? 1;

    // X 人気ランキング 投稿ハンドラ
    const handlePostRankingToX = () => {
        const top5 = popularityRanking.slice(0, 5);
        let text = "【X競馬予想 人気ランキング】\n";
        top5.forEach((h, i) => {
            const physResult = results.find(r => r.horseId === h.id);
            const irrational = (physResult?.winCount ?? 0) === 0 && h.predictionCount >= 10;
            text += `#${i + 1} ${h.name} ${h.predictionCount}pt${irrational ? " ⚠️" : ""}\n`;
        });
        text += `\n#競馬 ${hashtag} #集合知`;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
    };

    return (
        <div className="bg-white p-4 rounded-lg shadow-md border border-slate-200 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-sm font-bold mb-1 text-slate-800">3. シミュレーション結果 (100回実行)</h2>
            <p className="text-xs text-slate-400 mb-4">
                <span className="inline-block w-3 h-3 rounded-sm bg-blue-500 mr-1 align-middle"></span>物理エンジン（能力値のみ）
                <span className="inline-block w-3 h-3 rounded-sm bg-purple-400 mr-1 align-middle"></span>集合知（予想票の割合）
            </p>

            <div className="flex gap-4 mb-6" style={{ height: Math.max(320, data.length * 40) }}>
                {/* バーチャート */}
                <div className="flex-1 min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                            <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: 12 }}
                                cursor={{ fill: '#f1f5f9' }}
                            />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="wins" fill="#3b82f6" radius={[0, 4, 4, 0]} name="物理%" />
                            <Bar dataKey="crowdWin" fill="#a855f7" radius={[0, 4, 4, 0]} name="集合知%" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* X 人気ランキング サイドパネル */}
                <div className="w-52 shrink-0 bg-slate-50 rounded-lg p-3 flex flex-col">
                    <h3 className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1 shrink-0">
                        <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current shrink-0"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                        人気ランキング
                    </h3>
                    <div className="flex-1 overflow-y-auto">
                        {popularityRanking.length === 0 && (
                            <p className="text-xs text-slate-400">予想票なし</p>
                        )}
                        {popularityRanking.map((h, i) => {
                            // 物理シミュ結果と突合して非合理人気を検出
                            const physResult = results.find(r => r.horseId === h.id);
                            const isIrrational = (physResult?.winCount ?? 0) === 0 && h.predictionCount >= 10;
                            return (
                                <div key={h.id} className="mb-2.5">
                                    <div className="flex justify-between items-baseline mb-0.5">
                                        <span className="text-[10px] text-slate-400">#{i + 1}</span>
                                        <span className="text-[10px] font-bold text-purple-600">{h.predictionCount}pt</span>
                                    </div>
                                    <div className="flex items-center gap-1 mb-0.5">
                                        <span className="text-xs font-medium text-slate-800 truncate leading-tight">{h.name}</span>
                                        {isIrrational && (
                                            <span
                                                className="text-[9px] font-bold text-orange-500 shrink-0 cursor-help"
                                                title="物理エンジン勝率0%。集合知スコアに対して能力値が伴っていない可能性。"
                                            >⚠️</span>
                                        )}
                                    </div>
                                    <div className="h-1.5 bg-purple-100 rounded-full">
                                        <div
                                            className="h-1.5 bg-purple-400 rounded-full transition-all"
                                            style={{ width: `${(h.predictionCount / maxCount) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <button
                        onClick={handlePostRankingToX}
                        className="mt-2 shrink-0 w-full flex items-center justify-center gap-1 px-2 py-1.5 bg-black text-white text-[10px] font-bold rounded-md hover:bg-slate-800 transition"
                    >
                        <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current shrink-0"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                        投稿
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto -mx-6 px-6 mb-6">
                <table className="w-full text-xs text-left border-collapse" style={{ minWidth: '700px' }}>
                    <thead className="bg-slate-50 text-slate-500">
                        <tr className="border-y border-slate-200">
                            <th className="px-2 py-1.5 text-center w-10">順位</th>
                            <th className="px-2 py-1.5 text-center w-10">馬番</th>
                            <th className="px-2 py-1.5 text-left" style={{ minWidth: '100px' }}>馬名</th>
                            <th className="px-2 py-1.5 text-left w-16">騎手</th>
                            <th className="px-2 py-1.5 text-right text-blue-600 w-12">物理%</th>
                            <th className="px-2 py-1.5 text-right text-purple-600 w-12">集合知%</th>
                            <th className="px-2 py-1.5 text-center w-14">
                                <div className="leading-tight">
                                    <span className="text-blue-600">物理</span>
                                    <span className="text-slate-300">−</span>
                                    <span className="text-purple-600">世論</span>
                                </div>
                            </th>
                            <th className="px-2 py-1.5 text-right w-14">市場</th>
                            <th className="px-2 py-1.5 text-center w-16">
                                <div className="leading-tight">市場の<br/>評価</div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, index) => {
                            // 物理 vs 集合知 の差分
                            const physVsCrowd = row.diff; // 正=物理優位 / 負=世論優位
                            const physVsCrowdColor =
                                physVsCrowd > 10 ? "text-orange-600" :
                                physVsCrowd < -10 ? "text-purple-600" : "text-slate-400";

                            // 市場の評価（物理勝率 vs 市場オッズ）
                            const realOdds = row.horse?.realOdds || 0;
                            let marketLabel = "妥当";
                            let marketColor = "text-slate-400";
                            if (row.wins > 0 && realOdds > 0) {
                                const physImpliedOdds = 100 / row.wins;
                                const ratio = realOdds / physImpliedOdds;
                                if (ratio > 1.5) { marketLabel = "過小"; marketColor = "text-red-600"; }
                                else if (ratio < 0.5) { marketLabel = "過大"; marketColor = "text-blue-500"; }
                            } else if (row.wins === 0 && realOdds > 0 && realOdds < 30) {
                                marketLabel = "過大"; marketColor = "text-blue-500";
                            }

                            return (
                                <tr key={index} className="border-b border-slate-100 hover:bg-slate-50/50">
                                    <td className="px-2 py-1.5 text-center font-bold text-slate-500">#{index + 1}</td>
                                    <td className="px-2 py-1.5 text-center text-slate-400 font-mono">{row.horse?.gateNumber}</td>
                                    <td className="px-2 py-1.5 font-bold text-slate-800 whitespace-nowrap">{row.name}</td>
                                    <td className="px-2 py-1.5 text-slate-400 truncate">{row.horse?.jockey}</td>
                                    <td className="px-2 py-1.5 text-right font-bold text-blue-600">{row.wins}%</td>
                                    <td className="px-2 py-1.5 text-right font-bold text-purple-600">{row.crowdWin}%</td>
                                    <td className={`px-2 py-1.5 text-center font-bold ${physVsCrowdColor}`}>
                                        {physVsCrowd > 0 ? `+${physVsCrowd}` : physVsCrowd}
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-slate-500 font-mono">
                                        {row.horse?.realOdds?.toFixed(1)}
                                    </td>
                                    <td className={`px-2 py-1.5 text-center font-bold whitespace-nowrap ${marketColor}`}>
                                        {marketLabel}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="flex gap-3 justify-end flex-wrap">
                <button
                    onClick={onReset}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition"
                >
                    リセット
                </button>
                <button
                    onClick={onRunAgain}
                    disabled={isRunning}
                    className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
                >
                    {isRunning ? "シミュレーション中..." : "もう一度試走 🔄"}
                </button>
                <button
                    onClick={onPostToX}
                    className="flex items-center gap-2 px-6 py-2 bg-black text-white rounded-lg hover:bg-slate-800 transition shadow-lg hover:shadow-xl"
                >
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>
                    結果をXに投稿
                </button>
            </div>
        </div>
    );
}
