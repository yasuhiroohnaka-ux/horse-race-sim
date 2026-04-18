import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  getRunningStyleOverrideStorageStatus,
  readRunningStyleOverridesStore,
  writeRunningStyleOverridesStore,
} from "@/lib/runningStyleOverrides.mjs";

const ROOT = process.cwd();
const WEEKLY_RACES_PATH = path.join(ROOT, "data", "weekly-races.json");
const RUNNING_STYLE_OVERRIDE_COOKIE = "horse_running_style_overrides";

const VALID_STYLES = new Set(["Nige", "Senko", "Sashi", "Oikomi"]);

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WeeklyRacesPayload = {
  currentWeek?: {
    races?: Array<{
      courseId?: string;
      horses?: Array<{ id?: unknown; runningStyle?: string; runningStyleSource?: string }>;
    }>;
  };
};

type RunningStyleOverrideMap = Record<string, Record<string, string>>;
type RunningStyleOverrideEntry = {
  runningStyle?: string;
  source?: string;
  updatedAt?: string | null;
};
type RunningStyleOverrideStore = Record<string, Record<string, RunningStyleOverrideEntry>>;

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

function buildRunningStylesResponse(
  race: NonNullable<ReturnType<typeof findRace>>,
  overrides: Record<string, { runningStyle?: string }>,
  cookieOverrides: Record<string, string>
) {
  return Object.fromEntries(
    (race.horses ?? [])
      .map((horse) => {
        const horseId = String(horse?.id ?? "").trim();
        const overrideStyle = String(overrides[horseId]?.runningStyle ?? "").trim();
        const cookieStyle = String(cookieOverrides[horseId] ?? "").trim();
        const runningStyle = overrideStyle || cookieStyle || String(horse?.runningStyle ?? "").trim();
        if (!horseId || !VALID_STYLES.has(runningStyle)) return null;
        return [horseId, runningStyle];
      })
      .filter((entry): entry is [string, string] => entry !== null)
  );
}

function withOverrideCookie(
  response: NextResponse,
  request: NextRequest,
  allOverrides: RunningStyleOverrideMap
) {
  response.cookies.set(RUNNING_STYLE_OVERRIDE_COOKIE, JSON.stringify(allOverrides), {
    httpOnly: false,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
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

  const overrideStorage = getRunningStyleOverrideStorageStatus();
  const storedOverrideStore = (await readRunningStyleOverridesStore()) as RunningStyleOverrideStore;
  const storedOverrides = storedOverrideStore[courseId] ?? {};
  const cookieOverrides = readRunningStyleOverrides(request)[courseId] ?? {};
  const runningStyles = buildRunningStylesResponse(race, storedOverrides, cookieOverrides);

  return NextResponse.json({ courseId, runningStyles, overrideStorage });
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

  const { data } = await readWeeklyRaces();
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
  const overrideStorage = getRunningStyleOverrideStorageStatus();
  const storedOverrides = (await readRunningStyleOverridesStore()) as RunningStyleOverrideStore;
  const courseStoredOverrides = { ...(storedOverrides[courseId] ?? {}) };
  const currentStyle = String(
    courseStoredOverrides[horseId]?.runningStyle ?? courseOverrides[horseId] ?? horse.runningStyle ?? ""
  ).trim();
  if (currentStyle === runningStyle) {
    return NextResponse.json({ ok: true, unchanged: true });
  }
  courseOverrides[horseId] = runningStyle;
  allOverrides[courseId] = courseOverrides;
  courseStoredOverrides[horseId] = {
    runningStyle,
    source: "saved_manual_override",
    updatedAt: new Date().toISOString(),
  };
  storedOverrides[courseId] = courseStoredOverrides;

  let persistedToOverrideStore = false;
  let persistError = null;

  try {
    await writeRunningStyleOverridesStore(storedOverrides);
    persistedToOverrideStore = true;
  } catch (error) {
    persistError = {
      code:
        typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
          ? error.code
          : "override_store_unavailable",
      message: error instanceof Error ? error.message : "Running style override storage is unavailable.",
    };
  }

  if (!persistedToOverrideStore) {
    return withOverrideCookie(
      NextResponse.json(
        {
          ok: false,
          error: persistError?.code ?? overrideStorage.reason ?? "override_store_unavailable",
          message:
            persistError?.message ??
            "Running style override could not be persisted to the configured storage. Cookie fallback only.",
          persistedToOverrideStore: false,
          fallback: "cookie",
          overrideStorage,
        },
        { status: 503 }
      ),
      request,
      allOverrides
    );
  }

  return withOverrideCookie(
    NextResponse.json({
      ok: true,
      persistedToOverrideStore,
      overrideStorage,
    }),
    request,
    allOverrides
  );
}
