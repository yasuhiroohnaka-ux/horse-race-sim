import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPredictionSnapshotSourceStatusSummary,
  buildReviewSourceStatusSummary,
  isPreferredPredictionSnapshot,
  resolveSnapshotSourceStatus,
} from "../lib/sourceStatus";
import type { PredictionSnapshot, RaceReviewRecord } from "../lib/types";

function snapshot(overrides: Partial<PredictionSnapshot>): PredictionSnapshot {
  return {
    snapshotId: "s1",
    raceId: "209901010111",
    courseId: "tokyo-turf-1600-209901010111",
    capturedAt: "2099-01-01T06:30:00.000Z",
    snapshotTakenAt: "2099-01-01T06:30:00.000Z",
    snapshotType: "pre_race_final",
    raceDate: "2099-01-01",
    scheduledStartTime: "2099-01-01T15:45:00+09:00",
    predictionOrigin: "saved_live",
    scoringVersion: "tanpuku-place-v2.3",
    modelFamily: "manual-sim-montecarlo",
    modelVersion: "sim-page-v1",
    scoringConfigHash: "hash",
    simulationCount: 100,
    condition: {
      courseId: "tokyo-turf-1600-209901010111",
      trackBias: { innerOuter: 0, frontBack: 0 },
      groundCondition: "Firm",
      weather: "Sunny",
      windDirection: "Crosswind",
      windSpeed: 1,
      paceScenario: "Average",
    },
    rankedRows: [],
    honmeiHorseId: null,
    valueHorseId: null,
    watchHorseId: null,
    signalReasons: {},
    marketMeta: { fieldSize: 0, oddsFetchedAt: null, oddsSource: null },
    ...overrides,
  };
}

function record(overrides: Partial<RaceReviewRecord>): RaceReviewRecord {
  const baseSnapshot = snapshot({});
  return {
    raceId: baseSnapshot.raceId,
    courseId: baseSnapshot.courseId,
    status: "review_ready",
    reviewReady: true,
    compatibilityMode: "native_opponent",
    createdAt: "2099-01-01T00:00:00.000Z",
    updatedAt: "2099-01-01T00:00:00.000Z",
    snapshotTakenAt: baseSnapshot.snapshotTakenAt ?? baseSnapshot.capturedAt,
    resultFetchedAt: null,
    payoutFetchedAt: null,
    lastTriedAt: null,
    lastRetryAt: null,
    nextRetryAt: null,
    retryCount: 0,
    missingReasons: [],
    lastError: null,
    meta: {
      raceId: baseSnapshot.raceId,
      courseId: baseSnapshot.courseId,
      raceDate: "2099-01-01",
      weekOf: "2098-12-28",
      day: "Sat",
      raceName: "Test",
      venue: "Tokyo",
      venueKey: "tokyo",
      raceNumber: 11,
      scheduledStartTime: "2099-01-01T15:45:00+09:00",
    },
    snapshot: baseSnapshot,
    expectation: null,
    honmei: null,
    opponent: null,
    wide: null,
    legacyValue: null,
    actualWinnerHorseId: null,
    actualTop3HorseIds: [],
    pair: {
      honmeiHorseId: null,
      opponentHorseId: null,
      rankGap: null,
      scoreGap: null,
      sameTop3: null,
      wideOutcome: "not_settled",
      widePayout: 0,
      widePayoutSource: "missing",
    },
    ...overrides,
  };
}

test("source status fallback marks late saved-live snapshots as retrospective", () => {
  assert.equal(
    resolveSnapshotSourceStatus(
      snapshot({
        capturedAt: "2099-01-01T07:00:01.000Z",
        snapshotTakenAt: "2099-01-01T07:00:01.000Z",
      })
    ),
    "retrospective"
  );
});

test("review source status summary separates live, retrospective, manual, and unknown", () => {
  const live = record({});
  const lateSnapshot = snapshot({
    snapshotId: "late",
    capturedAt: "2099-01-01T07:00:01.000Z",
    snapshotTakenAt: "2099-01-01T07:00:01.000Z",
  });
  const retrospective = record({ raceId: "r2", snapshot: lateSnapshot, snapshotTakenAt: lateSnapshot.capturedAt });
  const manualSnapshot = snapshot({ snapshotId: "manual", predictionOrigin: "saved_manual", snapshotType: "manual_snapshot" });
  const manual = record({ raceId: "r3", snapshot: manualSnapshot });
  const unknown = record({ raceId: "r4", snapshot: null, snapshotTakenAt: null, status: "discovered", reviewReady: false });

  const summary = buildReviewSourceStatusSummary([live, retrospective, manual, unknown]);

  assert.equal(summary.totalRecords, 4);
  assert.equal(summary.reviewReadyRecords, 3);
  assert.equal(summary.livePreRaceRecords, 1);
  assert.equal(summary.retrospectiveRecords, 1);
  assert.equal(summary.manualSnapshotRecords, 1);
  assert.equal(summary.unknownLegacyRecords, 1);
  assert.equal(summary.livePreRaceEligibleTrue, 1);
  assert.equal(summary.livePreRaceEligibleFalse, 3);
});

test("prediction snapshot summary counts source status without migration", () => {
  const summary = buildPredictionSnapshotSourceStatusSummary([
    snapshot({}),
    snapshot({ predictionOrigin: "backfill" }),
    snapshot({ predictionOrigin: "saved_manual", snapshotType: "manual_snapshot" }),
    snapshot({ scheduledStartTime: null, raceDate: null }),
  ]);

  assert.equal(summary.totalSnapshots, 4);
  assert.equal(summary.livePreRaceSnapshots, 1);
  assert.equal(summary.retrospectiveSnapshots, 1);
  assert.equal(summary.manualSnapshotSnapshots, 1);
  assert.equal(summary.unknownLegacySnapshots, 1);
});

test("live pre-race snapshot is preferred over later retrospective pre-race-final snapshot", () => {
  const live = snapshot({
    snapshotId: "live",
    capturedAt: "2099-01-01T06:30:00.000Z",
    snapshotTakenAt: "2099-01-01T06:30:00.000Z",
    sourceStatus: "live_pre_race",
    livePreRaceEligible: true,
  });
  const late = snapshot({
    snapshotId: "late",
    capturedAt: "2099-01-01T07:00:01.000Z",
    snapshotTakenAt: "2099-01-01T07:00:01.000Z",
    sourceStatus: "retrospective",
    livePreRaceEligible: false,
  });

  assert.equal(isPreferredPredictionSnapshot(live, late), true);
  assert.equal(isPreferredPredictionSnapshot(late, live), false);
});

test("actual UTC instant for 09:00 JST remains before afternoon race start", () => {
  assert.equal(
    resolveSnapshotSourceStatus(
      snapshot({
        capturedAt: "2099-01-01T00:00:00.000Z",
        snapshotTakenAt: "2099-01-01T00:00:00.000Z",
        scheduledStartTime: "2099-01-01T15:45:00+09:00",
      })
    ),
    "live_pre_race"
  );
});
