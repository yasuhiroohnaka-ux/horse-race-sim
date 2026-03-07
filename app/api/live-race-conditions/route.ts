import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import type { GroundCondition, Weather, WindDirection } from "@/lib/types";

const ROOT = process.cwd();
const WEEKLY_RACES_PATH = path.join(ROOT, "data", "weekly-races.json");

const VENUE_META: Record<string, { latitude: number; longitude: number; homeStraightBearing: number }> = {
  sapporo: { latitude: 43.0687, longitude: 141.3544, homeStraightBearing: 95 },
  hakodate: { latitude: 41.7688, longitude: 140.7288, homeStraightBearing: 110 },
  fukushima: { latitude: 37.7608, longitude: 140.4747, homeStraightBearing: 120 },
  niigata: { latitude: 37.9161, longitude: 139.0364, homeStraightBearing: 85 },
  tokyo: { latitude: 35.6649, longitude: 139.4816, homeStraightBearing: 95 },
  nakayama: { latitude: 35.7259, longitude: 139.9588, homeStraightBearing: 70 },
  chukyo: { latitude: 35.0441, longitude: 136.9876, homeStraightBearing: 90 },
  kyoto: { latitude: 34.9396, longitude: 135.7281, homeStraightBearing: 90 },
  hanshin: { latitude: 34.7772, longitude: 135.3652, homeStraightBearing: 95 },
  kokura: { latitude: 33.8416, longitude: 130.9103, homeStraightBearing: 145 },
};

type WeeklyRace = {
  courseId?: string;
  raceId?: string;
  venueKey?: string;
};

type WeeklyData = {
  currentWeek?: {
    races?: WeeklyRace[];
  };
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function decodeHtmlText(value: string): string {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value: string): string {
  return String(value ?? "").replace(/<[^>]*>/g, " ");
}

function normalizeSpace(value: string): string {
  return decodeHtmlText(stripTags(value)).replace(/\s+/g, " ").trim();
}

async function readWeeklyData(): Promise<WeeklyData> {
  const raw = await fs.readFile(WEEKLY_RACES_PATH, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, "")) as WeeklyData;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "horse-race-sim-bot/2.0",
      accept: "text/html,application/xml,text/xml,*/*",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`fetch failed ${response.status}: ${url}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "";
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

function mapWeatherLabel(raw: string): Weather | null {
  const value = normalizeSpace(raw);
  if (!value) return null;
  if (/雪/.test(value)) return "Snow";
  if (/雨|雷/.test(value)) return "Rain";
  if (/曇/.test(value)) return "Cloudy";
  if (/晴/.test(value)) return "Sunny";
  return null;
}

function mapGroundLabel(raw: string): GroundCondition | null {
  const value = normalizeSpace(raw);
  if (!value) return null;
  if (/不良/.test(value)) return "Soft";
  if (/稍/.test(value)) return "Good";
  if (/重/.test(value)) return "Yielding";
  if (/良/.test(value)) return "Firm";
  return null;
}

function mapWeatherCode(code: number): Weather | null {
  if (!Number.isFinite(code)) return null;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) return "Rain";
  if ([2, 3, 45, 48].includes(code)) return "Cloudy";
  if ([0, 1].includes(code)) return "Sunny";
  return null;
}

function parseRaceData01(shutubaHtml: string): { weather: Weather | null; groundCondition: GroundCondition | null } {
  const block = shutubaHtml.match(/<div class="RaceData01">([\s\S]*?)<\/div>/i)?.[1] ?? "";
  const weatherRaw = block.match(/天候\s*[:：]\s*([^<\s/]+)/i)?.[1] ?? "";
  const groundRaw = block.match(/馬場\s*[:：]\s*([^<\s/]+)/i)?.[1] ?? "";
  return {
    weather: mapWeatherLabel(weatherRaw),
    groundCondition: mapGroundLabel(groundRaw),
  };
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function toRelativeWindDirection(fromDegrees: number, courseBearing: number): WindDirection {
  const normalized = normalizeDegrees(fromDegrees - courseBearing);
  const delta = normalized > 180 ? normalized - 360 : normalized;
  const absDelta = Math.abs(delta);
  if (absDelta <= 45) return "Headwind";
  if (absDelta >= 135) return "Tailwind";
  return "Crosswind";
}

function toCompassLabel(fromDegrees: number): string {
  const labels = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const normalized = normalizeDegrees(fromDegrees);
  const index = Math.round(normalized / 22.5) % labels.length;
  return labels[index];
}

async function fetchLiveWind(venueKey: string): Promise<{
  weather: Weather | null;
  windDirection: WindDirection | null;
  windSpeed: number | null;
  windDegrees: number | null;
  windLabel: string | null;
  observedAt: string | null;
}> {
  const meta = VENUE_META[venueKey];
  if (!meta) {
    return {
      weather: null,
      windDirection: null,
      windSpeed: null,
      windDegrees: null,
      windLabel: null,
      observedAt: null,
    };
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${meta.latitude}&longitude=${meta.longitude}&current=weather_code,wind_speed_10m,wind_direction_10m&timezone=Asia%2FTokyo`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "horse-race-sim-bot/2.0",
      accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`weather fetch failed ${response.status}: ${url}`);
  }

  const payload = (await response.json()) as {
    current?: {
      time?: string;
      weather_code?: number;
      wind_speed_10m?: number;
      wind_direction_10m?: number;
    };
  };
  const current = payload.current ?? {};
  const speedKmh = Number(current.wind_speed_10m);
  const windDegrees = Number(current.wind_direction_10m);
  const windSpeed = Number.isFinite(speedKmh) ? Math.round((speedKmh / 3.6) * 10) / 10 : null;
  const relativeDirection = Number.isFinite(windDegrees)
    ? toRelativeWindDirection(windDegrees, meta.homeStraightBearing)
    : null;

  return {
    weather: mapWeatherCode(Number(current.weather_code)),
    windDirection: relativeDirection,
    windSpeed,
    windDegrees: Number.isFinite(windDegrees) ? windDegrees : null,
    windLabel: Number.isFinite(windDegrees) ? toCompassLabel(windDegrees) : null,
    observedAt: typeof current.time === "string" ? current.time : null,
  };
}

export async function GET(request: NextRequest) {
  const courseId = request.nextUrl.searchParams.get("courseId")?.trim() ?? "";
  if (!courseId) {
    return NextResponse.json({ error: "courseId is required" }, { status: 400 });
  }

  try {
    const weekly = await readWeeklyData();
    const race = (weekly.currentWeek?.races ?? []).find((entry) => entry.courseId === courseId);
    if (!race?.raceId || !race.venueKey) {
      return NextResponse.json({ error: "race not found for courseId" }, { status: 404 });
    }

    let pageWeather: Weather | null = null;
    let groundCondition: GroundCondition | null = null;
    try {
      const shutubaHtml = await fetchText(`https://race.netkeiba.com/race/shutuba.html?race_id=${race.raceId}`);
      const parsed = parseRaceData01(shutubaHtml);
      pageWeather = parsed.weather;
      groundCondition = parsed.groundCondition;
    } catch {
      pageWeather = null;
      groundCondition = null;
    }

    const liveWind = await fetchLiveWind(race.venueKey);

    return NextResponse.json(
      {
        courseId,
        raceId: race.raceId,
        fetchedAt: new Date().toISOString(),
        weather: pageWeather ?? liveWind.weather,
        groundCondition,
        windDirection: liveWind.windDirection,
        windSpeed: liveWind.windSpeed,
        windDegrees: liveWind.windDegrees,
        windLabel: liveWind.windLabel,
        observedAt: liveWind.observedAt,
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
