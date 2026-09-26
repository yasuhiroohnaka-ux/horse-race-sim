import assert from "node:assert/strict";
import test from "node:test";
import { isExpiredRetryReviewRecord } from "../lib/reviewStatus";

const retryRecord = {
  status: "retry_scheduled" as const,
  meta: { raceDate: "2026-04-25" },
};

test("retry is not expired before 14 days from race date", () => {
  assert.equal(isExpiredRetryReviewRecord(retryRecord, new Date("2026-05-08T14:59:59Z")), false);
});

test("retry expires at 14 days from race date", () => {
  assert.equal(isExpiredRetryReviewRecord(retryRecord, new Date("2026-05-08T15:00:00Z")), true);
  assert.equal(isExpiredRetryReviewRecord({ ...retryRecord, status: "review_ready" }, new Date("2026-09-26T00:00:00Z")), false);
});
