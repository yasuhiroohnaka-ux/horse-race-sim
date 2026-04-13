import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  TANPUKU_SCORING_VERSION,
  pickTanpukuPair as pickSharedTanpukuPair,
} from "../lib/tanpukuSelection.mjs";
import {
  buildPreRacePostPayload,
  buildReviewPostPayload,
  buildWeeklySummaryPostPayload,
} from "../lib/xPostPayload.mjs";

const ROOT = process.cwd();

const ARG_STAGE = process.argv.find((arg) => arg.startsWith("--stage="))?.split("=")[1];
const AUTO = process.argv.includes("--auto");

const WEEKLY_RACES_PATH = path.join(ROOT, "data", "weekly-races.json");
const STATE_PATH = path.join(ROOT, "data", "routine-state.json");
const PENDING_POSTS_PATH = path.join(ROOT, "data", "pending-posts.jsonl");
const GENERATED_REVIEWS_PATH = path.join(ROOT, "data", "generated-reviews.json");
const DEFAULT_SCORING_VERSION = TANPUKU_SCORING_VERSION;

const X_POST_WEBHOOK_URL = process.env.X_POST_WEBHOOK_URL || "";

function jstNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
}

function startOfWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function detectStageFromJst(now) {
  const day = now.getDay();
  const hour = now.getHours();
  if (day === 0 && hour === 9) return "sun_09";
  if (day === 1 && hour === 9) return "mon_09";
  if (day === 1 && hour === 10) return "mon_10";
  if (day === 3 && hour === 12) return "wed_12";
  if (day === 4 && hour === 12) return "thu_12";
  if (day === 4 && hour === 15) return "thu_15";
  if (day === 5 && hour === 10) return "fri_10";
  if (day === 6 && hour === 15) return "sat_15";
  if (day === 0 && hour === 15) return "sun_15";
  if (day === 0 && hour === 16) return "sun_16";
  return null;
}

function isAfterFri10Jst(now) {
  const day = now.getDay();
  const hour = now.getHours();
  return day === 0 || day === 6 || (day === 5 && hour >= 10);
}

async function runNodeScript(relativePath, args = []) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, relativePath), ...args], {
      cwd: ROOT,
      stdio: "inherit",
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${relativePath} exited with code ${code}`))));
    child.on("error", reject);
  });
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function reviewKeyForRace(race) {
  return String(race?.raceId ?? race?.courseId ?? "");
}

async function publishOrQueuePost(stage, text, structuredPayload = null) {
  const payload = {
    stage,
    text,
    postedAt: new Date().toISOString(),
    ...(structuredPayload ? { payload: structuredPayload } : {}),
  };

  if (X_POST_WEBHOOK_URL) {
    const res = await fetch(X_POST_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Webhook post failed: ${res.status}`);
    }
    return;
  }

  await fs.appendFile(PENDING_POSTS_PATH, `${JSON.stringify(payload)}\n`, "utf8");
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function computePaceModifier(race) {
  const front = race.horses.filter((h) => h.runningStyle === "Nige" || h.runningStyle === "Senko").length;
  const ratio = front / Math.max(race.horses.length, 1);
  return ratio - 0.45;
}

function getDistanceShiftRaceBias(race) {
  const distance = Number(race.distance ?? 0);
  const straightLength = Number(race.straightLength ?? 360);
  const sprintBias = clamp((1600 - distance) / 500, 0, 1);
  const stayingBias = clamp((distance - 1800) / 800, 0, 1);
  const straightBias = clamp((straightLength - 380) / 180, -1, 1);
  const frontBias = clamp(Number(race.trackBias?.frontBack ?? 0) / 5, -1, 1);

  return clamp(
    stayingBias * 0.95 -
      sprintBias * 0.9 +
      straightBias * 0.25 -
      getCourseInnerTiltFromId(race.courseId) * 0.28 -
      frontBias * 0.24,
    -1.2,
    1.2
  );
}

function getDistanceShiftScore(horse, race) {
  const lastRaceDistance = Number(horse.lastRaceDistance ?? 0);
  if (!(lastRaceDistance > 0)) return 0;

  const distanceChange = Number.isFinite(Number(horse.distanceChange))
    ? Number(horse.distanceChange)
    : Number(race.distance ?? 0) - lastRaceDistance;
  if (Math.abs(distanceChange) < 100) return 0;

  const changeUnits = clamp(distanceChange / 400, -1.25, 1.25);
  const styleBias =
    horse.runningStyle === "Nige"
      ? -0.65
      : horse.runningStyle === "Senko"
        ? -0.25
        : horse.runningStyle === "Sashi"
          ? 0.25
          : 0.55;
  const staminaEdge = clamp((horse.stamina - horse.speed) / 18, -1.4, 1.4);
  const recoveryEdge = clamp((horse.guts - 75) / 18, -0.8, 0.8);
  const horseBias = clamp(styleBias + staminaEdge * 0.72 + recoveryEdge * 0.18, -1.4, 1.4);
  const alignment = changeUnits * (horseBias * 0.75 + getDistanceShiftRaceBias(race) * 0.55);
  const resilience = clamp(
    ((horse.recentFormScore ?? 0) / 5) * 0.65 + (((horse.lastRaceGradeScore ?? 2) - 2) / 3) * 0.35,
    -1,
    1
  );

  return clamp(alignment * 6 - Math.abs(changeUnits) + Math.abs(changeUnits) * resilience * 1.8, -6, 6);
}

function isFrontStyle(style) {
  return style === "Nige" || style === "Senko";
}

function isBackStyle(style) {
  return style === "Sashi" || style === "Oikomi";
}

function getCourseInnerTiltFromId(courseId = "") {
  const id = String(courseId).toLowerCase();
  if (id.includes("nakayama")) return 0.7;
  if (id.includes("chukyo")) return 0.2;
  if (id.includes("hanshin")) return 0.1;
  if (id.includes("tokyo")) return -0.2;
  if (id.includes("niigata")) return -0.4;
  return 0;
}

function buildDrawTacticalMap(race, applyDraw = true) {
  const horses = race.horses || [];
  if (!applyDraw) {
    return new Map(horses.map((h) => [h.id, 1.0]));
  }
  const sorted = [...horses].sort((a, b) => (a.gateNumber ?? 999) - (b.gateNumber ?? 999) || String(a.id).localeCompare(String(b.id)));
  const n = Math.max(sorted.length, 1);
  const smallField = n < 8;
  const damp = smallField ? 0.10 : 1.0; // Almost disable for small fields.
  const innerTilt = getCourseInnerTiltFromId(race.courseId);
  const bias = race.trackBias ?? { innerOuter: 0, frontBack: 0 };
  const outerFav = clamp((bias.innerOuter ?? 0) / 5, -1, 1);
  const frontFav = clamp((bias.frontBack ?? 0) / 5, -1, 1);

  return new Map(
    sorted.map((horse, i) => {
      const lanePos = n <= 1 ? 0 : (i / (n - 1)) * 2 - 1; // -1 inner, +1 outer
      const left = i > 0 ? sorted[i - 1] : null;
      const right = i < n - 1 ? sorted[i + 1] : null;
      const neighFront = [left, right].filter((x) => x && isFrontStyle(x.runningStyle)).length;
      const neighBack = [left, right].filter((x) => x && isBackStyle(x.runningStyle)).length;

      const lanePct = (-lanePos * innerTilt + lanePos * outerFav) * 0.007 * damp;
      const styleBiasPct = isFrontStyle(horse.runningStyle) ? frontFav * 0.005 * damp : isBackStyle(horse.runningStyle) ? -frontFav * 0.005 * damp : 0;
      let tacticalPct = 0;
      if (horse.runningStyle === "Nige") {
        if (right && isFrontStyle(right.runningStyle)) tacticalPct -= 0.005 * damp;
        if (left && isFrontStyle(left.runningStyle)) tacticalPct -= 0.002 * damp;
        if (neighFront === 0) tacticalPct += 0.003 * damp;
      } else if (horse.runningStyle === "Senko") {
        tacticalPct -= neighFront * 0.002 * damp;
        if (neighFront >= 2) tacticalPct -= 0.0015 * damp;
      } else {
        tacticalPct -= neighBack * 0.0015 * damp;
        if (lanePos < -0.3 && neighBack > 0) tacticalPct -= 0.001 * damp;
      }

      const modifier = smallField
        ? clamp(1 + lanePct + styleBiasPct + tacticalPct, 0.995, 1.005)
        : clamp(1 + lanePct + styleBiasPct + tacticalPct, 0.975, 1.025);
      return [horse.id, modifier];
    })
  );
}

function scoreHorse(horse, race, includeBodyWeight = false, drawMap = null) {
  const ability = horse.speed * 0.35 + horse.stamina * 0.25 + horse.power * 0.2 + horse.guts * 0.2;
  const popularity = horse.predictionCount;
  const simWinProxy = horse.realOdds > 0 ? 100 / horse.realOdds : 0;
  const pace = computePaceModifier(race);
  const isFront = horse.runningStyle === "Nige" || horse.runningStyle === "Senko";
  const paceAdvantage = isFront ? -pace * 10 : pace * 10;
  const bodyWeightBonus = includeBodyWeight ? Number(horse.bodyWeightDiff ?? 0) * -0.3 : 0;
  const drawMod = drawMap?.get(horse.id) ?? 1.0;
  const distanceShiftBonus = getDistanceShiftScore(horse, race);
  return ability * drawMod + popularity * 0.15 + simWinProxy * 0.35 + paceAdvantage + bodyWeightBonus + distanceShiftBonus;
}

function pickBestHorse(races, day, includeBodyWeight = false, applyDraw = true) {
  const candidates = races.filter((race) => race.day === day && race.hasRace);
  if (candidates.length === 0) return null;

  let best = null;
  for (const race of candidates) {
    const drawMap = buildDrawTacticalMap(race, applyDraw);
    for (const horse of race.horses) {
      const score = scoreHorse(horse, race, includeBodyWeight, drawMap);
      if (!best || score > best.score) {
        best = { race, horse, score };
      }
    }
  }
  return best;
}

function listUndervaluedHorsesInRace(race, includeBodyWeight = false, applyDraw = true) {
  const drawMap = buildDrawTacticalMap(race, applyDraw);
  const scored = race.horses.map((horse) => ({ horse, score: scoreHorse(horse, race, includeBodyWeight, drawMap) }));
  const scoreRank = new Map([...scored].sort((a, b) => b.score - a.score).map((x, idx) => [x.horse.id, idx + 1]));
  const popRank = new Map([...race.horses].sort((a, b) => (b.predictionCount ?? 0) - (a.predictionCount ?? 0)).map((x, idx) => [x.id, idx + 1]));

  return race.horses
    .map((horse) => {
      const sRank = scoreRank.get(horse.id) ?? race.horses.length;
      const pRank = popRank.get(horse.id) ?? race.horses.length;
      const gap = pRank - sRank;
      if (gap <= 0) return null;
      return { horse, gap };
    })
    .filter((x) => x !== null)
    .sort((a, b) => b.gap - a.gap);
}

function listOvervaluedHorsesInRace(race, includeBodyWeight = false, applyDraw = true) {
  const drawMap = buildDrawTacticalMap(race, applyDraw);
  const scored = race.horses.map((horse) => ({ horse, score: scoreHorse(horse, race, includeBodyWeight, drawMap) }));
  const scoreRank = new Map([...scored].sort((a, b) => b.score - a.score).map((x, idx) => [x.horse.id, idx + 1]));
  const popRank = new Map([...race.horses].sort((a, b) => (b.predictionCount ?? 0) - (a.predictionCount ?? 0)).map((x, idx) => [x.id, idx + 1]));

  return race.horses
    .map((horse) => {
      const sRank = scoreRank.get(horse.id) ?? race.horses.length;
      const pRank = popRank.get(horse.id) ?? race.horses.length;
      const gap = sRank - pRank;
      if (gap <= 0) return null;
      return { horse, gap };
    })
    .filter((x) => x !== null)
    .sort((a, b) => b.gap - a.gap);
}

function hasOfficialPayoutTable(payoutTable) {
  return Boolean(
    payoutTable &&
      Array.isArray(payoutTable.resultNumbers) &&
      payoutTable.resultNumbers.length > 0 &&
      Array.isArray(payoutTable.payouts) &&
      payoutTable.payouts.length > 0
  );
}

function getResultFinisherForHorse(race, horseId) {
  const finishers = race?.result?.finishers;
  if (!Array.isArray(finishers) || !horseId) return null;
  return finishers.find((finisher) => String(finisher?.horseId ?? "") === String(horseId)) ?? null;
}

function getOfficialPayoutByHorseNumber(payoutTable, horseNumber) {
  if (!hasOfficialPayoutTable(payoutTable)) return null;

  const normalizedHorseNumber = Number(horseNumber ?? 0);
  if (!(normalizedHorseNumber > 0)) return null;

  const resultNumbers = payoutTable.resultNumbers.map((value) => Number(value));
  const payouts = payoutTable.payouts.map((value) => Number(value));
  const index = resultNumbers.findIndex((value) => value === normalizedHorseNumber);
  if (index < 0) return null;

  const payout = payouts[index];
  return Number.isFinite(payout) ? Math.round(payout) : null;
}

function getOfficialTanshoPayoutForHorse(race, horseId) {
  const finisher = getResultFinisherForHorse(race, horseId);
  if (!finisher) return null;
  return getOfficialPayoutByHorseNumber(race?.result?.payouts?.tansho, finisher.horseNumber);
}

function getOfficialFukushoPayoutForHorse(race, horseId) {
  const finisher = getResultFinisherForHorse(race, horseId);
  if (!finisher) return null;
  return getOfficialPayoutByHorseNumber(race?.result?.payouts?.fukusho, finisher.horseNumber);
}

function buildPackedOvervaluedText(day, overvalued, maxChars = 280) {
  const prefix = `${day}対象レース 過大評価馬: `;
  if (!overvalued || overvalued.length === 0) return `${prefix}該当なし`;

  const parts = [];
  for (const x of overvalued) {
    const part = `${x.horse.name}(人気${x.horse.predictionCount}, 想定${x.horse.realOdds}倍, ギャップ+${x.gap})`;
    const candidate = `${prefix}${[...parts, part].join("、")}`;
    if (candidate.length > maxChars) break;
    parts.push(part);
  }

  if (parts.length === 0) {
    const x = overvalued[0];
    return `${prefix}${x.horse.name}(人気${x.horse.predictionCount}, 想定${x.horse.realOdds}倍, ギャップ+${x.gap})`;
  }

  return `${prefix}${parts.join("、")}`;
}
function ensurePerf(state, weekOf) {
  state.performance = state.performance || {};
  if (!state.performance.weekly || state.performance.weekly.weekOf !== weekOf) {
    state.performance.weekly = {
      weekOf,
      bets: 0,
      tanHits: 0,
      fukuHits: 0,
      tanStake: 0,
      tanPayout: 0,
      fukuStake: 0,
      fukuPayout: 0,
    };
  }

  state.performance.total = state.performance.total || {
    bets: 0,
    tanHits: 0,
    fukuHits: 0,
    tanStake: 0,
    tanPayout: 0,
    fukuStake: 0,
    fukuPayout: 0,
  };
}

async function handleMonday10(now) {
  const state = await readJson(STATE_PATH, {});
  const weeklyBefore = await readJson(WEEKLY_RACES_PATH, { currentWeek: null, archives: [] });
  const targetWeekOf = isoDate(startOfWeekMonday(now));
  const currentWeekOf = String(weeklyBefore.currentWeek?.weekOf ?? "");
  const mostRecentArchiveWeekOf = String(weeklyBefore.archives?.[0]?.weekOf ?? "");
  const rolloverPending = Boolean(currentWeekOf && currentWeekOf !== targetWeekOf);
  const archiveBackfillWeekOf = rolloverPending ? currentWeekOf : mostRecentArchiveWeekOf;

  for (const day of ["Sat", "Sun"]) {
    const args = [`--day=${day}`];
    if (rolloverPending) {
      await runNodeScript("scripts/update-race-results.mjs", args);
    }
    if (archiveBackfillWeekOf) {
      await runNodeScript("scripts/update-race-results.mjs", [
        ...args,
        "--include-archives",
        "--skip-current-week",
        `--archive-week=${archiveBackfillWeekOf}`,
      ]);
    }
  }

  await runNodeScript("scripts/refresh-weekly-races.mjs");
  await runNodeScript("scripts/sync-race-schedule.mjs");
  await runNodeScript("scripts/weekly-keiba-update.mjs", ["--force"]);
  await runNodeScript("scripts/update-race-volatility.mjs");

  state.lastMondayRollover = new Date().toISOString();
  state.drawConfirmedAt = null;
  await writeJson(STATE_PATH, state);

  await publishOrQueuePost("mon_10", "今週の対象レースへ切替し、出馬表の基礎データを自動更新しました。");
}

async function handleNextDayReview(day, stage) {
  await runNodeScript("scripts/update-race-results.mjs", [`--day=${day}`]);
  await runNodeScript("scripts/sync-race-schedule.mjs");

  const weekly = await readJson(WEEKLY_RACES_PATH, { currentWeek: { races: [] } });
  const generatedReviews = await readJson(GENERATED_REVIEWS_PATH, {});
  const state = await readJson(STATE_PATH, {});
  state.reviewPosts = state.reviewPosts || {};
  const recs = state.tanpukuRecommendations || [];

  const reviewedRaces = (weekly.currentWeek?.races || []).filter(
    (race) => race.day === day && race.result?.winnerHorseName
  );

  for (const race of reviewedRaces) {
    const key = `${stage}:${race.raceId || race.courseId}`;
    if (state.reviewPosts[key]) continue;

    // Look up tanpuku recommendation for this race
    const winRec = recs.find(
      (r) => r.pickType === "win" && (r.courseId === race.courseId || r.raceLabel === race.label)
    );

    if (winRec && race.result?.top3HorseIds?.length > 0) {
      // Structured review for races with tanpuku recs
      const review = buildReviewPostPayload({
        race,
        winRec,
        simBestHorseId: null, // sim best not tracked in rec
      });
      if (review) {
        await publishOrQueuePost(key, review.text, review);
        state.reviewPosts[key] = new Date().toISOString();
        continue;
      }
    }

    // Fallback to generated review xPostText
    const genReview = generatedReviews[reviewKeyForRace(race)];
    if (genReview?.xPostText) {
      await publishOrQueuePost(key, genReview.xPostText);
      state.reviewPosts[key] = new Date().toISOString();
    }
  }

  state.lastResultReviewRun = state.lastResultReviewRun || {};
  state.lastResultReviewRun[stage] = new Date().toISOString();
  await writeJson(STATE_PATH, state);
}

async function handleTraining(stage) {
  await runNodeScript("scripts/weekly-keiba-update.mjs", ["--force"]);
  const trainingRaw = await fs.readFile(path.join(ROOT, "lib", "generatedTrainingData.ts"), "utf8");
  const updatedAt = trainingRaw.match(/TRAINING_DATA_GENERATED_AT = "(.*?)"/)?.[1] || "";
  const label = stage === "wed_12" ? "水曜" : "木曜";
  await publishOrQueuePost(stage, `${label}12時点の調教データ更新を実行しました。(generatedAt=${updatedAt})`);
}

async function handleFieldConfirmed() {
  const state = await readJson(STATE_PATH, {});
  state.fieldConfirmedAt = new Date().toISOString();
  await writeJson(STATE_PATH, state);
  await publishOrQueuePost("thu_15", "木曜時点の出馬表更新を記録しました。");
}

async function handleDrawConfirmed() {
  await runNodeScript("scripts/refresh-weekly-races.mjs");
  await runNodeScript("scripts/weekly-keiba-update.mjs", ["--force"]);
  await runNodeScript("scripts/daily-entry-check.mjs");
  await runNodeScript("scripts/sync-race-schedule.mjs");

  const state = await readJson(STATE_PATH, {});
  state.drawConfirmedAt = new Date().toISOString();
  await writeJson(STATE_PATH, state);
  await publishOrQueuePost("fri_10", "金曜の出馬表更新を実行し、枠順と人気値を最新化しました。");
}

async function handleRecommendation(day, stage) {
  const now = jstNow();
  const weekly = await readJson(WEEKLY_RACES_PATH, { currentWeek: { races: [] } });
  const state = await readJson(STATE_PATH, {});
  const includeBodyWeight = day === "Sat";
  // Fail-safe: even if fri_10 job is missed once, enable draw impact after Friday 10:00 JST.
  const applyDraw = Boolean(state.drawConfirmedAt) || isAfterFri10Jst(now);
  if (applyDraw && !state.drawConfirmedAt) {
    state.drawConfirmedAt = now.toISOString();
    await writeJson(STATE_PATH, state);
  }
  const best = pickBestHorse(weekly.currentWeek?.races || [], day, includeBodyWeight, applyDraw);

  if (!best) {
    console.log(`No target race for ${day}, skip posting.`);
    return;
  }

  const race = best.race;
  const horse = best.horse;
  const undervalued = listUndervaluedHorsesInRace(race, includeBodyWeight, applyDraw);
  const overvalued = listOvervaluedHorsesInRace(race, includeBodyWeight, applyDraw);
  const tanpuku = pickSharedTanpukuPair(race, includeBodyWeight, applyDraw);

  const overvaluedText = buildPackedOvervaluedText(day, overvalued);
  await publishOrQueuePost(`${stage}_overvalued`, overvaluedText);

  if (tanpuku) {
    const preRace = buildPreRacePostPayload({ day, race, tanpukuPair: tanpuku, simBestHorse: best });
    await publishOrQueuePost(`${stage}_pre_race`, preRace.text, preRace);

    const winPick = tanpuku.winPick;
    const valuePick = tanpuku.valuePick;

    const weekOf = weekly.currentWeek?.weekOf || isoDate(startOfWeekMonday(jstNow()));
    state.tanpukuRecommendations = state.tanpukuRecommendations || [];
    state.tanpukuRecommendations.push({
      weekOf,
      day,
      stage,
      postedAt: new Date().toISOString(),
      predictionOrigin: "saved_live",
      scoringVersion: DEFAULT_SCORING_VERSION,
      courseId: race.courseId,
      raceLabel: race.label,
      pickType: "win",
      horseId: winPick.horse.id,
      horseName: winPick.horse.name,
      realOdds: Number(winPick.horse.realOdds ?? 0),
      placeOdds: Number(winPick.placeOdds),
      winProb: Number(winPick.winProb),
      placeProb: Number(winPick.placeProb),
      placeScore: Number(winPick.placeScore),
      valueScore: Number(winPick.valueScore),
      selectionReason: String(winPick.selectionReason ?? ""),
      scoreGap: Number(winPick.scoreGap ?? 0),
      runnerUpHorseId: tanpuku.winRunnerUp?.horseId ?? null,
      runnerUpHorseName: tanpuku.winRunnerUp?.horseName ?? null,
      runnerUpPlaceScore: tanpuku.winRunnerUp?.placeScore ?? null,
      runnerUpPlaceProb: tanpuku.winRunnerUp?.placeProb ?? null,
      overbetLabel: winPick.overbetLabel ?? null,
      settlementStatus: "pending_result",
      tanOutcome: "not_settled",
      fukuOutcome: "not_settled",
      actualWinnerHorseId: null,
      actualTop3HorseIds: [],
      tanPayoutSource: "missing",
      fukuPayoutSource: "missing",
      resolved: false,
    });
    if (valuePick) {
      state.tanpukuRecommendations.push({
        weekOf,
        day,
        stage,
        postedAt: new Date().toISOString(),
        predictionOrigin: "saved_live",
        scoringVersion: DEFAULT_SCORING_VERSION,
        courseId: race.courseId,
        raceLabel: race.label,
        pickType: "value",
        horseId: valuePick.horse.id,
        horseName: valuePick.horse.name,
        realOdds: Number(valuePick.horse.realOdds ?? 0),
        placeOdds: Number(valuePick.placeOdds),
        winProb: Number(valuePick.winProb),
        placeProb: Number(valuePick.placeProb),
        placeScore: Number(valuePick.placeScore),
        valueScore: Number(valuePick.valueScore),
        selectionReason: String(valuePick.selectionReason ?? ""),
        scoreGap: Number(valuePick.scoreGap ?? 0),
        runnerUpHorseId: tanpuku.valueRunnerUp?.horseId ?? null,
        runnerUpHorseName: tanpuku.valueRunnerUp?.horseName ?? null,
        runnerUpPlaceScore: tanpuku.valueRunnerUp?.placeScore ?? null,
        runnerUpPlaceProb: tanpuku.valueRunnerUp?.placeProb ?? null,
        overbetLabel: valuePick.overbetLabel ?? null,
        settlementStatus: "pending_result",
        tanOutcome: "not_settled",
        fukuOutcome: "not_settled",
        actualWinnerHorseId: null,
        actualTop3HorseIds: [],
        tanPayoutSource: "missing",
        fukuPayoutSource: "missing",
        resolved: false,
      });
    }
    await writeJson(STATE_PATH, state);
  }
}

async function handleSundaySettle() {
  const weekly = await readJson(WEEKLY_RACES_PATH, { currentWeek: { weekOf: isoDate(startOfWeekMonday(jstNow())), races: [] } });
  const state = await readJson(STATE_PATH, {});
  const weekOf = weekly.currentWeek?.weekOf || isoDate(startOfWeekMonday(jstNow()));
  ensurePerf(state, weekOf);

  const recs = state.tanpukuRecommendations || [];
  const unresolved = recs.filter((r) => r.weekOf === weekOf && !r.resolved);

  for (const rec of unresolved) {
    const race = (weekly.currentWeek?.races || []).find((r) => r.courseId === rec.courseId && r.label === rec.raceLabel);
    if (!race) continue;

    const result = race.result;
    const winnerId = result?.winnerHorseId ? String(result.winnerHorseId) : "";
    const top3 = Array.isArray(result?.top3HorseIds) ? result.top3HorseIds.map((id) => String(id)) : [];
    rec.actualWinnerHorseId = winnerId || null;
    rec.actualTop3HorseIds = top3;

    if (!result || !winnerId || top3.length === 0) {
      rec.settlementStatus = "pending_result";
      rec.tanOutcome = "not_settled";
      rec.fukuOutcome = "not_settled";
      rec.tanPayout = 0;
      rec.fukuPayout = 0;
      rec.tanPayoutSource = "missing";
      rec.fukuPayoutSource = "missing";
      rec.resolved = false;
      continue;
    }

    const tanHit = winnerId === String(rec.horseId);
    const fukuHit = top3.includes(String(rec.horseId));
    const tanStake = 100;
    const fukuStake = 100;

    const hasTanshoTable = hasOfficialPayoutTable(result?.payouts?.tansho);
    const hasFukushoTable = hasOfficialPayoutTable(result?.payouts?.fukusho);
    const officialTanPayout = tanHit ? getOfficialTanshoPayoutForHorse(race, rec.horseId) : 0;
    const officialFukuPayout = fukuHit ? getOfficialFukushoPayoutForHorse(race, rec.horseId) : 0;

    const tanOutcome =
      tanHit
        ? officialTanPayout !== null
          ? "hit"
          : "hit_missing_payout"
        : "miss";
    const fukuOutcome =
      fukuHit
        ? officialFukuPayout !== null
          ? "hit"
          : "hit_missing_payout"
        : "miss";

    const tanPayout = tanHit && officialTanPayout !== null ? officialTanPayout : 0;
    const fukuPayout = fukuHit && officialFukuPayout !== null ? officialFukuPayout : 0;
    const tanPayoutSource = hasTanshoTable ? "official" : "missing";
    const fukuPayoutSource = hasFukushoTable ? "official" : "missing";
    const settlementStatus =
      !hasTanshoTable ||
      !hasFukushoTable ||
      (tanHit && officialTanPayout === null) ||
      (fukuHit && officialFukuPayout === null)
        ? "pending_payouts"
        : "settled";

    rec.settlementStatus = settlementStatus;
    rec.tanOutcome = tanOutcome;
    rec.fukuOutcome = fukuOutcome;
    rec.tanPayout = tanPayout;
    rec.fukuPayout = fukuPayout;
    rec.tanPayoutSource = tanPayoutSource;
    rec.fukuPayoutSource = fukuPayoutSource;

    if (settlementStatus !== "settled") {
      rec.resolved = false;
      continue;
    }

    state.performance.weekly.bets += 1;
    state.performance.weekly.tanHits += tanHit ? 1 : 0;
    state.performance.weekly.fukuHits += fukuHit ? 1 : 0;
    state.performance.weekly.tanStake += tanStake;
    state.performance.weekly.tanPayout += tanPayout;
    state.performance.weekly.fukuStake += fukuStake;
    state.performance.weekly.fukuPayout += fukuPayout;

    state.performance.total.bets += 1;
    state.performance.total.tanHits += tanHit ? 1 : 0;
    state.performance.total.fukuHits += fukuHit ? 1 : 0;
    state.performance.total.tanStake += tanStake;
    state.performance.total.tanPayout += tanPayout;
    state.performance.total.fukuStake += fukuStake;
    state.performance.total.fukuPayout += fukuPayout;

    rec.resolved = true;
    rec.settledAt = new Date().toISOString();
    rec.tanHit = tanHit;
    rec.fukuHit = fukuHit;
  }

  state.performance.updatedAt = new Date().toISOString();
  await writeJson(STATE_PATH, state);

  const summary = buildWeeklySummaryPostPayload({
    weeklyPerf: state.performance.weekly,
    recs,
    weekOf,
  });
  await publishOrQueuePost("sun_16", summary.text, summary);
}

async function main() {
  const now = jstNow();
  const stage = ARG_STAGE || (AUTO ? detectStageFromJst(now) : null);
  if (!stage) {
    console.log("No matching stage.");
    return;
  }

  switch (stage) {
    case "mon_10":
      await handleMonday10(now);
      break;
    case "sun_09":
      await handleNextDayReview("Sat", stage);
      break;
    case "mon_09":
      await handleNextDayReview("Sun", stage);
      break;
    case "wed_12":
    case "thu_12":
      await handleTraining(stage);
      break;
    case "thu_15":
      await handleFieldConfirmed();
      break;
    case "fri_10":
      await handleDrawConfirmed();
      break;
    case "sat_15":
      await handleRecommendation("Sat", stage);
      break;
    case "sun_15":
      await handleRecommendation("Sun", stage);
      break;
    case "sun_16":
      await handleSundaySettle();
      break;
    default:
      console.log(`Unknown stage: ${stage}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});




