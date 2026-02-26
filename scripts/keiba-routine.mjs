import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();

const ARG_STAGE = process.argv.find((arg) => arg.startsWith("--stage="))?.split("=")[1];
const AUTO = process.argv.includes("--auto");

const WEEKLY_RACES_PATH = path.join(ROOT, "data", "weekly-races.json");
const STATE_PATH = path.join(ROOT, "data", "routine-state.json");
const PENDING_POSTS_PATH = path.join(ROOT, "data", "pending-posts.jsonl");

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
  if (day === 1 && hour === 10) return "mon_10";
  if (day === 3 && hour === 12) return "wed_12";
  if (day === 4 && hour === 12) return "thu_12";
  if (day === 4 && hour === 15) return "thu_15";
  if (day === 5 && hour === 10) return "fri_10";
  if (day === 6 && hour === 15) return "sat_15";
  if (day === 0 && hour === 15) return "sun_15";
  return null;
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
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function publishOrQueuePost(stage, text) {
  const payload = {
    stage,
    text,
    postedAt: new Date().toISOString(),
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

function computePaceModifier(race) {
  const front = race.horses.filter((h) => h.runningStyle === "Nige" || h.runningStyle === "Senko").length;
  const ratio = front / Math.max(race.horses.length, 1);
  return ratio - 0.45;
}

function scoreHorse(horse, race, includeBodyWeight = false) {
  const ability = horse.speed * 0.35 + horse.stamina * 0.25 + horse.power * 0.2 + horse.guts * 0.2;
  const popularity = horse.predictionCount;
  const simWinProxy = horse.realOdds > 0 ? 100 / horse.realOdds : 0;
  const pace = computePaceModifier(race);
  const isFront = horse.runningStyle === "Nige" || horse.runningStyle === "Senko";
  const paceAdvantage = isFront ? -pace * 10 : pace * 10;
  const bodyWeightBonus = includeBodyWeight ? Number(horse.bodyWeightDiff ?? 0) * -0.3 : 0;
  return ability + popularity * 0.15 + simWinProxy * 0.35 + paceAdvantage + bodyWeightBonus;
}

function pickBestHorse(races, day, includeBodyWeight = false) {
  const candidates = races.filter((race) => race.day === day && race.hasRace);
  if (candidates.length === 0) return null;

  let best = null;
  for (const race of candidates) {
    for (const horse of race.horses) {
      const score = scoreHorse(horse, race, includeBodyWeight);
      if (!best || score > best.score) {
        best = { race, horse, score };
      }
    }
  }
  return best;
}

function listUndervaluedHorsesInRace(race, includeBodyWeight = false) {
  const scored = race.horses.map((horse) => ({
    horse,
    score: scoreHorse(horse, race, includeBodyWeight),
  }));
  const scoreRank = new Map(
    [...scored]
      .sort((a, b) => b.score - a.score)
      .map((x, idx) => [x.horse.id, idx + 1])
  );
  const popRank = new Map(
    [...race.horses]
      .sort((a, b) => (b.predictionCount ?? 0) - (a.predictionCount ?? 0))
      .map((x, idx) => [x.id, idx + 1])
  );

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

async function handleMonday10(now) {
  const weekly = await readJson(WEEKLY_RACES_PATH, { currentWeek: { weekOf: isoDate(startOfWeekMonday(now)), races: [] }, archives: [] });
  const state = await readJson(STATE_PATH, {});

  if (weekly.currentWeek?.races?.length) {
    weekly.archives = weekly.archives || [];
    weekly.archives.unshift({
      archivedAt: new Date().toISOString(),
      ...weekly.currentWeek,
    });
    weekly.archives = weekly.archives.slice(0, 24);
  }

  weekly.currentWeek = {
    weekOf: isoDate(startOfWeekMonday(now)),
    races: weekly.currentWeek?.races || [],
  };

  await writeJson(WEEKLY_RACES_PATH, weekly);
  await runNodeScript("scripts/sync-race-schedule.mjs");
  await runNodeScript("scripts/weekly-keiba-update.mjs", ["--force"]);
  await runNodeScript("scripts/update-race-volatility.mjs");

  state.lastMondayRollover = new Date().toISOString();
  await writeJson(STATE_PATH, state);

  await publishOrQueuePost("mon_10", "今週の重賞登録馬データへ切替。先週重賞はアーカイブ化し、初期指標と荒れやすさスコアを更新しました。");
}

async function handleTraining(stage) {
  await runNodeScript("scripts/weekly-keiba-update.mjs", ["--force"]);
  const trainingRaw = await fs.readFile(path.join(ROOT, "lib", "generatedTrainingData.ts"), "utf8");
  const updatedAt = trainingRaw.match(/TRAINING_DATA_GENERATED_AT = "(.*?)"/)?.[1] || "";
  const label = stage === "wed_12" ? "水曜" : "木曜";
  await publishOrQueuePost(stage, `${label}12時の調教評価を更新しました。generatedAt=${updatedAt}`);
}

async function handleFieldConfirmed() {
  const state = await readJson(STATE_PATH, {});
  state.fieldConfirmedAt = new Date().toISOString();
  await writeJson(STATE_PATH, state);
  await publishOrQueuePost("thu_15", "木曜15時: 出走馬確定フェーズを反映しました。");
}

async function handleDrawConfirmed() {
  const state = await readJson(STATE_PATH, {});
  state.drawConfirmedAt = new Date().toISOString();
  await writeJson(STATE_PATH, state);
  await publishOrQueuePost("fri_10", "金曜10時: 枠順確定フェーズを反映しました。");
}

async function handleRecommendation(day, stage) {
  const weekly = await readJson(WEEKLY_RACES_PATH, { currentWeek: { races: [] } });
  const includeBodyWeight = day === "Sat";
  const best = pickBestHorse(weekly.currentWeek?.races || [], day, includeBodyWeight);

  if (!best) {
    console.log(`No graded race for ${day}, skip posting.`);
    return;
  }

  const race = best.race;
  const horse = best.horse;
  const undervalued = listUndervaluedHorsesInRace(race, includeBodyWeight);
  const undervaluedText =
    undervalued.length > 0
      ? undervalued
          .map((x) => `${x.horse.name}(人気${x.horse.predictionCount}, 想定${x.horse.realOdds}倍, ギャップ+${x.gap})`)
          .join("、")
      : "該当なし";
  await publishOrQueuePost(
    stage,
    `${day}重賞おすすめ: ${horse.name} (${race.label}) / score=${best.score.toFixed(1)} / 人気=${horse.predictionCount} / 想定オッズ=${horse.realOdds}\n過小評価馬(全頭): ${undervaluedText}`
  );
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
    default:
      console.log(`Unknown stage: ${stage}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
