import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecommendedBetDecision,
  deriveRecommendedBetActionForSelection,
  normalizeRecommendedBetAction,
} from "../lib/recommendedBetAction";

test("missing stored recommendedBetAction normalizes to unknown", () => {
  assert.equal(normalizeRecommendedBetAction(undefined), "unknown");
  assert.equal(normalizeRecommendedBetAction(null), "unknown");
});

test("new selection persistence can derive action from classificationHint explicitly", () => {
  assert.equal(
    deriveRecommendedBetActionForSelection(undefined, {
      classification: "win",
      confidence: 0.8,
      reason: "test",
    }),
    "win"
  );
});

test("explicit recommendedBetAction is preserved over classificationHint", () => {
  assert.equal(
    deriveRecommendedBetActionForSelection("skip", {
      classification: "win",
      confidence: 0.8,
      reason: "test",
    }),
    "skip"
  );
});

test("decision builder does not turn classification win into action win outside live pre-race", () => {
  const decision = buildRecommendedBetDecision({
    sourceStatus: "retrospective",
    livePreRaceEligible: false,
    classificationHint: {
      classification: "win",
      confidence: 0.8,
      reason: "test",
    },
    oddsSource: "forecast",
    hasSelectionLog: true,
  });

  assert.equal(decision.action, "unknown");
  assert.ok(decision.riskFlags.includes("not_live_pre_race"));
  assert.ok(decision.riskFlags.includes("retrospective_only"));
});

test("decision builder requires selection audit data before win", () => {
  const decision = buildRecommendedBetDecision({
    sourceStatus: "live_pre_race",
    livePreRaceEligible: true,
    classificationHint: {
      classification: "win",
      confidence: 0.8,
      reason: "test",
    },
    oddsSource: "forecast",
    hasSelectionLog: false,
  });

  assert.equal(decision.action, "unknown");
  assert.ok(decision.riskFlags.includes("missing_selection_log"));
});

test("decision builder allows skip when live pre-race audit data is present", () => {
  const decision = buildRecommendedBetDecision({
    sourceStatus: "live_pre_race",
    livePreRaceEligible: true,
    classificationHint: {
      classification: "skip",
      confidence: 0.8,
      reason: "test",
    },
    oddsSource: "forecast",
    hasSelectionLog: true,
  });

  assert.equal(decision.action, "skip");
  assert.equal(decision.source, "explicit_live_rule");
});

test("decision builder only allows win when live pre-race audit data is present", () => {
  const decision = buildRecommendedBetDecision({
    sourceStatus: "live_pre_race",
    livePreRaceEligible: true,
    classificationHint: {
      classification: "win",
      confidence: 0.8,
      reason: "test",
    },
    scoreGap: 0.08,
    placeProb: 0.7,
    top3Stability: 0.5,
    fieldSize: 12,
    engineAgreement: true,
    oddsSource: "forecast",
    hasSelectionLog: true,
  });

  assert.equal(decision.action, "win");
  assert.deepEqual(decision.riskFlags, []);
  assert.ok(decision.reasons.includes("classification_hint_win"));
});

test("decision builder does not allow win from classification alone", () => {
  const decision = buildRecommendedBetDecision({
    sourceStatus: "live_pre_race",
    livePreRaceEligible: true,
    classificationHint: {
      classification: "win",
      confidence: 0.8,
      reason: "test",
    },
    oddsSource: "forecast",
    hasSelectionLog: true,
  });

  assert.equal(decision.action, "unknown");
  assert.ok(decision.riskFlags.includes("missing_score_gap"));
  assert.ok(decision.riskFlags.includes("missing_place_probability"));
});

test("decision builder downgrades a non-strict win hint to place when stability gate passes", () => {
  const decision = buildRecommendedBetDecision({
    sourceStatus: "live_pre_race",
    livePreRaceEligible: true,
    classificationHint: {
      classification: "win",
      confidence: 0.8,
      reason: "test",
    },
    scoreGap: 0.025,
    placeProb: 0.6,
    top3Stability: 0.4,
    fieldSize: 14,
    engineAgreement: false,
    oddsSource: "forecast",
    hasSelectionLog: true,
  });

  assert.equal(decision.action, "place");
  assert.ok(decision.reasons.includes("place_safety_gate"));
  assert.ok(decision.riskFlags.includes("engine_disagreement"));
});

test("decision builder skips tiny-gap large-field races after safety gates pass", () => {
  const decision = buildRecommendedBetDecision({
    sourceStatus: "live_pre_race",
    livePreRaceEligible: true,
    classificationHint: {
      classification: "win",
      confidence: 0.8,
      reason: "test",
    },
    scoreGap: 0.006,
    placeProb: 0.58,
    top3Stability: 0.38,
    fieldSize: 18,
    engineAgreement: true,
    oddsSource: "forecast",
    hasSelectionLog: true,
  });

  assert.equal(decision.action, "skip");
  assert.ok(decision.reasons.includes("tiny_score_gap_large_field"));
});
