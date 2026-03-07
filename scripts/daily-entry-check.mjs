import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const WEEKLY_RACES_PATH = path.join(ROOT, "data", "weekly-races.json");
const DRAW_OVERRIDES_TS_PATH = path.join(ROOT, "lib", "generatedDrawOverrides.ts");

const WEIGHT_CORRECTIONS_BY_KEY = {};

const WEIGHT_CORRECTIONS_BY_NAME = {};

const RACE_LABEL_ALIASES = {};

const HORSE_NAME_ALIASES = {};

const NETKEIBA_WEIGHT_SOURCES = [
  {
    horseName: "Karamatianos",
    // netkeiba DB page that includes the horse row with weight.
    url: "https://db.netkeiba.com/horse/select.html?id=2014106201&mode=wn&type=sire&year=2024",
    rowKeyword: "繧ｫ繝ｩ繝槭ユ繧｣繧｢繝弱せ",
  },
];

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "horse-race-sim-bot/1.0",
      accept: "text/html,*/*",
    },
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

async function fetchNetkeibaWeightOverrides() {
  const out = {};
  for (const src of NETKEIBA_WEIGHT_SOURCES) {
    try {
      const html = await fetchText(src.url);
      const plain = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
      const rowStart = plain.indexOf(src.rowKeyword);
      if (rowStart < 0) continue;
      const rowChunk = plain.slice(rowStart, rowStart + 220);
      // Pattern: ... horseName ... <weight> 闃・600 / 繝1800 ...
      const m = rowChunk.match(/(\d{2})\s*(?:闃掟繝)\d{3,4}/);
      if (!m) continue;
      const w = Number(m[1]);
      if (Number.isFinite(w) && w >= 48 && w <= 62) {
        out[src.horseName] = w;
      }
    } catch (error) {
      console.warn(`[daily-entry-check] netkeiba weight fetch failed: ${src.horseName}: ${error.message}`);
    }
  }
  return out;
}

function normalizeName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[\\s縲繝ｻ\\-_.]/g, "");
}

function yyyymmddFromDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function dateForRaceDay(weekOfIso, day) {
  const base = new Date(`${weekOfIso}T00:00:00+09:00`);
  if (Number.isNaN(base.getTime())) return null;
  const offset = day === "Sat" ? 5 : day === "Sun" ? 6 : 0;
  const out = new Date(base);
  out.setDate(base.getDate() + offset);
  return out;
}

function decodeHtmlText(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractRaceIds(raceListHtml) {
  const ids = new Set();
  for (const m of raceListHtml.matchAll(/race\/shutuba\.html\?race_id=(\d{12})/g)) {
    ids.add(m[1]);
  }
  return [...ids];
}

function parseShutubaEntries(shutubaHtml) {
  const rows = [...shutubaHtml.matchAll(/<tr[^>]*class="[^"]*HorseList[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  const entries = [];
  for (const row of rows) {
    const frameNumber = Number(row.match(/class="Waku\d+[^"]*"[^>]*>\s*<span>\s*(\d{1,2})\s*<\/span>/i)?.[1] ?? 0);
    const gateNumber = Number(row.match(/class="Umaban\d+[^"]*"[^>]*>\s*(\d{1,2})\s*<\/td>/i)?.[1] ?? 0);
    if (!(frameNumber > 0) || !(gateNumber > 0)) continue;
    const horseNameRaw =
      row.match(/title="([^"]+)"/i)?.[1] ||
      row.match(/\/horse\/\d+\/[^>]*>([^<]+)</i)?.[1] ||
      "";
    const horseName = decodeHtmlText(horseNameRaw).trim();
    if (!horseName) continue;
    entries.push({
      horseName,
      frameNumber,
      gateNumber, // 鬥ｬ逡ｪ
    });
  }
  return entries;
}

function getTrackCodeFromCourseId(courseId) {
  const id = String(courseId || "").toLowerCase();
  if (id.startsWith("sapporo-")) return "01";
  if (id.startsWith("hakodate-")) return "02";
  if (id.startsWith("fukushima-")) return "03";
  if (id.startsWith("niigata-")) return "04";
  if (id.startsWith("tokyo-")) return "05";
  if (id.startsWith("nakayama-")) return "06";
  if (id.startsWith("chukyo-")) return "07";
  if (id.startsWith("kyoto-")) return "08";
  if (id.startsWith("hanshin-")) return "09";
  if (id.startsWith("kokura-")) return "10";
  return null;
}

async function fetchDrawEntriesByRace(weekOfIso, race) {
  if (race?.raceId) {
    try {
      const html = await fetchText(`https://race.netkeiba.com/race/shutuba.html?race_id=${race.raceId}`);
      const entries = parseShutubaEntries(html);
      if (entries.length > 0) return entries;
    } catch {
      // fall through to title-based lookup
    }
  }

  const raceDate = dateForRaceDay(weekOfIso, race.day);
  if (!raceDate) return null;
  const trackCode = getTrackCodeFromCourseId(race.courseId);
  if (!trackCode) return null;
  const year = String(raceDate.getFullYear());
  const aliases = RACE_LABEL_ALIASES[race.label] ?? [race.label];
  const raceNoCandidates = ["11", "10", "12"];

  for (let kai = 1; kai <= 6; kai++) {
    for (let day = 1; day <= 12; day++) {
      for (const raceNo of raceNoCandidates) {
        const raceId = `${year}${trackCode}${String(kai).padStart(2, "0")}${String(day).padStart(2, "0")}${raceNo}`;
        let html;
        try {
          html = await fetchText(`https://race.netkeiba.com/race/shutuba.html?race_id=${raceId}`);
        } catch {
          continue;
        }
        const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "";
        if (!aliases.some((alias) => title.includes(alias))) continue;
        const entries = parseShutubaEntries(html);
        if (entries.length > 0) return entries;
      }
    }
  }

  return null;
}

function parseDrawOverrides(tsSource) {
  const m = tsSource.match(/export const GENERATED_DRAW_OVERRIDES: Record<string, Record<string, number>> = ([\s\S]*?);/);
  if (!m) return {};
  try {
    return JSON.parse(m[1]);
  } catch {
    return {};
  }
}

async function writeDrawOverridesTs(drawOverrides) {
  const content =
    `// Auto-generated by scripts/daily-entry-check.mjs\n` +
    `// Do not edit manually.\n\n` +
    `export const DRAW_OVERRIDES_GENERATED_AT = ${JSON.stringify(new Date().toISOString())};\n\n` +
    `export const GENERATED_DRAW_OVERRIDES: Record<string, Record<string, number>> = ${JSON.stringify(drawOverrides, null, 2)};\n`;
  await fs.writeFile(DRAW_OVERRIDES_TS_PATH, content, "utf8");
}

function normalizeWeight(courseId, horse) {
  const key = `${courseId}:${horse.id}`;
  if (WEIGHT_CORRECTIONS_BY_KEY[key]) {
    return WEIGHT_CORRECTIONS_BY_KEY[key];
  }
  if (horse && horse.name && WEIGHT_CORRECTIONS_BY_NAME[horse.name]) {
    return WEIGHT_CORRECTIONS_BY_NAME[horse.name];
  }
  if (Number.isFinite(horse?.weight) && horse.weight > 0) return horse.weight;
  return horse?.sex === "F" ? 55 : 57;
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
  const weekly = await readJson(WEEKLY_RACES_PATH, { currentWeek: { races: [] } });
  const netkeibaByName = await fetchNetkeibaWeightOverrides();
  const mergedNameCorrections = { ...WEIGHT_CORRECTIONS_BY_NAME, ...netkeibaByName };
  const totalRaces = (weekly.currentWeek?.races ?? []).length;
  if (totalRaces === 0) {
    throw new Error("currentWeek.races is empty; skip write to avoid wiping race data.");
  }

  let changed = 0;
  let drawApplied = 0;

  const weekOf = weekly.currentWeek?.weekOf || "";
  const drawMapByCourse = new Map();
  const drawEntriesByCourse = new Map();
  for (const race of weekly.currentWeek?.races ?? []) {
    if (!race?.courseId || !race?.label || !race?.day) continue;
    try {
      const entries = await fetchDrawEntriesByRace(weekOf, race);
      if (!entries || entries.length === 0) continue;
      const localNameToGate = new Map();
      for (const e of entries) {
        localNameToGate.set(normalizeName(e.horseName), Number(e.gateNumber));
      }
      drawMapByCourse.set(race.courseId, localNameToGate);
      drawEntriesByCourse.set(race.courseId, entries);
    } catch (error) {
      console.warn(`[daily-entry-check] draw fetch failed: ${race.label}: ${error.message}`);
    }
  }

  const oldDrawOverridesTs = await fs.readFile(DRAW_OVERRIDES_TS_PATH, "utf8").catch(() => "");
  const mergedDrawOverrides = {
    ...parseDrawOverrides(oldDrawOverridesTs),
  };
  for (const [courseId, entries] of drawEntriesByCourse.entries()) {
    const byName = {};
    for (const e of entries) {
      if (!e?.horseName || !(Number(e.gateNumber) > 0)) continue;
      byName[e.horseName] = Number(e.gateNumber);
    }
    if (Object.keys(byName).length > 0) {
      mergedDrawOverrides[courseId] = byName;
    }
  }
  await writeDrawOverridesTs(mergedDrawOverrides);

  for (const race of weekly.currentWeek?.races ?? []) {
    const horses = Array.isArray(race.horses) ? race.horses : [];
    const localNameToGate = drawMapByCourse.get(race.courseId);
    horses.forEach((horse, idx) => {
      const aliasList = [horse.name, ...(HORSE_NAME_ALIASES[horse.name] ?? [])];
      let targetGateFromDraw = null;
      if (localNameToGate) {
        for (const alias of aliasList) {
          const hit = localNameToGate.get(normalizeName(alias));
          if (Number.isFinite(hit) && hit > 0) {
            targetGateFromDraw = hit;
            break;
          }
        }
      }
      const targetGate = Number(targetGateFromDraw ?? horse.gateNumber ?? 0) > 0 ? Number(targetGateFromDraw ?? horse.gateNumber) : idx + 1;
      if (horse.gateNumber !== targetGate) {
        horse.gateNumber = targetGate;
        changed++;
        if (targetGateFromDraw !== null) drawApplied++;
      }

      const targetWeight = (() => {
        const key = `${race.courseId}:${horse.id}`;
        if (WEIGHT_CORRECTIONS_BY_KEY[key]) return WEIGHT_CORRECTIONS_BY_KEY[key];
        if (horse?.name && mergedNameCorrections[horse.name]) return mergedNameCorrections[horse.name];
        return normalizeWeight(race.courseId, horse);
      })();
      if (horse.weight !== targetWeight) {
        horse.weight = targetWeight;
        changed++;
      }

    });
    horses.sort((a, b) => Number(a?.gateNumber ?? 999) - Number(b?.gateNumber ?? 999));
  }

  await fs.writeFile(WEEKLY_RACES_PATH, JSON.stringify(weekly, null, 2), "utf8");

  const totalHorses = (weekly.currentWeek?.races ?? []).flatMap((r) => r.horses ?? []).length;

  console.log(
    `[daily-entry-check] changed=${changed}, drawApplied=${drawApplied}, totalHorses=${totalHorses}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});


