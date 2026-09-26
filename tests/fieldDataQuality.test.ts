import assert from "node:assert/strict";
import test from "node:test";
import { assessFieldDataQuality, reconcileResultFieldDataQuality } from "../lib/fieldDataQuality";
import { isLivePreRaceEligible } from "../lib/sourceStatus";
import type { PredictionSnapshot } from "../lib/types";

test("field count below the entry roster is incomplete", () => {
  assert.deepEqual(assessFieldDataQuality(16, 8), {
    fieldComplete: false,
    expected: 16,
    actual: 8,
  });
});

test("matching field count is complete", () => {
  assert.deepEqual(assessFieldDataQuality(8, 8), {
    fieldComplete: true,
    expected: 8,
    actual: 8,
  });
});

test("unknown entry roster remains unknown", () => {
  assert.deepEqual(assessFieldDataQuality(null, 8), {
    fieldComplete: null,
    expected: null,
    actual: 8,
  });
});

test("post-race finishers expose an incomplete snapshot and exclude it from live evaluation", () => {
  const snapshot = {
    sourceStatus: "live_pre_race",
    livePreRaceEligible: true,
    rankedRows: Array.from({ length: 8 }, (_, index) => ({ horseId: String(index + 1) })),
    dataQuality: assessFieldDataQuality(null, 8),
  } as PredictionSnapshot;
  const dataQuality = reconcileResultFieldDataQuality(snapshot, 16);
  assert.deepEqual(dataQuality, { fieldComplete: false, expected: 16, actual: 8 });
  assert.equal(isLivePreRaceEligible({ ...snapshot, dataQuality }, { livePreRaceEligible: true }), false);
});
