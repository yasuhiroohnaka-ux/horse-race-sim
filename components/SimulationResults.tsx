"use client";

import { Horse, RaceResult } from "@/lib/types";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SimulationResultsProps {
    results: { horseId: string; winCount: number; bestTime: number }[];
    horses: Horse[];
    onReset: () => void;
    onPostToX: () => void;
}

export function SimulationResults({ results, horses, onReset, onPostToX }: SimulationResultsProps) {
    // Merge results with horse names
    const data = results.map(r => {
        const horse = horses.find(h => h.id === r.horseId);
        return {
            name: horse ? horse.name : "Unknown",
            wins: r.winCount,
            bestTime: r.bestTime.toFixed(1) + "s",
            odds: horse?.simulatedOdds?.toFixed(1) || "-",
            horse: horse
        };
    });

    return (
        <div className="bg-white p-6 rounded-lg shadow-md border border-slate-200 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-bold mb-4 text-slate-800">3. シミュレーション結果 (100回実行)</h2>

            <div className="h-64 w-full mb-6">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                        <XAxis type="number" domain={[0, 100]} />
                        <YAxis type="category" dataKey="name" width={100} />
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            cursor={{ fill: '#f1f5f9' }}
                        />
                        <Bar dataKey="wins" fill="#3b82f6" radius={[0, 4, 4, 0]} name="勝利数" />
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
                            <th className="px-4 py-2 text-right">勝率</th>
                            <th className="px-4 py-2 text-right">市場</th>
                            <th className="px-4 py-2 text-right">世論</th>
                            <th className="px-4 py-2 text-center">乖離</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, index) => {
                            const diff = (row.horse?.simulatedOdds || 0) - (row.horse?.realOdds || 0);
                            const diffColor = diff < 0 ? "text-red-600" : "text-blue-600";
                            const deviation = (row.horse?.realOdds && row.horse?.simulatedOdds)
                                ? (((row.horse.realOdds / row.horse.simulatedOdds) - 1) * 100).toFixed(0) + "%"
                                : "-";

                            return (
                                <tr key={index} className="border-b border-slate-100">
                                    <td className="px-4 py-2 font-bold text-slate-500">#{index + 1}</td>
                                    <td className="px-4 py-2 text-slate-400 font-mono">{row.horse?.gateNumber}</td>
                                    <td className="px-4 py-2 font-medium text-slate-900">{row.name}</td>
                                    <td className="px-4 py-2 text-slate-500 text-xs">{row.horse?.jockey}</td>
                                    <td className="px-4 py-2 text-right font-bold text-emerald-600">{row.wins}%</td>
                                    <td className="px-4 py-2 text-right text-slate-500 font-mono">
                                        {row.horse?.realOdds?.toFixed(1)}
                                    </td>
                                    <td className="px-4 py-2 text-right font-mono font-bold text-blue-600">{row.odds}</td>
                                    <td className={`px-4 py-2 text-center font-bold ${diffColor}`}>
                                        {diff < 0 ? "★強気" : "弱気"}
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
