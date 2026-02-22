"use client";

import { useState } from "react";
import { COURSES } from "@/lib/courses";
import { Horse, RaceCondition, TrackBias } from "@/lib/types";
import { runMonteCarlo, calculateOdds } from "@/lib/simulation";
import { CourseConfig } from "@/components/CourseConfig";
import { HorseInput } from "@/components/HorseInput";
import { SimulationResults } from "@/components/SimulationResults";

export default function SimulatorPage() {
    const [selectedCourseId, setSelectedCourseId] = useState(COURSES[0].id);
    const [bias, setBias] = useState<TrackBias>({ innerOuter: 0, frontBack: 0 });
    const [horses, setHorses] = useState<Horse[]>(calculateOdds([
        { id: '1', gateNumber: 1, name: 'オメガギネス', jockey: '岩田康誠', speed: 85, stamina: 82, power: 80, guts: 80, runningStyle: 'Sashi', predictionCount: 20, simulatedOdds: 0, realOdds: 19.6 },
        { id: '2', gateNumber: 2, name: 'ハッピーマン', jockey: '高杉吏麒', speed: 80, stamina: 80, power: 78, guts: 75, runningStyle: 'Sashi', predictionCount: 5, simulatedOdds: 0, realOdds: 68.1 },
        { id: '3', gateNumber: 3, name: 'ブライアンセンス', jockey: '岩田望来', speed: 81, stamina: 82, power: 80, guts: 78, runningStyle: 'Sashi', predictionCount: 8, simulatedOdds: 0, realOdds: 60.3 },
        { id: '4', gateNumber: 4, name: 'ペリエール', jockey: '佐々木大輔', speed: 82, stamina: 80, power: 85, guts: 80, runningStyle: 'Sashi', predictionCount: 15, simulatedOdds: 0, realOdds: 32.4 },
        { id: '5', gateNumber: 5, name: 'シックスペンス', jockey: '戸崎圭太', speed: 86, stamina: 84, power: 82, guts: 85, runningStyle: 'Senko', predictionCount: 40, simulatedOdds: 0, realOdds: 17.3 },
        { id: '6', gateNumber: 6, name: 'ラムジェット', jockey: '三浦皇成', speed: 88, stamina: 90, power: 92, guts: 88, runningStyle: 'Oikomi', predictionCount: 120, simulatedOdds: 0, realOdds: 8.3 },
        { id: '7', gateNumber: 7, name: 'ロングラン', jockey: '荻野極', speed: 78, stamina: 85, power: 80, guts: 82, runningStyle: 'Sashi', predictionCount: 2, simulatedOdds: 0, realOdds: 157.4 },
        { id: '8', gateNumber: 8, name: 'サクラトゥジュール', jockey: 'R.キング', speed: 82, stamina: 80, power: 80, guts: 78, runningStyle: 'Sashi', predictionCount: 10, simulatedOdds: 0, realOdds: 43.0 },
        { id: '9', gateNumber: 9, name: 'ダブルハートボンド', jockey: '坂井瑠星', speed: 92, stamina: 88, power: 85, guts: 90, runningStyle: 'Senko', predictionCount: 180, simulatedOdds: 0, realOdds: 2.9 },
        { id: '10', gateNumber: 10, name: 'サンデーファンデー', jockey: '横山和生', speed: 84, stamina: 82, power: 80, guts: 80, runningStyle: 'Senko', predictionCount: 25, simulatedOdds: 0, realOdds: 17.0 },
        { id: '11', gateNumber: 11, name: 'サンライズホーク', jockey: '松岡正海', speed: 75, stamina: 80, power: 82, guts: 80, runningStyle: 'Sashi', predictionCount: 1, simulatedOdds: 0, realOdds: 227.2 },
        { id: '12', gateNumber: 12, name: 'コスタノヴァ', jockey: 'C.ルメール', speed: 90, stamina: 85, power: 88, guts: 90, runningStyle: 'Sashi', predictionCount: 160, simulatedOdds: 0, realOdds: 3.5 },
        { id: '13', gateNumber: 13, name: 'ナチュラルライズ', jockey: '横山武史', speed: 88, stamina: 85, power: 80, guts: 85, runningStyle: 'Nige', predictionCount: 140, simulatedOdds: 0, realOdds: 21.9 },
        { id: '14', gateNumber: 14, name: 'ウィルソンテソーロ', jockey: '川田将雅', speed: 85, stamina: 88, power: 90, guts: 92, runningStyle: 'Senko', predictionCount: 30, simulatedOdds: 0, realOdds: 6.2 },
        { id: '15', gateNumber: 15, name: 'ペプチドナイル', jockey: '富田暁', speed: 83, stamina: 85, power: 85, guts: 80, runningStyle: 'Senko', predictionCount: 12, simulatedOdds: 0, realOdds: 57.8 },
        { id: '16', gateNumber: 16, name: 'サイモンザナドゥ', jockey: '池添謙一', speed: 81, stamina: 84, power: 82, guts: 85, runningStyle: 'Sashi', predictionCount: 10, simulatedOdds: 0, realOdds: 59.6 },
    ]));
    const [results, setResults] = useState<{ horseId: string; winCount: number; bestTime: number }[] | null>(null);
    const [isRunning, setIsRunning] = useState(false);

    const selectedCourse = COURSES.find(c => c.id === selectedCourseId) || COURSES[0];

    const handleRunSimulation = () => {
        setIsRunning(true);
        // Add small delay to allow UI to update (loading state)
        setTimeout(() => {
            const condition: RaceCondition = {
                courseId: selectedCourseId,
                trackBias: bias,
                groundCondition: 'Good'
            };

            const simResults = runMonteCarlo(horses, selectedCourse, condition, 100);
            setResults(simResults);
            setIsRunning(false);
        }, 500);
    };

    const handlePostToX = () => {
        if (!results) return;

        // Find winner
        const winnerId = results[0].horseId;
        const winner = horses.find(h => h.id === winnerId);

        // Find Crowd Favorite
        const favorite = [...horses].sort((a, b) => b.predictionCount - a.predictionCount)[0];

        // Find dark horse: highest realOdds/simulatedOdds ratio
        // = 市場は高く評価（高オッズ）なのにシミュでは低く評価 → AIが「実は強い」と判断
        const darkHorse = [...horses]
            .filter(h => h.simulatedOdds > 0 && h.realOdds > 0)
            .sort((a, b) => (b.realOdds / b.simulatedOdds) - (a.realOdds / a.simulatedOdds))[0];

        const text = `
【AI競馬シミュレーション結果】
本命馬: ${favorite.name} (${favorite.predictionCount} 票)
シミュレーション勝者: ${winner?.name} (勝率: ${results[0].winCount}%)
穴馬候補: ${darkHorse?.name ?? "-"} (市場${darkHorse?.realOdds?.toFixed(1)}倍 / シミュ${darkHorse?.simulatedOdds?.toFixed(1)}倍)

コース: ${selectedCourse.name}
#競馬 #シミュレーション #フェブラリーS
    `.trim();

        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    return (
        <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
            <div className="max-w-4xl mx-auto">
                <header className="mb-8 text-center">
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">🏇 AI競馬シミュレーター</h1>
                    <p className="text-slate-500 mt-2">集合知 × 物理エンジン</p>
                </header>

                <div className="space-y-6">
                    <CourseConfig
                        selectedCourse={selectedCourse}
                        bias={bias}
                        onCourseChange={setSelectedCourseId}
                        onBiasChange={setBias}
                    />

                    <HorseInput
                        horses={horses}
                        onHorsesChange={setHorses}
                    />

                    {!results && (
                        <div className="text-center py-8">
                            <button
                                onClick={handleRunSimulation}
                                disabled={isRunning}
                                className="px-8 py-4 bg-blue-600 text-white text-xl font-bold rounded-full shadow-lg hover:bg-blue-700 hover:shadow-xl transition transform active:scale-95 disabled:opacity-50"
                            >
                                {isRunning ? "シミュレーション中..." : "100回シミュレーションを実行 🚀"}
                            </button>
                        </div>
                    )}

                    {results && (
                        <SimulationResults
                            results={results}
                            horses={horses}
                            onReset={() => setResults(null)}
                            onPostToX={handlePostToX}
                        />
                    )}
                </div>

                <footer className="mt-12 text-center text-xs text-slate-400">
                    Powered by Next.js & Tailwind CSS
                </footer>
            </div>
        </div>
    );
}
