import fs from "node:fs/promises";
import path from "node:path";

type MetricName =
  | "placeProb"
  | "placeScore"
  | "top3Stability"
  | "scoreGap"
  | "selectionScoreGap"
  | "simWinProb"
  | "placeRank"
  | "valueScore"
  | "placeReturnEdge"
  | "popularity"
  | "odds"
  | "edge";

type Row = {
  raceId: string;
  raceDate: string;
  raceName: string;
  horseId: string;
  horseName: string;
  finishGroup: "1" | "2-3" | "4+" | "missing";
  isWinner: boolean;
  isTop3: boolean;
  candidateRole: "honmei" | "opponent" | "wide" | "none";
  popularity: number | null;
  odds: number | null;
  simWinProb: number | null;
  edge: number | null;
  placeProb: number | null;
  placeScore: number | null;
  valueScore: number | null;
  top3Stability: number | null;
  placeReturnEdge: number | null;
  scoreGap: number | null;
  selectionScoreGap: number | null;
  placeRank: number | null;
};

type Stats = {
  count: number;
  mean: number | null;
  median: number | null;
  q1: number | null;
  q3: number | null;
  min: number | null;
  max: number | null;
  stddev: number | null;
};

type Separation = {
  metric: MetricName;
  successLabel: string;
  baselineLabel: string;
  successCount: number;
  baselineCount: number;
  successStats: Stats;
  baselineStats: Stats;
  direction: "success_higher" | "success_lower" | "flat";
  medianDiff: number | null;
  q1Diff: number | null;
  q3Diff: number | null;
  iqrOverlapRatio: number | null;
  cliffsDelta: number | null;
  commonLanguageEffect: number | null;
  normalizedMedianGap: number | null;
  separationScore: number | null;
  overlapComment: string;
};

const ROOT = process.cwd();
const ANALYSIS_DIR = path.join(ROOT, "data", "analysis");
const DATASET_PATH = path.join(ANALYSIS_DIR, "post-feb-current-indicator-table.csv");
const BASE_SUMMARY_PATH = path.join(ANALYSIS_DIR, "post-feb-current-indicator-summary.json");
const OUTPUT_JSON_PATH = path.join(ANALYSIS_DIR, "post-feb-hypothesis-checks.json");
const OUTPUT_MD_PATH = path.join(ANALYSIS_DIR, "post-feb-hypothesis-checks.md");

const OPPONENT_METRICS: MetricName[] = [
  "placeProb",
  "placeScore",
  "top3Stability",
  "scoreGap",
  "simWinProb",
  "placeRank",
  "valueScore",
  "placeReturnEdge",
];

const WIDE_METRICS: MetricName[] = [
  "valueScore",
  "placeReturnEdge",
  "placeProb",
  "placeScore",
  "top3Stability",
  "simWinProb",
  "popularity",
  "odds",
  "scoreGap",
];

const HONMEI_METRICS: MetricName[] = [
  "simWinProb",
  "edge",
  "placeProb",
  "placeScore",
  "top3Stability",
  "scoreGap",
  "popularity",
  "odds",
];

const LOWER_IS_BETTER = new Set<MetricName>(["scoreGap", "selectionScoreGap", "placeRank", "popularity", "odds"]);

function toNumber(value: string): number | null {
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: string): boolean {
  return value === "true";
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
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function stddev(values: number[], meanValue: number | null): number | null {
  if (values.length === 0 || meanValue === null) return null;
  const variance = values.reduce((sum, value) => sum + (value - meanValue) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function summarize(values: number[]): Stats {
  const sorted = [...values].sort((left, right) => left - right);
  const meanValue = mean(sorted);
  return {
    count: sorted.length,
    mean: round(meanValue),
    median: round(quantile(sorted, 0.5)),
    q1: round(quantile(sorted, 0.25)),
    q3: round(quantile(sorted, 0.75)),
    min: round(sorted[0] ?? null),
    max: round(sorted[sorted.length - 1] ?? null),
    stddev: round(stddev(sorted, meanValue)),
  };
}

function iqrWidth(stats: Stats): number | null {
  return stats.q1 !== null && stats.q3 !== null ? stats.q3 - stats.q1 : null;
}

function iqrOverlapRatio(successStats: Stats, baselineStats: Stats): number | null {
  if (
    successStats.q1 === null ||
    successStats.q3 === null ||
    baselineStats.q1 === null ||
    baselineStats.q3 === null
  ) {
    return null;
  }

  const overlapStart = Math.max(successStats.q1, baselineStats.q1);
  const overlapEnd = Math.min(successStats.q3, baselineStats.q3);
  const overlap = Math.max(0, overlapEnd - overlapStart);
  const base = Math.max(successStats.q3 - successStats.q1, baselineStats.q3 - baselineStats.q1, 1e-9);
  return round(overlap / base);
}

function cliffsDelta(successValues: number[], baselineValues: number[]): number | null {
  if (successValues.length === 0 || baselineValues.length === 0) return null;
  let greater = 0;
  let lower = 0;
  for (const successValue of successValues) {
    for (const baselineValue of baselineValues) {
      if (successValue > baselineValue) greater += 1;
      if (successValue < baselineValue) lower += 1;
    }
  }
  return round((greater - lower) / (successValues.length * baselineValues.length));
}

function overlapComment(overlap: number | null, delta: number | null): string {
  const overlapValue = overlap ?? 1;
  const deltaValue = Math.abs(delta ?? 0);
  if (overlapValue <= 0.2 && deltaValue >= 0.33) return "かなり分かれる";
  if (overlapValue <= 0.45 && deltaValue >= 0.2) return "やや分かれる";
  if (overlapValue <= 0.7 && deltaValue >= 0.1) return "少し差はあるが重なりも大きい";
  return "分布の重なりが大きい";
}

function formatNumber(value: number | null, kind: "pct01" | "plain" | "signed" = "plain"): string {
  if (value === null || !Number.isFinite(value)) return "-";
  if (kind === "pct01") return `${(value * 100).toFixed(1)}%`;
  if (kind === "signed") return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
  return value.toFixed(3);
}

function formatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}%`;
}

function createAsciiBox(stats: Stats, domainMin: number | null, domainMax: number | null, width = 28): string {
  if (
    stats.min === null ||
    stats.q1 === null ||
    stats.median === null ||
    stats.q3 === null ||
    stats.max === null ||
    domainMin === null ||
    domainMax === null
  ) {
    return "-";
  }
  const span = domainMax - domainMin || 1;
  const pos = (value: number) =>
    Math.max(0, Math.min(width - 1, Math.round(((value - domainMin) / span) * (width - 1))));
  const chars = new Array(width).fill(" ");
  const minPos = pos(stats.min);
  const q1Pos = pos(stats.q1);
  const medianPos = pos(stats.median);
  const q3Pos = pos(stats.q3);
  const maxPos = pos(stats.max);
  for (let index = minPos; index <= maxPos; index += 1) chars[index] = "-";
  for (let index = q1Pos; index <= q3Pos; index += 1) chars[index] = "=";
  chars[minPos] = "|";
  chars[maxPos] = "|";
  chars[q1Pos] = "[";
  chars[q3Pos] = "]";
  chars[medianPos] = "M";
  return chars.join("");
}

function parseCsvLine(line: string): string[] {
  const columns: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      columns.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  columns.push(current);
  return columns;
}

async function loadRows(): Promise<Row[]> {
  const raw = await fs.readFile(DATASET_PATH, "utf8");
  const lines = raw.trim().split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const index = Object.fromEntries(header.map((column, columnIndex) => [column, columnIndex]));

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const get = (column: string) => cells[index[column]] ?? "";
    return {
      raceId: get("raceId"),
      raceDate: get("raceDate"),
      raceName: get("raceName"),
      horseId: get("horseId"),
      horseName: get("horseName"),
      finishGroup: get("finishGroup") as Row["finishGroup"],
      isWinner: toBoolean(get("isWinner")),
      isTop3: toBoolean(get("isTop3")),
      candidateRole: get("candidateRole") as Row["candidateRole"],
      popularity: toNumber(get("popularity")),
      odds: toNumber(get("odds")),
      simWinProb: toNumber(get("simWinProb")),
      edge: toNumber(get("edge")),
      placeProb: toNumber(get("placeProb")),
      placeScore: toNumber(get("placeScore")),
      valueScore: toNumber(get("valueScore")),
      top3Stability: toNumber(get("top3Stability")),
      placeReturnEdge: toNumber(get("placeReturnEdge")),
      scoreGap: toNumber(get("scoreGap")),
      selectionScoreGap: toNumber(get("selectionScoreGap")),
      placeRank: toNumber(get("placeRank")),
    };
  });
}

async function loadBaseSummary() {
  const raw = await fs.readFile(BASE_SUMMARY_PATH, "utf8");
  return JSON.parse(raw);
}

function metricValues(rows: Row[], metric: MetricName): number[] {
  return rows
    .map((row) => row[metric])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function metricDomain(groups: Row[][], metric: MetricName) {
  const values = groups.flatMap((group) => metricValues(group, metric));
  if (values.length === 0) return { min: null, max: null };
  return { min: Math.min(...values), max: Math.max(...values) };
}

function buildSeparation(metric: MetricName, successRows: Row[], baselineRows: Row[], successLabel: string, baselineLabel: string): Separation {
  const successValues = metricValues(successRows, metric);
  const baselineValues = metricValues(baselineRows, metric);
  const successStats = summarize(successValues);
  const baselineStats = summarize(baselineValues);
  const rawMedianDiff =
    successStats.median !== null && baselineStats.median !== null ? successStats.median - baselineStats.median : null;
  const pooledIqr = [iqrWidth(successStats), iqrWidth(baselineStats)]
    .filter((value): value is number => value !== null)
    .reduce((sum, value, _, source) => sum + value / source.length, 0);
  const delta = cliffsDelta(successValues, baselineValues);
  const overlap = iqrOverlapRatio(successStats, baselineStats);
  const normalizedGap =
    rawMedianDiff !== null && pooledIqr > 0 ? Math.abs(rawMedianDiff) / pooledIqr : rawMedianDiff !== null ? Math.abs(rawMedianDiff) : null;
  const direction =
    rawMedianDiff === null || rawMedianDiff === 0 ? "flat" : rawMedianDiff > 0 ? "success_higher" : "success_lower";
  const separationScore =
    rawMedianDiff === 0 && Math.abs(delta ?? 0) < 0.05
      ? 0
      : delta !== null && overlap !== null
      ? round(Math.abs(delta) * 0.65 + (1 - overlap) * 0.35)
      : delta !== null
        ? round(Math.abs(delta))
        : overlap !== null
          ? round(1 - overlap)
          : null;

  return {
    metric,
    successLabel,
    baselineLabel,
    successCount: successValues.length,
    baselineCount: baselineValues.length,
    successStats,
    baselineStats,
    direction,
    medianDiff: round(rawMedianDiff),
    q1Diff:
      successStats.q1 !== null && baselineStats.q1 !== null ? round(successStats.q1 - baselineStats.q1) : null,
    q3Diff:
      successStats.q3 !== null && baselineStats.q3 !== null ? round(successStats.q3 - baselineStats.q3) : null,
    iqrOverlapRatio: overlap,
    cliffsDelta: delta,
    commonLanguageEffect: delta !== null ? round((delta + 1) / 2) : null,
    normalizedMedianGap: round(normalizedGap),
    separationScore,
    overlapComment: overlapComment(overlap, delta),
  };
}

function rankSeparations(metrics: MetricName[], successRows: Row[], baselineRows: Row[], successLabel: string, baselineLabel: string) {
  return metrics
    .map((metric) => buildSeparation(metric, successRows, baselineRows, successLabel, baselineLabel))
    .sort((left, right) => (right.separationScore ?? -Infinity) - (left.separationScore ?? -Infinity));
}

function chartBlock(title: string, metric: MetricName, groups: Array<{ label: string; rows: Row[] }>, kind: "pct01" | "plain" | "signed" = "plain") {
  const domain = metricDomain(groups.map((group) => group.rows), metric);
  const lines = [`### ${title}`, "", "| グループ | 件数 | 中央値 | Q1 | Q3 | min-max | box |", "| --- | ---: | ---: | ---: | ---: | ---: | --- |"];
  for (const group of groups) {
    const stats = summarize(metricValues(group.rows, metric));
    lines.push(
      `| ${group.label} | ${stats.count} | ${formatNumber(stats.median, kind)} | ${formatNumber(stats.q1, kind)} | ${formatNumber(stats.q3, kind)} | ${formatNumber(stats.min, kind)} - ${formatNumber(stats.max, kind)} | \`${createAsciiBox(stats, domain.min, domain.max)}\` |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

function renderRankingTable(title: string, separations: Separation[], kindMap: Partial<Record<MetricName, "pct01" | "plain" | "signed">>) {
  const lines = [
    `### ${title}`,
    "",
    "| 順位 | 指標 | 方向 | 中央値差 | Q1差 | Q3差 | IQR重なり | Cliff's delta | 分布所感 |",
    "| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
  ];
  separations.forEach((entry, index) => {
    const kind = kindMap[entry.metric] ?? "plain";
    lines.push(
      `| ${index + 1} | ${entry.metric} | ${entry.direction === "success_higher" ? "hit高" : entry.direction === "success_lower" ? "hit低" : "同水準"} | ${formatNumber(entry.medianDiff, kind === "pct01" ? "pct01" : "signed")} | ${formatNumber(entry.q1Diff, kind === "pct01" ? "pct01" : "signed")} | ${formatNumber(entry.q3Diff, kind === "pct01" ? "pct01" : "signed")} | ${entry.iqrOverlapRatio === null ? "-" : entry.iqrOverlapRatio.toFixed(3)} | ${entry.cliffsDelta === null ? "-" : entry.cliffsDelta.toFixed(3)} | ${entry.overlapComment} |`
    );
  });
  lines.push("");
  return lines.join("\n");
}

function renderNarrativeBullets(separations: Separation[], topN: number, bottomN: number) {
  const strongest = separations.slice(0, topN);
  const weakest = [...separations].sort((left, right) => (left.separationScore ?? Infinity) - (right.separationScore ?? Infinity)).slice(0, bottomN);
  return {
    strongest: strongest.map((entry) =>
      `- ${entry.metric}: 中央値差 ${formatNumber(entry.medianDiff, "signed")} / IQR重なり ${entry.iqrOverlapRatio === null ? "-" : entry.iqrOverlapRatio.toFixed(3)} / Cliff's delta ${entry.cliffsDelta === null ? "-" : entry.cliffsDelta.toFixed(3)}`
    ),
    weakest: weakest.map((entry) =>
      `- ${entry.metric}: 中央値差 ${formatNumber(entry.medianDiff, "signed")} / IQR重なり ${entry.iqrOverlapRatio === null ? "-" : entry.iqrOverlapRatio.toFixed(3)} / Cliff's delta ${entry.cliffsDelta === null ? "-" : entry.cliffsDelta.toFixed(3)}`
    ),
  };
}

async function main() {
  await fs.mkdir(ANALYSIS_DIR, { recursive: true });
  const [rows, baseSummary] = await Promise.all([loadRows(), loadBaseSummary()]);

  const eligibleRows = rows.filter((row) => row.finishGroup !== "missing");
  const opponentHit = eligibleRows.filter((row) => row.candidateRole === "opponent" && row.isTop3);
  const opponentMiss = eligibleRows.filter((row) => row.candidateRole === "opponent" && !row.isTop3);
  const wideHit = eligibleRows.filter((row) => row.candidateRole === "wide" && row.isTop3);
  const wideMiss = eligibleRows.filter((row) => row.candidateRole === "wide" && !row.isTop3);
  const honmeiWin = eligibleRows.filter((row) => row.candidateRole === "honmei" && row.finishGroup === "1");
  const honmeiPlace = eligibleRows.filter((row) => row.candidateRole === "honmei" && row.finishGroup === "2-3");
  const honmeiMiss = eligibleRows.filter((row) => row.candidateRole === "honmei" && row.finishGroup === "4+");
  const longshotDefinition = {
    rule: "popularity >= 6",
    rationale: "“人気薄” という言葉に最も直接対応し、レース間でオッズ水準の差を受けにくいため。",
  };
  const longshotHits = eligibleRows.filter((row) => row.isTop3 && row.popularity !== null && row.popularity >= 6);
  const oddsLongshotHits = eligibleRows.filter((row) => row.isTop3 && row.odds !== null && row.odds >= 20);

  const opponentSeparations = rankSeparations(OPPONENT_METRICS, opponentHit, opponentMiss, "相手hit", "相手miss");
  const wideSeparations = rankSeparations(WIDE_METRICS, longshotHits, wideMiss, "穴好走", "wide miss");
  const wideHitVsMiss = rankSeparations(WIDE_METRICS, wideHit, wideMiss, "wide hit", "wide miss");
  const honmeiWinVsPlace = rankSeparations(HONMEI_METRICS, honmeiWin, honmeiPlace, "本命1着", "本命2-3着");
  const honmeiMissVsTop3 = rankSeparations(HONMEI_METRICS, honmeiMiss, [...honmeiWin, ...honmeiPlace], "本命4着以下", "本命1-3着");

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      dataSources: [
        "data/analysis/post-feb-current-indicator-table.csv",
        "data/analysis/post-feb-current-indicator-summary.json",
      ],
      consistencyReference: baseSummary.meta,
      longshotDefinition,
      alternativeLongshotCountByOdds20: oddsLongshotHits.length,
    },
    counts: {
      eligibleHorseCount: eligibleRows.length,
      opponentHit: opponentHit.length,
      opponentMiss: opponentMiss.length,
      wideHit: wideHit.length,
      wideMiss: wideMiss.length,
      longshotHitsByPopularity6: longshotHits.length,
      honmeiWin: honmeiWin.length,
      honmeiPlace: honmeiPlace.length,
      honmeiMiss: honmeiMiss.length,
    },
    opponentAnalysis: {
      separations: opponentSeparations,
      strongest: renderNarrativeBullets(opponentSeparations, 4, 3).strongest,
      weakest: renderNarrativeBullets(opponentSeparations, 4, 3).weakest,
    },
    wideAnalysis: {
      longshotVsWideMiss: wideSeparations,
      wideHitVsWideMiss: wideHitVsMiss,
      strongest: renderNarrativeBullets(wideSeparations, 4, 3).strongest,
      weakest: renderNarrativeBullets(wideSeparations, 4, 3).weakest,
    },
    honmeiAnalysis: {
      winVsPlace: honmeiWinVsPlace,
      missVsTop3: honmeiMissVsTop3,
      strongestWinVsPlace: renderNarrativeBullets(honmeiWinVsPlace, 4, 3).strongest,
      weakestWinVsPlace: renderNarrativeBullets(honmeiWinVsPlace, 4, 3).weakest,
      strongestMissVsTop3: renderNarrativeBullets(honmeiMissVsTop3, 4, 3).strongest,
    },
  };

  await fs.writeFile(OUTPUT_JSON_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  const kindMap: Partial<Record<MetricName, "pct01" | "plain" | "signed">> = {
    placeProb: "pct01",
    simWinProb: "pct01",
    edge: "signed",
  };

  const report = [
    "# 追加仮説検証",
    "",
    "## changed files",
    "",
    "- scripts/analyze-post-feb-hypotheses.ts",
    "- data/analysis/post-feb-hypothesis-checks.json",
    "- data/analysis/post-feb-hypothesis-checks.md",
    "",
    "## 使ったデータソース",
    "",
    "- `data/analysis/post-feb-current-indicator-table.csv`",
    "- `data/analysis/post-feb-current-indicator-summary.json`",
    "- `data/analysis/post-feb-current-indicator-report.md`",
    "",
    "## 追加分析の対象定義",
    "",
    `- 相手候補: hit ${opponentHit.length}頭 / miss ${opponentMiss.length}頭`,
    `- ワイド高配当狙い: hit ${wideHit.length}頭 / miss ${wideMiss.length}頭`,
    `- 穴好走馬: ${longshotDefinition.rule} を採用し ${longshotHits.length}頭`,
    `- 採用理由: ${longshotDefinition.rationale}`,
    `- 参考: \`odds >= 20\` で見た穴好走馬は ${oddsLongshotHits.length}頭`,
    `- 本命候補: 1着 ${honmeiWin.length}頭 / 2-3着 ${honmeiPlace.length}頭 / 4着以下 ${honmeiMiss.length}頭`,
    "",
    renderRankingTable("相手候補 hit/miss 分離ランキング", opponentSeparations, kindMap),
    chartBlock("相手候補: placeProb / placeScore / top3Stability", "placeProb", [
      { label: "hit", rows: opponentHit },
      { label: "miss", rows: opponentMiss },
    ], "pct01"),
    chartBlock("相手候補: scoreGap / placeRank / valueScore", "scoreGap", [
      { label: "hit", rows: opponentHit },
      { label: "miss", rows: opponentMiss },
    ]),
    "## 相手候補の追加分析結果",
    "",
    "- 分けていそうな上位は、概ね `placeProb`、`placeScore`、`top3Stability`、`simWinProb` 側です。",
    "- `scoreGap` と `placeRank` は方向感はあるものの、IQR の重なりが残ります。",
    "- `valueScore` と `placeReturnEdge` は中央値差が小さく、hit/miss の分離は弱めです。",
    "- 件数は `18 vs 20` と小さめなので、順位は固定値ではなく暫定と見るべきです。",
    "",
    renderRankingTable("ワイド候補ではなく『穴好走馬 vs wide miss』分離ランキング", wideSeparations, kindMap),
    renderRankingTable("参考: wide hit vs wide miss 分離ランキング", wideHitVsMiss, kindMap),
    chartBlock("ワイド: placeProb", "placeProb", [
      { label: "穴好走", rows: longshotHits },
      { label: "wide hit", rows: wideHit },
      { label: "wide miss", rows: wideMiss },
    ], "pct01"),
    chartBlock("ワイド: valueScore", "valueScore", [
      { label: "穴好走", rows: longshotHits },
      { label: "wide hit", rows: wideHit },
      { label: "wide miss", rows: wideMiss },
    ]),
    chartBlock("ワイド: top3Stability", "top3Stability", [
      { label: "穴好走", rows: longshotHits },
      { label: "wide hit", rows: wideHit },
      { label: "wide miss", rows: wideMiss },
    ]),
    "## ワイド高配当狙いの追加分析結果",
    "",
    "- `穴好走 vs wide miss` では、`popularity` / `odds` / `scoreGap` / `placeProb` / `top3Stability` がまだ差を持ちます。",
    "- 一方で `wide hit vs wide miss` では、`valueScore`、`placeReturnEdge`、`placeProb` の分布がかなり重なります。wide 候補内だけを見ると、現行 value 系だけでは刺さる/刺さらないが分かれません。",
    "- 穴好走馬の仮説的な最低土台は、`placeProb` と `top3Stability` が wide miss より少なくとも下がり切っていないことです。前回の wide 候補はここが揃っていても hit 率が低く、まだ候補内の粒度が粗いと見えます。",
    "- `valueScore` 単独が弱い根拠は、wide hit 中央値 `0.691` に対して wide miss `0.692`、`placeReturnEdge` も `0.933 vs 0.936` でほぼ同水準な点です。",
    "",
    renderRankingTable("本命1着 vs 本命2-3着 分離ランキング", honmeiWinVsPlace, kindMap),
    renderRankingTable("本命4着以下 vs 本命1-3着 危険シグナルランキング", honmeiMissVsTop3, kindMap),
    chartBlock("本命: simWinProb", "simWinProb", [
      { label: "1着", rows: honmeiWin },
      { label: "2-3着", rows: honmeiPlace },
      { label: "4着以下", rows: honmeiMiss },
    ], "pct01"),
    chartBlock("本命: edge", "edge", [
      { label: "1着", rows: honmeiWin },
      { label: "2-3着", rows: honmeiPlace },
      { label: "4着以下", rows: honmeiMiss },
    ], "signed"),
    chartBlock("本命: placeProb", "placeProb", [
      { label: "1着", rows: honmeiWin },
      { label: "2-3着", rows: honmeiPlace },
      { label: "4着以下", rows: honmeiMiss },
    ], "pct01"),
    "## 本命候補の勝ち切り分析結果",
    "",
    "- `1着 vs 2-3着` を最も分けているのは、現状では `odds`、`popularity`、`scoreGap`、`edge` よりも、むしろ差が出にくい指標が多いという結果です。勝ち切り群の件数が `11` と少なく、強い分離は出ていません。",
    "- `simWinProb` は 1着群が 2-3着群を明確に上回る形には出ず、少なくとも今回の範囲では『1着専用シグナル』としては弱めです。",
    "- `4着以下` の危険シグナルは、`simWinProb` 低下、`placeProb/placeScore/top3Stability` 低下、`人気/オッズ` の悪化が先で、`edge` は危険シグナルとして一方向に効いていません。",
    "- `edge` は今後も「勝ち切り条件」より「市場とのズレの性質を見る補助列」として扱う仮説が妥当です。",
    "",
    "## 今の時点で次の改修候補として有力な仮説",
    "",
    "- 相手候補は `valueScore` 軸より `placeProb/placeScore/top3Stability` 軸で見るほうが素直に見える。",
    "- ワイド高配当狙いは `valueScore` 単独でなく、最低限の `placeProb/top3Stability` を持った穴に寄せる必要がありそう。",
    "- 本命候補は『3着内軸』と『1着取り』で別役割の可能性があるが、今回データだけでは勝ち切り専用条件の分離はまだ弱い。",
    "",
    "## まだ断定すべきでない点",
    "",
    "- 本命1着群 `11頭`、wide hit `8頭` と件数が少ないので、順位は安定していない可能性があります。",
    "- 相手候補の hit/miss 差も IQR がかなり重なる指標が多く、すぐ閾値化できるほど綺麗ではありません。",
    "- 穴好走馬の定義は `popularity >= 6` を採用しましたが、`odds >= 20` 定義でも確認し直す余地はあります。",
    "",
    "## 検証方法・再現方法",
    "",
    "1. `npx tsx scripts/analyze-post-feb-retrospective.ts` で前回テーブルを再生成",
    "2. `npx tsx scripts/analyze-post-feb-hypotheses.ts` を実行",
    "3. `data/analysis/post-feb-hypothesis-checks.json` と `data/analysis/post-feb-hypothesis-checks.md` を確認",
    "",
  ].join("\n");

  await fs.writeFile(OUTPUT_MD_PATH, `${report}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        outputJsonPath: OUTPUT_JSON_PATH,
        outputMdPath: OUTPUT_MD_PATH,
        counts: output.counts,
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
