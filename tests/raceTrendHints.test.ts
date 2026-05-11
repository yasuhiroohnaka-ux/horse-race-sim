import assert from "node:assert/strict";
import test from "node:test";
import { RACE_TREND_PROFILES } from "../data/raceTrends";
import {
  applyRaceTrendHints,
  applyRaceTrendHintsToResults,
  findRaceTrendProfile,
} from "../lib/raceTrendHints";
import type { Course, Horse, RaceTrendProfile } from "../lib/types";

const nhkProfile = RACE_TREND_PROFILES.find((profile) => profile.raceKey === "nhk-mile-c");
const vmProfile = RACE_TREND_PROFILES.find((profile) => profile.raceKey === "victoria-mile");

function horse(overrides: Partial<Horse> = {}): Horse {
  return {
    id: "horse-1",
    name: "Test Horse",
    speed: 80,
    stamina: 80,
    power: 80,
    guts: 80,
    runningStyle: "Sashi",
    gateNumber: 10,
    jockey: "Test Jockey",
    predictionCount: 1,
    ...overrides,
  };
}

function profile(overrides: Partial<RaceTrendProfile> = {}): RaceTrendProfile {
  return {
    raceKey: "test-race",
    raceName: "Test Race",
    course: "Test Turf 1600",
    notes: [],
    trendHints: [
      {
        id: "test-previous-race",
        type: "previousRace",
        label: "Previous Test Stakes",
        condition: { previousRaceNames: ["Test Stakes"] },
        stats: {
          record: { win: 5, second: 5, third: 5, out: 25 },
          winRate: 0.125,
          place2Rate: 0.25,
          place3Rate: 0.375,
        },
        adjustment: 0.04,
        confidence: 0.5,
        explanation: "Test previous race trend.",
      },
    ],
    adjustmentPolicy: {
      maxPositiveAdjustment: 0.05,
      maxNegativeAdjustment: -0.05,
      defaultConfidence: 0.4,
    },
    ...overrides,
  };
}

test("matching previousRace hint is attached", () => {
  const result = applyRaceTrendHints(
    horse({ previousRaceName: "Test Stakes" }),
    0.2,
    profile()
  );

  assert.equal(result.matchedTrendHints.length, 1);
  assert.equal(result.matchedTrendHints[0].id, "test-previous-race");
  assert.equal(result.trendAdjustment, 0.02);
  assert.equal(result.adjustedScore, 0.22);
});

test("non-matching previousRace hint is not attached", () => {
  const result = applyRaceTrendHints(
    horse({ previousRaceName: "Other Race" }),
    0.2,
    profile()
  );

  assert.equal(result.matchedTrendHints.length, 0);
  assert.equal(result.trendAdjustment, 0);
  assert.equal(result.adjustedScore, 0.2);
});

test("multiple hints are capped by adjustment policy", () => {
  const cappedProfile = profile({
    trendHints: Array.from({ length: 3 }, (_, index) => ({
      id: `cap-${index}`,
      type: "previousRace",
      label: `Cap Test ${index}`,
      condition: { previousRaceNames: ["Test Stakes"] },
      stats: {
        record: { win: 10, second: 10, third: 10, out: 30 },
        winRate: 0.167,
        place2Rate: 0.333,
        place3Rate: 0.5,
      },
      adjustment: 0.05,
      confidence: 1,
      explanation: "Cap test.",
    })),
  });

  const result = applyRaceTrendHints(horse({ previousRaceName: "Test Stakes" }), 0.2, cappedProfile);

  assert.equal(result.matchedTrendHints.length, 3);
  assert.equal(result.trendAdjustment, 0.05);
  assert.equal(result.adjustedScore, 0.25);
});

test("confidence is reflected in adjustment", () => {
  const result = applyRaceTrendHints(
    horse({ previousRaceName: "Test Stakes" }),
    0.2,
    profile()
  );

  assert.equal(result.matchedTrendHints[0].rawAdjustment, 0.04);
  assert.equal(result.matchedTrendHints[0].confidence, 0.5);
  assert.equal(result.matchedTrendHints[0].adjustment, 0.02);
});

test("original and adjusted ranks are retained", () => {
  const ranked = applyRaceTrendHintsToResults(
    [
      { horseId: "a", winCount: 20 },
      { horseId: "b", winCount: 18.5 },
    ],
    [
      horse({ id: "a", gateNumber: 1, previousRaceName: "Other Race" }),
      horse({ id: "b", gateNumber: 2, previousRaceName: "Test Stakes" }),
    ],
    profile()
  );

  const horseA = ranked.find((row) => row.horseId === "a");
  const horseB = ranked.find((row) => row.horseId === "b");

  assert.equal(horseA?.originalRank, 1);
  assert.equal(horseA?.adjustedRank, 2);
  assert.equal(horseB?.originalRank, 2);
  assert.equal(horseB?.adjustedRank, 1);
});

test("missing trend profile keeps existing score order unchanged", () => {
  const ranked = applyRaceTrendHintsToResults(
    [
      { horseId: "a", winCount: 20 },
      { horseId: "b", winCount: 18 },
    ],
    [
      horse({ id: "a", gateNumber: 1, previousRaceName: "Test Stakes" }),
      horse({ id: "b", gateNumber: 2, previousRaceName: "Test Stakes" }),
    ],
    null
  );

  assert.deepEqual(
    ranked.map((row) => ({
      horseId: row.horseId,
      baseScore: row.baseScore,
      trendAdjustment: row.trendAdjustment,
      adjustedScore: row.adjustedScore,
      originalRank: row.originalRank,
      adjustedRank: row.adjustedRank,
      hintCount: row.matchedTrendHints.length,
    })),
    [
      {
        horseId: "a",
        baseScore: 0.2,
        trendAdjustment: 0,
        adjustedScore: 0.2,
        originalRank: 1,
        adjustedRank: 1,
        hintCount: 0,
      },
      {
        horseId: "b",
        baseScore: 0.18,
        trendAdjustment: 0,
        adjustedScore: 0.18,
        originalRank: 2,
        adjustedRank: 2,
        hintCount: 0,
      },
    ]
  );
});

test("NHK Mile trend profile can be resolved by race name", () => {
  const course: Course = {
    id: "tokyo-turf-1600-sample",
    name: "東京 芝 1600m (NHKマイルC)",
    distance: 1600,
    surface: "Turf",
    segments: [],
    straightLength: 525.9,
    hashtag: "#NHKマイルC",
  };

  assert.equal(findRaceTrendProfile(course)?.raceKey, "nhk-mile-c");
});

test("NZT second-place horse matches previousRace and finish-pattern hints", () => {
  assert.ok(nhkProfile);

  const result = applyRaceTrendHints(
    horse({ previousRaceName: "ニュージーランドT", previousFinish: 2 }),
    0.2,
    nhkProfile
  );

  assert.ok(result.matchedTrendHints.some((hint) => hint.id === "nhk-mile-previous-race-nzt"));
  assert.ok(result.matchedTrendHints.some((hint) => hint.id === "nhk-mile-nzt-second"));
  assert.ok(result.matchedTrendHints.some((hint) => hint.evidenceLabel === "前走: ニュージーランドT 2着"));
});

test("NZT alias matches finish-pattern hint", () => {
  assert.ok(nhkProfile);

  const result = applyRaceTrendHints(
    horse({ previousRaceName: "NZT", previousFinish: 2 }),
    0.2,
    nhkProfile
  );

  assert.ok(result.matchedTrendHints.some((hint) => hint.id === "nhk-mile-nzt-second"));
});

test("New Zealand Trophy full name matches finish-pattern hint", () => {
  assert.ok(nhkProfile);

  const result = applyRaceTrendHints(
    horse({ previousRaceName: "ニュージーランドトロフィー", previousFinish: 2 }),
    0.2,
    nhkProfile
  );

  assert.ok(result.matchedTrendHints.some((hint) => hint.id === "nhk-mile-nzt-second"));
});

test("Satsuki Sho horse matches Satsuki previousRace hint", () => {
  assert.ok(nhkProfile);

  const result = applyRaceTrendHints(
    horse({ previousRaceName: "皐月賞", previousFinish: 8 }),
    0.2,
    nhkProfile
  );

  assert.ok(result.matchedTrendHints.some((hint) => hint.id === "nhk-mile-previous-race-satsuki-sho"));
});

test("horse without previousRaceName does not match previousRace hints", () => {
  assert.ok(nhkProfile);

  const result = applyRaceTrendHints(horse({ gateNumber: 10 }), 0.2, nhkProfile);
  const previousRaceHints = result.matchedTrendHints.filter(
    (hint) => hint.type === "previousRace" || hint.type === "previousRaceFinishPattern"
  );

  assert.equal(previousRaceHints.length, 0);
});

test("horse without previousFinish does not match finish-pattern hints", () => {
  assert.ok(nhkProfile);

  const result = applyRaceTrendHints(
    horse({ previousRaceName: "ニュージーランドT", previousFinish: undefined }),
    0.2,
    nhkProfile
  );
  const finishPatternHints = result.matchedTrendHints.filter((hint) => hint.type === "previousRaceFinishPattern");

  assert.equal(finishPatternHints.length, 0);
  assert.ok(result.matchedTrendHints.some((hint) => hint.id === "nhk-mile-previous-race-nzt"));
});

test("Victoria Mile trend profile can be resolved by race name", () => {
  const course: Course = {
    id: "tokyo-turf-1600-sample",
    name: "東京 芝 1600m (ヴィクトリアマイル)",
    distance: 1600,
    surface: "Turf",
    segments: [],
    straightLength: 525.9,
    hashtag: "#ヴィクトリアマイル",
  };

  assert.equal(findRaceTrendProfile(course)?.raceKey, "victoria-mile");
});

test("Victoria Mile trend profile can be resolved by courseId", () => {
  const course: Course = {
    id: "tokyo-turf-1600-202605020811",
    name: "東京 芝 1600m",
    distance: 1600,
    surface: "Turf",
    segments: [],
    straightLength: 525.9,
    hashtag: "#VM",
  };

  assert.equal(findRaceTrendProfile(course)?.raceKey, "victoria-mile");
});

test("Victoria Mile: 阪神牝馬S horse matches hint with mild positive adjustment", () => {
  assert.ok(vmProfile);

  const result = applyRaceTrendHints(
    horse({ previousRaceName: "阪神牝馬S" }),
    0.2,
    vmProfile
  );

  assert.ok(result.matchedTrendHints.some((hint) => hint.id === "vm-previous-race-hanshin-baba-s"));
  assert.ok(result.trendAdjustment > 0);
});

test("Victoria Mile: 中山牝馬S horse matches hint with mild positive adjustment", () => {
  assert.ok(vmProfile);

  const result = applyRaceTrendHints(
    horse({ previousRaceName: "中山牝馬S" }),
    0.2,
    vmProfile
  );

  assert.ok(result.matchedTrendHints.some((hint) => hint.id === "vm-previous-race-nakayama-baba-s"));
  assert.ok(result.trendAdjustment > 0);
});

test("Victoria Mile: 金鯱賞組はexplanationOnlyで補正ゼロ", () => {
  assert.ok(vmProfile);

  const result = applyRaceTrendHints(
    horse({ previousRaceName: "金鯱賞" }),
    0.2,
    vmProfile
  );

  const hint = result.matchedTrendHints.find((h) => h.id === "vm-previous-race-kinko-sho");
  assert.ok(hint);
  assert.equal(hint.adjustment, 0);
  assert.equal(result.trendAdjustment, 0);
});

test("Victoria Mile: 中山記念組はexplanationOnlyで補正ゼロ", () => {
  assert.ok(vmProfile);

  const result = applyRaceTrendHints(
    horse({ previousRaceName: "中山記念" }),
    0.2,
    vmProfile
  );

  const hint = result.matchedTrendHints.find((h) => h.id === "vm-previous-race-nakayama-kinen");
  assert.ok(hint);
  assert.equal(hint.adjustment, 0);
  assert.equal(result.trendAdjustment, 0);
});

test("Victoria Mile: 愛知杯組はexplanationOnlyで補正ゼロ", () => {
  assert.ok(vmProfile);

  const result = applyRaceTrendHints(
    horse({ previousRaceName: "愛知杯" }),
    0.2,
    vmProfile
  );

  const hint = result.matchedTrendHints.find((h) => h.id === "vm-previous-race-aichi-hai");
  assert.ok(hint);
  assert.equal(hint.adjustment, 0);
  assert.equal(result.trendAdjustment, 0);
});

test("Victoria Mile: 福島牝馬S組はスコアが僅かに下がる", () => {
  assert.ok(vmProfile);

  const result = applyRaceTrendHints(
    horse({ previousRaceName: "福島牝馬S" }),
    0.2,
    vmProfile
  );

  assert.ok(result.matchedTrendHints.some((hint) => hint.id === "vm-previous-race-fukushima-baba-s"));
  assert.ok(result.trendAdjustment < 0);
  assert.ok(result.trendAdjustment >= -0.04);
});

test("Victoria Mile: 前走なし馬は前走系hintにマッチしない", () => {
  assert.ok(vmProfile);

  const result = applyRaceTrendHints(horse(), 0.2, vmProfile);
  const previousRaceHints = result.matchedTrendHints.filter(
    (hint) => hint.type === "previousRace" || hint.type === "previousRaceFinishPattern"
  );

  assert.equal(previousRaceHints.length, 0);
});

test("draw-family hints are explanation-only and do not increase adjustment", () => {
  assert.ok(nhkProfile);

  const result = applyRaceTrendHints(
    horse({ gateNumber: 10 }),
    0.2,
    nhkProfile
  );
  const drawFamilyHints = result.matchedTrendHints.filter(
    (hint) => hint.type === "gateBias" || hint.type === "frameBias" || hint.type === "drawBias"
  );

  assert.ok(drawFamilyHints.length > 0);
  assert.equal(drawFamilyHints.every((hint) => hint.adjustment === 0), true);
  assert.equal(result.trendAdjustment, 0);
});
