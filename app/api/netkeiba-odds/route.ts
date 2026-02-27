import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { GENERATED_DRAW_OVERRIDES } from "@/lib/generatedDrawOverrides";

const ROOT = process.cwd();
const WEEKLY_RACES_PATH = path.join(ROOT, "data", "weekly-races.json");

type WeeklyHorse = {
  name?: string;
};

type WeeklyRace = {
  courseId?: string;
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
};

type CandidateResult = {
  raceId: string;
  overlap: number;
  oddsCount: number;
  entries: ParsedEntry[];
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeName(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[\s　・･\-_.]/g, "");
}

function decodeHtmlText(s: string): string {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseOdds(oddsRaw: string): number | null {
  const cleaned = String(oddsRaw ?? "").replace(/,/g, "").trim();
  if (!cleaned || cleaned.includes("-")) return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parsePopularityRank(rankRaw: string): number | null {
  const cleaned = String(rankRaw ?? "").replace(/[^\d]/g, "");
  if (!cleaned) return null;
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function rankToXPopularityScore(rank: number, fieldSize: number): number {
  // Proxy score shaped like existing "X人気pt" scale (top-heavy).
  const safeRank = Math.max(1, rank);
  const safeField = Math.max(1, fieldSize);
  const topBoost = 140 * Math.exp(-0.35 * (safeRank - 1));
  const floor = Math.max(1, Math.round((safeField - safeRank + 1) * (20 / safeField)));
  return Math.max(floor, Math.round(topBoost));
}

function yyyymmddFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function dateForRaceDay(weekOfIso: string, day: string): Date | null {
  const base = new Date(`${weekOfIso}T00:00:00+09:00`);
  if (Number.isNaN(base.getTime())) return null;
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

    entries.push({
      horseName,
      gateNumber,
      odds: parseOdds(oddsRaw),
      popularityRank: parsePopularityRank(rankRaw),
    });
  }

  return entries;
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
  const raceDate = dateForRaceDay(weekOf, raceDay);
  if (!raceDate) {
    return NextResponse.json({ error: "invalid week/day in weekly-races.json" }, { status: 422 });
  }

  const trackCode = getTrackCodeFromCourseId(courseId);
  if (!trackCode) {
    return NextResponse.json({ error: "unsupported courseId" }, { status: 422 });
  }

  try {
    const raceListUrl = `https://race.netkeiba.com/top/race_list.html?kaisai_date=${yyyymmddFromDate(raceDate)}`;
    const raceListHtml = await fetchText(raceListUrl);
    const allRaceIds = extractRaceIds(raceListHtml);
    const year = String(raceDate.getFullYear());
    const raceNoCandidates = new Set(["11", "10", "12"]);
    const candidateRaceIds = allRaceIds.filter(
      (id) => id.startsWith(`${year}${trackCode}`) && raceNoCandidates.has(id.slice(-2))
    );

    if (candidateRaceIds.length === 0) {
      return NextResponse.json({ error: "no candidate race IDs found" }, { status: 404 });
    }

    const candidateNames = buildCandidateNameSet(courseId, race);
    let best: CandidateResult | null = null;

    for (const raceId of candidateRaceIds) {
      const html = await fetchText(`https://race.netkeiba.com/race/shutuba.html?race_id=${raceId}`);
      const entries = parseShutubaEntries(html);
      if (entries.length === 0) continue;

      const overlap = calculateOverlap(entries, candidateNames);
      const oddsCount = entries.filter((e) => Number.isFinite(e.odds) && (e.odds ?? 0) > 0).length;
      const score = { raceId, overlap, oddsCount, entries };

      if (!best) {
        best = score;
        continue;
      }

      if (score.overlap > best.overlap || (score.overlap === best.overlap && score.oddsCount > best.oddsCount)) {
        best = score;
      }
    }

    if (!best) {
      return NextResponse.json({ error: "failed to parse candidate races" }, { status: 404 });
    }

    if (candidateNames.size > 0 && best.overlap <= 0) {
      return NextResponse.json({ error: "unable to match race by horse names" }, { status: 404 });
    }

    const oddsByGate: Record<string, number> = {};
    const popularityRankByGate: Record<string, number> = {};
    const xPopularityByGate: Record<string, number> = {};
    const fieldSize = Math.max(1, best.entries.length);
    for (const entry of best.entries) {
      if (Number.isFinite(entry.odds) && (entry.odds ?? 0) > 0) {
        oddsByGate[String(entry.gateNumber)] = Number(entry.odds);
      }
      if (Number.isFinite(entry.popularityRank) && (entry.popularityRank ?? 0) > 0) {
        const rank = Number(entry.popularityRank);
        popularityRankByGate[String(entry.gateNumber)] = rank;
        xPopularityByGate[String(entry.gateNumber)] = rankToXPopularityScore(rank, fieldSize);
      }
    }

    return NextResponse.json(
      {
        courseId,
        raceId: best.raceId,
        fetchedAt: new Date().toISOString(),
        overlap: best.overlap,
        oddsByGate,
        popularityRankByGate,
        xPopularityByGate,
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
