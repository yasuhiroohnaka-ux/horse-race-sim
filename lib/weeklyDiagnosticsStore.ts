import fs from "node:fs/promises";
import path from "node:path";
import type {
  WeeklyDiagnostics,
  WeeklyDiagnosticsComparisonSummary,
  WeeklyDiagnosticsStore,
  WeeklyDiagnosticsStoreEntry,
} from "@/lib/types";

const ROOT = process.cwd();
const STORE_PATH = path.join(ROOT, "data", "weekly-diagnostics.json");

type UpsertResult = {
  saved: boolean;
  storeKey: string;
  entry: WeeklyDiagnosticsStoreEntry;
  store: WeeklyDiagnosticsStore;
};

function normalizeString(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized || "none";
}

function toTimestamp(value: string | null | undefined) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareEntryTime(a: WeeklyDiagnosticsStoreEntry, b: WeeklyDiagnosticsStoreEntry) {
  const endA = toTimestamp(a.diagnostics.meta.dateRange.end);
  const endB = toTimestamp(b.diagnostics.meta.dateRange.end);
  if (endA !== endB) return endB - endA;

  const startA = toTimestamp(a.diagnostics.meta.dateRange.start);
  const startB = toTimestamp(b.diagnostics.meta.dateRange.start);
  if (startA !== startB) return startB - startA;

  return toTimestamp(b.savedAt) - toTimestamp(a.savedAt);
}

export function buildWeeklyDiagnosticsStoreKey(diagnostics: WeeklyDiagnostics) {
  return [
    diagnostics.meta.weekKey,
    normalizeString(diagnostics.meta.aggregationScope),
    normalizeString(diagnostics.meta.scoringVersion),
    normalizeString(diagnostics.meta.modelVersion),
    normalizeString(diagnostics.meta.scoringConfigHash),
  ].join("__");
}

export async function loadWeeklyDiagnosticsStore(): Promise<WeeklyDiagnosticsStore> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as WeeklyDiagnosticsStore).entries)) {
      return {
        entries: (parsed as WeeklyDiagnosticsStore).entries
          .filter(
            (entry): entry is WeeklyDiagnosticsStoreEntry =>
              Boolean(
                entry &&
                  typeof entry === "object" &&
                  typeof entry.storeKey === "string" &&
                  typeof entry.weekKey === "string" &&
                  "diagnostics" in entry
              )
          )
          .map((entry) => ({
            ...entry,
            aggregationScope: entry.aggregationScope ?? entry.diagnostics?.meta?.aggregationScope ?? "all",
            scoringVersion: entry.scoringVersion ?? entry.diagnostics?.meta?.scoringVersion ?? null,
          })),
      };
    }
    return { entries: [] };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return { entries: [] };
    throw error;
  }
}

export async function saveWeeklyDiagnosticsStore(store: WeeklyDiagnosticsStore) {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function ensureWeeklyDiagnosticsStored(diagnostics: WeeklyDiagnostics): Promise<UpsertResult> {
  const store = await loadWeeklyDiagnosticsStore();
  const storeKey = buildWeeklyDiagnosticsStoreKey(diagnostics);
  const existingIndex = store.entries.findIndex((entry) => entry.storeKey === storeKey);
  const existing = existingIndex >= 0 ? store.entries[existingIndex] : null;
  if (existing) {
    if (JSON.stringify(existing.diagnostics) === JSON.stringify(diagnostics)) {
      return {
        saved: false,
        storeKey,
        entry: existing,
        store,
      };
    }

    const entry: WeeklyDiagnosticsStoreEntry = {
      ...existing,
      aggregationScope: diagnostics.meta.aggregationScope,
      scoringVersion: diagnostics.meta.scoringVersion,
      modelVersion: diagnostics.meta.modelVersion,
      scoringConfigHash: diagnostics.meta.scoringConfigHash,
      savedAt: new Date().toISOString(),
      diagnostics,
    };
    const nextEntries = [...store.entries];
    nextEntries[existingIndex] = entry;
    const nextStore: WeeklyDiagnosticsStore = {
      entries: nextEntries.sort(compareEntryTime),
    };
    await saveWeeklyDiagnosticsStore(nextStore);
    return {
      saved: true,
      storeKey,
      entry,
      store: nextStore,
    };
  }

  const entry: WeeklyDiagnosticsStoreEntry = {
    storeKey,
    weekKey: diagnostics.meta.weekKey,
    aggregationScope: diagnostics.meta.aggregationScope,
    scoringVersion: diagnostics.meta.scoringVersion,
    modelVersion: diagnostics.meta.modelVersion,
    scoringConfigHash: diagnostics.meta.scoringConfigHash,
    savedAt: new Date().toISOString(),
    diagnostics,
  };
  const nextStore: WeeklyDiagnosticsStore = {
    entries: [...store.entries, entry].sort(compareEntryTime),
  };
  await saveWeeklyDiagnosticsStore(nextStore);

  return {
    saved: true,
    storeKey,
    entry,
    store: nextStore,
  };
}

export function buildWeeklyDiagnosticsComparison(
  currentEntry: WeeklyDiagnosticsStoreEntry,
  store: WeeklyDiagnosticsStore
): WeeklyDiagnosticsComparisonSummary | null {
  const currentEnd = toTimestamp(currentEntry.diagnostics.meta.dateRange.end);
  const previous = store.entries
    .filter(
      (entry) =>
        entry.storeKey !== currentEntry.storeKey &&
        entry.aggregationScope === currentEntry.aggregationScope &&
        entry.scoringVersion === currentEntry.scoringVersion &&
        entry.modelVersion === currentEntry.modelVersion &&
        entry.scoringConfigHash === currentEntry.scoringConfigHash
    )
    .filter((entry) => toTimestamp(entry.diagnostics.meta.dateRange.end) < currentEnd || entry.weekKey < currentEntry.weekKey)
    .sort(compareEntryTime)[0];

  if (!previous) return null;

  return {
    current: {
      weekKey: currentEntry.weekKey,
      aggregationScope: currentEntry.aggregationScope,
      scoringVersion: currentEntry.scoringVersion,
      modelVersion: currentEntry.modelVersion,
      scoringConfigHash: currentEntry.scoringConfigHash,
    },
    previous: {
      weekKey: previous.weekKey,
      aggregationScope: previous.aggregationScope,
      scoringVersion: previous.scoringVersion,
      modelVersion: previous.modelVersion,
      scoringConfigHash: previous.scoringConfigHash,
    },
    deltas: {
      snapshotHonmeiPlaceRateDelta:
        currentEntry.diagnostics.placeCore.snapshotHonmei.placeRate -
        previous.diagnostics.placeCore.snapshotHonmei.placeRate,
      routineHonmeiPlaceRateDelta:
        currentEntry.diagnostics.placeCore.routineHonmei.placeRate -
        previous.diagnostics.placeCore.routineHonmei.placeRate,
      valuePlaceReturnRateDelta:
        currentEntry.diagnostics.valueCore.placeReturnRate -
        previous.diagnostics.valueCore.placeReturnRate,
      agreementRateDelta:
        currentEntry.diagnostics.agreement.agreementRate -
        previous.diagnostics.agreement.agreementRate,
    },
  };
}

export function toAvailableWeeklyDiagnosticsEntries(store: WeeklyDiagnosticsStore) {
  return store.entries
    .slice()
    .sort(compareEntryTime)
    .map((entry) => ({
      storeKey: entry.storeKey,
      weekKey: entry.weekKey,
      aggregationScope: entry.aggregationScope,
      scoringVersion: entry.scoringVersion,
      modelVersion: entry.modelVersion,
      scoringConfigHash: entry.scoringConfigHash,
      savedAt: entry.savedAt,
    }));
}
