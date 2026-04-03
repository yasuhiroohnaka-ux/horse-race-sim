import fs from "node:fs/promises";
import path from "node:path";
import { ARCHIVED_COURSES, COURSES } from "../lib/courses";
import { buildPredictionSnapshot, DEFAULT_SCORING_VERSION } from "../lib/predictionSnapshots";
import { ARCHIVED_RACES as LEGACY_ARCHIVED_RACES } from "../lib/raceData";
import { MONTE_CARLO_RUNS } from "../lib/simulationConfig";
import { runMonteCarlo } from "../lib/simulation";
import { pickTanpukuPair as pickRoutineTanpukuPair } from "../lib/tanpukuSelection.mjs";
import type { Course, Horse, PredictionOrigin, PredictionSnapshot, PredictionSnapshotRow, RaceCondition } from "../lib/types";

const ROOT = process.cwd();
const WEEKLY_RACES_PATH = path.join(ROOT, "data", "weekly-races.json");
const STATE_PATH = path.join(ROOT, "data", "routine-state.json");
const SNAPSHOT_PATH = path.join(ROOT, "data", "prediction-snapshots.jsonl");

type RacePayoutTable = {
  resultNumbers?: number[];
  payouts?: number[];
};

type RaceResultRecord = {
  updatedAt?: string;
  winnerHorseId?: string;
  winnerHorseName?: string;
  top3HorseIds?: string[];
  top3HorseNames?: string[];
  finishers?: Array<{
    position: number;
    horseId?: string;
    horseNumber?: number;
    name?: string;
  }>;
  payouts?: {
    tansho?: RacePayoutTable;
    fukusho?: RacePayoutTable;
  };
};

type WeeklyRaceRecord = {
  courseId: string;
  raceId?: string;
  label: string;
  grade: string;
  day: string;
  venue: string;
  surface: "Turf" | "Dirt";
  distance: number;
  straightLength: number;
  oddsSource?: string;
  horses: Horse[];
  result?: RaceResultRecord;
};

type WeeklyArchiveRecord = {
  weekOf: string;
  races: WeeklyRaceRecord[];
};

type WeeklyRacesFile = {
  currentWeek?: {
    weekOf?: string;
    races?: WeeklyRaceRecord[];
  };
  archives?: WeeklyArchiveRecord[];
};

type RoutineState = {
  tanpukuRecommendations?: Array<Record<string, unknown>>;
};

type ExistingRecommendationRecord = {
  courseId?: unknown;
  pickType?: unknown;
  raceId?: unknown;
  horseId?: unknown;
  settlementStatus?: unknown;
  tanPayoutSource?: unknown;
  fukuPayoutSource?: unknown;
  scoringVersion?: unknown;
  predictionOrigin?: unknown;
  source?: unknown;
};

type SettlementStatus = "pending_result" | "pending_payouts" | "settled";
type BetOutcome = "not_settled" | "hit" | "miss" | "hit_missing_payout";
type PayoutSource = "official" | "missing";

type BackfilledRecommendation = {
  weekOf: string;
  day: string;
  stage: string;
  source: string;
  postedAt: string;
  settledAt: string | null;
  courseId: string;
  raceId: string;
  raceLabel: string;
  pickType: "win" | "value";
  predictionOrigin: PredictionOrigin;
  scoringVersion: string;
  horseId: string;
  horseName: string;
  realOdds: number;
  placeOdds: number;
  winProb: number;
  placeProb: number;
  placeScore: number;
  valueScore: number;
  selectionReason: string;
  scoreGap: number;
  runnerUpHorseId: string | null;
  runnerUpHorseName: string | null;
  runnerUpPlaceScore: number | null;
  runnerUpPlaceProb: number | null;
  overbetLabel: string | null;
  settlementStatus: SettlementStatus;
  tanOutcome: BetOutcome;
  fukuOutcome: BetOutcome;
  tanPayout: number;
  fukuPayout: number;
  tanPayoutSource: PayoutSource;
  fukuPayoutSource: PayoutSource;
  actualWinnerHorseId: string | null;
  actualTop3HorseIds: string[];
  resolved: boolean;
  tanHit: boolean;
  fukuHit: boolean;
};

const MANUAL_RECOMMENDATION_OVERRIDES: Record<string, Partial<BackfilledRecommendation>> = {
  "202606020211::win::1": {
    settlementStatus: "settled",
    tanOutcome: "hit",
    fukuOutcome: "hit",
    tanPayout: 420,
    fukuPayout: 160,
    tanPayoutSource: "official",
    fukuPayoutSource: "official",
    actualWinnerHorseId: "1",
    actualTop3HorseIds: ["1", "5", "2"],
    resolved: true,
    tanHit: true,
    fukuHit: true,
  },
  "202606020211::value::14": {
    settlementStatus: "settled",
    tanOutcome: "miss",
    fukuOutcome: "miss",
    tanPayout: 0,
    fukuPayout: 0,
    tanPayoutSource: "official",
    fukuPayoutSource: "official",
    actualWinnerHorseId: "1",
    actualTop3HorseIds: ["1", "5", "2"],
    resolved: true,
    tanHit: false,
    fukuHit: false,
  },
  "202609010411::win::1": {
    settlementStatus: "settled",
    tanOutcome: "miss",
    fukuOutcome: "hit",
    tanPayout: 0,
    fukuPayout: 130,
    tanPayoutSource: "official",
    fukuPayoutSource: "official",
    actualWinnerHorseId: "2",
    actualTop3HorseIds: ["2", "6", "1"],
    resolved: true,
    tanHit: false,
    fukuHit: true,
  },
  "202609010411::value::4": {
    settlementStatus: "settled",
    tanOutcome: "miss",
    fukuOutcome: "miss",
    tanPayout: 0,
    fukuPayout: 0,
    tanPayoutSource: "official",
    fukuPayoutSource: "official",
    actualWinnerHorseId: "2",
    actualTop3HorseIds: ["2", "6", "1"],
    resolved: true,
    tanHit: false,
    fukuHit: false,
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function decodeHtmlText(value: string) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value: string) {
  return String(value ?? "").replace(/<[^>]*>/g, " ");
}

function normalizeSpace(value: string) {
  return decodeHtmlText(stripTags(value)).replace(/\s+/g, " ").trim();
}

function normalizeHorseName(value: string) {
  return normalizeSpace(value).toLowerCase().replace(/[\s縲・･\-_.]/g, "");
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, "")) as T;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return fallback;
    throw error;
  }
}

async function fetchText(url: string) {
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

function parseResultEntries(resultHtml: string) {
  const rows = [...String(resultHtml).matchAll(/<tr[^>]*class="[^"]*HorseList[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)].map(
    (match) => match[1]
  );

  return rows
    .map((row) => {
      const position = Number.parseInt(row.match(/<div class="Rank">(\d+)<\/div>/i)?.[1] ?? "", 10);
      if (!(position > 0)) return null;

      const horseNumber = Number.parseInt(row.match(/<td class="Num Txt_C">\s*<div>(\d{1,2})<\/div>/i)?.[1] ?? "", 10);
      const horseName = normalizeSpace(
        row.match(/<span class="HorseNameSpan">([\s\S]*?)<\/span>/i)?.[1] ??
          row.match(/<a[^>]*href="[^"]*\/horse\/\d+\/?[^"]*"[^>]*>([\s\S]*?)<\/a>/i)?.[1] ??
          ""
      );
      const jockey = normalizeSpace(
        row.match(/<span class="JockeyNameSpan">([\s\S]*?)<\/span>/i)?.[1] ??
          row.match(/\/jockey\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i)?.[1] ??
          ""
      );
      const popularity = Number.parseInt(row.match(/<span class="OddsPeople">(\d+)<\/span>/i)?.[1] ?? "", 10);
      const odds = parseNumber(row.match(/<td class="Odds Txt_R">[\s\S]*?<span[^>]*>\s*([\d.]+)\s*<\/span>/i)?.[1] ?? "");

      return {
        position,
        horseNumber: Number.isFinite(horseNumber) ? horseNumber : 0,
        name: horseName,
        jockey,
        popularity: Number.isFinite(popularity) ? popularity : 0,
        odds: odds !== null && Number.isFinite(odds) ? Math.round(odds * 10) / 10 : 0,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}

function parsePayoutRow(resultHtml: string, className: string): RacePayoutTable | null {
  const row = resultHtml.match(new RegExp(`<tr class="${className}">([\\s\\S]*?)<\\/tr>`, "i"))?.[1] ?? "";
  if (!row) return null;

  const resultNumbers = [...row.matchAll(/<span>(\d+)<\/span>/g)]
    .map((match) => Number.parseInt(match[1], 10))
    .filter(Number.isFinite);
  const payouts = [...row.matchAll(/<td class="Payout">[\s\S]*?<span>([\s\S]*?)<\/span>/gi)]
    .flatMap((match) => normalizeSpace(match[1]).split(/\s+/))
    .map((value) => parseNumber(value))
    .filter((value): value is number => Number.isFinite(value));

  if (resultNumbers.length === 0 && payouts.length === 0) return null;
  return { resultNumbers, payouts };
}

function parseNumber(raw: string) {
  const cleaned = String(raw ?? "").replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readExistingSnapshots(): Promise<{ lines: string[]; latestByRaceId: Record<string, PredictionSnapshot> }> {
  try {
    const raw = await fs.readFile(SNAPSHOT_PATH, "utf8");
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const latestByRaceId: Record<string, PredictionSnapshot> = {};
    for (const line of lines) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== "object") continue;
      const snapshot = parsed as PredictionSnapshot;
      if (!snapshot.raceId || !snapshot.snapshotId) continue;
      const existing = latestByRaceId[snapshot.raceId];
      if (!existing || Date.parse(snapshot.capturedAt) >= Date.parse(existing.capturedAt)) {
        latestByRaceId[snapshot.raceId] = snapshot;
      }
    }

    return { lines, latestByRaceId };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      return { lines: [], latestByRaceId: {} };
    }
    throw error;
  }
}

function createDefaultCondition(course: Course): RaceCondition {
  return {
    courseId: course.id,
    trackBias: course.defaultBias ?? { innerOuter: 0, frontBack: 0 },
    groundCondition: "Firm",
    weather: "Sunny",
    windDirection: "Crosswind",
    windSpeed: 3,
    paceScenario: "Average",
  };
}

function getArchivedCourse(race: WeeklyRaceRecord): Course {
  const matched = COURSES.find((course) => course.id === race.courseId) ?? ARCHIVED_COURSES.find((course) => course.id === race.courseId);
  if (matched) return matched;

  return {
    id: race.courseId,
    name: `${race.venue} ${race.surface} ${race.distance}m (${race.label})`,
    venue: race.venue,
    day: race.day,
    grade: race.grade,
    distance: race.distance,
    surface: race.surface,
    straightLength: race.straightLength,
    hashtag: `#${race.label}`,
    archived: true,
    defaultBias: { innerOuter: 0, frontBack: 0 },
    segments: [
      { distance: Math.max(200, Math.round(race.distance * 0.2)), slope: 0, type: "straight" },
      { distance: Math.max(150, Math.round(race.distance * 0.2)), slope: 0, type: "corner" },
      { distance: Math.max(150, Math.round(race.distance * 0.2)), slope: 0, type: "corner" },
      { distance: Math.max(220, Math.round(race.straightLength)), slope: 1.0, type: "straight" },
    ],
  };
}

function getSimTopRows(snapshot: PredictionSnapshot): PredictionSnapshotRow[] {
  return [...snapshot.rankedRows]
    .sort((left, right) => left.rank - right.rank)
    .slice(0, 3);
}

function pickWinRow(snapshot: PredictionSnapshot): PredictionSnapshotRow | null {
  return getSimTopRows(snapshot)[0] ?? null;
}

function pickValueRow(snapshot: PredictionSnapshot): PredictionSnapshotRow | null {
  const topRows = getSimTopRows(snapshot);
  if (topRows.length === 0) return null;

  const preferred = snapshot.valueHorseId
    ? snapshot.rankedRows.find((row) => row.horseId === snapshot.valueHorseId && row.horseId !== snapshot.honmeiHorseId)
    : null;
  if (preferred) return preferred;

  return topRows.find((row) => row.horseId !== snapshot.honmeiHorseId) ?? topRows[0] ?? null;
}

function normalizeHorseId(value: unknown): string {
  return String(value ?? "").trim();
}

function hasOfficialPayoutTable(payoutTable: RacePayoutTable | undefined) {
  return Boolean(
    payoutTable &&
      Array.isArray(payoutTable.resultNumbers) &&
      payoutTable.resultNumbers.length > 0 &&
      Array.isArray(payoutTable.payouts) &&
      payoutTable.payouts.length > 0
  );
}

function getFinisherForHorse(race: WeeklyRaceRecord, horseId: string) {
  return race.result?.finishers?.find((finisher) => normalizeHorseId(finisher.horseId) === horseId) ?? null;
}

function getOfficialPayoutByHorseNumber(payoutTable: RacePayoutTable | undefined, horseNumber: number | undefined) {
  if (!hasOfficialPayoutTable(payoutTable)) return null;
  const normalizedHorseNumber = Number(horseNumber ?? 0);
  if (!(normalizedHorseNumber > 0)) return null;

  const numbers = (payoutTable?.resultNumbers ?? []).map((value) => Number(value));
  const payouts = (payoutTable?.payouts ?? []).map((value) => Number(value));
  const index = numbers.findIndex((value) => value === normalizedHorseNumber);
  if (index < 0) return null;

  const payout = payouts[index];
  return Number.isFinite(payout) ? Math.round(payout) : null;
}

function getOfficialTanshoPayoutForHorse(race: WeeklyRaceRecord, horseId: string) {
  const finisher = getFinisherForHorse(race, horseId);
  return getOfficialPayoutByHorseNumber(race.result?.payouts?.tansho, finisher?.horseNumber);
}

function getOfficialFukushoPayoutForHorse(race: WeeklyRaceRecord, horseId: string) {
  const finisher = getFinisherForHorse(race, horseId);
  return getOfficialPayoutByHorseNumber(race.result?.payouts?.fukusho, finisher?.horseNumber);
}

function createPostedAt(dateString: string) {
  return new Date(`${dateString}T14:55:00+09:00`).toISOString();
}

function buildBackfilledRecommendation(params: {
  archiveWeekOf: string;
  race: WeeklyRaceRecord;
  row: PredictionSnapshotRow;
  scoredEntry?: {
    winProb?: number;
    placeProb?: number;
    placeOdds?: number;
    placeScore?: number;
    valueScore?: number;
    selectionReason?: string;
    scoreGap?: number;
    overbetLabel?: string | null;
  } | null;
  runnerUp?: {
    horseId?: string;
    horseName?: string;
    placeScore?: number;
    placeProb?: number;
  } | null;
  pickType: "win" | "value";
  postedAt: string;
}): BackfilledRecommendation {
  const { archiveWeekOf, race, row, scoredEntry, runnerUp, pickType, postedAt } = params;
  const result = race.result;
  const winnerHorseId = normalizeHorseId(result?.winnerHorseId);
  const top3HorseIds = (result?.top3HorseIds ?? []).map((horseId) => normalizeHorseId(horseId)).filter(Boolean);
  const tanHit = Boolean(winnerHorseId && row.horseId === winnerHorseId);
  const fukuHit = top3HorseIds.includes(row.horseId);
  const hasTansho = hasOfficialPayoutTable(result?.payouts?.tansho);
  const hasFukusho = hasOfficialPayoutTable(result?.payouts?.fukusho);
  const tanPayout = tanHit ? getOfficialTanshoPayoutForHorse(race, row.horseId) : 0;
  const fukuPayout = fukuHit ? getOfficialFukushoPayoutForHorse(race, row.horseId) : 0;
  const settlementStatus: SettlementStatus =
    !result || !winnerHorseId || top3HorseIds.length === 0
      ? "pending_result"
      : !hasTansho || !hasFukusho || (tanHit && tanPayout === null) || (fukuHit && fukuPayout === null)
        ? "pending_payouts"
        : "settled";

  const fallbackWinProbDecimal = clamp((Number(row.winProb ?? 0) || 0) / 100, 0.03, 0.95);
  const winProbDecimal = clamp(Number(scoredEntry?.winProb ?? fallbackWinProbDecimal), 0.03, 0.95);
  const placeProbDecimal = clamp(Number(scoredEntry?.placeProb ?? (fallbackWinProbDecimal * 2.2 + 0.05)), 0.12, 0.9);
  const realOdds = Number(row.realOdds ?? 0) > 0 ? Number(row.realOdds) : Number(row.fairOdds ?? 0);
  const placeOdds = Math.max(1.1, Number(scoredEntry?.placeOdds ?? (realOdds > 0 ? realOdds : 5) * 0.35 + 1.0));

  return {
    weekOf: archiveWeekOf,
    day: race.day,
    stage: "archive_backfill",
    source: "archive_simulation_backfill",
    postedAt,
    settledAt: settlementStatus === "settled" ? (result?.updatedAt ?? new Date().toISOString()) : null,
    courseId: race.courseId,
    raceId: normalizeHorseId(race.raceId),
    raceLabel: race.label,
    pickType,
    predictionOrigin: "backfill",
    scoringVersion: DEFAULT_SCORING_VERSION,
    horseId: row.horseId,
    horseName: row.horseName,
    realOdds: round1(realOdds),
    placeOdds: round1(placeOdds),
    winProb: round3(winProbDecimal),
    placeProb: round3(placeProbDecimal),
    placeScore: round3(Number(scoredEntry?.placeScore ?? 0)),
    valueScore: round3(Number(scoredEntry?.valueScore ?? 0)),
    selectionReason: String(scoredEntry?.selectionReason ?? ""),
    scoreGap: round3(Number(scoredEntry?.scoreGap ?? 0)),
    runnerUpHorseId: runnerUp?.horseId ? String(runnerUp.horseId) : null,
    runnerUpHorseName: runnerUp?.horseName ? String(runnerUp.horseName) : null,
    runnerUpPlaceScore: runnerUp?.placeScore != null ? round3(Number(runnerUp.placeScore)) : null,
    runnerUpPlaceProb: runnerUp?.placeProb != null ? round3(Number(runnerUp.placeProb)) : null,
    overbetLabel: scoredEntry?.overbetLabel ?? null,
    settlementStatus,
    tanOutcome:
      settlementStatus === "pending_result"
        ? "not_settled"
        : tanHit
          ? tanPayout !== null
            ? "hit"
            : "hit_missing_payout"
          : "miss",
    fukuOutcome:
      settlementStatus === "pending_result"
        ? "not_settled"
        : fukuHit
          ? fukuPayout !== null
            ? "hit"
            : "hit_missing_payout"
          : "miss",
    tanPayout: tanHit && tanPayout !== null ? tanPayout : 0,
    fukuPayout: fukuHit && fukuPayout !== null ? fukuPayout : 0,
    tanPayoutSource: hasTansho ? "official" : "missing",
    fukuPayoutSource: hasFukusho ? "official" : "missing",
    actualWinnerHorseId: winnerHorseId || null,
    actualTop3HorseIds: top3HorseIds,
    resolved: settlementStatus === "settled",
    tanHit,
    fukuHit,
  };
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

function normalizeExistingSnapshotLine(line: string) {
  try {
    const parsed = JSON.parse(line) as PredictionSnapshot & { predictionOrigin?: string; scoringVersion?: string };
    if (!parsed || typeof parsed !== "object" || !parsed.snapshotId || !parsed.raceId) return line;
    if (parsed.predictionOrigin && parsed.scoringVersion) return line;
    return JSON.stringify({
      ...parsed,
      predictionOrigin: parsed.predictionOrigin ?? "saved_manual",
      scoringVersion: parsed.scoringVersion ?? DEFAULT_SCORING_VERSION,
    });
  } catch {
    return line;
  }
}

function buildRecommendationKey(courseId: string, pickType: "win" | "value") {
  return `${courseId}::${pickType}`;
}

function applyManualRecommendationOverride(recommendation: BackfilledRecommendation) {
  const overrideKey = `${recommendation.raceId}::${recommendation.pickType}::${recommendation.horseId}`;
  const override = MANUAL_RECOMMENDATION_OVERRIDES[overrideKey];
  if (!override) return recommendation;
  return {
    ...recommendation,
    ...override,
  };
}

function shouldReplaceRecommendation(existing: Record<string, unknown> | undefined, next: BackfilledRecommendation) {
  if (!existing) return false;

  const current = existing as ExistingRecommendationRecord;
  const currentRaceId = normalizeHorseId(current.raceId);
  const currentHorseId = normalizeHorseId(current.horseId);
  const currentSettlementStatus = String(current.settlementStatus ?? "");
  const currentTanSource = String(current.tanPayoutSource ?? "");
  const currentFukuSource = String(current.fukuPayoutSource ?? "");
  const currentScoringVersion = String(current.scoringVersion ?? "");
  const currentPredictionOrigin =
    current.source === "backfill" || (typeof current.source === "string" && String(current.source).includes("backfill"))
      ? "backfill"
      : String(current.predictionOrigin ?? "");
  const currentWinnerHorseId = normalizeHorseId((existing as Record<string, unknown>).actualWinnerHorseId);
  const currentTop3HorseIds = Array.isArray((existing as Record<string, unknown>).actualTop3HorseIds)
    ? ((existing as Record<string, unknown>).actualTop3HorseIds as unknown[]).map((value) => normalizeHorseId(value)).filter(Boolean)
    : [];

  if (currentRaceId !== next.raceId) return true;
  if (currentHorseId !== next.horseId) return true;
  if (currentScoringVersion !== next.scoringVersion) return true;
  if (currentPredictionOrigin !== "backfill" && next.predictionOrigin === "backfill") return true;
  if (currentWinnerHorseId !== next.actualWinnerHorseId) return true;
  if (JSON.stringify(currentTop3HorseIds) !== JSON.stringify(next.actualTop3HorseIds)) return true;
  if (currentSettlementStatus !== "settled" && next.settlementStatus === "settled") return true;
  if (currentTanSource !== "official" && next.tanPayoutSource === "official") return true;
  if (currentFukuSource !== "official" && next.fukuPayoutSource === "official") return true;

  return false;
}

function buildLegacyRaceId(courseId: string, date: string) {
  return `legacy-${courseId}-${date.replace(/[^0-9]/g, "")}`;
}

async function fetchLegacyRaceResult(raceId: string, horses: Horse[]): Promise<RaceResultRecord | undefined> {
  try {
    const resultHtml = await fetchText(`https://race.netkeiba.com/race/result.html?race_id=${raceId}`);
    const parsedFinishers = parseResultEntries(resultHtml);
    if (parsedFinishers.length === 0) return undefined;

    const horseByNumber = new Map<number, Horse>(
      horses
        .map((horse): [number, Horse] => [Number(horse.gateNumber ?? 0), horse])
        .filter(([horseNumber]) => horseNumber > 0)
    );
    const horseByName = new Map(horses.map((horse) => [normalizeHorseName(horse.name), horse]));

    const finishers = parsedFinishers.map((entry) => {
      const localHorse =
        horseByNumber.get(Number(entry.horseNumber ?? 0)) ??
        horseByName.get(normalizeHorseName(entry.name)) ??
        null;

      return {
        position: entry.position,
        gateNumber: localHorse ? Number(localHorse.gateNumber ?? 0) : Number(entry.horseNumber ?? 0),
        horseNumber: Number(entry.horseNumber ?? 0),
        horseId: localHorse?.id ? String(localHorse.id) : undefined,
        name: localHorse?.name ?? entry.name,
        jockey: entry.jockey,
        finishTime: "",
        margin: "",
        popularity: entry.popularity,
        odds: entry.odds,
      };
    });

    const top3 = finishers.filter((entry) => entry.position > 0).sort((a, b) => a.position - b.position).slice(0, 3);
    if (top3.length === 0) return undefined;

    const winner = top3[0];
    return {
      updatedAt: new Date().toISOString(),
      winnerHorseId: winner.horseId,
      winnerHorseName: winner.name,
      top3HorseIds: top3.map((entry) => entry.horseId).filter((value): value is string => Boolean(value)),
      top3HorseNames: top3.map((entry) => entry.name),
      finishers,
      payouts: {
        tansho: parsePayoutRow(resultHtml, "Tansho") ?? undefined,
        fukusho: parsePayoutRow(resultHtml, "Fukusho") ?? undefined,
      },
    };
  } catch {
    return undefined;
  }
}

function startOfWeekMonday(dateString: string) {
  const date = new Date(`${dateString}T00:00:00+09:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function buildLegacyResult(legacyRace: (typeof LEGACY_ARCHIVED_RACES)[number]): RaceResultRecord | undefined {
  if (!legacyRace.result?.winnerHorseId || !Array.isArray(legacyRace.result.top3HorseIds)) return undefined;

  const horseMap = new Map(legacyRace.horses.map((horse) => [horse.id, horse]));
  const explicitPositions = Array.isArray(legacyRace.result.positions) ? legacyRace.result.positions : [];
  const explicitByHorseId = new Map(explicitPositions.map((entry) => [String(entry.horseId), Number(entry.position)]));
  const mergedHorseIds = [
    ...legacyRace.result.top3HorseIds.map((id) => String(id)),
    ...explicitPositions.map((entry) => String(entry.horseId)),
  ].filter(Boolean);
  const uniqueHorseIds = [...new Set(mergedHorseIds)];

  const finishers = uniqueHorseIds
    .map((horseId) => {
      const horse = horseMap.get(horseId);
      if (!horse) return null;
      const top3Index = legacyRace.result?.top3HorseIds.findIndex((id) => String(id) === horseId) ?? -1;
      const explicitPosition = explicitByHorseId.get(horseId);
      const position =
        top3Index >= 0
          ? top3Index + 1
          : Number.isFinite(explicitPosition)
            ? Number(explicitPosition)
            : 99;
      return {
        position,
        horseId,
        horseNumber: Number(horse.gateNumber ?? 0),
        name: horse.name,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left, right) => left.position - right.position)
    .slice(0, 3);

  const top3HorseNames = legacyRace.result.top3HorseIds
    .map((horseId) => horseMap.get(String(horseId))?.name ?? "")
    .filter(Boolean);

  return {
    updatedAt: new Date(`${legacyRace.date}T18:00:00+09:00`).toISOString(),
    winnerHorseId: String(legacyRace.result.winnerHorseId),
    top3HorseIds: legacyRace.result.top3HorseIds.map((horseId) => String(horseId)),
    finishers,
    payouts: {
      tansho: undefined,
      fukusho: undefined,
    },
    winnerHorseName: top3HorseNames[0],
    top3HorseNames,
  };
}

function mergeLegacyPreferredResult(
  fallbackResult: RaceResultRecord | undefined,
  scrapedResult: RaceResultRecord | undefined
): RaceResultRecord | undefined {
  if (!fallbackResult) return scrapedResult;
  if (!scrapedResult) return fallbackResult;

  return {
    updatedAt: scrapedResult.updatedAt ?? fallbackResult.updatedAt,
    winnerHorseId: fallbackResult.winnerHorseId ?? scrapedResult.winnerHorseId,
    winnerHorseName: fallbackResult.winnerHorseName ?? scrapedResult.winnerHorseName,
    top3HorseIds: fallbackResult.top3HorseIds?.length ? fallbackResult.top3HorseIds : scrapedResult.top3HorseIds,
    top3HorseNames: fallbackResult.top3HorseNames?.length ? fallbackResult.top3HorseNames : scrapedResult.top3HorseNames,
    finishers: fallbackResult.finishers?.length ? fallbackResult.finishers : scrapedResult.finishers,
    payouts: {
      tansho: scrapedResult.payouts?.tansho ?? fallbackResult.payouts?.tansho,
      fukusho: scrapedResult.payouts?.fukusho ?? fallbackResult.payouts?.fukusho,
    },
  };
}

type BackfillTarget = {
  origin: "current" | "archive" | "legacy";
  weekOf: string;
  raceDate: string;
  race: WeeklyRaceRecord;
};

async function buildBackfillTargets(weekly: WeeklyRacesFile): Promise<BackfillTarget[]> {
  const targets: BackfillTarget[] = [];

  for (const race of weekly.currentWeek?.races ?? []) {
    if (!race?.result?.winnerHorseId) continue;
    targets.push({
      origin: "current",
      weekOf: String(weekly.currentWeek?.weekOf ?? startOfWeekMonday(new Date().toISOString().slice(0, 10))),
      raceDate: getArchiveRaceDate(String(weekly.currentWeek?.weekOf ?? startOfWeekMonday(new Date().toISOString().slice(0, 10))), race.day),
      race,
    });
  }

  for (const archive of weekly.archives ?? []) {
    for (const race of archive.races ?? []) {
      if (!race?.result?.winnerHorseId) continue;
      targets.push({
        origin: "archive",
        weekOf: String(archive.weekOf ?? ""),
        raceDate: getArchiveRaceDate(String(archive.weekOf ?? ""), race.day),
        race,
      });
    }
  }

  for (const legacyRace of LEGACY_ARCHIVED_RACES) {
    const resolvedRaceId = normalizeHorseId(legacyRace.raceId) || buildLegacyRaceId(legacyRace.courseId, legacyRace.date);
    const scrapedResult = legacyRace.raceId ? await fetchLegacyRaceResult(legacyRace.raceId, legacyRace.horses) : undefined;
    const fallbackResult = buildLegacyResult(legacyRace);
    const mergedResult = mergeLegacyPreferredResult(fallbackResult, scrapedResult);
    const syntheticRace: WeeklyRaceRecord = {
      courseId: legacyRace.courseId,
      raceId: resolvedRaceId,
      label: legacyRace.label,
      grade: ARCHIVED_COURSES.find((course) => course.id === legacyRace.courseId)?.grade ?? "OP",
      day: new Date(`${legacyRace.date}T00:00:00+09:00`).getDay() === 0 ? "Sun" : "Sat",
      venue: ARCHIVED_COURSES.find((course) => course.id === legacyRace.courseId)?.venue ?? "",
      surface: ARCHIVED_COURSES.find((course) => course.id === legacyRace.courseId)?.surface ?? "Turf",
      distance: ARCHIVED_COURSES.find((course) => course.id === legacyRace.courseId)?.distance ?? 0,
      straightLength: ARCHIVED_COURSES.find((course) => course.id === legacyRace.courseId)?.straightLength ?? 360,
      oddsSource: "legacy",
      horses: legacyRace.horses.map((horse) => ({ ...horse })),
      result: mergedResult,
    };

    if (!syntheticRace.result?.winnerHorseId) continue;
    targets.push({
      origin: "legacy",
      weekOf: startOfWeekMonday(legacyRace.date),
      raceDate: legacyRace.date,
      race: syntheticRace,
    });
  }

  return targets;
}

async function main() {
  const weekly = await readJson<WeeklyRacesFile>(WEEKLY_RACES_PATH, { currentWeek: { races: [] }, archives: [] });
  const state = await readJson<RoutineState>(STATE_PATH, {});
  const { lines, latestByRaceId } = await readExistingSnapshots();
  const targets = await buildBackfillTargets(weekly);
  const existingRecommendations = new Map<string, number>();
  const recommendations = Array.isArray(state.tanpukuRecommendations) ? [...state.tanpukuRecommendations] : [];

  for (const [index, entry] of recommendations.entries()) {
    const courseId = normalizeHorseId(entry.courseId);
    const pickType = String(entry.pickType ?? "") === "value" ? "value" : String(entry.pickType ?? "") === "win" ? "win" : null;
    if (!courseId || !pickType) continue;
    existingRecommendations.set(buildRecommendationKey(courseId, pickType), index);
  }

  const appendedSnapshotLines: string[] = [];
  const addedRecommendations: BackfilledRecommendation[] = [];

  for (const target of targets) {
    const { origin, weekOf, raceDate, race } = target;
    const raceId = normalizeHorseId(race.raceId);
    if (!raceId || !race.result?.winnerHorseId || !Array.isArray(race.horses) || race.horses.length === 0) {
      continue;
    }

    let snapshot = latestByRaceId[raceId];
    if (!snapshot) {
      const course = getArchivedCourse(race);
      const condition = createDefaultCondition(course);
      const horses = race.horses.map((horse) => ({ ...horse })) as Horse[];
      const results = runMonteCarlo(horses, course, condition, MONTE_CARLO_RUNS);
      snapshot = await buildPredictionSnapshot({
        results,
        horses,
        course,
        condition,
        simulationCount: MONTE_CARLO_RUNS,
        raceId,
        oddsFetchedAt: race.result?.updatedAt ?? null,
        oddsSource: race.oddsSource ?? "official",
        predictionOrigin: "backfill",
        scoringVersion: DEFAULT_SCORING_VERSION,
      });
      latestByRaceId[raceId] = snapshot;
      appendedSnapshotLines.push(JSON.stringify(snapshot));
    } else if (
      origin !== "current" &&
      (snapshot.predictionOrigin !== "backfill" || snapshot.scoringVersion !== DEFAULT_SCORING_VERSION)
    ) {
      snapshot = {
        ...snapshot,
        predictionOrigin: "backfill",
        scoringVersion: DEFAULT_SCORING_VERSION,
        capturedAt: new Date().toISOString(),
      };
      latestByRaceId[raceId] = snapshot;
      appendedSnapshotLines.push(JSON.stringify(snapshot));
    }

    const postedAt = createPostedAt(raceDate);
    const winKey = buildRecommendationKey(race.courseId, "win");
    const valueKey = buildRecommendationKey(race.courseId, "value");
    const routinePair = pickRoutineTanpukuPair(
      {
        courseId: race.courseId,
        label: race.label,
        day: race.day,
        distance: race.distance,
        straightLength: race.straightLength,
        trackBias: { innerOuter: 0, frontBack: 0 },
        horses: race.horses,
      },
      false,
      true
    );
    const routineWinEntry = routinePair?.winPick ?? null;
    const routineValueEntry = routinePair?.valuePick ?? null;
    const winRow =
      (routineWinEntry && snapshot.rankedRows.find((row) => row.horseId === routineWinEntry.horse.id)) ??
      pickWinRow(snapshot);
    // When scoring engine ran but returned null valuePick, respect the quality gate
    const valueRow = routinePair && !routineValueEntry
      ? null
      : (routineValueEntry && snapshot.rankedRows.find((row) => row.horseId === routineValueEntry.horse.id)) ??
        pickValueRow(snapshot);

    if (winRow) {
      const recommendation = applyManualRecommendationOverride(buildBackfilledRecommendation({
        archiveWeekOf: weekOf,
        race,
        row: winRow,
        scoredEntry: routineWinEntry,
        runnerUp: routinePair?.winRunnerUp ?? null,
        pickType: "win",
        postedAt,
      }));
      recommendation.stage = `${origin}_backfill`;
      recommendation.source = `${origin}_simulation_backfill`;

      const existingIndex = existingRecommendations.get(winKey);
      if (existingIndex === undefined) {
        recommendations.push(recommendation);
        addedRecommendations.push(recommendation);
        existingRecommendations.set(winKey, recommendations.length - 1);
      } else if (shouldReplaceRecommendation(recommendations[existingIndex], recommendation)) {
        recommendations[existingIndex] = recommendation;
        addedRecommendations.push(recommendation);
      }
    }

    if (valueRow) {
      const recommendation = applyManualRecommendationOverride(buildBackfilledRecommendation({
        archiveWeekOf: weekOf,
        race,
        row: valueRow,
        scoredEntry: routineValueEntry,
        runnerUp: routinePair?.valueRunnerUp ?? null,
        pickType: "value",
        postedAt,
      }));
      recommendation.stage = `${origin}_backfill`;
      recommendation.source = `${origin}_simulation_backfill`;

      const existingIndex = existingRecommendations.get(valueKey);
      if (existingIndex === undefined) {
        recommendations.push(recommendation);
        addedRecommendations.push(recommendation);
        existingRecommendations.set(valueKey, recommendations.length - 1);
      } else if (shouldReplaceRecommendation(recommendations[existingIndex], recommendation)) {
        recommendations[existingIndex] = recommendation;
        addedRecommendations.push(recommendation);
      }
    }
  }

  const normalizedSnapshotLines = lines.map(normalizeExistingSnapshotLine);
  const snapshotLinesChanged = normalizedSnapshotLines.some((line, index) => line !== lines[index]);

  if (appendedSnapshotLines.length > 0 || snapshotLinesChanged) {
    await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
    const currentText = normalizedSnapshotLines.length > 0 ? `${normalizedSnapshotLines.join("\n")}\n` : "";
    await fs.writeFile(SNAPSHOT_PATH, `${currentText}${appendedSnapshotLines.join("\n")}\n`, "utf8");
  }

  const normalizedRecommendations = recommendations.map((entry) => {
    const raceId = normalizeHorseId(entry.raceId);
    const pickType = String(entry.pickType ?? "") === "value" ? "value" : "win";
    const horseId = normalizeHorseId(entry.horseId);
    const overrideKey = `${raceId}::${pickType}::${horseId}`;
    const override = MANUAL_RECOMMENDATION_OVERRIDES[overrideKey];
    const normalizedOrigin =
      entry.source === "backfill" || (typeof entry.source === "string" && String(entry.source).includes("backfill"))
        ? "backfill"
        : String(entry.predictionOrigin ?? "saved_live");
    const normalizedScoringVersion = String(entry.scoringVersion ?? DEFAULT_SCORING_VERSION);
    const baseEntry = {
      ...entry,
      predictionOrigin: normalizedOrigin,
      scoringVersion: normalizedScoringVersion,
    };
    return override ? { ...baseEntry, ...override } : baseEntry;
  });

  const recommendationsChanged =
    addedRecommendations.length > 0 ||
    normalizedRecommendations.length !== recommendations.length ||
    normalizedRecommendations.some((entry, index) => JSON.stringify(entry) !== JSON.stringify(recommendations[index]));

  if (recommendationsChanged) {
    state.tanpukuRecommendations = normalizedRecommendations;
    await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
  }

  console.log(
    JSON.stringify(
      {
        targetRaceCount: targets.length,
        snapshotsAdded: appendedSnapshotLines.length,
        recommendationsAdded: addedRecommendations.length,
      },
      null,
      2
    )
  );
}

function getArchiveRaceDate(weekOf: string, day: string) {
  const monday = new Date(`${weekOf}T00:00:00+09:00`);
  const offset = day === "Sun" ? 6 : 5;
  monday.setDate(monday.getDate() + offset);
  return monday.toISOString().slice(0, 10);
}

void main();
