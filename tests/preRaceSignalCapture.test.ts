import assert from "node:assert/strict";
import test from "node:test";
import { buildPreRaceSignalCapture, parseShutubaSignals, parseTrainingSignals,
  summarizeSignalReadiness } from "../lib/preRaceSignalCapture.mjs";

const race = {
  raceId: "202606040809", raceDate: "2026-09-26", scheduledStartTime: "14:10",
  expectedFieldSize: 2,
  horses: [
    { id: "1", externalHorseId: "101", gateNumber: 1, name: "アルファ" },
    { id: "2", externalHorseId: "102", gateNumber: 2, name: "ベータ" },
  ],
};
const shutubaHtml = `
<tr class="HorseList"><td class="Umaban1">1</td><td class="HorseInfo"><a href="/horse/101" title="アルファ">アルファ</a></td>
<td class="Weight">460<small>(+2)</small></td><span id="odds-1_01">4.0</span></tr>
<tr class="HorseList"><td class="Umaban2">2</td><td class="HorseInfo"><a href="/horse/102" title="ベータ">ベータ</a></td>
<td class="Weight">500<small>(-4)</small></td><span id="odds-1_02">12.0</span></tr>`;
const oikiriHtml = `
<td rowspan="2" class="Horse_Info fc"><div class="Horse_Name"><a href="https://db.netkeiba.com/horse/101">アルファ</a></div></td></tr>
<tr class="OikiriDataHead1 HorseList"><td class="Training_Day">2026/09/23(水)</td><td>美Ｗ</td>
<td class="TrainingTimeData txt_l"><ul><li>54.0<span class="RapTime">(15.0)</span></li><li>11.8<span class="RapTime">(11.8)</span></li></ul>
<div class="Comment_Cell">併せ０秒１先着</div></td><td class="TrainingLoad">馬也</td><td class="Rank_B">B</td></tr>
<td rowspan="2" class="Horse_Info fc"><div class="Horse_Name"><a href="https://db.netkeiba.com/horse/102">ベータ</a></div></td></tr>
<tr class="OikiriDataHead1 HorseList"><td class="Training_Day">2026/09/23(水)</td><td>美Ｗ</td>
<td class="TrainingTimeData txt_l"><ul><li>56.0<span class="RapTime">(15.5)</span></li><li>12.4<span class="RapTime">(12.4)</span></li></ul>
<div class="Comment_Cell">併せ０秒２遅れ</div></td><td class="TrainingLoad">強め</td><td class="Rank_C">C</td></tr>`;

test("public HTML yields body weight, lap and companion details", () => {
  const entries = parseShutubaSignals(shutubaHtml);
  assert.deepEqual([entries.get(1)?.bodyWeightKg, entries.get(1)?.bodyWeightDiffKg], [460, 2]);
  assert.deepEqual([entries.get(2)?.bodyWeightKg, entries.get(2)?.bodyWeightDiffKg], [500, -4]);
  const training = parseTrainingSignals(oikiriHtml);
  assert.equal(training.get("101")?.final1fSeconds, 11.8);
  assert.deepEqual(training.get("101")?.lapSeconds, [15, 11.8]);
  assert.equal(training.get("101")?.companionOutcome, 1);
  assert.equal(training.get("102")?.companionOutcome, -1);
});

test("capture stores only pre-race values and race-relative features", () => {
  const capturedAt = "2026-09-26T04:30:00.000Z";
  const earlier = { raceId: race.raceId, capturedAt: "2026-09-26T00:00:00.000Z", horses: [
    { horseId: "1", odds: 5, oddsSource: "netkeiba_shutuba", oddsFetchedAt: "2026-09-26T00:00:00.000Z" },
    { horseId: "2", odds: 10, oddsSource: "netkeiba_shutuba", oddsFetchedAt: "2026-09-26T00:00:00.000Z" },
  ] };
  const capture = buildPreRaceSignalCapture({
    race, capturedAt, sourceTimes: { shutuba: "2026-09-26T04:29:00.000Z", oikiri: "2026-09-26T04:28:00.000Z" },
    shutubaHtml, oikiriHtml, previousCaptures: [earlier],
  });
  assert.deepEqual(capture.coverage, { odds: 2, bodyWeight: 2, training: 2 });
  assert.equal(capture.horses[0].relative.bodyWeightVsFieldKg, -20);
  assert.equal(capture.horses[0].relative.bodyWeightDiffVsFieldKg, 3);
  assert.equal(capture.horses[0].relative.trainingFinal1fVsCourseSeconds, 0.3);
  assert.ok(capture.horses[0].relative.oddsMoveVsField > 0);
  assert.ok(capture.horses[1].relative.oddsMoveVsField < 0);
  assert.equal(capture.horses[0].relative.companionVsField, 1);
});

test("post-start capture is rejected and post-start sources are ignored", () => {
  assert.throws(() => buildPreRaceSignalCapture({ race, capturedAt: "2026-09-26T05:11:00Z", sourceTimes: {},
    shutubaHtml, oikiriHtml }), /before scheduled start/);
  const capture = buildPreRaceSignalCapture({ race, capturedAt: "2026-09-26T04:30:00Z",
    sourceTimes: { shutuba: "2026-09-26T05:11:00Z", oikiri: "2026-09-26T04:29:00Z" },
    shutubaHtml, oikiriHtml });
  assert.equal(capture.coverage.odds, 0);
  assert.equal(capture.coverage.bodyWeight, 0);
  assert.equal(capture.coverage.training, 2);
});

test("unpublished weight remains missing and readiness counts distinct pre-race races", () => {
  const unpublished = shutubaHtml.replaceAll(/<td class="Weight">[\s\S]*?<\/td>/g, '<td class="Weight">計不</td>');
  const at = "2026-09-26T04:30:00Z";
  const sourceTimes = { shutuba: "2026-09-26T04:29:00Z", oikiri: "2026-09-26T04:28:00Z" };
  const incomplete = buildPreRaceSignalCapture({ race, capturedAt: at, sourceTimes,
    shutubaHtml: unpublished, oikiriHtml });
  assert.equal(incomplete.horses[0].bodyWeightKg, null);
  assert.equal(incomplete.horses[0].bodyWeightDiffKg, null);
  assert.equal(summarizeSignalReadiness([incomplete]).relative.bodyWeight, 0);

  const earlier = buildPreRaceSignalCapture({ race, capturedAt: "2026-09-26T01:00:00Z",
    sourceTimes: { shutuba: "2026-09-26T00:59:00Z" }, shutubaHtml });
  const complete = buildPreRaceSignalCapture({ race, capturedAt: at, sourceTimes,
    shutubaHtml, oikiriHtml, previousCaptures: [earlier] });
  const summary = summarizeSignalReadiness([earlier, complete, complete, incomplete]);
  assert.equal(summary.raceCount, 1);
  assert.deepEqual(summary.relative, { oddsMovement: 1, bodyWeight: 1,
    trainingFinal1f: 1, companion: 1 });
  assert.deepEqual(summary.trackedEntriesComplete, { odds: 1, bodyWeight: 1, training: 1 });
  assert.equal(summary.jointRelativeRaces, 1);
  assert.equal(summary.partialJointRelativeRaces, 1);
  assert.equal(summary.readyForB2, false);
  const postStart = { ...complete, capturedAt: "2026-09-26T05:12:00Z", raceId: "future" };
  assert.equal(summarizeSignalReadiness([postStart]).raceCount, 0);
});

test("partial public training never satisfies the all-runner B2 readiness gate", () => {
  const earlier = buildPreRaceSignalCapture({ race, capturedAt: "2026-09-26T01:00:00Z",
    sourceTimes: { shutuba: "2026-09-26T00:59:00Z" }, shutubaHtml });
  const complete = buildPreRaceSignalCapture({ race, capturedAt: "2026-09-26T04:30:00Z",
    sourceTimes: { shutuba: "2026-09-26T04:29:00Z", oikiri: "2026-09-26T04:28:00Z" },
    shutubaHtml, oikiriHtml, previousCaptures: [earlier] });
  const partial = Array.from({ length: 100 }, (_, index) => {
    const capture = structuredClone(complete);
    capture.raceId = `partial-${index}`;
    capture.horses[1].training = null;
    capture.horses[1].trainingFetchedAt = null;
    capture.horses[1].relative.trainingFinal1fVsCourseSeconds = null;
    return capture;
  });
  const partialSummary = summarizeSignalReadiness(partial);
  assert.equal(partialSummary.partialJointRelativeRaces, 100);
  assert.equal(partialSummary.jointRelativeRaces, 0);
  assert.equal(partialSummary.trackedEntriesComplete.training, 0);
  assert.equal(partialSummary.readyForB2, false);

  const full = Array.from({ length: 100 }, (_, index) => ({ ...complete, raceId: `full-${index}` }));
  assert.equal(summarizeSignalReadiness(full).readyForB2, true);
  const missingTimestamp = structuredClone(complete);
  missingTimestamp.raceId = "missing-time";
  missingTimestamp.horses[0].oddsFetchedAt = null;
  assert.equal(summarizeSignalReadiness([missingTimestamp]).jointRelativeRaces, 0);
});
