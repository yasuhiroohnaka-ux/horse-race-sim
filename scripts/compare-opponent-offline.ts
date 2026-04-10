import fs from "node:fs/promises";
import path from "node:path";

type CsvRow = {
  raceId: string;
  raceDate: string;
  raceName: string;
  venue: string;
  venueKey: string;
  surface: string;
  distance: number | null;
  grade: string;
  raceNumber: number | null;
  horseId: string;
  externalHorseId: string | null;
  horseName: string;
  finishPosition: number | null;
  finishGroup: string;
  popularity: number | null;
  odds: number | null;
  horseNumber: number | null;
  simWinProb: number | null;
  placeProb: number | null;
  placeScore: number | null;
  valueScore: number | null;
  top3Stability: number | null;
  placeReturnEdge: number | null;
  scoreGap: number | null;
  selectionScoreGap: number | null;
  candidateRole: "honmei" | "opponent" | "wide" | "none";
};

type OfficialPayoutTable = {
  resultNumbers?: unknown;
  payouts?: unknown;
};

type OfficialRace = {
  raceId?: unknown;
  courseId?: unknown;
  label?: unknown;
  horses?: Array<{
    id?: unknown;
    externalHorseId?: unknown;
    name?: unknown;
    gateNumber?: unknown;
  }>;
  result?: {
    finishers?: Array<{
      horseId?: unknown;
      externalHorseId?: unknown;
      horseNumber?: unknown;
      gateNumber?: unknown;
      name?: unknown;
    }>;
    payouts?: {
      tansho?: OfficialPayoutTable;
      fukusho?: OfficialPayoutTable;
      wide?: OfficialPayoutTable;
    };
  };
};

type CanonicalHorse = {
  key: string;
  nameKey: string;
  raceId: string;
  horseName: string;
  externalHorseId: string | null;
  horseId: string;
  horseNumber: number | null;
  finishPosition: number | null;
  finishGroup: string;
  popularity: number | null;
  odds: number | null;
  simWinProb: number | null;
  placeProb: number | null;
  placeScore: number | null;
  valueScore: number | null;
  top3Stability: number | null;
  placeReturnEdge: number | null;
  scoreGap: number | null;
  selectionScoreGap: number | null;
  sourceRoleSet: Set<string>;
};

type OfficialRaceLookup = {
  race: OfficialRace;
  horseNumberByExternalId: Map<string, number>;
  horseNumberByHorseId: Map<string, number>;
  horseNumberByName: Map<string, number>;
};

type SchemeName = "current" | "proposalA" | "proposalB" | "proposalC";

type SchemeDefinition = {
  name: SchemeName;
  label: string;
  description: string;
  select: (params: {
    horses: CanonicalHorse[];
    honmei: CanonicalHorse;
  }) => {
    ordered: CanonicalHorse[];
    selected: CanonicalHorse | null;
    overlapAvoided: boolean;
  };
};

type RaceSelection = {
  raceId: string;
  raceDate: string;
  raceName: string;
  honmei: CanonicalHorse;
  opponent: CanonicalHorse | null;
  overlapAvoided: boolean;
  officialCoverage: {
    opponentHorseNumber: number | null;
    honmeiHorseNumber: number | null;
    hasOfficialPayouts: boolean;
  };
  opponentResult: {
    isWin: boolean | null;
    isPlace: boolean | null;
    tanPayout: number | null;
    fukuPayout: number | null;
  };
  wideResult: {
    isHit: boolean | null;
    payout: number | null;
  };
  swapFromCurrent: boolean | null;
  gapsToHonmei: {
    placeProb: number | null;
    placeScore: number | null;
    top3Stability: number | null;
    simWinProb: number | null;
  };
};

type SummaryStats = {
  count: number;
  mean: number | null;
  median: number | null;
  q1: number | null;
  q3: number | null;
  min: number | null;
  max: number | null;
};

type SchemeSummary = {
  name: SchemeName;
  label: string;
  description: string;
  raceCount: number;
  duplicateNameRaceCount: number;
  selectedRaceCount: number;
  officialSettledRaceCount: number;
  opponentPlaceHitCount: number;
  opponentPlaceRate: number | null;
  opponentPlaceRoi: number | null;
  opponentWinHitCount: number;
  opponentWinRate: number | null;
  opponentWinRoi: number | null;
  wideHitCount: number;
  wideHitRate: number | null;
  wideRoi: number | null;
  swapCountVsCurrent: number | null;
  observedOverlapCount: number;
  overlapAvoidedCount: number;
  averageProfile: Record<string, number | null>;
  profileStats: Record<string, SummaryStats>;
  honmeiGapAverages: Record<string, number | null>;
  raceSelections: RaceSelection[];
};

type JsonOutput = {
  meta: {
    generatedAt: string;
    comparedRaceCount: number;
    dataSources: string[];
    duplicateNameRaceIds: string[];
    notes: string[];
  };
  schemes: SchemeSummary[];
};

const ROOT = process.cwd();
const ANALYSIS_DIR = path.join(ROOT, "data", "analysis");
const TABLE_PATH = path.join(ANALYSIS_DIR, "post-feb-current-indicator-table.csv");
const OUTPUT_JSON_PATH = path.join(ANALYSIS_DIR, "post-feb-opponent-logic-comparison.json");
const OUTPUT_MD_PATH = path.join(ANALYSIS_DIR, "post-feb-opponent-logic-comparison.md");
const WEEKLY_RACES_PATH = path.join(ROOT, "data", "weekly-races.json");

function normalizeString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeRaceId(value: unknown, courseId?: unknown): string | null {
  const raceId = normalizeString(value);
  if (raceId) return raceId;
  const match = String(courseId ?? "").match(/(\d{12})$/);
  return match?.[1] ?? null;
}

function normalizeHorseName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function toNumber(value: string): number | null {
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number | null, digits = 3): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseCsvLine(line: string): string[] {
  const columns: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      columns.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  columns.push(current);
  return columns;
}

async function readTableRows(): Promise<CsvRow[]> {
  const raw = (await fs.readFile(TABLE_PATH, "utf8")).replace(/^\uFEFF/, "");
  const [headerLine, ...bodyLines] = raw.trim().split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  return bodyLines.map((line) => {
    const values = parseCsvLine(line);
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    return {
      raceId: String(record.raceId),
      raceDate: String(record.raceDate),
      raceName: String(record.raceName),
      venue: String(record.venue),
      venueKey: String(record.venueKey),
      surface: String(record.surface),
      distance: toNumber(String(record.distance)),
      grade: String(record.grade),
      raceNumber: toNumber(String(record.raceNumber)),
      horseId: String(record.horseId),
      externalHorseId: normalizeString(record.externalHorseId),
      horseName: String(record.horseName),
      finishPosition: toNumber(String(record.finishPosition)),
      finishGroup: String(record.finishGroup),
      popularity: toNumber(String(record.popularity)),
      odds: toNumber(String(record.odds)),
      horseNumber: toNumber(String(record.horseNumber)),
      simWinProb: toNumber(String(record.simWinProb)),
      placeProb: toNumber(String(record.placeProb)),
      placeScore: toNumber(String(record.placeScore)),
      valueScore: toNumber(String(record.valueScore)),
      top3Stability: toNumber(String(record.top3Stability)),
      placeReturnEdge: toNumber(String(record.placeReturnEdge)),
      scoreGap: toNumber(String(record.scoreGap)),
      selectionScoreGap: toNumber(String(record.selectionScoreGap)),
      candidateRole: (record.candidateRole || "none") as CsvRow["candidateRole"],
    };
  });
}

async function readOfficialRaceLookups(): Promise<Map<string, OfficialRaceLookup>> {
  const raw = JSON.parse((await fs.readFile(WEEKLY_RACES_PATH, "utf8")).replace(/^\uFEFF/, ""));
  const officialRaces: OfficialRace[] = [
    ...(Array.isArray(raw.currentWeek?.races) ? raw.currentWeek.races : []),
    ...((Array.isArray(raw.archives) ? raw.archives : []).flatMap((archive: { races?: OfficialRace[] }) =>
      Array.isArray(archive?.races) ? archive.races : []
    )),
  ];

  const raceMap = new Map<string, OfficialRaceLookup>();
  for (const race of officialRaces) {
    const raceId = normalizeRaceId(race.raceId, race.courseId);
    if (!raceId) continue;

    const horseNumberByExternalId = new Map<string, number>();
    const horseNumberByHorseId = new Map<string, number>();
    const horseNumberByName = new Map<string, number>();

    for (const horse of Array.isArray(race.horses) ? race.horses : []) {
      const horseNumber = Number(horse.id ?? horse.gateNumber);
      if (!Number.isFinite(horseNumber) || horseNumber <= 0) continue;
      const horseId = normalizeString(horse.id);
      const externalHorseId = normalizeString(horse.externalHorseId);
      const nameKey = normalizeHorseName(horse.name);
      if (horseId && !horseNumberByHorseId.has(horseId)) horseNumberByHorseId.set(horseId, horseNumber);
      if (externalHorseId && !horseNumberByExternalId.has(externalHorseId)) horseNumberByExternalId.set(externalHorseId, horseNumber);
      if (nameKey && !horseNumberByName.has(nameKey)) horseNumberByName.set(nameKey, horseNumber);
    }

    for (const finisher of Array.isArray(race.result?.finishers) ? race.result.finishers : []) {
      const horseNumber = Number(finisher.horseNumber ?? finisher.gateNumber);
      if (!Number.isFinite(horseNumber) || horseNumber <= 0) continue;
      const horseId = normalizeString(finisher.horseId);
      const externalHorseId = normalizeString(finisher.externalHorseId);
      const nameKey = normalizeHorseName(finisher.name);
      if (horseId) horseNumberByHorseId.set(horseId, horseNumber);
      if (externalHorseId) horseNumberByExternalId.set(externalHorseId, horseNumber);
      if (nameKey) horseNumberByName.set(nameKey, horseNumber);
    }

    raceMap.set(raceId, {
      race,
      horseNumberByExternalId,
      horseNumberByHorseId,
      horseNumberByName,
    });
  }

  return raceMap;
}

function preferredRow(rows: CsvRow[]): CsvRow {
  const score = (row: CsvRow) =>
    [
      row.externalHorseId ? 4 : 0,
      row.horseNumber !== null ? 4 : 0,
      row.finishPosition !== null ? 3 : 0,
      row.popularity !== null ? 1 : 0,
      row.odds !== null ? 1 : 0,
      row.placeProb !== null ? 1 : 0,
      row.placeScore !== null ? 1 : 0,
    ].reduce((sum, value) => sum + value, 0);

  return [...rows].sort((left, right) => score(right) - score(left))[0];
}

function pickNumber(values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (value !== null && value !== undefined && Number.isFinite(value)) return Number(value);
  }
  return null;
}

function buildCanonicalHorses(rows: CsvRow[]): CanonicalHorse[] {
  const byName = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const nameKey = normalizeHorseName(row.horseName);
    if (!nameKey) continue;
    const group = byName.get(nameKey) ?? [];
    group.push(row);
    byName.set(nameKey, group);
  }

  const canonical: CanonicalHorse[] = [];
  for (const [nameKey, group] of byName.entries()) {
    const base = preferredRow(group);
    canonical.push({
      key: `${base.raceId}:${nameKey}`,
      nameKey,
      raceId: base.raceId,
      horseName: base.horseName,
      externalHorseId: normalizeString(group.map((row) => row.externalHorseId).find(Boolean) ?? base.externalHorseId),
      horseId: String(group.map((row) => row.horseId).find(Boolean) ?? base.horseId),
      horseNumber: pickNumber(group.map((row) => row.horseNumber)),
      finishPosition: pickNumber(group.map((row) => row.finishPosition)),
      finishGroup: group.find((row) => row.finishGroup && row.finishGroup !== "missing")?.finishGroup ?? base.finishGroup,
      popularity: pickNumber(group.map((row) => row.popularity)),
      odds: pickNumber(group.map((row) => row.odds)),
      simWinProb: pickNumber(group.map((row) => row.simWinProb)),
      placeProb: pickNumber(group.map((row) => row.placeProb)),
      placeScore: pickNumber(group.map((row) => row.placeScore)),
      valueScore: pickNumber(group.map((row) => row.valueScore)),
      top3Stability: pickNumber(group.map((row) => row.top3Stability)),
      placeReturnEdge: pickNumber(group.map((row) => row.placeReturnEdge)),
      scoreGap: pickNumber(group.map((row) => row.scoreGap)),
      selectionScoreGap: pickNumber(group.map((row) => row.selectionScoreGap)),
      sourceRoleSet: new Set(group.map((row) => row.candidateRole).filter((role) => role !== "none")),
    });
  }

  return canonical;
}

function getCanonicalByRawRow(canonicalHorses: CanonicalHorse[], row: CsvRow | undefined): CanonicalHorse | null {
  if (!row) return null;
  const nameKey = normalizeHorseName(row.horseName);
  return canonicalHorses.find((horse) => horse.nameKey === nameKey) ?? null;
}

function getTableRowsByRace(rows: CsvRow[]): Map<string, CsvRow[]> {
  const grouped = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.raceId) ?? [];
    bucket.push(row);
    grouped.set(row.raceId, bucket);
  }
  return grouped;
}

function payoutByHorseNumber(table: OfficialPayoutTable | undefined, horseNumber: number | null): number | null {
  if (!table || horseNumber === null) return null;
  const resultNumbers = Array.isArray(table.resultNumbers)
    ? table.resultNumbers.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];
  const payouts = Array.isArray(table.payouts)
    ? table.payouts.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];
  const index = resultNumbers.findIndex((value) => value === horseNumber);
  if (index < 0) return 0;
  const payout = payouts[index];
  return Number.isFinite(payout) ? Math.round(payout) : null;
}

function widePayoutByPair(table: OfficialPayoutTable | undefined, pair: [number, number] | null): number | null {
  if (!table || !pair) return null;
  const resultNumbers = Array.isArray(table.resultNumbers) ? table.resultNumbers : [];
  const payouts = Array.isArray(table.payouts)
    ? table.payouts.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];

  const normalizedPair = [...pair].sort((left, right) => left - right) as [number, number];
  for (let index = 0; index < resultNumbers.length; index += 1) {
    const entry = resultNumbers[index];
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const left = Number(entry[0]);
    const right = Number(entry[1]);
    if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
    const entryPair = [left, right].sort((a, b) => a - b) as [number, number];
    if (entryPair[0] === normalizedPair[0] && entryPair[1] === normalizedPair[1]) {
      const payout = payouts[index];
      return Number.isFinite(payout) ? Math.round(payout) : null;
    }
  }
  return 0;
}

function resolveHorseNumber(horse: CanonicalHorse, lookup: OfficialRaceLookup | undefined): number | null {
  if (horse.horseNumber !== null) return horse.horseNumber;
  if (!lookup) return null;
  if (horse.externalHorseId && lookup.horseNumberByExternalId.has(horse.externalHorseId)) {
    return lookup.horseNumberByExternalId.get(horse.externalHorseId) ?? null;
  }
  if (horse.horseId && lookup.horseNumberByHorseId.has(horse.horseId)) {
    return lookup.horseNumberByHorseId.get(horse.horseId) ?? null;
  }
  return lookup.horseNumberByName.get(horse.nameKey) ?? null;
}

function compareDesc(left: number | null, right: number | null): number {
  return (right ?? Number.NEGATIVE_INFINITY) - (left ?? Number.NEGATIVE_INFINITY);
}

function rankScoreMap(horses: CanonicalHorse[], metric: keyof CanonicalHorse): Map<string, number> {
  const sorted = [...horses].sort((left, right) => compareDesc(left[metric] as number | null, right[metric] as number | null));
  const size = Math.max(sorted.length - 1, 1);
  const map = new Map<string, number>();
  sorted.forEach((horse, index) => {
    map.set(horse.key, 1 - index / size);
  });
  return map;
}

function lexicographicSelection(
  horses: CanonicalHorse[],
  honmei: CanonicalHorse,
  metrics: Array<keyof CanonicalHorse>
): { ordered: CanonicalHorse[]; selected: CanonicalHorse | null; overlapAvoided: boolean } {
  const ordered = [...horses].sort((left, right) => {
    for (const metric of metrics) {
      const diff = compareDesc(left[metric] as number | null, right[metric] as number | null);
      if (diff !== 0) return diff;
    }
    return (left.popularity ?? Number.POSITIVE_INFINITY) - (right.popularity ?? Number.POSITIVE_INFINITY);
  });
  const overlapAvoided = ordered[0]?.key === honmei.key;
  const selected = ordered.find((horse) => horse.key !== honmei.key) ?? null;
  return { ordered, selected, overlapAvoided };
}

function compositeSelection(
  horses: CanonicalHorse[],
  honmei: CanonicalHorse
): { ordered: CanonicalHorse[]; selected: CanonicalHorse | null; overlapAvoided: boolean } {
  const placeProbRank = rankScoreMap(horses, "placeProb");
  const placeScoreRank = rankScoreMap(horses, "placeScore");
  const stabilityRank = rankScoreMap(horses, "top3Stability");
  const simWinRank = rankScoreMap(horses, "simWinProb");

  const composite = (horse: CanonicalHorse) =>
    (placeProbRank.get(horse.key) ?? 0) * 0.4 +
    (placeScoreRank.get(horse.key) ?? 0) * 0.35 +
    (stabilityRank.get(horse.key) ?? 0) * 0.2 +
    (simWinRank.get(horse.key) ?? 0) * 0.05;

  const ordered = [...horses].sort((left, right) => {
    const diff = composite(right) - composite(left);
    if (diff !== 0) return diff;
    return (
      compareDesc(left.placeProb, right.placeProb) ||
      compareDesc(left.placeScore, right.placeScore) ||
      compareDesc(left.top3Stability, right.top3Stability) ||
      compareDesc(left.simWinProb, right.simWinProb) ||
      (left.popularity ?? Number.POSITIVE_INFINITY) - (right.popularity ?? Number.POSITIVE_INFINITY)
    );
  });

  const overlapAvoided = ordered[0]?.key === honmei.key;
  const selected = ordered.find((horse) => horse.key !== honmei.key) ?? null;
  return { ordered, selected, overlapAvoided };
}

const SCHEMES: SchemeDefinition[] = [
  {
    name: "proposalA",
    label: "Plan A",
    description: "Priority: placeProb -> top3Stability -> placeScore -> simWinProb",
    select: ({ horses, honmei }) => lexicographicSelection(horses, honmei, ["placeProb", "top3Stability", "placeScore", "simWinProb"]),
  },
  {
    name: "proposalB",
    label: "Plan B",
    description: "Priority: placeScore -> placeProb -> top3Stability -> simWinProb",
    select: ({ horses, honmei }) => lexicographicSelection(horses, honmei, ["placeScore", "placeProb", "top3Stability", "simWinProb"]),
  },
  {
    name: "proposalC",
    label: "Plan C",
    description: "Composite rank score: 0.40*placeProb + 0.35*placeScore + 0.20*top3Stability + 0.05*simWinProb",
    select: ({ horses, honmei }) => compositeSelection(horses, honmei),
  },
];

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(values: number[], ratio: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function summarize(values: Array<number | null>): SummaryStats {
  const filtered = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (filtered.length === 0) {
    return { count: 0, mean: null, median: null, q1: null, q3: null, min: null, max: null };
  }
  const sorted = [...filtered].sort((left, right) => left - right);
  return {
    count: sorted.length,
    mean: round(mean(sorted)),
    median: round(quantile(sorted, 0.5)),
    q1: round(quantile(sorted, 0.25)),
    q3: round(quantile(sorted, 0.75)),
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
  };
}

function formatPct01(value: number | null): string {
  if (value === null) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function formatRoi(value: number | null): string {
  if (value === null) return "-";
  return `${value.toFixed(1)}%`;
}

function formatNumber(value: number | null, digits = 3): string {
  if (value === null) return "-";
  return value.toFixed(digits);
}

function summarizeScheme(
  name: SchemeName,
  label: string,
  description: string,
  raceSelections: RaceSelection[],
  duplicateNameRaceCount: number
): SchemeSummary {
  const selected = raceSelections.filter((selection) => selection.opponent);
  const settled = selected.filter(
    (selection) =>
      selection.officialCoverage.hasOfficialPayouts &&
      selection.officialCoverage.opponentHorseNumber !== null &&
      selection.officialCoverage.honmeiHorseNumber !== null
  );
  const placeHits = settled.filter((selection) => selection.opponentResult.isPlace === true);
  const winHits = settled.filter((selection) => selection.opponentResult.isWin === true);
  const wideHits = settled.filter((selection) => selection.wideResult.isHit === true);

  const profileKeys: Array<keyof CanonicalHorse> = [
    "popularity",
    "odds",
    "placeProb",
    "placeScore",
    "top3Stability",
    "simWinProb",
    "scoreGap",
    "valueScore",
    "placeReturnEdge",
  ];

  const averageProfile = Object.fromEntries(
    profileKeys.map((key) => [
      key,
      round(
        mean(
          selected
            .map((selection) => selection.opponent?.[key] as number | null)
            .filter((value): value is number => value !== null && Number.isFinite(value))
        )
      ),
    ])
  );

  const profileStats = Object.fromEntries(
    profileKeys.map((key) => [
      key,
      summarize(selected.map((selection) => (selection.opponent?.[key] as number | null) ?? null)),
    ])
  );

  const honmeiGapAverages = {
    placeProb: round(
      mean(
        selected
          .map((selection) => selection.gapsToHonmei.placeProb)
          .filter((value): value is number => value !== null && Number.isFinite(value))
      )
    ),
    placeScore: round(
      mean(
        selected
          .map((selection) => selection.gapsToHonmei.placeScore)
          .filter((value): value is number => value !== null && Number.isFinite(value))
      )
    ),
    top3Stability: round(
      mean(
        selected
          .map((selection) => selection.gapsToHonmei.top3Stability)
          .filter((value): value is number => value !== null && Number.isFinite(value))
      )
    ),
    simWinProb: round(
      mean(
        selected
          .map((selection) => selection.gapsToHonmei.simWinProb)
          .filter((value): value is number => value !== null && Number.isFinite(value))
      )
    ),
  };

  const observedOverlapCount = selected.filter(
    (selection) => selection.opponent && selection.honmei.nameKey === selection.opponent.nameKey
  ).length;

  const swapCountVsCurrent =
    name === "current"
      ? 0
      : selected.filter((selection) => selection.swapFromCurrent === true).length;

  const placePayoutTotal = settled.reduce((sum, selection) => sum + (selection.opponentResult.fukuPayout ?? 0), 0);
  const winPayoutTotal = settled.reduce((sum, selection) => sum + (selection.opponentResult.tanPayout ?? 0), 0);
  const widePayoutTotal = settled.reduce((sum, selection) => sum + (selection.wideResult.payout ?? 0), 0);

  return {
    name,
    label,
    description,
    raceCount: raceSelections.length,
    duplicateNameRaceCount,
    selectedRaceCount: selected.length,
    officialSettledRaceCount: settled.length,
    opponentPlaceHitCount: placeHits.length,
    opponentPlaceRate: round(settled.length > 0 ? placeHits.length / settled.length : null),
    opponentPlaceRoi: round(settled.length > 0 ? (placePayoutTotal / (settled.length * 100)) * 100 : null, 1),
    opponentWinHitCount: winHits.length,
    opponentWinRate: round(settled.length > 0 ? winHits.length / settled.length : null),
    opponentWinRoi: round(settled.length > 0 ? (winPayoutTotal / (settled.length * 100)) * 100 : null, 1),
    wideHitCount: wideHits.length,
    wideHitRate: round(settled.length > 0 ? wideHits.length / settled.length : null),
    wideRoi: round(settled.length > 0 ? (widePayoutTotal / (settled.length * 100)) * 100 : null, 1),
    swapCountVsCurrent,
    observedOverlapCount,
    overlapAvoidedCount: raceSelections.filter((selection) => selection.overlapAvoided).length,
    averageProfile,
    profileStats,
    honmeiGapAverages,
    raceSelections,
  };
}

function currentSelectionSummary(current: SchemeSummary, candidate: SchemeSummary): string[] {
  const comments: string[] = [];
  const currentPopularity = current.averageProfile.popularity;
  const candidatePopularity = candidate.averageProfile.popularity;
  if (currentPopularity !== null && candidatePopularity !== null) {
    if (candidatePopularity < currentPopularity - 0.3) comments.push("more favorite-side than current");
    else if (candidatePopularity > currentPopularity + 0.3) comments.push("slightly more longshot-side than current");
  }

  const currentPlaceProb = current.averageProfile.placeProb;
  const candidatePlaceProb = candidate.averageProfile.placeProb;
  if (currentPlaceProb !== null && candidatePlaceProb !== null) {
    if (candidatePlaceProb > currentPlaceProb + 0.01) comments.push("slightly stronger placeProb base");
    else if (candidatePlaceProb < currentPlaceProb - 0.01) comments.push("thinner placeProb base");
  }

  const currentStability = current.averageProfile.top3Stability;
  const candidateStability = candidate.averageProfile.top3Stability;
  if (currentStability !== null && candidateStability !== null) {
    if (candidateStability > currentStability + 0.01) comments.push("more top3Stability-oriented");
    else if (candidateStability < currentStability - 0.01) comments.push("lower stability than current");
  }

  if (candidate.overlapAvoidedCount >= 8) comments.push("often collides with honmei profile");
  else if (candidate.overlapAvoidedCount <= 3) comments.push("keeps clearer separation from honmei");

  if (candidate.wideHitRate !== null && current.wideHitRate !== null) {
    if (candidate.wideHitRate > current.wideHitRate + 0.03) comments.push("looks more natural as a wide partner");
    else if (candidate.wideHitRate < current.wideHitRate - 0.03) comments.push("looks weaker as a wide partner");
  }

  return comments;
}

function buildMarkdown(output: JsonOutput): string {
  const current = output.schemes.find((scheme) => scheme.name === "current");
  const comparisonHeaders = [
    "Logic",
    "Place hit rate",
    "Place ROI",
    "Win hit rate",
    "Win ROI",
    "Honmei-opponent wide hit rate",
    "Honmei-opponent wide ROI",
    "Swap count vs current",
    "Overlap avoided count",
    "Avg popularity",
    "Avg odds",
    "Avg placeProb",
    "Avg top3Stability",
  ];

  const comparisonTable = [
    `| ${comparisonHeaders.join(" | ")} |`,
    `| ${comparisonHeaders.map(() => "---").join(" | ")} |`,
    ...output.schemes.map((scheme) => {
      const swap = scheme.name === "current" ? "-" : String(scheme.swapCountVsCurrent ?? "-");
      return `| ${scheme.label} | ${formatPct01(scheme.opponentPlaceRate)} | ${formatRoi(scheme.opponentPlaceRoi)} | ${formatPct01(scheme.opponentWinRate)} | ${formatRoi(scheme.opponentWinRoi)} | ${formatPct01(scheme.wideHitRate)} | ${formatRoi(scheme.wideRoi)} | ${swap} | ${scheme.overlapAvoidedCount} | ${formatNumber(scheme.averageProfile.popularity, 2)} | ${formatNumber(scheme.averageProfile.odds, 2)} | ${formatNumber(scheme.averageProfile.placeProb)} | ${formatNumber(scheme.averageProfile.top3Stability)} |`;
    }),
  ].join("\n");

  const profileTableHeaders = [
    "Logic",
    "Popularity median [Q1-Q3]",
    "Odds median [Q1-Q3]",
    "placeProb median [Q1-Q3]",
    "placeScore median [Q1-Q3]",
    "top3Stability median [Q1-Q3]",
    "simWinProb median [Q1-Q3]",
  ];

  const profileTable = [
    `| ${profileTableHeaders.join(" | ")} |`,
    `| ${profileTableHeaders.map(() => "---").join(" | ")} |`,
    ...output.schemes.map((scheme) => {
      const stats = scheme.profileStats;
      const summaryText = (key: string, digits = 3) =>
        `${formatNumber(stats[key].median, digits)} [${formatNumber(stats[key].q1, digits)}-${formatNumber(stats[key].q3, digits)}]`;
      return `| ${scheme.label} | ${summaryText("popularity", 2)} | ${summaryText("odds", 2)} | ${summaryText("placeProb")} | ${summaryText("placeScore")} | ${summaryText("top3Stability")} | ${summaryText("simWinProb")} |`;
    }),
  ].join("\n");

  const gapTableHeaders = [
    "Logic",
    "honmei-placeProb gap",
    "honmei-placeScore gap",
    "honmei-top3Stability gap",
    "honmei-simWinProb gap",
  ];

  const gapTable = [
    `| ${gapTableHeaders.join(" | ")} |`,
    `| ${gapTableHeaders.map(() => "---").join(" | ")} |`,
    ...output.schemes.map(
      (scheme) =>
        `| ${scheme.label} | ${formatNumber(scheme.honmeiGapAverages.placeProb)} | ${formatNumber(scheme.honmeiGapAverages.placeScore)} | ${formatNumber(scheme.honmeiGapAverages.top3Stability)} | ${formatNumber(scheme.honmeiGapAverages.simWinProb)} |`
    ),
  ].join("\n");

  const tendencyLines = output.schemes
    .filter((scheme) => scheme.name !== "current" && current)
    .map((scheme) => {
      const comments = currentSelectionSummary(current!, scheme);
      return `- ${scheme.label}: ${comments.length > 0 ? comments.join(" / ") : "difference vs current is small"}`;
    })
    .join("\n");

  const bestByPlaceRoi = [...output.schemes]
    .sort((left, right) => (right.opponentPlaceRoi ?? Number.NEGATIVE_INFINITY) - (left.opponentPlaceRoi ?? Number.NEGATIVE_INFINITY))[0];
  const bestByWideRoi = [...output.schemes]
    .sort((left, right) => (right.wideRoi ?? Number.NEGATIVE_INFINITY) - (left.wideRoi ?? Number.NEGATIVE_INFINITY))[0];

  return [
    "# Post-Feb Opponent Offline Comparison",
    "",
    `- generatedAt: ${output.meta.generatedAt}`,
    `- comparedRaceCount: ${output.meta.comparedRaceCount}`,
    `- dataSources: ${output.meta.dataSources.join(", ")}`,
    `- duplicateNameRaceIds: ${output.meta.duplicateNameRaceIds.join(", ") || "none"}`,
    "",
    "## Logic Definitions",
    "",
    ...output.schemes.map((scheme) => `- ${scheme.label}: ${scheme.description}`),
    "",
    "## Main Comparison",
    "",
    comparisonTable,
    "",
    "## Selection Profile",
    "",
    profileTable,
    "",
    "## Honmei Gap Profile",
    "",
    gapTable,
    "",
    "## Selection Tendencies",
    "",
    tendencyLines || "- no tendency summary",
    "",
    "## Notes",
    "",
    `- bestPlaceRoi: ${bestByPlaceRoi.label} (${formatRoi(bestByPlaceRoi.opponentPlaceRoi)})`,
    `- bestWideRoi: ${bestByWideRoi.label} (${formatRoi(bestByWideRoi.wideRoi)})`,
    "- overlapAvoidedCount counts races where the scheme's top horse was the honmei and the next horse had to be used as opponent.",
    "- duplicate horse-name rows existed in 4 races; this compare-only script canonicalized same-name rows within each race before selecting opponents.",
    "- No production logic, UI, or persisted selection format was changed.",
    "",
  ].join("\n");
}

async function main() {
  await fs.mkdir(ANALYSIS_DIR, { recursive: true });
  const tableRows = await readTableRows();
  const officialLookupByRace = await readOfficialRaceLookups();
  const byRace = getTableRowsByRace(tableRows);
  const raceIds = [...byRace.keys()].sort();

  const duplicateNameRaceIds: string[] = [];
  const resultsByScheme = new Map<SchemeName, RaceSelection[]>();
  resultsByScheme.set("current", []);
  for (const scheme of SCHEMES) resultsByScheme.set(scheme.name, []);

  for (const raceId of raceIds) {
    const raceRows = byRace.get(raceId) ?? [];
    const canonicalHorses = buildCanonicalHorses(raceRows);
    const officialLookup = officialLookupByRace.get(raceId);
    const nameCount = new Set(raceRows.map((row) => normalizeHorseName(row.horseName))).size;
    if (nameCount !== raceRows.length) duplicateNameRaceIds.push(raceId);

    const currentHonmeiRaw = raceRows.find((row) => row.candidateRole === "honmei");
    const currentOpponentRaw = raceRows.find((row) => row.candidateRole === "opponent");
    const honmei = getCanonicalByRawRow(canonicalHorses, currentHonmeiRaw);
    const currentOpponent = getCanonicalByRawRow(canonicalHorses, currentOpponentRaw);
    if (!honmei) continue;

    const officialPayouts = officialLookup?.race.result?.payouts;
    const hasOfficialPayouts = Boolean(
      officialPayouts?.tansho &&
        Array.isArray(officialPayouts.tansho.resultNumbers) &&
        officialPayouts?.fukusho &&
        Array.isArray(officialPayouts.fukusho.resultNumbers) &&
        officialPayouts?.wide &&
        Array.isArray(officialPayouts.wide.resultNumbers)
    );

    const buildRaceSelection = (
      opponent: CanonicalHorse | null,
      overlapAvoided: boolean,
      isCurrent: boolean
    ): RaceSelection => {
      const honmeiHorseNumber = resolveHorseNumber(honmei, officialLookup);
      const opponentHorseNumber = opponent ? resolveHorseNumber(opponent, officialLookup) : null;
      const tanPayout = payoutByHorseNumber(officialPayouts?.tansho, opponentHorseNumber);
      const fukuPayout = payoutByHorseNumber(officialPayouts?.fukusho, opponentHorseNumber);
      const widePayout =
        honmeiHorseNumber !== null && opponentHorseNumber !== null
          ? widePayoutByPair(officialPayouts?.wide, [honmeiHorseNumber, opponentHorseNumber])
          : null;

      return {
        raceId,
        raceDate: raceRows[0]?.raceDate ?? "",
        raceName: raceRows[0]?.raceName ?? "",
        honmei,
        opponent,
        overlapAvoided,
        officialCoverage: {
          opponentHorseNumber,
          honmeiHorseNumber,
          hasOfficialPayouts,
        },
        opponentResult: {
          isWin: tanPayout === null ? null : tanPayout > 0,
          isPlace: fukuPayout === null ? null : fukuPayout > 0,
          tanPayout,
          fukuPayout,
        },
        wideResult: {
          isHit: widePayout === null ? null : widePayout > 0,
          payout: widePayout,
        },
        swapFromCurrent: isCurrent ? false : Boolean(currentOpponent && opponent && currentOpponent.nameKey !== opponent.nameKey),
        gapsToHonmei: {
          placeProb:
            honmei.placeProb !== null && opponent && opponent.placeProb !== null ? round(honmei.placeProb - opponent.placeProb) : null,
          placeScore:
            honmei.placeScore !== null && opponent && opponent.placeScore !== null ? round(honmei.placeScore - opponent.placeScore) : null,
          top3Stability:
            honmei.top3Stability !== null && opponent && opponent.top3Stability !== null
              ? round(honmei.top3Stability - opponent.top3Stability)
              : null,
          simWinProb:
            honmei.simWinProb !== null && opponent && opponent.simWinProb !== null ? round(honmei.simWinProb - opponent.simWinProb) : null,
        },
      };
    };

    resultsByScheme.get("current")?.push(buildRaceSelection(currentOpponent, false, true));

    for (const scheme of SCHEMES) {
      const { selected, overlapAvoided } = scheme.select({
        horses: canonicalHorses,
        honmei,
      });
      resultsByScheme.get(scheme.name)?.push(buildRaceSelection(selected, overlapAvoided, false));
    }
  }

  const summaries: SchemeSummary[] = [
    summarizeScheme("current", "Current", "Current opponent recorded in post-feb-current-indicator-table.csv", resultsByScheme.get("current") ?? [], duplicateNameRaceIds.length),
    ...SCHEMES.map((scheme) =>
      summarizeScheme(scheme.name, scheme.label, scheme.description, resultsByScheme.get(scheme.name) ?? [], duplicateNameRaceIds.length)
    ),
  ];

  const output: JsonOutput = {
    meta: {
      generatedAt: new Date().toISOString(),
      comparedRaceCount: raceIds.length,
      dataSources: [
        "data/analysis/post-feb-current-indicator-table.csv",
        "data/analysis/post-feb-current-indicator-summary.json",
        "data/analysis/post-feb-hypothesis-checks.json",
        "data/weekly-races.json",
      ],
      duplicateNameRaceIds,
      notes: [
        "Honmei was fixed to the current selection from the retrospective table.",
        "Only opponent selection was changed offline for proposalA/proposalB/proposalC.",
        "Same-name duplicate rows inside a race were canonicalized before selecting opponents.",
      ],
    },
    schemes: summaries,
  };

  await fs.writeFile(OUTPUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await fs.writeFile(OUTPUT_MD_PATH, `${buildMarkdown(output)}\n`, "utf8");

  console.log(`Saved JSON: ${path.relative(ROOT, OUTPUT_JSON_PATH)}`);
  console.log(`Saved Markdown: ${path.relative(ROOT, OUTPUT_MD_PATH)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
