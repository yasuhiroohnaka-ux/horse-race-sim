import type { PredictionSnapshot } from './types';
import { DEFAULT_PREDICTION_ORIGIN, DEFAULT_SCORING_VERSION, normalizePredictionOrigin, normalizeScoringVersion } from './predictionSnapshots';
import { resolveSnapshotSourceStatus, isLivePreRaceEligible } from './sourceStatus';

export function isPredictionSnapshot(value: unknown): value is PredictionSnapshot {
  if (!value || typeof value !== "object") return false;

  const snapshot = value as Partial<PredictionSnapshot>;
  return (
    typeof snapshot.snapshotId === "string" &&
    typeof snapshot.raceId === "string" &&
    typeof snapshot.courseId === "string" &&
    typeof snapshot.capturedAt === "string" &&
    typeof snapshot.modelFamily === "string" &&
    typeof snapshot.modelVersion === "string" &&
    typeof snapshot.scoringConfigHash === "string" &&
    typeof snapshot.simulationCount === "number" &&
    Array.isArray(snapshot.rankedRows) &&
    snapshot.condition !== undefined &&
    snapshot.signalReasons !== undefined &&
    snapshot.marketMeta !== undefined
  );
}

export function toNormalizedSnapshot(value: PredictionSnapshot): PredictionSnapshot {
  const sourceStatus = resolveSnapshotSourceStatus(value);
  return {
    ...value,
    predictionOrigin: normalizePredictionOrigin(value.predictionOrigin, DEFAULT_PREDICTION_ORIGIN),
    scoringVersion: normalizeScoringVersion(value.scoringVersion, DEFAULT_SCORING_VERSION),
    sourceStatus,
    livePreRaceEligible: isLivePreRaceEligible(value),
  };
}
