"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SiteRail } from "@/components/SiteRail";
import { CourseConfig } from "@/components/CourseConfig";
import { HorseInput } from "@/components/HorseInput";
import { SimulationResults } from "@/components/SimulationResults";
import { ACTIVE_COURSES, COURSES } from "@/lib/courses";
import { getCourseGrade } from "@/lib/courseGrades";
import { getDefaultHorses } from "@/lib/defaultHorses";
import { dedupeHorses, findHorseDuplicates } from "@/lib/horseIntegrity";
import { applyNetkeibaRatings } from "@/lib/netkeibaRatings";
import { filterToOfficialEntryRoster, normalizeHorseEntryKey } from "@/lib/officialEntryRoster";
import { buildSnapshotCourseMeta } from "@/lib/predictionSnapshotCourseMeta";
import { buildPredictionSnapshot } from "@/lib/predictionSnapshots";
import { buildBettingExpectationView, type ExpectationGrade } from "@/lib/bettingExpectation";
import { buildRaceAnalysisRows, type RaceAnalysisRow } from "@/lib/raceAnalysis";
import { MONTE_CARLO_RUNS, MONTE_CARLO_RUNS_LABEL } from "@/lib/simulationConfig";
import { calculateOdds, runMonteCarlo } from "@/lib/simulation";
import { pickTanpukuPair } from "@/lib/tanpukuSelection.mjs";
import { buildPickExplanations } from "@/lib/pickExplanations";
import { buildTanpukuPreRacePostText, type CategoryReturnStatForPost, type TanpukuPostHorse, type TanpukuWideRecommendation, type TanpukuClassificationHint } from "@/lib/tanpukuXPost";
import { Course, Horse, PredictionSnapshotExpectation, RaceCondition } from "@/lib/types";

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
  overlap?: number;
  entryCount?: number;
  entryHorseNames?: string[];
  entryHorseKeys?: string[];
  entryGateNumbers?: number[];
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
  raceDayNoOddsExclusionsActive?: boolean;
  includedByNoOddsGates?: number[];
  includedByNoOddsHorseKeys?: string[];
  excludedByNoOddsGates?: number[];
  excludedByNoOddsHorseKeys?: string[];
  excludedByNoOddsHorseNames?: string[];
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

type PerformancePayload = {
  categoryReturnStats?: CategoryReturnStatForPost[];
};

type TanpukuPairForPost = ReturnType<typeof pickTanpukuPair>;

function buildTopHorsesForTanpukuPost(
  pair: TanpukuPairForPost | null,
  fallbackRows: RaceAnalysisRow[]
): TanpukuPostHorse[] {
  const picked: TanpukuPostHorse[] = [];
  const seen = new Set<string>();

  const addPick = (
    entry: { horse?: { id?: string | null; name?: string | null } } | null | undefined,
    mark: NonNullable<TanpukuPostHorse["mark"]>,
    markNote: string
  ) => {
    const horseName = String(entry?.horse?.name ?? "").trim();
    if (!horseName) return;
    const key = String(entry?.horse?.id ?? horseName);
    if (seen.has(key)) return;
    seen.add(key);
    picked.push({ horseName, mark, markNote });
  };

  addPick(pair?.winPick, "◎", "単複本命");
  addPick(pair?.opponentPick, "○", "相手候補");

  const trialLeader = fallbackRows[0];
  if (trialLeader && !seen.has(trialLeader.horseId)) {
    seen.add(trialLeader.horseId);
    picked.push({ horseName: trialLeader.name, mark: "▲", markNote: "試走1位" });
  }

  return picked;
}

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
  return normalizeHorseEntryKey(name);
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

function getGradeTone(grade: ExpectationGrade) {
  switch (grade) {
    case "S":
      return "border-hit bg-hit-wash text-hit";
    case "A":
      return "border-info bg-info-wash text-info";
    case "B":
      return "border-note bg-note-wash text-note";
    default:
      return "border-line bg-paper text-ink-2";
  }
}

function GradeBadge({ label, grade }: { label: string; grade: ExpectationGrade }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${getGradeTone(grade)}`}>
      <span>{label}</span>
      <span className="text-sm leading-none">{grade}</span>
    </span>
  );
}

async function loadCategoryReturnStatsForPost(): Promise<CategoryReturnStatForPost[] | null> {
  try {
    const response = await fetch("/api/performance", { cache: "no-store" });
    if (!response.ok) return null;

    const payload = (await response.json()) as PerformancePayload;
    return Array.isArray(payload.categoryReturnStats) ? payload.categoryReturnStats : null;
  } catch {
    return null;
  }
}

export default function SimulatorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-paper">
          <p className="text-lg text-ink-2">読み込み中...</p>
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
  const runningStyleMutationRef = useRef(0);
  const router = useRouter();

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
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("course", courseId);
    nextParams.delete("archive");
    router.replace(`/sim?${nextParams.toString()}`, { scroll: false });
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
        const includedByNoOddsGates = new Set((payload.includedByNoOddsGates ?? []).map((gate) => String(gate)));
        const includedByNoOddsHorseKeys = new Set(payload.includedByNoOddsHorseKeys ?? []);
        const excludedByNoOddsGates = new Set((payload.excludedByNoOddsGates ?? []).map((gate) => String(gate)));
        const excludedByNoOddsHorseKeys = new Set(payload.excludedByNoOddsHorseKeys ?? []);
        const officialEntryHorseKeys = payload.entryHorseKeys?.length ? payload.entryHorseKeys : Object.keys(gateByHorseKey);
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

        const fetchedAt = payload.fetchedAt ?? new Date().toISOString();
        setOddsLastFetchedAt(fetchedAt);
        setOddsRefreshError("");

        setHorses((previous) => {
          let changed = false;
          let retained = filterToOfficialEntryRoster(previous, officialEntryHorseKeys, payload.overlap);
          if (retained.length !== previous.length) changed = true;

          if (payload.raceDayNoOddsExclusionsActive) {
            const beforeNoOddsFilter = retained;
            retained = retained.filter((horse) => {
              const horseKey = normalizeHorseKey(horse.name);
              const gateKey = String(horse.gateNumber);
              if (includedByNoOddsGates.size > 0 || includedByNoOddsHorseKeys.size > 0) {
                return includedByNoOddsGates.has(gateKey) || includedByNoOddsHorseKeys.has(horseKey);
              }
              return !excludedByNoOddsGates.has(gateKey) && !excludedByNoOddsHorseKeys.has(horseKey);
            });
            if (retained.length !== beforeNoOddsFilter.length) changed = true;
          }

          const updated = retained.map((horse) => {
            let nextHorse = horse;
            let touched = false;
            let needsRatingsRecalc = false;
            const horseKey = normalizeHorseKey(horse.name);

            const latestGate = Number(gateByHorseKey[horseKey]);
            if (Number.isFinite(latestGate) && latestGate > 0 && nextHorse.gateNumber !== latestGate) {
              touched = true;
              nextHorse = { ...nextHorse, gateNumber: Math.round(latestGate) };
            }
            const latestGateKey = String(nextHorse.gateNumber);

            const latestOdds = Number(oddsByHorseKey[horseKey] ?? oddsByGate[latestGateKey] ?? oddsByGate[String(horse.gateNumber)]);
            if (Number.isFinite(latestOdds) && latestOdds > 0) {
              const roundedLatestOdds = Math.round(latestOdds * 10) / 10;
              const currentOdds = Number(horse.realOdds ?? 0);
              if (Math.abs(currentOdds - roundedLatestOdds) >= 0.05) {
                touched = true;
                needsRatingsRecalc = true;
                nextHorse = { ...nextHorse, realOdds: roundedLatestOdds };
              }
              if (nextHorse.oddsSource !== "official" || nextHorse.oddsFetchedAt !== fetchedAt) {
                touched = true;
                nextHorse = { ...nextHorse, oddsSource: "official", oddsFetchedAt: fetchedAt };
              }
            }

            const latestPopularity = Math.round(
              Number(popularityByHorseKey[horseKey] ?? popularityByGate[latestGateKey] ?? popularityByGate[String(horse.gateNumber)])
            );
            if (Number.isFinite(latestPopularity) && latestPopularity > 0 && nextHorse.predictionCount !== latestPopularity) {
              touched = true;
              nextHorse = { ...nextHorse, predictionCount: latestPopularity };
            }

            const latestJockey = String(jockeyByHorseKey[horseKey] ?? jockeyByGate[latestGateKey] ?? jockeyByGate[String(horse.gateNumber)] ?? "").trim();
            if (latestJockey && nextHorse.jockey !== latestJockey) {
              touched = true;
              needsRatingsRecalc = true;
              nextHorse = { ...nextHorse, jockey: latestJockey };
            }

            const latestPerformance = performanceByHorseKey[horseKey] ?? performanceByGate[latestGateKey] ?? performanceByGate[String(horse.gateNumber)];
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
    const requestMutationVersion = runningStyleMutationRef.current;

    const refreshRunningStyles = async () => {
      try {
        const response = await fetch(`/api/horse-running-style?courseId=${encodeURIComponent(currentCourseId)}`, {
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;

        const payload = (await response.json()) as RunningStylePayload;
        if (cancelled || runningStyleMutationRef.current !== requestMutationVersion) return;
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
          const rows = buildRaceAnalysisRows(simulationResults, horses, selectedCourse, condition);
          const simHonmei = rows[0] ?? null;
          const simHorseId = simHonmei?.horseId ?? null;
          const simEntry = simHorseId
            ? pair?.scored?.find((entry: { horse?: { id?: string } }) => entry?.horse?.id === simHorseId) ?? null
            : null;
          const expectationView = pair?.winPick
            ? buildBettingExpectationView({
                rows,
                simulationLeaderEntry: simEntry,
                tanpukuHonmeiEntry: pair.winPick,
                course: selectedCourse,
              })
            : null;
          const expectation: PredictionSnapshotExpectation | null = expectationView
            ? {
                simulationLeader: {
                  horseId: simHorseId,
                  grade: expectationView.simulationLeader.bettingGrade,
                  reasons: expectationView.simulationLeader.reasons,
                },
                tanpukuHonmei: {
                  horseId: pair?.winPick?.horse?.id ?? null,
                  grade: expectationView.tanpukuHonmei.expectationGrade,
                  reasons: expectationView.tanpukuHonmei.reasons,
                },
                agreement: {
                  sameHorse: expectationView.agreement.sameHorse,
                  summary: expectationView.agreement.summary,
                },
              }
            : null;

          const snapshot = await buildPredictionSnapshot({
            results: simulationResults,
            horses,
            course: selectedCourse,
            condition,
            simulationCount: MONTE_CARLO_RUNS,
            capturedAt: new Date().toISOString(),
            ...buildSnapshotCourseMeta(selectedCourse),
            oddsFetchedAt: oddsLastFetchedAt || null,
            oddsSource: oddsLastFetchedAt
              ? "official"
              : horses.find((horse) => String(horse.oddsSource ?? "").trim())?.oddsSource ?? null,
            opponentOverride: pair?.opponentPick
              ? {
                  horseId: pair.opponentPick.horse.id,
                  selectionMethod: "stable_next",
                  score: pair.opponentPick.placeScore,
                  pairScoreGap: pair.opponentPick.scoreGap ?? null,
                }
              : null,
            valueHorseId: pair?.widePick?.horse?.id ?? pair?.valuePick?.horse?.id ?? null,
            expectation,
            tanpukuPair: pair,
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

  const handlePostPreRaceToX = async () => {
    if (!results || !selectedCourse) return;

    const rows = buildRaceAnalysisRows(results, horses, selectedCourse, condition);
    const categoryReturnStats = await loadCategoryReturnStatsForPost();
    const text = buildTanpukuPreRacePostText({
      raceName: selectedCourse.displayName ?? selectedCourse.name,
      hashtag: selectedCourse.hashtag,
      topHorses: buildTopHorsesForTanpukuPost(tanpukuPair, rows),
      categoryReturnStats,
      wideRecommendation: tanpukuPair?.wideRecommendation as TanpukuWideRecommendation | null ?? null,
      classificationHint: tanpukuPair?.winPick?.classificationHint as TanpukuClassificationHint | null ?? null,
      honmeiStats: tanpukuPair?.winPick
        ? {
            calWinProb: Number(tanpukuPair.winPick.calWinProb ?? NaN),
            calPlaceProb: Number(tanpukuPair.winPick.calPlaceProb ?? NaN),
            odds: Number(tanpukuPair.winPick.horse?.realOdds ?? NaN),
          }
        : null,
      raceGrade: getCourseGrade(selectedCourse),
      raceYear: Number(String(selectedCourse.raceDate ?? "").slice(0, 4)) || null,
    });

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
    return <div className="flex min-h-screen items-center justify-center bg-paper text-ink-2">レースデータが見つかりません。</div>;
  }

  return (
    <div className="min-h-screen bg-paper">
      <SiteRail current="/sim" />
      <div className="mx-auto max-w-7xl px-4 py-5 md:px-6 md:py-7">
        <header className="mb-5 flex flex-col gap-3 border-b border-line pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="t-label">Race analysis</p>
            <h1 className="t-title mt-1.5 text-[26px]">レース分析</h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-ink-2">
              馬場、風、ペースを動かしながら{MONTE_CARLO_RUNS_LABEL}走らせ、公式・一般・プロ勢のオッズと並べて人気と期待値の差を見ます。
            </p>
          </div>
          {isArchive && (
            <div className="inline-flex shrink-0 items-center gap-2 rounded-[var(--r-md)] border border-note bg-note-wash px-3 py-2 text-[12px] text-note">
              <span>アーカイブ表示: {selectedCourse.name}</span>
              <Link href="/sim" className="font-bold underline underline-offset-2">
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
            onRunningStyleChange={() => {
              runningStyleMutationRef.current += 1;
            }}
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
                className="rounded-full bg-go px-8 py-4 text-lg font-bold text-white transition hover:bg-go hover:disabled:cursor-not-allowed disabled:opacity-50"
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
                tanpukuEntries={
                  (tanpukuPair?.scored ?? [])
                    .map((entry: { horse?: { id?: string }; calWinProb?: number; calPlaceProb?: number; marketGapLabel?: string | null }) => ({
                      horseId: String(entry?.horse?.id ?? ""),
                      calWinProb: Number(entry?.calWinProb ?? 0),
                      calPlaceProb: Number(entry?.calPlaceProb ?? 0),
                      marketGapLabel: entry?.marketGapLabel ?? null,
                    }))
                    .filter((entry: { horseId: string }) => entry.horseId)
                }
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
                const expectationView = buildBettingExpectationView({
                  rows,
                  simulationLeaderEntry: simEntry,
                  tanpukuHonmeiEntry: winPick,
                  course: selectedCourse,
                });

                return (
                  <div className="mt-4 rounded-[var(--r-md)] border border-violet-200 bg-card p-5 ">
                    <h3 className="text-base font-bold text-violet-900">馬券推奨パネル</h3>
                    <p className="mt-1 text-xs text-violet-600">
                      v{tanpukuPair.scoringVersion} / S-A-B-Cは回顧傾向を反映した暫定ラベルです
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${agreementStatus === "agree" ? "bg-hit-wash text-hit" : agreementStatus === "disagree" ? "bg-note-wash text-note" : "bg-paper text-ink-2"}`}>
                        {agreementStatus === "agree" ? "一致" : agreementStatus === "disagree" ? "不一致" : "比較不可"}
                      </span>
                      <span className="text-xs text-ink-2">{expectationView.agreement.summary}</span>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-lg border border-info bg-info-wash px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-info">総合試走1位</p>
                          <GradeBadge label="馬券評価" grade={expectationView.simulationLeader.bettingGrade} />
                        </div>
                        <p className="mt-1 text-sm font-bold text-ink">{expectationView.simulationLeader.horseName}</p>
                        {simEntry && (
                          <p className="mt-1 text-[11px] text-ink-2">
                            winProb {(simEntry.winProb * 100).toFixed(0)}% / placeScore {simEntry.placeScore.toFixed(3)}
                          </p>
                        )}
                        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-info">
                          {expectationView.simulationLeader.reasons.map((reason) => (
                            <li key={reason}>・{reason}</li>
                          ))}
                        </ul>
                        <p className="mt-2 text-xs leading-relaxed text-info">{explanations.simHonmei}</p>
                      </div>

                      <div className="rounded-lg border border-note bg-note-wash px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-note">馬券推奨本命</p>
                          <GradeBadge label="期待度" grade={expectationView.tanpukuHonmei.expectationGrade} />
                        </div>
                        <p className="mt-1 text-sm font-bold text-ink">
                          {expectationView.tanpukuHonmei.horseName}
                          {expectationView.tanpukuHonmei.rank ? (
                            <span className="ml-2 text-[11px] font-medium text-ink-2">
                              総合試走{expectationView.tanpukuHonmei.rank}位
                            </span>
                          ) : null}
                        </p>
                        {winPick && (
                          <div className="mt-1 space-y-0.5 text-[11px] text-ink-2">
                            <p>placeScore {winPick.placeScore.toFixed(3)} / scoreGap {winPick.scoreGap.toFixed(3)}</p>
                            <p>placeProb {(winPick.placeProb * 100).toFixed(0)}% / top3安定 {(winPick.top3Stability * 100).toFixed(0)}%</p>
                            {winPick.overbetLabel && <span className="inline-block rounded-full bg-miss-wash px-2 py-0.5 text-miss">{winPick.overbetLabel}</span>}
                          </div>
                        )}
                        {winPick?.classificationHint && (
                          <div className="mt-1.5 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                winPick.classificationHint.classification === "win" ? "bg-orange-100 text-orange-800"
                                  : winPick.classificationHint.classification === "place" ? "bg-info-wash text-info"
                                  : "bg-paper-sunk text-ink-2"
                              }`}>
                                {winPick.classificationHint.classification === "win" ? "勝ち切り型(暫定)"
                                  : winPick.classificationHint.classification === "place" ? "複勝軸型"
                                  : "見送り寄り"}
                              </span>
                              <span className="text-[11px] text-ink-2">
                                確度 {Math.round(winPick.classificationHint.confidence * 100)}%
                              </span>
                            </div>
                            {Number.isFinite(winPick.calWinProb) && Number.isFinite(winPick.calPlaceProb) && (
                              <p className="text-[11px] text-ink-2">
                                校正勝率 {Math.round(winPick.calWinProb * 100)}% / 校正複勝率 {Math.round(winPick.calPlaceProb * 100)}%
                              </p>
                            )}
                          </div>
                        )}
                        {tanpukuPair.wideRecommendation?.recommended && tanpukuPair.wideRecommendation.horseNames?.length >= 2 && (
                          <p className="mt-1.5 text-[11px] font-medium text-info">
                            ワイド推奨: {tanpukuPair.wideRecommendation.horseNames[0]} × {tanpukuPair.wideRecommendation.horseNames[1]}
                          </p>
                        )}
                        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-note">
                          {expectationView.tanpukuHonmei.reasons.map((reason) => (
                            <li key={reason}>・{reason}</li>
                          ))}
                        </ul>
                        <p className="mt-2 text-xs leading-relaxed text-note">{explanations.tanpukuHonmei}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>

        <footer className="mt-10 text-center text-xs text-ink-3">
          <Link href="/" className="transition hover:text-ink-2">
            トップへ
          </Link>
          <span className="mx-2">|</span>
          <Link href="/archive" className="transition hover:text-ink-2">
            レース履歴
          </Link>
          <span className="mx-2">|</span>
          Powered by Next.js
        </footer>
      </div>
    </div>
  );
}
