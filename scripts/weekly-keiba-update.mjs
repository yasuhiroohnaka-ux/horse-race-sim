import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const FORCE = process.argv.includes("--force");

const JST_NOW = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
const JST_DAY = JST_NOW.getDay(); // 0=Sun, 3=Wed, 4=Thu
const IS_WED_THU = JST_DAY === 3 || JST_DAY === 4;
const CURRENT_YEAR = JST_NOW.getFullYear();

const NEWS_DOMAINS = [
  "news.yahoo.co.jp",
  "sponichi.co.jp",
  "nikkansports.com",
  "netkeiba.com",
  "hochi.news",
  "sanspo.com",
  "daily.co.jp",
  "x.com",
  "twitter.com",
];

const POSITIVE_WORDS = [
  "好調",
  "上昇",
  "抜群",
  "鋭い",
  "軽快",
  "順調",
  "手応え",
  "評価",
  "先着",
  "併入",
  "動き良",
];

const NEGATIVE_WORDS = [
  "不安",
  "重い",
  "鈍い",
  "遅れ",
  "反応悪",
  "物足りない",
  "平凡",
  "不調",
];

const HORSE_WATCHLIST = [
  { courseId: "nakayama-turf-1800", horseId: "1", horseName: "レーベンスティール" },
  { courseId: "nakayama-turf-1800", horseId: "2", horseName: "エコロヴァルツ" },
  { courseId: "nakayama-turf-1800", horseId: "3", horseName: "チェルヴィニア" },
  { courseId: "nakayama-turf-1200", horseId: "3", horseName: "ルガル" },
  { courseId: "nakayama-turf-1200", horseId: "4", horseName: "インビンシブルパパ" },
  { courseId: "nakayama-turf-1200", horseId: "9", horseName: "ビッグシーザー" },
  { courseId: "hanshin-turf-1600", horseId: "1", horseName: "アランカール" },
  { courseId: "hanshin-turf-1600", horseId: "2", horseName: "タイセイボーグ" }
];

const WATCHED_JOCKEYS = ["C.ルメール", "川田将雅", "戸崎圭太", "坂井瑠星", "丹内祐次"];
const WATCHED_TRAINERS = ["福永祐一", "矢作芳人", "斉藤崇史", "上村洋行"];

const BASE_JOCKEY_RATES = {
  "C.ルメール": 25.2,
  "川田将雅": 24.8,
  "戸崎圭太": 15.8,
  "坂井瑠星": 14.9,
  "丹内祐次": 14.5,
};

const BASE_TRAINER_RATES = {
  "福永祐一": 22.9,
  "矢作芳人": 20.9,
  "斉藤崇史": 18.8,
  "上村洋行": 15.8,
};

const BASE_TRAINING_INSIGHTS = [
  {
    courseId: "nakayama-turf-1800",
    horseId: "1",
    score: 2,
    note: "Strong final split and explicit positive tone.",
    source: "https://www.sponichi.co.jp/gamble/news/2026/02/26/kiji/20260225s00004048348000c.html",
    publishedAt: "2026-02-26",
    channel: "news",
  },
  {
    courseId: "nakayama-turf-1800",
    horseId: "2",
    score: 1,
    note: "Commented as improved movement after prior stiffness.",
    source: "https://www.sponichi.co.jp/gamble/news/2026/02/26/kiji/20260225s00004048351000c.html",
    publishedAt: "2026-02-26",
    channel: "news",
  },
  {
    courseId: "nakayama-turf-1200",
    horseId: "3",
    score: 2,
    note: "Headlined as very sharp work and high readiness.",
    source: "https://www.sponichi.co.jp/gamble/news/2026/02/26/kiji/20260225s00004048356000c.html",
    publishedAt: "2026-02-26",
    channel: "news",
  },
  {
    courseId: "hanshin-turf-1600",
    horseId: "1",
    score: 2,
    note: "Workout article highlights very good finishing response.",
    source: "https://www.sponichi.co.jp/gamble/news/2026/02/26/kiji/20260225s00004048339000c.html",
    publishedAt: "2026-02-26",
    channel: "news",
  }
];

function countHits(text, words) {
  return words.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseRateNearName(html, name) {
  const idx = html.indexOf(name);
  if (idx < 0) return null;
  const chunk = html.slice(Math.max(0, idx - 450), idx + 950);
  const matches = [...chunk.matchAll(/(\d{1,2}\.\d)\s*%/g)];
  if (matches.length === 0) return null;
  return Number(matches[0][1]);
}

function decodeGoogleNewsUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (!u.hostname.includes("news.google.com")) return rawUrl;
    const target = u.searchParams.get("url");
    return target || rawUrl;
  } catch {
    return rawUrl;
  }
}

function parseRssItems(xml) {
  const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  return itemBlocks.map((block) => {
    const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || block.match(/<title>(.*?)<\/title>/)?.[1] || "").trim();
    const linkRaw = (block.match(/<link>(.*?)<\/link>/)?.[1] || "").trim();
    const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "").trim();
    const description =
      (block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] ||
        block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ||
        "").trim();

    return {
      title,
      link: decodeGoogleNewsUrl(linkRaw),
      pubDate,
      description,
    };
  });
}

function isWedOrThuJst(dateString) {
  if (!dateString) return false;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return false;
  const jstDate = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const d = jstDate.getDay();
  return d === 3 || d === 4;
}

function domainAllowed(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return NEWS_DOMAINS.some((domain) => host.endsWith(domain));
  } catch {
    return false;
  }
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "horse-race-sim-bot/1.0",
      accept: "text/html,application/xml,text/xml,*/*",
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status}: ${url}`);
  }
  return await res.text();
}

async function updateNetkeibaData() {
  const jockeyUrl = `https://db.netkeiba.com/jockey/jockey_leading_jra.html?year=${CURRENT_YEAR}`;
  const trainerUrl = `https://db.netkeiba.com/trainer/trainer_leading_jra.html?year=${CURRENT_YEAR}`;
  const [jockeyHtml, trainerHtml] = await Promise.all([fetchText(jockeyUrl), fetchText(trainerUrl)]);

  const jockeyRates = { ...BASE_JOCKEY_RATES };
  for (const name of WATCHED_JOCKEYS) {
    const rate = parseRateNearName(jockeyHtml, name);
    if (typeof rate === "number") jockeyRates[name] = rate;
  }

  const trainerRates = { ...BASE_TRAINER_RATES };
  for (const name of WATCHED_TRAINERS) {
    const rate = parseRateNearName(trainerHtml, name);
    if (typeof rate === "number") trainerRates[name] = rate;
  }

  const content = `// Auto-generated by scripts/weekly-keiba-update.mjs\n// Do not edit manually.\n\nexport const NETKEIBA_DATA_GENERATED_AT = ${JSON.stringify(new Date().toISOString())};\n\nexport const JOCKEY_WIN_RATE: Record<string, number> = ${JSON.stringify(jockeyRates, null, 2)};\n\nexport const TRAINER_WIN_RATE: Record<string, number> = ${JSON.stringify(trainerRates, null, 2)};\n`;

  await fs.writeFile(path.join(ROOT, "lib", "generatedNetkeibaData.ts"), content, "utf8");
}

async function scoreLatestTrainingByHorse(horseName) {
  const query = `${horseName} 調教 競馬`;
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`;
  const xml = await fetchText(rssUrl);
  const items = parseRssItems(xml)
    .filter((item) => item.title && item.link)
    .filter((item) => domainAllowed(item.link))
    .filter((item) => isWedOrThuJst(item.pubDate))
    .filter((item) => item.title.includes("調教") || item.title.includes("追い切り") || item.description.includes("調教"));

  if (items.length === 0) return null;
  const target = items[0];

  let bodyText = `${target.title} ${target.description}`;
  try {
    const articleHtml = await fetchText(target.link);
    bodyText += ` ${articleHtml.slice(0, 6000)}`;
  } catch {
    // keep RSS-only mode
  }

  const pos = countHits(bodyText, POSITIVE_WORDS);
  const neg = countHits(bodyText, NEGATIVE_WORDS);
  const score = clamp(pos - neg, -3, 3);
  if (score === 0) return null;

  return {
    score,
    source: target.link,
    publishedAt: new Date(target.pubDate).toISOString().slice(0, 10),
    channel: target.link.includes("x.com") || target.link.includes("twitter.com") ? "x" : "news",
    note: `Auto-scored from Wed/Thu article keywords (pos:${pos}, neg:${neg})`,
  };
}

async function updateTrainingData() {
  const insightMap = new Map(BASE_TRAINING_INSIGHTS.map((item) => [`${item.courseId}:${item.horseId}`, item]));

  for (const horse of HORSE_WATCHLIST) {
    try {
      const scored = await scoreLatestTrainingByHorse(horse.horseName);
      if (!scored) continue;
      insightMap.set(`${horse.courseId}:${horse.horseId}`, {
        courseId: horse.courseId,
        horseId: horse.horseId,
        ...scored,
      });
    } catch (error) {
      console.warn(`[training] ${horse.horseName}: ${error.message}`);
    }
  }

  const insights = [...insightMap.values()];
  const content = `// Auto-generated by scripts/weekly-keiba-update.mjs\n// Do not edit manually.\n\nimport type { TrainingInsight } from "./trainingInsights";\n\nexport const TRAINING_DATA_GENERATED_AT = ${JSON.stringify(new Date().toISOString())};\n\nexport const GENERATED_TRAINING_INSIGHTS: TrainingInsight[] = ${JSON.stringify(insights, null, 2)};\n\nexport const GENERATED_X_TRAINING_OVERRIDES: TrainingInsight[] = [];\n`;

  await fs.writeFile(path.join(ROOT, "lib", "generatedTrainingData.ts"), content, "utf8");
}

async function main() {
  if (!IS_WED_THU && !FORCE) {
    console.log("Skip update: today is not Wednesday/Thursday in JST. Use --force to override.");
    return;
  }

  await updateNetkeibaData();
  await updateTrainingData();
  console.log("Weekly keiba update completed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
