import assert from "node:assert/strict";
import test from "node:test";
import { RUNNER_PREVIOUS_RACE_OVERRIDES } from "../data/runnerPreviousRaceOverrides";
import { RACE_TREND_PROFILES } from "../data/raceTrends";
import { getDefaultHorses } from "../lib/defaultHorses";
import { applyRaceTrendHints, findRaceTrendProfile } from "../lib/raceTrendHints";
import { COURSES } from "../lib/courses";

const nhkMileCourseId = "tokyo-turf-1600-202605020611";
const nhkMileRaceKey = "nhk-mile-c";

test("NHK Mile previous-race overrides are reachable from the displayed course id", () => {
  const course = COURSES.find((entry) => entry.id === nhkMileCourseId);

  assert.ok(course);
  assert.equal(findRaceTrendProfile(course)?.raceKey, nhkMileRaceKey);
  assert.ok(RUNNER_PREVIOUS_RACE_OVERRIDES[nhkMileRaceKey]?.レザベーション);
});

test("NHK Mile generated horses receive previous-race overrides by horse name", () => {
  const horses = getDefaultHorses(nhkMileCourseId);
  const byName = new Map(horses.map((horse) => [horse.name, horse]));

  assert.deepEqual(
    ["ダイヤモンドノット", "アンドゥーリル", "サンダーストラック"].map((name) => ({
      name,
      previousRaceName: byName.get(name)?.previousRaceName,
      previousFinish: byName.get(name)?.previousFinish,
    })),
    [
      { name: "ダイヤモンドノット", previousRaceName: "ファルコンS", previousFinish: 1 },
      { name: "アンドゥーリル", previousRaceName: "チャーチルダウンズC", previousFinish: 8 },
      { name: "サンダーストラック", previousRaceName: "チャーチルダウンズC", previousFinish: 12 },
    ]
  );

  assert.deepEqual(
    ["レザベーション", "ロデオドライブ", "ジーネキング"].map((name) => ({
      name,
      previousRaceName: byName.get(name)?.previousRaceName,
      previousFinish: byName.get(name)?.previousFinish,
    })),
    [
      { name: "レザベーション", previousRaceName: "ニュージーランドT", previousFinish: 1 },
      { name: "ロデオドライブ", previousRaceName: "ニュージーランドT", previousFinish: 2 },
      { name: "ジーネキング", previousRaceName: "ニュージーランドT", previousFinish: 3 },
    ]
  );
});

test("NHK Mile NZT previous-race overrides produce the expected trend hints", () => {
  const nhkProfile = RACE_TREND_PROFILES.find((profile) => profile.raceKey === nhkMileRaceKey);

  assert.ok(nhkProfile);

  const nztWinner = applyRaceTrendHints(
    {
      id: "winner",
      name: "レザベーション",
      speed: 80,
      stamina: 80,
      power: 80,
      guts: 80,
      runningStyle: "Senko",
      gateNumber: 10,
      jockey: "原",
      predictionCount: 1,
      previousRaceName: "ニュージーランドT",
      previousFinish: 1,
    },
    0.2,
    nhkProfile
  );
  const nztSecond = applyRaceTrendHints(
    {
      id: "second",
      name: "ロデオドライブ",
      speed: 80,
      stamina: 80,
      power: 80,
      guts: 80,
      runningStyle: "Senko",
      gateNumber: 11,
      jockey: "津村",
      predictionCount: 1,
      previousRaceName: "ニュージーランドT",
      previousFinish: 2,
    },
    0.2,
    nhkProfile
  );

  assert.ok(nztWinner.matchedTrendHints.some((hint) => hint.id === "nhk-mile-previous-race-nzt"));
  assert.ok(nztWinner.matchedTrendHints.some((hint) => hint.id === "nhk-mile-nzt-winner-risk"));
  assert.ok(!nztSecond.matchedTrendHints.some((hint) => hint.id === "nhk-mile-nzt-winner-risk"));
  assert.ok(nztSecond.matchedTrendHints.some((hint) => hint.id === "nhk-mile-previous-race-nzt"));
  assert.ok(nztSecond.matchedTrendHints.some((hint) => hint.id === "nhk-mile-nzt-second"));
});
