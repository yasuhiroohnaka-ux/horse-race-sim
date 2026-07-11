import assert from "node:assert/strict";
import test from "node:test";
import { mergeRefreshedRaces } from "../scripts/weekly-race-merge.mjs";

test("same-week partial refresh preserves missing races and existing results", () => {
  const existingResult = { winnerHorseId: "7" };
  const previousRaces = [
    { raceId: "202610020510", label: "小倉10R", horses: [{ id: "old-missing" }] },
    {
      raceId: "202602010909",
      label: "old label",
      oddsSource: "forecast",
      result: existingResult,
      horses: [{ id: "old-refreshed" }]
    }
  ];
  const refreshedRaces = [
    {
      raceId: "202602010909",
      label: "new label",
      oddsSource: "official",
      horses: [{ id: "new-refreshed" }]
    }
  ];

  const merged = mergeRefreshedRaces({
    previousWeekOf: "2026-07-06",
    weekOf: "2026-07-06",
    previousRaces,
    refreshedRaces
  });

  assert.deepEqual(
    merged.races.map((race: { raceId: string }) => race.raceId),
    ["202602010909", "202610020510"]
  );
  assert.deepEqual(merged.missingRaces, [{ raceId: "202610020510", label: "小倉10R" }]);

  const refreshed = merged.races[0];
  assert.equal(refreshed.label, "new label");
  assert.equal(refreshed.oddsSource, "official");
  assert.deepEqual(refreshed.horses, [{ id: "new-refreshed" }]);
  assert.equal(refreshed.result, existingResult);
  assert.equal(merged.races[1], previousRaces[0]);
});

test("week rollover keeps only refreshed races and does not report missing races", () => {
  const merged = mergeRefreshedRaces({
    previousWeekOf: "2026-06-29",
    weekOf: "2026-07-06",
    previousRaces: [{ raceId: "202610020410", label: "previous week" }],
    refreshedRaces: [{ raceId: "202602010909", label: "current week" }]
  });

  assert.deepEqual(merged.races, [{ raceId: "202602010909", label: "current week" }]);
  assert.deepEqual(merged.missingRaces, []);
});

test("deduplicates raceIds and keeps the latest refreshed entry", () => {
  const merged = mergeRefreshedRaces({
    previousWeekOf: "2026-07-06",
    weekOf: "2026-07-06",
    previousRaces: [
      { raceId: "2", label: "old duplicate 1" },
      { raceId: "2", label: "old duplicate 2", result: { winnerHorseId: "3" } }
    ],
    refreshedRaces: [
      { raceId: "2", label: "new duplicate 1" },
      { raceId: "1", label: "first" },
      { raceId: "2", label: "new duplicate 2" }
    ]
  });

  assert.deepEqual(
    merged.races.map((race: { raceId: string }) => race.raceId),
    ["1", "2"]
  );
  assert.equal(merged.races[1].label, "new duplicate 2");
  assert.deepEqual(merged.races[1].result, { winnerHorseId: "3" });
  assert.deepEqual(merged.missingRaces, []);
});
