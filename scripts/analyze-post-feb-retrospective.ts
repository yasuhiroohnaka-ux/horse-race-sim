import fs from "node:fs/promises";
import path from "node:path";
import { pickTanpukuPair } from "../lib/tanpukuSelection.mjs";

type GeneratedHorse = {
  id: string;
  name: string;
  jockey?: string;
  runningStyle?: string;
  gateNumber?: number;
  realOdds?: number;
  [key: string]: unknown;
};

type GeneratedFinisher = {
  position?: number;
  horseId?: string;
  externalHorseId?: string;
  gateNumber?: number;
  horseNumber?: number;
  name?: string;
  jockey?: string;
  popularity?: number;
  odds?: number;
};

type GeneratedRace = {
  courseId: string;
  raceId: string;
  label: string;
  grade: string;
  day: string;
  raceNumber: number;
  isSpecialRace: boolean;
  isFinalRace: boolean;
  isJumpRace: boolean;
  raceSegment: string;
  venue: string;
  venueKey: string;
  surface: "Turf" | "Dirt";
  distance: number;
  straightLength: number;
  hashtag: string;
  hasRace: boolean;
  oddsSource: string;
  date: string;
  archivedAt?: string;
  result?: {
    updatedAt?: string;
    winnerHorseId?: string;
    winnerHorseName?: string;
    top3HorseIds?: string[];
    top3HorseNames?: string[];
    finishers?: GeneratedFinisher[];
  };
  horses: GeneratedHorse[];
};

type ReviewRecord = {
  raceId: string;
  courseId: string;
  status: string;
  reviewReady: boolean;
  meta: {
    raceDate?: string | null;
    raceName?: string | null;
    venue?: string | null;
    venueKey?: string | null;
    raceNumber?: number | null;
  };
  snapshot?: {
    raceId?: string;
    courseId?: string;
    scoringVersion?: string;
    predictionOrigin?: string;
    honmeiHorseId?: string | null;
    opponentHorseId?: string | null;
    valueHorseId?: string | null;
    pairScoreGap?: number | null;
    pairRankGap?: number | null;
    rankedRows?: Array<{
      horseId: string;
      horseName: string;
      rank: number;
      score: number;
      winProb: number;
      fairOdds: number | null;
      realOdds: number | null;
      edge: number;
      runningStyle: string;
      gateNumber: number;
      jockey: string;
    }>;
  } | null;
  honmei?: { horseId?: string | null } | null;
  opponent?: { horseId?: string | null } | null;
  wide?: { horseId?: string | null } | null;
};

type TanpukuScoredEntry = {
  horse: GeneratedHorse;
  score: number;
  odds: number;
  officialImplied: number;
  winProb: number;
  placeProb: number;
  placeOdds: number;
  top3Stability: number;
  marketSupport: number;
  overbetRisk: number;
  placeReturnEdge: number;
  longshotBonus: number;
  placeScore: number;
  valueScore: number;
  tanRoi: number;
  fukuRoi: number;
  overbetLabel: string | null;
};

type TanpukuSelection = {
  horse: GeneratedHorse;
  scoreGap?: number;
};

type TanpukuPairResult = {
  scored: TanpukuScoredEntry[];
  winPick?: TanpukuSelection | null;
  opponentPick?: TanpukuSelection | null;
  widePick?: TanpukuSelection | null;
  valuePick?: TanpukuSelection | null;
};

type AnalysisRow = {
  raceId: string;
  raceDate: string;
  raceName: string;
  courseId: string;
  venue: string;
  venueKey: string;
  surface: string;
  distance: number;
  grade: string;
  raceNumber: number;
  raceSegment: string;
  isSpecialRace: boolean;
  isFinalRace: boolean;
  isJumpRace: boolean;
  fieldSize: number;
  horseId: string;
  externalHorseId: string | null;
  horseName: string;
  jockey: string | null;
  runningStyle: string | null;
  gateNumber: number | null;
  horseNumber: number | null;
  finishPosition: number | null;
  finishGroup: "1" | "2-3" | "4+" | "missing";
  isWinner: boolean;
  isTop3: boolean;
  popularity: number | null;
  popularityBand: "top3" | "mid" | "longshot" | "unknown";
  odds: number | null;
  resultOdds: number | null;
  seedRealOdds: number | null;
  isPopularTop3: boolean;
  isLongshotHit: boolean;
  simRank: number | null;
  simScore: number | null;
  simWinProbPct: number | null;
  simWinProb: number | null;
  fairOdds: number | null;
  edge: number | null;
  placeRank: number | null;
  valueRank: number | null;
  winProb: number | null;
  placeProb: number | null;
  placeOdds: number | null;
  placeScore: number | null;
  valueScore: number | null;
  top3Stability: number | null;
  marketSupport: number | null;
  overbetRisk: number | null;
  placeReturnEdge: number | null;
  longshotBonus: number | null;
  officialImplied: number | null;
  tanRoi: number | null;
  fukuRoi: number | null;
  overbetLabel: string | null;
  scoreGap: number | null;
  selectionScoreGap: number | null;
  valueGap: number | null;
  simGap: number | null;
  isSimHonmei: boolean;
  isTanpukuHonmei: boolean;
  isOpponentCandidate: boolean;
  isWideCandidate: boolean;
  isAnyCandidate: boolean;
  candidateRole: "honmei" | "opponent" | "wide" | "none";
};

type GroupDefinition = {
  key: string;
  label: string;
  rows: AnalysisRow[];
};

type MetricSummary = {
  count: number;
  mean: number | null;
  median: number | null;
  q1: number | null;
  q3: number | null;
  min: number | null;
  max: number | null;
  stddev: number | null;
};

type MetricStatsByGroup = Record<string, Record<string, MetricSummary>>;

type QuartileSpread = {
  metric: string;
  orientation: "high" | "low";
  bestQuartileTop3Rate: number | null;
  worstQuartileTop3Rate: number | null;
  top3RateSpread: number | null;
  bestQuartileWinRate: number | null;
  worstQuartileWinRate: number | null;
  winRateSpread: number | null;
};

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "data", "analysis");
const START_DATE = "2026-02-22";
const DATASET_PATH = path.join(OUTPUT_DIR, "post-feb-current-indicator-table.csv");
const SUMMARY_PATH = path.join(OUTPUT_DIR, "post-feb-current-indicator-summary.json");
const REPORT_PATH = path.join(OUTPUT_DIR, "post-feb-current-indicator-report.md");
const GENERATED_RACE_SCHEDULE_PATH = path.join(ROOT, "lib", "generatedRaceSchedule.ts");
const REVIEW_RECORDS_PATH = path.join(ROOT, "data", "review-records.json");

const METRICS: Array<keyof AnalysisRow> = [
  "simWinProb",
  "edge",
  "winProb",
  "placeProb",
  "placeScore",
  "valueScore",
  "top3Stability",
  "marketSupport",
  "overbetRisk",
  "placeReturnEdge",
  "longshotBonus",
  "scoreGap",
  "selectionScoreGap",
  "simRank",
  "placeRank",
  "valueRank",
  "popularity",
  "odds",
];

const CORE_METRICS: Array<keyof AnalysisRow> = [
  "simWinProb",
  "edge",
  "placeProb",
  "placeScore",
  "valueScore",
  "top3Stability",
  "placeReturnEdge",
  "scoreGap",
];

const QUARTILE_METRICS: Array<{ metric: keyof AnalysisRow; orientation: "high" | "low" }> = [
  { metric: "simWinProb", orientation: "high" },
  { metric: "edge", orientation: "high" },
  { metric: "placeProb", orientation: "high" },
  { metric: "placeScore", orientation: "high" },
  { metric: "valueScore", orientation: "high" },
  { metric: "top3Stability", orientation: "high" },
  { metric: "placeReturnEdge", orientation: "high" },
  { metric: "scoreGap", orientation: "low" },
  { metric: "overbetRisk", orientation: "low" },
  { metric: "simRank", orientation: "low" },
  { metric: "placeRank", orientation: "low" },
  { metric: "valueRank", orientation: "low" },
];

function toNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toStringValue(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function round(value: number | null, digits = 3): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(sortedValues: number[], ratio: number): number | null {
  if (sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return sortedValues[0];
  const index = (sortedValues.length - 1) * ratio;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  if (lowerIndex === upperIndex) return sortedValues[lowerIndex];
  const weight = index - lowerIndex;
  return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight;
}

function stddev(values: number[], meanValue: number | null): number | null {
  if (values.length === 0 || meanValue === null) return null;
  const variance = values.reduce((sum, value) => sum + (value - meanValue) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function summarizeMetric(rows: AnalysisRow[], metric: keyof AnalysisRow): MetricSummary {
  const values = rows
    .map((row) => row[metric])
    .map((value) => (typeof value === "number" && Number.isFinite(value) ? value : null))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);

  const meanValue = mean(values);
  return {
    count: values.length,
    mean: round(meanValue),
    median: round(quantile(values, 0.5)),
    q1: round(quantile(values, 0.25)),
    q3: round(quantile(values, 0.75)),
    min: round(values[0] ?? null),
    max: round(values[values.length - 1] ?? null),
    stddev: round(stddev(values, meanValue)),
  };
}

function summarizeGroups(groups: GroupDefinition[], metrics: Array<keyof AnalysisRow>): MetricStatsByGroup {
  return Object.fromEntries(
    groups.map((group) => [
      group.key,
      Object.fromEntries(metrics.map((metric) => [String(metric), summarizeMetric(group.rows, metric)])),
    ])
  );
}

function csvEscape(value: unknown): string {
  const stringValue = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function comparePlaceEntries(left: TanpukuScoredEntry, right: TanpukuScoredEntry): number {
  return (
    right.placeScore - left.placeScore ||
    right.placeProb - left.placeProb ||
    (Number(left.horse.gateNumber ?? 999) - Number(right.horse.gateNumber ?? 999)) ||
    String(left.horse.id).localeCompare(String(right.horse.id))
  );
}

function compareValueEntries(left: TanpukuScoredEntry, right: TanpukuScoredEntry): number {
  return (
    right.valueScore - left.valueScore ||
    right.placeReturnEdge - left.placeReturnEdge ||
    right.placeProb - left.placeProb ||
    (Number(left.horse.gateNumber ?? 999) - Number(right.horse.gateNumber ?? 999)) ||
    String(left.horse.id).localeCompare(String(right.horse.id))
  );
}

function getPopularityBand(rank: number | null): "top3" | "mid" | "longshot" | "unknown" {
  if (!rank) return "unknown";
  if (rank <= 3) return "top3";
  if (rank <= 6) return "mid";
  return "longshot";
}

function isLongshot(popularity: number | null, odds: number | null): boolean {
  return Boolean((popularity !== null && popularity >= 8) || (odds !== null && odds >= 20));
}

function formatMetricValue(value: number | null, kind: "pct01" | "num" | "pp" = "num"): string {
  if (value === null || !Number.isFinite(value)) return "-";
  if (kind === "pct01") return `${(value * 100).toFixed(1)}%`;
  if (kind === "pp") return `${value.toFixed(1)}pt`;
  return value.toFixed(3);
}

function createAsciiBoxplot(stats: MetricSummary, domainMin: number | null, domainMax: number | null, width = 28): string {
  if (
    stats.min === null ||
    stats.max === null ||
    stats.q1 === null ||
    stats.median === null ||
    stats.q3 === null ||
    domainMin === null ||
    domainMax === null
  ) {
    return "-";
  }

  const span = domainMax - domainMin || 1;
  const clampIndex = (value: number) =>
    Math.max(0, Math.min(width - 1, Math.round(((value - domainMin) / span) * (width - 1))));
  const chars = new Array(width).fill(" ");
  const minIndex = clampIndex(stats.min);
  const q1Index = clampIndex(stats.q1);
  const medianIndex = clampIndex(stats.median);
  const q3Index = clampIndex(stats.q3);
  const maxIndex = clampIndex(stats.max);

  for (let index = minIndex; index <= maxIndex; index += 1) chars[index] = "-";
  for (let index = q1Index; index <= q3Index; index += 1) chars[index] = "=";
  chars[minIndex] = "|";
  chars[maxIndex] = "|";
  chars[q1Index] = "[";
  chars[q3Index] = "]";
  chars[medianIndex] = "M";
  return chars.join("");
}

function findArrayLiteral(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`marker not found: ${marker}`);
  }
  const assignmentIndex = source.indexOf("=", markerIndex);
  if (assignmentIndex < 0) {
    throw new Error(`assignment not found for marker: ${marker}`);
  }
  const arrayStart = source.indexOf("[", assignmentIndex);
  if (arrayStart < 0) {
    throw new Error(`array start not found for marker: ${marker}`);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = arrayStart; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "[") {
      depth += 1;
      continue;
    }
    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(arrayStart, index + 1);
      }
    }
  }

  throw new Error(`array end not found for marker: ${marker}`);
}

async function loadGeneratedRaces(): Promise<GeneratedRace[]> {
  const source = await fs.readFile(GENERATED_RACE_SCHEDULE_PATH, "utf8");
  const completedLiteral = findArrayLiteral(source, "export const GENERATED_COMPLETED_RACES");
  const archivedLiteral = findArrayLiteral(source, "export const GENERATED_ARCHIVED_RACES");
  const completed = JSON.parse(completedLiteral) as GeneratedRace[];
  const archived = JSON.parse(archivedLiteral) as GeneratedRace[];
  return [...completed, ...archived]
    .filter((race) => race.date >= START_DATE)
    .sort((left, right) => left.date.localeCompare(right.date) || left.raceId.localeCompare(right.raceId));
}

async function loadReviewRecords(): Promise<Map<string, ReviewRecord>> {
  const raw = await fs.readFile(REVIEW_RECORDS_PATH, "utf8");
  const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as { records?: Record<string, ReviewRecord> };
  return new Map(Object.entries(parsed.records ?? {}));
}

function toRaceInput(race: GeneratedRace) {
  return {
    courseId: race.courseId,
    label: race.label,
    distance: race.distance,
    straightLength: race.straightLength,
    trackBias: { innerOuter: 0, frontBack: 0 },
    horses: race.horses,
  };
}

function buildRows(races: GeneratedRace[], reviewByRaceId: Map<string, ReviewRecord>) {
  const rows: AnalysisRow[] = [];
  const missingReviews: string[] = [];
  const selectionMatches = {
    honmei: 0,
    opponent: 0,
    wide: 0,
    total: 0,
  };

  for (const race of races) {
    const review = reviewByRaceId.get(race.raceId);
    if (!review || !review.snapshot?.rankedRows?.length) {
      missingReviews.push(race.raceId);
      continue;
    }

    const tanpuku = pickTanpukuPair(toRaceInput(race), false, true) as TanpukuPairResult | null;
    if (!tanpuku || !Array.isArray(tanpuku.scored) || tanpuku.scored.length === 0) {
      missingReviews.push(race.raceId);
      continue;
    }

    selectionMatches.total += 1;
    if (tanpuku.winPick?.horse.id === review.honmei?.horseId) selectionMatches.honmei += 1;
    if (tanpuku.opponentPick?.horse.id === review.opponent?.horseId) selectionMatches.opponent += 1;
    const reviewWideHorseId = review.wide?.horseId ?? null;
    const tanpukuWideHorseId = tanpuku.widePick?.horse.id ?? tanpuku.valuePick?.horse.id ?? null;
    if (tanpukuWideHorseId === reviewWideHorseId) selectionMatches.wide += 1;

    const finishersByHorseId = new Map(
      (race.result?.finishers ?? []).map((finisher) => [String(finisher.horseId ?? ""), finisher])
    );
    const snapshotRowsByHorseId = new Map(
      (review.snapshot.rankedRows ?? []).map((row) => [String(row.horseId), row])
    );

    const placeSorted = [...tanpuku.scored].sort(comparePlaceEntries);
    const valueSorted = [...tanpuku.scored].sort(compareValueEntries);
    const placeRankByHorseId = new Map(placeSorted.map((entry, index) => [String(entry.horse.id), index + 1]));
    const valueRankByHorseId = new Map(valueSorted.map((entry, index) => [String(entry.horse.id), index + 1]));
    const tanpukuByHorseId = new Map(tanpuku.scored.map((entry) => [String(entry.horse.id), entry]));
    const placeLeader = placeSorted[0] ?? null;
    const valueLeader = valueSorted[0] ?? null;
    const snapshotLeader = [...snapshotRowsByHorseId.values()].sort((left, right) => left.rank - right.rank)[0] ?? null;

    const honmeiHorseId = tanpuku.winPick?.horse.id ?? null;
    const opponentHorseId = tanpuku.opponentPick?.horse.id ?? null;
    const wideHorseId = tanpuku.widePick?.horse.id ?? tanpuku.valuePick?.horse.id ?? null;

    for (const horse of race.horses) {
      const horseId = String(horse.id);
      const finisher = finishersByHorseId.get(horseId) ?? null;
      const tanpukuEntry = tanpukuByHorseId.get(horseId) ?? null;
      const snapshotRow = snapshotRowsByHorseId.get(horseId) ?? null;
      const finishPosition = toNumber(finisher?.position);
      const popularity = toNumber(finisher?.popularity);
      const resultOdds = toNumber(finisher?.odds);
      const seedRealOdds = toNumber(horse.realOdds);
      const odds = resultOdds ?? seedRealOdds;
      const isWinner = finishPosition === 1;
      const isTop3 = finishPosition !== null && finishPosition <= 3;
      const popularityBand = getPopularityBand(popularity);
      const candidateRole =
        horseId === honmeiHorseId ? "honmei" : horseId === opponentHorseId ? "opponent" : horseId === wideHorseId ? "wide" : "none";
      const selectionScoreGap =
        candidateRole === "honmei"
          ? toNumber(tanpuku.winPick?.scoreGap)
          : candidateRole === "opponent"
            ? toNumber(tanpuku.opponentPick?.scoreGap)
            : candidateRole === "wide"
              ? toNumber(tanpuku.widePick?.scoreGap ?? tanpuku.valuePick?.scoreGap)
              : null;

      rows.push({
        raceId: race.raceId,
        raceDate: race.date,
        raceName: race.label,
        courseId: race.courseId,
        venue: race.venue,
        venueKey: race.venueKey,
        surface: race.surface,
        distance: race.distance,
        grade: race.grade,
        raceNumber: race.raceNumber,
        raceSegment: race.raceSegment,
        isSpecialRace: race.isSpecialRace,
        isFinalRace: race.isFinalRace,
        isJumpRace: race.isJumpRace,
        fieldSize: race.horses.length,
        horseId,
        externalHorseId: toStringValue(finisher?.externalHorseId),
        horseName: horse.name,
        jockey: toStringValue(finisher?.jockey) ?? toStringValue(horse.jockey),
        runningStyle: toStringValue(horse.runningStyle),
        gateNumber: toNumber(finisher?.gateNumber) ?? toNumber(horse.gateNumber),
        horseNumber: toNumber(finisher?.horseNumber),
        finishPosition,
        finishGroup: finishPosition === 1 ? "1" : finishPosition !== null && finishPosition <= 3 ? "2-3" : finishPosition !== null ? "4+" : "missing",
        isWinner,
        isTop3,
        popularity,
        popularityBand,
        odds,
        resultOdds,
        seedRealOdds,
        isPopularTop3: isTop3 && popularity !== null && popularity <= 3,
        isLongshotHit: isTop3 && isLongshot(popularity, odds),
        simRank: toNumber(snapshotRow?.rank),
        simScore: toNumber(snapshotRow?.score),
        simWinProbPct: toNumber(snapshotRow?.winProb),
        simWinProb: snapshotRow?.winProb !== undefined && snapshotRow?.winProb !== null ? Number(snapshotRow.winProb) / 100 : null,
        fairOdds: toNumber(snapshotRow?.fairOdds),
        edge: toNumber(snapshotRow?.edge),
        placeRank: placeRankByHorseId.get(horseId) ?? null,
        valueRank: valueRankByHorseId.get(horseId) ?? null,
        winProb: tanpukuEntry?.winProb ?? null,
        placeProb: tanpukuEntry?.placeProb ?? null,
        placeOdds: tanpukuEntry?.placeOdds ?? null,
        placeScore: tanpukuEntry?.placeScore ?? null,
        valueScore: tanpukuEntry?.valueScore ?? null,
        top3Stability: tanpukuEntry?.top3Stability ?? null,
        marketSupport: tanpukuEntry?.marketSupport ?? null,
        overbetRisk: tanpukuEntry?.overbetRisk ?? null,
        placeReturnEdge: tanpukuEntry?.placeReturnEdge ?? null,
        longshotBonus: tanpukuEntry?.longshotBonus ?? null,
        officialImplied: tanpukuEntry?.officialImplied ?? null,
        tanRoi: tanpukuEntry?.tanRoi ?? null,
        fukuRoi: tanpukuEntry?.fukuRoi ?? null,
        overbetLabel: tanpukuEntry?.overbetLabel ?? null,
        scoreGap: tanpukuEntry && placeLeader ? round(placeLeader.placeScore - tanpukuEntry.placeScore) : null,
        selectionScoreGap: selectionScoreGap !== null ? round(selectionScoreGap) : null,
        valueGap: tanpukuEntry && valueLeader ? round(valueLeader.valueScore - tanpukuEntry.valueScore) : null,
        simGap: snapshotRow && snapshotLeader ? round(snapshotLeader.score - snapshotRow.score) : null,
        isSimHonmei: horseId === review.snapshot.honmeiHorseId,
        isTanpukuHonmei: horseId === honmeiHorseId,
        isOpponentCandidate: horseId === opponentHorseId,
        isWideCandidate: horseId === wideHorseId,
        isAnyCandidate: horseId === honmeiHorseId || horseId === opponentHorseId || horseId === wideHorseId,
        candidateRole,
      });
    }
  }

  return { rows, missingReviews, selectionMatches };
}

function groupDefinitions(rows: AnalysisRow[]) {
  const eligibleRows = rows.filter((row) => row.finishPosition !== null);
  const finishGroups: GroupDefinition[] = [
    { key: "finish_1", label: "1着馬", rows: eligibleRows.filter((row) => row.finishGroup === "1") },
    { key: "finish_2_3", label: "2-3着馬", rows: eligibleRows.filter((row) => row.finishGroup === "2-3") },
    { key: "finish_4_plus", label: "4着以下", rows: eligibleRows.filter((row) => row.finishGroup === "4+") },
  ];
  const candidateGroups: GroupDefinition[] = [
    { key: "candidate_honmei", label: "単複本命", rows: eligibleRows.filter((row) => row.candidateRole === "honmei") },
    { key: "candidate_opponent", label: "相手候補", rows: eligibleRows.filter((row) => row.candidateRole === "opponent") },
    { key: "candidate_wide", label: "ワイド高配当狙い", rows: eligibleRows.filter((row) => row.candidateRole === "wide") },
    { key: "candidate_none", label: "候補外", rows: eligibleRows.filter((row) => row.candidateRole === "none") },
  ];
  const successFailureGroups: GroupDefinition[] = [
    {
      key: "honmei_hit",
      label: "単複本命で好走",
      rows: eligibleRows.filter((row) => row.candidateRole === "honmei" && row.isTop3),
    },
    {
      key: "honmei_miss",
      label: "単複本命で飛び",
      rows: eligibleRows.filter((row) => row.candidateRole === "honmei" && !row.isTop3),
    },
    {
      key: "opponent_hit",
      label: "相手候補で好走",
      rows: eligibleRows.filter((row) => row.candidateRole === "opponent" && row.isTop3),
    },
    {
      key: "opponent_miss",
      label: "相手候補で凡走",
      rows: eligibleRows.filter((row) => row.candidateRole === "opponent" && !row.isTop3),
    },
    {
      key: "wide_hit",
      label: "ワイド高配当狙いで好走",
      rows: eligibleRows.filter((row) => row.candidateRole === "wide" && row.isTop3),
    },
    {
      key: "wide_miss",
      label: "ワイド高配当狙いで凡走",
      rows: eligibleRows.filter((row) => row.candidateRole === "wide" && !row.isTop3),
    },
  ];
  return { eligibleRows, finishGroups, candidateGroups, successFailureGroups };
}

function computeQuartileSpreads(rows: AnalysisRow[]): QuartileSpread[] {
  return QUARTILE_METRICS.map(({ metric, orientation }) => {
    const metricRows = rows
      .filter((row) => typeof row[metric] === "number" && Number.isFinite(row[metric] as number))
      .sort((left, right) => Number(left[metric]) - Number(right[metric]));
    if (metricRows.length < 8) {
      return {
        metric: String(metric),
        orientation,
        bestQuartileTop3Rate: null,
        worstQuartileTop3Rate: null,
        top3RateSpread: null,
        bestQuartileWinRate: null,
        worstQuartileWinRate: null,
        winRateSpread: null,
      };
    }

    const quartileSize = Math.max(1, Math.floor(metricRows.length / 4));
    const lowRows = metricRows.slice(0, quartileSize);
    const highRows = metricRows.slice(metricRows.length - quartileSize);
    const bestRows = orientation === "high" ? highRows : lowRows;
    const worstRows = orientation === "high" ? lowRows : highRows;
    const rate = (source: AnalysisRow[], predicate: (row: AnalysisRow) => boolean) =>
      source.length > 0 ? (source.filter(predicate).length / source.length) * 100 : null;

    const bestTop3Rate = rate(bestRows, (row) => row.isTop3);
    const worstTop3Rate = rate(worstRows, (row) => row.isTop3);
    const bestWinRate = rate(bestRows, (row) => row.isWinner);
    const worstWinRate = rate(worstRows, (row) => row.isWinner);
    return {
      metric: String(metric),
      orientation,
      bestQuartileTop3Rate: round(bestTop3Rate),
      worstQuartileTop3Rate: round(worstTop3Rate),
      top3RateSpread: round(
        bestTop3Rate !== null && worstTop3Rate !== null ? bestTop3Rate - worstTop3Rate : null
      ),
      bestQuartileWinRate: round(bestWinRate),
      worstQuartileWinRate: round(worstWinRate),
      winRateSpread: round(bestWinRate !== null && worstWinRate !== null ? bestWinRate - worstWinRate : null),
    };
  }).sort((left, right) => (right.top3RateSpread ?? -Infinity) - (left.top3RateSpread ?? -Infinity));
}

function metricDomain(rows: AnalysisRow[], metric: keyof AnalysisRow) {
  const values = rows
    .map((row) => row[metric])
    .map((value) => (typeof value === "number" && Number.isFinite(value) ? value : null))
    .filter((value): value is number => value !== null);
  if (values.length === 0) return { min: null, max: null };
  return { min: Math.min(...values), max: Math.max(...values) };
}

function buildStatsTable(groups: GroupDefinition[], metrics: Array<keyof AnalysisRow>) {
  return metrics.map((metric) => ({
    metric: String(metric),
    groups: groups.map((group) => ({
      key: group.key,
      label: group.label,
      stats: summarizeMetric(group.rows, metric),
    })),
  }));
}

function buildValueOnlyComparison(rows: AnalysisRow[]) {
  const valueRows = rows
    .filter((row) => row.valueScore !== null)
    .sort((left, right) => Number(left.valueScore) - Number(right.valueScore));
  const q3Threshold = quantile(
    valueRows.map((row) => Number(row.valueScore)).filter((value) => Number.isFinite(value)),
    0.75
  );
  const topValueRows = rows.filter((row) => row.valueScore !== null && q3Threshold !== null && row.valueScore >= q3Threshold);
  const topValueHit = topValueRows.filter((row) => row.isTop3);
  const topValueMiss = topValueRows.filter((row) => !row.isTop3);
  return {
    threshold: round(q3Threshold),
    count: topValueRows.length,
    hitCount: topValueHit.length,
    missCount: topValueMiss.length,
    hitRate: round(topValueRows.length > 0 ? (topValueHit.length / topValueRows.length) * 100 : null),
    hits: Object.fromEntries(CORE_METRICS.map((metric) => [String(metric), summarizeMetric(topValueHit, metric)])),
    misses: Object.fromEntries(CORE_METRICS.map((metric) => [String(metric), summarizeMetric(topValueMiss, metric)])),
  };
}

function buildPopularityComparisons(rows: AnalysisRow[]) {
  const popularHits = rows.filter((row) => row.isTop3 && row.popularity !== null && row.popularity <= 3);
  const longshotHits = rows.filter((row) => row.isLongshotHit);
  return {
    popularHitsCount: popularHits.length,
    longshotHitsCount: longshotHits.length,
    popularHits: Object.fromEntries(CORE_METRICS.map((metric) => [String(metric), summarizeMetric(popularHits, metric)])),
    longshotHits: Object.fromEntries(CORE_METRICS.map((metric) => [String(metric), summarizeMetric(longshotHits, metric)])),
  };
}

function buildMissingDataSummary(rows: AnalysisRow[], races: GeneratedRace[], missingReviews: string[]) {
  return {
    raceCount: races.length,
    horseCount: rows.length,
    missingReviewRaceIds: missingReviews,
    missingFinishPositionCount: rows.filter((row) => row.finishPosition === null).length,
    missingPopularityCount: rows.filter((row) => row.popularity === null).length,
    missingOddsCount: rows.filter((row) => row.odds === null).length,
    missingEdgeCount: rows.filter((row) => row.edge === null).length,
  };
}

function renderMetricSummaryTable(
  title: string,
  groups: GroupDefinition[],
  metrics: Array<keyof AnalysisRow>,
  rows: AnalysisRow[],
  metricKinds: Partial<Record<keyof AnalysisRow, "pct01" | "num" | "pp">> = {}
): string {
  const lines: string[] = [
    `### ${title}`,
    "",
    "| 指標 | グループ | 件数 | 中央値 | Q1 | Q3 | 平均 | ASCII box |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const metric of metrics) {
    const domain = metricDomain(rows, metric);
    const summaries = groups.map((group) => ({ group, stats: summarizeMetric(group.rows, metric) }));
    for (const [index, entry] of summaries.entries()) {
      const { stats, group } = entry;
      lines.push(
        `| ${index === 0 ? String(metric) : ""} | ${group.label} | ${stats.count} | ${formatMetricValue(
          stats.median,
          metricKinds[metric] ?? "num"
        )} | ${formatMetricValue(stats.q1, metricKinds[metric] ?? "num")} | ${formatMetricValue(
          stats.q3,
          metricKinds[metric] ?? "num"
        )} | ${formatMetricValue(stats.mean, metricKinds[metric] ?? "num")} | \`${createAsciiBoxplot(
          stats,
          domain.min,
          domain.max
        )}\` |`
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

function renderFindings(summary: {
  popularityComparisons: ReturnType<typeof buildPopularityComparisons>;
  valueOnlyComparison: ReturnType<typeof buildValueOnlyComparison>;
  finishStats: MetricStatsByGroup;
  successFailureStats: MetricStatsByGroup;
  quartileSpreads: QuartileSpread[];
}) {
  const finish1 = summary.finishStats.finish_1;
  const finish23 = summary.finishStats.finish_2_3;
  const finish4 = summary.finishStats.finish_4_plus;
  const honmeiHit = summary.successFailureStats.honmei_hit;
  const honmeiMiss = summary.successFailureStats.honmei_miss;
  const opponentHit = summary.successFailureStats.opponent_hit;
  const opponentMiss = summary.successFailureStats.opponent_miss;
  const wideHit = summary.successFailureStats.wide_hit;
  const wideMiss = summary.successFailureStats.wide_miss;
  const topSignals = summary.quartileSpreads.slice(0, 5);

  const lines: string[] = ["## 着順別の特徴", ""];
  lines.push(
    `- 1着馬は placeProb 中央値 ${formatMetricValue(finish1.placeProb.median, "pct01")} / placeScore ${formatMetricValue(finish1.placeScore.median)} / top3Stability ${formatMetricValue(finish1.top3Stability.median)}。4着以下の ${formatMetricValue(finish4.placeProb.median, "pct01")} / ${formatMetricValue(finish4.placeScore.median)} / ${formatMetricValue(finish4.top3Stability.median)} とは明確に差があり、まず「3着内側の土台」を持っている。`
  );
  lines.push(
    `- ただし 1着馬と 2-3着馬の差は小さく、simWinProb は 1着 ${formatMetricValue(finish1.simWinProb.median, "pct01")} に対して 2-3着 ${formatMetricValue(finish23.simWinProb.median, "pct01")}、edge は 1着 ${formatMetricValue(finish1.edge.median, "pp")} に対して 2-3着 ${formatMetricValue(finish23.edge.median, "pp")}。現状指標は「上位か下位か」は分けるが、「勝ち切りか2-3着か」の切り分けはまだ弱い。`
  );
  lines.push(
    `- scoreGap は 1着馬 ${formatMetricValue(finish1.scoreGap.median)}、2-3着馬 ${formatMetricValue(finish23.scoreGap.median)}、4着以下 ${formatMetricValue(finish4.scoreGap.median)}。上位馬ほど placeScore 首位との差が小さく、低 gap 側は3着内率も高い。`
  );
  lines.push("");
  lines.push("## 人気別の観察", "");
  lines.push(
    `- 上位人気好走馬 (${summary.popularityComparisons.popularHitsCount}頭) は placeProb 中央値 ${formatMetricValue(summary.popularityComparisons.popularHits.placeProb.median, "pct01")} / placeScore ${formatMetricValue(summary.popularityComparisons.popularHits.placeScore.median)} / edge ${formatMetricValue(summary.popularityComparisons.popularHits.edge.median, "pp")}。`
  );
  lines.push(
    `- 人気薄好走馬 (${summary.popularityComparisons.longshotHitsCount}頭) は valueScore 中央値 ${formatMetricValue(summary.popularityComparisons.longshotHits.valueScore.median)} が高い一方で、placeProb ${formatMetricValue(summary.popularityComparisons.longshotHits.placeProb.median, "pct01")} と top3Stability ${formatMetricValue(summary.popularityComparisons.longshotHits.top3Stability.median)} も一定水準を持っており、valueScore だけで来ている形ではない。`
  );
  lines.push("");
  lines.push("## 候補の成功/失敗パターン", "");
  lines.push(
    `- 単複本命の好走群は placeProb 中央値 ${formatMetricValue(honmeiHit.placeProb.median, "pct01")} / placeScore ${formatMetricValue(honmeiHit.placeScore.median)} / selectionScoreGap ${formatMetricValue(honmeiHit.selectionScoreGap.median)} / simWinProb ${formatMetricValue(honmeiHit.simWinProb.median, "pct01")}。飛んだ群は ${formatMetricValue(honmeiMiss.placeProb.median, "pct01")} / ${formatMetricValue(honmeiMiss.placeScore.median)} / ${formatMetricValue(honmeiMiss.selectionScoreGap.median)} / ${formatMetricValue(honmeiMiss.simWinProb.median, "pct01")} で、差は大きくないが「押し出し差」と sim 側の裏付けが弱いと崩れやすい。`
  );
  lines.push(
    `- 相手候補の好走群は placeProb ${formatMetricValue(opponentHit.placeProb.median, "pct01")} / top3Stability ${formatMetricValue(opponentHit.top3Stability.median)}。凡走群は ${formatMetricValue(opponentMiss.placeProb.median, "pct01")} / ${formatMetricValue(opponentMiss.top3Stability.median)} で、差は小さいが valueScore より placeProb と安定度のほうが残り方に寄っていそう。scoreGap は hit/miss で素直に分かれず、危険シグナルとしては弱め。`
  );
  lines.push(
    `- ワイド高配当狙いの好走群は valueScore ${formatMetricValue(wideHit.valueScore.median)} / placeReturnEdge ${formatMetricValue(wideHit.placeReturnEdge.median)} / placeProb ${formatMetricValue(wideHit.placeProb.median, "pct01")}。凡走群も ${formatMetricValue(wideMiss.valueScore.median)} / ${formatMetricValue(wideMiss.placeReturnEdge.median)} / ${formatMetricValue(wideMiss.placeProb.median, "pct01")} とかなり近く、現状の wide 判定は刺さるケースと刺さらないケースをまだ十分に分離できていない。`
  );
  lines.push("");
  lines.push("## valueScore 高いだけの馬との違い", "");
  lines.push(
    `- valueScore 上位四分位 (閾値 ${formatMetricValue(summary.valueOnlyComparison.threshold)}) は ${summary.valueOnlyComparison.count}頭いて、そのうち好走は ${summary.valueOnlyComparison.hitCount}頭 (${formatMetricValue(summary.valueOnlyComparison.hitRate, "num")}%)。`
  );
  lines.push(
    `- 同じ高 valueScore 帯でも、好走馬は placeProb 中央値 ${formatMetricValue(summary.valueOnlyComparison.hits.placeProb.median, "pct01")} / top3Stability ${formatMetricValue(summary.valueOnlyComparison.hits.top3Stability.median)}、凡走馬は ${formatMetricValue(summary.valueOnlyComparison.misses.placeProb.median, "pct01")} / ${formatMetricValue(summary.valueOnlyComparison.misses.top3Stability.median)}。valueScore に加えて「複勝側の土台」が必要そう。`
  );
  lines.push("");
  lines.push("## 四分位スプレッド上位", "");
  for (const signal of topSignals) {
    lines.push(
      `- ${signal.metric}: 良い四分位と悪い四分位の top3率差 ${signal.top3RateSpread === null ? "-" : `${signal.top3RateSpread.toFixed(1)}pt`} / win率差 ${signal.winRateSpread === null ? "-" : `${signal.winRateSpread.toFixed(1)}pt`}。`
    );
  }
  lines.push("- edge は正方向 quartile のほうが top3率・win率ともに低く、結果シグナルというより『妙味/市場とのズレ』寄りの役割に見える。");
  lines.push("- placeReturnEdge は四分位差がほぼ出ておらず、単独では3着内向きシグナルになっていない。");
  lines.push("");
  lines.push("## 断定を急がない点", "");
  lines.push("- 対象はワークスペース内で復元できた 2026-03-06 から 2026-04-05 の 39レースで、フェブラリーS当日を含む 2月後半データは確認できていない。");
  lines.push("- ワイド高配当狙いの好走件数は少なめなので、valueScore や placeReturnEdge の差は方向感の確認に留めるべき。");
  lines.push("- scoreGap は本レポートでは placeScore 首位との差として全頭共通化しており、選出時に表示される selectionScoreGap とは別物として見ている。");
  lines.push("");
  lines.push("## 次の改修候補としての仮説", "");
  lines.push("- 勝ち切り役は simWinProb / edge の役割が強く、3着内役は placeProb / top3Stability の役割が強い可能性がある。");
  lines.push("- 相手候補とワイド高配当狙いは、valueScore 単独ではなく placeProb か top3Stability の最低ラインが必要かもしれない。");
  lines.push("- 本命が飛ぶケースは、placeScore そのものより selectionScoreGap や simEdge の押し出し不足を先に確認したほうが良い可能性がある。");
  lines.push("- ただし今回は観察段階に留め、閾値や重みの変更は行っていない。");
  lines.push("");
  return lines.join("\n");
}

async function writeDataset(rows: AnalysisRow[]) {
  const columns = Object.keys(rows[0] ?? {});
  const csvLines = [columns.join(",")];
  for (const row of rows) {
    csvLines.push(columns.map((column) => csvEscape((row as Record<string, unknown>)[column])).join(","));
  }
  await fs.writeFile(DATASET_PATH, `${csvLines.join("\n")}\n`, "utf8");
  return columns;
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const [races, reviewByRaceId] = await Promise.all([loadGeneratedRaces(), loadReviewRecords()]);
  const { rows, missingReviews, selectionMatches } = buildRows(races, reviewByRaceId);
  const { eligibleRows, finishGroups, candidateGroups, successFailureGroups } = groupDefinitions(rows);

  const finishStats = summarizeGroups(finishGroups, METRICS);
  const candidateStats = summarizeGroups(candidateGroups, METRICS);
  const successFailureStats = summarizeGroups(successFailureGroups, METRICS);
  const quartileSpreads = computeQuartileSpreads(eligibleRows);
  const valueOnlyComparison = buildValueOnlyComparison(eligibleRows);
  const popularityComparisons = buildPopularityComparisons(eligibleRows);
  const missingData = buildMissingDataSummary(rows, races, missingReviews);
  const datasetColumns = await writeDataset(rows);

  const summary = {
    meta: {
      generatedAt: new Date().toISOString(),
      analysisStartDate: START_DATE,
      availableRaceDateRange: {
        start: races[0]?.date ?? null,
        end: races[races.length - 1]?.date ?? null,
      },
      dataSources: [
        "data/review-records.json",
        "lib/generatedRaceSchedule.ts",
        "lib/tanpukuSelection.mjs",
      ],
      notes: [
        "Workspace-local data was recoverable from 2026-03-06 onward; February races were not present in the current repository snapshot.",
        "Current tanpuku metrics were recomputed with pickTanpukuPair for every archived race horse.",
        "Snapshot edge and sim rank data were read from review-records current v2.2 snapshots.",
      ],
    },
    counts: {
      raceCount: races.length,
      horseCount: rows.length,
      eligibleHorseCount: eligibleRows.length,
    },
    selectionReproducibility: {
      totalRacesCompared: selectionMatches.total,
      honmeiMatchCount: selectionMatches.honmei,
      opponentMatchCount: selectionMatches.opponent,
      wideMatchCount: selectionMatches.wide,
    },
    datasetColumns,
    missingData,
    finishGroups: buildStatsTable(finishGroups, CORE_METRICS),
    candidateGroups: buildStatsTable(candidateGroups, CORE_METRICS),
    successFailureGroups: buildStatsTable(successFailureGroups, CORE_METRICS),
    finishStats,
    candidateStats,
    successFailureStats,
    quartileSpreads,
    valueOnlyComparison,
    popularityComparisons,
  };

  await fs.writeFile(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const metricKinds: Partial<Record<keyof AnalysisRow, "pct01" | "num" | "pp">> = {
    simWinProb: "pct01",
    edge: "pp",
    placeProb: "pct01",
  };

  const reportLines: string[] = [
    "# フェブラリーS以降 現行指標 回顧分析",
    "",
    "## changed files",
    "",
    "- scripts/analyze-post-feb-retrospective.ts",
    "- data/analysis/post-feb-current-indicator-table.csv",
    "- data/analysis/post-feb-current-indicator-summary.json",
    "- data/analysis/post-feb-current-indicator-report.md",
    "",
    "## どのデータソースを使ったか",
    "",
    "- `data/review-records.json`: 現行 v2.2 の snapshot / honmei / opponent / wide / 結果紐付け",
    "- `lib/generatedRaceSchedule.ts`: archive/complete 済みレースの全頭情報、確定着順、人気、単勝オッズ",
    "- `lib/tanpukuSelection.mjs`: 全頭分の現行指標を再計算 (`pickTanpukuPair`)",
    "",
    "## 生成した分析用データの列一覧",
    "",
    datasetColumns.map((column) => `- ${column}`).join("\n"),
    "",
    "## 全体件数",
    "",
    `- レース数: ${races.length}`,
    `- 馬数: ${rows.length}`,
    `- 着順が入った分析対象馬数: ${eligibleRows.length}`,
    `- 復元可能な日付範囲: ${races[0]?.date ?? "-"} 〜 ${races[races.length - 1]?.date ?? "-"}`,
    "- フェブラリーS当日データ: ワークスペース内では未確認",
    "",
    "## 再現性チェック",
    "",
    `- 単複本命一致: ${selectionMatches.honmei}/${selectionMatches.total}`,
    `- 相手候補一致: ${selectionMatches.opponent}/${selectionMatches.total}`,
    `- ワイド高配当狙い一致: ${selectionMatches.wide}/${selectionMatches.total}`,
    "",
    renderMetricSummaryTable("着順別分布", finishGroups, CORE_METRICS, eligibleRows, metricKinds),
    renderMetricSummaryTable("候補別分布", candidateGroups, CORE_METRICS, eligibleRows, metricKinds),
    renderMetricSummaryTable("成功/失敗別分布", successFailureGroups, CORE_METRICS, eligibleRows, metricKinds),
    renderFindings({
      popularityComparisons,
      valueOnlyComparison,
      finishStats,
      successFailureStats,
      quartileSpreads,
    }),
  ];

  await fs.writeFile(REPORT_PATH, `${reportLines.join("\n")}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        raceCount: races.length,
        horseCount: rows.length,
        eligibleHorseCount: eligibleRows.length,
        datasetPath: DATASET_PATH,
        summaryPath: SUMMARY_PATH,
        reportPath: REPORT_PATH,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
