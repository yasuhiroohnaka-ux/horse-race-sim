// WP-G4: rebuild phase-G features for past live snapshots using only facts known before capture.
// Usage: node scripts/backfill-ground-bias-features.mjs [--limit=N]
// Pages are cached under data/cache/netkeiba/ (git-ignored); requests are spaced >= 1.1 s.
import fs from "node:fs";
import path from "node:path";
import { computeDayConditions, computeHorseFeatures, GROUND_BIAS_FEATURE_VERSION, RESULT_CONFIRM_MARGIN_MS }
  from "../lib/groundBiasFeatures.mjs";
import { fetchNetkeibaText, jstTimestamp } from "../lib/netkeibaFetch.mjs";
import { surfaceFromCourseId } from "../lib/observedConditionsCapture.mjs";
import { parseShutubaPastRuns } from "../lib/pastRunParser.mjs";
import { parseResultPassing, parseResultRaceData } from "../lib/raceResultParser.mjs";

const ROOT = process.cwd();
const CACHE_DIR = path.join(ROOT, "data", "cache", "netkeiba");
const OUT_PATH = path.join(ROOT, "data", "analysis", "ground-bias-features.jsonl");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice(8)) : Infinity;

function eligibleRecords() {
  const records = Object.values(JSON.parse(fs.readFileSync(path.join(ROOT, "data", "review-records.json"), "utf8")).records);
  return records.filter((record) => {
    const snapshot = record.snapshot;
    return record.status === "review_ready" && snapshot?.sourceStatus === "live_pre_race" &&
      snapshot?.predictionOrigin === "saved_live" && snapshot?.livePreRaceEligible === true &&
      Array.isArray(snapshot.rankedRows) && snapshot.rankedRows.length > 0 &&
      Date.parse(snapshot.capturedAt) < Date.parse(snapshot.scheduledStartTime) &&
      /^\d{12}$/.test(String(record.raceId));
  }).sort((left, right) => String(left.raceId).localeCompare(String(right.raceId)));
}

const dayResultCache = new Map();
async function loadEarlierResult(raceId, raceDate) {
  if (dayResultCache.has(raceId)) return dayResultCache.get(raceId);
  let entry = null;
  try {
    const html = await fetchNetkeibaText(`https://race.netkeiba.com/race/result.html?race_id=${raceId}`, { cacheDir: CACHE_DIR });
    const meta = parseResultRaceData(html);
    const runners = parseResultPassing(html);
    if (runners.length) {
      entry = { raceId, startAt: jstTimestamp(raceDate, meta.startTime), surface: meta.surface,
        groundCondition: meta.groundCondition, runners };
    }
  } catch (error) {
    console.warn(`[backfill-ground-bias] ${raceId}: ${error.message}`);
  }
  dayResultCache.set(raceId, entry);
  return entry;
}

async function buildRaceFeatures(record) {
  const snapshot = record.snapshot;
  const raceId = String(record.raceId);
  const raceDate = snapshot.raceDate;
  const surface = surfaceFromCourseId(snapshot.courseId);
  const cutoffMs = Date.parse(snapshot.capturedAt);
  const raceNumber = Number(raceId.slice(10));
  const dayResults = [];
  for (let number = 1; number < raceNumber; number += 1) {
    const earlierId = raceId.slice(0, 10) + String(number).padStart(2, "0");
    const result = await loadEarlierResult(earlierId, raceDate);
    if (result) dayResults.push(result);
  }
  const day = computeDayConditions({ surface, cutoffMs, dayResults, targetRaceId: raceId });
  const used = dayResults.filter((result) => day.biasRaceIds.includes(result.raceId));
  const leakFree = used.every((result) => result.startAt + RESULT_CONFIRM_MARGIN_MS < cutoffMs);

  const pastHtml = await fetchNetkeibaText(`https://race.netkeiba.com/race/shutuba_past.html?race_id=${raceId}`, { cacheDir: CACHE_DIR });
  const pastEntries = parseShutubaPastRuns(pastHtml);
  const byExternal = new Map(pastEntries.map((entry) => [entry.externalHorseId, entry]));
  const byNumber = new Map(pastEntries.map((entry) => [entry.horseNumber, entry]));
  const fieldSize = snapshot.rankedRows.length;
  const horses = snapshot.rankedRows.map((row) => {
    const horseNumber = Number(row.gateNumber) || null;
    const past = byExternal.get(String(row.externalHorseId ?? "")) ?? byNumber.get(horseNumber) ?? null;
    return {
      horseId: String(row.horseId),
      horseNumber,
      pastRunCount: past?.runs.length ?? null,
      ...computeHorseFeatures({ horseNumber, fieldSize, pastRuns: past?.runs ?? null, surface, raceDate }, day),
    };
  });
  return { version: GROUND_BIAS_FEATURE_VERSION, raceId, raceDate, capturedAt: snapshot.capturedAt, surface,
    day, leakFree, pastEntriesMatched: horses.filter((horse) => horse.pastRunCount !== null).length, horses };
}

async function main() {
  const records = eligibleRecords().slice(0, limit);
  console.log(`[backfill-ground-bias] ${records.length} races`);
  const lines = [];
  let leaks = 0;
  for (const [index, record] of records.entries()) {
    try {
      const features = await buildRaceFeatures(record);
      if (!features.leakFree) leaks += 1;
      lines.push(JSON.stringify(features));
    } catch (error) {
      console.warn(`[backfill-ground-bias] ${record.raceId}: ${error.message}`);
    }
    if ((index + 1) % 25 === 0) console.log(`[backfill-ground-bias] ${index + 1}/${records.length}`);
  }
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, lines.join("\n") + "\n");
  console.log(`[backfill-ground-bias] wrote ${lines.length} races to ${path.relative(ROOT, OUT_PATH)}`);
  if (leaks > 0) {
    console.error(`[backfill-ground-bias] leak check failed for ${leaks} race(s)`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
  await main();
}
