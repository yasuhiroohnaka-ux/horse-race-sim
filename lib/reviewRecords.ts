import fs from "node:fs/promises";
import path from "node:path";
import type {
  PredictionSnapshot,
  RaceReviewRecord,
  ReviewPairMetrics,
  ReviewRaceMeta,
  ReviewRecordStore,
  ReviewSelectionHorse,
} from "@/lib/types";
import { normalizeLegacyReviewStatus } from "@/lib/reviewStatus";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
export const REVIEW_RECORDS_PATH = path.join(DATA_DIR, "review-records.json");

function normalizeString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeNumber(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function toTimestamp(value: string | null | undefined): number {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function extractRaceId(value: string | null | undefined): string | null {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  const match = normalized.match(/(\d{12})$/);
  return match?.[1] ?? normalized;
}

export function buildRaceDateFromWeekOf(weekOf: string | null | undefined, day: string | null | undefined): string | null {
  const [year, month, date] = String(weekOf ?? "")
    .split("-")
    .map((value) => Number.parseInt(value, 10));
  if (![year, month, date].every(Number.isFinite)) return null;
  const offset = day === "Sat" ? 5 : day === "Sun" ? 6 : 0;
  const base = new Date(Date.UTC(year, month - 1, date + offset));
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}`;
}

export function combineRaceDateAndTime(raceDate: string | null | undefined, hhmm: string | null | undefined): string | null {
  const date = normalizeString(raceDate);
  const time = normalizeString(hhmm);
  if (!date || !time) return null;
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, hour, minute] = match;
  return `${date}T${hour.padStart(2, "0")}:${minute}:00+09:00`;
}

export function createEmptyPairMetrics(): ReviewPairMetrics {
  return {
    honmeiHorseId: null,
    opponentHorseId: null,
    rankGap: null,
    scoreGap: null,
    sameTop3: null,
    wideOutcome: "not_settled",
    widePayout: 0,
    widePayoutSource: "missing",
  };
}

export function buildSelectionHorseFromSnapshot(snapshot: PredictionSnapshot | null, horseId: string | null | undefined): ReviewSelectionHorse | null {
  if (!snapshot || !horseId) return null;
  const row = snapshot.rankedRows.find((entry) => String(entry.horseId) === String(horseId));
  if (!row) return null;
  return {
    horseId: row.horseId,
    externalHorseId: normalizeString(row.externalHorseId),
    horseName: row.horseName ?? null,
    rank: normalizeNumber(row.rank),
    score: normalizeNumber(row.score),
    winProb: normalizeNumber(row.winProb),
    realOdds: normalizeNumber(row.realOdds),
    placeOdds: null,
    placeProb: null,
    placeScore: null,
    valueScore: null,
    selectionMethod:
      snapshot.opponentHorseId && snapshot.opponentHorseId === row.horseId
        ? snapshot.opponentSelectionMethod ?? "stable_next"
        : undefined,
    selectionReason: normalizeString(snapshot.signalReasons?.[row.horseId]?.signalReason),
    overbetLabel: null,
    scoreGap: null,
    runnerUpHorseId: null,
    runnerUpHorseName: null,
    runnerUpPlaceScore: null,
    runnerUpPlaceProb: null,
    settlementStatus: "pending_result",
    tanOutcome: "not_settled",
    fukuOutcome: "not_settled",
    tanPayout: 0,
    fukuPayout: 0,
    tanPayoutSource: "missing",
    fukuPayoutSource: "missing",
  };
}

function compareRecordRecency(a: RaceReviewRecord, b: RaceReviewRecord) {
  return toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt);
}

function emptyStore(): ReviewRecordStore {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    records: {},
  };
}

function normalizeSnapshot(snapshot: PredictionSnapshot | null | undefined, meta: ReviewRaceMeta): PredictionSnapshot | null {
  if (!snapshot) return null;
  return {
    ...snapshot,
    raceId: extractRaceId(snapshot.raceId) ?? meta.raceId,
    courseId: normalizeString(snapshot.courseId) ?? meta.courseId,
    raceDate: normalizeString(snapshot.raceDate) ?? meta.raceDate,
    raceName: normalizeString(snapshot.raceName) ?? meta.raceName,
    venue: normalizeString(snapshot.venue) ?? meta.venue,
    venueKey: normalizeString(snapshot.venueKey) ?? meta.venueKey,
    raceNumber: normalizeNumber(snapshot.raceNumber) ?? meta.raceNumber,
    scheduledStartTime: normalizeString(snapshot.scheduledStartTime) ?? meta.scheduledStartTime,
  };
}

function normalizeSelection(selection: ReviewSelectionHorse | null | undefined): ReviewSelectionHorse | null {
  if (!selection) return null;
  return {
    ...selection,
    horseId: normalizeString(selection.horseId) ?? "",
    externalHorseId: normalizeString(selection.externalHorseId),
    horseName: normalizeString(selection.horseName),
    rank: normalizeNumber(selection.rank),
    score: normalizeNumber(selection.score),
    winProb: normalizeNumber(selection.winProb),
    realOdds: normalizeNumber(selection.realOdds),
    placeOdds: normalizeNumber(selection.placeOdds),
    placeProb: normalizeNumber(selection.placeProb),
    placeScore: normalizeNumber(selection.placeScore),
    valueScore: normalizeNumber(selection.valueScore),
    selectionReason: normalizeString(selection.selectionReason),
    overbetLabel: normalizeString(selection.overbetLabel),
    scoreGap: normalizeNumber(selection.scoreGap),
    runnerUpHorseId: normalizeString(selection.runnerUpHorseId),
    runnerUpHorseName: normalizeString(selection.runnerUpHorseName),
    runnerUpPlaceScore: normalizeNumber(selection.runnerUpPlaceScore),
    runnerUpPlaceProb: normalizeNumber(selection.runnerUpPlaceProb),
    tanPayout: Number(selection.tanPayout ?? 0),
    fukuPayout: Number(selection.fukuPayout ?? 0),
  };
}

export function normalizeReviewRecord(record: RaceReviewRecord): RaceReviewRecord {
  const meta = buildReviewRaceMeta({
    raceId: extractRaceId(record.meta?.raceId ?? record.raceId) ?? extractRaceId(record.raceId) ?? String(record.raceId),
    courseId: normalizeString(record.meta?.courseId ?? record.courseId) ?? String(record.courseId),
    raceDate: record.meta?.raceDate ?? null,
    weekOf: record.meta?.weekOf ?? null,
    day: record.meta?.day ?? null,
    raceName: record.meta?.raceName ?? null,
    venue: record.meta?.venue ?? null,
    venueKey: record.meta?.venueKey ?? null,
    raceNumber: record.meta?.raceNumber ?? null,
    scheduledStartTime: record.meta?.scheduledStartTime ?? null,
  });

  return {
    ...record,
    raceId: meta.raceId,
    courseId: meta.courseId,
    status: normalizeLegacyReviewStatus(record.status),
    reviewReady: record.reviewReady === true || normalizeLegacyReviewStatus(record.status) === "review_ready",
    createdAt: normalizeString(record.createdAt) ?? new Date().toISOString(),
    updatedAt: normalizeString(record.updatedAt) ?? new Date().toISOString(),
    snapshotTakenAt: normalizeString(record.snapshotTakenAt),
    resultFetchedAt: normalizeString(record.resultFetchedAt),
    payoutFetchedAt: normalizeString(record.payoutFetchedAt),
    lastTriedAt: normalizeString(record.lastTriedAt),
    lastRetryAt: normalizeString(record.lastRetryAt),
    nextRetryAt: normalizeString(record.nextRetryAt),
    retryCount: Math.max(0, Number(record.retryCount ?? 0)),
    missingReasons: Array.isArray(record.missingReasons) ? record.missingReasons : [],
    lastError: normalizeString(record.lastError),
    meta,
    snapshot: normalizeSnapshot(record.snapshot, meta),
    honmei: normalizeSelection(record.honmei),
    opponent: normalizeSelection(record.opponent),
    wide: normalizeSelection(record.wide),
    actualWinnerHorseId: normalizeString(record.actualWinnerHorseId),
    actualTop3HorseIds: Array.isArray(record.actualTop3HorseIds)
      ? record.actualTop3HorseIds.map((value) => String(value)).filter(Boolean)
      : [],
    pair: {
      ...createEmptyPairMetrics(),
      ...(record.pair ?? {}),
    },
  };
}

export function createDiscoveredReviewRecord(params: {
  meta: ReviewRaceMeta;
  now?: string;
}): RaceReviewRecord {
  const now = normalizeString(params.now) ?? new Date().toISOString();
  return normalizeReviewRecord({
    raceId: params.meta.raceId,
    courseId: params.meta.courseId,
    status: "discovered",
    reviewReady: false,
    compatibilityMode: "native_opponent",
    createdAt: now,
    updatedAt: now,
    snapshotTakenAt: null,
    resultFetchedAt: null,
    payoutFetchedAt: null,
    lastTriedAt: null,
    lastRetryAt: null,
    nextRetryAt: null,
    retryCount: 0,
    missingReasons: [],
    lastError: null,
    meta: params.meta,
    snapshot: null,
    honmei: null,
    opponent: null,
    wide: null,
    legacyValue: null,
    actualWinnerHorseId: null,
    actualTop3HorseIds: [],
    pair: createEmptyPairMetrics(),
  });
}

export async function loadReviewRecordStore(): Promise<ReviewRecordStore> {
  try {
    const raw = await fs.readFile(REVIEW_RECORDS_PATH, "utf8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
    if (
      parsed &&
      typeof parsed === "object" &&
      Number((parsed as ReviewRecordStore).version) === 1 &&
      parsed.records &&
      typeof parsed.records === "object"
    ) {
      return {
        version: 1,
        generatedAt: normalizeString((parsed as ReviewRecordStore).generatedAt) ?? new Date().toISOString(),
        records: Object.fromEntries(
          Object.entries((parsed as ReviewRecordStore).records).map(([raceId, record]) => [
            extractRaceId(raceId) ?? raceId,
            normalizeReviewRecord(record),
          ])
        ),
      };
    }
    return emptyStore();
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return emptyStore();
    throw error;
  }
}

export async function saveReviewRecordStore(store: ReviewRecordStore) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    REVIEW_RECORDS_PATH,
    `${JSON.stringify(
      {
        ...store,
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

export async function loadReviewRecords(): Promise<Record<string, RaceReviewRecord>> {
  const store = await loadReviewRecordStore();
  return store.records;
}

export async function loadReviewRecord(raceId: string | null | undefined): Promise<RaceReviewRecord | null> {
  const normalizedRaceId = extractRaceId(raceId);
  if (!normalizedRaceId) return null;
  const store = await loadReviewRecordStore();
  return store.records[normalizedRaceId] ?? null;
}

export function buildReviewRaceMeta(params: {
  raceId: string;
  courseId: string;
  raceDate?: string | null;
  weekOf?: string | null;
  day?: string | null;
  raceName?: string | null;
  venue?: string | null;
  venueKey?: string | null;
  raceNumber?: number | null;
  scheduledStartTime?: string | null;
}): ReviewRaceMeta {
  return {
    raceId: params.raceId,
    courseId: params.courseId,
    raceDate: normalizeString(params.raceDate),
    weekOf: normalizeString(params.weekOf),
    day: normalizeString(params.day),
    raceName: normalizeString(params.raceName),
    venue: normalizeString(params.venue),
    venueKey: normalizeString(params.venueKey),
    raceNumber: normalizeNumber(params.raceNumber),
    scheduledStartTime: normalizeString(params.scheduledStartTime),
  };
}

export function createReviewRecordFromSnapshot(params: {
  meta: ReviewRaceMeta;
  snapshot: PredictionSnapshot;
  honmei: ReviewSelectionHorse | null;
  opponent: ReviewSelectionHorse | null;
  wide: ReviewSelectionHorse | null;
  now?: string;
}): RaceReviewRecord {
  const now = normalizeString(params.now) ?? new Date().toISOString();
  const pair = createEmptyPairMetrics();
  pair.honmeiHorseId = params.honmei?.horseId ?? null;
  pair.opponentHorseId = params.opponent?.horseId ?? null;
  pair.rankGap =
    params.honmei?.rank !== null && params.honmei?.rank !== undefined && params.opponent?.rank !== null && params.opponent?.rank !== undefined
      ? params.opponent.rank - params.honmei.rank
      : params.snapshot.pairRankGap ?? null;
  pair.scoreGap =
    params.honmei?.score !== null &&
    params.honmei?.score !== undefined &&
    params.opponent?.score !== null &&
    params.opponent?.score !== undefined
      ? Number((params.honmei.score - params.opponent.score).toFixed(3))
      : params.snapshot.pairScoreGap ?? null;

  return {
    raceId: params.meta.raceId,
    courseId: params.meta.courseId,
    status: "review_partial",
    reviewReady: false,
    compatibilityMode: "native_opponent",
    createdAt: now,
    updatedAt: now,
    snapshotTakenAt: normalizeString(params.snapshot.snapshotTakenAt ?? params.snapshot.capturedAt),
    resultFetchedAt: null,
    payoutFetchedAt: null,
    lastTriedAt: now,
    lastRetryAt: null,
    nextRetryAt: null,
    retryCount: 0,
    missingReasons: [],
    lastError: null,
    meta: params.meta,
    snapshot: params.snapshot,
    honmei: params.honmei,
    opponent: params.opponent,
    wide: params.wide,
    legacyValue: null,
    actualWinnerHorseId: null,
    actualTop3HorseIds: [],
    pair,
  };
}

export function mergeReviewRecord(
  existing: RaceReviewRecord | null,
  next: RaceReviewRecord
): RaceReviewRecord {
  const normalizedNext = normalizeReviewRecord(next);
  if (!existing) return normalizedNext;
  const normalizedExisting = normalizeReviewRecord(existing);
  return {
    ...normalizedExisting,
    ...normalizedNext,
    meta: {
      ...normalizedExisting.meta,
      ...normalizedNext.meta,
    },
    pair: {
      ...normalizedExisting.pair,
      ...normalizedNext.pair,
    },
    snapshot: normalizedNext.snapshot ?? normalizedExisting.snapshot,
    honmei: normalizedNext.honmei ?? normalizedExisting.honmei,
    opponent: normalizedNext.opponent ?? normalizedExisting.opponent,
    wide: normalizedNext.wide ?? normalizedExisting.wide,
    legacyValue: normalizedNext.legacyValue ?? normalizedExisting.legacyValue,
    createdAt: normalizedExisting.createdAt,
    updatedAt: normalizeString(normalizedNext.updatedAt) ?? new Date().toISOString(),
  };
}

export async function upsertReviewRecord(record: RaceReviewRecord): Promise<RaceReviewRecord> {
  const store = await loadReviewRecordStore();
  const existing = store.records[record.raceId] ?? null;
  const merged = mergeReviewRecord(existing, record);
  store.records[record.raceId] = merged;
  await saveReviewRecordStore(store);
  return merged;
}

export async function upsertManyReviewRecords(records: RaceReviewRecord[]) {
  if (records.length === 0) return;
  const store = await loadReviewRecordStore();
  for (const record of records.sort(compareRecordRecency)) {
    const existing = store.records[record.raceId] ?? null;
    store.records[record.raceId] = mergeReviewRecord(existing, record);
  }
  await saveReviewRecordStore(store);
}
