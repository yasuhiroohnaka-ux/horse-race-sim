// MC top3 検証: 「MC top3 頻度」と「現行 placeProb 線形式」のどちらが
// 実際の3着内をよく予測するかを比較する。
//
// Usage:
//   npx tsx scripts/validate-mc-top3.ts [--source archive] [--limit N] [--iterations N]
//   npx tsx scripts/validate-mc-top3.ts --source snapshots [--limit N]
//
// archive (既定) は過去レースで Monte Carlo を再実行する従来モード。
// snapshots は保存済みライブ予測の simTop3Rate を使い、Monte Carlo を再実行しない。

import fs from "node:fs";
import path from "node:path";
import { isPreferredPredictionSnapshot } from "../lib/sourceStatus";
import { runMonteCarlo } from "../lib/simulation";
import type {
  Course,
  Horse,
  PredictionSnapshot,
  PredictionSnapshotRow,
  RaceCondition,
  ReviewRecordStore,
} from "../lib/types";

const ROOT = process.cwd();
const WEEKLY_PATH = path.join(ROOT, "data", "weekly-races.json");
const SNAPSHOTS_PATH = path.join(ROOT, "data", "prediction-snapshots.jsonl");
const REVIEW_RECORDS_PATH = path.join(ROOT, "data", "review-records.json");
const OUT_MD = path.join(ROOT, "data", "analysis", "mc-top3-validation.md");
const OUT_JSON = path.join(ROOT, "data", "analysis", "mc-top3-validation.json");

type Source = "archive" | "snapshots";

const args = process.argv.slice(2);

function rawArgValue(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];

  const prefix = `${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function numericArgValue(name: string, fallback: number): number {
  const value = Number(rawArgValue(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const requestedSource = rawArgValue("--source") ?? "archive";
if (requestedSource !== "archive" && requestedSource !== "snapshots") {
  throw new Error(`--source must be archive or snapshots (received: ${requestedSource})`);
}
const source: Source = requestedSource;
const limit = numericArgValue("--limit", Number.POSITIVE_INFINITY);
const iterations = numericArgValue("--iterations", 500);

const clampNum = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
const logit = (probability: number) => Math.log(probability / (1 - probability));
const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));

type WeeklyRace = {
  courseId: string;
  raceId?: string;
  raceDate?: string;
  label?: string;
  surface?: "Turf" | "Dirt";
  distance?: number;
  straightLength?: number;
  horses: Array<Record<string, unknown>>;
  result?: { top3HorseIds?: string[] };
};

type Sample = { mcTop3: number; formulaPlace: number; y: number };

type LogisticRow = { x: number; y: number };

type BlendRow = {
  formulaX: number;
  mcX: number;
  y: number;
};

type RaceSamples = {
  raceId: string;
  raceDate: string | null;
  capturedAt: string | null;
  samples: Sample[];
};

type SnapshotLoadStats = {
  totalSnapshots: number;
  eligibleSnapshots: number;
  dedupedRaces: number;
  confirmedRaces: number;
};

const SNAPSHOT_TARGET_CONDITIONS = [
  "predictionOrigin === saved_live",
  "livePreRaceEligible === true",
  "rankedRows に有限の simTop3Rate が1件以上あり、有限値の行だけを馬サンプルに使用",
  "review-records の actualTop3HorseIds がちょうど3件",
  "raceId ごとに preferred/latest snapshot へ dedupe",
  "raceDate 昇順、次に capturedAt 昇順",
] as const;

const ARCHIVE_TARGET_CONDITIONS = [
  "weekly-races の actual top3 がちょうど3件",
  "出走馬6頭以上かつ先頭馬の speed が有限",
  "realOdds > 0 の馬を使用",
  "保存 snapshot ではなく現在の入力から Monte Carlo を再実行",
] as const;

function loadArchiveRaces(): WeeklyRace[] {
  const file = JSON.parse(fs.readFileSync(WEEKLY_PATH, "utf8"));
  const races: WeeklyRace[] = [
    ...(file.archives ?? []).flatMap((archive: { races?: WeeklyRace[] }) => archive.races ?? []),
    ...(file.currentWeek?.races ?? []),
  ];
  return races.filter((race) => {
    const top3 = race.result?.top3HorseIds ?? [];
    const first = race.horses?.[0] as { speed?: unknown } | undefined;
    return (
      top3.length === 3 &&
      Array.isArray(race.horses) &&
      race.horses.length >= 6 &&
      Number.isFinite(Number(first?.speed))
    );
  });
}

function buildCourse(race: WeeklyRace): Course {
  return {
    id: race.courseId,
    name: race.label ?? race.courseId,
    displayName: race.label ?? race.courseId,
    distance: Number(race.distance ?? 0),
    surface: race.surface ?? "Turf",
    segments: [],
    straightLength: Number(race.straightLength ?? 360),
    hashtag: `#${race.courseId}`,
  } as unknown as Course;
}

function buildCondition(courseId: string): RaceCondition {
  return {
    courseId,
    trackBias: { innerOuter: 0, frontBack: 0 },
    groundCondition: "Firm",
    weather: "Sunny",
    windDirection: "Crosswind",
    windSpeed: 3,
    paceScenario: "Average",
  } as RaceCondition;
}

// 現行 placeProb 線形式 (tanpukuSelection.mjs と同じ形)。
// score は scoreTanpukuHorse 相当の簡略版ではなく、市場 implied と
// winProb 近似のみで再現する (検証目的では placeProb 式の形が対象)。
function formulaPlaceProb(winProbPct: number, odds: number): number {
  const winProb = clampNum(winProbPct / 100, 0.03, 0.7);
  const implied = odds > 0 ? clampNum(1 / odds, 0.02, 0.7) : 0;
  return clampNum(winProb * 0.95 + implied * 0.35 + 0.15, 0.1, 0.88);
}

function hasFiniteSimTop3Rate(row: PredictionSnapshotRow): boolean {
  return typeof row.simTop3Rate === "number" && Number.isFinite(row.simTop3Rate);
}

function parseSnapshots(): PredictionSnapshot[] {
  return fs
    .readFileSync(SNAPSHOTS_PATH, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as PredictionSnapshot;
      } catch (error) {
        throw new Error(`Invalid JSON in ${path.relative(ROOT, SNAPSHOTS_PATH)}:${index + 1}`, { cause: error });
      }
    });
}

function compareSnapshotChronology(left: PredictionSnapshot, right: PredictionSnapshot): number {
  const dateOrder = String(left.raceDate ?? "").localeCompare(String(right.raceDate ?? ""));
  if (dateOrder !== 0) return dateOrder;

  const capturedOrder = String(left.capturedAt ?? "").localeCompare(String(right.capturedAt ?? ""));
  if (capturedOrder !== 0) return capturedOrder;
  return String(left.raceId).localeCompare(String(right.raceId));
}

function loadSnapshotRaceSamples(): { races: RaceSamples[]; stats: SnapshotLoadStats } {
  const snapshots = parseSnapshots();
  const reviewStore = JSON.parse(fs.readFileSync(REVIEW_RECORDS_PATH, "utf8")) as ReviewRecordStore;
  const eligible = snapshots.filter(
    (snapshot) =>
      snapshot.predictionOrigin === "saved_live" &&
      snapshot.livePreRaceEligible === true &&
      Array.isArray(snapshot.rankedRows) &&
      snapshot.rankedRows.some(hasFiniteSimTop3Rate)
  );

  const preferredByRaceId = new Map<string, PredictionSnapshot>();
  for (const snapshot of eligible) {
    const raceId = String(snapshot.raceId ?? "");
    if (!raceId) continue;
    const current = preferredByRaceId.get(raceId);
    if (isPreferredPredictionSnapshot(snapshot, current)) preferredByRaceId.set(raceId, snapshot);
  }

  const confirmedSnapshots = [...preferredByRaceId.values()]
    .filter((snapshot) => reviewStore.records?.[snapshot.raceId]?.actualTop3HorseIds?.length === 3)
    .sort(compareSnapshotChronology);

  const races = confirmedSnapshots.map((snapshot): RaceSamples => {
    const actualTop3 = new Set(reviewStore.records[snapshot.raceId].actualTop3HorseIds.map(String));
    const samples = snapshot.rankedRows.filter(hasFiniteSimTop3Rate).map((row) => ({
      mcTop3: row.simTop3Rate! / 100,
      formulaPlace: formulaPlaceProb(Number(row.winProb), Number(row.realOdds ?? 0)),
      y: actualTop3.has(String(row.horseId)) ? 1 : 0,
    }));
    return {
      raceId: snapshot.raceId,
      raceDate: snapshot.raceDate ?? null,
      capturedAt: snapshot.capturedAt ?? null,
      samples,
    };
  });

  return {
    races,
    stats: {
      totalSnapshots: snapshots.length,
      eligibleSnapshots: eligible.length,
      dedupedRaces: preferredByRaceId.size,
      confirmedRaces: races.length,
    },
  };
}

function buildArchiveRaceSamples(): RaceSamples[] {
  const races = loadArchiveRaces().slice(0, Number.isFinite(limit) ? limit : undefined);
  console.log(`対象レース: ${races.length} / source: archive / iterations: ${iterations}`);

  const processedRaces: RaceSamples[] = [];
  for (const race of races) {
    const course = buildCourse(race);
    const condition = buildCondition(race.courseId);
    const horses = race.horses as unknown as Horse[];
    const top3 = new Set((race.result?.top3HorseIds ?? []).map(String));
    let results: ReturnType<typeof runMonteCarlo>;
    try {
      results = runMonteCarlo(horses, course, condition, iterations);
    } catch (error) {
      console.warn(`skip ${race.courseId}: ${(error as Error)?.message}`);
      continue;
    }

    const samples: Sample[] = [];
    for (const row of results) {
      const horse = horses.find((candidate) => String(candidate.id) === String(row.horseId));
      const odds = Number(horse?.realOdds ?? 0);
      if (!(odds > 0)) continue;
      samples.push({
        mcTop3: row.top3Count / 100,
        formulaPlace: formulaPlaceProb(row.winCount, odds),
        y: top3.has(String(row.horseId)) ? 1 : 0,
      });
    }
    processedRaces.push({
      raceId: String(race.raceId ?? race.courseId),
      raceDate: race.raceDate ?? null,
      capturedAt: null,
      samples,
    });
    if (processedRaces.length % 25 === 0) console.log(`  ...${processedRaces.length}/${races.length}`);
  }
  return processedRaces;
}

function fitLogistic(data: LogisticRow[]): { a: number; b: number } {
  let a = 0;
  let b = 0.5;
  const lr = 0.05;
  for (let iteration = 0; iteration < 8000; iteration += 1) {
    let gradientA = 0;
    let gradientB = 0;
    for (const row of data) {
      const probability = sigmoid(a + b * row.x);
      const error = probability - row.y;
      gradientA += error;
      gradientB += error * row.x;
    }
    a -= (lr * gradientA) / data.length;
    b -= (lr * gradientB) / data.length;
  }
  return { a, b };
}

function logLoss(data: LogisticRow[], coefficients: { a: number; b: number } | null): number {
  let sum = 0;
  for (const row of data) {
    const probability = clampNum(
      coefficients ? sigmoid(coefficients.a + coefficients.b * row.x) : sigmoid(row.x),
      1e-6,
      1 - 1e-6
    );
    sum += -(row.y * Math.log(probability) + (1 - row.y) * Math.log(1 - probability));
  }
  return sum / data.length;
}

function fitBlendLogistic(data: BlendRow[]): { w0: number; w1: number; w2: number } {
  let w0 = 0;
  let w1 = 0.5;
  let w2 = 0.5;
  const lr = 0.05;
  for (let iteration = 0; iteration < 8000; iteration += 1) {
    let gradient0 = 0;
    let gradient1 = 0;
    let gradient2 = 0;
    for (const row of data) {
      const probability = sigmoid(w0 + w1 * row.formulaX + w2 * row.mcX);
      const error = probability - row.y;
      gradient0 += error;
      gradient1 += error * row.formulaX;
      gradient2 += error * row.mcX;
    }
    w0 -= (lr * gradient0) / data.length;
    w1 -= (lr * gradient1) / data.length;
    w2 -= (lr * gradient2) / data.length;
  }
  return { w0, w1, w2 };
}

function blendLogLoss(data: BlendRow[], coefficients: { w0: number; w1: number; w2: number }): number {
  let sum = 0;
  for (const row of data) {
    const probability = clampNum(
      sigmoid(coefficients.w0 + coefficients.w1 * row.formulaX + coefficients.w2 * row.mcX),
      1e-6,
      1 - 1e-6
    );
    sum += -(row.y * Math.log(probability) + (1 - row.y) * Math.log(1 - probability));
  }
  return sum / data.length;
}

function evaluate(races: RaceSamples[], key: "mcTop3" | "formulaPlace") {
  const splitRaceIndex = Math.floor(races.length / 2);
  const toData = (raceSlice: RaceSamples[]) =>
    raceSlice.flatMap((race) =>
      race.samples.map((sample) => ({ x: logit(clampNum(sample[key], 0.01, 0.99)), y: sample.y }))
    );
  const data = toData(races);
  const train = toData(races.slice(0, splitRaceIndex));
  const test = toData(races.slice(splitRaceIndex));
  const fullCoefficients = fitLogistic(data);
  const trainCoefficients = fitLogistic(train);
  const outOfSample = logLoss(test, trainCoefficients);
  return {
    metrics: {
      raw: Number(logLoss(data, null).toFixed(4)),
      recalibratedFull: Number(logLoss(data, fullCoefficients).toFixed(4)),
      outOfSample: Number(outOfSample.toFixed(4)),
      coef: {
        a: Number(fullCoefficients.a.toFixed(4)),
        b: Number(fullCoefficients.b.toFixed(4)),
      },
    },
    outOfSample,
  };
}

function evaluateBlend(races: RaceSamples[]) {
  const splitRaceIndex = Math.floor(races.length / 2);
  const toData = (raceSlice: RaceSamples[]): BlendRow[] =>
    raceSlice.flatMap((race) =>
      race.samples.map((sample) => ({
        formulaX: logit(clampNum(sample.formulaPlace, 0.01, 0.99)),
        mcX: logit(clampNum(sample.mcTop3, 0.01, 0.99)),
        y: sample.y,
      }))
    );
  const train = toData(races.slice(0, splitRaceIndex));
  const test = toData(races.slice(splitRaceIndex));
  const coefficients = fitBlendLogistic(train);
  return { coefficients, outOfSample: blendLogLoss(test, coefficients) };
}

function boundaryLabel(race: RaceSamples | undefined) {
  if (!race) return null;
  return { raceId: race.raceId, raceDate: race.raceDate, capturedAt: race.capturedAt };
}

const snapshotResult = source === "snapshots" ? loadSnapshotRaceSamples() : null;
const allRaceSamples = snapshotResult?.races ?? buildArchiveRaceSamples();
const raceSamples = allRaceSamples.slice(0, Number.isFinite(limit) ? limit : undefined);
if (source === "snapshots") {
  console.log(`対象レース: ${raceSamples.length} / source: snapshots / Monte Carlo再実行なし`);
}

const samples = raceSamples.flatMap((race) => race.samples);
console.log(`サンプル (馬単位): ${samples.length}`);

if (raceSamples.length < 2 || samples.length === 0) {
  throw new Error("At least two races with usable horse samples are required for chronological OOS evaluation");
}

const splitRaceIndex = Math.floor(raceSamples.length / 2);
const trainRaces = raceSamples.slice(0, splitRaceIndex);
const testRaces = raceSamples.slice(splitRaceIndex);
const mcEvaluation = evaluate(raceSamples, "mcTop3");
const formulaEvaluation = evaluate(raceSamples, "formulaPlace");
const blendEvaluation = evaluateBlend(raceSamples);
const mcEval = mcEvaluation.metrics;
const formulaEval = formulaEvaluation.metrics;
const blendImprovement = formulaEvaluation.outOfSample - blendEvaluation.outOfSample;
const blendAdoptionThreshold = 0.005;
const blendVerdict = blendImprovement >= blendAdoptionThreshold ? "shadow採用" : "見送り";

const generatedAt = new Date().toISOString();
const sourceFiles =
  source === "snapshots"
    ? [path.relative(ROOT, SNAPSHOTS_PATH), path.relative(ROOT, REVIEW_RECORDS_PATH)]
    : [path.relative(ROOT, WEEKLY_PATH)];
const targetConditions = source === "snapshots" ? SNAPSHOT_TARGET_CONDITIONS : ARCHIVE_TARGET_CONDITIONS;
const oosSplit = {
  strategy: "時系列前半で再校正し、後半を評価（分割点はレース境界のみ）",
  trainRaceCount: trainRaces.length,
  trainSampleCount: trainRaces.reduce((sum, race) => sum + race.samples.length, 0),
  testRaceCount: testRaces.length,
  testSampleCount: testRaces.reduce((sum, race) => sum + race.samples.length, 0),
  trainEnd: boundaryLabel(trainRaces.at(-1)),
  testStart: boundaryLabel(testRaces[0]),
};
const summary = {
  generatedAt,
  source,
  sourceFiles,
  targetConditions,
  monteCarloExecution: source === "snapshots" ? "saved simTop3Rate (runMonteCarlo not called)" : "rerun",
  raceCount: raceSamples.length,
  sampleCount: samples.length,
  iterations: source === "archive" ? iterations : null,
  ...(snapshotResult ? { snapshotLoadStats: snapshotResult.stats } : {}),
  oosSplit,
  mcTop3: mcEval,
  formulaPlaceProb: formulaEval,
  blendedPlaceProb: {
    formula: "sigmoid(w0 + w1*logit(formulaPlace) + w2*logit(mcTop3))",
    trainCoefficients: {
      w0: Number(blendEvaluation.coefficients.w0.toFixed(4)),
      w1: Number(blendEvaluation.coefficients.w1.toFixed(4)),
      w2: Number(blendEvaluation.coefficients.w2.toFixed(4)),
    },
    outOfSample: Number(blendEvaluation.outOfSample.toFixed(4)),
    improvementVsFormula: Number(blendImprovement.toFixed(4)),
    adoptionCriterion: "improvementVsFormula >= 0.005",
    adoptionThreshold: blendAdoptionThreshold,
    verdict: blendVerdict,
  },
  verdict:
    mcEval.outOfSample < formulaEval.outOfSample
      ? "MC top3 頻度のほうが out-of-sample 判別力が高い"
      : "現行 placeProb 式のほうが out-of-sample 判別力が高い",
};

const targetConditionLines = targetConditions.map((condition) => `  - ${condition}`).join("\n");
const sourceDescription =
  source === "snapshots"
    ? "保存済みライブ snapshot の simTop3Rate（runMonteCarlo 再実行なし）"
    : `weekly-races から再実行MC（iterations=${iterations}）`;
const sourceSpecificNotes =
  source === "snapshots"
    ? `- MC top3 は予測時に保存された \`simTop3Rate / 100\`。現在の馬データや乱数による再計算はしていない。
- 実3着内は \`review-records.json\` の \`actualTop3HorseIds\` と照合した。`
    : `- 再実行 MC は当時の snapshot と乱数・馬データの差があるため、本番予測時の成績そのものではない。`;
const md = `# MC top3 検証 (placeProb 置換判断)

- 生成日時: ${generatedAt}
- source: ${source}
- 入力: ${sourceFiles.join(", ")}
- 対象: ${raceSamples.length} レース / ${samples.length} 馬
- MC: ${sourceDescription}
- 対象条件:
${targetConditionLines}

## logLoss 比較 (小さいほど良い)

| 予測子 | raw | 再校正後(全体) | out-of-sample(時系列後半) |
| --- | --- | --- | --- |
| MC top3 頻度 | ${mcEval.raw} | ${mcEval.recalibratedFull} | ${mcEval.outOfSample} |
| 現行 placeProb 式 | ${formulaEval.raw} | ${formulaEval.recalibratedFull} | ${formulaEval.outOfSample} |

## placeProb ブレンド shadow 判定

- 式: \`sigmoid(w0 + w1*logit(formulaPlace) + w2*logit(mcTop3))\`
- train 係数: w0=${summary.blendedPlaceProb.trainCoefficients.w0}, w1=${summary.blendedPlaceProb.trainCoefficients.w1}, w2=${summary.blendedPlaceProb.trainCoefficients.w2}
- test OOS logLoss: ${summary.blendedPlaceProb.outOfSample}
- formula 単独比 improvement: ${summary.blendedPlaceProb.improvementVsFormula}（formula OOS − blend OOS）
- 採用基準: improvement >= ${summary.blendedPlaceProb.adoptionThreshold}
- 判定: **${summary.blendedPlaceProb.verdict}**

## OOS 分割

- 方針: ${oosSplit.strategy}
- 学習: ${oosSplit.trainRaceCount} レース / ${oosSplit.trainSampleCount} 馬（末尾: ${JSON.stringify(oosSplit.trainEnd)}）
- 評価: ${oosSplit.testRaceCount} レース / ${oosSplit.testSampleCount} 馬（先頭: ${JSON.stringify(oosSplit.testStart)}）

## 判定

${summary.verdict}

## 注意

${sourceSpecificNotes}
- placeProb 式は市場 implied を含むため「市場のエコー」が混ざる。MC top3 は市場から独立した情報。
- 置換ではなくブレンド (placeProb と MC top3 の logit 結合) が有望なら次フェーズで検証する。
`;

fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
fs.writeFileSync(OUT_MD, md, "utf8");
fs.writeFileSync(OUT_JSON, JSON.stringify({ summary }, null, 2), "utf8");
console.log(JSON.stringify(summary, null, 1));
console.log(`-> ${path.relative(ROOT, OUT_MD)}`);
