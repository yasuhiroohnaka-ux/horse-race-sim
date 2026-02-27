"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { COURSES, ACTIVE_COURSES } from "@/lib/courses";
import { Horse, RaceCondition, TrackBias } from "@/lib/types";
import { runMonteCarlo, calculateOdds } from "@/lib/simulation";
import { isArchivedCourse } from "@/lib/raceData";
import { getDefaultHorses } from "@/lib/defaultHorses";
import { applyNetkeibaRatings } from "@/lib/netkeibaRatings";
import { CourseConfig } from "@/components/CourseConfig";
import { HorseInput } from "@/components/HorseInput";
import { SimulationResults } from "@/components/SimulationResults";
import Link from "next/link";

export default function SimulatorPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-slate-100 flex items-center justify-center">
                <p className="text-slate-500 text-lg">読み込み中...</p>
            </div>
        }>
            <SimulatorContent />
        </Suspense>
    );
}

function SimulatorContent() {
    const searchParams = useSearchParams();
    const archiveParam = searchParams.get('archive');

    // アーカイブ指定があればそのコース、なければ最初のアクティブコース
    const initialCourseId = archiveParam
        ? (COURSES.find(c => c.id === archiveParam)?.id ?? ACTIVE_COURSES[0].id)
        : ACTIVE_COURSES[0].id;

    const initialCourse = COURSES.find(c => c.id === initialCourseId) || ACTIVE_COURSES[0];
    const [selectedCourseId, setSelectedCourseId] = useState(initialCourseId);
    const [bias, setBias] = useState<TrackBias>(
        initialCourse.defaultBias ?? { innerOuter: 0, frontBack: 0 }
    );
    const [groundCondition, setGroundCondition] = useState<'Firm' | 'Good' | 'Yielding' | 'Soft'>('Firm');
    const [horses, setHorses] = useState<Horse[]>(calculateOdds(getDefaultHorses(initialCourseId)));
    const [results, setResults] = useState<{ horseId: string; winCount: number; bestTime: number }[] | null>(null);
    const [isRunning, setIsRunning] = useState(false);

    const selectedCourse = COURSES.find(c => c.id === selectedCourseId) || ACTIVE_COURSES[0];
    const isArchive = selectedCourse.archived === true;

    // コース変更時にデフォルト馬データ＋デフォルトバイアスをロード
    const handleCourseChange = (courseId: string) => {
        const course = COURSES.find(c => c.id === courseId);
        setSelectedCourseId(courseId);
        setHorses(calculateOdds(getDefaultHorses(courseId)));
        setResults(null);
        setBias(course?.defaultBias ?? { innerOuter: 0, frontBack: 0 });
        setGroundCondition('Firm');
    };

    useEffect(() => {
        let cancelled = false;

        const refreshNetkeibaOdds = async () => {
            try {
                const res = await fetch(`/api/netkeiba-odds?courseId=${encodeURIComponent(selectedCourseId)}`, { cache: "no-store" });
                if (!res.ok || cancelled) return;

                const payload = await res.json() as {
                    oddsByGate?: Record<string, number>;
                    xPopularityByGate?: Record<string, number>;
                    jockeyByGate?: Record<string, string>;
                    performanceByGate?: Record<string, {
                        recentFormScore?: number;
                        recentAverageFinish?: number;
                        recentTimeIndex?: number;
                        lastRaceGradeScore?: number;
                        lastRaceGradeLabel?: string;
                    }>;
                };
                const oddsByGate = payload.oddsByGate ?? {};
                const xPopularityByGate = payload.xPopularityByGate ?? {};
                const jockeyByGate = payload.jockeyByGate ?? {};
                const performanceByGate = payload.performanceByGate ?? {};
                if (
                    (
                        Object.keys(oddsByGate).length === 0 &&
                        Object.keys(xPopularityByGate).length === 0 &&
                        Object.keys(jockeyByGate).length === 0 &&
                        Object.keys(performanceByGate).length === 0
                    ) ||
                    cancelled
                ) return;

                setHorses((prev) => {
                    let changed = false;
                    const updated = prev.map((horse) => {
                        let nextHorse = horse;
                        let touched = false;
                        let needsRatingsRecalc = false;

                        const latestOdds = Number(oddsByGate[String(horse.gateNumber)]);
                        if (Number.isFinite(latestOdds) && latestOdds > 0) {
                            const roundedLatestOdds = Math.round(latestOdds * 10) / 10;
                            const currentOdds = Number(horse.realOdds ?? 0);
                            if (Math.abs(currentOdds - roundedLatestOdds) >= 0.05) {
                                touched = true;
                                needsRatingsRecalc = true;
                                nextHorse = {
                                    ...nextHorse,
                                    realOdds: roundedLatestOdds,
                                };
                            }
                        }

                        const latestJockey = String(jockeyByGate[String(horse.gateNumber)] ?? "").trim();
                        if (latestJockey && latestJockey !== "未定" && nextHorse.jockey !== latestJockey) {
                            touched = true;
                            needsRatingsRecalc = true;
                            nextHorse = {
                                ...nextHorse,
                                jockey: latestJockey,
                            };
                        }

                        const latestPopularity = Math.round(Number(xPopularityByGate[String(horse.gateNumber)]));
                        if (Number.isFinite(latestPopularity) && latestPopularity > 0) {
                            if (nextHorse.predictionCount !== latestPopularity) {
                                touched = true;
                                nextHorse = {
                                    ...nextHorse,
                                    predictionCount: latestPopularity,
                                };
                            }
                        }

                        const latestPerformance = performanceByGate[String(horse.gateNumber)];
                        if (latestPerformance) {
                            const latestFormScore = Number(latestPerformance.recentFormScore);
                            if (Number.isFinite(latestFormScore)) {
                                const rounded = Math.round(latestFormScore * 10) / 10;
                                if ((nextHorse.recentFormScore ?? 0) !== rounded) {
                                    touched = true;
                                    nextHorse = {
                                        ...nextHorse,
                                        recentFormScore: rounded,
                                    };
                                }
                            }

                            const latestAvgFinish = Number(latestPerformance.recentAverageFinish);
                            if (Number.isFinite(latestAvgFinish) && latestAvgFinish > 0) {
                                const rounded = Math.round(latestAvgFinish * 10) / 10;
                                if ((nextHorse.recentAverageFinish ?? 0) !== rounded) {
                                    touched = true;
                                    nextHorse = {
                                        ...nextHorse,
                                        recentAverageFinish: rounded,
                                    };
                                }
                            }

                            const latestTimeIndex = Number(latestPerformance.recentTimeIndex);
                            if (Number.isFinite(latestTimeIndex)) {
                                const rounded = Math.round(latestTimeIndex * 10) / 10;
                                if ((nextHorse.recentTimeIndex ?? 0) !== rounded) {
                                    touched = true;
                                    nextHorse = {
                                        ...nextHorse,
                                        recentTimeIndex: rounded,
                                    };
                                }
                            }

                            const latestGradeScore = Number(latestPerformance.lastRaceGradeScore);
                            const latestGradeLabel = String(latestPerformance.lastRaceGradeLabel ?? "").trim();
                            if (Number.isFinite(latestGradeScore) || latestGradeLabel) {
                                const roundedGrade = Number.isFinite(latestGradeScore)
                                    ? Math.round(latestGradeScore * 10) / 10
                                    : (nextHorse.lastRaceGradeScore ?? 2);
                                if (
                                    (nextHorse.lastRaceGradeScore ?? 2) !== roundedGrade ||
                                    (latestGradeLabel && nextHorse.lastRaceGradeLabel !== latestGradeLabel)
                                ) {
                                    touched = true;
                                    nextHorse = {
                                        ...nextHorse,
                                        lastRaceGradeScore: roundedGrade,
                                        ...(latestGradeLabel ? { lastRaceGradeLabel: latestGradeLabel } : {}),
                                    };
                                }
                            }
                        }

                        if (needsRatingsRecalc) {
                            nextHorse = applyNetkeibaRatings({
                                ...nextHorse,
                                jockeyPower: undefined,
                                stablePower: undefined,
                            });
                        }

                        if (touched) changed = true;
                        return touched ? nextHorse : horse;
                    });

                    return changed ? calculateOdds(updated) : prev;
                });
            } catch {
                // Keep local odds when live fetch fails.
            }
        };

        void refreshNetkeibaOdds();
        return () => {
            cancelled = true;
        };
    }, [selectedCourseId]);

    const handleRunSimulation = () => {
        setIsRunning(true);
        setTimeout(() => {
            const condition: RaceCondition = {
                courseId: selectedCourseId,
                trackBias: bias,
                groundCondition: groundCondition
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

        const groundLabel: Record<string, string> = { Firm: '良', Good: '稍重', Yielding: '重', Soft: '不良' };
        const text = `
【AI競馬シミュレーション結果】
本命馬: ${favorite.name} (${favorite.predictionCount} 票)
シミュレーション勝者: ${winner?.name} (勝率: ${results[0].winCount}%)
穴馬候補: ${darkHorse?.name ?? "-"} (市場${darkHorse?.realOdds?.toFixed(1)}倍 / シミュ${darkHorse?.simulatedOdds?.toFixed(1)}倍)

コース: ${selectedCourse.name} / 馬場: ${groundLabel[groundCondition] ?? '良'}
#競馬 #シミュレーション ${selectedCourse.hashtag}
    `.trim();

        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    return (
        <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
            <div className="max-w-4xl mx-auto">
                <header className="mb-4 text-center">
                    <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">🏇 AI競馬シミュレーター</h1>
                    <p className="text-slate-400 text-xs mt-1">予想票を入力 → 100回試走 → 差分で狙い目を発見</p>
                    {isArchive && (
                        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-amber-700 text-xs">
                            <span>📦 アーカイブ: {selectedCourse.name}</span>
                            <Link href="/sim" className="text-blue-600 hover:underline ml-1">
                                最新へ →
                            </Link>
                        </div>
                    )}
                </header>

                <div className="space-y-3">
                    <CourseConfig
                        selectedCourse={selectedCourse}
                        bias={bias}
                        groundCondition={groundCondition}
                        onCourseChange={handleCourseChange}
                        onBiasChange={setBias}
                        onGroundConditionChange={(c) => setGroundCondition(c as 'Firm' | 'Good' | 'Yielding' | 'Soft')}
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
