import fs from "node:fs/promises";
import path from "node:path";
import { getRaceTargetFlags } from "../lib/raceSegmentation.mjs";

const ROOT = process.cwd();
const GENERATED_REVIEWS_PATH = path.join(ROOT, "data", "generated-reviews.json");

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function reviewKeyForRace(race) {
  return String(race?.raceId ?? race?.courseId ?? "");
}

function isoDateFromWeekAndDay(weekOf, day) {
  const [year, month, date] = String(weekOf ?? "")
    .split("-")
    .map((value) => Number.parseInt(value, 10));
  if (![year, month, date].every(Number.isFinite)) return "";
  const offset = day === "Sat" ? 5 : day === "Sun" ? 6 : 0;
  const base = new Date(Date.UTC(year, month - 1, date + offset));
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}`;
}

function mapHorseSeed(h, race) {
  return {
    id: String(h.id),
    name: String(h.name),
    jockey: String(h.jockey ?? "未定"),
    trainer: h.trainer ? String(h.trainer) : undefined,
    runningStyle: h.runningStyle,
    gateNumber: Number(h.gateNumber ?? 0),
    sex: h.sex ?? "M",
    weight: Number(h.weight ?? 57),
    favoriteCount: Number(h.favoriteCount ?? 0),
    xBuzzScore: Number(h.xBuzzScore ?? 0),
    predictionCount: Number(h.predictionCount ?? 0),
    realOdds: Number(h.realOdds ?? 0),
    oddsSource: String(h.oddsSource ?? race.oddsSource ?? "forecast"),
    speed: Number(h.speed ?? 80),
    stamina: Number(h.stamina ?? 80),
    power: Number(h.power ?? 80),
    guts: Number(h.guts ?? 80),
    trainingScore: Number(h.trainingScore ?? 0),
    recentFormScore: Number(h.recentFormScore ?? 0),
    recentAverageFinish: Number(h.recentAverageFinish ?? 0),
    recentTimeIndex: Number(h.recentTimeIndex ?? 0),
    lastRaceGradeScore: Number(h.lastRaceGradeScore ?? 2),
    lastRaceGradeLabel: String(h.lastRaceGradeLabel ?? "OP"),
    lastRaceDistance: Number(h.lastRaceDistance ?? 0),
    distanceChange: Number(h.distanceChange ?? 0),
    condition: Number(h.condition ?? 5),
  };
}

function mapRaceMeta(race) {
  const flags = getRaceTargetFlags(race);
  return {
    courseId: String(race.courseId),
    raceId: String(race.raceId ?? ""),
    label: String(race.label ?? race.courseId),
    grade: String(race.grade ?? "G3"),
    day: String(race.day ?? "Sat"),
    raceNumber: Number(race.raceNumber ?? flags.raceNumber ?? 0),
    isSpecialRace: Boolean(race.isSpecialRace ?? flags.isSpecialRace),
    isFinalRace: Boolean(race.isFinalRace ?? flags.isFinalRace),
    isJumpRace: Boolean(race.isJumpRace ?? flags.isJumpRace),
    raceSegment: String(race.raceSegment ?? flags.raceSegment ?? "other"),
    venue: String(race.venue ?? ""),
    venueKey: String(race.venueKey ?? ""),
    surface: String(race.surface ?? "Turf"),
    distance: Number(race.distance ?? 0),
    straightLength: Number(race.straightLength ?? 360),
    hashtag: String(race.hashtag ?? `#${String(race.label ?? race.courseId).replace(/\s+/g, "")}`),
    hasRace: Boolean(race.hasRace ?? true),
    oddsSource: String(race.oddsSource ?? "forecast"),
  };
}

function resolveRaceResultSource(race) {
  const result = race?.result;
  const hasResultPayload =
    result &&
    (
      result.winnerHorseId ||
      result.winnerHorseName ||
      (Array.isArray(result.top3HorseIds) && result.top3HorseIds.length > 0) ||
      (Array.isArray(result.top3HorseNames) && result.top3HorseNames.length > 0) ||
      (Array.isArray(result.finishers) && result.finishers.length > 0)
    );

  if (hasResultPayload) {
    return {
      // Source of truth: result block inside weekly-races.json.
      updatedAt: result.updatedAt,
      winnerHorseId: result.winnerHorseId,
      winnerHorseName: result.winnerHorseName,
      top3HorseIds: result.top3HorseIds,
      top3HorseNames: result.top3HorseNames,
      finishers: result.finishers,
    };
  }

  const legacyWinnerHorseId = race?.winnerHorseId;
  const legacyTop3HorseIds = race?.top3HorseIds;
  const legacyTop3HorseNames = race?.top3HorseNames;
  if (
    legacyWinnerHorseId ||
    (Array.isArray(legacyTop3HorseIds) && legacyTop3HorseIds.length > 0) ||
    (Array.isArray(legacyTop3HorseNames) && legacyTop3HorseNames.length > 0)
  ) {
    return {
      // Legacy fallback only for backward compatibility with older weekly-races.json data.
      updatedAt: "",
      winnerHorseId: legacyWinnerHorseId,
      winnerHorseName: race?.winnerHorseName,
      top3HorseIds: legacyTop3HorseIds,
      top3HorseNames: legacyTop3HorseNames,
      finishers: [],
    };
  }

  return null;
}

function mapRaceResult(race) {
  const resolved = resolveRaceResultSource(race);
  if (!resolved) return undefined;

  return {
    updatedAt: String(resolved.updatedAt ?? ""),
    winnerHorseId: resolved.winnerHorseId ? String(resolved.winnerHorseId) : undefined,
    winnerHorseName: resolved.winnerHorseName ? String(resolved.winnerHorseName) : undefined,
    top3HorseIds: Array.isArray(resolved.top3HorseIds) ? resolved.top3HorseIds.map((id) => String(id)) : [],
    top3HorseNames: Array.isArray(resolved.top3HorseNames) ? resolved.top3HorseNames.map((name) => String(name)) : [],
    finishers: Array.isArray(resolved.finishers)
      ? resolved.finishers.map((entry) => ({
          position: Number(entry.position ?? 0),
          horseId: entry.horseId ? String(entry.horseId) : undefined,
          externalHorseId: entry.externalHorseId ? String(entry.externalHorseId) : undefined,
          gateNumber: Number(entry.gateNumber ?? 0),
          horseNumber: Number(entry.horseNumber ?? 0),
          name: String(entry.name ?? ""),
          jockey: String(entry.jockey ?? ""),
          finishTime: String(entry.finishTime ?? ""),
          margin: String(entry.margin ?? ""),
          popularity: Number(entry.popularity ?? 0),
          odds: Number(entry.odds ?? 0),
        }))
      : [],
  };
}

function mapRaceReview(review) {
  if (!review) return undefined;
  return {
    updatedAt: String(review.updatedAt ?? ""),
    summary: String(review.summary ?? ""),
    xPostText: String(review.xPostText ?? ""),
    reasons: Array.isArray(review.reasons) ? review.reasons.map((reason) => String(reason)) : [],
  };
}

function getPreferredReviewForRace(race, generatedReviews) {
  const generatedReview = generatedReviews[reviewKeyForRace(race)];
  return generatedReview ?? race.review;
}

function mapReviewRace(race, weekOf, archivedAt, generatedReviews) {
  return {
    ...mapRaceMeta(race),
    date: isoDateFromWeekAndDay(String(weekOf ?? ""), String(race.day ?? "")),
    archivedAt: archivedAt ? String(archivedAt) : undefined,
    result: mapRaceResult(race),
    review: mapRaceReview(getPreferredReviewForRace(race, generatedReviews)),
    horses: Array.isArray(race.horses) ? race.horses.map((h) => mapHorseSeed(h, race)) : [],
  };
}

async function main() {
  const srcPath = path.join(ROOT, "data", "weekly-races.json");
  const src = await readJson(srcPath, { currentWeek: { races: [] }, archives: [] });
  const generatedReviews = await readJson(GENERATED_REVIEWS_PATH, {});

  const raceMap = {};
  const raceMeta = [];

  for (const race of src.currentWeek?.races ?? []) {
    if (!race?.courseId || !Array.isArray(race.horses)) continue;
    raceMeta.push(mapRaceMeta(race));
    raceMap[race.courseId] = race.horses.map((h) => mapHorseSeed(h, race));
  }

  const completedCurrentRaces = (src.currentWeek?.races ?? [])
    .filter(
      (race) =>
        race?.courseId &&
        Array.isArray(race.horses) &&
        (resolveRaceResultSource(race) || getPreferredReviewForRace(race, generatedReviews))
    )
    .map((race) => mapReviewRace(race, src.currentWeek?.weekOf ?? "", undefined, generatedReviews));

  const archivedRaces = [];
  for (const archive of src.archives ?? []) {
    for (const race of archive?.races ?? []) {
      if (!race?.courseId || !Array.isArray(race.horses)) continue;
      archivedRaces.push(mapReviewRace(race, archive.weekOf ?? "", archive.archivedAt ?? "", generatedReviews));
    }
  }

  const content = `// Auto-generated from data/weekly-races.json
// Do not edit manually.

import type { RunningStyle } from "./types";

export interface GeneratedHorseSeed {
  id: string;
  name: string;
  jockey: string;
  trainer?: string;
  runningStyle: RunningStyle;
  gateNumber: number;
  sex: "M" | "F";
  weight: number;
  favoriteCount: number;
  xBuzzScore: number;
  predictionCount: number;
  realOdds: number;
  oddsSource: string;
  speed: number;
  stamina: number;
  power: number;
  guts: number;
  trainingScore: number;
  recentFormScore: number;
  recentAverageFinish: number;
  recentTimeIndex: number;
  lastRaceGradeScore: number;
  lastRaceGradeLabel: string;
  lastRaceDistance: number;
  distanceChange: number;
  condition: number;
}

export interface GeneratedRaceMeta {
  courseId: string;
  raceId: string;
  label: string;
  grade: string;
  day: string;
  raceNumber: number;
  isSpecialRace: boolean;
  isFinalRace: boolean;
  isJumpRace: boolean;
  raceSegment: "special" | "special_final12" | "final12" | "other";
  venue: string;
  venueKey: string;
  surface: "Turf" | "Dirt";
  distance: number;
  straightLength: number;
  hashtag: string;
  hasRace: boolean;
  oddsSource: string;
}

export interface GeneratedRaceFinisher {
  position: number;
  horseId?: string;
  externalHorseId?: string;
  gateNumber: number;
  horseNumber: number;
  name: string;
  jockey: string;
  finishTime: string;
  margin: string;
  popularity: number;
  odds: number;
}

export interface GeneratedRaceResult {
  updatedAt: string;
  winnerHorseId?: string;
  winnerHorseName?: string;
  top3HorseIds: string[];
  top3HorseNames: string[];
  finishers: GeneratedRaceFinisher[];
}

export interface GeneratedRaceReview {
  updatedAt: string;
  summary: string;
  xPostText: string;
  reasons: string[];
}

export interface GeneratedReviewRace extends GeneratedRaceMeta {
  date: string;
  archivedAt?: string;
  result?: GeneratedRaceResult;
  review?: GeneratedRaceReview;
  horses: GeneratedHorseSeed[];
}

export const GENERATED_WEEKLY_RACES: GeneratedRaceMeta[] = ${JSON.stringify(raceMeta, null, 2)};

export const GENERATED_WEEKLY_HORSES_MAP: Record<string, GeneratedHorseSeed[]> = ${JSON.stringify(raceMap, null, 2)};

export const GENERATED_COMPLETED_RACES: GeneratedReviewRace[] = ${JSON.stringify(completedCurrentRaces, null, 2)};

export const GENERATED_ARCHIVED_RACES: GeneratedReviewRace[] = ${JSON.stringify(archivedRaces, null, 2)};
`;

  const outPath = path.join(ROOT, "lib", "generatedRaceSchedule.ts");
  await fs.writeFile(outPath, content, "utf8");
  console.log("Synced generated race schedule.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
