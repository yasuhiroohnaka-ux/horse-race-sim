import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { dispatchScheduled, stageForScheduledTime } from "../cloudflare/keiba-dispatcher/src/index.mjs";

test("Cloudflare weekend schedule dispatches exactly the routine and capture stages", () => {
  const expected = [
    ["2026-09-26T00:00:00Z", "sat_09"],
    ["2026-09-26T03:17:00Z", "capture_only"],
    ["2026-09-26T04:17:00Z", "capture_only"],
    ["2026-09-26T04:47:00Z", "capture_only"],
    ["2026-09-26T05:17:00Z", "capture_only"],
    ["2026-09-26T06:00:00Z", "sat_15"],
    ["2026-09-26T06:47:00Z", "capture_only"],
    ["2026-09-26T07:17:00Z", "capture_only"],
    ["2026-09-27T00:00:00Z", "sun_09"],
    ["2026-09-27T03:17:00Z", "capture_only"],
    ["2026-09-27T04:17:00Z", "capture_only"],
    ["2026-09-27T04:47:00Z", "capture_only"],
    ["2026-09-27T05:17:00Z", "capture_only"],
    ["2026-09-27T06:00:00Z", "sun_15"],
    ["2026-09-27T06:47:00Z", "capture_only"],
    ["2026-09-27T07:17:00Z", "capture_only"],
  ];
  const found: [string, string][] = [];
  for (let time = Date.parse("2026-09-26T00:00:00Z");
    time < Date.parse("2026-09-28T00:00:00Z"); time += 60_000) {
    const stage = stageForScheduledTime(time);
    if (stage) found.push([new Date(time).toISOString().replace(".000", ""), stage]);
  }
  assert.deepEqual(found, expected);
  const config = JSON.parse(fs.readFileSync(path.join(process.cwd(),
    "cloudflare/keiba-dispatcher/wrangler.jsonc"), "utf8"));
  assert.deepEqual(config.triggers.crons, [
    "0 0,6 * * SAT,SUN",
    "17 3,4,5,7 * * SAT,SUN",
    "47 4,6 * * SAT,SUN",
  ]);
  const configured = config.triggers.crons.flatMap((cron: string) => {
    const [minuteField, hourField] = cron.split(" ");
    return ["2026-09-26", "2026-09-27"].flatMap((day) =>
      hourField.split(",").flatMap((hour: string) =>
        minuteField.split(",").map((minute: string) =>
          `${day}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:00Z`)));
  }).sort();
  assert.deepEqual(configured, expected.map(([time]) => time).sort());
});

test("scheduled dispatch sends only the mapped stage to main", async () => {
  const calls: Array<[string, RequestInit]> = [];
  const fakeFetch: typeof fetch = async (url, init) => {
    calls.push([String(url), init ?? {}]);
    return { ok: true, status: 200 } as Response;
  };
  assert.deepEqual(await dispatchScheduled(Date.parse("2026-09-26T03:17:00Z"),
    { GITHUB_DISPATCH_TOKEN: "test-token" }, fakeFetch),
    { dispatched: true, stage: "capture_only", status: 200 });
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /horse-race-sim\/actions\/workflows\/weekly-keiba-update\.yml\/dispatches$/);
  assert.equal(calls[0][1].method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0][1].body)),
    { ref: "main", inputs: { stage: "capture_only" } });
  assert.equal((calls[0][1].headers as Record<string, string>).Authorization, "Bearer test-token");
  assert.deepEqual(await dispatchScheduled(Date.parse("2026-09-26T03:18:00Z"), {}, fakeFetch),
    { dispatched: false, stage: null });
  assert.equal(calls.length, 1);
});

test("dispatch fails visibly without a token or on GitHub rejection", async () => {
  await assert.rejects(() => dispatchScheduled(Date.parse("2026-09-26T00:00:00Z"), {}),
    /GITHUB_DISPATCH_TOKEN is missing/);
  await assert.rejects(() => dispatchScheduled(Date.parse("2026-09-26T00:00:00Z"),
    { GITHUB_DISPATCH_TOKEN: "test-token" }, async () => ({ ok: false, status: 401 }) as Response),
    /HTTP 401/);
});
