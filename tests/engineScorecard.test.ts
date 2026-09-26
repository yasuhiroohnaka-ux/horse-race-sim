import assert from "node:assert/strict";
import test from "node:test";
import { buildEngineScorecard } from "../lib/engineScorecard";
import type { RaceReviewRecord } from "../lib/types";

function liveRecord(raceId: string, oddsRows = [{ horseId: "1", realOdds: 2.0 }, { horseId: "2", realOdds: 4.0 }]): RaceReviewRecord {
  return {
    raceId, status: "review_ready", snapshotSourceStatus: "live_pre_race", livePreRaceEligible: true,
    payoutFetchedAt: "2026-09-20T12:00:00Z",
    snapshot: { sourceStatus: "live_pre_race", livePreRaceEligible: true, predictionOrigin: "saved_live", scoringVersion: "tanpuku-win-v3.1", rankedRows: oddsRows },
    honmei: { horseId: "2", settlementStatus: "settled", classificationHint: { classification: "win" } },
  } as unknown as RaceReviewRecord;
}

test("hero scorecard uses only paired current-version live races and official payouts", () => {
  const valid = liveRecord("one");
  const retrospective = { ...liveRecord("two"), snapshotSourceStatus: "retrospective" } as RaceReviewRecord;
  const incompleteFavorite = liveRecord("three", [{ horseId: "2", realOdds: 4.0 }]);
  const archive = ["one", "two", "three"].map((raceId) => ({
    raceId, horses: [{ id: "1" }, { id: "2" }],
    result: { finishers: [{ horseId: "1", horseNumber: 1 }, { horseId: "2", horseNumber: 2 }], payouts: { tansho: { resultNumbers: [2], payouts: [450] } } },
  }));
  const report = buildEngineScorecard([valid, retrospective, incompleteFavorite], archive, [{ classification: "win", tanHit: true, tanPayout: 800 }], "2026-09-21");
  assert.equal(report.pairedRaces, 1);
  assert.equal(report.baselineUnavailableCount, 1);
  assert.equal(report.overall.honmei.roi, 450);
  assert.equal(report.overall.favorite.roi, 0);
  assert.equal(report.verdicts.find((row) => row.key === "win")?.honmei.n, 1);
  assert.equal(report.backtest?.overall.roi, 800);
  assert.equal(report.lastSettledAt, "2026-09-20T12:00:00Z");
});
