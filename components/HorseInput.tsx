"use client";

import { Horse } from "@/lib/types";
import { RunningStyle, calculateOdds } from "@/lib/simulation";
import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";

interface HorseInputProps {
    horses: Horse[];
    onHorsesChange: (horses: Horse[]) => void;
}

export function HorseInput({ horses, onHorsesChange }: HorseInputProps) {

    const addHorse = () => {
        const newHorse: Horse = {
            id: Math.random().toString(36).substr(2, 9),
            name: `Horse ${horses.length + 1}`,
            gateNumber: horses.length + 1,
            jockey: "未定",
            speed: 70, // Default stats
            stamina: 70,
            power: 70,
            guts: 70,
            runningStyle: "Senko",
            predictionCount: 0,
            simulatedOdds: 0
        };
        updateHorses([...horses, newHorse]);
    };

    const removeHorse = (id: string) => {
        updateHorses(horses.filter(h => h.id !== id));
    };

    const updateHorse = (id: string, field: keyof Horse, value: any) => {
        const newHorses = horses.map(h =>
            h.id === id ? { ...h, [field]: value } : h
        );
        updateHorses(newHorses);
    };

    const handlePostPopularity = () => {
        // Sort horses by predictionCount
        const sorted = [...horses].sort((a, b) => b.predictionCount - a.predictionCount);
        const top5 = sorted.slice(0, 5).filter(h => h.predictionCount > 0);

        if (top5.length === 0) {
            alert("集計データがありません（予想票が入っていません）");
            return;
        }

        let text = "【X(旧Twitter) 競馬予想集計状況】\n";
        top5.forEach((h, i) => {
            text += `${i + 1}位: ${h.name} (${h.predictionCount}pt / 推定${h.simulatedOdds?.toFixed(1)}倍)\n`;
        });
        text += "\n#競馬 #シミュレーション #フェブラリーS #集計中";

        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    const updateHorses = (newList: Horse[]) => {
        // Recalculate odds whenever predictions change
        const withOdds = calculateOdds(newList);

        onHorsesChange(withOdds);
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md border border-slate-200 mt-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-slate-800">2. 出走馬データ</h2>
                <div className="flex gap-2">
                    <button
                        onClick={handlePostPopularity}
                        className="flex items-center gap-2 px-3 py-1 border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition"
                    >
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>
                        集計をXに投稿
                    </button>
                    <button
                        onClick={addHorse}
                        className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
                    >
                        <Plus size={16} /> 馬を追加
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 uppercase">
                        <tr>
                            <th className="px-4 py-3 w-16">馬番</th>
                            <th className="px-4 py-3">馬名</th>
                            <th className="px-4 py-3">騎手</th>
                            <th className="px-4 py-3">脚質</th>
                            <th className="px-4 py-3 w-20">スピ</th>
                            <th className="px-4 py-3 w-20">スタ</th>
                            <th
                                className="px-4 py-3 w-32 cursor-help"
                                title="◎×6 + 〇×4 + ▲×3 + △×2 + ☆×1 の合計を入力"
                            >集合知スコア (?)</th>
                            <th className="px-4 py-3 w-32 text-right">確定オッズ</th>
                            <th className="px-4 py-3 w-32 text-right text-purple-600 border-l-2 border-slate-200"
                                title="集合知スコアから算出した推定オッズ（自動計算）">
                                世論オッズ
                            </th>
                            <th className="px-4 py-3 w-24 text-center text-slate-400">乖離</th>
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {horses.map((horse) => {
                            const diff = (horse.simulatedOdds || 0) - (horse.realOdds || 0);
                            const diffLabel = diff < 0 ? "強気" : "弱気";
                            const diffColor = diff < 0 ? "text-red-600 bg-red-50" : "text-blue-600 bg-blue-50";

                            return (
                                <tr key={horse.id} className="border-b border-slate-100 hover:bg-slate-50">
                                    <td className="px-4 py-2">
                                        <input
                                            type="number"
                                            value={horse.gateNumber}
                                            onChange={(e) => updateHorse(horse.id, 'gateNumber', parseInt(e.target.value))}
                                            className="w-12 p-1 border rounded text-center font-bold"
                                        />
                                    </td>
                                    <td className="px-4 py-2">
                                        <input
                                            type="text"
                                            value={horse.name}
                                            onChange={(e) => updateHorse(horse.id, 'name', e.target.value)}
                                            className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none font-medium"
                                        />
                                    </td>
                                    <td className="px-4 py-2">
                                        <input
                                            type="text"
                                            value={horse.jockey}
                                            onChange={(e) => updateHorse(horse.id, 'jockey', e.target.value)}
                                            className="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-slate-500"
                                        />
                                    </td>
                                    <td className="px-4 py-2 text-xs">
                                        <select
                                            value={horse.runningStyle}
                                            onChange={(e) => updateHorse(horse.id, 'runningStyle', e.target.value)}
                                            className="bg-transparent outline-none cursor-pointer"
                                        >
                                            <option value="Nige">逃げ</option>
                                            <option value="Senko">先行</option>
                                            <option value="Sashi">差し</option>
                                            <option value="Oikomi">追込</option>
                                        </select>
                                    </td>
                                    <td className="px-4 py-2">
                                        <input
                                            type="number"
                                            value={horse.speed}
                                            onChange={(e) => updateHorse(horse.id, 'speed', parseInt(e.target.value))}
                                            className="w-14 p-1 border rounded text-center text-xs"
                                        />
                                    </td>
                                    <td className="px-4 py-2">
                                        <input
                                            type="number"
                                            value={horse.stamina}
                                            onChange={(e) => updateHorse(horse.id, 'stamina', parseInt(e.target.value))}
                                            className="w-14 p-1 border rounded text-center text-xs"
                                        />
                                    </td>
                                    <td className="px-4 py-2 text-xs">
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                value={horse.predictionCount}
                                                onChange={(e) => updateHorse(horse.id, 'predictionCount', Math.max(0, parseInt(e.target.value) || 0))}
                                                className="w-16 p-1 border border-blue-200 bg-blue-50 rounded text-center font-bold text-blue-700"
                                            />
                                            <span className="text-slate-400">票</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={horse.realOdds}
                                            onChange={(e) => updateHorse(horse.id, 'realOdds', parseFloat(e.target.value))}
                                            className="w-20 p-1 border rounded text-right font-mono"
                                        />
                                    </td>
                                    <td className="px-4 py-2 text-right border-l-2 border-slate-100">
                                        <span className="font-mono font-bold text-purple-600">
                                            {horse.simulatedOdds?.toFixed(1)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 text-center">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${diffColor}`}>
                                            {diffLabel}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 text-center">
                                        <button
                                            onClick={() => removeHorse(horse.id)}
                                            className="text-slate-400 hover:text-red-500 transition"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
