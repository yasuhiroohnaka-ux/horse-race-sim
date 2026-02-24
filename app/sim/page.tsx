"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { COURSES, ACTIVE_COURSES } from "@/lib/courses";
import { Horse, RaceCondition, TrackBias } from "@/lib/types";
import { runMonteCarlo, calculateOdds } from "@/lib/simulation";
import { getDefaultHorses, isArchivedCourse } from "@/lib/raceData";
import { CourseConfig } from "@/components/CourseConfig";
import { HorseInput } from "@/components/HorseInput";
import { SimulationResults } from "@/components/SimulationResults";
import Link from "next/link";

export default function SimulatorPage() {
    const searchParams = useSearchParams();
    const archiveParam = searchParams.get('archive');

    // アーカイブ指定があればそのコース、なければ最初のアクティブコース
    const initialCourseId = archiveParam
        ? (COURSES.find(c => c.id === archiveParam)?.id ?? ACTIVE_COURSES[0].id)
        : ACTIVE_COURSES[0].id;

    const [selectedCourseId, setSelectedCourseId] = useState(initialCourseId);
    const [bias, setBias] = useState<TrackBias>({ innerOuter: 0, frontBack: 0 });
    const [horses, setHorses] = useState<Horse[]>(calculateOdds(getDefaultHorses(initialCourseId)));
    const [results, setResults] = useState<{ horseId: string; winCount: number; bestTime: number }[] | null>(null);
    const [isRunning, setIsRunning] = useState(false);

    const selectedCourse = COURSES.find(c => c.id === selectedCourseId) || ACTIVE_COURSES[0];
    const isArchive = selectedCourse.archived === true;

    // コース変更時にデフォルト馬データをロード
    const handleCourseChange = (courseId: string) => {
        setSelectedCourseId(courseId);
        setHorses(calculateOdds(getDefaultHorses(courseId)));
        setResults(null);
        setBias({ innerOuter: 0, frontBack: 0 });
    };

    const handleRunSimulation = () => {
        setIsRunning(true);
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

        const winnerId = results[0].horseId;
        const winner = horses.find(h => h.id === winnerId);
        const favorite = [...horses].sort((a, b) => b.predictionCount - a.predictionCount)[0];
        const darkHorse = [...horses]
            .filter(h => (h.simulatedOdds ?? 0) > 0 && (h.realOdds ?? 0) > 0)
            .sort((a, b) =>
                ((b.realOdds ?? 0) / (b.simulatedOdds ?? 1)) -
                ((a.realOdds ?? 0) / (a.simulatedOdds ?? 1))
            )[0];

        const text = `
【AI競馬シミュレーション結果】
本命馬: ${favorite.name} (${favorite.predictionCount} 票)
シミュレーション勝者: ${winner?.name} (勝率: ${results[0].winCount}%)
穴馬候補: ${darkHorse?.name ?? "-"} (市場${darkHorse?.realOdds?.toFixed(1)}倍 / シミュ${darkHorse?.simulatedOdds?.toFixed(1)}倍)

コース: ${selectedCourse.name}
#競馬 #シミュレーション ${selectedCourse.hashtag}
    `.trim();

        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    return (
        <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
            <div className="max-w-4xl mx-auto">
                <header className="mb-8 text-center">
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">🏇 AI競馬シミュレーター</h1>
                    <p className="text-slate-500 mt-2">予想票を入力 → 100回試走 → 差分で狙い目を発見</p>
                    {isArchive && (
                        <div className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-amber-700 text-sm">
                            <span>📦</span>
                            <span className="font-medium">アーカイブモード: {selectedCourse.name}</span>
                            <Link href="/sim" className="text-blue-600 hover:underline ml-2 text-xs">
                                最新レースへ →
                            </Link>
                        </div>
                    )}
                </header>

                <div className="space-y-6">
                    <CourseConfig
                        selectedCourse={selectedCourse}
                        bias={bias}
                        onCourseChange={handleCourseChange}
                        onBiasChange={setBias}
                    />

                    <HorseInput
                        horses={horses}
                        onHorsesChange={setHorses}
                        hashtag={selectedCourse.hashtag}
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
                            onRunAgain={handleRunSimulation}
                            isRunning={isRunning}
                            hashtag={selectedCourse.hashtag}
                        />
                    )}
                </div>

                <footer className="mt-12 text-center text-xs text-slate-400">
                    <Link href="/" className="hover:text-slate-600 transition">← トップへ</Link>
                    <span className="mx-2">|</span>
                    <Link href="/archive" className="hover:text-slate-600 transition">過去のレース</Link>
                    <span className="mx-2">|</span>
                    Powered by Next.js & Tailwind CSS
                </footer>
            </div>
        </div>
    );
}
