import assert from "node:assert/strict";
import test from "node:test";
import { buildCourseShortComment } from "../lib/raceCardContent";
import { courseBadgeLabel } from "../lib/courseGrades";

test("ordinary class race card uses only known race facts", () => {
  const course = { name: "勝浦特別", label: "勝浦特別", grade: "OTHER" as const, venue: "中山", surface: "Turf" as const, distance: 1200 };
  assert.equal(courseBadgeLabel(course), "条件戦");
  assert.equal(buildCourseShortComment(course), "中山・芝1200m・条件戦のレース。");
});
