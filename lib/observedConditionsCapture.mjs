// WP-G6: record today's ground / bias and each horse's past runs on a live snapshot.
// Recording only: nothing here feeds the simulation or the v3.1 selection.
import { computeDayConditions, computeHorseFeatures, GROUND_BIAS_FEATURE_VERSION, RESULT_CONFIRM_MARGIN_MS }
  from "./groundBiasFeatures.mjs";
import { fetchNetkeibaText, jstTimestamp } from "./netkeibaFetch.mjs";
import { parseShutubaPastRuns } from "./pastRunParser.mjs";
import { parseResultPassing, parseResultRaceData } from "./raceResultParser.mjs";

export function surfaceFromCourseId(courseId) {
  const value = String(courseId ?? "");
  if (/-turf-/.test(value)) return "Turf";
  if (/-dirt-/.test(value)) return "Dirt";
  return null;
}

const resultCache = new Map();

async function earlierResults(raceId, raceDate, cutoffMs, fetchText) {
  const results = [];
  const raceNumber = Number(String(raceId).slice(10));
  for (let number = 1; number < raceNumber; number += 1) {
    const earlierId = String(raceId).slice(0, 10) + String(number).padStart(2, "0");
    if (!resultCache.has(earlierId)) {
      let entry = null;
      try {
        const html = await fetchText(`https://race.netkeiba.com/race/result.html?race_id=${earlierId}`);
        const meta = parseResultRaceData(html);
        const runners = parseResultPassing(html);
        const startAt = jstTimestamp(raceDate, meta.startTime);
        // A page fetched before the result is out has no finishing positions; do not cache it.
        if (runners.some((runner) => runner.position)) {
          entry = { raceId: earlierId, startAt, surface: meta.surface, groundCondition: meta.groundCondition, runners };
          resultCache.set(earlierId, entry);
        } else if (Number.isFinite(startAt) && startAt + RESULT_CONFIRM_MARGIN_MS >= cutoffMs) {
          break; // later races cannot be confirmed either
        }
      } catch {
        entry = null;
      }
      if (entry) results.push(entry);
    } else {
      results.push(resultCache.get(earlierId));
    }
  }
  return results;
}

/**
 * Returns the observedConditions block for a snapshot, or an object with `error` when capture fails.
 */
export async function captureObservedConditions({
  raceId, raceDate, courseId, capturedAt, scheduledStartTime, rankedRows,
  fetchText = (url) => fetchNetkeibaText(url), now = () => new Date(),
}) {
  const cutoffMs = Date.parse(capturedAt);
  const startMs = Date.parse(scheduledStartTime ?? "");
  const surface = surfaceFromCourseId(courseId);
  const base = { version: GROUND_BIAS_FEATURE_VERSION, surface };
  if (!/^\d{12}$/.test(String(raceId ?? "")) || !Number.isFinite(cutoffMs) || !surface) {
    return { ...base, error: "missing_race_identity" };
  }
  try {
    const dayResults = await earlierResults(raceId, raceDate, cutoffMs, fetchText);
    const shutubaHtml = await fetchText(`https://race.netkeiba.com/race/shutuba.html?race_id=${raceId}`);
    const announcedGround = parseResultRaceData(shutubaHtml).groundCondition;
    const pastHtml = await fetchText(`https://race.netkeiba.com/race/shutuba_past.html?race_id=${raceId}`);
    const fetchedAt = now();
    if (Number.isFinite(startMs) && fetchedAt.getTime() >= startMs) {
      return { ...base, error: "fetched_after_start", fetchedAt: fetchedAt.toISOString() };
    }
    const day = computeDayConditions({ surface, cutoffMs, dayResults, announcedGround, targetRaceId: raceId });
    const past = parseShutubaPastRuns(pastHtml);
    const byExternal = new Map(past.map((entry) => [entry.externalHorseId, entry]));
    const byNumber = new Map(past.map((entry) => [entry.horseNumber, entry]));
    const fieldSize = rankedRows.length;
    const horses = rankedRows.map((row) => {
      const horseNumber = Number(row.gateNumber) || null;
      const entry = byExternal.get(String(row.externalHorseId ?? "")) ?? byNumber.get(horseNumber) ?? null;
      return {
        horseId: String(row.horseId),
        horseNumber,
        profile: entry?.profile ?? null,
        pastRuns: entry?.runs ?? null,
        ...computeHorseFeatures({ horseNumber, fieldSize, pastRuns: entry?.runs ?? null, surface, raceDate }, day),
      };
    });
    return { ...base, ...day, announcedGround, fetchedAt: fetchedAt.toISOString(), horses };
  } catch (error) {
    return { ...base, error: String(error?.message ?? error) };
  }
}

export function resetObservedConditionsCache() {
  resultCache.clear();
}
