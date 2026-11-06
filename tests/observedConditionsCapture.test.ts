import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { captureObservedConditions as captureRaw, resetObservedConditionsCache } from "../lib/observedConditionsCapture.mjs";
import type { ObservedConditions } from "../lib/types";

const captureObservedConditions = (input: Record<string, unknown>) =>
  captureRaw(input as never) as unknown as Promise<ObservedConditions>;

const resultHtml = readFileSync(new URL("./fixtures/result-tokyo-20261101-1r.html", import.meta.url), "utf8");
const pastHtml = readFileSync(new URL("./fixtures/shutuba-past-tenno-aki-2026.html", import.meta.url), "utf8");
const shutubaHtml = '<div class="RaceData01">10:50発走 / <span> ダ1600m</span> 左 / <span class="Item04"> 稍</span></div>';

function fakeFetch(calls: string[]) {
  return async (url: string) => {
    calls.push(url);
    if (url.includes("result.html") && url.endsWith("202605040901")) return resultHtml;
    if (url.includes("result.html")) return "<div></div>"; // not run yet
    if (url.includes("shutuba_past")) return pastHtml;
    return shutubaHtml;
  };
}

const params = {
  raceId: "202605040903", raceDate: "2026-11-01", courseId: "tokyo-dirt-1600-202605040903",
  capturedAt: "2026-11-01T10:30:00+09:00", scheduledStartTime: "2026-11-01T10:50:00+09:00",
  rankedRows: [
    { horseId: "1", gateNumber: 1, externalHorseId: "2022105102" },
    { horseId: "2", gateNumber: 2, externalHorseId: null },
  ],
};

test("records ground from confirmed earlier results and past runs per horse", async () => {
  resetObservedConditionsCache();
  const calls: string[] = [];
  const observed = await captureObservedConditions({
    ...params, fetchText: fakeFetch(calls), now: () => new Date("2026-11-01T10:31:00+09:00"),
  });
  assert.equal(observed.error, undefined);
  assert.equal(observed.surface, "Dirt");
  assert.equal(observed.groundToday, "Good");
  assert.equal(observed.groundSource, "result");
  assert.equal(observed.announcedGround, "Good");
  // The fixture keeps only 3 runners, below the 5-runner minimum for bias.
  assert.equal(observed.n, 0);
  assert.equal(observed.innerOuterToday, null);
  assert.equal(observed.horses?.length, 2);
  assert.equal(observed.horses?.[0]?.pastRuns?.length, 4);
  assert.equal(observed.horses?.[0]?.profile?.intervalWeeks, 19);
  assert.deepEqual(observed.horses?.[0]?.profile?.freshRecord, [3, 1, 0, 0]);
  assert.equal(observed.horses?.[1]?.horseNumber, 2);
  assert.ok(calls.some((url) => url.includes("shutuba_past")));
});

test("a capture that finishes after the scheduled start is discarded", async () => {
  resetObservedConditionsCache();
  const observed = await captureObservedConditions({
    ...params, fetchText: fakeFetch([]), now: () => new Date("2026-11-01T10:51:00+09:00"),
  });
  assert.equal(observed.error, "fetched_after_start");
  assert.equal(observed.horses, undefined);
});

test("missing race identity returns an error instead of throwing", async () => {
  const observed = await captureObservedConditions({ ...params, raceId: "abc", fetchText: fakeFetch([]) });
  assert.equal(observed.error, "missing_race_identity");
});
