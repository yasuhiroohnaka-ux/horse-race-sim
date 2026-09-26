import assert from "node:assert/strict";
import test from "node:test";
import { repairRaceIdentityRecords } from "../scripts/repair-race-identity-f4.mjs";

test("known wrong race IDs become terminal and saved Sunday labels are corrected", () => {
  const weekly: any = { currentWeek: { races: [
    { raceId: "202609040209", raceDate: "2026-09-06", day: "Sat" },
    { raceId: "202609040208", raceDate: "2026-09-06", day: "Sun" },
  ] }, archives: [] };
  const reviewStore: any = { records: {
    "202609040209": { status: "review_partial", reviewReady: false,
      nextRetryAt: "2026-09-07T00:00:00Z", meta: { raceDate: "2026-09-06", day: "Sat" } },
  } };
  const report = repairRaceIdentityRecords(weekly, reviewStore);
  assert.deepEqual(report, { correctedDayRaceIds: ["202609040209"],
    excludedRaceIds: ["202609040209"], terminalReviewIds: ["202609040209"] });
  assert.equal(weekly.currentWeek.races[0].day, "Sun");
  assert.equal(weekly.currentWeek.races[0].excludedReason, "INCORRECT_RACE_ID");
  assert.equal(reviewStore.records["202609040209"].meta.day, "Sun");
  assert.equal(reviewStore.records["202609040209"].status, "review_failed");
  assert.deepEqual(reviewStore.records["202609040209"].missingReasons, ["INCORRECT_RACE_ID"]);
  assert.equal(reviewStore.records["202609040209"].nextRetryAt, null);
  const second = repairRaceIdentityRecords(weekly, reviewStore);
  assert.deepEqual(second.correctedDayRaceIds, []);
  assert.deepEqual(second.excludedRaceIds, []);
});
