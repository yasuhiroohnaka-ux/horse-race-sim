"use client";

import { Horse, RaceResult } from "@/lib/types";
import { calculateCrowdWinRate } from "@/lib/simulation";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SimulationResultsProps {
    results: { horseId: string; winCount: number; bestTime: number }[];
    horses: Horse[];
    onReset: () => void;
    onPostToX: () => void;
}

export function SimulationResults({ results, horses, onReset, onPostToX }: SimulationResultsProps) {
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

    return (
        <div className="bg-white p-6 rounded-lg shadow-md border border-slate-200 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-bold mb-1 text-slate-800">3. シミュレーション結果 (100回実行)</h2>
            <p className="text-xs text-slate-400 mb-4">
                <span className="inline-block w-3 h-3 rounded-sm bg-blue-500 mr-1 align-middle"></span>物理エンジン（能力値のみ）
                <span className="inline-block w-3 h-3 rounded-sm bg-purple-400 mr-1 align-middle"></span>集合知（予想票の割合）
            </p>

            <div className="h-72 w-full mb-6">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                        <XAxis type="number" domain={[0, 100]} unit="%" />
                        <YAxis type="category" dataKey="name" width={100} />
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            cursor={{ fill: '#f1f5f9' }}
                        />
                        <Legend />
                        <Bar dataKey="wins" fill="#3b82f6" radius={[0, 4, 4, 0]} name="物理%" />
                        <Bar dataKey="crowdWin" fill="#a855f7" radius={[0, 4, 4, 0]} name="集合知%" />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto mb-6">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 uppercase">
                        <tr>
                            <th className="px-4 py-2">順位</th>
                            <th className="px-4 py-2">馬番</th>
                            <th className="px-4 py-2">馬名</th>
                            <th className="px-4 py-2">騎手</th>
                            <th className="px-4 py-2 text-right text-blue-600">物理%</th>
                            <th className="px-4 py-2 text-right text-purple-600">集合知%</th>
                            <th
                                className="px-4 py-2 text-center cursor-help"
                                title="物理% − 集合知%。正(橙)=能力は高いが世論が気づいていない / 負(紫)=世論が物理より高く評価"
                            >
                                差分 (?)
                            </th>
                            <th className="px-4 py-2 text-right">市場オッズ</th>
                            <th
                                className="px-4 py-2 text-center cursor-help"
                                title="集合知オッズ < 市場オッズ → 世論が過小評価＝世論の狙い目(★強気)"
                            >
                                乖離 (?)
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
                            const physVsCrowdLabel =
                                physVsCrowd > 10 ? "能力↑" :
                                physVsCrowd < -10 ? "世論↑" : "-";

                            // 集合知 vs 市場 の乖離
                            const marketDiff = (row.horse?.simulatedOdds || 0) - (row.horse?.realOdds || 0);
                            const marketDiffColor = marketDiff < 0 ? "text-red-600" : "text-blue-600";
                            const deviation = (row.horse?.realOdds && row.horse?.simulatedOdds)
                                ? (((row.horse.realOdds / row.horse.simulatedOdds) - 1) * 100).toFixed(0) + "%"
                                : "-";

                            return (
                                <tr key={index} className="border-b border-slate-100">
                                    <td className="px-4 py-2 font-bold text-slate-500">#{index + 1}</td>
                                    <td className="px-4 py-2 text-slate-400 font-mono">{row.horse?.gateNumber}</td>
                                    <td className="px-4 py-2 font-medium text-slate-900">{row.name}</td>
                                    <td className="px-4 py-2 text-slate-500 text-xs">{row.horse?.jockey}</td>
                                    <td className="px-4 py-2 text-right font-bold text-blue-600">{row.wins}%</td>
                                    <td className="px-4 py-2 text-right font-bold text-purple-600">{row.crowdWin}%</td>
                                    <td
                                        className={`px-4 py-2 text-center font-bold cursor-help ${physVsCrowdColor}`}
                                        title={
                                            physVsCrowd > 10 ? "物理エンジンが世論より高く評価。世論が気づいていない実力馬の可能性。" :
                                            physVsCrowd < -10 ? "世論が物理エンジンより強く推している。人気先行の可能性あり。" :
                                            "物理評価と世論評価が概ね一致。"
                                        }
                                    >
                                        {physVsCrowd > 0 ? `+${physVsCrowd}` : physVsCrowd}
                                        <div className="text-[10px] font-normal">{physVsCrowdLabel}</div>
                                    </td>
                                    <td className="px-4 py-2 text-right text-slate-500 font-mono">
                                        {row.horse?.realOdds?.toFixed(1)}
                                    </td>
                                    <td
                                        className={`px-4 py-2 text-center font-bold cursor-help ${marketDiffColor}`}
                                        title={marketDiff < 0
                                            ? "集合知オッズ < 市場オッズ：世論は強く見ている＝市場が過小評価の可能性"
                                            : "集合知オッズ > 市場オッズ：市場より人気が低い＝割高の可能性"}
                                    >
                                        {marketDiff < 0 ? "★強気" : "弱気"}
                                        <div className="text-[10px] font-normal opacity-70">({deviation})</div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="flex gap-4 justify-end">
                <button
                    onClick={onReset}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition"
                >
                    リセット
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
