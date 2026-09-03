import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyHonmeiPick,
  pickTanpukuPair,
  TANPUKU_SCORING_VERSION,
} from "../lib/tanpukuSelection.mjs";
import {
  calibrateWinProb,
  calibratePlaceProb,
  estimatePlaceOdds,
} from "../lib/generatedCalibration.mjs";
import { runMonteCarlo } from "../lib/simulation";
import type { Course, RaceCondition } from "../lib/types";

// --- calibration functions ---

test("calibrateWinProb deflates the over-confident raw winProb band", () => {
  // 実績: 生winProb 0.4-0.5 帯の実際の的中率は約23% (n=146)
  const calibrated = calibrateWinProb(0.45);
  assert.ok(calibrated > 0.1 && calibrated < 0.3, `expected ~0.2, got ${calibrated}`);
});

test("calibration preserves monotonic ordering", () => {
  assert.ok(calibrateWinProb(0.4) < calibrateWinProb(0.5));
  assert.ok(calibrateWinProb(0.5) < calibrateWinProb(0.6));
  assert.ok(calibratePlaceProb(0.6) < calibratePlaceProb(0.7));
  assert.ok(calibratePlaceProb(0.7) < calibratePlaceProb(0.85));
});

test("calibratePlaceProb keeps the well-calibrated high band roughly intact", () => {
  // 実績: 生placeProb 0.8+ 帯は概ね校正済み (予測84.6% vs 実際83.8%)
  const calibrated = calibratePlaceProb(0.85);
  assert.ok(calibrated > 0.72 && calibrated < 0.92, `expected ~0.8, got ${calibrated}`);
});

// --- classification gates (v3.1: 単勝主軸) ---

test("null entry classifies as skip", () => {
  const hint = classifyHonmeiPick(null);
  assert.equal(hint.classification, "skip");
  assert.equal(hint.confidence, 0);
});

test("small field (<=9 horses) is a caution, not a skip", () => {
  // v2.4 は少頭数を hard skip にしていたが、公式払戻で採点すると前半 単ROI14% →
  // 後半 103% と反転し再現しなかった (n=12/21)。v3.1 では confidence 減点に降格。
  const small = classifyHonmeiPick({ winProb: 0.6, placeProb: 0.85, odds: 2.0, fieldSize: 8 });
  const large = classifyHonmeiPick({ winProb: 0.6, placeProb: 0.85, odds: 2.0, fieldSize: 14 });
  assert.equal(small.classification, "win");
  assert.equal(large.classification, "win");
  assert.match(small.reason ?? "", /少頭数/);
  assert.ok(small.confidence < large.confidence);
});

test("honmei at 4.0x or longer classifies as skip (混戦)", () => {
  // 本命が4.0倍以上のレースは単的中が両半期で10-17%しかない出血セグメント
  const hint = classifyHonmeiPick({
    winProb: 0.6,
    placeProb: 0.85,
    odds: 4.5,
    fieldSize: 14,
  });
  assert.equal(hint.classification, "skip");
  assert.match(hint.reason ?? "", /混戦/);
});

test("core win tier fires on calibrated win prob with market support", () => {
  // calWin(0.5)≈0.32: T1 (>=0.35) は満たさないが T2 (>=0.30 かつ odds<4.0) で単勝勝負
  const hint = classifyHonmeiPick({
    winProb: 0.5,
    placeProb: 0.85,
    odds: 3.0,
    fieldSize: 14,
  });
  assert.equal(hint.classification, "win");
  assert.match(hint.reason ?? "", /堅軸/);
});

test("weak calibrated probs on both axes classify as skip", () => {
  // calPlace(0.6)≈0.44 < 0.52 かつ calTanRoi = calWin(0.45)≈0.20 * 2.5 * 100 ≈ 49 < 85
  const hint = classifyHonmeiPick({
    winProb: 0.45,
    placeProb: 0.6,
    odds: 2.5,
    fieldSize: 14,
  });
  assert.equal(hint.classification, "skip");
  assert.match(hint.reason ?? "", /基準未満/);
});

test("strong calibrated win credentials classify as win", () => {
  // calWin(0.6)≈0.65 >= 0.35, calTanRoi ≈ 0.65 * 2.0 * 100 = 130 >= 95 → T1 本命級
  const hint = classifyHonmeiPick({
    winProb: 0.6,
    placeProb: 0.8,
    odds: 2.0,
    fieldSize: 14,
  });
  assert.equal(hint.classification, "win");
  assert.match(hint.reason ?? "", /本命級/);
});

test("stable place credentials without win strength classify as place", () => {
  // calWin(0.45)≈0.20 < 0.35, calPlace(0.85)≈0.82 >= 0.60
  const hint = classifyHonmeiPick({
    winProb: 0.45,
    placeProb: 0.85,
    odds: 3.0,
    fieldSize: 14,
  });
  assert.equal(hint.classification, "place");
  assert.match(hint.reason ?? "", /3着内安定/);
});

test("intermediate band falls back to relaxed place with low confidence", () => {
  // calWin(0.48)≈0.27 は win の両ゲート未満、calPlace(0.68)≈0.55 は place 本則未満、
  // calTanRoi ≈ 0.27 * 3.5 * 100 ≈ 94 は skip 基準超え → 中間帯
  const hint = classifyHonmeiPick({
    winProb: 0.48,
    placeProb: 0.68,
    odds: 3.5,
    fieldSize: 14,
  });
  assert.equal(hint.classification, "place");
  assert.ok(hint.confidence <= 0.4);
});

test("overbet label reduces confidence without flipping classification", () => {
  const base = classifyHonmeiPick({ winProb: 0.45, placeProb: 0.85, odds: 3.0, fieldSize: 14 });
  const overbet = classifyHonmeiPick({
    winProb: 0.45,
    placeProb: 0.85,
    odds: 3.0,
    fieldSize: 14,
    overbetLabel: "overbet_high",
  });
  assert.equal(overbet.classification, base.classification);
  assert.ok(overbet.confidence < base.confidence);
});

// --- pickTanpukuPair integration ---

function buildHorse(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `h${index}`,
    name: `テスト馬${index}`,
    gateNumber: index,
    jockey: "テスト",
    runningStyle: index % 2 === 0 ? "Senko" : "Sashi",
    speed: 78 + (index % 5),
    stamina: 76 + (index % 4),
    power: 74 + (index % 3),
    guts: 75,
    predictionCount: 20 - index,
    realOdds: 2 + index * 1.5,
    ...overrides,
  };
}

function buildRace(horseCount: number) {
  return {
    courseId: "tokyo-turf-1600-test",
    distance: 1600,
    straightLength: 525,
    trackBias: { innerOuter: 0, frontBack: 0 },
    horses: Array.from({ length: horseCount }, (_, i) => buildHorse(i + 1)),
  };
}

test("pickTanpukuPair emits v3.1 version and calibrated fields", () => {
  const result = pickTanpukuPair(buildRace(14));
  assert.ok(result);
  assert.equal(result.scoringVersion, "tanpuku-win-v3.1");
  assert.equal(TANPUKU_SCORING_VERSION, "tanpuku-win-v3.1");
  const winPick = result.winPick;
  assert.ok(winPick.classificationHint);
  assert.ok(["win", "place", "skip"].includes(winPick.classificationHint.classification));
  assert.ok(Number.isFinite(winPick.calWinProb));
  assert.ok(Number.isFinite(winPick.calPlaceProb));
  // 校正値は生値より控えめ側に出る (本命帯の生winProbは過大)
  assert.ok(winPick.calWinProb < winPick.winProb + 1e-9);
});

test("pickTanpukuPair skips a honmei that is weak on both calibrated axes", () => {
  // buildRace(8) の本命は 3.5倍 / calWin 0.13 / calPlace 0.50 → 両面基準未満で skip
  const result = pickTanpukuPair(buildRace(8));
  assert.ok(result);
  assert.equal(result.winPick.classificationHint.classification, "skip");
  assert.match(result.winPick.classificationHint.reason ?? "", /基準未満/);
});

// --- v2.5: placeOdds model / overbet label / wide recommendation ---

test("estimatePlaceOdds is far below the old odds*0.35+1.0 approximation", () => {
  // 実払戻フィット: 旧近似は1.4-1.6倍過大だった
  const oldApprox = (odds: number) => Math.max(1.1, odds * 0.35 + 1.0);
  for (const odds of [2, 4, 8, 20]) {
    const estimated = estimatePlaceOdds(odds);
    assert.ok(estimated >= 1.0, `floor violated at odds=${odds}`);
    assert.ok(estimated < oldApprox(odds), `expected below old approx at odds=${odds}`);
  }
  // 単調増加
  assert.ok(estimatePlaceOdds(3) < estimatePlaceOdds(10));
});

test("overbet label fires on calibrated market gap", () => {
  // winProb 0.45 → calWin ≈ 0.20。odds 2.0 → implied 0.5 → gap ≈ 0.30 → overbet_high
  const race = buildRace(14);
  race.horses[0] = buildHorse(1, { realOdds: 2.0, speed: 78, stamina: 76, power: 74 });
  const result = pickTanpukuPair(race);
  assert.ok(result);
  const entry = result.scored.find((e: { horse: { id: string } }) => e.horse.id === "h1");
  assert.ok(entry);
  assert.equal(entry.overbetLabel, "overbet_high");
});

test("wideRecommendation keeps the place pair shadow-only after live OOS misses the threshold", () => {
  const race = buildRace(14);
  race.horses[0] = buildHorse(1, {
    realOdds: 3.0,
    speed: 90,
    stamina: 90,
    power: 90,
    guts: 90,
  });
  const result = pickTanpukuPair(race);
  assert.ok(result);
  assert.ok(result.wideRecommendation);
  assert.equal(result.winPick.classificationHint.classification, "place");
  assert.equal(result.wideRecommendation.recommended, false);
  assert.equal(result.wideRecommendation.shadowOnly, true);
  const horseIds = result.wideRecommendation.horseIds;
  const horseNames = result.wideRecommendation.horseNames;
  assert.ok(horseIds);
  assert.ok(horseNames);
  assert.equal(horseIds.length, 2);
  assert.equal(horseNames.length, 2);
  assert.equal(horseIds[0], result.winPick.horse.id);
  assert.equal(horseIds[1], result.opponentPick.horse.id);
  assert.equal(horseNames[0], result.winPick.horse.name);
  assert.equal(horseNames[1], result.opponentPick.horse.name);
  assert.match(result.wideRecommendation.reason, /live OOS基準未達/);
  assert.match(result.wideRecommendation.reason, /推奨停止/);
  assert.match(result.wideRecommendation.reason, /シャドー監視は継続/);
});

test("wideRecommendation is not recommended for skip classification", () => {
  const result = pickTanpukuPair(buildRace(8));
  assert.ok(result);
  assert.equal(result.winPick.classificationHint.classification, "skip");
  assert.equal(result.wideRecommendation.recommended, false);
  assert.equal(result.wideRecommendation.shadowOnly, false);
});

// --- v2.5.1: marketGapLabel ---

test("marketGapLabel classifies the four market-gap bands", () => {
  const race = buildRace(14);
  const result = pickTanpukuPair(race);
  assert.ok(result);
  for (const entry of result.scored) {
    assert.ok(
      ["overbet_high", "overbet_moderate", "fair_priced", "underbet"].includes(entry.marketGapLabel),
      `unexpected label ${entry.marketGapLabel}`
    );
    // overbetLabel との整合: overbet 系は両ラベルで一致する
    if (entry.overbetLabel) {
      assert.equal(entry.marketGapLabel, entry.overbetLabel);
    }
  }
});

test("fair_priced honmei gets an explanatory note without confidence change", () => {
  // calWin(0.5)≈0.32 → odds 3.2 で implied 0.31 → |gap|<0.05 → fair_priced
  const fair = classifyHonmeiPick({
    winProb: 0.5,
    placeProb: 0.85,
    odds: 3.2,
    fieldSize: 14,
  });
  // 同条件で gap を overbet 側に大きくする (odds 1.6 → implied 0.63)
  const overbet = classifyHonmeiPick({
    winProb: 0.5,
    placeProb: 0.85,
    odds: 1.6,
    fieldSize: 14,
  });
  assert.match(fair.reason ?? "", /適正評価帯/);
  assert.doesNotMatch(overbet.reason ?? "", /適正評価帯/);
  // fair_priced は confidence を変えない: win T2 (堅軸) の基準値 0.6 のまま
  assert.equal(fair.classification, "win");
  assert.equal(fair.confidence, 0.6);
});

// --- v2.5: Monte Carlo top-3 frequency ---

test("runMonteCarlo reports top3Count alongside winCount", () => {
  const course: Course = {
    id: "test-course",
    name: "test",
    displayName: "test",
    distance: 1600,
    surface: "Turf",
    segments: [],
    straightLength: 450,
    hashtag: "#test",
  } as unknown as Course;
  const condition: RaceCondition = {
    courseId: "test-course",
    trackBias: { innerOuter: 0, frontBack: 0 },
    groundCondition: "Good",
    weather: "Sunny",
    windDirection: "Crosswind",
    windSpeed: 2,
    paceScenario: "Average",
  } as RaceCondition;
  const horses = Array.from({ length: 10 }, (_, i) => buildHorse(i + 1)) as never[];
  const results = runMonteCarlo(horses, course, condition, 60);
  assert.equal(results.length, 10);
  let top3Total = 0;
  for (const row of results) {
    assert.ok(Number.isFinite(row.top3Count), "top3Count must be finite");
    assert.ok(row.top3Count >= 0 && row.top3Count <= 100);
    // 3着内率は勝率以上になるはず (同一馬で top3 ⊇ win)
    assert.ok(row.top3Count >= row.winCount - 0.11, `top3 ${row.top3Count} < win ${row.winCount}`);
    top3Total += row.top3Count;
  }
  // 合計はおおよそ 300% (スムージングで多少ずれる)
  assert.ok(top3Total > 250 && top3Total < 350, `top3 sum ${top3Total}`);
});
