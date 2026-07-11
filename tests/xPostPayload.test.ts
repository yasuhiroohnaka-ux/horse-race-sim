import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPreRacePostPayload,
  buildReviewPostPayload,
  buildWeeklySummaryPostPayload,
} from "../lib/xPostPayload.mjs";

function buildTanpukuPairFixture(overrides: Record<string, unknown> = {}) {
  const horse = { id: "1", name: "テストホース", realOdds: 3.2, oddsSource: "netkeiba" };
  return {
    scoringVersion: "tanpuku-place-v2.5",
    scored: [],
    winPick: {
      horse,
      placeProb: 0.62,
      placeScore: 0.55,
      scoreGap: 0.04,
      top3Stability: 0.5,
      overbetLabel: null,
      classificationHint: { classification: "place", confidence: 0.6, reason: "test" },
      ...overrides,
    },
    opponentPick: null,
    widePick: null,
    valuePick: null,
  };
}

const race = {
  raceId: "202600000000",
  courseId: "test-course",
  label: "テストS",
  hashtag: "テストS",
  horses: Array.from({ length: 14 }, (_, i) => ({ id: String(i + 1), name: `馬${i + 1}`, realOdds: 5 })),
};

test("pre-race payload uses the decision attached by the caller as-is", () => {
  const decision = {
    action: "place",
    confidence: "medium",
    reasons: ["classification_aligned_action"],
    riskFlags: [],
    source: "explicit_live_rule",
  };
  const payload = buildPreRacePostPayload({
    day: "Sun",
    race,
    tanpukuPair: buildTanpukuPairFixture({ recommendedBetDecision: decision }),
    simBestHorse: null,
  });
  assert.equal(payload.tanpukuHonmei.recommendedBetDecision, decision);
  assert.equal(payload.tanpukuHonmei.recommendedBetAction, "place");
});

test("pre-race payload fallback delegates to recommendedBetDecisionCore (no raw-value thresholds)", () => {
  const payload = buildPreRacePostPayload({
    day: "Sun",
    race,
    tanpukuPair: buildTanpukuPairFixture(),
    simBestHorse: null,
  });
  const decision = payload.tanpukuHonmei.recommendedBetDecision;
  // core は hasSelectionLog=false を blocking 品質ゲートとして扱い action を出さない。
  // 旧・複製ロジック (placeProb≥0.56 等の生値閾値) なら "place" が出ていた。
  assert.equal(decision.action, "unknown");
  assert.equal(decision.source, "safety_rule");
  assert.ok(decision.riskFlags.includes("missing_selection_log"));
});

// --- P4-D: 回顧・週次実績投稿 ---

const reviewRace = {
  raceId: "202600000001",
  courseId: "review-course",
  label: "垂水Ｓ(3勝クラス)",
  hashtag: null,
  result: {
    winnerHorseName: "ジーティーダーリン",
    top3HorseIds: ["7", "3", "5"],
    finishers: [
      { position: 1, name: "ジーティーダーリン" },
      { position: 2, name: "ミュージシャン" },
      { position: 3, name: "バッデレイト" },
    ],
  },
};

test("review post matches classification against the result and sanitizes the hashtag", () => {
  const payload = buildReviewPostPayload({
    race: reviewRace,
    winRec: {
      horseId: "7",
      horseName: "ジーティーダーリン",
      classificationHint: { classification: "place", confidence: 0.6 },
      scoringVersion: "tanpuku-place-v2.5",
    },
    simBestHorseId: null,
  });
  assert.ok(payload);
  assert.match(payload.text, /分類: 複勝軸型 → 3着内/);
  const tagLine = payload.text.trimEnd().split("\n").at(-1) ?? "";
  assert.equal(tagLine, "#垂水Ｓ #AI予想");
});

test("review post reports skip classification outcome without a betting claim", () => {
  const payload = buildReviewPostPayload({
    race: reviewRace,
    winRec: {
      horseId: "9",
      horseName: "ハズレウマ",
      classificationHint: { classification: "skip", confidence: 0.65 },
    },
    simBestHorseId: null,
  });
  assert.ok(payload);
  assert.match(payload.text, /分類: 見送り → 見送り \(候補は圏外\)/);
});

test("weekly summary includes classification breakdown", () => {
  const recs = [
    {
      weekOf: "2026-07-06",
      resolved: true,
      pickType: "win",
      fukuOutcome: "hit",
      fukuPayout: 140,
      classificationHint: { classification: "place", confidence: 0.6 },
    },
    {
      weekOf: "2026-07-06",
      resolved: true,
      pickType: "win",
      fukuOutcome: "miss",
      fukuPayout: 0,
      classificationHint: { classification: "skip", confidence: 0.65 },
    },
  ];
  const payload = buildWeeklySummaryPostPayload({
    weeklyPerf: null,
    recs,
    weekOf: "2026-07-06",
    categoryReturnStats: [],
  });
  assert.match(payload.text, /内訳: 複勝軸1R\(複1\) \/ 単勝型0R \/ 見送り1R/);
});
