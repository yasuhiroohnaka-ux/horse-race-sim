import type { PredictionSnapshot, PredictionSnapshotDataQuality } from "@/lib/types";

function positiveCount(value: unknown): number | null {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : null;
}

export function assessFieldDataQuality(expected: unknown, actual: number): PredictionSnapshotDataQuality {
  const expectedCount = positiveCount(expected);
  return {
    fieldComplete: expectedCount === null ? null : actual === expectedCount,
    expected: expectedCount,
    actual,
  };
}

export function reconcileResultFieldDataQuality(
  snapshot: PredictionSnapshot,
  resultFinisherCount: number
): PredictionSnapshotDataQuality {
  const actual = snapshot.rankedRows.length;
  const previous = snapshot.dataQuality ?? assessFieldDataQuality(null, actual);
  if (resultFinisherCount > actual) {
    return { fieldComplete: false, expected: Math.max(previous.expected ?? 0, resultFinisherCount), actual };
  }
  return { ...previous, actual };
}
