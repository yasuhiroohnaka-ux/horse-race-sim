"use client";

import { useState } from "react";
import { COURSES } from "@/lib/courses";
import { Horse, RaceCondition, TrackBias } from "@/lib/types";
import { runMonteCarlo } from "@/lib/simulation";
import { CourseConfig } from "@/components/CourseConfig";
import { HorseInput } from "@/components/HorseInput";
import { SimulationResults } from "@/components/SimulationResults";

export default function SimulatorPage() {
    const [selectedCourseId, setSelectedCourseId] = useState(COURSES[0].id);
    const [bias, setBias] = useState<TrackBias>({ innerOuter: 0, frontBack: 0 });
    const [horses, setHorses] = useState<Horse[]>([
        { id: '1', name: 'ウィルソンテソーロ', speed: 88, stamina: 82, power: 85, guts: 80, runningStyle: 'Senko', predictionCount: 150, simulatedOdds: 0 },
        { id: '2', name: 'コスタノバ', speed: 86, stamina: 80, power: 82, guts: 78, runningStyle: 'Senko', predictionCount: 120, simulatedOdds: 0 },
        { id: '3', name: 'ダノンデサイル', speed: 84, stamina: 85, power: 80, guts: 82, runningStyle: 'Sashi', predictionCount: 100, simulatedOdds: 0 },
        { id: '4', name: 'ラムジェット', speed: 82, stamina: 88, power: 88, guts: 85, runningStyle: 'Oikomi', predictionCount: 90, simulatedOdds: 0 },
        { id: '5', name: 'ペプチドナイル', speed: 83, stamina: 82, power: 80, guts: 80, runningStyle: 'Senko', predictionCount: 70, simulatedOdds: 0 },
        { id: '6', name: 'タガノビューティー', speed: 80, stamina: 84, power: 85, guts: 82, runningStyle: 'Oikomi', predictionCount: 60, simulatedOdds: 0 },
    ]);
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

        const text = `
【AI競馬シミュレーション結果】
本命馬: ${favorite.name} (${favorite.predictionCount} 票)
シミュレーション勝者: ${winner?.name} (勝率: ${results[0].winCount}%)

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
