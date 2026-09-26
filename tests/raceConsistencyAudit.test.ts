import assert from "node:assert/strict";
import test from "node:test";
import { auditRaceConsistency } from "../scripts/race-consistency-audit.mjs";

test("detects NFKC duplicate race names and a mismatched R number", () => {
  const audit = auditRaceConsistency({
    currentWeek: { weekOf: "2026-09-14", races: [] },
    archives: [{
      weekOf: "2026-09-14",
      races: [
        { raceId: "202609040508", raceNumber: 8, day: "Sat", venueKey: "hanshin", label: "野路菊Ｓ" },
        { raceId: "202609040509", raceNumber: 10, day: "Sat", venueKey: "hanshin", label: "野路菊S", excludedReason: "INCORRECT_RACE_ID" },
      ],
    }],
  });

  assert.deepEqual(audit.duplicateLabels.map((entry: { raceIds: string[] }) => entry.raceIds), [["202609040508", "202609040509"]]);
  assert.deepEqual(audit.raceNumberMismatches, [{ raceId: "202609040509", raceNumber: 10, encodedRaceNumber: 9 }]);
  assert.deepEqual(audit.dayMismatches, []);
  assert.deepEqual(audit.incorrectRaceIds, ["202609040509"]);
});

test("race date separates weekend races even when a saved day label is wrong", () => {
  const audit = auditRaceConsistency({
    currentWeek: { weekOf: "2026-05-11", races: [
      { raceId: "202605020612", raceDate: "2026-05-16", day: "Sat", venueKey: "tokyo", label: "4歳以上1勝クラス" },
      { raceId: "202605020812", raceDate: "2026-05-17", day: "Sat", venueKey: "tokyo", label: "4歳以上1勝クラス" },
    ] },
  });
  assert.deepEqual(audit.duplicateLabels, []);
  assert.deepEqual(audit.dayMismatches, [{
    raceId: "202605020812", raceDate: "2026-05-17", day: "Sat", expectedDay: "Sun",
  }]);
});
