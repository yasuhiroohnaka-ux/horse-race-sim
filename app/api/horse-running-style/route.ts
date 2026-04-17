import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextRequest, NextResponse } from "next/server";

const ROOT = process.cwd();
const WEEKLY_RACES_PATH = path.join(ROOT, "data", "weekly-races.json");
const SYNC_SCRIPT_PATH = path.join(ROOT, "scripts", "sync-race-schedule.mjs");
const RUNNING_STYLE_OVERRIDE_COOKIE = "horse_running_style_overrides";

const VALID_STYLES = new Set(["Nige", "Senko", "Sashi", "Oikomi"]);

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function regenerateSchedule(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [SYNC_SCRIPT_PATH], {
      cwd: ROOT,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`sync-race-schedule exited with code ${code}`));
    });
  });
}

type WeeklyRacesPayload = {
  currentWeek?: { races?: Array<{ courseId?: string; horses?: Array<{ id?: unknown; runningStyle?: string }> }> };
};

type RunningStyleOverrideMap = Record<string, Record<string, string>>;

async function readWeeklyRaces(): Promise<{ bom: string; data: WeeklyRacesPayload }> {
  const raw = await fs.readFile(WEEKLY_RACES_PATH, "utf8");
  const bom = raw.startsWith("\uFEFF") ? "\uFEFF" : "";
  const data = JSON.parse(raw.replace(/^\uFEFF/, "")) as WeeklyRacesPayload;
  return { bom, data };
}

function findRace(data: WeeklyRacesPayload, courseId: string) {
  return (data.currentWeek?.races ?? []).find((race) => race?.courseId === courseId);
}

function readRunningStyleOverrides(request: NextRequest): RunningStyleOverrideMap {
  const raw = request.cookies.get(RUNNING_STYLE_OVERRIDE_COOKIE)?.value ?? "";
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as RunningStyleOverrideMap;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function buildRunningStylesResponse(race: NonNullable<ReturnType<typeof findRace>>, overrides: Record<string, string>) {
  return Object.fromEntries(
    (race.horses ?? [])
      .map((horse) => {
        const horseId = String(horse?.id ?? "").trim();
        const overrideStyle = String(overrides[horseId] ?? "").trim();
        const runningStyle = overrideStyle || String(horse?.runningStyle ?? "").trim();
        if (!horseId || !VALID_STYLES.has(runningStyle)) return null;
        return [horseId, runningStyle];
      })
      .filter((entry): entry is [string, string] => entry !== null)
  );
}

export async function GET(request: NextRequest) {
  const courseId = request.nextUrl.searchParams.get("courseId")?.trim() ?? "";
  if (!courseId) {
    return NextResponse.json({ error: "courseId is required" }, { status: 400 });
  }

  const { data } = await readWeeklyRaces();
  const race = findRace(data, courseId);
  if (!race) {
    return NextResponse.json({ error: "race not found for courseId" }, { status: 404 });
  }

  const overrides = readRunningStyleOverrides(request)[courseId] ?? {};
  const runningStyles = buildRunningStylesResponse(race, overrides);

  return NextResponse.json({ courseId, runningStyles });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const payload = body as { courseId?: unknown; horseId?: unknown; runningStyle?: unknown };
  const courseId = String(payload.courseId ?? "").trim();
  const horseId = String(payload.horseId ?? "").trim();
  const runningStyle = String(payload.runningStyle ?? "").trim();

  if (!courseId || !horseId) {
    return NextResponse.json({ error: "courseId and horseId are required" }, { status: 400 });
  }
  if (!VALID_STYLES.has(runningStyle)) {
    return NextResponse.json({ error: "invalid runningStyle" }, { status: 400 });
  }

  const { bom, data } = await readWeeklyRaces();
  const race = findRace(data, courseId);
  if (!race) {
    return NextResponse.json({ error: "race not found for courseId" }, { status: 404 });
  }

  const horse = (race.horses ?? []).find((h) => String(h?.id) === horseId);
  if (!horse) {
    return NextResponse.json({ error: "horse not found in race" }, { status: 404 });
  }

  const allOverrides = readRunningStyleOverrides(request);
  const courseOverrides = { ...(allOverrides[courseId] ?? {}) };
  const currentStyle = String(courseOverrides[horseId] ?? horse.runningStyle ?? "").trim();
  if (currentStyle === runningStyle) {
    return NextResponse.json({ ok: true, unchanged: true });
  }
  courseOverrides[horseId] = runningStyle;
  allOverrides[courseId] = courseOverrides;

  let persistedToFile = false;
  let syncError = "";

  try {
    horse.runningStyle = runningStyle;
    await fs.writeFile(WEEKLY_RACES_PATH, bom + JSON.stringify(data, null, 2) + "\n", "utf8");
    persistedToFile = true;

    try {
      await regenerateSchedule();
    } catch (error) {
      syncError = error instanceof Error ? error.message : "sync failed";
    }
  } catch {
    // On Vercel, runtime filesystem writes are not persistent. Keep the browser override in a cookie.
  }

  const response = NextResponse.json({
    ok: true,
    persistedToFile,
    ...(syncError ? { syncError } : {}),
  });
  response.cookies.set(RUNNING_STYLE_OVERRIDE_COOKIE, JSON.stringify(allOverrides), {
    httpOnly: false,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
