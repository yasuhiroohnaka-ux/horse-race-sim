/**
 * Fix TypeScript type annotations in the archive page helper functions.
 */
import { readFileSync, writeFileSync } from "fs";

const filePath = "app/archive/page.tsx";
let content = readFileSync(filePath, "utf8");

// Fix formatScore
content = content.replace(
  'function formatScore(value) {',
  'function formatScore(value?: number | null) {'
);

// Fix formatPercent
content = content.replace(
  'function formatPercent(value) {',
  'function formatPercent(value?: number | null) {'
);

// Fix buildMetricChips
content = content.replace(
  'function buildMetricChips(entry, kind = "win") {',
  'function buildMetricChips(entry?: RecommendationSettlement | null, kind: "win" | "value" = "win") {'
);

// Fix buildArchiveSimEntry
content = content.replace(
  'function buildArchiveSimEntry(snapshot, horseId) {',
  'function buildArchiveSimEntry(snapshot: PredictionSnapshot | undefined, horseId: string | null): PickExplanationEntry | null {'
);

// Fix buildArchiveRecommendationEntry
content = content.replace(
  'function buildArchiveRecommendationEntry(entry) {',
  'function buildArchiveRecommendationEntry(entry?: RecommendationSettlement | null): PickExplanationEntry | null {'
);

// Fix the arrow function in buildArchiveSimEntry
content = content.replace(
  'majorContributors: row.majorContributors.map((c) => ({ label: c.label, value: c.value })),',
  'majorContributors: row.majorContributors.map((c: { label: string; value: number }) => ({ label: c.label, value: c.value })),',
);

writeFileSync(filePath, content, "utf8");
console.log("OK: type annotations fixed");
