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
