import assert from "node:assert/strict";
import test from "node:test";
import {
  filterToOfficialEntryRoster,
  normalizeHorseEntryKey,
  shouldApplyOfficialEntryRoster,
} from "../lib/officialEntryRoster";

const horses = [
  { name: "Alpha Crown" },
  { name: "Beta-Girl" },
  { name: "Gamma" },
  { name: "Delta" },
];

test("official roster filtering removes registration-only runners after draw", () => {
  const filtered = filterToOfficialEntryRoster(horses, ["alphacrown", "betagirl", "delta"], 3);

  assert.deepEqual(
    filtered.map((horse) => horse.name),
    ["Alpha Crown", "Beta-Girl", "Delta"]
  );
});

test("official roster filtering is skipped when the source match is weak", () => {
  assert.equal(shouldApplyOfficialEntryRoster(horses, ["alphacrown", "unknown", "other"], 1), false);
  assert.equal(filterToOfficialEntryRoster(horses, ["alphacrown", "unknown", "other"], 1), horses);
});

test("official roster filtering is skipped when roster looks partial", () => {
  assert.equal(shouldApplyOfficialEntryRoster(horses, ["alphacrown", "betagirl"], 2), false);
  assert.equal(filterToOfficialEntryRoster(horses, ["alphacrown", "betagirl"], 2), horses);
});

test("horse entry keys normalize spacing, width, and separators", () => {
  assert.equal(normalizeHorseEntryKey("\uff21\uff4c\uff50\uff48\uff41\u30fb Crown"), "alphacrown");
  assert.equal(normalizeHorseEntryKey("Beta_Girl"), "betagirl");
});
