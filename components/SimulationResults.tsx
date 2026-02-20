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
            odds: horse?.simulatedOdds?.toFixed(1) || "-"
        };
    });

    return (
        <div className="bg-white p-6 rounded-lg shadow-md border border-slate-200 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-bold mb-4 text-slate-800">3. Simulation Results (100 Runs)</h2>

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
                        <Bar dataKey="wins" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Win Count" />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto mb-6">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 uppercase">
                        <tr>
                            <th className="px-4 py-2">Rank</th>
                            <th className="px-4 py-2">Horse</th>
                            <th className="px-4 py-2 text-right">Win Rates</th>
                            <th className="px-4 py-2 text-right">Simulated Odds</th>
                            <th className="px-4 py-2 text-right">Crowd Odds</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, index) => (
                            <tr key={index} className="border-b border-slate-100">
                                <td className="px-4 py-2 font-bold text-slate-500">#{index + 1}</td>
                                <td className="px-4 py-2 font-medium text-slate-900">{row.name}</td>
                                <td className="px-4 py-2 text-right font-bold text-blue-600">{row.wins}%</td>
                                <td className="px-4 py-2 text-right text-slate-500">
                                    {/* Real Simulation Odds: 100 / win% * 0.8 */}
                                    {(row.wins > 0 ? (100 / row.wins * 0.8).toFixed(1) : "999.9")}
                                </td>
                                <td className="px-4 py-2 text-right font-mono text-slate-500">{row.odds}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex gap-4 justify-end">
                <button
                    onClick={onReset}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition"
                >
                    Reset
                </button>
                <button
                    onClick={onPostToX}
                    className="flex items-center gap-2 px-6 py-2 bg-black text-white rounded-lg hover:bg-slate-800 transition shadow-lg hover:shadow-xl"
                >
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>
                    Post Result to X
                </button>
            </div>
        </div>
    );
}
