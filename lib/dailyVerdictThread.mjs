import { sanitizeRaceTagLabel } from "./xTagSanitize.mjs";
import { VERDICT_LABELS } from "./verdictLabels.mjs";

const X_WEIGHT_LIMIT = 280;

export function countXWeightedChars(value) {
  return Array.from(String(value ?? "")).reduce((total, char) => total + (char.codePointAt(0) > 0xff ? 2 : 1), 0);
}

function raceLine(row) {
  const race = `${String(row.venue ?? "").trim()}${row.raceNumber ?? ""}R ${String(row.raceName ?? "").trim()}`.trim();
  if (row.raceStatus === "started") return `${race} 発走済み`;
  if (row.raceStatus === "unknown_start") return `${race} 発走時刻不明のため判定なし`;
  if (row.fieldComplete === false) return `${race} データ不完全のため判定なし`;
  if (row.raceStatus === "missing_snapshot") return `${race} 事前判定未取得`;
  const horse = String(row.horseName ?? "").trim();
  const verdict = VERDICT_LABELS[row.classification] ?? "判定なし";
  return `${race}${horse ? ` ◎${horse}` : ""} ${verdict}`;
}

function packVenue(lines, date, venue, tag, maxWeight) {
  const header = `本日の判定一覧（${date}・${venue}）`;
  const chunks = [];
  let current = [];
  for (const line of lines) {
    const next = [...current, line];
    const text = `${header}\n${next.join("\n")}\n${tag}`;
    if (countXWeightedChars(text) > maxWeight && current.length > 0) {
      chunks.push(`${header}\n${current.join("\n")}\n${tag}`);
      current = [line];
    } else {
      current = next;
    }
    if (countXWeightedChars(`${header}\n${current.join("\n")}\n${tag}`) > maxWeight) {
      throw new RangeError(`daily verdict row exceeds X limit: ${line}`);
    }
  }
  if (current.length > 0) chunks.push(`${header}\n${current.join("\n")}\n${tag}`);
  return chunks;
}

/**
 * @param {Array<{venue?: string, raceNumber?: number, raceName?: string, horseName?: string | null,
 *   classification?: "win" | "place" | "skip" | null, fieldComplete?: boolean,
 *   raceStatus?: "started" | "unknown_start" | "missing_snapshot" | null}>} rows
 * @param {{date?: string, maxWeight?: number}} options
 * @returns {string[]}
 */
export function buildDailyVerdictThread(rows, { date = "", maxWeight = X_WEIGHT_LIMIT } = {}) {
  if (!rows.length) return [];
  const tag = `#${sanitizeRaceTagLabel("競馬予想")}`;
  const lines = rows.map(raceLine);
  const header = `本日の判定一覧（${date}）`;
  const combined = `${header}\n${lines.join("\n")}\n${tag}`;
  if (countXWeightedChars(combined) <= maxWeight) return [combined];

  const venueGroups = new Map();
  for (const [index, row] of rows.entries()) {
    const venue = String(row.venue ?? "会場不明").trim() || "会場不明";
    if (!venueGroups.has(venue)) venueGroups.set(venue, []);
    venueGroups.get(venue).push(lines[index]);
  }
  return [...venueGroups.entries()].flatMap(([venue, venueLines]) => packVenue(venueLines, date, venue, tag, maxWeight));
}

export function selectWinCandidate(candidates) {
  return candidates
    .filter((candidate) => candidate.fieldComplete !== false &&
      candidate.tanpuku?.winPick?.classificationHint?.classification === "win")
    .sort((left, right) => (right.simBestHorse?.score ?? -Infinity) - (left.simBestHorse?.score ?? -Infinity))[0] ?? null;
}
