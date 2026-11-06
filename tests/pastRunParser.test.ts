import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mapGroundLabel, parsePastRunCell, parseShutubaPastRuns } from "../lib/pastRunParser.mjs";

const html = readFileSync(new URL("./fixtures/shutuba-past-tenno-aki-2026.html", import.meta.url), "utf8");

test("shutuba_past cells expose ground, passing order and margin per run", () => {
  const entries = parseShutubaPastRuns(html);
  const croix = entries.find((entry) => entry.horseName === "クロワデュノール");
  assert.ok(croix);
  assert.equal(croix.horseNumber, 1);
  assert.equal(croix.externalHorseId, "2022105102");
  assert.deepEqual(croix.runs[0]!, {
    raceId: "202609030411", date: "2026-06-14", venue: "阪神", surface: "Turf",
    distance: 2200, timeSeconds: 132.2, ground: "Yielding", fieldSize: 18,
    horseNumber: 5, popularity: 1, finish: 2, passing: [5, 5, 4, 3],
    last3f: 35.2, bodyWeight: 514, timeDiff: 0.1,
  });
  assert.equal(croix.runs[2]!.timeDiff, -0.1);
  assert.deepEqual(croix.profile, {
    sex: "M", age: 4, runningStyleLabel: "先", intervalLabel: "中19週", intervalWeeks: 19,
    layoffLabel: "4ヵ月半休養", freshRecord: [3, 1, 0, 0], secondRunRecord: [3, 0, 0, 1],
  });
  // Only runs before the race are shown on the page for that race.
  assert.ok(croix.runs.every((run) => run!.date < "2026-11-01"));
});

test("overseas runs without passing order keep missing values as null", () => {
  const entries = parseShutubaPastRuns(html);
  const overseas = entries.flatMap((entry) => entry.runs).filter((run) => run!.passing === null);
  assert.ok(overseas.length > 0);
  for (const run of overseas) assert.equal(run!.last3f, null);
});

test("horse names with an icon span (マル外) are read from Horse02, not from a rival in a past cell", () => {
  const row = '<table><tr class="HorseList"><td class="Waku">6</td><td class="Horse_Info"><div class="Horse02">' +
    '<a href="https://db.netkeiba.com/horse/2024110012"><span class="Icon_HorseMark Icon_MaruGai"></span>インパルスドライブ</a>' +
    '</div></td><td class="Past"><div class="Data01"><span>2026.09.20 阪神</span><span class="Num">1</span></div>' +
    '<div class="Data07"><a href="https://db.netkeiba.com/horse/2024108337">ジャスパーレーブ</a>(-0.1)</div></td></tr></table>';
  const [entry] = parseShutubaPastRuns(row);
  assert.equal(entry!.horseName, "インパルスドライブ");
  assert.equal(entry!.externalHorseId, "2024110012");
  assert.equal(entry!.runs[0]!.timeDiff, -0.1);
});

test("ground labels map 稍重 and 不良 correctly", () => {
  assert.equal(mapGroundLabel("稍"), "Good");
  assert.equal(mapGroundLabel("稍重"), "Good");
  assert.equal(mapGroundLabel("重"), "Yielding");
  assert.equal(mapGroundLabel("不良"), "Soft");
  assert.equal(mapGroundLabel("良"), "Firm");
  assert.equal(mapGroundLabel(""), null);
  assert.equal(parsePastRunCell("<td>取消</td>"), null);
});
