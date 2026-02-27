import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const WEEKLY_RACES_PATH = path.join(ROOT, "data", "weekly-races.json");
const TRAINING_DATA_PATH = path.join(ROOT, "lib", "generatedTrainingData.ts");

const WEIGHT_CORRECTIONS_BY_KEY = {
  "nakayama-turf-1800:1": 57,
  "nakayama-turf-1800:2": 57,
  "nakayama-turf-1800:3": 55,
  "nakayama-turf-1200:1": 56,
  "nakayama-turf-1200:3": 58,
  "nakayama-turf-1200:4": 57,
  "hanshin-turf-1600:1": 55,
  "hanshin-turf-1600:2": 55,
  "hanshin-turf-1600:3": 55,
};

const WEIGHT_CORRECTIONS_BY_NAME = {
  "Karamatianos": 58,
};

function parseTrainingInsights(tsSource) {
  const m = tsSource.match(
    /export const GENERATED_TRAINING_INSIGHTS: TrainingInsight\[\] = ([\s\S]*?);\s*export const GENERATED_X_TRAINING_OVERRIDES/
  );
  if (!m) return [];
  try {
    return JSON.parse(m[1]);
  } catch {
    return [];
  }
}

function normalizeWeight(courseId, horse) {
  const key = `${courseId}:${horse.id}`;
  if (WEIGHT_CORRECTIONS_BY_KEY[key]) {
    return WEIGHT_CORRECTIONS_BY_KEY[key];
  }
  if (horse && horse.name && WEIGHT_CORRECTIONS_BY_NAME[horse.name]) {
    return WEIGHT_CORRECTIONS_BY_NAME[horse.name];
  }
  if (Number.isFinite(horse?.weight) && horse.weight > 0) return horse.weight;
  return horse?.sex === "F" ? 55 : 57;
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

async function main() {
  const weekly = await readJson(WEEKLY_RACES_PATH, { currentWeek: { races: [] } });
  const trainingTs = await fs.readFile(TRAINING_DATA_PATH, "utf8").catch(() => "");
  const insights = parseTrainingInsights(trainingTs);
  const insightMap = new Map(insights.map((x) => [`${x.courseId}:${x.horseId}`, x]));
  const totalRaces = (weekly.currentWeek?.races ?? []).length;
  if (totalRaces === 0) {
    throw new Error("currentWeek.races is empty; skip write to avoid wiping race data.");
  }

  let changed = 0;
  let trainingApplied = 0;

  for (const race of weekly.currentWeek?.races ?? []) {
    const horses = Array.isArray(race.horses) ? race.horses : [];
    horses.forEach((horse, idx) => {
      const targetGate = Number(horse.gateNumber ?? 0) > 0 ? Number(horse.gateNumber) : idx + 1;
      if (horse.gateNumber !== targetGate) {
        horse.gateNumber = targetGate;
        changed++;
      }

      const targetWeight = normalizeWeight(race.courseId, horse);
      if (horse.weight !== targetWeight) {
        horse.weight = targetWeight;
        changed++;
      }

      const insight = insightMap.get(`${race.courseId}:${horse.id}`);
      if (insight && (horse.trainingScore === undefined || horse.trainingScore === 0)) {
        horse.trainingScore = insight.score;
        horse.trainingNote = insight.note;
        trainingApplied++;
        changed++;
      }
    });
  }

  await fs.writeFile(WEEKLY_RACES_PATH, JSON.stringify(weekly, null, 2), "utf8");

  const allScores = (weekly.currentWeek?.races ?? [])
    .flatMap((r) => r.horses ?? [])
    .map((h) => Number(h.trainingScore ?? 0));
  const nonZero = allScores.filter((x) => x !== 0).length;

  console.log(
    `[daily-entry-check] changed=${changed}, trainingApplied=${trainingApplied}, nonZeroTraining=${nonZero}, totalHorses=${allScores.length}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
