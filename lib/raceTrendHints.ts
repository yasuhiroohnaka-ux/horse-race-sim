import { RACE_TREND_PROFILES } from "@/data/raceTrends";
import type {
  Course,
  Horse,
  RaceTrendProfile,
  RaceTrendRankedScoreResult,
  RaceTrendScoreResult,
  TrendHint,
  TrendHintCondition,
  TrendHintMatchResult,
} from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function normalizeText(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\u3000/g, "")
    .replace(/\s+/g, "")
    .replace(/[\u30fb\uff65\-_.]/g, "");
}

const PREVIOUS_RACE_ALIAS_GROUPS = [
  ["ニュージーランドT", "ニュージーランドＴ", "ニュージーランドトロフィー", "NZT"],
  ["チャーチルダウンズC", "チャーチルダウンズＣ", "チャーチルダウンズカップ", "アーリントンC", "アーリントンＣ", "アーリントンカップ"],
];

export function normalizeRaceName(value: string): string {
  return normalizeText(value).replace(/[()（）]/g, "");
}

function expandRaceNameAliases(value: string): string[] {
  const normalized = normalizeRaceName(value);
  const aliasGroup = PREVIOUS_RACE_ALIAS_GROUPS.find((group) =>
    group.map(normalizeRaceName).includes(normalized)
  );
  return aliasGroup ? aliasGroup.map(normalizeRaceName) : [normalized];
}

function sampleSize(hint: TrendHint): number {
  const record = hint.stats.record;
  return record.win + record.second + record.third + record.out;
}

function sampleWeight(size: number): number {
  if (size <= 0) return 0.25;
  return clamp(Math.sqrt(size / 16), 0.35, 1);
}

function getFrameNumber(gateNumber: number | undefined, fieldSize: number): number {
  const n = Math.max(1, Number(fieldSize) || 1);
  const g = Math.max(1, Number(gateNumber) || 1);
  const frames = Math.min(8, n);
  const basePerFrame = Math.floor(n / frames);
  const extraFrames = n % frames;
  let covered = 0;

  for (let frame = 1; frame <= frames; frame += 1) {
    const frameSize = basePerFrame + (frame <= extraFrames ? 1 : 0);
    covered += frameSize;
    if (g <= covered) return frame;
  }

  return frames;
}

function getHorsePreviousRaceNames(horse: Horse): string[] {
  const names = [
    horse.previousRaceDisplayName,
    horse.previousRaceName,
    horse.lastRaceName,
    ...(horse.previousRaceNames ?? []),
  ];
  return names.map((name) => String(name ?? "").trim()).filter(Boolean);
}

function hasPreviousRaceMatch(horse: Horse, condition: TrendHintCondition): boolean {
  const conditionNames = condition.previousRaceNames;
  if (!conditionNames || conditionNames.length === 0) return true;

  const horseNames = getHorsePreviousRaceNames(horse).flatMap(expandRaceNameAliases);
  if (horseNames.length === 0) return false;

  return conditionNames
    .flatMap(expandRaceNameAliases)
    .some((conditionName) => horseNames.some((horseName) => horseName.includes(conditionName)));
}

function buildEvidenceLabel(horse: Horse, hint: TrendHint): string | undefined {
  if (!hint.condition.previousRaceNames?.length) return undefined;

  const previousRaceName =
    horse.previousRaceDisplayName ??
    horse.previousRaceName ??
    horse.lastRaceName ??
    horse.previousRaceNames?.[0];
  if (!previousRaceName) return undefined;

  const finish = Number(horse.previousFinish);
  const finishLabel = Number.isFinite(finish) && finish > 0 ? ` ${Math.round(finish)}着` : "";
  return `前走: ${previousRaceName}${finishLabel}`;
}

function matchesTrendHint(horse: Horse, hint: TrendHint, fieldSize: number): boolean {
  const condition = hint.condition;

  if (!hasPreviousRaceMatch(horse, condition)) return false;

  if (condition.previousFinish !== undefined && horse.previousFinish !== condition.previousFinish) {
    return false;
  }

  if (condition.gateNumberMin !== undefined && horse.gateNumber < condition.gateNumberMin) {
    return false;
  }

  if (condition.gateNumberMax !== undefined && horse.gateNumber > condition.gateNumberMax) {
    return false;
  }

  if (condition.frameNumbers && condition.frameNumbers.length > 0) {
    const frameNumber = getFrameNumber(horse.gateNumber, fieldSize);
    if (!condition.frameNumbers.includes(frameNumber)) return false;
  }

  return true;
}

export function findRaceTrendProfile(course: Course): RaceTrendProfile | null {
  const normalizedCourseId = normalizeText(course.id);
  const normalizedName = normalizeText(`${course.name} ${course.displayName ?? ""}`);

  return (
    RACE_TREND_PROFILES.find((profile) => {
      if (profile.courseIds?.map(normalizeText).includes(normalizedCourseId)) return true;
      return (profile.matchRaceNames ?? [profile.raceName]).some((name) => normalizedName.includes(normalizeText(name)));
    }) ?? null
  );
}

export function applyRaceTrendHints(
  horse: Horse,
  baseScore: number,
  trendProfile: RaceTrendProfile | null | undefined,
  fieldSize = 18
): RaceTrendScoreResult {
  if (!trendProfile) {
    return {
      baseScore: round4(baseScore),
      trendAdjustment: 0,
      adjustedScore: round4(baseScore),
      matchedTrendHints: [],
    };
  }

  const matchedTrendHints: TrendHintMatchResult[] = trendProfile.trendHints
    .filter((hint) => matchesTrendHint(horse, hint, fieldSize))
    .map((hint) => {
      const size = sampleSize(hint);
      const confidence = clamp(hint.confidence ?? trendProfile.adjustmentPolicy.defaultConfidence, 0, 1);
      const weight = sampleWeight(size);
      const adjustment =
        hint.adjustmentMode === "explanationOnly"
          ? 0
          : round4(hint.adjustment * confidence * weight);

      return {
        id: hint.id,
        type: hint.type,
        label: hint.label,
        rawAdjustment: hint.adjustment,
        adjustment,
        confidence,
        sampleSize: size,
        sampleWeight: round4(weight),
        evidenceLabel: buildEvidenceLabel(horse, hint),
        explanation: hint.explanation,
      };
    });

  const rawAdjustment = matchedTrendHints.reduce((sum, hint) => sum + hint.adjustment, 0);
  const trendAdjustment = round4(
    clamp(
      rawAdjustment,
      trendProfile.adjustmentPolicy.maxNegativeAdjustment,
      trendProfile.adjustmentPolicy.maxPositiveAdjustment
    )
  );
  const adjustedScore = round4(clamp(baseScore + trendAdjustment, 0, 1));

  return {
    baseScore: round4(baseScore),
    trendAdjustment,
    adjustedScore,
    matchedTrendHints,
  };
}

export function applyRaceTrendHintsToResults(
  results: { horseId: string; winCount: number }[],
  horses: Horse[],
  trendProfile: RaceTrendProfile | null | undefined
): RaceTrendRankedScoreResult[] {
  const resultById = new Map(results.map((result) => [result.horseId, result]));
  const baseRows = horses.map((horse) => {
    const baseScore = clamp((resultById.get(horse.id)?.winCount ?? 0) / 100, 0, 1);
    return {
      horse,
      ...applyRaceTrendHints(horse, baseScore, trendProfile, horses.length),
    };
  });

  const originalRankById = new Map(
    [...baseRows]
      .sort((left, right) => right.baseScore - left.baseScore || left.horse.gateNumber - right.horse.gateNumber)
      .map((row, index) => [row.horse.id, index + 1])
  );
  const adjustedRankById = new Map(
    [...baseRows]
      .sort((left, right) => right.adjustedScore - left.adjustedScore || left.horse.gateNumber - right.horse.gateNumber)
      .map((row, index) => [row.horse.id, index + 1])
  );

  return baseRows.map(({ horse, ...row }) => ({
    horseId: horse.id,
    ...row,
    originalRank: originalRankById.get(horse.id) ?? horses.length,
    adjustedRank: adjustedRankById.get(horse.id) ?? horses.length,
  }));
}
