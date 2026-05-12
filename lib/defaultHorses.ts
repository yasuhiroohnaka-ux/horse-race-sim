import { Horse } from "./types";
import { getDefaultHorses as getLegacyDefaultHorses } from "./raceData";
import {
  GENERATED_ARCHIVED_RACES,
  GENERATED_WEEKLY_HORSES_MAP,
  GENERATED_WEEKLY_RACES,
  type GeneratedHorseSeed,
} from "./generatedRaceSchedule";
import { GENERATED_DRAW_OVERRIDES } from "./generatedDrawOverrides";
import {
  RUNNER_PREVIOUS_RACE_OVERRIDES,
  type RunnerPreviousRaceOverride,
} from "../data/runnerPreviousRaceOverrides";
import { RACE_TREND_PROFILES } from "../data/raceTrends";
import { dedupeHorses } from "./horseIntegrity";
import { applyNetkeibaRatings } from "./netkeibaRatings";
import { filterRaceDayNoOddsHorses } from "./raceDayExclusions.mjs";

function enrichHorse(_courseId: string, horse: Horse): Horse {
  return applyNetkeibaRatings(horse);
}

function normalizeName(name: string): string {
  return String(name ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\u3000/g, "")
    .replace(/\s+/g, "")
    .replace(/[\u30fb\uff65\-_.]/g, "");
}

function normalizeRaceText(value: string): string {
  return normalizeName(value).replace(/[()（）]/g, "");
}

function resolveTrendRaceKey(courseId: string, raceLabel?: string): string | null {
  const normalizedCourseId = normalizeRaceText(courseId);
  const normalizedLabel = normalizeRaceText(raceLabel ?? "");

  return (
    RACE_TREND_PROFILES.find((profile) => {
      if (profile.courseIds?.map(normalizeRaceText).includes(normalizedCourseId)) return true;
      if (!normalizedLabel) return false;
      return (profile.matchRaceNames ?? [profile.raceName]).some((name) =>
        normalizedLabel.includes(normalizeRaceText(name))
      );
    })?.raceKey ?? null
  );
}

function applyPreviousRaceOverrides(courseId: string, horses: Horse[], raceLabel?: string): Horse[] {
  const overrideKeys = [courseId, resolveTrendRaceKey(courseId, raceLabel)].filter(Boolean) as string[];
  if (overrideKeys.length === 0) return horses;

  const overrideByHorseName = new Map<string, RunnerPreviousRaceOverride>();
  for (const key of overrideKeys) {
    for (const [horseName, override] of Object.entries(RUNNER_PREVIOUS_RACE_OVERRIDES[key] ?? {})) {
      overrideByHorseName.set(normalizeName(horseName), override);
    }
  }

  if (overrideByHorseName.size === 0) return horses;

  return horses.map((horse) => {
    const override = overrideByHorseName.get(normalizeName(horse.name));
    return override
      ? {
          ...horse,
          ...override,
          previousRaceSource: "manual-override",
          runnerPreviousRaceOverrideApplied: true,
        }
      : horse;
  });
}

function mapGeneratedHorse(courseId: string, h: GeneratedHorseSeed, index: number): Horse {
  const seed = h as GeneratedHorseSeed & Partial<RunnerPreviousRaceOverride> & Record<string, unknown>;
  const previousRaceSeed = seed;

  return enrichHorse(courseId, {
    id: h.id,
    gateNumber: h.gateNumber > 0 ? h.gateNumber : index + 1,
    name: h.name,
    jockey: h.jockey || "未定",
    trainer: h.trainer,
    speed: h.speed,
    stamina: h.stamina,
    power: h.power,
    guts: h.guts,
    runningStyle: h.runningStyle,
    runningStyleSource: typeof seed.runningStyleSource === "string" ? seed.runningStyleSource : undefined,
    runningStyleInitialSource: typeof seed.runningStyleInitialSource === "string" ? seed.runningStyleInitialSource : undefined,
    favoriteCount: h.favoriteCount,
    xBuzzScore: h.xBuzzScore,
    predictionCount: h.predictionCount,
    simulatedOdds: 0,
    realOdds: h.realOdds,
    oddsSource: h.oddsSource,
    sex: h.sex ?? "M",
    weight: Number.isFinite(h.weight) ? h.weight : 57,
    condition: h.condition ?? 5,
    trainingScore: h.trainingScore ?? 0,
    recentFormScore: h.recentFormScore ?? 0,
    recentAverageFinish: h.recentAverageFinish ?? 0,
    recentTimeIndex: h.recentTimeIndex ?? 0,
    previousRaceName: previousRaceSeed.previousRaceName,
    previousRaceDisplayName: previousRaceSeed.previousRaceDisplayName,
    previousFinish: previousRaceSeed.previousFinish,
    previousRaceSource: typeof seed.previousRaceSource === "string" ? seed.previousRaceSource : undefined,
    runnerPreviousRaceOverrideApplied: typeof seed.runnerPreviousRaceOverrideApplied === "boolean" ? seed.runnerPreviousRaceOverrideApplied : undefined,
    previousRaceCourse: previousRaceSeed.previousRaceCourse,
    previousRaceDistance: previousRaceSeed.previousRaceDistance,
    previousRaceTrackType: previousRaceSeed.previousRaceTrackType,
    previousRaceGrade: previousRaceSeed.previousRaceGrade,
    previousRaceDate: previousRaceSeed.previousRaceDate,
    lastRaceGradeScore: h.lastRaceGradeScore ?? 2,
    lastRaceGradeLabel: h.lastRaceGradeLabel ?? "OP",
    lastRaceDistance: h.lastRaceDistance ?? 0,
    distanceChange: h.distanceChange ?? 0,
  });
}

function sortByGateNumber(horses: Horse[]): Horse[] {
  return [...horses].sort((a, b) => (a.gateNumber ?? 999) - (b.gateNumber ?? 999));
}

export function getDefaultHorses(courseId: string): Horse[] {
  const generated = GENERATED_WEEKLY_HORSES_MAP[courseId];

  if (generated && generated.length > 0) {
    const race = GENERATED_WEEKLY_RACES.find((entry) => entry.courseId === courseId);
    const horses = generated.map((h, i) => mapGeneratedHorse(courseId, h, i));
    return sortByGateNumber(
      dedupeHorses(applyPreviousRaceOverrides(courseId, filterRaceDayNoOddsHorses(horses, race) as Horse[], race?.label))
    );
  }

  const generatedArchived = GENERATED_ARCHIVED_RACES.find((race) => race.courseId === courseId);
  if (generatedArchived?.horses?.length) {
    return sortByGateNumber(
      dedupeHorses(
        applyPreviousRaceOverrides(
          courseId,
          generatedArchived.horses.map((h, i) => mapGeneratedHorse(courseId, h, i)),
          generatedArchived.label
        )
      )
    );
  }

  const generatedById = new Map((generated ?? []).map((g) => [String(g.id), g]));
  const drawOverrides = GENERATED_DRAW_OVERRIDES[courseId] ?? {};
  const drawByName = new Map(Object.entries(drawOverrides).map(([name, gate]) => [normalizeName(name), Number(gate)]));

  const horses = getLegacyDefaultHorses(courseId).map((h, i) => {
    const g = generatedById.get(String(h.id));
    const gSeed = g as (GeneratedHorseSeed & Record<string, unknown>) | undefined;
    const byName = drawByName.get(normalizeName(h.name));
    const gateNumber =
      Number.isFinite(byName) && (byName ?? 0) > 0
        ? Number(byName)
        : g && Number.isFinite(g.gateNumber) && g.gateNumber > 0
          ? g.gateNumber
          : h.gateNumber ?? i + 1;
    const weight = g && Number.isFinite(g.weight) && g.weight > 0 ? g.weight : h.weight ?? 57;

    return enrichHorse(courseId, {
      ...h,
      gateNumber,
      sex: h.sex ?? "M",
      weight,
      favoriteCount: h.favoriteCount ?? g?.favoriteCount ?? 0,
      xBuzzScore: h.xBuzzScore ?? g?.xBuzzScore ?? 0,
      oddsSource: h.oddsSource ?? g?.oddsSource,
      runningStyleSource:
        h.runningStyleSource ?? (typeof gSeed?.runningStyleSource === "string" ? gSeed.runningStyleSource : undefined),
      runningStyleInitialSource:
        h.runningStyleInitialSource ??
        (typeof gSeed?.runningStyleInitialSource === "string" ? gSeed.runningStyleInitialSource : undefined),
      condition: h.condition ?? 5,
      recentFormScore: h.recentFormScore ?? 0,
      recentAverageFinish: h.recentAverageFinish ?? 0,
      recentTimeIndex: h.recentTimeIndex ?? 0,
      previousRaceName: h.previousRaceName,
      previousRaceDisplayName: h.previousRaceDisplayName,
      previousFinish: h.previousFinish,
      previousRaceSource: h.previousRaceSource,
      runnerPreviousRaceOverrideApplied: h.runnerPreviousRaceOverrideApplied,
      previousRaceCourse: h.previousRaceCourse,
      previousRaceDistance: h.previousRaceDistance,
      previousRaceTrackType: h.previousRaceTrackType,
      previousRaceGrade: h.previousRaceGrade,
      previousRaceDate: h.previousRaceDate,
      lastRaceGradeScore: h.lastRaceGradeScore ?? 2,
      lastRaceGradeLabel: h.lastRaceGradeLabel ?? "OP",
      lastRaceDistance: h.lastRaceDistance ?? 0,
      distanceChange: h.distanceChange ?? 0,
      jockey: h.jockey ?? "未定",
    });
  });

  return sortByGateNumber(dedupeHorses(applyPreviousRaceOverrides(courseId, horses)));
}
