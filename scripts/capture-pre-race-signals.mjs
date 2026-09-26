// Append only observations fetched before each scheduled race start. Never backfill from result pages.
import fs from "node:fs/promises";
import path from "node:path";
import { buildPreRaceSignalCapture } from "../lib/preRaceSignalCapture.mjs";
import { getRaceStartTimestamp } from "../lib/raceTiming.mjs";

const ROOT = process.cwd();
const weeklyPath = path.join(ROOT, "data", "weekly-races.json");
const outputPath = path.join(ROOT, "data", "pre-race-signals.jsonl");
const raceIdArg = process.argv.find((arg) => arg.startsWith("--race-id="))?.slice(10) ?? null;
const todayJst = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
const dateArg = process.argv.find((arg) => arg.startsWith("--date="))?.slice(7) ?? todayJst;
if (!/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) throw new Error("--date must be YYYY-MM-DD");

async function fetchText(url) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: { "user-agent": "horse-race-sim-bot/2.0", accept: "text/html,*/*" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const head = Buffer.from(bytes.slice(0, 4096)).toString("latin1");
  const contentType = response.headers.get("content-type") ?? "";
  const charsetRaw = contentType.match(/charset=([^;]+)/i)?.[1]?.trim() ??
    head.match(/charset=["']?([a-zA-Z0-9._-]+)/i)?.[1] ?? "utf-8";
  const charset = charsetRaw.toLowerCase() === "x-euc-jp" ? "euc-jp" : charsetRaw;
  return { html: new TextDecoder(charset).decode(bytes), fetchedAt: new Date().toISOString() };
}

async function loadCaptures() {
  const raw = await fs.readFile(outputPath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") return "";
    throw error;
  });
  return raw.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch { throw new Error(`invalid JSON in ${outputPath}:${index + 1}`); }
  });
}

async function main() {
  const weekly = JSON.parse(await fs.readFile(weeklyPath, "utf8"));
  const races = (weekly.currentWeek?.races ?? []).filter((race) =>
    race.hasRace && race.raceDate === dateArg && /^\d{12}$/.test(String(race.raceId ?? "")) &&
    (!raceIdArg || String(race.raceId) === raceIdArg));
  const previousCaptures = await loadCaptures();
  let saved = 0;
  for (const race of races) {
    const startAt = getRaceStartTimestamp(race);
    if (!startAt || Date.now() + 120_000 >= startAt) continue;
    const raceId = race.raceId;
    const urls = {
      shutuba: `https://race.netkeiba.com/race/shutuba.html?race_id=${raceId}`,
      orepro: `https://orepro.netkeiba.com/bet/shutuba.html?race_id=${raceId}`,
      oikiri: `https://race.netkeiba.com/race/oikiri.html?race_id=${raceId}&type=1`,
    };
    const fetched = Object.fromEntries(await Promise.all(Object.entries(urls).map(async ([source, url]) => {
      try { return [source, await fetchText(url)]; }
      catch (error) {
        console.warn(`[pre-race-signals] ${raceId} ${source}: ${error.message}`);
        return [source, { html: "", fetchedAt: null }];
      }
    })));
    const capturedAt = new Date().toISOString();
    if (Date.parse(capturedAt) >= startAt) {
      console.warn(`[pre-race-signals] ${raceId}: fetch completed after start; discarded`);
      continue;
    }
    const capture = buildPreRaceSignalCapture({
      race, capturedAt,
      sourceTimes: Object.fromEntries(Object.entries(fetched).map(([source, value]) => [source, value.fetchedAt])),
      shutubaHtml: fetched.shutuba.html,
      oreproHtml: fetched.orepro.html,
      oikiriHtml: fetched.oikiri.html,
      previousCaptures,
    });
    if (!Object.values(capture.coverage).some((count) => count > 0)) {
      console.warn(`[pre-race-signals] ${raceId}: no valid source data; skipped`);
      continue;
    }
    await fs.appendFile(outputPath, `${JSON.stringify(capture)}\n`, "utf8");
    previousCaptures.push(capture);
    saved += 1;
    console.log(`[pre-race-signals] ${raceId} captured ${capture.horses.length} horses: ` +
      `odds=${capture.coverage.odds}, weight=${capture.coverage.bodyWeight}, training=${capture.coverage.training}`);
  }
  console.log(`[pre-race-signals] ${dateArg}: ${saved} capture(s) saved`);
}

main().catch((error) => { console.error(error); process.exit(1); });
