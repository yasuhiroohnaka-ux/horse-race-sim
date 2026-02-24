"use client";

import { Horse } from "@/lib/types";
import { RunningStyle, calculateOdds } from "@/lib/simulation";
import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";

interface HorseInputProps {
    horses: Horse[];
    onHorsesChange: (horses: Horse[]) => void;
    hashtag?: string;
}

export function HorseInput({ horses, onHorsesChange, hashtag = '#競馬' }: HorseInputProps) {

    const addHorse = () => {
        const newHorse: Horse = {
            id: Math.random().toString(36).substr(2, 9),
            name: `Horse ${horses.length + 1}`,
            gateNumber: horses.length + 1,
            jockey: "未定",
            speed: 70,
            stamina: 70,
            power: 70,
            guts: 70,
            runningStyle: "Senko",
            predictionCount: 0,
            simulatedOdds: 0,
            sex: 'M',
            weight: 57,
            condition: 5,
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
        text += `\n#競馬 #シミュレーション ${hashtag} #集計中`;

        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    const updateHorses = (newList: Horse[]) => {
        const withOdds = calculateOdds(newList);
        onHorsesChange(withOdds);
    };

    /** 状態値のラベル＋色 */
    const conditionLabel = (v: number) => {
        if (v >= 8) return { text: '絶好', color: 'text-red-600' };
        if (v >= 6) return { text: '好調', color: 'text-orange-500' };
        if (v >= 4) return { text: '普通', color: 'text-slate-500' };
        return { text: '不調', color: 'text-blue-500' };
    };

    return (
        <div className="bg-white p-4 rounded-lg shadow-md border border-slate-200 mt-4">
            <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-bold text-slate-500">出走馬データ ({horses.length}頭)</h2>
                <div className="flex gap-2">
                    <button
                        onClick={handlePostPopularity}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition"
                    >
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>
                        Xに投稿
                    </button>
                    <button
                        onClick={addHorse}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
                    >
                        <Plus size={14} /> 追加
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto -mx-4">
                <table className="w-full text-xs border-collapse" style={{ minWidth: '920px' }}>
                    <thead>
                        <tr className="bg-slate-50 text-slate-500 border-y border-slate-200">
                            <th className="px-2 py-2 text-center w-10">枠</th>
                            <th className="px-2 py-2 text-left" style={{ minWidth: '110px' }}>馬名</th>
                            <th className="px-2 py-2 text-left w-14">騎手</th>
                            <th className="px-1 py-2 text-center w-8">性</th>
                            <th className="px-1 py-2 text-center w-10">斤量</th>
                            <th className="px-1 py-2 text-center w-10">脚質</th>
                            <th className="px-1 py-2 text-center w-10">SP</th>
                            <th className="px-1 py-2 text-center w-10">ST</th>
                            <th className="px-1 py-2 text-center w-10"
                                title="状態値 0-10 (好調→能力UP, 不調→能力DOWN)">
                                <span className="cursor-help border-b border-dotted border-slate-400">調子</span>
                            </th>
                            <th className="px-1 py-2 text-center w-12"
                                title="◎×6 + 〇×4 + ▲×3 + △×2 + ☆×1 の合計を入力">
                                <span className="cursor-help border-b border-dotted border-slate-400">集合知</span>
                            </th>
                            <th className="px-1 py-2 text-center w-14">実オッズ</th>
                            <th className="px-1 py-2 text-center w-12 text-purple-600 border-l border-slate-200"
                                title="集合知スコアから算出した推定オッズ（自動計算）">世論</th>
                            <th className="px-1 py-2 text-center w-8">差</th>
                            <th className="px-1 py-2 w-6"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {horses.map((horse) => {
                            const diff = (horse.simulatedOdds || 0) - (horse.realOdds || 0);
                            const diffLabel = diff < 0 ? "強" : "弱";
                            const diffColor = diff < 0 ? "text-red-600" : "text-blue-500";
                            const cond = conditionLabel(horse.condition ?? 5);

                            return (
                                <tr key={horse.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                                    <td className="px-2 py-1.5 text-center">
                                        <input
                                            type="number"
                                            value={horse.gateNumber}
                                            onChange={(e) => updateHorse(horse.id, 'gateNumber', parseInt(e.target.value))}
                                            className="w-9 p-0.5 border rounded text-center text-xs font-bold bg-slate-50"
                                        />
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <input
                                            type="text"
                                            value={horse.name}
                                            onChange={(e) => updateHorse(horse.id, 'name', e.target.value)}
                                            className="w-full min-w-[90px] bg-transparent border-b border-transparent focus:border-blue-500 outline-none font-bold text-slate-800 text-xs"
                                        />
                                    </td>
                                    <td className="px-1 py-1.5">
                                        <input
                                            type="text"
                                            value={horse.jockey}
                                            onChange={(e) => updateHorse(horse.id, 'jockey', e.target.value)}
                                            className="w-full max-w-[56px] bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-slate-400 text-xs truncate"
                                        />
                                    </td>
                                    {/* 性別 */}
                                    <td className="px-0.5 py-1.5 text-center">
                                        <select
                                            value={horse.sex ?? 'M'}
                                            onChange={(e) => updateHorse(horse.id, 'sex', e.target.value)}
                                            className={`bg-transparent outline-none cursor-pointer text-xs w-full font-bold ${horse.sex === 'F' ? 'text-pink-500' : 'text-blue-500'}`}
                                        >
                                            <option value="M">牡</option>
                                            <option value="F">牝</option>
                                        </select>
                                    </td>
                                    {/* 斤量 */}
                                    <td className="px-0.5 py-1.5 text-center">
                                        <input
                                            type="number"
                                            step="0.5"
                                            value={horse.weight ?? 57}
                                            onChange={(e) => updateHorse(horse.id, 'weight', parseFloat(e.target.value))}
                                            className="w-10 p-0.5 border rounded text-center text-xs"
                                        />
                                    </td>
                                    {/* 脚質 */}
                                    <td className="px-0.5 py-1.5 text-center">
                                        <select
                                            value={horse.runningStyle}
                                            onChange={(e) => updateHorse(horse.id, 'runningStyle', e.target.value)}
                                            className="bg-transparent outline-none cursor-pointer text-xs w-full"
                                        >
                                            <option value="Nige">逃</option>
                                            <option value="Senko">先</option>
                                            <option value="Sashi">差</option>
                                            <option value="Oikomi">追</option>
                                        </select>
                                    </td>
                                    <td className="px-0.5 py-1.5 text-center">
                                        <input
                                            type="number"
                                            value={horse.speed}
                                            onChange={(e) => updateHorse(horse.id, 'speed', parseInt(e.target.value))}
                                            className="w-10 p-0.5 border rounded text-center text-xs"
                                        />
                                    </td>
                                    <td className="px-0.5 py-1.5 text-center">
                                        <input
                                            type="number"
                                            value={horse.stamina}
                                            onChange={(e) => updateHorse(horse.id, 'stamina', parseInt(e.target.value))}
                                            className="w-10 p-0.5 border rounded text-center text-xs"
                                        />
                                    </td>
                                    {/* 状態値 */}
                                    <td className="px-0.5 py-1.5 text-center">
                                        <input
                                            type="number"
                                            min="0" max="10"
                                            value={horse.condition ?? 5}
                                            onChange={(e) => updateHorse(horse.id, 'condition', Math.min(10, Math.max(0, parseInt(e.target.value) || 0)))}
                                            className={`w-9 p-0.5 border rounded text-center text-xs font-bold ${cond.color}`}
                                            title={cond.text}
                                        />
                                    </td>
                                    <td className="px-0.5 py-1.5 text-center">
                                        <input
                                            type="number"
                                            value={horse.predictionCount}
                                            onChange={(e) => updateHorse(horse.id, 'predictionCount', Math.max(0, parseInt(e.target.value) || 0))}
                                            className="w-11 p-0.5 border border-blue-200 bg-blue-50 rounded text-center font-bold text-blue-700 text-xs"
                                        />
                                    </td>
                                    <td className="px-0.5 py-1.5 text-center">
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={horse.realOdds}
                                            onChange={(e) => updateHorse(horse.id, 'realOdds', parseFloat(e.target.value))}
                                            className="w-13 p-0.5 border rounded text-center font-mono text-xs"
                                        />
                                    </td>
                                    <td className="px-0.5 py-1.5 text-center border-l border-slate-100">
                                        <span className="font-mono font-bold text-purple-600 text-xs">
                                            {horse.simulatedOdds?.toFixed(1)}
                                        </span>
                                    </td>
                                    <td className="px-0.5 py-1.5 text-center">
                                        <span className={`text-[10px] font-bold ${diffColor}`}>
                                            {diffLabel}
                                        </span>
                                    </td>
                                    <td className="px-0.5 py-1.5 text-center">
                                        <button
                                            onClick={() => removeHorse(horse.id)}
                                            className="text-slate-300 hover:text-red-500 transition"
                                        >
                                            <Trash2 size={13} />
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
