"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ACTIVE_COURSES, COURSES } from "@/lib/courses";
import { Horse, RaceCondition } from "@/lib/types";
import { runMonteCarlo, calculateOdds } from "@/lib/simulation";
import { buildRaceAnalysisRows } from "@/lib/raceAnalysis";
import { getDefaultHorses } from "@/lib/defaultHorses";
import { applyNetkeibaRatings } from "@/lib/netkeibaRatings";
import { CourseConfig } from "@/components/CourseConfig";
import { HorseInput } from "@/components/HorseInput";
import { SimulationResults } from "@/components/SimulationResults";

const groundLabels: Record<RaceCondition["groundCondition"], string> = {
  Firm: "良",
  Good: "稍重",
  Yielding: "重",
  Soft: "不良",
};

const weatherLabels: Record<RaceCondition["weather"], string> = {
  Sunny: "晴れ",
  Cloudy: "曇り",
  Rain: "雨",
  Snow: "雪",
};

const windLabels: Record<RaceCondition["windDirection"], string> = {
  Headwind: "向かい風",
  Tailwind: "追い風",
  Crosswind: "横風",
};

const paceLabels: Record<RaceCondition["paceScenario"], string> = {
  Slow: "スロー",
  Average: "平均",
  Fast: "ハイ",
};

function createDefaultCondition(courseId: string): RaceCondition {
  const course = COURSES.find((entry) => entry.id === courseId);
  return {
    courseId,
    trackBias: course?.defaultBias ?? { innerOuter: 0, frontBack: 0 },
    groundCondition: "Firm",
    weather: "Sunny",
    windDirection: "Crosswind",
    windSpeed: 3,
    paceScenario: "Average",
  };
}

export default function SimulatorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-100">
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
  const initialCourseId = archiveParam
    ? COURSES.find((course) => course.id === archiveParam)?.id ?? fallbackCourse?.id
    : ACTIVE_COURSES[0]?.id ?? fallbackCourse?.id;
  const initialCourse = COURSES.find((course) => course.id === initialCourseId) ?? fallbackCourse;

  const [condition, setCondition] = useState<RaceCondition>(createDefaultCondition(initialCourseId ?? ""));
  const [horses, setHorses] = useState<Horse[]>(initialCourseId ? calculateOdds(getDefaultHorses(initialCourseId)) : []);
  const [results, setResults] = useState<{ horseId: string; winCount: number; bestTime: number }[] | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [liveConditionSummary, setLiveConditionSummary] = useState("");

  const selectedCourse = COURSES.find((course) => course.id === condition.courseId) ?? initialCourse;
  const isArchive = selectedCourse?.archived === true;

  const handleCourseChange = (courseId: string) => {
    setCondition(createDefaultCondition(courseId));
    setHorses(calculateOdds(getDefaultHorses(courseId)));
    setResults(null);
    setLiveConditionSummary("");
  };

  useEffect(() => {
    if (!condition.courseId) return;

    let cancelled = false;
    const currentCourseId = condition.courseId;
    const currentCourse = COURSES.find((course) => course.id === currentCourseId);
    if (currentCourse?.archived) return;

    const refreshNetkeibaOdds = async () => {
      try {
        const response = await fetch(`/api/netkeiba-odds?courseId=${encodeURIComponent(condition.courseId)}`, { cache: "no-store" });
        if (!response.ok || cancelled) return;

        const payload = (await response.json()) as {
          oddsByGate?: Record<string, number>;
          popularityByGate?: Record<string, number>;
          jockeyByGate?: Record<string, string>;
          performanceByGate?: Record<string, {
            recentFormScore?: number;
            recentAverageFinish?: number;
            recentTimeIndex?: number;
            lastRaceGradeScore?: number;
            lastRaceGradeLabel?: string;
            lastRaceDistance?: number;
          }>;
        };

        const oddsByGate = payload.oddsByGate ?? {};
        const popularityByGate = payload.popularityByGate ?? {};
        const jockeyByGate = payload.jockeyByGate ?? {};
        const performanceByGate = payload.performanceByGate ?? {};
        if (
          Object.keys(oddsByGate).length === 0 &&
          Object.keys(popularityByGate).length === 0 &&
          Object.keys(jockeyByGate).length === 0 &&
          Object.keys(performanceByGate).length === 0
        ) {
          return;
        }

        setHorses((previous) => {
          let changed = false;
          const updated = previous.map((horse) => {
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
              const averageFinish = Number(latestPerformance.recentAverageFinish);
              const timeIndex = Number(latestPerformance.recentTimeIndex);
              const gradeScore = Number(latestPerformance.lastRaceGradeScore);
              const gradeLabel = String(latestPerformance.lastRaceGradeLabel ?? "").trim();
              const lastDistance = Number(latestPerformance.lastRaceDistance);

              if (Number.isFinite(form)) nextFields.recentFormScore = Math.round(form * 10) / 10;
              if (Number.isFinite(averageFinish) && averageFinish > 0) nextFields.recentAverageFinish = Math.round(averageFinish * 10) / 10;
              if (Number.isFinite(timeIndex)) nextFields.recentTimeIndex = Math.round(timeIndex * 10) / 10;
              if (Number.isFinite(gradeScore)) nextFields.lastRaceGradeScore = Math.round(gradeScore * 10) / 10;
              if (gradeLabel) nextFields.lastRaceGradeLabel = gradeLabel;
              if (Number.isFinite(lastDistance) && lastDistance > 0) {
                nextFields.lastRaceDistance = Math.round(lastDistance);
                if (Number.isFinite(currentCourse?.distance)) {
                  nextFields.distanceChange = Number(currentCourse?.distance) - Math.round(lastDistance);
                }
              }

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

          return changed ? calculateOdds(updated) : previous;
        });
      } catch {
        // Ignore refresh errors and keep local state.
      }
    };

    const refreshLiveRaceConditions = async () => {
      try {
        const response = await fetch(`/api/live-race-conditions?courseId=${encodeURIComponent(currentCourseId)}`, { cache: "no-store" });
        if (!response.ok || cancelled) return;

        const payload = (await response.json()) as {
          weather?: RaceCondition["weather"];
          groundCondition?: RaceCondition["groundCondition"];
          windDirection?: RaceCondition["windDirection"];
          windSpeed?: number;
          windLabel?: string;
          observedAt?: string;
        };

        const nextFields: Partial<RaceCondition> = {};
        if (payload.weather) nextFields.weather = payload.weather;
        if (payload.groundCondition) nextFields.groundCondition = payload.groundCondition;
        if (payload.windDirection) nextFields.windDirection = payload.windDirection;
        const liveWindSpeed = Number(payload.windSpeed);
        if (Number.isFinite(liveWindSpeed) && liveWindSpeed >= 0) {
          nextFields.windSpeed = Math.max(0, Math.min(12, Math.round(liveWindSpeed)));
        }

        if (Object.keys(nextFields).length > 0) {
          setCondition((previous) => (previous.courseId === currentCourseId ? { ...previous, ...nextFields } : previous));
        }

        const summaryParts: string[] = [];
        if (payload.weather) summaryParts.push(`天気 ${weatherLabels[payload.weather]}`);
        if (payload.groundCondition) summaryParts.push(`馬場 ${groundLabels[payload.groundCondition]}`);
        if (payload.windDirection && Number.isFinite(liveWindSpeed)) {
          const windSuffix = payload.windLabel ? ` (${payload.windLabel}風)` : "";
          summaryParts.push(`風 ${windLabels[payload.windDirection]} ${Math.round(liveWindSpeed)}m/s${windSuffix}`);
        }
        if (payload.observedAt) {
          summaryParts.push(`取得 ${payload.observedAt.replace("T", " ").slice(5, 16)}`);
        }
        setLiveConditionSummary(summaryParts.length > 0 ? `実況反映: ${summaryParts.join(" / ")}` : "");
      } catch {
        // Ignore live-condition refresh errors and keep local scenario state.
      }
    };

    void Promise.allSettled([refreshNetkeibaOdds(), refreshLiveRaceConditions()]);
    const dayOfWeek = new Date().getDay();
    const pollMs = dayOfWeek === 0 || dayOfWeek === 6 ? 10 * 60 * 1000 : 0;
    const intervalId = pollMs > 0 ? window.setInterval(() => {
      void Promise.allSettled([refreshNetkeibaOdds(), refreshLiveRaceConditions()]);
    }, pollMs) : null;

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [condition.courseId]);

  const handleRunSimulation = () => {
    if (!selectedCourse) return;
    setIsRunning(true);
    window.setTimeout(() => {
      const simulationResults = runMonteCarlo(horses, selectedCourse, condition, 100);
      setResults(simulationResults);
      setIsRunning(false);
    }, 250);
  };

  const handlePostToX = () => {
    if (!results || !selectedCourse) return;

    const rows = buildRaceAnalysisRows(results, horses, selectedCourse, condition);
    const strongest = rows[0];
    const riskyFavorite = [...rows]
      .filter((row) => row.officialRank <= Math.min(4, rows.length))
      .sort((a, b) => (b.officialImplied - b.simWinRate) - (a.officialImplied - a.simWinRate))[0];
    const valueHorse = [...rows]
      .sort(
        (a, b) =>
          (b.simWinRate - b.officialImplied + Math.max(0, b.marketExpertGap) * 0.6) -
          (a.simWinRate - a.officialImplied + Math.max(0, a.marketExpertGap) * 0.6)
      )[0];
    const disagreement = [...rows].sort((a, b) => Math.abs(b.marketExpertGap) - Math.abs(a.marketExpertGap))[0];

    const text = [
      `${selectedCourse.name} 100回試走`,
      `勝ちやすい: ${strongest?.name ?? "-"} 試走${strongest?.simWinRate?.toFixed(1) ?? "-"}% / フェア${strongest?.fairOdds?.toFixed(1) ?? "-"}倍`,
      `危険人気: ${riskyFavorite?.name ?? "-"} 公式${riskyFavorite?.officialImplied?.toFixed(1) ?? "-"}% > 試走${riskyFavorite?.simWinRate?.toFixed(1) ?? "-"}%`,
      `妙味候補: ${valueHorse?.name ?? "-"} 公式${valueHorse?.officialOdds?.toFixed(1) ?? "-"}倍 / ガチ勢${valueHorse?.expertOdds?.toFixed(1) ?? "-"}倍`,
      `公式vsガチ勢: ${disagreement?.name ?? "-"} 差${disagreement?.marketExpertGap?.toFixed(1) ?? "-"}pt`,
      `条件: ${groundLabels[condition.groundCondition]} / ${weatherLabels[condition.weather]} / ${windLabels[condition.windDirection]}${condition.windSpeed}m / ${paceLabels[condition.paceScenario]}`,
      selectedCourse.hashtag,
    ].join("\n");

    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handlePostRecommendedPairToX = () => {
    if (!results || !selectedCourse) return;

    const rows = buildRaceAnalysisRows(results, horses, selectedCourse, condition);
    const strongest = rows[0];
    const valueHorse = [...rows]
      .sort(
        (a, b) =>
          (b.simWinRate - b.officialImplied + Math.max(0, b.marketExpertGap) * 0.6) -
          (a.simWinRate - a.officialImplied + Math.max(0, a.marketExpertGap) * 0.6)
      )[0];

    if (!strongest || !valueHorse) return;

    const hasSamePick = strongest.horseId === valueHorse.horseId;
    const text = [
      `${selectedCourse.name} \u63a8\u59682\u982d`,
      `\u7684\u4e2d\u7387\u306a\u3089 ${strongest.name} \u8a66\u8d70${strongest.simWinRate.toFixed(1)}% / \u30d5\u30a7\u30a2${strongest.fairOdds?.toFixed(1) ?? "-"}\u500d`,
      hasSamePick
        ? `\u56de\u53ce\u7387\u3082\u540c\u99ac ${valueHorse.name} \u516c\u5f0f${valueHorse.officialOdds?.toFixed(1) ?? "-"}\u500d / \u30ac\u30c1\u52e2${valueHorse.expertOdds?.toFixed(1) ?? "-"}\u500d`
        : `\u56de\u53ce\u7387\u306a\u3089 ${valueHorse.name} \u516c\u5f0f${valueHorse.officialOdds?.toFixed(1) ?? "-"}\u500d / \u30ac\u30c1\u52e2${valueHorse.expertOdds?.toFixed(1) ?? "-"}\u500d`,
      `\u6761\u4ef6: ${groundLabels[condition.groundCondition]} / ${weatherLabels[condition.weather]} / ${windLabels[condition.windDirection]}${condition.windSpeed}m / ${paceLabels[condition.paceScenario]}`,
      selectedCourse.hashtag,
    ].join("\n");

    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  };
  if (!selectedCourse) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">今週のレースデータがありません。</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 rounded-[28px] bg-slate-900 px-6 py-7 text-white shadow-xl">
          <h1 className="text-4xl font-black tracking-[0.12em] text-white md:text-6xl">KEIBA GAP LAB</h1>
          <p className="mt-3 text-sm font-semibold tracking-[0.2em] text-slate-300 md:text-base">能力と人気の乖離を見抜く</p>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
            今週の重賞だけを対象に、能力、血統適性、コース形状、馬場、天候、風、展開を織り込んで100回試走します。
            その上で、公式オッズ、俺プロ由来のガチ勢オッズ、評判指数を並べて、人気先行と妙味を切り分けます。
          </p>
          {isArchive && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-400/10 px-3 py-1 text-xs text-amber-200">
              <span>アーカイブ表示: {selectedCourse.name}</span>
              <Link href="/sim" className="font-semibold text-white underline-offset-2 hover:underline">
                最新へ戻る
              </Link>
            </div>
          )}
        </header>

        <div className="space-y-4">
          <CourseConfig
            selectedCourse={selectedCourse}
            condition={condition}
            onCourseChange={handleCourseChange}
            onConditionChange={(nextCondition) => {
              setCondition(nextCondition);
              setResults(null);
            }}
            liveConditionSummary={liveConditionSummary}
          />

          <HorseInput
            horses={horses}
            course={selectedCourse}
            condition={condition}
            onHorsesChange={(nextHorses) => {
              setHorses(nextHorses);
              setResults(null);
            }}
            hashtag={selectedCourse.hashtag}
          />

          {!results && (
            <div className="flex justify-center py-6">
              <button
                onClick={handleRunSimulation}
                disabled={isRunning}
                className="rounded-full bg-blue-600 px-8 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-blue-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isRunning ? "試走中..." : "100回試走して乖離を見る"}
              </button>
            </div>
          )}

          {results && (
            <SimulationResults
              results={results}
              horses={horses}
              course={selectedCourse}
              condition={condition}
              onReset={() => setResults(null)}
              onPostToRecommendedPairToX={handlePostRecommendedPairToX}
              onPostToX={handlePostToX}
              onRunAgain={handleRunSimulation}
              isRunning={isRunning}
            />
          )}
        </div>

        <footer className="mt-10 text-center text-xs text-slate-400">
          <Link href="/" className="transition hover:text-slate-600">
            トップへ
          </Link>
          <span className="mx-2">|</span>
          <Link href="/archive" className="transition hover:text-slate-600">
            レース回顧
          </Link>
          <span className="mx-2">|</span>
          Powered by Next.js
        </footer>
      </div>
    </div>
  );
}

