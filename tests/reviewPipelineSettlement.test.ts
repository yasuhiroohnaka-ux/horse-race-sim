import assert from "node:assert/strict";
import test from "node:test";
import { settleSelection } from "../lib/reviewPipeline";
import type { ReviewSelectionHorse } from "../lib/types";

function raceWithThirdPlacePick(fieldSize: number) {
  const paidNumbers = fieldSize <= 7 ? [1, 2] : [1, 2, 3];
  return {
    courseId: "test-turf-1600-209901010111",
    horses: Array.from({ length: fieldSize }, (_, index) => ({
      id: String(index + 1),
      name: `Horse ${index + 1}`,
      gateNumber: index + 1,
    })),
    result: {
      winnerHorseId: "1",
      top3HorseIds: ["1", "2", "3"],
      finishers: [1, 2, 3].map((number) => ({
        horseId: String(number),
        horseNumber: number,
        name: `Horse ${number}`,
      })),
      payouts: {
        tansho: { resultNumbers: [1], payouts: [250] },
        fukusho: { resultNumbers: paidNumbers, payouts: paidNumbers.map(() => 120) },
      },
    },
  };
}

const thirdPlacePick: ReviewSelectionHorse = {
  horseId: "3",
  horseName: "Horse 3",
  rank: 1,
  score: 0.8,
  winProb: 0.3,
  realOdds: 3,
  placeOdds: 1.2,
  placeProb: 0.7,
  placeScore: 0.8,
  valueScore: 0.5,
};

test("seven-runner third place is a settled fukusho miss when absent from official payouts", () => {
  const settled = settleSelection(raceWithThirdPlacePick(7), thirdPlacePick, true);
  assert.equal(settled?.fukuOutcome, "miss");
  assert.equal(settled?.fukuPayout, 0);
  assert.equal(settled?.settlementStatus, "settled");
});

test("eight-runner third place is a settled fukusho hit when present in official payouts", () => {
  const settled = settleSelection(raceWithThirdPlacePick(8), thirdPlacePick, true);
  assert.equal(settled?.fukuOutcome, "hit");
  assert.equal(settled?.fukuPayout, 120);
  assert.equal(settled?.settlementStatus, "settled");
});

test("without official fukusho results, settlement falls back to top three and waits for payouts", () => {
  const race = raceWithThirdPlacePick(7);
  delete (race.result.payouts as { fukusho?: unknown }).fukusho;
  const settled = settleSelection(race, thirdPlacePick, true);
  assert.equal(settled?.fukuOutcome, "hit_missing_payout");
  assert.equal(settled?.settlementStatus, "pending_payouts");
});
