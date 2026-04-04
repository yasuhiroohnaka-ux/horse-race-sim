import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const WEEKLY_RACES_PATH = path.join(ROOT, "data", "weekly-races.json");

type RawWidePayoutTable = {
  resultNumbers?: unknown;
  payouts?: unknown;
};

type RawWeeklyRaceRecord = {
  raceId?: unknown;
  courseId?: unknown;
  horses?: Array<{
    id?: unknown;
    name?: unknown;
  }>;
  result?: {
    finishers?: Array<{
      horseId?: unknown;
      horseNumber?: unknown;
      name?: unknown;
    }>;
    payouts?: {
      wide?: RawWidePayoutTable;
    };
  };
};

type RawWeeklyRacesFile = {
  currentWeek?: {
    races?: RawWeeklyRaceRecord[];
  };
  archives?: Array<{
    races?: RawWeeklyRaceRecord[];
  }>;
};

export type WidePayoutPair = {
  horseNumbers: [number, number];
  payout: number;
};

export type RaceWidePayouts = {
  pairs: WidePayoutPair[];
};

export type RaceHorseNumbers = Record<string, number>;

function normalizeRaceId(value: unknown, courseId: unknown): string | null {
  const raceId = String(value ?? "").trim();
  if (raceId) return raceId;
  const match = String(courseId ?? "").match(/(\d{12})$/);
  return match?.[1] ?? null;
}

function normalizeName(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[・･\-_.]/g, "");
}

function normalizePair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const left = Number(value[0]);
  const right = Number(value[1]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  const sorted = [left, right].sort((a, b) => a - b) as [number, number];
  return sorted;
}

function normalizeWidePairs(resultNumbers: unknown): [number, number][] {
  if (!Array.isArray(resultNumbers)) return [];

  if (resultNumbers.every((entry) => Array.isArray(entry))) {
    return resultNumbers
      .map((entry) => normalizePair(entry))
      .filter((entry): entry is [number, number] => Boolean(entry));
  }

  const flatNumbers = resultNumbers
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));
  const pairs: [number, number][] = [];
  for (let index = 0; index + 1 < flatNumbers.length; index += 2) {
    const pair = normalizePair([flatNumbers[index], flatNumbers[index + 1]]);
    if (pair) pairs.push(pair);
  }
  return pairs;
}

function normalizeWidePayoutTable(value: RawWidePayoutTable | null | undefined): RaceWidePayouts | null {
  if (!value) return null;
  const pairs = normalizeWidePairs(value.resultNumbers);
  const payouts = Array.isArray(value.payouts)
    ? value.payouts.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry))
    : [];

  const normalizedPairs = pairs
    .map((horseNumbers, index) => ({
      horseNumbers,
      payout: Math.round(Number(payouts[index] ?? 0)),
    }))
    .filter((entry) => entry.payout > 0);

  return normalizedPairs.length > 0 ? { pairs: normalizedPairs } : null;
}

function getWeeklyRaceRecords(file: RawWeeklyRacesFile): RawWeeklyRaceRecord[] {
  const currentWeekRaces = Array.isArray(file.currentWeek?.races) ? file.currentWeek.races : [];
  const archiveRaces = Array.isArray(file.archives)
    ? file.archives.flatMap((archive) => (Array.isArray(archive?.races) ? archive.races : []))
    : [];
  return [...currentWeekRaces, ...archiveRaces];
}

export function hasWidePayoutTable(table: RaceWidePayouts | null | undefined) {
  return Boolean(table?.pairs.length);
}

export function getWidePayoutByHorseNumbers(
  table: RaceWidePayouts | null | undefined,
  horseNumbers: [number, number]
): number | null {
  if (!hasWidePayoutTable(table)) return null;
  const normalized = [...horseNumbers].sort((a, b) => a - b) as [number, number];
  const entry = (table?.pairs ?? []).find(
    (pair) => pair.horseNumbers[0] === normalized[0] && pair.horseNumbers[1] === normalized[1]
  );
  return entry ? entry.payout : 0;
}

export async function loadWidePayoutsByRaceId(): Promise<Record<string, RaceWidePayouts>> {
  try {
    const raw = await fs.readFile(WEEKLY_RACES_PATH, "utf8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as RawWeeklyRacesFile;
    const payoutsByRaceId: Record<string, RaceWidePayouts> = {};

    for (const race of getWeeklyRaceRecords(parsed)) {
      const raceId = normalizeRaceId(race.raceId, race.courseId);
      if (!raceId) continue;
      const table = normalizeWidePayoutTable(race.result?.payouts?.wide);
      if (!table) continue;
      payoutsByRaceId[raceId] = table;
    }

    return payoutsByRaceId;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return {};
    throw error;
  }
}

export async function loadHorseNumbersByRaceId(): Promise<Record<string, RaceHorseNumbers>> {
  try {
    const raw = await fs.readFile(WEEKLY_RACES_PATH, "utf8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as RawWeeklyRacesFile;
    const horseNumbersByRaceId: Record<string, RaceHorseNumbers> = {};

    for (const race of getWeeklyRaceRecords(parsed)) {
      const raceId = normalizeRaceId(race.raceId, race.courseId);
      if (!raceId) continue;
      const finishers = Array.isArray(race.result?.finishers) ? race.result.finishers : [];
      const horseIdByName = new Map(
        (Array.isArray(race.horses) ? race.horses : [])
          .map((horse) => {
            const horseId = String(horse.id ?? "").trim();
            const normalizedName = normalizeName(horse.name);
            if (!horseId || !normalizedName) return null;
            return [normalizedName, horseId] as const;
          })
          .filter((entry): entry is readonly [string, string] => Boolean(entry))
      );
      const horseNumbers = Object.fromEntries(
        finishers
          .map((finisher) => {
            const horseId =
              String(finisher.horseId ?? "").trim() || horseIdByName.get(normalizeName(finisher.name)) || "";
            const horseNumber = Number(finisher.horseNumber);
            if (!horseId || !Number.isFinite(horseNumber) || horseNumber <= 0) return null;
            return [horseId, horseNumber] as const;
          })
          .filter((entry): entry is readonly [string, number] => Boolean(entry))
      );

      if (Object.keys(horseNumbers).length > 0) {
        horseNumbersByRaceId[raceId] = horseNumbers;
      }
    }

    return horseNumbersByRaceId;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return {};
    throw error;
  }
}
