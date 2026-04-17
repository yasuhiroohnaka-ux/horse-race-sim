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
import { buildPredictionSnapshot } from "@/lib/predictionSnapshots";
import { buildRaceAnalysisRows } from "@/lib/raceAnalysis";
import { MONTE_CARLO_RUNS, MONTE_CARLO_RUNS_LABEL } from "@/lib/simulationConfig";
import { calculateOdds, runMonteCarlo } from "@/lib/simulation";
import { pickTanpukuPair } from "@/lib/tanpukuSelection.mjs";
import { buildPickExplanations, buildDisagreementExplanation } from "@/lib/pickExplanations";
import { buildManualPreRacePayload } from "@/lib/xPostPayload.mjs";
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
  gateByHorseKey?: Record<string, number>;
  oddsByHorseKey?: Record<string, number>;
  popularityByGate?: Record<string, number>;
  popularityByHorseKey?: Record<string, number>;
  jockeyByGate?: Record<string, string>;
  jockeyByHorseKey?: Record<string, string>;
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
  performanceByHorseKey?: Record<
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

type RunningStylePayload = {
  runningStyles?: Record<string, Horse["runningStyle"]>;
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

function normalizeHorseKey(name: string) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\u3000/g, "")
    .replace(/\s+/g, "")
    .replace(/[\u30fb\uff65\-_.]/g, "");
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tanpukuPair, setTanpukuPair] = useState<any>(null);
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
    setResults(null); setTanpukuPair(null);
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
        const gateByHorseKey = payload.gateByHorseKey ?? {};
        const oddsByHorseKey = payload.oddsByHorseKey ?? {};
        const popularityByGate = payload.popularityByGate ?? {};
        const popularityByHorseKey = payload.popularityByHorseKey ?? {};
        const jockeyByGate = payload.jockeyByGate ?? {};
        const jockeyByHorseKey = payload.jockeyByHorseKey ?? {};
        const performanceByGate = payload.performanceByGate ?? {};
        const performanceByHorseKey = payload.performanceByHorseKey ?? {};
        if (
          Object.keys(gateByHorseKey).length === 0 &&
          Object.keys(oddsByGate).length === 0 &&
          Object.keys(oddsByHorseKey).length === 0 &&
          Object.keys(popularityByGate).length === 0 &&
          Object.keys(popularityByHorseKey).length === 0 &&
          Object.keys(jockeyByGate).length === 0 &&
          Object.keys(jockeyByHorseKey).length === 0 &&
          Object.keys(performanceByGate).length === 0 &&
          Object.keys(performanceByHorseKey).length === 0
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
            const horseKey = normalizeHorseKey(horse.name);

            const latestGate = Number(gateByHorseKey[horseKey]);
            if (Number.isFinite(latestGate) && latestGate > 0 && nextHorse.gateNumber !== latestGate) {
              touched = true;
              nextHorse = { ...nextHorse, gateNumber: Math.round(latestGate) };
            }

            const latestOdds = Number(oddsByHorseKey[horseKey] ?? oddsByGate[String(horse.gateNumber)]);
            if (Number.isFinite(latestOdds) && latestOdds > 0) {
              const roundedLatestOdds = Math.round(latestOdds * 10) / 10;
              const currentOdds = Number(horse.realOdds ?? 0);
              if (Math.abs(currentOdds - roundedLatestOdds) >= 0.05) {
                touched = true;
                needsRatingsRecalc = true;
                nextHorse = { ...nextHorse, realOdds: roundedLatestOdds };
              }
            }

            const latestPopularity = Math.round(
              Number(popularityByHorseKey[horseKey] ?? popularityByGate[String(horse.gateNumber)])
            );
            if (Number.isFinite(latestPopularity) && latestPopularity > 0 && nextHorse.predictionCount !== latestPopularity) {
              touched = true;
              nextHorse = { ...nextHorse, predictionCount: latestPopularity };
            }

            const latestJockey = String(jockeyByHorseKey[horseKey] ?? jockeyByGate[String(horse.gateNumber)] ?? "").trim();
            if (latestJockey && nextHorse.jockey !== latestJockey) {
              touched = true;
              needsRatingsRecalc = true;
              nextHorse = { ...nextHorse, jockey: latestJockey };
            }

            const latestPerformance = performanceByHorseKey[horseKey] ?? performanceByGate[String(horse.gateNumber)];
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

          const sortedUpdated = [...dedupeHorses(updated)].sort((a, b) => (a.gateNumber ?? 999) - (b.gateNumber ?? 999));
          const duplicates = findHorseDuplicates(sortedUpdated);
          if (duplicates.length > 0) {
            console.warn("[sim] duplicate horses detected during live refresh", currentCourseId, duplicates, sortedUpdated);
          }

          return calculateOdds(sortedUpdated);
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

    const refreshRunningStyles = async () => {
      try {
        const response = await fetch(`/api/horse-running-style?courseId=${encodeURIComponent(currentCourseId)}`, {
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;

        const payload = (await response.json()) as RunningStylePayload;
        const runningStyles = payload.runningStyles ?? {};

        setHorses((previous) => {
          let changed = false;
          const updated = previous.map((horse) => {
            const nextRunningStyle = runningStyles[horse.id];
            if (!nextRunningStyle || horse.runningStyle === nextRunningStyle) {
              return horse;
            }

            changed = true;
            return { ...horse, runningStyle: nextRunningStyle };
          });

          return changed ? calculateOdds(updated) : previous;
        });
      } catch {
        // Keep local edits usable even when the persistence endpoint is unavailable.
      }
    };

    void refreshRunningStyles();

    return () => {
      cancelled = true;
    };
  }, [condition.courseId]);

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
      const simulationResults = runMonteCarlo(horses, selectedCourse, condition, MONTE_CARLO_RUNS);
      setResults(simulationResults);

      let pair: ReturnType<typeof pickTanpukuPair> | null = null;

      // Compute tanpuku pair from scored horses
      try {
        const raceForTanpuku = {
          courseId: selectedCourse.id,
          label: selectedCourse.name,
          distance: selectedCourse.distance,
          straightLength: selectedCourse.straightLength,
          trackBias: { innerOuter: 0, frontBack: 0 },
          horses: horses.map((h) => ({ ...h })),
        };
        pair = pickTanpukuPair(raceForTanpuku, false, true);
        setTanpukuPair(pair);
      } catch {
        setTanpukuPair(null);
      }

      setIsRunning(false);

      void (async () => {
        try {
          const snapshot = await buildPredictionSnapshot({
            results: simulationResults,
            horses,
            course: selectedCourse,
            condition,
            simulationCount: MONTE_CARLO_RUNS,
            oddsFetchedAt: oddsLastFetchedAt || null,
            oddsSource: horses.find((horse) => String(horse.oddsSource ?? "").trim())?.oddsSource ?? null,
            opponentOverride: pair?.opponentPick
              ? {
                  horseId: pair.opponentPick.horse.id,
                  selectionMethod: "stable_next",
                  score: pair.opponentPick.placeScore,
                  pairScoreGap: pair.opponentPick.scoreGap ?? null,
                }
              : null,
            valueHorseId: pair?.widePick?.horse?.id ?? pair?.valuePick?.horse?.id ?? null,
          });

          const response = await fetch("/api/prediction-snapshots", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify(snapshot),
          });

          if (!response.ok) {
            throw new Error(`failed to save prediction snapshot: ${response.status}`);
          }
        } catch (error) {
          console.warn("[sim] failed to persist prediction snapshot", error);
        }
      })();
    }, 250);
  };

  // --- structured X post handler (Issue 8: unified builder) ---

  const handlePostPreRaceToX = () => {
    if (!results || !selectedCourse) return;

    // tanpukuPair-based structured posting (builder priority)
    if (tanpukuPair?.winPick) {
      const rows = buildRaceAnalysisRows(results, horses, selectedCourse, condition);
      const simBest = rows[0] ?? null;
      const simHorseId = simBest?.horseId ?? null;
      const agreementStatus: "agree" | "disagree" | "unknown" =
        simHorseId && tanpukuPair.winPick
          ? simHorseId === tanpukuPair.winPick.horse.id ? "agree" : "disagree"
          : "unknown";
      const simEntry = simHorseId
        ? tanpukuPair.scored.find((e: { horse: { id: string } }) => e.horse.id === simHorseId) ?? null
        : null;
      const selectionComment = buildDisagreementExplanation(agreementStatus, simEntry, tanpukuPair.winPick) ?? "";

      const payload = buildManualPreRacePayload({
        raceName: selectedCourse.name,
        hashtag: selectedCourse.hashtag,
        tanpukuPair,
        simBest: simBest ? { horseId: simBest.horseId, horseName: simBest.name, winProb: simBest.simWinRate / 100 } : null,
        selectionComment,
      });

      console.log("[Issue8] pre_race payload", payload);
      window.open(`https://twitter.com/intent/tweet?text=${payload.encodedText ?? encodeURIComponent(payload.text)}`, "_blank");
      return;
    }

    // Fallback: legacy format when tanpukuPair not available
    const rows = buildRaceAnalysisRows(results, horses, selectedCourse, condition);
    const strongest = rows[0];
    const text = [
      `${selectedCourse.name} ${MONTE_CARLO_RUNS_LABEL}シミュレーション`,
      `軸候補 ${strongest?.name ?? "-"} 勝率${strongest?.simWinRate?.toFixed(1) ?? "-"}%`,
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
            今週の重賞、L、OPに加えて、特別戦と最終12Rまで対象を広げ、能力、血統、適性、馬場、風、ペースを調整しながら{MONTE_CARLO_RUNS_LABEL}シミュレーションします。
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
              setResults(null); setTanpukuPair(null);
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
              setResults(null); setTanpukuPair(null);
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
                {isRunning ? "シミュレーション中..." : `${MONTE_CARLO_RUNS_LABEL}シミュレーションして期待値を見る`}
              </button>
            </div>
          )}

          {results && (
            <>
              <SimulationResults
                results={results}
                horses={horses}
                course={selectedCourse}
                condition={condition}
                onReset={() => { setResults(null); setTanpukuPair(null); }}
                onPostToMarketFocusToX={handlePostToMarketFocusToX}
                onPostPreRaceToX={handlePostPreRaceToX}
                onRunAgain={handleRunSimulation}
                isRunning={isRunning}
              />
              {tanpukuPair && (() => {
                const rows = buildRaceAnalysisRows(results, horses, selectedCourse, condition);
                const simHonmei = rows[0] ?? null;
                const winPick = tanpukuPair.winPick;
                const opponentPick = tanpukuPair.opponentPick;
                const widePick = tanpukuPair.widePick ?? tanpukuPair.valuePick;
                const simHorseId = simHonmei?.horseId ?? null;
                const agreementStatus: "agree" | "disagree" | "unknown" =
                  simHorseId && winPick ? (simHorseId === winPick.horse.id ? "agree" : "disagree") : "unknown";
                const simEntry = simHorseId ? tanpukuPair.scored.find((e: { horse: { id: string } }) => e.horse.id === simHorseId) : null;
                const explanations = buildPickExplanations({ agreementStatus, simEntry, winEntry: winPick, opponentEntry: opponentPick, wideEntry: widePick });

                return (
                  <div className="mt-4 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
                    <h3 className="text-base font-bold text-violet-900">単複推奨パネル</h3>
                    <p className="mt-1 text-xs text-violet-600">v{tanpukuPair.scoringVersion}</p>

                    <div className="mt-4 flex items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${agreementStatus === "agree" ? "bg-emerald-100 text-emerald-800" : agreementStatus === "disagree" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                        {agreementStatus === "agree" ? "一致" : agreementStatus === "disagree" ? "不一致" : "比較不可"}
                      </span>
                      <span className="text-xs text-slate-600">{explanations.agreement}</span>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {/* シミュ本命 */}
                      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
                        <p className="text-xs font-semibold text-sky-800">シミュ本命</p>
                        <p className="mt-1 text-sm font-bold text-slate-800">{simHonmei?.name ?? "-"}</p>
                        {simEntry && (
                          <p className="mt-1 text-[11px] text-slate-500">
                            winProb {(simEntry.winProb * 100).toFixed(0)}% / placeScore {simEntry.placeScore.toFixed(3)}
                          </p>
                        )}
                        <p className="mt-2 text-xs leading-relaxed text-sky-700">{explanations.simHonmei}</p>
                      </div>

                      {/* 単複本命 */}
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                        <p className="text-xs font-semibold text-amber-800">単複本命</p>
                        <p className="mt-1 text-sm font-bold text-slate-800">{winPick?.horse?.name ?? "-"}</p>
                        {winPick && (
                          <div className="mt-1 space-y-0.5 text-[11px] text-slate-500">
                            <p>placeScore {winPick.placeScore.toFixed(3)} / scoreGap {winPick.scoreGap.toFixed(3)}</p>
                            <p>placeProb {(winPick.placeProb * 100).toFixed(0)}% / top3安定 {(winPick.top3Stability * 100).toFixed(0)}%</p>
                            {winPick.overbetLabel && <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-red-700">{winPick.overbetLabel}</span>}
                          </div>
                        )}
                        {winPick?.classificationHint && (
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              winPick.classificationHint.classification === "win" ? "bg-orange-100 text-orange-800"
                                : winPick.classificationHint.classification === "place" ? "bg-blue-100 text-blue-800"
                                : "bg-slate-200 text-slate-600"
                            }`}>
                              {winPick.classificationHint.classification === "win" ? "単勝向き"
                                : winPick.classificationHint.classification === "place" ? "複勝向き"
                                : "見送り"}
                            </span>
                            {winPick.classificationHint.reason && (
                              <span className="text-[10px] text-slate-500">{winPick.classificationHint.reason}</span>
                            )}
                          </div>
                        )}
                        <p className="mt-2 text-xs leading-relaxed text-amber-700">{explanations.tanpukuHonmei}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
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
