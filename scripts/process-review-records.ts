import fs from "node:fs/promises";
import path from "node:path";
import { buildPredictionSnapshot } from "@/lib/predictionSnapshots";
import {
  buildRaceDateFromWeekOf,
  buildReviewRaceMeta,
  combineRaceDateAndTime,
  createReviewRecordFromSnapshot,
  extractRaceId,
  loadReviewRecords,
  upsertManyReviewRecords,
} from "@/lib/reviewRecords";
import { runMonteCarlo } from "@/lib/simulation";
import { MONTE_CARLO_RUNS } from "@/lib/simulationConfig";
import type { PredictionSnapshot, RaceReviewRecord, ReviewSelectionHorse } from "@/lib/types";

const ROOT = process.cwd();
const WEEKLY_RACES_PATH = path.join(ROOT, "data", "weekly-races.json");
const SNAPSHOT_PATH = path.join(ROOT, "data", "prediction-snapshots.jsonl");
const PROCESS_LOCK_PATH = path.join(ROOT, "data", "review-records.lock");

type DayLabel = "Sat" | "Sun";
type Phase = "snapshot" | "settle" | "all";

type WeeklyRace = {
  courseId: string;
  raceId?: string;
  label?: string;
  weekOf?: string;
  day?: string;
  raceDate?: string;
  venue?: string;
  venueKey?: string;
  raceNumber?: number;
  surface?: "Turf" | "Dirt";
  distance?: number;
  straightLength?: number;
  scheduledStartTime?: string;
  oddsSource?: string;
  horses: Array<Record<string, unknown>>;
  result?: {
    winnerHorseId?: string;
    top3HorseIds?: string[];
    finishers?: Array<Record<string, unknown>>;
    payouts?: {
      tansho?: { resultNumbers?: number[]; payouts?: number[] };
      fukusho?: { resultNumbers?: number[]; payouts?: number[] };
      wide?: { resultNumbers?: number[][]; payouts?: number[] };
    };
  };
};

type WeeklyRacesFile = {
  currentWeek?: {
    weekOf?: string;
    races?: WeeklyRace[];
  };
  archives?: Array<{
    weekOf?: string;
    races?: WeeklyRace[];
  }>;
};

type RaceScope = {
  weekOf: string | null;
  race: WeeklyRace;
};

function argValue(name: string): string | null {
  const matched = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return matched ? matched.slice(name.length + 3) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`) || argValue(name) === "true";
}

function normalizeString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeNumber(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function jstNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
}

function toIso(value: Date) {
  return value.toISOString();
}

function safeRaceDate(race: WeeklyRace, weekOf: string | null) {
  return normalizeString(race.raceDate) ?? buildRaceDateFromWeekOf(weekOf, normalizeString(race.day));
}

function createDefaultCondition(courseId: string) {
  return {
    courseId,
    trackBias: { innerOuter: 0, frontBack: 0 },
    groundCondition: "Firm" as const,
    weather: "Sunny" as const,
    windDirection: "Crosswind" as const,
    windSpeed: 3,
    paceScenario: "Average" as const,
  };
}

function hasConfirmedResult(race: WeeklyRace) {
  const winnerHorseId = normalizeString(race.result?.winnerHorseId);
  const top3HorseIds = Array.isArray(race.result?.top3HorseIds) ? race.result?.top3HorseIds.filter(Boolean) : [];
  return Boolean(winnerHorseId && top3HorseIds.length > 0);
}

function isCancelledHorse(horse: Record<string, unknown> | null | undefined) {
  const text = [
    horse?.status,
    horse?.raceStatus,
    horse?.entryStatus,
    horse?.withdrawStatus,
    horse?.scratchStatus,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  return ["取消", "除外", "scratched", "scratch", "withdrawn", "withdraw", "cancelled", "canceled"].some((token) =>
    text.includes(token.toLowerCase())
  );
}

async function withProcessLock<T>(fn: () => Promise<T>): Promise<T> {
  await fs.mkdir(path.dirname(PROCESS_LOCK_PATH), { recursive: true });
  const startedAt = Date.now();

  while (true) {
    try {
      const handle = await fs.open(PROCESS_LOCK_PATH, "wx");
      await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`, "utf8");
      try {
        return await fn();
      } finally {
        await handle.close();
        await fs.rm(PROCESS_LOCK_PATH, { force: true });
      }
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST") throw error;
      if (Date.now() - startedAt > 30_000) {
        throw new Error(`timed out waiting for process lock: ${PROCESS_LOCK_PATH}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

async function readWeeklyRaces(): Promise<WeeklyRacesFile> {
  const raw = await fs.readFile(WEEKLY_RACES_PATH, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

function collectRaceScopes(weekly: WeeklyRacesFile, includeArchives: boolean): RaceScope[] {
  const scopes: RaceScope[] = [];
  const currentWeekOf = normalizeString(weekly.currentWeek?.weekOf);
  const currentRaces = Array.isArray(weekly.currentWeek?.races) ? weekly.currentWeek?.races ?? [] : [];
  for (const race of currentRaces) {
    scopes.push({ weekOf: currentWeekOf, race });
  }

  if (!includeArchives) {
    return scopes;
  }

  const archives = Array.isArray(weekly.archives) ? weekly.archives : [];
  for (const archive of archives) {
    const archiveWeekOf = normalizeString(archive.weekOf);
    const archiveRaces = Array.isArray(archive.races) ? archive.races ?? [] : [];
    for (const race of archiveRaces) {
      scopes.push({ weekOf: archiveWeekOf, race });
    }
  }

  return scopes;
}

function raceHorseById(race: WeeklyRace, horseId: string | null | undefined) {
  if (!horseId) return null;
  return race.horses.find((horse) => String(horse.id ?? "") === String(horseId)) ?? null;
}

function createTieBrokenScoredRows(scoredRows: Array<Record<string, unknown>>) {
  return [...scoredRows].sort((left, right) => {
    const placeScoreDiff = Number((right.placeScore ?? 0)) - Number((left.placeScore ?? 0));
    if (placeScoreDiff !== 0) return placeScoreDiff;
    const placeProbDiff = Number((right.placeProb ?? 0)) - Number((left.placeProb ?? 0));
    if (placeProbDiff !== 0) return placeProbDiff;
    const leftGate = Number((left.horse as Record<string, unknown> | undefined)?.gateNumber ?? 999);
    const rightGate = Number((right.horse as Record<string, unknown> | undefined)?.gateNumber ?? 999);
    if (leftGate !== rightGate) return leftGate - rightGate;
    return String(((left.horse as Record<string, unknown> | undefined)?.id ?? "")).localeCompare(
      String(((right.horse as Record<string, unknown> | undefined)?.id ?? ""))
    );
  });
}

function hasReviewRecordChanged(existing: RaceReviewRecord, next: RaceReviewRecord) {
  return JSON.stringify(existing) !== JSON.stringify(next);
}

function getHorseName(race: WeeklyRace, horseId: string | null | undefined) {
  return normalizeString(raceHorseById(race, horseId)?.name) ?? null;
}

function buildSelectionHorseFromPairEntry(
  entry: Record<string, unknown> | null,
  selectionMethod: "rank2" | "light_adjusted" | "stable_next"
): ReviewSelectionHorse | null {
  if (!entry) return null;
  const horse = (entry.horse ?? null) as Record<string, unknown> | null;
  const horseId = normalizeString(horse?.id);
  if (!horseId) return null;
  return {
    horseId,
    horseName: normalizeString(horse?.name),
    rank: normalizeNumber(entry.rank) ?? null,
    score: normalizeNumber(entry.placeScore) ?? normalizeNumber(entry.valueScore),
    winProb: normalizeNumber(entry.winProb),
    realOdds: normalizeNumber(horse?.realOdds),
    placeOdds: normalizeNumber(entry.placeOdds),
    placeProb: normalizeNumber(entry.placeProb),
    placeScore: normalizeNumber(entry.placeScore),
    valueScore: normalizeNumber(entry.valueScore),
    selectionMethod,
    selectionReason: normalizeString(entry.selectionReason),
    overbetLabel: normalizeString(entry.overbetLabel),
    scoreGap: normalizeNumber(entry.scoreGap),
    runnerUpHorseId: normalizeString(entry.runnerUpHorseId),
    runnerUpHorseName: normalizeString(entry.runnerUpHorseName),
    runnerUpPlaceScore: normalizeNumber(entry.runnerUpPlaceScore),
    runnerUpPlaceProb: normalizeNumber(entry.runnerUpPlaceProb),
    settlementStatus: "pending_result",
    tanOutcome: "not_settled",
    fukuOutcome: "not_settled",
    tanPayout: 0,
    fukuPayout: 0,
    tanPayoutSource: "missing",
    fukuPayoutSource: "missing",
  };
}

function toSnapshotResults(snapshot: PredictionSnapshot) {
  return snapshot.rankedRows.map((row) => ({
    horseId: row.horseId,
    winCount: Math.max(1, Math.round((row.winProb / 100) * MONTE_CARLO_RUNS)),
    bestTime: Math.max(1, 100 - row.score),
  }));
}

function findHorseFinisher(race: WeeklyRace, horseId: string | null | undefined) {
  if (!horseId) return null;
  const finishers = Array.isArray(race.result?.finishers) ? race.result?.finishers ?? [] : [];
  return finishers.find((finisher) => String(finisher.horseId ?? "") === String(horseId)) ?? null;
}

function hasPayoutTable(table: { resultNumbers?: unknown; payouts?: unknown } | undefined) {
  return Boolean(Array.isArray(table?.resultNumbers) && table.resultNumbers.length > 0 && Array.isArray(table?.payouts) && table.payouts.length > 0);
}

function payoutForHorseNumber(
  table: { resultNumbers?: unknown[]; payouts?: unknown[] } | undefined,
  horseNumber: number | null | undefined
) {
  if (!hasPayoutTable(table) || !(Number(horseNumber) > 0)) return null;
  const resultNumbers = (table?.resultNumbers ?? []).map((value) => Number(value));
  const payouts = (table?.payouts ?? []).map((value) => Number(value));
  const index = resultNumbers.findIndex((value) => value === Number(horseNumber));
  if (index < 0) return null;
  const payout = payouts[index];
  return Number.isFinite(payout) ? Math.round(payout) : null;
}

function payoutForWidePair(
  table: { resultNumbers?: unknown[]; payouts?: unknown[] } | undefined,
  horseNumbers: [number, number] | null
) {
  if (!table || !Array.isArray(table.resultNumbers) || !Array.isArray(table.payouts) || !horseNumbers) return null;
  const sortedTarget = [...horseNumbers].sort((a, b) => a - b);
  for (let index = 0; index < table.resultNumbers.length; index += 1) {
    const rawPair = table.resultNumbers[index];
    const pair = Array.isArray(rawPair) ? rawPair : [];
    const normalizedPair = pair
      .map((value: unknown) => Number(value))
      .filter((value): value is number => Number.isFinite(value))
      .sort((a: number, b: number) => a - b);
    if (normalizedPair.length === 2 && normalizedPair[0] === sortedTarget[0] && normalizedPair[1] === sortedTarget[1]) {
      const payout = Number(table.payouts[index]);
      return Number.isFinite(payout) ? Math.round(payout) : null;
    }
  }
  return null;
}

async function appendSnapshot(snapshot: PredictionSnapshot) {
  await fs.appendFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot)}\n`, "utf8");
}

async function createSnapshotRecords(params: {
  races: RaceScope[];
  now: Date;
  dayFilter: DayLabel | null;
  raceIdFilter: string | null;
  refreshExisting: boolean;
}) {
  const records = await loadReviewRecords();
  const nextRecords: RaceReviewRecord[] = [];

  for (const { race, weekOf } of params.races) {
    const raceId = extractRaceId(race.raceId ?? race.courseId);
    if (!raceId) continue;
    if (params.dayFilter && race.day !== params.dayFilter) continue;
    if (params.raceIdFilter && raceId !== params.raceIdFilter) continue;

    const raceDate = safeRaceDate(race, weekOf);
    const scheduledStart = combineRaceDateAndTime(raceDate, normalizeString(race.scheduledStartTime));
    if (scheduledStart) {
      const snapshotDueAt = new Date(new Date(scheduledStart).getTime() - 5 * 60_000);
      if (params.now.getTime() < snapshotDueAt.getTime()) continue;
    } else if (!hasConfirmedResult(race)) {
      continue;
    }
    if (records[raceId]?.snapshot && !params.refreshExisting) continue;

    const course = {
      id: race.courseId,
      name: normalizeString(race.label) ?? race.courseId,
      displayName: normalizeString(race.label) ?? race.courseId,
      venue: normalizeString(race.venue) ?? undefined,
      raceNumber: normalizeNumber(race.raceNumber) ?? undefined,
      distance: normalizeNumber(race.distance) ?? 0,
      surface: race.surface ?? "Turf",
      segments: [],
      straightLength: normalizeNumber(race.straightLength) ?? 360,
      hashtag: `#${normalizeString(race.label)?.replace(/\s+/g, "") ?? raceId}`,
    };
    const condition = createDefaultCondition(race.courseId);
    const horses = race.horses as never[];
    const simulationResults = runMonteCarlo(horses, course, condition, MONTE_CARLO_RUNS);
    const tanpukuSelectionModule = await import("../lib/tanpukuSelection.mjs");
    const tanpukuPair = tanpukuSelectionModule.pickTanpukuPair(
      {
        courseId: race.courseId,
        label: normalizeString(race.label) ?? race.courseId,
        distance: normalizeNumber(race.distance) ?? 0,
        straightLength: normalizeNumber(race.straightLength) ?? 360,
        trackBias: { innerOuter: 0, frontBack: 0 },
        horses,
      },
      false,
      true
    );

    const snapshot = await buildPredictionSnapshot({
      results: simulationResults,
      horses,
      course,
      condition,
      simulationCount: MONTE_CARLO_RUNS,
      raceId,
      raceDate,
      raceName: normalizeString(race.label),
      venue: normalizeString(race.venue),
      venueKey: normalizeString(race.venueKey),
      raceNumber: normalizeNumber(race.raceNumber),
      scheduledStartTime: scheduledStart,
      snapshotType: "pre_race_final",
      oddsSource: normalizeString(race.oddsSource),
      predictionOrigin: "saved_live",
    });

    const scoredRows = Array.isArray(tanpukuPair?.scored) ? tanpukuPair.scored : [];
    const eligibleScoredRows = createTieBrokenScoredRows(
      scoredRows.filter((entry: Record<string, unknown>) => !isCancelledHorse((entry.horse ?? null) as Record<string, unknown> | null))
    );
    const rankMap = new Map(eligibleScoredRows.map((entry: Record<string, unknown>, index: number) => [String((entry.horse as Record<string, unknown>)?.id ?? ""), index + 1]));
    const honmei = buildSelectionHorseFromPairEntry(
      tanpukuPair?.winPick ? { ...tanpukuPair.winPick, rank: rankMap.get(String(tanpukuPair.winPick.horse.id)) ?? 1 } : null,
      "rank2"
    );
    const fallbackOpponentEntry = tanpukuSelectionModule.pickOpponentEntry(
      scoredRows,
      honmei?.horseId ?? tanpukuPair?.winPick?.horse?.id ?? null
    ).entry;
    const selectedOpponentSource =
      tanpukuPair?.opponentPick &&
      !isCancelledHorse(raceHorseById(race, tanpukuPair.opponentPick.horse.id) as Record<string, unknown> | null)
        ? tanpukuPair.opponentPick
        : fallbackOpponentEntry;
    const opponentBase = selectedOpponentSource
      ? {
          ...(scoredRows.find((entry: Record<string, unknown>) => String((entry.horse as Record<string, unknown>)?.id ?? "") === String(selectedOpponentSource.horse.id ?? selectedOpponentSource.horseId)) ??
            {
              horse: {
                id: selectedOpponentSource.horse?.id ?? selectedOpponentSource.horseId,
                name: selectedOpponentSource.horse?.name ?? selectedOpponentSource.horseName,
                realOdds: raceHorseById(race, selectedOpponentSource.horse?.id ?? selectedOpponentSource.horseId)?.realOdds ?? null,
              },
            }),
          rank: rankMap.get(String(selectedOpponentSource.horse?.id ?? selectedOpponentSource.horseId)) ?? 2,
          placeScore: selectedOpponentSource.placeScore,
          placeProb: selectedOpponentSource.placeProb,
          top3Stability: selectedOpponentSource.top3Stability,
          winProb: selectedOpponentSource.winProb,
          selectionReason: selectedOpponentSource.selectionReason,
          scoreGap:
            honmei?.placeScore !== null &&
            honmei?.placeScore !== undefined &&
            selectedOpponentSource.placeScore !== null &&
            selectedOpponentSource.placeScore !== undefined
              ? Number((honmei.placeScore - Number(selectedOpponentSource.placeScore)).toFixed(3))
              : null,
        }
      : null;
    const opponent = buildSelectionHorseFromPairEntry(opponentBase, "stable_next");
    const widePick = tanpukuPair?.widePick ?? tanpukuPair?.valuePick ?? null;
    const wide = buildSelectionHorseFromPairEntry(
      widePick
        ? {
            ...widePick,
            rank: rankMap.get(String(widePick.horse.id)) ?? null,
          }
        : null,
      "light_adjusted"
    );

    if (opponent?.horseId) {
      snapshot.opponentHorseId = opponent.horseId;
      snapshot.opponentSelectionMethod = "stable_next";
      snapshot.opponentScore = opponent.score ?? null;
      snapshot.opponentRank = opponent.rank ?? null;
      snapshot.pairScoreGap =
        honmei?.score !== null && honmei?.score !== undefined && opponent.score !== null && opponent.score !== undefined
          ? Number((honmei.score - opponent.score).toFixed(3))
          : snapshot.pairScoreGap ?? null;
      snapshot.pairRankGap =
        honmei?.rank !== null && honmei?.rank !== undefined && opponent.rank !== null && opponent.rank !== undefined
          ? opponent.rank - honmei.rank
          : snapshot.pairRankGap ?? null;
    }

    if (wide?.horseId) {
      snapshot.valueHorseId = wide.horseId;
    }

    const reviewRecord = createReviewRecordFromSnapshot({
      meta: buildReviewRaceMeta({
        raceId,
        courseId: race.courseId,
        raceDate,
        weekOf,
        day: normalizeString(race.day),
        raceName: normalizeString(race.label),
        venue: normalizeString(race.venue),
        venueKey: normalizeString(race.venueKey),
        raceNumber: normalizeNumber(race.raceNumber),
        scheduledStartTime: scheduledStart,
      }),
      snapshot,
      honmei,
      opponent,
      wide,
      now: toIso(params.now),
    });

    nextRecords.push(reviewRecord);
    if (!records[raceId]?.snapshot || params.refreshExisting) {
      await appendSnapshot(snapshot);
    }
  }

  await upsertManyReviewRecords(nextRecords);
  return nextRecords.length;
}

function settleSelection(
  race: WeeklyRace,
  selection: ReviewSelectionHorse | null,
  includeTan: boolean
): ReviewSelectionHorse | null {
  if (!selection) return null;
  const winnerHorseId = normalizeString(race.result?.winnerHorseId);
  const top3HorseIds = Array.isArray(race.result?.top3HorseIds) ? race.result?.top3HorseIds.map((value) => String(value)) : [];
  const finisher = findHorseFinisher(race, selection.horseId);
  const horseNumber = normalizeNumber(finisher?.horseNumber);
  const tanPayout = includeTan ? payoutForHorseNumber(race.result?.payouts?.tansho, horseNumber) : 0;
  const fukuPayout = payoutForHorseNumber(race.result?.payouts?.fukusho, horseNumber);
  const tanHit = includeTan && winnerHorseId === selection.horseId;
  const fukuHit = top3HorseIds.includes(selection.horseId);
  const hasTan = includeTan ? hasPayoutTable(race.result?.payouts?.tansho) : true;
  const hasFuku = hasPayoutTable(race.result?.payouts?.fukusho);
  const settlementStatus =
    !winnerHorseId || top3HorseIds.length === 0
      ? "pending_result"
      : !hasTan || !hasFuku || (tanHit && tanPayout === null) || (fukuHit && fukuPayout === null)
        ? "pending_payouts"
        : "settled";

  return {
    ...selection,
    settlementStatus,
    tanOutcome: includeTan ? (tanHit ? (tanPayout !== null ? "hit" : "hit_missing_payout") : "miss") : "not_settled",
    fukuOutcome: fukuHit ? (fukuPayout !== null ? "hit" : "hit_missing_payout") : "miss",
    tanPayout: tanHit && tanPayout !== null ? tanPayout : 0,
    fukuPayout: fukuHit && fukuPayout !== null ? fukuPayout : 0,
    tanPayoutSource: hasTan ? "official" : "missing",
    fukuPayoutSource: hasFuku ? "official" : "missing",
  };
}

async function settleReviewRecords(params: {
  races: RaceScope[];
  now: Date;
  dayFilter: DayLabel | null;
  raceIdFilter: string | null;
  refreshExisting: boolean;
}) {
  const records = await loadReviewRecords();
  const nextRecords: RaceReviewRecord[] = [];

  for (const { race, weekOf } of params.races) {
    const raceId = extractRaceId(race.raceId ?? race.courseId);
    if (!raceId) continue;
    if (params.dayFilter && race.day !== params.dayFilter) continue;
    if (params.raceIdFilter && raceId !== params.raceIdFilter) continue;

    const existing = records[raceId];
    if (!existing?.snapshot) continue;
    if (existing.status === "review_ready" && !params.refreshExisting) continue;

    const raceDate = safeRaceDate(race, weekOf);
    const scheduledStart = normalizeString(existing.meta.scheduledStartTime) ?? combineRaceDateAndTime(raceDate, normalizeString(race.scheduledStartTime));
    if (scheduledStart) {
      const settleDueAt = new Date(new Date(scheduledStart).getTime() + 20 * 60_000);
      if (params.now.getTime() < settleDueAt.getTime()) continue;
    } else if (!hasConfirmedResult(race)) {
      continue;
    }

    const winnerHorseId = normalizeString(race.result?.winnerHorseId);
    const top3HorseIds = Array.isArray(race.result?.top3HorseIds) ? race.result?.top3HorseIds.map((value) => String(value)) : [];
    const resultFetchedAt = winnerHorseId && top3HorseIds.length > 0 ? toIso(params.now) : null;

    const settledHonmei = settleSelection(race, existing.honmei, true);
    const settledOpponent = settleSelection(race, existing.opponent, false);
    const settledWide = settleSelection(race, existing.wide, false);

    const honmeiFinisher = findHorseFinisher(race, existing.honmei?.horseId);
    const opponentFinisher = findHorseFinisher(race, existing.opponent?.horseId);
    const widePayout = payoutForWidePair(
      race.result?.payouts?.wide,
      honmeiFinisher && opponentFinisher
        ? [Number(honmeiFinisher.horseNumber), Number(opponentFinisher.horseNumber)].sort((a, b) => a - b) as [number, number]
        : null
    );
    const hasWide = hasPayoutTable(race.result?.payouts?.wide);
    const wideOutcome =
      honmeiFinisher && opponentFinisher && top3HorseIds.includes(String(existing.honmei?.horseId)) && top3HorseIds.includes(String(existing.opponent?.horseId))
        ? widePayout !== null
          ? "hit"
          : "hit_missing_payout"
        : winnerHorseId && top3HorseIds.length > 0
          ? "miss"
          : "not_settled";
    const status =
      !winnerHorseId || top3HorseIds.length === 0
        ? "result_pending"
        : settledHonmei?.settlementStatus === "pending_payouts" ||
            settledOpponent?.settlementStatus === "pending_payouts" ||
            !hasWide ||
            (wideOutcome === "hit_missing_payout")
          ? "payout_pending"
          : "review_ready";

    const nextRecord: RaceReviewRecord = {
      ...existing,
      status,
      reviewReady: status === "review_ready",
      updatedAt: toIso(params.now),
      lastTriedAt: toIso(params.now),
      lastError: status === "review_ready" ? null : null,
      resultFetchedAt,
      payoutFetchedAt: status === "review_ready" ? toIso(params.now) : null,
      actualWinnerHorseId: winnerHorseId,
      actualTop3HorseIds: top3HorseIds,
      honmei: settledHonmei,
      opponent: settledOpponent,
      wide: settledWide,
      pair: {
        ...existing.pair,
        honmeiHorseId: existing.honmei?.horseId ?? null,
        opponentHorseId: existing.opponent?.horseId ?? null,
        sameTop3:
          winnerHorseId && top3HorseIds.length > 0 && existing.honmei?.horseId && existing.opponent?.horseId
            ? top3HorseIds.includes(existing.honmei.horseId) && top3HorseIds.includes(existing.opponent.horseId)
            : null,
        wideOutcome,
        widePayout: widePayout ?? 0,
        widePayoutSource: hasWide ? "official" : "missing",
      },
    };

    if (hasReviewRecordChanged(existing, nextRecord)) {
      nextRecords.push(nextRecord);
    }
  }

  await upsertManyReviewRecords(nextRecords);
  return nextRecords.length;
}

async function main() {
  const phase = (argValue("phase") ?? "all") as Phase;
  const dayFilter = (argValue("day") ?? "") as DayLabel | "";
  const raceIdFilter = extractRaceId(argValue("race-id"));
  const nowArg = argValue("now");
  const includeArchives = hasFlag("include-archives") || argValue("scope") === "all";
  const refreshExisting = hasFlag("refresh-existing");
  const now = nowArg ? new Date(nowArg) : jstNow();
  if (Number.isNaN(now.getTime())) {
    throw new Error(`invalid --now value: ${nowArg}`);
  }

  const result = await withProcessLock(async () => {
    const weekly = await readWeeklyRaces();
    const races = collectRaceScopes(weekly, includeArchives);
    const normalizedDayFilter = dayFilter === "Sat" || dayFilter === "Sun" ? dayFilter : null;

    let snapshotsCreated = 0;
    let reviewsSettled = 0;

    if (phase === "snapshot" || phase === "all") {
      snapshotsCreated = await createSnapshotRecords({
        races,
        now,
        dayFilter: normalizedDayFilter,
        raceIdFilter,
        refreshExisting,
      });
    }

    if (phase === "settle" || phase === "all") {
      reviewsSettled = await settleReviewRecords({
        races,
        now,
        dayFilter: normalizedDayFilter,
        raceIdFilter,
        refreshExisting,
      });
    }

    return {
      ok: true,
      phase,
      includeArchives,
      refreshExisting,
      targetRaceCount: races.length,
      snapshotsCreated,
      reviewsSettled,
      now: toIso(now),
      dayFilter: normalizedDayFilter,
      raceIdFilter,
    };
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
