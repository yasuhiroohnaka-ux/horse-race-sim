import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function main() {
  const srcPath = path.join(ROOT, "data", "weekly-races.json");
  const srcRaw = await fs.readFile(srcPath, "utf8");
  const src = JSON.parse(srcRaw.replace(/^\uFEFF/, ""));

  const raceMap = {};
  const raceMeta = [];

  for (const race of src.currentWeek?.races ?? []) {
    if (!race?.courseId || !Array.isArray(race.horses)) continue;

    raceMeta.push({
      courseId: String(race.courseId),
      raceId: String(race.raceId ?? ""),
      label: String(race.label ?? race.courseId),
      grade: String(race.grade ?? "G3"),
      day: String(race.day ?? "Sat"),
      venue: String(race.venue ?? ""),
      venueKey: String(race.venueKey ?? ""),
      surface: String(race.surface ?? "Turf"),
      distance: Number(race.distance ?? 0),
      straightLength: Number(race.straightLength ?? 360),
      hashtag: String(race.hashtag ?? `#${String(race.label ?? race.courseId).replace(/\s+/g, "")}`),
      hasRace: Boolean(race.hasRace ?? true),
      oddsSource: String(race.oddsSource ?? "forecast")
    });

    raceMap[race.courseId] = race.horses.map((h) => ({
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
      condition: Number(h.condition ?? 5)
    }));
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
  venue: string;
  venueKey: string;
  surface: "Turf" | "Dirt";
  distance: number;
  straightLength: number;
  hashtag: string;
  hasRace: boolean;
  oddsSource: string;
}

export const GENERATED_WEEKLY_RACES: GeneratedRaceMeta[] = ${JSON.stringify(raceMeta, null, 2)};

export const GENERATED_WEEKLY_HORSES_MAP: Record<string, GeneratedHorseSeed[]> = ${JSON.stringify(raceMap, null, 2)};
`;

  const outPath = path.join(ROOT, "lib", "generatedRaceSchedule.ts");
  await fs.writeFile(outPath, content, "utf8");
  console.log("Synced generated race schedule.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
