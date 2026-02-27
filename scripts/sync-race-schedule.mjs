import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

async function main() {
  const srcPath = path.join(ROOT, "data", "weekly-races.json");
  const srcRaw = await fs.readFile(srcPath, "utf8");
  const src = JSON.parse(srcRaw.replace(/^\uFEFF/, ""));

  const map = {};
  for (const race of src.currentWeek?.races ?? []) {
    if (!race?.courseId || !Array.isArray(race.horses)) continue;
    map[race.courseId] = race.horses.map((h) => ({
      id: String(h.id),
      name: String(h.name),
      runningStyle: h.runningStyle,
      gateNumber: Number(h.gateNumber ?? 0),
      sex: h.sex ?? "M",
      weight: Number(h.weight ?? 57),
      predictionCount: Number(h.predictionCount ?? 0),
      realOdds: Number(h.realOdds ?? 0),
      speed: Number(h.speed ?? 80),
      stamina: Number(h.stamina ?? 80),
      power: Number(h.power ?? 80),
      guts: Number(h.guts ?? 80),
    }));
  }

  const content = `// Auto-generated from data/weekly-races.json
// Do not edit manually.

import type { RunningStyle } from "./types";

export interface GeneratedHorseSeed {
  id: string;
  name: string;
  runningStyle: RunningStyle;
  gateNumber: number;
  sex: "M" | "F";
  weight: number;
  predictionCount: number;
  realOdds: number;
  speed: number;
  stamina: number;
  power: number;
  guts: number;
}

export const GENERATED_WEEKLY_HORSES_MAP: Record<string, GeneratedHorseSeed[]> = ${JSON.stringify(map, null, 2)};
`;

  const outPath = path.join(ROOT, "lib", "generatedRaceSchedule.ts");
  await fs.writeFile(outPath, content, "utf8");
  console.log("Synced generated race schedule.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
