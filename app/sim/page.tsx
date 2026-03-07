"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { COURSES, ACTIVE_COURSES } from "@/lib/courses";
import { Horse, RaceCondition, TrackBias } from "@/lib/types";
import { runMonteCarlo, calculateOdds } from "@/lib/simulation";
import { getDefaultHorses } from "@/lib/defaultHorses";
import { applyNetkeibaRatings } from "@/lib/netkeibaRatings";
import { CourseConfig } from "@/components/CourseConfig";
import { HorseInput } from "@/components/HorseInput";
import { SimulationResults } from "@/components/SimulationResults";

export default function SimulatorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-100 flex items-center justify-center">
          <p className="text-slate-500 text-lg">読み込み中...</p>
        </div>
      }
    >
      <SimulatorContent />
    </Suspense>
  );
}

function SimulatorContent() {
  const searchParams = useSearchParams();
  const archiveParam = searchParams.get("archive");
  const fallbackCourse = COURSES[0];
  const initialCourseId = archiveParam ? COURSES.find((c) => c.id === archiveParam)?.id ?? fallbackCourse?.id : ACTIVE_COURSES[0]?.id ?? fallbackCourse?.id;
  const initialCourse = COURSES.find((c) => c.id === initialCourseId) ?? fallbackCourse;

  const [selectedCourseId, setSelectedCourseId] = useState(initialCourseId ?? "");
  const [bias, setBias] = useState<TrackBias>(initialCourse?.defaultBias ?? { innerOuter: 0, frontBack: 0 });
  const [groundCondition, setGroundCondition] = useState<"Firm" | "Good" | "Yielding" | "Soft">("Firm");
  const [horses, setHorses] = useState<Horse[]>(initialCourseId ? calculateOdds(getDefaultHorses(initialCourseId)) : []);
  const [results, setResults] = useState<{ horseId: string; winCount: number; bestTime: number }[] | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const selectedCourse = COURSES.find((c) => c.id === selectedCourseId) ?? fallbackCourse;
  const isArchive = selectedCourse?.archived === true;

  const handleCourseChange = (courseId: string) => {
    const course = COURSES.find((c) => c.id === courseId);
    setSelectedCourseId(courseId);
    setHorses(calculateOdds(getDefaultHorses(courseId)));
    setResults(null);
    setBias(course?.defaultBias ?? { innerOuter: 0, frontBack: 0 });
    setGroundCondition("Firm");
  };

  useEffect(() => {
    if (!selectedCourseId) return;

    let cancelled = false;

    const refreshNetkeibaOdds = async () => {
      try {
        const res = await fetch(`/api/netkeiba-odds?courseId=${encodeURIComponent(selectedCourseId)}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;

        const payload = (await res.json()) as {
          oddsByGate?: Record<string, number>;
          popularityByGate?: Record<string, number>;
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
        const popularityByGate = payload.popularityByGate ?? {};
        const jockeyByGate = payload.jockeyByGate ?? {};
        const performanceByGate = payload.performanceByGate ?? {};
        if (Object.keys(oddsByGate).length === 0 && Object.keys(popularityByGate).length === 0 && Object.keys(jockeyByGate).length === 0 && Object.keys(performanceByGate).length === 0) {
          return;
        }

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
                nextHorse = { ...nextHorse, realOdds: roundedLatestOdds };
              }
            }

            const latestPopularity = Math.round(Number(popularityByGate[String(horse.gateNumber)]));
            if (Number.isFinite(latestPopularity) && latestPopularity > 0 && nextHorse.predictionCount !== latestPopularity) {
              touched = true;
              nextHorse = { ...nextHorse, predictionCount: latestPopularity };
            }

            const latestJockey = String(jockeyByGate[String(horse.gateNumber)] ?? "").trim();
            if (latestJockey && nextHorse.jockey !== latestJockey) {
              touched = true;
              needsRatingsRecalc = true;
              nextHorse = { ...nextHorse, jockey: latestJockey };
            }

            const latestPerformance = performanceByGate[String(horse.gateNumber)];
            if (latestPerformance) {
              const nextFields: Partial<Horse> = {};
              const form = Number(latestPerformance.recentFormScore);
              const avgFinish = Number(latestPerformance.recentAverageFinish);
              const timeIndex = Number(latestPerformance.recentTimeIndex);
              const gradeScore = Number(latestPerformance.lastRaceGradeScore);
              const gradeLabel = String(latestPerformance.lastRaceGradeLabel ?? "").trim();

              if (Number.isFinite(form)) nextFields.recentFormScore = Math.round(form * 10) / 10;
              if (Number.isFinite(avgFinish) && avgFinish > 0) nextFields.recentAverageFinish = Math.round(avgFinish * 10) / 10;
              if (Number.isFinite(timeIndex)) nextFields.recentTimeIndex = Math.round(timeIndex * 10) / 10;
              if (Number.isFinite(gradeScore)) nextFields.lastRaceGradeScore = Math.round(gradeScore * 10) / 10;
              if (gradeLabel) nextFields.lastRaceGradeLabel = gradeLabel;

              if (Object.keys(nextFields).some((key) => nextHorse[key as keyof Horse] !== nextFields[key as keyof Horse])) {
                touched = true;
                nextHorse = { ...nextHorse, ...nextFields };
              }
            }

            if (needsRatingsRecalc) {
              nextHorse = applyNetkeibaRatings({ ...nextHorse, jockeyPower: undefined, stablePower: undefined });
            }

            if (touched) changed = true;
            return touched ? nextHorse : horse;
          });

          return changed ? calculateOdds(updated) : prev;
        });
      } catch {
        // keep local values when refresh fails
      }
    };

    void refreshNetkeibaOdds();
    return () => {
      cancelled = true;
    };
  }, [selectedCourseId]);

  const handleRunSimulation = () => {
    if (!selectedCourse) return;
    setIsRunning(true);
    setTimeout(() => {
      const condition: RaceCondition = {
        courseId: selectedCourseId,
        trackBias: bias,
        groundCondition,
      };
      const simResults = runMonteCarlo(horses, selectedCourse, condition, 100);
      setResults(simResults);
      setIsRunning(false);
    }, 500);
  };

  const handlePostToX = () => {
    if (!results || !selectedCourse) return;

    const winnerId = results[0].horseId;
    const winner = horses.find((horse) => horse.id === winnerId);
    const favorite = [...horses].sort((a, b) => b.predictionCount - a.predictionCount)[0];
    const darkHorse = [...horses]
      .filter((horse) => (horse.simulatedOdds ?? 0) > 0 && (horse.realOdds ?? 0) > 0)
      .sort((a, b) => ((b.realOdds ?? 0) / (b.simulatedOdds ?? 1)) - ((a.realOdds ?? 0) / (a.simulatedOdds ?? 1)))[0];

    const groundLabel: Record<string, string> = { Firm: "良", Good: "稍重", Yielding: "重", Soft: "不良" };
    const text = [
      "AI競馬シミュレーション",
      `本命人気: ${favorite?.name ?? "-"} (${favorite?.predictionCount ?? 0})`,
      `シミュ勝ち馬: ${winner?.name ?? "-"} (勝率 ${results[0].winCount}%)`,
      `穴候補: ${darkHorse?.name ?? "-"} (市場 ${darkHorse?.realOdds?.toFixed(1) ?? "-"}倍 / シミュ ${darkHorse?.simulatedOdds?.toFixed(1) ?? "-"}倍)`,
      "",
      `コース: ${selectedCourse.name} / 馬場: ${groundLabel[groundCondition] ?? "良"}`,
      `#競馬 #シミュレーション ${selectedCourse.hashtag}`,
    ].join("\n");

    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  };

  if (!selectedCourse) {
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-500">今週のレースデータがありません。</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="mb-4 text-center">
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">AI競馬シミュレーター</h1>
          <p className="text-slate-400 text-xs mt-1">今週の重賞だけを対象に、能力値・人気値・近走補正を合わせて100回試走します。</p>
          {isArchive && (
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-amber-700 text-xs">
              <span>アーカイブ: {selectedCourse.name}</span>
              <Link href="/sim" className="text-blue-600 hover:underline ml-1">
                最新へ
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
            onGroundConditionChange={(c) => setGroundCondition(c as "Firm" | "Good" | "Yielding" | "Soft")}
          />

          <HorseInput horses={horses} onHorsesChange={setHorses} hashtag={selectedCourse.hashtag} />

          {!results && (
            <div className="text-center py-8">
              <button
                onClick={handleRunSimulation}
                disabled={isRunning}
                className="px-8 py-4 bg-blue-600 text-white text-xl font-bold rounded-full shadow-lg hover:bg-blue-700 hover:shadow-xl transition transform active:scale-95 disabled:opacity-50"
              >
                {isRunning ? "シミュレーション中..." : "100回シミュレーション"}
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
          <Link href="/" className="hover:text-slate-600 transition">
            トップへ
          </Link>
          <span className="mx-2">|</span>
          <Link href="/archive" className="hover:text-slate-600 transition">
            過去レース
          </Link>
          <span className="mx-2">|</span>
          Powered by Next.js & Tailwind CSS
        </footer>
      </div>
    </div>
  );
}
