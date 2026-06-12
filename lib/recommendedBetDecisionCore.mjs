// 馬券推奨決定層の単一実装 (v2.5.1)。
// lib/recommendedBetAction.ts (型付きラッパー) と scripts/keiba-routine.mjs の
// 両方からここを import する。以前は両者にロジックの複製があり乖離リスクがあった。
//
// 設計: 「分類 = 何を買うか (classifyHonmeiPick が校正値で判定)」
//       「決定 = 買ってよい状態か (データ品質ゲートのみ)」 に責務分離。
// 旧実装の確率系二重ゲート (DECISION_THRESHOLDS の placeProb/top3Stability/
// scoreGap/maxFieldSize) は撤廃した。根拠: 旧 decision=win は単ROI 34% (n=10)、
// v2.5 分類そのままの win は単ROI 118% (n=28)。校正前の膨張値前提の閾値が
// 校正済み分類の結果を歪めていた (vault: engine-roadmap-execution-state WP-1-2)。

const INFO_FLAG_THRESHOLDS = {
  smallScoreGap: 0.01,
  largeFieldSize: 16,
  lowPlaceProb: 0.45,
  lowTop3Stability: 0.3,
};

export function isRecommendedBetAction(value) {
  return value === "win" || value === "place" || value === "skip" || value === "unknown";
}

export function resolveRecommendedBetActionFromClassificationHint(classificationHint) {
  const classification = classificationHint?.classification;
  return classification === "win" || classification === "place" || classification === "skip"
    ? classification
    : "unknown";
}

function normalizeClassification(value) {
  return value === "win" || value === "place" || value === "skip" ? value : null;
}

function normalizeSource(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized ? normalized : null;
}

function normalizeFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

// classificationHint.confidence → 決定 confidence。
// win ゲートは検証データが少なく暫定 (hint confidence 0.45 固定) のため、
// 自然に "low" に落ちる。place 本則 (0.6) は "medium"。
function confidenceFromHint(hintConfidence) {
  const value = Number(hintConfidence);
  if (!Number.isFinite(value)) return "low";
  return value >= 0.6 ? "medium" : "low";
}

export function buildRecommendedBetDecision(input = {}) {
  const reasons = [];
  const riskFlags = [];
  const sourceStatus = normalizeSource(input.sourceStatus);
  const classification = normalizeClassification(input.classificationHint?.classification);
  const explicitAction = isRecommendedBetAction(input.explicitAction) ? input.explicitAction : "unknown";
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

  // 情報フラグ (action は変えない。回顧時のセグメント分析用に残す)
  if (sourceStatus !== "live_pre_race") riskFlags.push("not_live_pre_race");
  if (sourceStatus === "retrospective") riskFlags.push("retrospective_only");
  if (input.livePreRaceEligible !== true) riskFlags.push("not_live_pre_race_eligible");
  if (!classification) riskFlags.push("missing_classification_hint");
  if (input.hasSelectionLog !== true) riskFlags.push("missing_selection_log");
  if (!oddsSource || oddsSource === "unknown") riskFlags.push("odds_source_unknown");
  if (input.engineAgreement === false) riskFlags.push("engine_disagreement");
  if (scoreGap !== null && scoreGap < INFO_FLAG_THRESHOLDS.smallScoreGap) riskFlags.push("small_score_gap");
  if (fieldSize !== null && fieldSize >= INFO_FLAG_THRESHOLDS.largeFieldSize) riskFlags.push("large_field_size");
  if (overbetLabel === "overbet_high") riskFlags.push("overbet_high");
  if (overbetLabel === "overbet_moderate") riskFlags.push("overbet_moderate");
  if (placeProb !== null && placeProb < INFO_FLAG_THRESHOLDS.lowPlaceProb) riskFlags.push("low_place_probability");
  if (top3Stability !== null && top3Stability < INFO_FLAG_THRESHOLDS.lowTop3Stability) riskFlags.push("low_top3_stability");

  // 品質ゲート (blocking): データの素性が悪いときだけ action を出さない
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

  // 品質ゲート通過後は分類をそのまま action にする
  if (classification === "win" || classification === "place") {
    return {
      action: classification,
      confidence: confidenceFromHint(input.classificationHint?.confidence),
      reasons: unique([...reasons, "classification_aligned_action"]),
      riskFlags: unique(riskFlags),
      source: "explicit_live_rule",
    };
  }

  return {
    action: "unknown",
    confidence: "unknown",
    reasons: unique(reasons),
    riskFlags: unique(riskFlags),
    source: "safety_rule",
  };
}
