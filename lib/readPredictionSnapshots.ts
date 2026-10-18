import path from 'node:path';
import { readDataFile } from './dataFile.mjs';
import { loadReviewRecords } from './reviewRecords';
import { isPredictionSnapshot, toNormalizedSnapshot } from './predictionSnapshotApi';
import { isPreferredPredictionSnapshot } from './sourceStatus';
import type { PredictionSnapshot } from './types';

const SNAPSHOT_PATH = path.join(process.cwd(), 'data', 'prediction-snapshots.jsonl');

/** Offline/build reader. Public requests must select a single race. */
export async function loadPreferredPredictionSnapshots() {
    const [raw, reviewRecords] = await Promise.all([
      readDataFile(SNAPSHOT_PATH, "utf8").catch((error) => {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (code === "ENOENT") return "";
        throw error;
      }),
      loadReviewRecords(),
    ]);
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const latestByRaceId: Record<string, PredictionSnapshot> = {};
    for (const [raceId, record] of Object.entries(reviewRecords)) {
      if (record.snapshot) {
        latestByRaceId[raceId] = toNormalizedSnapshot(record.snapshot);
      }
    }

    for (const line of lines) {
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      if (!isPredictionSnapshot(parsed)) continue;
      const normalized = toNormalizedSnapshot(parsed);
      const raceId = String(normalized.raceId ?? "");
      if (!raceId) continue;

      const existing = latestByRaceId[raceId];
      if (isPreferredPredictionSnapshot(normalized, existing)) {
        latestByRaceId[raceId] = normalized;
      }
    }

  return latestByRaceId;
}
