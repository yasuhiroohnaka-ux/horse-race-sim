import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pickTanpukuPair } from "../lib/tanpukuSelection.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const PATHS = {
  reviewRecords: path.join(ROOT, "data", "review-records.json"),
  predictionSnapshots: path.join(ROOT, "data", "prediction-snapshots.jsonl"),
  routineState: path.join(ROOT, "data", "routine-state.json"),
  weeklyRaces: path.join(ROOT, "data", "weekly-races.json"),
};

const WIN_PROB_MIN = 0.18;
const TAN_ROI_MIN = 80;
const SCORE_GAP_MIN = 0.015;
const PLACE_PROB_MIN = 0.5;
const TOP3_STABILITY_MIN = 0.3;
const DECISION_THRESHOLDS = {
  win: { scoreGap: 0.05, placeProb: 0.62, top3Stability: 0.45, maxFieldSize: 15 },
  place: { scoreGap: 0.015, placeProb: 0.56, top3Stability: 0.35, maxFieldSize: 18 },
  skip: { tinyScoreGap: 0.01, largeFieldSize: 16, lowPlaceProb: 0.45, lowTop3Stability: 0.3 },
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function readJsonl(file) {
  try {
    return fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function inc(target, key) {
  target[key] = (target[key] ?? 0) + 1;
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeClassification(value) {
  return value === "win" || value === "place" || value === "skip" ? value : "missing";
}

function normalizeRecommendedBetAction(value) {
  return value === "win" || value === "place" || value === "skip" || value === "unknown" ? value : "unknown";
}

function rawRecommendedBetAction(value) {
  return value === "win" || value === "place" || value === "skip" || value === "unknown" ? value : "missing";
}

function normalizeDecision(value, fallbackAction = "unknown") {
  if (!value || typeof value !== "object") {
    return {
      action: normalizeRecommendedBetAction(fallbackAction),
      confidence: "unknown",
      source: "fallback",
      reasons: [],
      riskFlags: ["recommendedBetDecision_missing"],
    };
  }
  const action = normalizeRecommendedBetAction(value?.action ?? fallbackAction);
  const confidence = ["high", "medium", "low", "unknown"].includes(value?.confidence)
    ? value.confidence
    : action === "unknown"
      ? "unknown"
      : "low";
  return {
    action,
    confidence,
    source: ["explicit_live_rule", "safety_rule", "fallback", "unknown"].includes(value?.source)
      ? value.source
      : action === "unknown"
        ? "fallback"
        : "unknown",
    reasons: Array.isArray(value?.reasons) ? value.reasons.map(String).filter(Boolean) : [],
    riskFlags: Array.isArray(value?.riskFlags) ? value.riskFlags.map(String).filter(Boolean) : [],
  };
}

function pairKey(left, right) {
  return `${left}->${right}`;
}

function limitedPush(target, value, limit = 12) {
  if (target.length < limit) target.push(value);
}

function addNestedCount(target, left, right) {
  target[left] ||= {};
  inc(target[left], right);
}

function createMismatchSummary() {
  return {
    count: 0,
    byPair: {},
    samples: [],
  };
}

function addMismatch(summary, left, right, sample) {
  summary.count += 1;
  inc(summary.byPair, pairKey(left, right));
  limitedPush(summary.samples, sample);
}

function applySafetyScopedAction(action, context) {
  if (action === "unknown") {
    return { action: "unknown", reason: "recommendedBetAction_unknown_or_missing" };
  }
  if (context.sourceStatus && context.sourceStatus !== "live_pre_race") {
    return { action: "unknown", reason: "not_live_pre_race" };
  }
  if (context.requiresSelectionLog && !context.hasSelectionLog) {
    return { action: "unknown", reason: "selectionLog_missing" };
  }
  if (action === "skip") {
    return { action: "skip", reason: "model_skip" };
  }
  return { action, reason: "passed_safety_gate" };
}

function buildDiagnosticDecision(input = {}) {
  const classification = normalizeClassification(input.classificationHint?.classification);
  const oddsSource = String(input.oddsSource ?? "").trim().toLowerCase();
  const overbetLabel = String(input.overbetLabel ?? "").trim().toLowerCase();
  const scoreGap = toNumber(input.scoreGap);
  const placeProb = toNumber(input.placeProb);
  const top3Stability = toNumber(input.top3Stability);
  const fieldSize = toNumber(input.fieldSize);
  const reasons = [];
  const riskFlags = [];
  if (input.sourceStatus === "live_pre_race") reasons.push("live_pre_race_snapshot");
  if (classification !== "missing") reasons.push(`classification_hint_${classification}`);
  if (oddsSource && oddsSource !== "unknown") reasons.push("valid_odds_source");
  if (input.hasSelectionLog === true) reasons.push("selection_log_available");
  if (input.sourceStatus !== "live_pre_race") riskFlags.push("not_live_pre_race");
  if (input.livePreRaceEligible !== true) riskFlags.push("not_live_pre_race_eligible");
  if (classification === "missing") riskFlags.push("missing_classification_hint");
  if (input.hasSelectionLog !== true) riskFlags.push("missing_selection_log");
  if (!oddsSource || oddsSource === "unknown") riskFlags.push("odds_source_unknown");
  if (input.engineAgreement === false) riskFlags.push("engine_disagreement");
  if (scoreGap !== null && scoreGap < 0.01) riskFlags.push("small_score_gap");
  if (fieldSize !== null && fieldSize >= 16) riskFlags.push("large_field_size");
  if (overbetLabel === "overbet_high") riskFlags.push("overbet_high");
  if (overbetLabel === "overbet_moderate") riskFlags.push("overbet_moderate");
  if (placeProb !== null && placeProb < DECISION_THRESHOLDS.skip.lowPlaceProb) riskFlags.push("low_place_probability");
  if (top3Stability !== null && top3Stability < DECISION_THRESHOLDS.skip.lowTop3Stability) riskFlags.push("low_top3_stability");

  const blockingRiskFlags = riskFlags.filter((flag) =>
    ["not_live_pre_race", "not_live_pre_race_eligible", "missing_classification_hint", "missing_selection_log", "odds_source_unknown"].includes(flag)
  );
  if (blockingRiskFlags.length > 0) {
    return { action: "unknown", confidence: "unknown", source: "safety_rule", reasons, riskFlags };
  }
  if (classification === "skip") {
    return { action: "skip", confidence: "medium", source: "explicit_live_rule", reasons: [...reasons, "classification_hint_skip"], riskFlags };
  }
  const hasTinyLargeFieldRisk = scoreGap !== null && scoreGap < DECISION_THRESHOLDS.skip.tinyScoreGap && fieldSize !== null && fieldSize >= DECISION_THRESHOLDS.skip.largeFieldSize;
  const hasWeakStabilityRisk = placeProb !== null && placeProb < DECISION_THRESHOLDS.skip.lowPlaceProb && top3Stability !== null && top3Stability < DECISION_THRESHOLDS.skip.lowTop3Stability;
  const hasDisagreementRisk = input.engineAgreement === false && scoreGap !== null && scoreGap < DECISION_THRESHOLDS.place.scoreGap;
  if (hasTinyLargeFieldRisk || hasWeakStabilityRisk || hasDisagreementRisk) {
    return {
      action: "skip",
      confidence: "low",
      source: "explicit_live_rule",
      reasons: [
        ...reasons,
        hasTinyLargeFieldRisk ? "tiny_score_gap_large_field" : "",
        hasWeakStabilityRisk ? "weak_place_stability" : "",
        hasDisagreementRisk ? "engine_disagreement_small_gap" : "",
      ].filter(Boolean),
      riskFlags,
    };
  }
  const missingActionInputs = [];
  if (scoreGap === null) missingActionInputs.push("missing_score_gap");
  if (placeProb === null) missingActionInputs.push("missing_place_probability");
  if (top3Stability === null) missingActionInputs.push("missing_top3_stability");
  if (fieldSize === null) missingActionInputs.push("missing_field_size");
  if (missingActionInputs.length > 0) {
    return { action: "unknown", confidence: "unknown", source: "safety_rule", reasons, riskFlags: [...riskFlags, ...missingActionInputs] };
  }
  const winQualified =
    classification === "win" &&
    scoreGap >= DECISION_THRESHOLDS.win.scoreGap &&
    placeProb >= DECISION_THRESHOLDS.win.placeProb &&
    top3Stability >= DECISION_THRESHOLDS.win.top3Stability &&
    fieldSize <= DECISION_THRESHOLDS.win.maxFieldSize &&
    input.engineAgreement === true &&
    overbetLabel !== "overbet_high";
  if (winQualified) {
    return { action: "win", confidence: riskFlags.length ? "low" : "high", source: "explicit_live_rule", reasons: [...reasons, "strict_win_gate", "strong_score_gap", "high_place_probability", "stable_top3", "engine_agreement"], riskFlags };
  }
  const placeQualified =
    (classification === "win" || classification === "place") &&
    scoreGap >= DECISION_THRESHOLDS.place.scoreGap &&
    placeProb >= DECISION_THRESHOLDS.place.placeProb &&
    top3Stability >= DECISION_THRESHOLDS.place.top3Stability &&
    fieldSize <= DECISION_THRESHOLDS.place.maxFieldSize &&
    overbetLabel !== "overbet_high";
  if (placeQualified) {
    return { action: "place", confidence: riskFlags.length ? "low" : "medium", source: "explicit_live_rule", reasons: [...reasons, "place_safety_gate", "sufficient_score_gap", "place_probability_ok", "top3_stability_ok"], riskFlags };
  }
  return { action: "unknown", confidence: "unknown", source: "safety_rule", reasons, riskFlags: [...riskFlags, "explicit_action_gate_not_met"] };
}

function resolveSourceStatus(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return "unknown";
  if (snapshot.sourceStatus) return String(snapshot.sourceStatus);
  if (snapshot.snapshotType === "manual_snapshot" || snapshot.predictionOrigin === "saved_manual") {
    return "manual_snapshot";
  }
  if (snapshot.predictionOrigin === "backfill") return "retrospective";

  const capturedAt = Date.parse(String(snapshot.capturedAt ?? snapshot.snapshotTakenAt ?? ""));
  const scheduledStartTime = Date.parse(String(snapshot.scheduledStartTime ?? ""));
  if (Number.isFinite(capturedAt) && Number.isFinite(scheduledStartTime)) {
    return capturedAt < scheduledStartTime ? "live_pre_race" : "retrospective";
  }
  return "unknown";
}

function addSelectionSummary(summary, classification, recommendedBetAction, sourceStatus = "all") {
  inc(summary.byClassification, classification);
  inc(summary.byRecommendedBetAction, recommendedBetAction);
  addNestedCount(summary.bySourceStatusClassification, sourceStatus, classification);
  addNestedCount(summary.bySourceStatusRecommendedBetAction, sourceStatus, recommendedBetAction);
}

function addDecisionSummary(summary, decision, actionForReason = decision.action) {
  inc(summary.byRecommendedBetDecisionAction, decision.action);
  inc(summary.byRecommendedBetDecisionConfidence, decision.confidence);
  inc(summary.byRecommendedBetDecisionSource, decision.source);
  for (const riskFlag of decision.riskFlags.length ? decision.riskFlags : ["none"]) {
    inc(summary.riskFlags, riskFlag);
  }
  const reasons = decision.reasons.length ? decision.reasons : ["no_reason_recorded"];
  if (actionForReason === "unknown") {
    for (const reason of [...decision.riskFlags, ...reasons]) inc(summary.unknownReasons, reason);
  }
  if (actionForReason === "skip") {
    for (const reason of [...decision.riskFlags, ...reasons]) inc(summary.skipReasons, reason);
  }
  if (actionForReason === "win") {
    for (const reason of reasons) inc(summary.winReasons, reason);
  }
  if (actionForReason === "place") {
    for (const reason of reasons) inc(summary.placeReasons, reason);
  }
}

function addDecisionFields(summary) {
  summary.byRecommendedBetDecisionAction = {};
  summary.byRecommendedBetDecisionConfidence = {};
  summary.byRecommendedBetDecisionSource = {};
  summary.riskFlags = {};
  summary.unknownReasons = {};
  summary.skipReasons = {};
  summary.winReasons = {};
  summary.placeReasons = {};
}

function getReviewRecords() {
  const store = readJson(PATHS.reviewRecords, { records: {} });
  if (Array.isArray(store)) return store;
  return Object.values(store.records ?? store ?? {});
}

function summarizeReviewRecords() {
  const records = getReviewRecords();
  const summary = {
    total: records.length,
    byClassification: {},
    byRecommendedBetAction: {},
    byRecommendedBetActionRaw: {},
    bySourceStatusClassification: {},
    bySourceStatusRecommendedBetAction: {},
    classificationRecommendedBetActionMismatch: createMismatchSummary(),
    safetyScopedRecommendedBetAction: {},
    safetyScopedReasons: {},
    winSignalCounts: {},
    signalPresence: {},
  };
  addDecisionFields(summary);

  for (const record of records) {
    const classification = normalizeClassification(record?.honmei?.classificationHint?.classification);
    const recommendedBetAction = normalizeRecommendedBetAction(record?.honmei?.recommendedBetAction);
    const decision = normalizeDecision(record?.honmei?.recommendedBetDecision, recommendedBetAction);
    inc(summary.byRecommendedBetActionRaw, rawRecommendedBetAction(record?.honmei?.recommendedBetAction));
    const sourceStatus = String(record?.sourceStatus ?? record?.snapshotSourceStatus ?? resolveSourceStatus(record?.snapshot));
    addSelectionSummary(summary, classification, recommendedBetAction, sourceStatus);
    if (classification !== "missing" && classification !== recommendedBetAction) {
      addMismatch(summary.classificationRecommendedBetActionMismatch, classification, recommendedBetAction, {
        raceId: record?.raceId ?? null,
        courseId: record?.courseId ?? null,
        raceName: record?.meta?.raceName ?? null,
        sourceStatus,
      });
    }
    const safety = applySafetyScopedAction(recommendedBetAction, { sourceStatus });
    inc(summary.safetyScopedRecommendedBetAction, safety.action);
    inc(summary.safetyScopedReasons, safety.reason);
    addDecisionSummary(summary, decision, recommendedBetAction);

    const honmei = record?.honmei ?? {};
    if (classification !== "missing") {
      const winProb = toNumber(honmei.winProb);
      const realOdds = toNumber(honmei.realOdds);
      const tanRoi = winProb != null && realOdds != null ? winProb * realOdds * 100 : null;
      const scoreGap = toNumber(honmei.scoreGap);
      const placeProb = toNumber(honmei.placeProb);
      const top3Stability = toNumber(honmei.top3Stability);
      const signals = {
        winProb: winProb != null && winProb >= WIN_PROB_MIN,
        tanRoi: tanRoi != null && tanRoi >= TAN_ROI_MIN,
        scoreGap: scoreGap != null && scoreGap >= SCORE_GAP_MIN,
        placeProb: placeProb != null && placeProb >= PLACE_PROB_MIN,
        top3Stability: top3Stability != null && top3Stability >= TOP3_STABILITY_MIN,
      };
      const winSignalCount = Number(signals.winProb) + Number(signals.tanRoi) + Number(signals.scoreGap);
      inc(summary.winSignalCounts, String(winSignalCount));
      for (const [key, value] of Object.entries(signals)) {
        inc(summary.signalPresence, `${key}:${value ? "true" : "false"}`);
      }
    }
  }

  return summary;
}

function summarizePredictionSnapshots() {
  const snapshots = readJsonl(PATHS.predictionSnapshots);
  const summary = {
    total: snapshots.length,
    withSelectionLog: 0,
    byClassification: {},
    byRecommendedBetAction: {},
    byRecommendedBetActionRaw: {},
    bySourceStatusClassification: {},
    bySourceStatusRecommendedBetAction: {},
    classificationRecommendedBetActionMismatch: createMismatchSummary(),
    safetyScopedRecommendedBetAction: {},
    safetyScopedReasons: {},
  };
  addDecisionFields(summary);

  for (const snapshot of snapshots) {
    const entries = Array.isArray(snapshot.selectionLog?.entries) ? snapshot.selectionLog.entries : [];
    if (entries.length > 0) summary.withSelectionLog += 1;
    const honmei = entries.find((entry) => entry?.role === "honmei") ?? null;
    const classification = normalizeClassification(honmei?.classificationHint?.classification);
    const recommendedBetAction = normalizeRecommendedBetAction(honmei?.recommendedBetAction);
    const decision = normalizeDecision(honmei?.recommendedBetDecision, recommendedBetAction);
    const sourceStatus = resolveSourceStatus(snapshot);
    inc(summary.byRecommendedBetActionRaw, rawRecommendedBetAction(honmei?.recommendedBetAction));
    addSelectionSummary(summary, classification, recommendedBetAction, sourceStatus);
    if (classification !== "missing" && classification !== recommendedBetAction) {
      addMismatch(summary.classificationRecommendedBetActionMismatch, classification, recommendedBetAction, {
        snapshotId: snapshot.snapshotId ?? null,
        raceId: snapshot.raceId ?? null,
        raceName: snapshot.raceName ?? null,
        sourceStatus,
      });
    }
    const safety = applySafetyScopedAction(recommendedBetAction, {
      sourceStatus,
      requiresSelectionLog: true,
      hasSelectionLog: entries.length > 0,
    });
    inc(summary.safetyScopedRecommendedBetAction, safety.action);
    inc(summary.safetyScopedReasons, safety.reason);
    addDecisionSummary(summary, decision, recommendedBetAction);
  }

  return summary;
}

function summarizeRoutineState() {
  const state = readJson(PATHS.routineState, {});
  const recommendations = Array.isArray(state.tanpukuRecommendations) ? state.tanpukuRecommendations : [];
  const summary = {
    total: recommendations.length,
    byPickType: {},
    byClassificationHint: {},
    byRecommendedBetAction: {},
    byRecommendedBetActionRaw: {},
    byPickTypeRecommendedBetAction: {},
    byRecommendationAction: {},
    classificationRecommendedBetActionMismatch: createMismatchSummary(),
    pickTypeRecommendedBetActionMismatch: createMismatchSummary(),
  };
  addDecisionFields(summary);

  for (const recommendation of recommendations) {
    const pickType = String(recommendation.pickType ?? "missing");
    const classification = normalizeClassification(recommendation.classificationHint?.classification);
    const recommendedBetAction = normalizeRecommendedBetAction(recommendation.recommendedBetAction);
    const decision = normalizeDecision(recommendation.recommendedBetDecision, recommendedBetAction);
    inc(summary.byPickType, pickType);
    inc(summary.byClassificationHint, classification);
    inc(summary.byRecommendedBetAction, recommendedBetAction);
    inc(summary.byRecommendedBetActionRaw, rawRecommendedBetAction(recommendation.recommendedBetAction));
    addNestedCount(summary.byPickTypeRecommendedBetAction, pickType, recommendedBetAction);
    inc(summary.byRecommendationAction, String(recommendation.recommendationAction ?? "missing"));
    if (classification !== "missing" && classification !== recommendedBetAction) {
      addMismatch(summary.classificationRecommendedBetActionMismatch, classification, recommendedBetAction, {
        courseId: recommendation.courseId ?? null,
        raceId: recommendation.raceId ?? null,
        raceLabel: recommendation.raceLabel ?? null,
        pickType,
      });
    }
    if (pickType !== "missing" && pickType !== recommendedBetAction) {
      addMismatch(summary.pickTypeRecommendedBetActionMismatch, pickType, recommendedBetAction, {
        courseId: recommendation.courseId ?? null,
        raceId: recommendation.raceId ?? null,
        raceLabel: recommendation.raceLabel ?? null,
        horseName: recommendation.horseName ?? null,
      });
    }
    addDecisionSummary(summary, decision, recommendedBetAction);
  }

  return summary;
}

function summarizeCurrentWeek() {
  const weekly = readJson(PATHS.weeklyRaces, { currentWeek: { races: [] } });
  const races = Array.isArray(weekly.currentWeek?.races) ? weekly.currentWeek.races : [];
  const summary = {
    totalRaces: races.length,
    pairMissing: 0,
    byClassification: {},
    byDerivedRecommendedBetAction: {},
    bySafetyRecommendedBetAction: {},
    safetyRiskFlags: {},
    safetyUnknownReasons: {},
    sample: [],
  };

  for (const race of races) {
    const pair = pickTanpukuPair(race, false, true);
    if (!pair?.winPick) {
      summary.pairMissing += 1;
      inc(summary.byClassification, "missing");
      continue;
    }
    const hint = pair.winPick.classificationHint;
    const classification = normalizeClassification(hint?.classification);
    const derivedRecommendedBetAction = classification === "missing" ? "unknown" : classification;
    const safetyDecision = buildDiagnosticDecision({
      sourceStatus: "unknown",
      livePreRaceEligible: false,
      classificationHint: hint,
      oddsSource: pair.winPick.horse?.oddsSource ?? null,
      scoreGap: pair.winPick.scoreGap,
      placeProb: pair.winPick.placeProb,
      top3Stability: pair.winPick.top3Stability,
      fieldSize: race.horses?.length ?? null,
      overbetLabel: pair.winPick.overbetLabel ?? null,
      hasSelectionLog: false,
    });
    inc(summary.byClassification, classification);
    inc(summary.byDerivedRecommendedBetAction, derivedRecommendedBetAction);
    inc(summary.bySafetyRecommendedBetAction, safetyDecision.action);
    for (const riskFlag of safetyDecision.riskFlags) inc(summary.safetyRiskFlags, riskFlag);
    if (safetyDecision.action === "unknown") {
      for (const reason of [...safetyDecision.riskFlags, ...(safetyDecision.reasons.length ? safetyDecision.reasons : ["no_reason_recorded"])]) {
        inc(summary.safetyUnknownReasons, reason);
      }
    }
    if (summary.sample.length < 8) {
      summary.sample.push({
        raceLabel: race.label ?? null,
        horseName: pair.winPick.horse?.name ?? null,
        classification,
        derivedRecommendedBetAction,
        safetyRecommendedBetAction: safetyDecision.action,
        safetyRiskFlags: safetyDecision.riskFlags,
        reason: hint?.reason ?? null,
        winProb: pair.winPick.winProb,
        tanRoi: pair.winPick.tanRoi,
        scoreGap: pair.winPick.scoreGap,
        placeProb: pair.winPick.placeProb,
        top3Stability: pair.winPick.top3Stability,
      });
    }
  }

  return summary;
}

const report = {
  generatedAt: new Date().toISOString(),
  safetyRuleDesign: {
    insertionPoint:
      "after classifyHonmeiPick creates classificationHint, before persisting recommendedBetAction in snapshot selectionLog / routine recommendations / post payload metadata",
    ruleOrder: [
      "if recommendedBetAction is absent or invalid, keep it unknown; do not infer win at read time",
      "if sourceStatus is not live_pre_race, keep live-betting action unknown and use classificationHint only as diagnostic context",
      "if selectionLog is required but missing, keep action unknown",
      "if classificationHint is skip and the record is otherwise eligible, allow recommendedBetAction skip",
      "only allow win/place when the action is explicit on a live_pre_race record with sufficient selection audit data",
    ],
  },
  thresholds: {
    winProbMin: WIN_PROB_MIN,
    tanRoiMin: TAN_ROI_MIN,
    scoreGapMin: SCORE_GAP_MIN,
    placeProbMin: PLACE_PROB_MIN,
    top3StabilityMin: TOP3_STABILITY_MIN,
  },
  decisionThresholds: DECISION_THRESHOLDS,
  reviewRecords: summarizeReviewRecords(),
  predictionSnapshots: summarizePredictionSnapshots(),
  routineState: summarizeRoutineState(),
  currentWeek: summarizeCurrentWeek(),
};

console.log(JSON.stringify(report, null, 2));
