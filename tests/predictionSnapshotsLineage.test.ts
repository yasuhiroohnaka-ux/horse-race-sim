import assert from "node:assert/strict";
import test from "node:test";
import { buildPredictionSnapshot } from "../lib/predictionSnapshots";
import type { Course, Horse, RaceCondition } from "../lib/types";

const course: Course = {
  id: "tokyo-turf-1600-209901010111",
  name: "Lineage Test",
  distance: 1600,
  surface: "Turf",
  segments: [],
  straightLength: 525,
  hashtag: "#LineageTest",
};

const condition: RaceCondition = {
  courseId: course.id,
  trackBias: { innerOuter: 0, frontBack: 0 },
  groundCondition: "Firm",
  weather: "Sunny",
  windDirection: "Crosswind",
  windSpeed: 2,
  paceScenario: "Average",
};

function horse(overrides: Partial<Horse>): Horse {
  return {
    id: "1",
    name: "Alpha",
    speed: 82,
    stamina: 80,
    power: 78,
    guts: 79,
    runningStyle: "Senko",
    runningStyleSource: "guessed_fallback",
    runningStyleInitialSource: "guessed_fallback",
    gateNumber: 1,
    jockey: "Jockey A",
    predictionCount: 1,
    realOdds: 4.2,
    oddsSource: "forecast",
    previousRaceName: "Previous Stakes",
    previousFinish: 2,
    previousRaceSource: "manual-override",
    runnerPreviousRaceOverrideApplied: true,
    ...overrides,
  };
}

test("live pre-race snapshot records source lineage and row-level data provenance", async () => {
  const horses = [
    horse({ id: "1", name: "Alpha", gateNumber: 1 }),
    horse({ id: "2", name: "Beta", gateNumber: 2, realOdds: 8.8, speed: 76 }),
  ];
  const results = [
    { horseId: "1", winCount: 60, bestTime: 95.1 },
    { horseId: "2", winCount: 40, bestTime: 95.8 },
  ];
  const tanpukuPair = {
    scoringVersion: "tanpuku-place-v2.3",
    valueCandidateCount: 1,
    marketHeatSummary: { overbetHorseCount: 0 },
    winPick: {
      horse: horses[0],
      score: 81,
      winProb: 0.22,
      placeProb: 0.7,
      placeScore: 0.58,
      valueScore: 0.49,
      placeOdds: 2.5,
      top3Stability: 0.5,
      selectionReason: "placeScore leader",
      scoreGap: 0.08,
      classificationHint: { classification: "win", confidence: 0.8, reason: "test" },
    },
  };

  const snapshot = await buildPredictionSnapshot({
    results,
    horses,
    course,
    condition,
    simulationCount: 100,
    raceId: "209901010111",
    scheduledStartTime: "2099-01-01T15:45:00+09:00",
    capturedAt: "2099-01-01T06:30:00.000Z",
    dataUpdatedAt: "2099-01-01T05:00:00.000Z",
    snapshotType: "pre_race_final",
    oddsFetchedAt: "2099-01-01T05:30:00.000Z",
    oddsSource: "forecast",
    predictionOrigin: "saved_live",
    tanpukuPair,
  });

  assert.equal(snapshot.sourceStatus, "live_pre_race");
  assert.equal(snapshot.livePreRaceEligible, true);
  assert.equal(snapshot.dataLineage?.capturedBeforeScheduledStart, true);
  assert.equal(snapshot.dataLineage?.oddsSource, "forecast");
  assert.equal(snapshot.selectionLog?.entries.find((entry) => entry.role === "honmei")?.classificationHint?.classification, "win");
  assert.equal(snapshot.selectionLog?.entries.find((entry) => entry.role === "honmei")?.recommendedBetAction, "win");
  assert.equal(snapshot.selectionLog?.entries.find((entry) => entry.role === "simulation_leader")?.recommendedBetAction, "unknown");

  const alphaRow = snapshot.rankedRows.find((row) => row.horseId === "1");
  assert.equal(alphaRow?.runningStyleSource, "guessed_fallback");
  assert.equal(alphaRow?.oddsSource, "forecast");
  assert.equal(alphaRow?.oddsFetchedAt, "2099-01-01T05:30:00.000Z");
  assert.equal(alphaRow?.previousRaceName, "Previous Stakes");
  assert.equal(alphaRow?.previousFinish, 2);
  assert.equal(alphaRow?.previousRaceSource, "manual-override");
  assert.equal(alphaRow?.runnerPreviousRaceOverrideApplied, true);
});

test("late saved-live snapshot is marked retrospective instead of live pre-race", async () => {
  const horses = [horse({ id: "1" }), horse({ id: "2", name: "Beta", gateNumber: 2, speed: 76 })];
  const snapshot = await buildPredictionSnapshot({
    results: [
      { horseId: "1", winCount: 60, bestTime: 95.1 },
      { horseId: "2", winCount: 40, bestTime: 95.8 },
    ],
    horses,
    course,
    condition,
    simulationCount: 100,
    raceId: "209901010111",
    scheduledStartTime: "2099-01-01T15:45:00+09:00",
    capturedAt: "2099-01-01T07:00:01.000Z",
    snapshotType: "pre_race_final",
    predictionOrigin: "saved_live",
  });

  assert.equal(snapshot.sourceStatus, "retrospective");
  assert.equal(snapshot.livePreRaceEligible, false);
});
