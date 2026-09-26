export const VERDICT_LABELS = Object.freeze({ win: "単勝勝負", place: "抑え", skip: "見送り" });
export const VERDICT_STRENGTH_THRESHOLDS = Object.freeze({ high: 0.6, medium: 0.4 });

/** @param {string | null | undefined} classification */
export function verdictLabel(classification) {
  return VERDICT_LABELS[classification] ?? "判定前";
}

/** @param {number | null | undefined} confidence */
export function verdictStrengthLabel(confidence) {
  if (!Number.isFinite(confidence)) return "不明";
  if (confidence >= VERDICT_STRENGTH_THRESHOLDS.high) return "高";
  if (confidence >= VERDICT_STRENGTH_THRESHOLDS.medium) return "中";
  return "低";
}

/** @param {string | null | undefined} label */
export function marketHeatLabel(label) {
  if (label === "overbet_high") return "過熱(大)";
  if (label === "overbet_moderate") return "過熱(中)";
  return null;
}
