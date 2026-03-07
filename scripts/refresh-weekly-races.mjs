import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const WEEKLY_RACES_PATH = path.join(ROOT, "data", "weekly-races.json");

const TRACK_CODE_TO_VENUE = {
  "01": { key: "sapporo", label: "札幌" },
  "02": { key: "hakodate", label: "函館" },
  "03": { key: "fukushima", label: "福島" },
  "04": { key: "niigata", label: "新潟" },
  "05": { key: "tokyo", label: "東京" },
  "06": { key: "nakayama", label: "中山" },
  "07": { key: "chukyo", label: "中京" },
  "08": { key: "kyoto", label: "京都" },
  "09": { key: "hanshin", label: "阪神" },
  "10": { key: "kokura", label: "小倉" }
};

const STRAIGHT_LENGTH_BY_TRACK = {
  sapporo: { Turf: 266.1, Dirt: 264.3 },
  hakodate: { Turf: 262.1, Dirt: 260.3 },
  fukushima: { Turf: 292.0, Dirt: 295.7 },
  niigata: { Turf: 358.7, Dirt: 353.9 },
  tokyo: { Turf: 525.9, Dirt: 501.6 },
  nakayama: { Turf: 310.0, Dirt: 308.0 },
  chukyo: { Turf: 412.5, Dirt: 410.7 },
  kyoto: { Turf: 403.7, Dirt: 329.1 },
  hanshin: { Turf: 473.6, Dirt: 352.7 },
  kokura: { Turf: 293.0, Dirt: 291.0 }
};

const SURFACE_LABEL_TO_KEY = {
  芝: "Turf",
  ダ: "Dirt",
  ダート: "Dirt"
};

const GRADE_MAP = {
  GI: "G1",
  GII: "G2",
  GIII: "G3"
};

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

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function decodeHtmlText(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value) {
  return String(value ?? "").replace(/<[^>]*>/g, " ");
}

function normalizeSpace(value) {
  return decodeHtmlText(stripTags(value)).replace(/\s+/g, " ").trim();
}

function normalizeName(value) {
  return normalizeSpace(value).toLowerCase().replace(/[\s　・･\-_.]/g, "");
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "horse-race-sim-bot/2.0",
      accept: "text/html,application/xml,text/xml,*/*"
    },
    cache: "no-store"
  });
  if (!res.ok) {
    throw new Error(`fetch failed ${res.status}: ${url}`);
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "";
  const latin1Head = Buffer.from(bytes.slice(0, 4096)).toString("latin1");
  const charsetRaw =
    contentType.match(/charset=([^;]+)/i)?.[1]?.trim() ||
    latin1Head.match(/charset=["']?([a-zA-Z0-9._-]+)/i)?.[1] ||
    "utf-8";
  const charset = charsetRaw.toLowerCase() === "x-euc-jp" ? "euc-jp" : charsetRaw.toLowerCase();

  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function parseGrade(shutubaHtml) {
  const title = normalizeSpace(shutubaHtml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "").toUpperCase();
  if (title.includes("(G1)")) return "G1";
  if (title.includes("(G2)")) return "G2";
  if (title.includes("(G3)")) return "G3";
  const iconRaw = shutubaHtml.match(/Icon_GradeType[^>]*>([^<]+)</i)?.[1] ?? "";
  const icon = normalizeSpace(iconRaw).toUpperCase();
  if (GRADE_MAP[icon]) return GRADE_MAP[icon];
  return null;
}

function raceDateFromSeed(seed) {
  return new Date(`${seed.dateIso}T00:00:00+09:00`);
}

function dayLabelFromDate(dateIso) {
  const date = new Date(`${dateIso}T00:00:00+09:00`);
  return date.getDay() === 0 ? "Sun" : "Sat";
}

function parseRaceMeta(raceId, shutubaHtml, dayLabel) {
  const venue = TRACK_CODE_TO_VENUE[raceId.slice(4, 6)];
  if (!venue) return null;

  const label = normalizeSpace(shutubaHtml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "").split("|")[0];
  const cleanedLabel = label.replace(/\(G[123]\)/i, "").trim();
  const grade = parseGrade(shutubaHtml);
  if (!cleanedLabel || !grade) return null;

  const raceData = normalizeSpace(shutubaHtml.match(/class="RaceData01"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "");
  const raceNo = Number.parseInt(raceId.slice(-2), 10);
  const surfaceLabel = raceData.match(/(芝|ダート|ダ)\s*(\d{3,4})m/i)?.[1] ?? "";
  const distance = Number.parseInt(raceData.match(/(?:芝|ダート|ダ)\s*(\d{3,4})m/i)?.[1] ?? "", 10);
  const surface = SURFACE_LABEL_TO_KEY[surfaceLabel] ?? null;
  if (!(distance > 0) || !surface) return null;

  const straightLength = STRAIGHT_LENGTH_BY_TRACK[venue.key]?.[surface] ?? 360;
  const hashtag = `#${cleanedLabel.replace(/\s+/g, "")}`;
  const courseId = `${venue.key}-${surface.toLowerCase()}-${distance}-${raceId}`;

  return {
    courseId,
    raceId,
    label: cleanedLabel,
    grade,
    day: dayLabel,
    raceNumber: raceNo,
    venue: venue.label,
    venueKey: venue.key,
    surface,
    distance,
    straightLength,
    hashtag,
    hasRace: true
  };
}

function parseOdds(raw) {
  const cleaned = String(raw ?? "").replace(/,/g, "").replace(/\s+/g, "").trim();
  if (!cleaned || cleaned.includes("-") || /人気|\*/.test(cleaned)) return null;
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseHorseSeedEntries(shutubaHtml) {
  const rows = [...shutubaHtml.matchAll(/<tr[^>]*class="[^"]*HorseList[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  const entries = [];

  for (const row of rows) {
    const gateNumber = Number.parseInt(row.match(/class="Umaban\d+[^"]*"[^>]*>\s*(\d{1,2})\s*<\/td>/i)?.[1] ?? "", 10);
    if (!(gateNumber > 0)) continue;

    const horseUrl = row.match(/\/horse\/(\d+)\/?/i)?.[1] ?? "";
    const horseNameRaw = row.match(/title="([^"]+)"/i)?.[1] ?? row.match(/\/horse\/\d+\/?[^>]*>([^<]+)</i)?.[1] ?? "";
    const horseName = normalizeSpace(horseNameRaw);
    if (!horseName) continue;

    const jockey = normalizeSpace(
      row.match(/<td class="Jockey"[\s\S]*?title="([^"]+)"/i)?.[1] ??
      row.match(/<td class="Jockey"[\s\S]*?>([\s\S]*?)<\/td>/i)?.[1] ??
      ""
    );
    const trainer = normalizeSpace(
      row.match(/<td class="Trainer"[\s\S]*?title="([^"]+)"/i)?.[1] ??
      row.match(/<td class="Trainer"[\s\S]*?>([\s\S]*?)<\/td>/i)?.[1] ??
      ""
    );
    const sexLabel = row.match(/(牡|牝|セ)\s*\d/i)?.[1] ?? "牡";
    const sex = sexLabel === "牝" ? "F" : "M";
    const weight = Number.parseFloat(row.match(/class="Weight"[^>]*>\s*([0-9]{2}(?:\.[0-9])?)\s*<\/td>/i)?.[1] ?? "0");
    const odds = parseOdds(
      row.match(/id="odds-[^"]+"[^>]*>\s*([^<]+)\s*<\/span>/i)?.[1] ??
      row.match(/class="Txt_R Popular"[^>]*>\s*([^<]+)\s*</i)?.[1] ??
      ""
    );

    entries.push({
      id: horseUrl || String(gateNumber),
      name: horseName,
      gateNumber,
      jockey: jockey || "未定",
      trainer: trainer || undefined,
      sex,
      weight: Number.isFinite(weight) && weight > 0 ? weight : sex === "F" ? 55 : 57,
      marketOdds: odds
    });
  }

  return entries.sort((a, b) => a.gateNumber - b.gateNumber);
}

function parseOreproEntries(oreproHtml) {
  const rows = [...oreproHtml.matchAll(/<tr[^>]*class="[^"]*HorseList[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  const byName = new Map();

  for (const row of rows) {
    const horseNameRaw =
      row.match(/<dt class="Horse">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ??
      row.match(/title="([^"]+)"/i)?.[1] ??
      row.match(/\/horse\/\d+\/?[^>]*>([^<]+)</i)?.[1] ??
      "";
    const horseName = normalizeSpace(horseNameRaw);
    if (!horseName) continue;

    const popularCell = row.match(/<td class="Popular">([\s\S]*?)<\/td>/i)?.[1] ?? "";
    const voteBarCell = row.match(/<td class="Vote_Bar">([\s\S]*?)<\/td>/i)?.[1] ?? "";
    const odds = parseOdds(popularCell.match(/<span[^>]*>\s*(\d+(?:\.\d+)?)\s*<\/span>/i)?.[1] ?? "");
    const favoriteCount = Number.parseInt(voteBarCell.match(/<span>\s*(\d{1,5})\s*人<\/span>/i)?.[1] ?? "0", 10);
    byName.set(normalizeName(horseName), {
      odds,
      favoriteCount: Number.isFinite(favoriteCount) ? favoriteCount : 0,
    });
  }

  return byName;
}

function parseDistanceMeters(raw) {
  const distance = Number.parseInt(String(raw ?? "").match(/(\d{3,4})/)?.[1] ?? "", 10);
  return Number.isFinite(distance) && distance > 0 ? distance : null;
}

function parseRaceTimeSeconds(raw) {
  const match = String(raw ?? "").match(/(\d+):(\d{1,2}\.\d)/);
  if (!match) return null;
  const minutes = Number.parseInt(match[1], 10);
  const seconds = Number.parseFloat(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  return minutes * 60 + seconds;
}

function detectGradeLabel(iconRaw, raceNameRaw) {
  const icon = String(iconRaw ?? "").toUpperCase();
  if (icon.includes("GIII")) return "G3";
  if (icon.includes("GII")) return "G2";
  if (icon.includes("GI")) return "G1";

  const raceName = String(raceNameRaw ?? "");
  if (/(^|\s|\()(L)(\s|\)|$)/i.test(raceName)) return "L";
  if (/OP/i.test(raceName)) return "OP";
  if (/3\u52dd|3Win/i.test(raceName)) return "3Win";
  if (/2\u52dd|2Win/i.test(raceName)) return "2Win";
  if (/1\u52dd|1Win/i.test(raceName)) return "1Win";
  if (/\u672a\u52dd\u5229|\u65b0\u99ac|Maiden/i.test(raceName)) return "Maiden";
  return null;
}

function gradeLabelToScore(label) {
  if (!label) return null;
  switch (label) {
    case "G1":
      return 5;
    case "G2":
      return 4;
    case "G3":
      return 3;
    case "L":
      return 2.5;
    case "OP":
      return 2;
    case "3Win":
      return 1.5;
    case "2Win":
      return 1;
    case "1Win":
      return 0.5;
    case "Maiden":
      return 0;
    default:
      return null;
  }
}

function parseShutubaPastEntries(shutubaPastHtml) {
  const rows = [...String(shutubaPastHtml ?? "").matchAll(/<tr[^>]*class="[^"]*HorseList[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)].map(
    (m) => m[1]
  );
  const provisional = [];

  for (const row of rows) {
    const gateNumber = Number.parseInt(
      row.match(/<td class="Waku">\s*(\d{1,2})\s*<\/td>/i)?.[1] ??
        row.match(/class="Umaban\d+[^"]*"[^>]*>\s*(\d{1,2})\s*<\/td>/i)?.[1] ??
        "",
      10
    );
    if (!(gateNumber > 0)) continue;

    const horseNameRaw =
      row.match(/<div class="Horse02">[\s\S]*?<a[^>]*>\s*([^<]+?)\s*<\/a>/i)?.[1] ??
      row.match(/\/horse\/\d+\/?[^>]*>([^<]+)</i)?.[1] ??
      "";
    const horseName = normalizeSpace(horseNameRaw);
    if (!horseName) continue;

    const pastCells = [...row.matchAll(/<td class="Past[^"]*"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]).slice(0, 5);
    const runs = pastCells.map((cell) => {
      const finish = Number.parseInt(cell.match(/<span class="Num">(\d{1,2})<\/span>/i)?.[1] ?? "", 10);
      const raceName = normalizeSpace(cell.match(/<div class="Data02">([\s\S]*?)<\/div>/i)?.[1] ?? "");
      const iconRaw = normalizeSpace(cell.match(/<span class="Icon_GradeType[^"]*">([^<]+)<\/span>/i)?.[1] ?? "");
      const gradeLabel = detectGradeLabel(iconRaw, raceName);
      const data05Raw = normalizeSpace(cell.match(/<div class="Data05">([\s\S]*?)<\/div>/i)?.[1] ?? "");
      const distance = parseDistanceMeters(data05Raw);
      const timeSeconds = parseRaceTimeSeconds(data05Raw);
      const runSpeed = distance && timeSeconds ? distance / timeSeconds : null;

      return {
        finish: Number.isFinite(finish) && finish > 0 ? finish : null,
        gradeLabel,
        runSpeed
      };
    });

    const finishList = runs
      .map((run) => run.finish)
      .filter((finish) => Number.isFinite(finish) && finish > 0);
    const speedList = runs
      .map((run) => run.runSpeed)
      .filter((speed) => Number.isFinite(speed) && speed > 0);
    const avgFinish = finishList.length > 0 ? finishList.reduce((sum, value) => sum + value, 0) / finishList.length : null;
    const avgSpeed = speedList.length > 0 ? speedList.reduce((sum, value) => sum + value, 0) / speedList.length : null;
    const lastFinish = runs[0]?.finish ?? null;
    const lastRaceGradeLabel = runs[0]?.gradeLabel ?? null;
    const lastRaceGradeScore = gradeLabelToScore(lastRaceGradeLabel);

    let recentFormScore = null;
    if (avgFinish !== null || lastFinish !== null) {
      const avgScore = avgFinish !== null ? clamp((8 - avgFinish) * 0.9, -3.5, 3.5) : 0;
      const lastScore = lastFinish !== null ? clamp((7 - lastFinish) * 0.8, -2.5, 2.5) : 0;
      recentFormScore = Math.round(clamp(avgScore + lastScore, -5, 5) * 10) / 10;
    }

    provisional.push({
      gateNumber,
      horseName,
      recentFormScore,
      recentAverageFinish: avgFinish !== null ? Math.round(avgFinish * 10) / 10 : null,
      recentTimeIndex: null,
      lastRaceGradeScore: lastRaceGradeScore !== null ? Math.round(lastRaceGradeScore * 10) / 10 : null,
      lastRaceGradeLabel,
      averageRunSpeed: avgSpeed !== null ? Math.round(avgSpeed * 1000) / 1000 : null
    });
  }

  const speedValues = provisional
    .map((entry) => entry.averageRunSpeed)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (speedValues.length === 0) {
    return provisional;
  }

  const meanSpeed = speedValues.reduce((sum, value) => sum + value, 0) / speedValues.length;
  const variance =
    speedValues.reduce((sum, value) => {
      const diff = value - meanSpeed;
      return sum + diff * diff;
    }, 0) / speedValues.length;
  const safeStd = Math.max(Math.sqrt(Math.max(variance, 0)), 0.08);

  return provisional.map((entry) => {
    if (!Number.isFinite(entry.averageRunSpeed) || entry.averageRunSpeed <= 0) {
      return entry;
    }
    const z = (entry.averageRunSpeed - meanSpeed) / safeStd;
    return {
      ...entry,
      recentTimeIndex: Math.round(clamp(z * 2.2, -5, 5) * 10) / 10
    };
  });
}

function parseRssItems(xml) {
  const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  return itemBlocks.map((block) => ({
    link: (block.match(/<link>(.*?)<\/link>/)?.[1] ?? "").trim()
  }));
}

async function fetchXBuzzScore(horseName, raceLabel) {
  const query = `${horseName} ${raceLabel} x.com OR twitter.com`;
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`;

  try {
    const xml = await fetchText(rssUrl);
    const items = parseRssItems(xml).filter((item) => /x\.com|twitter\.com/i.test(item.link));
    return clamp(items.length * 4, 0, 20);
  } catch {
    return 0;
  }
}

function guessRunningStyle(seed) {
  const hash = hashText(seed) % 100;
  if (hash < 15) return "Nige";
  if (hash < 55) return "Senko";
  if (hash < 85) return "Sashi";
  return "Oikomi";
}

function marketOddsToPopularity(odds, xBuzzScore) {
  if (!(odds > 0)) {
    return clamp(Math.round(10 + xBuzzScore * 2), 1, 150);
  }
  const oddsScore = clamp(120 - Math.log10(Math.max(odds, 1.1)) * 54, 12, 120);
  return Math.round(clamp(oddsScore + xBuzzScore * 1.8, 1, 160));
}

function performanceToAbilityBase(pastEntry) {
  const averageFinish = Number(pastEntry?.recentAverageFinish);
  const averageFinishEdge =
    Number.isFinite(averageFinish) && averageFinish > 0 ? clamp(6.5 - averageFinish, -3, 3) : 0;

  return Math.round(
    clamp(
      70 +
        Number(pastEntry?.recentTimeIndex ?? 0) * 2.4 +
        Number(pastEntry?.recentFormScore ?? 0) * 1.8 +
        (Number(pastEntry?.lastRaceGradeScore ?? 2) - 2) * 2.2 +
        averageFinishEdge * 1.2,
      52,
      88
    )
  );
}

function buildAbilityStats(base, runningStyle, seed) {
  const hash = hashText(seed);
  const noise = (shift) => ((hash >> shift) % 5) - 2;
  const styleAdjust = {
    Nige: { speed: 4, stamina: -2, power: 2, guts: 1 },
    Senko: { speed: 2, stamina: 0, power: 1, guts: 1 },
    Sashi: { speed: -1, stamina: 3, power: 1, guts: 1 },
    Oikomi: { speed: -2, stamina: 4, power: 0, guts: 2 }
  }[runningStyle];

  return {
    speed: clamp(base + styleAdjust.speed + noise(0), 48, 98),
    stamina: clamp(base + styleAdjust.stamina + noise(3), 48, 98),
    power: clamp(base + styleAdjust.power + noise(6), 48, 98),
    guts: clamp(base + styleAdjust.guts + noise(9), 48, 98)
  };
}

function getRaceFriday1930(raceDate) {
  const d = new Date(raceDate);
  const offset = raceDate.getDay() === 6 ? -1 : -2;
  d.setDate(d.getDate() + offset);
  d.setHours(19, 30, 0, 0);
  return d;
}

function parseRaceSeedFromJraCname(cname) {
  const match = cname.match(/pw01dde01(\d{2})(\d{4})(\d{2})(\d{2})(\d{2})(\d{8})/);
  if (!match) return null;
  const [, trackCode, year, kai, day, raceNo, dateRaw] = match;
  const raceId = `${year}${trackCode}${kai}${day}${raceNo}`;
  const dateIso = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
  return { raceId, dateIso, dayLabel: dayLabelFromDate(dateIso) };
}

async function fetchCurrentWeekRaceSeeds() {
  const html = await fetchText("https://www.jra.go.jp/keiba/thisweek/");
  const cnames = [...html.matchAll(/accessD\.html\?CNAME=(pw01dde01[^"']+)/g)].map((m) => m[1]);
  const unique = new Map();

  for (const cname of cnames) {
    const seed = parseRaceSeedFromJraCname(cname);
    if (!seed) continue;
    if (!unique.has(seed.raceId)) {
      unique.set(seed.raceId, seed);
    }
  }

  return [...unique.values()].sort((a, b) => a.raceId.localeCompare(b.raceId));
}

async function buildRaceEntries(meta, shutubaHtml, shutubaPastHtml, raceDate) {
  const seeds = parseHorseSeedEntries(shutubaHtml);
  if (seeds.length === 0) return [];

  let oreproEntries = new Map();
  try {
    const oreproHtml = await fetchText(`https://orepro.netkeiba.com/bet/shutuba.html?race_id=${meta.raceId}`);
    oreproEntries = parseOreproEntries(oreproHtml);
  } catch {
    oreproEntries = new Map();
  }

  const pastEntries = parseShutubaPastEntries(shutubaPastHtml);
  const pastByGate = new Map(pastEntries.map((entry) => [entry.gateNumber, entry]));
  const pastByName = new Map(pastEntries.map((entry) => [normalizeName(entry.horseName), entry]));

  const xBuzzScores = new Map();
  await Promise.all(
    seeds.map(async (seed) => {
      const xBuzzScore = await fetchXBuzzScore(seed.name, meta.label);
      xBuzzScores.set(normalizeName(seed.name), xBuzzScore);
    })
  );

  const oddsSource = jstNow() >= getRaceFriday1930(raceDate) ? "official" : "forecast";

  return seeds.map((seed, index) => {
    const oreproEntry = oreproEntries.get(normalizeName(seed.name));
    const pastEntry = pastByGate.get(seed.gateNumber) ?? pastByName.get(normalizeName(seed.name));
    const favoriteCount = Number(oreproEntry?.favoriteCount ?? 0);
    const xBuzzScore = xBuzzScores.get(normalizeName(seed.name)) ?? 0;
    const currentOdds = oreproEntry?.odds ?? seed.marketOdds ?? 0;
    const popularityScore = marketOddsToPopularity(currentOdds, xBuzzScore);
    const runningStyle = guessRunningStyle(`${meta.raceId}:${seed.id}:${seed.name}`);
    // Ability seed comes from past performance only; market data is kept for the market layer.
    const abilityBase = performanceToAbilityBase(pastEntry);
    const ability = buildAbilityStats(abilityBase, runningStyle, `${meta.raceId}:${seed.id}:${seed.name}`);

    return {
      id: String(index + 1),
      externalHorseId: String(seed.id),
      name: seed.name,
      jockey: seed.jockey,
      trainer: seed.trainer,
      runningStyle,
      gateNumber: seed.gateNumber,
      sex: seed.sex,
      weight: seed.weight,
      favoriteCount,
      xBuzzScore,
      predictionCount: popularityScore,
      realOdds: currentOdds ?? 0,
      oddsSource,
      speed: ability.speed,
      stamina: ability.stamina,
      power: ability.power,
      guts: ability.guts,
      condition: 5,
      trainingScore: 0,
      recentFormScore: pastEntry?.recentFormScore ?? 0,
      recentAverageFinish: pastEntry?.recentAverageFinish ?? 0,
      recentTimeIndex: pastEntry?.recentTimeIndex ?? 0,
      lastRaceGradeScore: pastEntry?.lastRaceGradeScore ?? 2,
      lastRaceGradeLabel: pastEntry?.lastRaceGradeLabel ?? "OP"
    };
  });
}

async function buildRace(seed) {
  const shutubaHtml = await fetchText(`https://race.netkeiba.com/race/shutuba.html?race_id=${seed.raceId}`);
  const shutubaPastHtml = await fetchText(`https://race.netkeiba.com/race/shutuba_past.html?race_id=${seed.raceId}`);
  const meta = parseRaceMeta(seed.raceId, shutubaHtml, seed.dayLabel);
  if (!meta) return null;
  const raceDate = raceDateFromSeed(seed);
  const horses = await buildRaceEntries(meta, shutubaHtml, shutubaPastHtml, raceDate);
  if (horses.length === 0) return null;
  return {
    ...meta,
    oddsSource: horses.some((horse) => horse.oddsSource === "official") ? "official" : "forecast",
    horses: horses.sort((a, b) => a.gateNumber - b.gateNumber)
  };
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

async function main() {
  const now = jstNow();
  const weekOf = isoDate(startOfWeekMonday(now));
  const seeds = await fetchCurrentWeekRaceSeeds();
  const built = await Promise.all(seeds.map((seed) => buildRace(seed)));
  const races = built.filter(Boolean).sort((a, b) => a.raceId.localeCompare(b.raceId));

  if (races.length === 0) {
    throw new Error("No graded races found for current week; skip write to avoid wiping data.");
  }

  const prev = await readJson(WEEKLY_RACES_PATH, { currentWeek: null, archives: [] });
  const archives = Array.isArray(prev.archives) ? [...prev.archives] : [];

  if (prev.currentWeek?.weekOf && prev.currentWeek.weekOf !== weekOf && Array.isArray(prev.currentWeek.races) && prev.currentWeek.races.length > 0) {
    archives.unshift({
      archivedAt: new Date().toISOString(),
      ...prev.currentWeek
    });
  }

  const next = {
    currentWeek: {
      weekOf,
      updatedAt: new Date().toISOString(),
      races
    },
    archives: archives.slice(0, 24)
  };

  await fs.writeFile(WEEKLY_RACES_PATH, JSON.stringify(next, null, 2), "utf8");
  console.log(`[refresh-weekly-races] weekOf=${weekOf} races=${races.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});



