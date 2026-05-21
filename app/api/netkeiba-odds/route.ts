import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { GENERATED_DRAW_OVERRIDES } from "@/lib/generatedDrawOverrides";
import { getRaceDayNoOddsExclusions, toJstDateString } from "@/lib/raceDayExclusions.mjs";

const ROOT = process.cwd();
const WEEKLY_RACES_PATH = path.join(ROOT, "data", "weekly-races.json");

type WeeklyHorse = {
  name?: string;
  gateNumber?: number;
  predictionCount?: number;
  xBuzzScore?: number;
};

type WeeklyRace = {
  courseId?: string;
  raceId?: string;
  raceNumber?: number;
  raceDate?: string;
  day?: string;
  horses?: WeeklyHorse[];
};

type WeeklyData = {
  currentWeek?: {
    weekOf?: string;
    races?: WeeklyRace[];
  };
};

type ParsedEntry = {
  horseName: string;
  gateNumber: number;
  odds: number | null;
  popularityRank: number | null;
  jockey: string | null;
};

type CandidateResult = {
  raceId: string;
  overlap: number;
  oddsCount: number;
  entries: ParsedEntry[];
  shutubaHtml: string;
};

type ParsedPerformanceEntry = {
  horseName: string;
  gateNumber: number;
  jockey: string | null;
  recentFormScore: number | null;
  recentAverageFinish: number | null;
  recentTimeIndex: number | null;
  lastRaceGradeScore: number | null;
  lastRaceGradeLabel: string | null;
  lastRaceDistance: number | null;
  averageRunSpeed: number | null;
};

type PerformancePayload = {
  recentFormScore?: number;
  recentAverageFinish?: number;
  recentTimeIndex?: number;
  lastRaceGradeScore?: number;
  lastRaceGradeLabel?: string;
  lastRaceDistance?: number;
};

type RunningStyle = "Nige" | "Senko" | "Sashi" | "Oikomi";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeName(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\u3000/g, "")
    .replace(/\s+/g, "")
    .replace(/[\u30fb\uff65\-_.]/g, "");
}

function decodeHtmlText(s: string): string {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeJockeyName(raw: string): string | null {
  const cleaned = decodeHtmlText(raw)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  if (cleaned === "-" || cleaned === "--" || cleaned === "未定") return null;
  return cleaned;
}

function parseOdds(oddsRaw: string): number | null {
  const cleaned = String(oddsRaw ?? "").replace(/,/g, "").replace(/\s+/g, "").trim();
  if (!cleaned || cleaned.includes("-") || /人気|\*/.test(cleaned)) return null;
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parsePopularityRank(rankRaw: string): number | null {
  const cleaned = String(rankRaw ?? "").replace(/[^\d]/g, "");
  if (!cleaned) return null;
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function oddsToPopularityScore(odds: number | null, xBuzzScore: number): number {
  if (!(Number.isFinite(odds as number) && (odds as number) > 0)) {
    return Math.max(1, Math.round(10 + xBuzzScore * 2));
  }
  const safeOdds = Math.max(Number(odds), 1.1);
  const oddsScore = Math.max(12, Math.min(120, 120 - Math.log10(safeOdds) * 54));
  return Math.round(Math.max(1, Math.min(160, oddsScore + xBuzzScore * 1.8)));
}

function yyyymmddFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function dateFromIsoDate(dateIso: string): Date | null {
  const match = String(dateIso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, date] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(date));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateForRaceDay(weekOfIso: string, day: string): Date | null {
  const base = dateFromIsoDate(weekOfIso);
  if (!base) return null;
  const offset = day === "Sat" ? 5 : day === "Sun" ? 6 : 0;
  const out = new Date(base);
  out.setDate(base.getDate() + offset);
  return out;
}

function getTrackCodeFromCourseId(courseId: string): string | null {
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

async function readWeeklyData(): Promise<WeeklyData> {
  try {
    const raw = await fs.readFile(WEEKLY_RACES_PATH, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, "")) as WeeklyData;
  } catch {
    return {};
  }
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    cache: "no-store",
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

function extractRaceIds(raceListHtml: string): string[] {
  const ids = new Set<string>();
  for (const m of raceListHtml.matchAll(/race\/shutuba\.html\?race_id=(\d{12})/g)) {
    ids.add(m[1]);
  }
  return [...ids];
}

function extractRaceIdFromCourseId(courseId: string): string | null {
  const match = String(courseId ?? "").match(/(\d{12})$/);
  return match?.[1] ?? null;
}

function buildCandidateRaceIds(params: {
  courseId: string;
  race: WeeklyRace;
  raceDate: Date;
  trackCode: string;
  raceListHtml: string;
}) {
  const { courseId, race, raceDate, trackCode, raceListHtml } = params;
  const year = String(raceDate.getFullYear());
  const exactRaceId = String(race.raceId ?? extractRaceIdFromCourseId(courseId) ?? "").trim();
  const raceNumber =
    (Number.isFinite(Number(race.raceNumber)) && Number(race.raceNumber) > 0
      ? String(Number(race.raceNumber)).padStart(2, "0")
      : exactRaceId.length === 12
        ? exactRaceId.slice(-2)
        : "");

  const candidates = new Set<string>();
  if (/^\d{12}$/.test(exactRaceId)) {
    candidates.add(exactRaceId);
  }

  const allRaceIds = extractRaceIds(raceListHtml);
  const raceNoCandidates = raceNumber ? new Set([raceNumber]) : new Set(["10", "11", "12"]);
  for (const raceId of allRaceIds) {
    if (raceId.startsWith(`${year}${trackCode}`) && raceNoCandidates.has(raceId.slice(-2))) {
      candidates.add(raceId);
    }
  }

  return [...candidates];
}

function parseShutubaEntries(shutubaHtml: string): ParsedEntry[] {
  const rows = [...shutubaHtml.matchAll(/<tr[^>]*class="[^"]*HorseList[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)].map(
    (m) => m[1]
  );

  const entries: ParsedEntry[] = [];
  for (const row of rows) {
    const gateNumber = Number(row.match(/class="Umaban\d+[^"]*"[^>]*>\s*(\d{1,2})\s*<\/td>/i)?.[1] ?? 0);
    if (!(gateNumber > 0)) continue;

    const horseNameRaw =
      row.match(/title="([^"]+)"/i)?.[1] || row.match(/\/horse\/\d+\/?[^>]*>([^<]+)</i)?.[1] || "";
    const horseName = decodeHtmlText(horseNameRaw).trim();
    if (!horseName) continue;

    const oddsRaw =
      row.match(/id="odds-[^"]+"[^>]*>\s*([^<]+)\s*<\/span>/i)?.[1] ??
      row.match(/class="Txt_R Popular"[^>]*>\s*([^<]+)\s*</i)?.[1] ??
      "";
    const rankRaw =
      row.match(/id="ninki-[^"]+"[^>]*>\s*([^<]+)\s*<\/span>/i)?.[1] ??
      row.match(/class="Popular_Ninki[^"]*"[^>]*>\s*([^<]+)\s*<\/td>/i)?.[1] ??
      "";
    const jockeyTitleRaw = row.match(/<td class="Jockey"[\s\S]*?title="([^"]+)"/i)?.[1] ?? "";
    const jockeyCellRaw = row.match(/<td class="Jockey"[\s\S]*?>([\s\S]*?)<\/td>/i)?.[1] ?? "";
    const jockey = normalizeJockeyName(jockeyTitleRaw) ?? normalizeJockeyName(jockeyCellRaw);

    entries.push({
      horseName,
      gateNumber,
      odds: parseOdds(oddsRaw),
      popularityRank: parsePopularityRank(rankRaw),
      jockey,
    });
  }

  return entries;
}

function parseOreproEntries(oreproHtml: string): ParsedEntry[] {
  const rows = [...oreproHtml.matchAll(/<tr[^>]*class="[^"]*HorseList[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)].map(
    (m) => m[1]
  );

  const entries: ParsedEntry[] = [];
  for (const row of rows) {
    const gateNumber = Number(row.match(/class="Waku\d+[^"]*"[^>]*>\s*(\d{1,2})\s*<\/td>/i)?.[1] ?? 0);
    if (!(gateNumber > 0)) continue;

    const horseNameRaw = row.match(/<dt class="Horse">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "";
    const horseName = normalizeSpace(horseNameRaw);
    if (!horseName) continue;

    const popularCell = row.match(/<td class="Popular">([\s\S]*?)<\/td>/i)?.[1] ?? "";
    const jockeyRaw = row.match(/<dd class="Jockey">([\s\S]*?)<\/dd>/i)?.[1] ?? "";
    const jockey = normalizeJockeyName(jockeyRaw.replace(/\d{2}(?:\.\d)?/g, " "));

    entries.push({
      horseName,
      gateNumber,
      odds: parseOdds(popularCell.match(/<span[^>]*>\s*(\d+(?:\.\d+)?)\s*<\/span>/i)?.[1] ?? ""),
      popularityRank: parsePopularityRank(popularCell.match(/<span[^>]*>\s*(\d+)人気\s*<\/span>/i)?.[1] ?? ""),
      jockey,
    });
  }

  return entries;
}

function parseNetkeibaRunningStyles(shutubaHtml: string): Record<string, RunningStyle> {
  const section = shutubaHtml.match(/<section class="Sec_Deploy_Race">([\s\S]*?)<\/section>/i)?.[1] ?? "";
  if (!section) return {};

  const firstSlide = section.match(/<div class="DeployRace_SlideBoxItem">([\s\S]*?)<\/div>/i)?.[1] ?? "";
  if (!firstSlide) return {};

  const styleLabelMap: Record<string, RunningStyle> = {
    先頭: "Nige",
    先団: "Senko",
    中団: "Sashi",
    後方: "Oikomi",
  };

  const runningStyleByGate: Record<string, RunningStyle> = {};
  for (const group of firstSlide.matchAll(/<dl>\s*<dt>([\s\S]*?)<\/dt>\s*<dd>[\s\S]*?<ul>([\s\S]*?)<\/ul>/gi)) {
    const label = normalizeSpace(decodeHtmlText(stripTags(group[1])));
    const runningStyle = styleLabelMap[label];
    if (!runningStyle) continue;

    for (const item of group[2].matchAll(/<li>([\s\S]*?)<\/li>/gi)) {
      const gateNumber = Number.parseInt(
        item[1].match(/<span class="lblWaku[^"]*">\s*(\d{1,2})\s*<\/span>/i)?.[1] ?? "",
        10
      );
      if (!Number.isFinite(gateNumber) || gateNumber <= 0) continue;
      runningStyleByGate[String(gateNumber)] = runningStyle;
    }
  }

  return runningStyleByGate;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stripTags(value: string): string {
  return String(value ?? "").replace(/<[^>]*>/g, " ");
}

function normalizeSpace(value: string): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseDistanceMeters(raw: string): number | null {
  const distance = Number.parseInt(raw.match(/(\d{3,4})/)?.[1] ?? "", 10);
  return Number.isFinite(distance) && distance > 0 ? distance : null;
}

function parseRaceTimeSeconds(raw: string): number | null {
  const m = raw.match(/(\d+):(\d{1,2}\.\d)/);
  if (!m) return null;
  const minutes = Number.parseInt(m[1], 10);
  const seconds = Number.parseFloat(m[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  return minutes * 60 + seconds;
}

function detectGradeLabel(iconRaw: string, raceNameRaw: string): string | null {
  const icon = iconRaw.toUpperCase();
  if (icon.includes("GIII")) return "G3";
  if (icon.includes("GII")) return "G2";
  if (icon.includes("GI")) return "G1";

  const raceName = raceNameRaw;
  if (/(^|\s|\()(L)(\s|\)|$)/i.test(raceName)) return "L";
  if (/OP/i.test(raceName)) return "OP";
  if (/3\u52dd|3Win/i.test(raceName)) return "3Win";
  if (/2\u52dd|2Win/i.test(raceName)) return "2Win";
  if (/1\u52dd|1Win/i.test(raceName)) return "1Win";
  if (/\u672a\u52dd\u5229|\u65b0\u99ac|Maiden/i.test(raceName)) return "Maiden";
  return null;
}

function gradeLabelToScore(label: string | null): number | null {
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

function parseShutubaPastEntries(shutubaPastHtml: string): ParsedPerformanceEntry[] {
  const rows = [...shutubaPastHtml.matchAll(/<tr[^>]*class="HorseList"[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  const provisional: ParsedPerformanceEntry[] = [];

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
    const horseName = normalizeSpace(decodeHtmlText(stripTags(horseNameRaw)));
    if (!horseName) continue;
    const jockeyRaw = row.match(/<td class="Jockey"[\s\S]*?<a[^>]*>\s*([^<]+?)\s*<\/a>/i)?.[1] ?? "";
    const jockey = normalizeJockeyName(jockeyRaw);

    const pastCells = [...row.matchAll(/<td class="Past[^"]*"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]).slice(0, 5);
    const runs = pastCells.map((cell) => {
      const finish = Number.parseInt(cell.match(/<span class="Num">(\d{1,2})<\/span>/i)?.[1] ?? "", 10);
      const data02Raw = cell.match(/<div class="Data02">([\s\S]*?)<\/div>/i)?.[1] ?? "";
      const raceName = normalizeSpace(decodeHtmlText(stripTags(data02Raw)));
      const iconRaw = normalizeSpace(
        decodeHtmlText(stripTags(cell.match(/<span class="Icon_GradeType[^"]*">([^<]+)<\/span>/i)?.[1] ?? ""))
      );
      const gradeLabel = detectGradeLabel(iconRaw, raceName);
      const data05Raw = normalizeSpace(decodeHtmlText(stripTags(cell.match(/<div class="Data05">([\s\S]*?)<\/div>/i)?.[1] ?? "")));
      const distance = parseDistanceMeters(data05Raw);
      const timeSeconds = parseRaceTimeSeconds(data05Raw);
      const runSpeed = distance && timeSeconds ? distance / timeSeconds : null;

      return {
        finish: Number.isFinite(finish) && finish > 0 ? finish : null,
        gradeLabel,
        distance,
        runSpeed,
      };
    });

    const finishList = runs
      .map((run) => run.finish)
      .filter((finish): finish is number => Number.isFinite(finish as number) && (finish as number) > 0);
    const speedList = runs
      .map((run) => run.runSpeed)
      .filter((speed): speed is number => Number.isFinite(speed as number) && (speed as number) > 0);
    const avgFinish = finishList.length > 0 ? finishList.reduce((sum, v) => sum + v, 0) / finishList.length : null;
    const avgSpeed = speedList.length > 0 ? speedList.reduce((sum, v) => sum + v, 0) / speedList.length : null;
    const lastFinish = runs[0]?.finish ?? null;
    const lastRaceGradeLabel = runs[0]?.gradeLabel ?? null;
    const lastRaceGradeScore = gradeLabelToScore(lastRaceGradeLabel);

    let recentFormScore: number | null = null;
    if (avgFinish !== null || lastFinish !== null) {
      const avgScore = avgFinish !== null ? clamp((8 - avgFinish) * 0.9, -3.5, 3.5) : 0;
      const lastScore = lastFinish !== null ? clamp((7 - lastFinish) * 0.8, -2.5, 2.5) : 0;
      recentFormScore = Math.round(clamp(avgScore + lastScore, -5, 5) * 10) / 10;
    }

    provisional.push({
      horseName,
      gateNumber,
      jockey,
      recentFormScore,
      recentAverageFinish: avgFinish !== null ? Math.round(avgFinish * 10) / 10 : null,
      recentTimeIndex: null,
      lastRaceGradeScore: lastRaceGradeScore !== null ? Math.round(lastRaceGradeScore * 10) / 10 : null,
      lastRaceGradeLabel,
      lastRaceDistance: runs[0]?.distance ?? null,
      averageRunSpeed: avgSpeed !== null ? Math.round(avgSpeed * 1000) / 1000 : null,
    });
  }

  const speedValues = provisional
    .map((entry) => entry.averageRunSpeed)
    .filter((v): v is number => Number.isFinite(v as number) && (v as number) > 0);
  if (speedValues.length === 0) {
    return provisional;
  }

  const meanSpeed = speedValues.reduce((sum, v) => sum + v, 0) / speedValues.length;
  const variance =
    speedValues.reduce((sum, v) => {
      const diff = v - meanSpeed;
      return sum + diff * diff;
    }, 0) / speedValues.length;
  const stdSpeed = Math.sqrt(Math.max(variance, 0));
  const safeStd = Math.max(stdSpeed, 0.08);

  return provisional.map((entry) => {
    const speed = entry.averageRunSpeed;
    if (!Number.isFinite(speed as number) || (speed as number) <= 0) {
      return entry;
    }
    const z = ((speed as number) - meanSpeed) / safeStd;
    const recentTimeIndex = Math.round(clamp(z * 2.2, -5, 5) * 10) / 10;
    return {
      ...entry,
      recentTimeIndex,
    };
  });
}

function buildCandidateNameSet(courseId: string, race: WeeklyRace): Set<string> {
  const overrideNames = Object.keys(GENERATED_DRAW_OVERRIDES[courseId] ?? {});
  if (overrideNames.length > 0) {
    return new Set(overrideNames.map(normalizeName));
  }
  return new Set((race.horses ?? []).map((h) => normalizeName(h.name ?? "")).filter(Boolean));
}

function calculateOverlap(entries: ParsedEntry[], candidateNames: Set<string>): number {
  if (candidateNames.size === 0) return 0;
  return entries.reduce((sum, e) => sum + (candidateNames.has(normalizeName(e.horseName)) ? 1 : 0), 0);
}

export async function GET(request: NextRequest) {
  const courseId = request.nextUrl.searchParams.get("courseId")?.trim() ?? "";
  if (!courseId) {
    return NextResponse.json({ error: "courseId is required" }, { status: 400 });
  }

  const weekly = await readWeeklyData();
  const race = (weekly.currentWeek?.races ?? []).find((r) => r.courseId === courseId);
  if (!race) {
    return NextResponse.json({ error: "race not found for courseId" }, { status: 404 });
  }

  const weekOf = weekly.currentWeek?.weekOf ?? "";
  const raceDay = race.day ?? "";
  const raceDate = dateFromIsoDate(race.raceDate ?? "") ?? dateForRaceDay(weekOf, raceDay);
  if (!raceDate) {
    return NextResponse.json({ error: "invalid week/day in weekly-races.json" }, { status: 422 });
  }

  const trackCode = getTrackCodeFromCourseId(courseId);
  if (!trackCode) {
    return NextResponse.json({ error: "unsupported courseId" }, { status: 422 });
  }

  try {
    const raceListUrl = `https://race.netkeiba.com/top/race_list.html?kaisai_date=${yyyymmddFromDate(raceDate)}`;
    let raceListHtml = "";
    try {
      raceListHtml = await fetchText(raceListUrl);
    } catch {
      raceListHtml = "";
    }
    const candidateRaceIds = buildCandidateRaceIds({
      courseId,
      race,
      raceDate,
      trackCode,
      raceListHtml,
    });

    if (candidateRaceIds.length === 0) {
      return NextResponse.json({ error: "no candidate race IDs found" }, { status: 404 });
    }

    const candidateNames = buildCandidateNameSet(courseId, race);
    let best: CandidateResult | null = null;

    for (const raceId of candidateRaceIds) {
      try {
        const html = await fetchText(`https://race.netkeiba.com/race/shutuba.html?race_id=${raceId}`);
        const entries = parseShutubaEntries(html);
        if (entries.length === 0) continue;

        const overlap = calculateOverlap(entries, candidateNames);
        const oddsCount = entries.filter((e) => Number.isFinite(e.odds) && (e.odds ?? 0) > 0).length;
        const score = { raceId, overlap, oddsCount, entries, shutubaHtml: html };

        if (!best) {
          best = score;
          continue;
        }

        if (score.overlap > best.overlap || (score.overlap === best.overlap && score.oddsCount > best.oddsCount)) {
          best = score;
        }
      } catch {
        // Try the next candidate if one race page is unavailable.
      }
    }

    if (!best) {
      return NextResponse.json({ error: "failed to parse candidate races" }, { status: 404 });
    }

    if (candidateNames.size > 0 && best.overlap <= 0) {
      return NextResponse.json({ error: "unable to match race by horse names" }, { status: 404 });
    }

    let oreproByGate = new Map<string, ParsedEntry>();
    let oreproByName = new Map<string, ParsedEntry>();
    try {
      const oreproHtml = await fetchText(`https://orepro.netkeiba.com/bet/shutuba.html?race_id=${best.raceId}`);
      const oreproEntries = parseOreproEntries(oreproHtml);
      oreproByGate = new Map(oreproEntries.map((entry) => [String(entry.gateNumber), entry]));
      oreproByName = new Map(oreproEntries.map((entry) => [normalizeName(entry.horseName), entry]));
    } catch {
      oreproByGate = new Map<string, ParsedEntry>();
      oreproByName = new Map<string, ParsedEntry>();
    }

    const oddsByGate: Record<string, number> = {};
    const gateByHorseKey: Record<string, number> = {};
    const oddsByHorseKey: Record<string, number> = {};
    const runningStyleByGate: Record<string, RunningStyle> = {};
    const runningStyleByHorseKey: Record<string, RunningStyle> = {};
    const popularityRankByGate: Record<string, number> = {};
    const popularityRankByHorseKey: Record<string, number> = {};
    const popularityByGate: Record<string, number> = {};
    const popularityByHorseKey: Record<string, number> = {};
    const jockeyByGate: Record<string, string> = {};
    const jockeyByHorseKey: Record<string, string> = {};
    const performanceByGate: Record<string, PerformancePayload> = {};
    const performanceByHorseKey: Record<string, PerformancePayload> = {};
    const entryHorseNames = best.entries.map((entry) => entry.horseName).filter(Boolean);
    const entryHorseKeys = best.entries.map((entry) => normalizeName(entry.horseName)).filter(Boolean);
    const entryGateNumbers = best.entries
      .map((entry) => Number(entry.gateNumber))
      .filter((gateNumber) => Number.isFinite(gateNumber) && gateNumber > 0);
    const resolvedOddsByGate = new Map<string, number | null>();
    const weeklyHorseByGate = new Map(
      (race.horses ?? [])
        .filter((horse) => Number.isFinite(horse.gateNumber) && Number(horse.gateNumber) > 0)
        .map((horse) => [String(horse.gateNumber), horse] as const)
    );
    const weeklyHorseByName = new Map(
      (race.horses ?? [])
        .filter((horse) => horse.name)
        .map((horse) => [normalizeName(horse.name ?? ""), horse] as const)
    );
    const netkeibaRunningStyleByGate = parseNetkeibaRunningStyles(best.shutubaHtml);
    for (const entry of best.entries) {
      const gateKey = String(entry.gateNumber);
      const horseKey = normalizeName(entry.horseName);
      const oreproEntry = oreproByGate.get(gateKey) ?? oreproByName.get(horseKey);
      const resolvedOdds = entry.odds ?? oreproEntry?.odds ?? null;
      const resolvedPopularityRank = entry.popularityRank ?? oreproEntry?.popularityRank ?? null;
      const resolvedJockey = entry.jockey ?? oreproEntry?.jockey ?? null;
      resolvedOddsByGate.set(gateKey, Number.isFinite(resolvedOdds) && (resolvedOdds ?? 0) > 0 ? Number(resolvedOdds) : null);

      if (horseKey && Number.isFinite(entry.gateNumber) && entry.gateNumber > 0) {
        gateByHorseKey[horseKey] = entry.gateNumber;
      }
      if (Number.isFinite(resolvedOdds) && (resolvedOdds ?? 0) > 0) {
        oddsByGate[gateKey] = Number(resolvedOdds);
        if (horseKey) {
          oddsByHorseKey[horseKey] = Number(resolvedOdds);
        }
      }
      const resolvedRunningStyle = netkeibaRunningStyleByGate[gateKey];
      if (resolvedRunningStyle) {
        runningStyleByGate[gateKey] = resolvedRunningStyle;
        if (horseKey) {
          runningStyleByHorseKey[horseKey] = resolvedRunningStyle;
        }
      }
      if (Number.isFinite(resolvedPopularityRank) && (resolvedPopularityRank ?? 0) > 0) {
        popularityRankByGate[gateKey] = Number(resolvedPopularityRank);
        if (horseKey) {
          popularityRankByHorseKey[horseKey] = Number(resolvedPopularityRank);
        }
      }
      const weeklyHorse = weeklyHorseByGate.get(gateKey) ?? weeklyHorseByName.get(horseKey);
      const xBuzzScore = Number(weeklyHorse?.xBuzzScore ?? 0);
      const popularityScore = oddsToPopularityScore(resolvedOdds, xBuzzScore);
      if (popularityScore > 0) {
        popularityByGate[gateKey] = popularityScore;
        if (horseKey) {
          popularityByHorseKey[horseKey] = popularityScore;
        }
      }
      if (resolvedJockey) {
        jockeyByGate[gateKey] = resolvedJockey;
        if (horseKey) {
          jockeyByHorseKey[horseKey] = resolvedJockey;
        }
      }
    }

    try {
      const pastHtml = await fetchText(`https://race.netkeiba.com/race/shutuba_past.html?race_id=${best.raceId}`);
      const pastEntries = parseShutubaPastEntries(pastHtml);
      for (const entry of pastEntries) {
        const gateKey = String(entry.gateNumber);
        const horseKey = normalizeName(entry.horseName);
        if (entry.jockey) {
          jockeyByGate[gateKey] = entry.jockey;
          if (horseKey) {
            jockeyByHorseKey[horseKey] = entry.jockey;
          }
        }
        const performancePayload: PerformancePayload = {
          ...(entry.recentFormScore !== null ? { recentFormScore: entry.recentFormScore } : {}),
          ...(entry.recentAverageFinish !== null ? { recentAverageFinish: entry.recentAverageFinish } : {}),
          ...(entry.recentTimeIndex !== null ? { recentTimeIndex: entry.recentTimeIndex } : {}),
          ...(entry.lastRaceGradeScore !== null ? { lastRaceGradeScore: entry.lastRaceGradeScore } : {}),
          ...(entry.lastRaceGradeLabel ? { lastRaceGradeLabel: entry.lastRaceGradeLabel } : {}),
          ...(entry.lastRaceDistance !== null ? { lastRaceDistance: entry.lastRaceDistance } : {}),
        };
        performanceByGate[gateKey] = performancePayload;
        if (horseKey) {
          performanceByHorseKey[horseKey] = performancePayload;
        }
      }
    } catch {
      // Keep odds/popularity/jockey refresh working even if past-performance parsing fails.
    }

    const raceDateIso = toJstDateString(raceDate);
    const raceDayNoOddsExclusions = getRaceDayNoOddsExclusions(
      best.entries.map((entry) => ({
        name: entry.horseName,
        gateNumber: entry.gateNumber,
        realOdds: resolvedOddsByGate.get(String(entry.gateNumber)) ?? 0,
        oddsSource: "official",
      })),
      { raceDate: raceDateIso, oddsSource: "official" }
    );

    return NextResponse.json(
      {
        courseId,
        raceId: best.raceId,
        fetchedAt: new Date().toISOString(),
        overlap: best.overlap,
        entryCount: best.entries.length,
        entryHorseNames,
        entryHorseKeys,
        entryGateNumbers,
        oddsByGate,
        gateByHorseKey,
        oddsByHorseKey,
        runningStyleByGate,
        runningStyleByHorseKey,
        popularityRankByGate,
        popularityRankByHorseKey,
        popularityByGate,
        popularityByHorseKey,
        jockeyByGate,
        jockeyByHorseKey,
        performanceByGate,
        performanceByHorseKey,
        raceDayNoOddsExclusionsActive: raceDayNoOddsExclusions.active,
        includedByNoOddsGates: raceDayNoOddsExclusions.included.map((entry) => entry.gateNumber),
        includedByNoOddsHorseKeys: raceDayNoOddsExclusions.included.map((entry) => normalizeName(entry.name ?? "")),
        excludedByNoOddsGates: raceDayNoOddsExclusions.excluded.map((entry) => entry.gateNumber),
        excludedByNoOddsHorseKeys: raceDayNoOddsExclusions.excluded.map((entry) => normalizeName(entry.name ?? "")),
        excludedByNoOddsHorseNames: raceDayNoOddsExclusions.excluded.map((entry) => entry.name),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}








