// Backtest adapter for WP-D1. It swaps only the reported classification;
// production picks and recommended actions continue to use the current rule.
import {
  D1_SHADOW_POLICY_ID,
  TANPUKU_SCORING_VERSION as ACTIVE_SCORING_VERSION,
  pickTanpukuPair as pickActivePair,
} from "../lib/tanpukuSelection.mjs";

export const TANPUKU_SCORING_VERSION = `${ACTIVE_SCORING_VERSION}+${D1_SHADOW_POLICY_ID}`;

export function pickTanpukuPair(...args) {
  const pair = pickActivePair(...args);
  if (!pair?.winPick) return pair;
  return {
    ...pair,
    winPick: {
      ...pair.winPick,
      classificationHint: pair.winPick.shadowD1.classificationHint,
    },
  };
}
