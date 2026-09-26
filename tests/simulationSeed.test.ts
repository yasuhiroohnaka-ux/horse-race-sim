import assert from "node:assert/strict";
import test from "node:test";
import { buildPredictionSnapshot } from "../lib/predictionSnapshots";
import { createSimulationSeed, runMonteCarlo } from "../lib/simulation";
import type { Course, Horse, RaceCondition } from "../lib/types";

const course: Course = {
  id: "tokyo-turf-1600-seed-test",
  name: "Seed test",
  distance: 1600,
  surface: "Turf",
  segments: [],
  straightLength: 525,
  hashtag: "#SeedTest",
};
const condition: RaceCondition = {
  courseId: course.id,
  trackBias: { innerOuter: 0, frontBack: 0 },
  groundCondition: "Firm",
  weather: "Sunny",
  windDirection: "Crosswind",
  windSpeed: 0,
  paceScenario: "Average",
};
const horses: Horse[] = Array.from({ length: 8 }, (_, index) => ({
  id: String(index + 1),
  name: `Horse ${index + 1}`,
  speed: 75 + index,
  stamina: 78 + index % 3,
  power: 76 + index % 4,
  guts: 77 + index % 2,
  runningStyle: index % 2 ? "Sashi" : "Senko",
  gateNumber: index + 1,
  jockey: "Test Jockey",
  predictionCount: 8 - index,
  realOdds: 2 + index,
}));

test("same simulation seed reproduces MC results and snapshot ranked rows", async () => {
  const seed = 0x12345678;
  const first = runMonteCarlo(horses, course, condition, 200, seed);
  const second = runMonteCarlo(horses, course, condition, 200, seed);
  assert.deepEqual(first, second);

  const params = {
    horses, course, condition, simulationCount: 200, simulationSeed: seed,
    raceId: "209901010111", capturedAt: "2099-01-01T05:00:00Z",
  };
  const firstSnapshot = await buildPredictionSnapshot({ ...params, results: first });
  const secondSnapshot = await buildPredictionSnapshot({ ...params, results: second });
  assert.equal(firstSnapshot.simulationSeed, seed);
  assert.deepEqual(firstSnapshot.rankedRows, secondSnapshot.rankedRows);
});

test("generated simulation seed is an unsigned 32-bit integer", () => {
  const seed = createSimulationSeed();
  assert.ok(Number.isInteger(seed));
  assert.ok(seed >= 0 && seed <= 0xffffffff);
});

test("snapshot retains raw horse inputs, including zero and missing values", async () => {
  const inputHorses: Horse[] = horses.map((horse, index) => index === 0 ? {
    ...horse,
    trainingScore: 0,
    recentFormScore: null as unknown as number,
    recentTimeIndex: -1.5,
    lastRaceGradeScore: 3,
    distanceChange: -200,
    weight: 57,
    favoriteCount: 0,
    pedigreeScore: 72,
  } : horse);
  const snapshot = await buildPredictionSnapshot({
    horses: inputHorses,
    course,
    condition,
    results: runMonteCarlo(inputHorses, course, condition, 100, 123),
    simulationCount: 100,
    simulationSeed: 123,
    capturedAt: "2099-01-01T05:00:00Z",
  });
  const inputs = snapshot.rankedRows.find((row) => row.horseId === "1")?.inputs;
  assert.ok(inputs);
  assert.equal(Object.keys(inputs).length, 26);
  assert.equal(inputs.speed, 75);
  assert.equal(inputs.trainingScore, 0);
  assert.equal(inputs.recentFormScore, null);
  assert.equal(inputs.recentAverageFinish, null);
  assert.equal(inputs.recentTimeIndex, -1.5);
  assert.equal(inputs.lastRaceGradeScore, 3);
  assert.equal(inputs.distanceChange, -200);
  assert.equal(inputs.weight, 57);
  assert.equal(inputs.favoriteCount, 0);
  assert.equal(inputs.pedigreeScore, 72);
  assert.equal(inputs.jockeyPower, null);
  assert.equal(JSON.parse(JSON.stringify(snapshot)).rankedRows.find((row: { horseId: string }) =>
    row.horseId === "1")?.inputs.recentFormScore, null);
});
