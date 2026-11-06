import assert from "node:assert/strict";
import test from "node:test";
import { computeDayConditions, computeHorseFeatures } from "../lib/groundBiasFeatures.mjs";

const HOUR = 3_600_000;
const base = Date.parse("2026-11-01T10:00:00+09:00");

// 10 runners; top 3 came from the inner gates and from the front.
function innerFrontRace(raceId: string, startAt: number, ground = "Yielding") {
  return {
    raceId, startAt, surface: "Turf", groundCondition: ground,
    runners: Array.from({ length: 10 }, (_, index) => ({
      position: index + 1, horseNumber: index + 1, passing: [index + 1, index + 1],
    })),
  };
}

test("inner/front-favoured day gives negative bias and uses only confirmed earlier races", () => {
  const day = computeDayConditions({
    surface: "Turf", cutoffMs: base + 2 * HOUR,
    dayResults: [
      innerFrontRace("r1", base),
      innerFrontRace("r2", base + HOUR),
      innerFrontRace("late", base + 2 * HOUR - 10 * 60_000), // started but not confirmed
      { ...innerFrontRace("dirt", base), surface: "Dirt" },
    ],
  });
  assert.deepEqual(day.biasRaceIds, ["r1", "r2"]);
  assert.equal(day.n, 2);
  assert.ok(day.innerOuterToday! < 0);
  assert.ok(day.frontBackToday! < 0);
  assert.equal(day.groundToday, "Yielding");
  assert.equal(day.groundSource, "result");
});

test("no earlier race falls back to the announced ground and leaves bias null", () => {
  const day = computeDayConditions({ surface: "Turf", cutoffMs: base, dayResults: [], announcedGround: "Firm" as never });
  assert.equal(day.groundToday, "Firm");
  assert.equal(day.groundSource, "shutuba");
  assert.equal(day.innerOuterToday, null);
  assert.equal(day.n, 0);
});

test("inner gate and front runner score positive on an inner/front day", () => {
  const day = { groundToday: "Firm", innerOuterToday: -0.2, frontBackToday: -0.3 };
  const frontRuns = [{ raceId: "202605040101", date: "2026-10-01", surface: "Turf", passing: [1, 1], fieldSize: 10 }];
  const backRuns = [{ raceId: "202605040101", date: "2026-10-01", surface: "Turf", passing: [10, 10], fieldSize: 10 }];
  const inner = computeHorseFeatures({ horseNumber: 1, fieldSize: 10, pastRuns: frontRuns, surface: "Turf", raceDate: "2026-11-01" }, day);
  const outer = computeHorseFeatures({ horseNumber: 10, fieldSize: 10, pastRuns: backRuns, surface: "Turf", raceDate: "2026-11-01" }, day);
  assert.ok(inner.gateBiasFit! > 0 && outer.gateBiasFit! < 0);
  assert.ok(inner.styleBiasFit! > 0 && outer.styleBiasFit! < 0);
  assert.equal(inner.wetFit, null); // firm day
});

test("wetFit rewards horses closer to the winner on wet ground; ignores other surfaces and later runs", () => {
  const day = { groundToday: "Soft", innerOuterToday: null, frontBackToday: null };
  const runs = [
    { raceId: "202605040101", date: "2026-10-01", surface: "Turf", ground: "Yielding", timeDiff: 0.1 },
    { raceId: "202605040102", date: "2026-09-01", surface: "Turf", ground: "Firm", timeDiff: 1.1 },
    { raceId: "202605040103", date: "2026-08-01", surface: "Dirt", ground: "Soft", timeDiff: 9 },
    { raceId: "202605040104", date: "2026-11-02", surface: "Turf", ground: "Soft", timeDiff: 5 },
  ];
  const result = computeHorseFeatures({ horseNumber: 3, fieldSize: 10, pastRuns: runs, surface: "Turf", raceDate: "2026-11-01" }, day);
  assert.equal(result.wetFit, 1);
  assert.equal(result.gateBiasFit, null);
  assert.equal(result.styleBiasFit, null);
});
