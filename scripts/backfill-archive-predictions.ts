import fs from "node:fs/promises";
import path from "node:path";
import { ARCHIVED_COURSES } from "../lib/courses";
import { buildPredictionSnapshot } from "../lib/predictionSnapshots";
import { runMonteCarlo } from "../lib/simulation";
import type { Course, Horse, PredictionSnapshot, PredictionSnapshotRow, RaceCondition } from "../lib/types";

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
  top3HorseIds?: string[];
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
  archives?: WeeklyArchiveRecord[];
};

type RoutineState = {
  tanpukuRecommendations?: Array<Record<string, unknown>>;
};

type SettlementStatus = "pending_result" | "pending_payouts" | "settled";
type BetOutcome = "not_settled" | "hit" | "miss" | "hit_missing_payout";
type PayoutSource = "official" | "missing";

type BackfilledRecommendation = {
  weekOf: string;
  day: string;
  stage: "archive_backfill";
  source: "archive_simulation_backfill";
  postedAt: string;
  settledAt: string | null;
  courseId: string;
  raceLabel: string;
  pickType: "win" | "value";
  horseId: string;
  horseName: string;
  realOdds: number;
  placeOdds: number;
  winProb: number;
  placeProb: number;
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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
  const matched = ARCHIVED_COURSES.find((course) => course.id === race.courseId);
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
  pickType: "win" | "value";
  postedAt: string;
}): BackfilledRecommendation {
  const { archiveWeekOf, race, row, pickType, postedAt } = params;
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

  const winProbDecimal = clamp((Number(row.winProb ?? 0) || 0) / 100, 0.03, 0.95);
  const placeProbDecimal = clamp(winProbDecimal * 2.2 + 0.05, 0.12, 0.9);
  const realOdds = Number(row.realOdds ?? 0) > 0 ? Number(row.realOdds) : Number(row.fairOdds ?? 0);
  const placeOdds = Math.max(1.1, (realOdds > 0 ? realOdds : 5) * 0.35 + 1.0);

  return {
    weekOf: archiveWeekOf,
    day: race.day,
    stage: "archive_backfill",
    source: "archive_simulation_backfill",
    postedAt,
    settledAt: settlementStatus === "settled" ? (result?.updatedAt ?? new Date().toISOString()) : null,
    courseId: race.courseId,
    raceLabel: race.label,
    pickType,
    horseId: row.horseId,
    horseName: row.horseName,
    realOdds: round1(realOdds),
    placeOdds: round1(placeOdds),
    winProb: round3(winProbDecimal),
    placeProb: round3(placeProbDecimal),
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

function buildRecommendationKey(courseId: string, pickType: "win" | "value") {
  return `${courseId}::${pickType}`;
}

async function main() {
  const weekly = await readJson<WeeklyRacesFile>(WEEKLY_RACES_PATH, { archives: [] });
  const state = await readJson<RoutineState>(STATE_PATH, {});
  const { lines, latestByRaceId } = await readExistingSnapshots();

  const archives = Array.isArray(weekly.archives) ? weekly.archives : [];
  const existingRecommendations = new Map<string, true>();
  const recommendations = Array.isArray(state.tanpukuRecommendations) ? [...state.tanpukuRecommendations] : [];

  for (const entry of recommendations) {
    const courseId = normalizeHorseId(entry.courseId);
    const pickType = String(entry.pickType ?? "") === "value" ? "value" : String(entry.pickType ?? "") === "win" ? "win" : null;
    if (!courseId || !pickType) continue;
    existingRecommendations.set(buildRecommendationKey(courseId, pickType), true);
  }

  const appendedSnapshotLines: string[] = [];
  const addedRecommendations: BackfilledRecommendation[] = [];

  for (const archive of archives) {
    for (const race of archive.races ?? []) {
      const raceId = normalizeHorseId(race.raceId);
      if (!raceId || !race.result?.winnerHorseId || !Array.isArray(race.horses) || race.horses.length === 0) {
        continue;
      }

      let snapshot = latestByRaceId[raceId];
      if (!snapshot) {
        const course = getArchivedCourse(race);
        const condition = createDefaultCondition(course);
        const horses = race.horses.map((horse) => ({ ...horse })) as Horse[];
        const results = runMonteCarlo(horses, course, condition, 100);
        snapshot = await buildPredictionSnapshot({
          results,
          horses,
          course,
          condition,
          simulationCount: 100,
          oddsFetchedAt: race.result?.updatedAt ?? null,
          oddsSource: race.oddsSource ?? "official",
        });
        latestByRaceId[raceId] = snapshot;
        appendedSnapshotLines.push(JSON.stringify(snapshot));
      }

      const postedAt = createPostedAt(getArchiveRaceDate(archive.weekOf, race.day));
      const winKey = buildRecommendationKey(race.courseId, "win");
      const valueKey = buildRecommendationKey(race.courseId, "value");
      const winRow = pickWinRow(snapshot);
      const valueRow = pickValueRow(snapshot);

      if (winRow && !existingRecommendations.has(winKey)) {
        const recommendation = buildBackfilledRecommendation({
          archiveWeekOf: archive.weekOf,
          race,
          row: winRow,
          pickType: "win",
          postedAt,
        });
        recommendations.push(recommendation);
        addedRecommendations.push(recommendation);
        existingRecommendations.set(winKey, true);
      }

      if (valueRow && !existingRecommendations.has(valueKey)) {
        const recommendation = buildBackfilledRecommendation({
          archiveWeekOf: archive.weekOf,
          race,
          row: valueRow,
          pickType: "value",
          postedAt,
        });
        recommendations.push(recommendation);
        addedRecommendations.push(recommendation);
        existingRecommendations.set(valueKey, true);
      }
    }
  }

  if (appendedSnapshotLines.length > 0) {
    await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
    const currentText = lines.length > 0 ? `${lines.join("\n")}\n` : "";
    await fs.writeFile(SNAPSHOT_PATH, `${currentText}${appendedSnapshotLines.join("\n")}\n`, "utf8");
  }

  if (addedRecommendations.length > 0) {
    state.tanpukuRecommendations = recommendations;
    await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
  }

  console.log(
    JSON.stringify(
      {
        archivedRaceCount: archives.reduce((sum, archive) => sum + (archive.races?.length ?? 0), 0),
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
