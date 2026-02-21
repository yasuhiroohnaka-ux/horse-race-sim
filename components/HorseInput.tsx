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

    const updateHorses = (newList: Horse[]) => {
        // Recalculate odds whenever predictions change
        const withOdds = calculateOdds(newList);

        onHorsesChange(withOdds);
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-md border border-slate-200 mt-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-slate-800">2. 出走馬データ</h2>
                <button
                    onClick={addHorse}
                    className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
                >
                    <Plus size={16} /> 馬を追加
                </button>
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
                            <th className="px-4 py-3 w-32">予想数 (票)</th>
                            <th className="px-4 py-3 text-right">推定オッズ</th>
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {horses.map((horse) => (
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
                                <td className="px-4 py-2">
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
                                        className="w-16 p-1 border rounded text-center"
                                    />
                                </td>
                                <td className="px-4 py-2">
                                    <input
                                        type="number"
                                        value={horse.stamina}
                                        onChange={(e) => updateHorse(horse.id, 'stamina', parseInt(e.target.value))}
                                        className="w-16 p-1 border rounded text-center"
                                    />
                                </td>
                                <td className="px-4 py-2">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={horse.predictionCount}
                                            onChange={(e) => updateHorse(horse.id, 'predictionCount', Math.max(0, parseInt(e.target.value) || 0))}
                                            className="w-20 p-1 border border-blue-200 bg-blue-50 rounded text-center font-bold text-blue-700"
                                        />
                                        <span className="text-xs text-slate-400">票</span>
                                    </div>
                                </td>
                                <td className="px-4 py-2 text-right">
                                    <span className="font-mono font-bold text-lg text-slate-800">
                                        {horse.simulatedOdds?.toFixed(1)}
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
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
