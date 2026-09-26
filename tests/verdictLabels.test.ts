import assert from "node:assert/strict";
import test from "node:test";
import { marketHeatLabel, verdictLabel, verdictStrengthLabel } from "../lib/verdictLabels.mjs";

test("verdict labels and strength use one display scale", () => {
  assert.equal(verdictLabel("win"), "単勝勝負");
  assert.equal(verdictLabel("place"), "抑え");
  assert.equal(verdictLabel("skip"), "見送り");
  assert.equal(verdictStrengthLabel(0.6), "高");
  assert.equal(verdictStrengthLabel(0.4), "中");
  assert.equal(verdictStrengthLabel(0.39), "低");
  assert.equal(marketHeatLabel("overbet_high"), "過熱(大)");
  assert.equal(marketHeatLabel("overbet_moderate"), "過熱(中)");
});
