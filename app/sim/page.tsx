"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CourseConfig } from "@/components/CourseConfig";
import { HorseInput } from "@/components/HorseInput";
import { SimulationResults } from "@/components/SimulationResults";
import { ACTIVE_COURSES, COURSES } from "@/lib/courses";
import { getDefaultHorses } from "@/lib/defaultHorses";
import { dedupeHorses, findHorseDuplicates } from "@/lib/horseIntegrity";
import { applyNetkeibaRatings } from "@/lib/netkeibaRatings";
import { buildRaceAnalysisRows } from "@/lib/raceAnalysis";
import { calculateOdds, runMonteCarlo } from "@/lib/simulation";
import { Course, Horse, RaceCondition } from "@/lib/types";

const groundLabels: Record<RaceCondition["groundCondition"], string> = {
  Firm: "良",
  Good: "稍重",
  Yielding: "重",
  Soft: "不良",
};

const weatherLabels: Record<RaceCondition["weather"], string> = {
  Sunny: "晴",
  Cloudy: "曇",
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

const WEEKEND_ODDS_POLL_MS = 5 * 60 * 1000;
const RACE_DAY_FINAL_WINDOW_POLL_MS = 2 * 60 * 1000;
const WEEKEND_CONDITIONS_POLL_MS = 10 * 60 * 1000;

type NetkeibaOddsPayload = {
  fetchedAt?: string;
  oddsByGate?: Record<string, number>;
  popularityByGate?: Record<string, number>;
  jockeyByGate?: Record<string, string>;
  performanceByGate?: Record<
    string,
    {
      recentFormScore?: number;
      recentAverageFinish?: number;
      recentTimeIndex?: number;
      lastRaceGradeScore?: number;
      lastRaceGradeLabel?: string;
      lastRaceDistance?: number;
    }
  >;
};

type LiveRaceConditionsPayload = {
  weather?: RaceCondition["weather"];
  groundCondition?: RaceCondition["groundCondition"];
  windDirection?: RaceCondition["windDirection"];
  windSpeed?: number;
  windLabel?: string;
  observedAt?: string;
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

function buildInitialHorses(courseId: string): Horse[] {
  return calculateOdds(dedupeHorses(getDefaultHorses(courseId)));
}

function getCourseRaceDay(day?: string) {
  if (day === "Sat") return 6;
  if (day === "Sun") return 0;
  return null;
}

function getCourseRaceNumber(courseId?: string) {
  const match = courseId?.match(/(\d{2})$/);
  return match ? Number(match[1]) : null;
}

function getOddsRefreshIntervalMs(course?: Pick<Course, "id" | "day">) {
  const now = new Date();
  const today = now.getDay();
  if (today !== 0 && today !== 6) return 0;

  const raceDay = getCourseRaceDay(course?.day);
  const raceNumber = getCourseRaceNumber(course?.id);
  const isSameRaceDay = raceDay !== null && today === raceDay;
  const isFinalWindow = now.getHours() >= 13 && now.getHours() < 17;

  if (isSameRaceDay && isFinalWindow && (raceNumber === null || raceNumber >= 10)) {
    return RACE_DAY_FINAL_WINDOW_POLL_MS;
  }

  return WEEKEND_ODDS_POLL_MS;
}

function getLiveConditionRefreshIntervalMs() {
  const dayOfWeek = new Date().getDay();
  return dayOfWeek === 0 || dayOfWeek === 6 ? WEEKEND_CONDITIONS_POLL_MS : 0;
}

function formatRefreshTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function getOddsRefreshLabel(course?: Pick<Course, "id" | "day">) {
  const intervalMs = getOddsRefreshIntervalMs(course);
  if (intervalMs === 0) return "週末のみ";
  if (intervalMs === RACE_DAY_FINAL_WINDOW_POLL_MS) return "当日午後は2分ごと";
  return "週末は5分ごと";
}

function buildOddsRefreshSummary(lastFetchedAt: string, course?: Pick<Course, "id" | "day">) {
  const refreshLabel = getOddsRefreshLabel(course);
  if (!lastFetchedAt) {
    return `一般オッズ: 未更新 / 自動更新 ${refreshLabel}`;
  }

  return `一般オッズ最終取得: ${formatRefreshTimestamp(lastFetchedAt)} / 自動更新 ${refreshLabel}`;
}

export default function SimulatorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-100">
          <p className="text-lg text-slate-500">読み込み中...</p>
        </div>
      }
    >
      <SimulatorContent />
    </Suspense>
  );
}

function SimulatorContent() {
  const searchParams = useSearchParams();
  const courseParam = searchParams.get("course");
  const archiveParam = searchParams.get("archive");
  const fallbackCourse = COURSES[0];
  const requestedCourseId = courseParam ?? archiveParam;
  const initialCourseId = requestedCourseId
    ? COURSES.find((course) => course.id === requestedCourseId)?.id ?? fallbackCourse?.id
    : ACTIVE_COURSES[0]?.id ?? fallbackCourse?.id;
  const initialCourse = COURSES.find((course) => course.id === initialCourseId) ?? fallbackCourse;

  const [condition, setCondition] = useState<RaceCondition>(createDefaultCondition(initialCourseId ?? ""));
  const [horses, setHorses] = useState<Horse[]>(initialCourseId ? buildInitialHorses(initialCourseId) : []);
  const [results, setResults] = useState<{ horseId: string; winCount: number; bestTime: number }[] | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [liveConditionSummary, setLiveConditionSummary] = useState("");
  const [oddsLastFetchedAt, setOddsLastFetchedAt] = useState("");
  const [oddsRefreshError, setOddsRefreshError] = useState("");
  const [isRefreshingOdds, setIsRefreshingOdds] = useState(false);
  const [manualOddsRefreshKey, setManualOddsRefreshKey] = useState(0);
  const mountedRef = useRef(true);
  const oddsLastFetchedAtRef = useRef("");

  const selectedCourse = COURSES.find((course) => course.id === condition.courseId) ?? initialCourse;
  const isArchive = selectedCourse?.archived === true;

  useEffect(() => {
    oddsLastFetchedAtRef.current = oddsLastFetchedAt;
  }, [oddsLastFetchedAt]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleCourseChange = (courseId: string) => {
    setCondition(createDefaultCondition(courseId));
    setHorses(buildInitialHorses(courseId));
    setResults(null);
    setLiveConditionSummary("");
    setOddsLastFetchedAt("");
    setOddsRefreshError("");
  };

  useEffect(() => {
    if (!condition.courseId) return;

    let cancelled = false;
    const currentCourseId = condition.courseId;
    const currentCourse = COURSES.find((course) => course.id === currentCourseId);
    if (currentCourse?.archived) return;

    const refreshNetkeibaOdds = async () => {
      setIsRefreshingOdds(true);

      try {
        const response = await fetch(`/api/netkeiba-odds?courseId=${encodeURIComponent(currentCourseId)}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`failed to refresh odds: ${response.status}`);
        }

        const payload = (await response.json()) as NetkeibaOddsPayload;
        if (cancelled) return;

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
          setOddsRefreshError("一般オッズの更新データが見つからなかったため、登録済みデータを表示しています。");
          return;
        }

        setOddsLastFetchedAt(payload.fetchedAt ?? new Date().toISOString());
        setOddsRefreshError("");

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
                if (currentCourse && Number.isFinite(currentCourse.distance)) {
                  nextFields.distanceChange = Number(currentCourse.distance) - Math.round(lastDistance);
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

          if (!changed) return previous;

          const duplicates = findHorseDuplicates(updated);
          if (duplicates.length > 0) {
            console.warn("[sim] duplicate horses detected during live refresh", currentCourseId, duplicates, updated);
          }

          return calculateOdds(dedupeHorses(updated));
        });
      } catch {
        if (!cancelled) {
          setOddsRefreshError(
            oddsLastFetchedAtRef.current
              ? "一般オッズの更新に失敗したため、前回取得した値を表示しています。"
              : "一般オッズの取得に失敗したため、登録済みデータを表示しています。"
          );
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setIsRefreshingOdds(false);
        }
      }
    };

    let timerId: number | null = null;
    const scheduleNext = () => {
      const pollMs = getOddsRefreshIntervalMs(currentCourse);
      if (pollMs <= 0 || cancelled) return;

      timerId = window.setTimeout(async () => {
        await refreshNetkeibaOdds();
        if (!cancelled) {
          scheduleNext();
        }
      }, pollMs);
    };

    void refreshNetkeibaOdds();
    scheduleNext();

    return () => {
      cancelled = true;
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [condition.courseId, manualOddsRefreshKey]);

  useEffect(() => {
    if (!condition.courseId) return;

    let cancelled = false;
    const currentCourseId = condition.courseId;
    const currentCourse = COURSES.find((course) => course.id === currentCourseId);
    if (currentCourse?.archived) return;

    const refreshLiveRaceConditions = async () => {
      try {
        const response = await fetch(`/api/live-race-conditions?courseId=${encodeURIComponent(currentCourseId)}`, { cache: "no-store" });
        if (!response.ok || cancelled) return;

        const payload = (await response.json()) as LiveRaceConditionsPayload;
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
          const windSuffix = payload.windLabel ? ` (${payload.windLabel})` : "";
          summaryParts.push(`風 ${windLabels[payload.windDirection]} ${Math.round(liveWindSpeed)}m/s${windSuffix}`);
        }
        if (payload.observedAt) {
          summaryParts.push(`観測 ${payload.observedAt.replace("T", " ").slice(5, 16)}`);
        }
        setLiveConditionSummary(summaryParts.length > 0 ? `ライブ馬場情報: ${summaryParts.join(" / ")}` : "");
      } catch {
        // Keep local scenario controls available even if live condition refresh fails.
      }
    };

    let timerId: number | null = null;
    const scheduleNext = () => {
      const pollMs = getLiveConditionRefreshIntervalMs();
      if (pollMs <= 0 || cancelled) return;

      timerId = window.setTimeout(async () => {
        await refreshLiveRaceConditions();
        if (!cancelled) {
          scheduleNext();
        }
      }, pollMs);
    };

    void refreshLiveRaceConditions();
    scheduleNext();

    return () => {
      cancelled = true;
      if (timerId !== null) {
        window.clearTimeout(timerId);
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
    const valueHorse = [...rows].sort(
      (a, b) =>
        (b.simWinRate - b.officialImplied + Math.max(0, b.marketExpertGap) * 0.6)
        - (a.simWinRate - a.officialImplied + Math.max(0, a.marketExpertGap) * 0.6)
    )[0];
    const disagreement = [...rows].sort((a, b) => Math.abs(b.marketExpertGap) - Math.abs(a.marketExpertGap))[0];

    const text = [
      `${selectedCourse.name} 100回シミュレーション`,
      `軸候補 ${strongest?.name ?? "-"} 勝率${strongest?.simWinRate?.toFixed(1) ?? "-"}% / フェア${strongest?.fairOdds?.toFixed(1) ?? "-"}倍`,
      `${riskyFavorite?.signalDetailLabel ?? "市場過熱"}: ${riskyFavorite?.name ?? "-"} 公式${riskyFavorite?.officialImplied?.toFixed(1) ?? "-"}% > 試走${riskyFavorite?.simWinRate?.toFixed(1) ?? "-"}%`,
      `妙味候補 ${valueHorse?.name ?? "-"} 公式${valueHorse?.officialOdds?.toFixed(1) ?? "-"}倍 / ガチ勢${valueHorse?.expertOdds?.toFixed(1) ?? "-"}倍`,
      `市場vsガチ勢: ${disagreement?.name ?? "-"} 差${disagreement?.marketExpertGap?.toFixed(1) ?? "-"}pt`,
      `条件: ${groundLabels[condition.groundCondition]} / ${weatherLabels[condition.weather]} / ${windLabels[condition.windDirection]}${condition.windSpeed}m / ${paceLabels[condition.paceScenario]}`,
      selectedCourse.hashtag,
    ].join("\n");

    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handlePostToMarketFocusToX = () => {
    if (!results || !selectedCourse) return;

    const rows = buildRaceAnalysisRows(results, horses, selectedCourse, condition);
    const marketFocusHorse = [...rows]
      .filter((row) => row.officialRank <= Math.min(4, rows.length))
      .sort((a, b) => (b.officialImplied - b.simWinRate) - (a.officialImplied - a.simWinRate))[0];

    if (!marketFocusHorse) return;

    const text = [
      `${selectedCourse.name} 市場注目馬`,
      marketFocusHorse.name,
      marketFocusHorse.signalDetailLabel ?? "市場過熱",
      `公式見立て ${marketFocusHorse.officialImplied.toFixed(1)}% / 試走 ${marketFocusHorse.simWinRate.toFixed(1)}%`,
      `ガチ勢見立て ${marketFocusHorse.expertImplied.toFixed(1)}% / 公式との差 ${marketFocusHorse.officialGap.toFixed(1)}pt`,
      marketFocusHorse.signalReason ?? "",
      `条件: ${groundLabels[condition.groundCondition]} / ${weatherLabels[condition.weather]} / ${windLabels[condition.windDirection]}${condition.windSpeed}m / ${paceLabels[condition.paceScenario]}`,
      selectedCourse.hashtag,
    ].filter(Boolean).join("\n");

    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handlePostRecommendedPairToX = () => {
    if (!results || !selectedCourse) return;

    const rows = buildRaceAnalysisRows(results, horses, selectedCourse, condition);
    const strongest = rows[0];
    const valueHorse = [...rows].sort(
      (a, b) =>
        (b.simWinRate - b.officialImplied + Math.max(0, b.marketExpertGap) * 0.6)
        - (a.simWinRate - a.officialImplied + Math.max(0, a.marketExpertGap) * 0.6)
    )[0];

    if (!strongest || !valueHorse) return;

    const hasSamePick = strongest.horseId === valueHorse.horseId;
    const text = [
      `${selectedCourse.name} 推奨2頭`,
      `的中率なら ${strongest.name} 試走${strongest.simWinRate.toFixed(1)}% / フェア${strongest.fairOdds?.toFixed(1) ?? "-"}倍`,
      hasSamePick
        ? `回収率も同馬 ${valueHorse.name} 公式${valueHorse.officialOdds?.toFixed(1) ?? "-"}倍 / ガチ勢${valueHorse.expertOdds?.toFixed(1) ?? "-"}倍`
        : `回収率なら ${valueHorse.name} 公式${valueHorse.officialOdds?.toFixed(1) ?? "-"}倍 / ガチ勢${valueHorse.expertOdds?.toFixed(1) ?? "-"}倍`,
      `条件: ${groundLabels[condition.groundCondition]} / ${weatherLabels[condition.weather]} / ${windLabels[condition.windDirection]}${condition.windSpeed}m / ${paceLabels[condition.paceScenario]}`,
      selectedCourse.hashtag,
    ].join("\n");

    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  };

  if (!selectedCourse) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">レースデータが見つかりません。</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 rounded-[28px] bg-slate-900 px-6 py-7 text-white shadow-xl">
          <h1 className="text-4xl font-black tracking-[0.12em] text-white md:text-6xl">KEIBA GAP LAB</h1>
          <p className="mt-3 text-sm font-semibold tracking-[0.2em] text-slate-300 md:text-base">能力値と市場価格のズレを並べて見る</p>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
            今週のG1-G3・リステッド・オープン特別を対象に、能力、血統、適性、馬場、風、ペースを調整しながら100回シミュレーションします。
            その上で、公式オッズ、一般オッズ、プロ勢オッズのズレを並べて、人気と期待値の差を見つけます。
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
            oddsRefreshSummary={buildOddsRefreshSummary(oddsLastFetchedAt, selectedCourse)}
            oddsRefreshWarning={oddsRefreshError}
            isRefreshingOdds={isRefreshingOdds}
            onRefreshOdds={() => {
              setOddsRefreshError("");
              setManualOddsRefreshKey((previous) => previous + 1);
            }}
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
                {isRunning ? "シミュレーション中..." : "100回シミュレーションして期待値を見る"}
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
              onPostToMarketFocusToX={handlePostToMarketFocusToX}
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
            レース履歴
          </Link>
          <span className="mx-2">|</span>
          Powered by Next.js
        </footer>
      </div>
    </div>
  );
}
