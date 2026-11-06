import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseResultPassing, parseResultRaceData } from "../lib/raceResultParser.mjs";

const html = readFileSync(new URL("./fixtures/result-tokyo-20261101-1r.html", import.meta.url), "utf8");

test("result page exposes surface, distance, start time and announced ground", () => {
  assert.deepEqual(parseResultRaceData(html), {
    startTime: "09:50", surface: "Dirt", distance: 1600, groundCondition: "Good",
  });
});

test("result page exposes corner passing order per horse", () => {
  const rows = parseResultPassing(html);
  assert.deepEqual(rows[0]!, {
    position: 1, gateNumber: 8, horseNumber: 16, externalHorseId: "2024104618", passing: [6, 7],
  });
  assert.deepEqual(rows[1]!.passing, [3, 2]);
});

test("turf pages carry the ground in Item03", () => {
  const turf = '<div class="RaceData01">10:30発走 /<!-- <span class="Turf"> --><span> 芝1200m</span> 右&nbsp;A\n/ ' +
    '<span class="Icon_Weather Weather02" title="曇"></span>\n<span class="Item03"> 良</span></div>';
  assert.deepEqual(parseResultRaceData(turf), {
    startTime: "10:30", surface: "Turf", distance: 1200, groundCondition: "Firm",
  });
});

test("missing race data yields nulls instead of defaults", () => {
  assert.deepEqual(parseResultRaceData("<div></div>"), {
    startTime: null, surface: null, distance: null, groundCondition: null,
  });
  assert.deepEqual(parseResultPassing(""), []);
});
