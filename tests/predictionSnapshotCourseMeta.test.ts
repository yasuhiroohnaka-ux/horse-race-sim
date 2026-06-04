import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSnapshotCourseMeta,
  normalizeScheduledStartTime,
} from "../lib/predictionSnapshotCourseMeta";
import type { Course } from "../lib/types";

function course(overrides: Partial<Course> = {}): Course {
  return {
    id: "tokyo-turf-1600-209901010111",
    raceId: "209901010111",
    name: "Meta Test",
    displayName: "Meta Test Display",
    venue: "Tokyo",
    venueKey: "tokyo",
    raceDate: "2099-01-01",
    scheduledStartTime: "15:45",
    day: "Sat",
    raceNumber: 11,
    distance: 1600,
    surface: "Turf",
    segments: [],
    straightLength: 525,
    hashtag: "#MetaTest",
    ...overrides,
  };
}

test("snapshot course meta marks active scheduled races as saved live pre-race snapshots", () => {
  const meta = buildSnapshotCourseMeta(course());

  assert.equal(meta.raceId, "209901010111");
  assert.equal(meta.raceDate, "2099-01-01");
  assert.equal(meta.raceName, "Meta Test Display");
  assert.equal(meta.venueKey, "tokyo");
  assert.equal(meta.raceNumber, 11);
  assert.equal(meta.scheduledStartTime, "2099-01-01T15:45:00+09:00");
  assert.equal(meta.snapshotType, "pre_race_final");
  assert.equal(meta.predictionOrigin, "saved_live");
});

test("snapshot course meta keeps archived races out of live performance samples", () => {
  const meta = buildSnapshotCourseMeta(course({ archived: true }));

  assert.equal(meta.snapshotType, "manual_snapshot");
  assert.equal(meta.predictionOrigin, "saved_manual");
});

test("scheduled start time normalization accepts ISO timestamps", () => {
  assert.equal(
    normalizeScheduledStartTime("2099-01-01", "2099-01-01T15:45:00+09:00"),
    "2099-01-01T15:45:00+09:00"
  );
});
