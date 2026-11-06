// Phase G features: today's ground / track bias and per-horse interactions.
// Definitions were fixed before any evaluation (plan WP-G3); do not tune them on results.
import { isWetGround } from "./pastRunParser.mjs";

export const GROUND_BIAS_FEATURE_VERSION = "ground-bias-v1";
export const RESULT_CONFIRM_MARGIN_MS = 15 * 60_000;
const SHRINK_RACES = 3;
const MIN_FIELD_SIZE = 5;
const TIME_DIFF_CAP = 3;
const JRA_RACE_ID = /^\d{4}(0[1-9]|10)\d{6}$/;

const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
const round = (value) => (value === null ? null : Math.round(value * 10000) / 10000);
const pct = (position, fieldSize) => (position - 1) / (fieldSize - 1);

/**
 * Race-level observations from earlier races on the same day, venue and surface.
 * dayResults: [{ raceId, startAt (ms), surface, groundCondition, runners: [{ position, horseNumber, passing }] }]
 * Only races whose start + 15 min is before cutoffMs are used, so results are known at capture time.
 */
export function computeDayConditions({ surface, cutoffMs, dayResults, announcedGround = null, targetRaceId = null }) {
  const usable = (dayResults ?? [])
    .filter((race) => race.surface === surface && String(race.raceId) !== String(targetRaceId ?? "") &&
      Number.isFinite(race.startAt) && race.startAt + RESULT_CONFIRM_MARGIN_MS < cutoffMs)
    .sort((left, right) => left.startAt - right.startAt);

  const lastGround = [...usable].reverse().find((race) => race.groundCondition)?.groundCondition ?? null;
  const innerOuter = [];
  const frontBack = [];
  const biasRaceIds = [];
  for (const race of usable) {
    const runners = (race.runners ?? []).filter((runner) => runner.horseNumber);
    const fieldSize = runners.length;
    if (fieldSize < MIN_FIELD_SIZE) continue;
    const top3 = runners.filter((runner) => runner.position && runner.position <= 3);
    if (top3.length === 0) continue;
    biasRaceIds.push(String(race.raceId));
    innerOuter.push(mean(top3.map((runner) => pct(runner.horseNumber, fieldSize))) - 0.5);
    const corner = (runner) => (runner.passing?.length ? pct(runner.passing.at(-1), fieldSize) : null);
    const allCorner = runners.map(corner).filter((value) => value !== null);
    const topCorner = top3.map(corner).filter((value) => value !== null);
    if (allCorner.length && topCorner.length) frontBack.push(mean(topCorner) - mean(allCorner));
  }
  const shrink = (values) => (values.length ? mean(values) * values.length / (values.length + SHRINK_RACES) : null);
  return {
    version: GROUND_BIAS_FEATURE_VERSION,
    groundToday: lastGround ?? announcedGround ?? null,
    groundSource: lastGround ? "result" : announcedGround ? "shutuba" : null,
    innerOuterToday: round(shrink(innerOuter)),
    frontBackToday: round(shrink(frontBack)),
    n: biasRaceIds.length,
    biasRaceIds,
  };
}

function jraRuns(pastRuns, surface, beforeDate) {
  return (pastRuns ?? []).filter((run) => run && JRA_RACE_ID.test(String(run.raceId ?? "")) &&
    run.surface === surface && (!beforeDate || run.date < beforeDate));
}

/**
 * Per-horse interactions (null when inputs are missing; never filled with 0).
 * gateBiasFit > 0: the horse's gate suits today's inner/outer bias.
 * styleBiasFit > 0: the horse's usual position suits today's front/back bias.
 * wetFit > 0: on a wet day, the horse has run closer to the winner on wet ground than on firm.
 */
export function computeHorseFeatures({ horseNumber, fieldSize, pastRuns, surface, raceDate }, day) {
  const runs = jraRuns(pastRuns, surface, raceDate);
  const gatePct = horseNumber && fieldSize >= 2 ? pct(horseNumber, fieldSize) - 0.5 : null;
  const gateBiasFit = gatePct !== null && day.innerOuterToday !== null ? gatePct * day.innerOuterToday : null;

  const cornerPcts = runs
    .filter((run) => run.passing?.length && run.fieldSize >= 2)
    .map((run) => pct(run.passing.at(-1), run.fieldSize));
  const usualPosition = cornerPcts.length ? mean(cornerPcts) - 0.5 : null;
  const styleBiasFit = usualPosition !== null && day.frontBackToday !== null ? usualPosition * day.frontBackToday : null;

  let wetFit = null;
  if (isWetGround(day.groundToday)) {
    const diff = (run) => Math.max(-TIME_DIFF_CAP, Math.min(TIME_DIFF_CAP, run.timeDiff));
    const withDiff = runs.filter((run) => Number.isFinite(run.timeDiff) && run.ground);
    const wet = withDiff.filter((run) => isWetGround(run.ground)).map(diff);
    const firm = withDiff.filter((run) => run.ground === "Firm").map(diff);
    if (wet.length && firm.length) wetFit = -(mean(wet) - mean(firm));
  }
  return { gateBiasFit: round(gateBiasFit), styleBiasFit: round(styleBiasFit), wetFit: round(wetFit) };
}
