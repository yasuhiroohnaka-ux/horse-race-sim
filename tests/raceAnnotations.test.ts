import assert from "node:assert/strict";
import test from "node:test";
import { OAKS_2026_RACE_KEY } from "../data/annotations/oaks-2026";
import { TAKARAZUKA_KINEN_2026_RACE_KEY } from "../data/annotations/takarazuka-kinen-2026";
import { findRaceHeuristicHints, findRaceTrendNotes } from "../lib/raceAnnotations";
import type { Course } from "../lib/types";

function course(overrides: Partial<Course> = {}): Course {
  return {
    id: "tokyo-turf-2400-202605021011",
    name: "東京 芝 2400m (オークス)",
    distance: 2400,
    surface: "Turf",
    segments: [],
    straightLength: 525.9,
    hashtag: "#オークス",
    ...overrides,
  };
}

test("Oaks trend notes resolve by course id", () => {
  const notes = findRaceTrendNotes(course({ id: "tokyo-turf-2400-202605021011", name: "東京 芝 2400m" }));

  assert.equal(notes.length, 4);
  assert.equal(notes.every((note) => note.raceKey === OAKS_2026_RACE_KEY), true);
});

test("Oaks trend notes include source label and cautions", () => {
  const notes = findRaceTrendNotes(course());
  const previousRaceNote = notes.find((note) => note.id === "oaks-2026-prev-race");

  assert.ok(previousRaceNote);
  assert.equal(previousRaceNote.sourceLabel, "スクリーンショット由来・要照合");
  assert.ok((previousRaceNote.cautions?.length ?? 0) > 0);
  assert.equal(previousRaceNote.rows?.find((row) => row.label === "桜花賞")?.record, "7-5-6-57");
});

test("Oaks heuristic hints resolve with notes", () => {
  const hints = findRaceHeuristicHints(course());

  assert.deepEqual(
    hints.map((hint) => hint.id),
    ["oaks-prev-race-core", "oaks-prev-corner-negative", "oaks-longshot-pattern"]
  );
});

test("non-Oaks races do not receive Oaks notes", () => {
  const notes = findRaceTrendNotes(
    course({
      id: "tokyo-turf-1600-sample",
      name: "東京 芝 1600m (NHKマイルC)",
      distance: 1600,
      hashtag: "#NHKマイルC",
    })
  );

  assert.equal(notes.length, 0);
});

test("Takarazuka Kinen trend notes resolve by race name", () => {
  const notes = findRaceTrendNotes(
    course({
      id: "hanshin-turf-2200-sample",
      name: "阪神 芝 2200m (宝塚記念)",
      distance: 2200,
      hashtag: "#宝塚記念",
    })
  );

  assert.equal(notes.every((note) => note.raceKey === TAKARAZUKA_KINEN_2026_RACE_KEY), true);
  assert.equal(notes.length, 8);
  assert.equal(notes.find((note) => note.id === "takarazuka-2026-age-record")?.rows?.[0].record, "4-2-5-27");
});

test("Takarazuka Kinen heuristic hints resolve with notes", () => {
  const hints = findRaceHeuristicHints(
    course({
      id: "hanshin-turf-2200-sample",
      name: "阪神 芝 2200m (宝塚記念)",
      distance: 2200,
      hashtag: "#宝塚記念",
    })
  );

  assert.deepEqual(
    hints.map((hint) => hint.id),
    ["takarazuka-age-core", "takarazuka-prev-race-core", "takarazuka-ground-core"]
  );
});
