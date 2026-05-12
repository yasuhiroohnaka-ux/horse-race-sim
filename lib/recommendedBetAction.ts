import type {
  PickClassification,
  PickClassificationHint,
  RecommendedBetAction,
  RecommendedBetDecision,
} from "@/lib/types";

export function isRecommendedBetAction(value: unknown): value is RecommendedBetAction {
  return value === "win" || value === "place" || value === "skip" || value === "unknown";
}

export function resolveRecommendedBetActionFromClassificationHint(
  classificationHint: PickClassificationHint | null | undefined
): RecommendedBetAction {
  const classification = classificationHint?.classification;
  return classification === "win" || classification === "place" || classification === "skip"
    ? classification
    : "unknown";
}

export function normalizeRecommendedBetAction(
  value: unknown
): RecommendedBetAction {
  return isRecommendedBetAction(value) ? value : "unknown";
}

export function deriveRecommendedBetActionForSelection(
  value: unknown,
  classificationHint: PickClassificationHint | null | undefined
): RecommendedBetAction {
  return isRecommendedBetAction(value)
    ? value
    : resolveRecommendedBetActionFromClassificationHint(classificationHint);
}

export type RecommendedBetDecisionInput = {
  sourceStatus?: string | null;
  livePreRaceEligible?: boolean | null;
  classificationHint?: PickClassificationHint | { classification?: unknown; reason?: unknown } | null;
  explicitAction?: unknown;
  winProb?: number | null;
  tanRoi?: number | null;
  scoreGap?: number | null;
  placeProb?: number | null;
  top3Stability?: number | null;
  valueScore?: number | null;
  fieldSize?: number | null;
  engineAgreement?: boolean | null;
  overbetLabel?: string | null;
  oddsSource?: string | null;
  runningStyleSource?: string | null;
  previousRaceSource?: string | null;
  hasSelectionLog?: boolean;
};

const DECISION_THRESHOLDS = {
  win: {
    scoreGap: 0.05,
    placeProb: 0.62,
    top3Stability: 0.45,
    maxFieldSize: 15,
  },
  place: {
    scoreGap: 0.015,
    placeProb: 0.56,
    top3Stability: 0.35,
    maxFieldSize: 18,
  },
  skip: {
    tinyScoreGap: 0.01,
    largeFieldSize: 16,
    lowPlaceProb: 0.45,
    lowTop3Stability: 0.3,
  },
} as const;

function normalizeClassification(value: unknown): PickClassification | null {
  return value === "win" || value === "place" || value === "skip" ? value : null;
}

function normalizeSource(value: unknown): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized ? normalized : null;
}

function normalizeFiniteNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function buildUnknownRecommendedBetDecision(
  riskFlags: string[] = [],
  reasons: string[] = []
): RecommendedBetDecision {
  return {
    action: "unknown",
    confidence: "unknown",
    reasons: unique(reasons),
    riskFlags: unique(riskFlags),
    source: riskFlags.length ? "safety_rule" : "fallback",
  };
}

export function normalizeRecommendedBetDecision(value: unknown): RecommendedBetDecision | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<RecommendedBetDecision>;
  if (!isRecommendedBetAction(candidate.action)) return null;
  const confidence =
    candidate.confidence === "high" ||
    candidate.confidence === "medium" ||
    candidate.confidence === "low" ||
    candidate.confidence === "unknown"
      ? candidate.confidence
      : candidate.action === "unknown"
        ? "unknown"
        : "low";
  const source =
    candidate.source === "explicit_live_rule" ||
    candidate.source === "safety_rule" ||
    candidate.source === "fallback" ||
    candidate.source === "unknown"
      ? candidate.source
      : candidate.action === "unknown"
        ? "fallback"
        : "unknown";
  return {
    action: candidate.action,
    confidence,
    reasons: Array.isArray(candidate.reasons) ? candidate.reasons.map(String).filter(Boolean) : [],
    riskFlags: Array.isArray(candidate.riskFlags) ? candidate.riskFlags.map(String).filter(Boolean) : [],
    source,
  };
}

export function buildRecommendedBetDecision(input: RecommendedBetDecisionInput): RecommendedBetDecision {
  const reasons: string[] = [];
  const riskFlags: string[] = [];
  const sourceStatus = normalizeSource(input.sourceStatus);
  const classification = normalizeClassification(input.classificationHint?.classification);
  const explicitAction = normalizeRecommendedBetAction(input.explicitAction);
  const scoreGap = normalizeFiniteNumber(input.scoreGap);
  const placeProb = normalizeFiniteNumber(input.placeProb);
  const top3Stability = normalizeFiniteNumber(input.top3Stability);
  const fieldSize = normalizeFiniteNumber(input.fieldSize);
  const oddsSource = normalizeSource(input.oddsSource);
  const overbetLabel = normalizeSource(input.overbetLabel);

  if (sourceStatus === "live_pre_race") reasons.push("live_pre_race_snapshot");
  if (classification) reasons.push(`classification_hint_${classification}`);
  if (oddsSource && oddsSource !== "unknown") reasons.push("valid_odds_source");
  if (input.hasSelectionLog === true) reasons.push("selection_log_available");
  if (input.engineAgreement === true) reasons.push("engine_agreement");

  if (sourceStatus !== "live_pre_race") riskFlags.push("not_live_pre_race");
  if (sourceStatus === "retrospective") riskFlags.push("retrospective_only");
  if (input.livePreRaceEligible !== true) riskFlags.push("not_live_pre_race_eligible");
  if (!classification) riskFlags.push("missing_classification_hint");
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
    [
      "not_live_pre_race",
      "not_live_pre_race_eligible",
      "missing_classification_hint",
      "missing_selection_log",
      "odds_source_unknown",
    ].includes(flag)
  );

  if (blockingRiskFlags.length > 0) {
    return {
      action: "unknown",
      confidence: "unknown",
      reasons: unique(reasons),
      riskFlags: unique(riskFlags),
      source: "safety_rule",
    };
  }

  if (classification === "skip" || explicitAction === "skip") {
    return {
      action: "skip",
      confidence: "medium",
      reasons: unique([...reasons, "classification_hint_skip"]),
      riskFlags: unique(riskFlags),
      source: "explicit_live_rule",
    };
  }

  const hasTinyLargeFieldRisk =
    scoreGap !== null &&
    scoreGap < DECISION_THRESHOLDS.skip.tinyScoreGap &&
    fieldSize !== null &&
    fieldSize >= DECISION_THRESHOLDS.skip.largeFieldSize;
  const hasWeakStabilityRisk =
    placeProb !== null &&
    placeProb < DECISION_THRESHOLDS.skip.lowPlaceProb &&
    top3Stability !== null &&
    top3Stability < DECISION_THRESHOLDS.skip.lowTop3Stability;
  const hasDisagreementRisk =
    input.engineAgreement === false &&
    scoreGap !== null &&
    scoreGap < DECISION_THRESHOLDS.place.scoreGap;

  if (hasTinyLargeFieldRisk || hasWeakStabilityRisk || hasDisagreementRisk) {
    const skipReasons = [
      hasTinyLargeFieldRisk ? "tiny_score_gap_large_field" : "",
      hasWeakStabilityRisk ? "weak_place_stability" : "",
      hasDisagreementRisk ? "engine_disagreement_small_gap" : "",
    ];
    return {
      action: "skip",
      confidence: "low",
      reasons: unique([...reasons, ...skipReasons]),
      riskFlags: unique(riskFlags),
      source: "explicit_live_rule",
    };
  }

  const missingActionInputs: string[] = [];
  if (scoreGap === null) missingActionInputs.push("missing_score_gap");
  if (placeProb === null) missingActionInputs.push("missing_place_probability");
  if (top3Stability === null) missingActionInputs.push("missing_top3_stability");
  if (fieldSize === null) missingActionInputs.push("missing_field_size");

  if (missingActionInputs.length > 0) {
    return {
      action: "unknown",
      confidence: "unknown",
      reasons: unique(reasons),
      riskFlags: unique([...riskFlags, ...missingActionInputs]),
      source: "safety_rule",
    };
  }

  const actionScoreGap = scoreGap as number;
  const actionPlaceProb = placeProb as number;
  const actionTop3Stability = top3Stability as number;
  const actionFieldSize = fieldSize as number;

  const winQualified =
    classification === "win" &&
    actionScoreGap >= DECISION_THRESHOLDS.win.scoreGap &&
    actionPlaceProb >= DECISION_THRESHOLDS.win.placeProb &&
    actionTop3Stability >= DECISION_THRESHOLDS.win.top3Stability &&
    actionFieldSize <= DECISION_THRESHOLDS.win.maxFieldSize &&
    input.engineAgreement === true &&
    overbetLabel !== "overbet_high";

  if (winQualified) {
    return {
      action: "win",
      confidence: riskFlags.length ? "low" : "high",
      reasons: unique([
        ...reasons,
        "strict_win_gate",
        "strong_score_gap",
        "high_place_probability",
        "stable_top3",
        "engine_agreement",
      ]),
      riskFlags: unique(riskFlags),
      source: "explicit_live_rule",
    };
  }

  const placeQualified =
    (classification === "win" || classification === "place") &&
    actionScoreGap >= DECISION_THRESHOLDS.place.scoreGap &&
    actionPlaceProb >= DECISION_THRESHOLDS.place.placeProb &&
    actionTop3Stability >= DECISION_THRESHOLDS.place.top3Stability &&
    actionFieldSize <= DECISION_THRESHOLDS.place.maxFieldSize &&
    overbetLabel !== "overbet_high";

  if (placeQualified) {
    return {
      action: "place",
      confidence: riskFlags.length ? "low" : "medium",
      reasons: unique([
        ...reasons,
        "place_safety_gate",
        "sufficient_score_gap",
        "place_probability_ok",
        "top3_stability_ok",
      ]),
      riskFlags: unique(riskFlags),
      source: "explicit_live_rule",
    };
  }

  return {
    action: "unknown",
    confidence: "unknown",
    reasons: unique(reasons),
    riskFlags: unique([...riskFlags, "explicit_action_gate_not_met"]),
    source: "safety_rule",
  };
}
