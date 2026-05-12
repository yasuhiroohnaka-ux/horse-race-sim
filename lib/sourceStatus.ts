import { normalizeLegacyReviewStatus } from "@/lib/reviewStatus";
import type {
  PredictionOrigin,
  PredictionSnapshot,
  PredictionSnapshotSourceStatus,
  PredictionSnapshotSourceStatusSummary,
  RaceReviewRecord,
  ReviewSourceStatusSummary,
} from "@/lib/types";

export function normalizeSnapshotSourceStatus(value: unknown): PredictionSnapshotSourceStatus | null {
  return value === "live_pre_race" || value === "manual_snapshot" || value === "retrospective" || value === "unknown"
    ? value
    : null;
}

function normalizePredictionOrigin(value: unknown): PredictionOrigin | null {
  return value === "saved_live" || value === "saved_manual" || value === "backfill" ? value : null;
}

function toTimestamp(value: unknown): number | null {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function raceDateAfterSnapshotDate(capturedAt: unknown, raceDate: unknown): boolean | null {
  const captured = toTimestamp(capturedAt);
  const date = String(raceDate ?? "").trim();
  if (captured === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return new Date(captured).toISOString().slice(0, 10) > date;
}

export function resolveSnapshotSourceStatus(
  snapshot: Partial<PredictionSnapshot> | null | undefined,
  fallback?: {
    snapshotSourceStatus?: unknown;
    livePreRaceEligible?: unknown;
    raceDate?: unknown;
    scheduledStartTime?: unknown;
    snapshotTakenAt?: unknown;
  }
): PredictionSnapshotSourceStatus {
  const explicit =
    normalizeSnapshotSourceStatus(fallback?.snapshotSourceStatus) ??
    normalizeSnapshotSourceStatus(snapshot?.sourceStatus) ??
    normalizeSnapshotSourceStatus(snapshot?.dataLineage?.sourceStatus);
  if (explicit) return explicit;

  const origin = normalizePredictionOrigin(snapshot?.predictionOrigin);
  if (origin === "backfill") return "retrospective";
  if (origin === "saved_manual" || snapshot?.snapshotType === "manual_snapshot") return "manual_snapshot";

  const capturedAt = snapshot?.snapshotTakenAt ?? snapshot?.capturedAt ?? fallback?.snapshotTakenAt;
  const scheduledStartTime = snapshot?.scheduledStartTime ?? fallback?.scheduledStartTime;
  const capturedTime = toTimestamp(capturedAt);
  const scheduledTime = toTimestamp(scheduledStartTime);
  if (capturedTime !== null && scheduledTime !== null) {
    return capturedTime < scheduledTime ? "live_pre_race" : "retrospective";
  }

  const raceDate = snapshot?.raceDate ?? fallback?.raceDate;
  const afterRaceDate = raceDateAfterSnapshotDate(capturedAt, raceDate);
  if (afterRaceDate === true) return "retrospective";

  return "unknown";
}

export function isLivePreRaceEligible(
  snapshot: Partial<PredictionSnapshot> | null | undefined,
  fallback?: {
    snapshotSourceStatus?: unknown;
    livePreRaceEligible?: unknown;
    raceDate?: unknown;
    scheduledStartTime?: unknown;
    snapshotTakenAt?: unknown;
  }
): boolean {
  if (fallback?.livePreRaceEligible === true || snapshot?.livePreRaceEligible === true) return true;
  return resolveSnapshotSourceStatus(snapshot, fallback) === "live_pre_race";
}

export function resolveReviewRecordSourceStatus(record: RaceReviewRecord): PredictionSnapshotSourceStatus {
  return resolveSnapshotSourceStatus(record.snapshot, {
    snapshotSourceStatus: record.snapshotSourceStatus,
    livePreRaceEligible: record.livePreRaceEligible,
    raceDate: record.meta.raceDate,
    scheduledStartTime: record.meta.scheduledStartTime,
    snapshotTakenAt: record.snapshotTakenAt,
  });
}

export function buildReviewSourceStatusSummary(records: RaceReviewRecord[]): ReviewSourceStatusSummary {
  const summary: ReviewSourceStatusSummary = {
    totalRecords: records.length,
    reviewReadyRecords: 0,
    livePreRaceRecords: 0,
    retrospectiveRecords: 0,
    manualSnapshotRecords: 0,
    unknownLegacyRecords: 0,
    livePreRaceEligibleTrue: 0,
    livePreRaceEligibleFalse: 0,
  };

  for (const record of records) {
    if (record.reviewReady === true || normalizeLegacyReviewStatus(record.status) === "review_ready") {
      summary.reviewReadyRecords += 1;
    }
    const status = resolveReviewRecordSourceStatus(record);
    if (status === "live_pre_race") summary.livePreRaceRecords += 1;
    else if (status === "retrospective") summary.retrospectiveRecords += 1;
    else if (status === "manual_snapshot") summary.manualSnapshotRecords += 1;
    else summary.unknownLegacyRecords += 1;

    if (isLivePreRaceEligible(record.snapshot, record)) summary.livePreRaceEligibleTrue += 1;
    else summary.livePreRaceEligibleFalse += 1;
  }

  return summary;
}

export function buildPredictionSnapshotSourceStatusSummary(
  snapshots: Array<Partial<PredictionSnapshot>>
): PredictionSnapshotSourceStatusSummary {
  const summary: PredictionSnapshotSourceStatusSummary = {
    totalSnapshots: snapshots.length,
    livePreRaceSnapshots: 0,
    retrospectiveSnapshots: 0,
    manualSnapshotSnapshots: 0,
    unknownLegacySnapshots: 0,
    livePreRaceEligibleTrue: 0,
    livePreRaceEligibleFalse: 0,
  };

  for (const snapshot of snapshots) {
    const status = resolveSnapshotSourceStatus(snapshot);
    if (status === "live_pre_race") summary.livePreRaceSnapshots += 1;
    else if (status === "retrospective") summary.retrospectiveSnapshots += 1;
    else if (status === "manual_snapshot") summary.manualSnapshotSnapshots += 1;
    else summary.unknownLegacySnapshots += 1;

    if (isLivePreRaceEligible(snapshot)) summary.livePreRaceEligibleTrue += 1;
    else summary.livePreRaceEligibleFalse += 1;
  }

  return summary;
}
