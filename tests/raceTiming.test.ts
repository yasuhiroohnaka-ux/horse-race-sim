import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyRecommendationTiming,
  getRaceStartTimestamp,
  isAfterRaceCompletionBuffer,
  isBeforeRaceStart,
} from "../lib/raceTiming.mjs";

const race = {
  raceDate: "2026-07-12",
  scheduledStartTime: "16:30",
};

test("JSTのraceDateとHH:mmから発走時刻を解決する", () => {
  assert.equal(getRaceStartTimestamp(race), Date.parse("2026-07-12T16:30:00+09:00"));
  assert.equal(isBeforeRaceStart(race, new Date("2026-07-12T16:29:59+09:00")), true);
  assert.equal(isBeforeRaceStart(race, new Date("2026-07-12T16:30:00+09:00")), false);
  assert.equal(isBeforeRaceStart(race, new Date("2026-07-12T16:26:00+09:00"), 5 * 60_000), false);
});

test("ISO形式のscheduledStartTimeも扱う", () => {
  const isoRace = { scheduledStartTime: "2026-07-12T16:30:00+09:00" };
  assert.equal(getRaceStartTimestamp(isoRace), Date.parse("2026-07-12T16:30:00+09:00"));
});

test("発走後の推薦をretrospectiveへ分類する", () => {
  assert.equal(classifyRecommendationTiming(race, "2026-07-12T16:29:00+09:00"), "live_pre_race");
  assert.equal(classifyRecommendationTiming(race, "2026-07-12T16:30:00+09:00"), "retrospective");
  assert.equal(classifyRecommendationTiming({}, "2026-07-12T16:00:00+09:00"), "unknown");
});

test("決済は発走30分後まで待つ", () => {
  assert.equal(isAfterRaceCompletionBuffer(race, new Date("2026-07-12T16:59:59+09:00")), false);
  assert.equal(isAfterRaceCompletionBuffer(race, new Date("2026-07-12T17:00:00+09:00")), true);
});
