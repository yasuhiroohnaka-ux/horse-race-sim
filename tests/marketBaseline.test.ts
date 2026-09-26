import assert from "node:assert/strict";
import test from "node:test";
import { pickPreRaceFavorite, settleOfficialTan, summarizeFavoriteComparison } from "../scripts/market-baseline.mjs";

test("favorite uses only complete pre-race odds and resolves ties deterministically", () => {
  const rows = [{ horseId: "2", realOdds: 2.1 }, { horseId: "1", realOdds: 2.1 }];
  assert.deepEqual(pickPreRaceFavorite(rows, ["1", "2"]), { horseId: "1", odds: 2.1 });
  assert.equal(pickPreRaceFavorite(rows, ["1", "2", "3"]), null);
});

test("official win payout settles the selected horse number", () => {
  const result = {
    finishers: [{ horseId: "a", horseNumber: 4 }, { horseId: "b", horseNumber: 7 }],
    payouts: { tansho: { resultNumbers: [4], payouts: [550] } },
  };
  assert.deepEqual(settleOfficialTan(result, "a"), { hit: true, payout: 550 });
  assert.deepEqual(settleOfficialTan(result, "b"), { hit: false, payout: 0 });
  assert.equal(settleOfficialTan({ ...result, payouts: {} }, "a"), null);
  const deadHeat = { ...result, payouts: { tansho: { resultNumbers: [4, 7], payouts: [550, 280] } } };
  assert.deepEqual(settleOfficialTan(deadHeat, "b"), { hit: true, payout: 280 });
});

test("comparison deltas use the identical race rows", () => {
  assert.deepEqual(summarizeFavoriteComparison([
    { honmeiHit: true, honmeiPayout: 350, favoriteHit: false, favoritePayout: 0 },
    { honmeiHit: false, honmeiPayout: 0, favoriteHit: true, favoritePayout: 200 },
  ]), {
    n: 2,
    honmeiHitRate: 50,
    honmeiRoi: 175,
    favoriteHitRate: 50,
    favoriteRoi: 100,
    hitRateDelta: 0,
    roiDelta: 75,
  });
});
