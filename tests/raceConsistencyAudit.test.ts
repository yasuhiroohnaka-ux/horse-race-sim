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
});
