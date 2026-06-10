// MC top3 検証: アーカイブ済みレースで runMonteCarlo を再実行し、
// 「MC top3 頻度」と「現行 placeProb 線形式」のどちらが実際の3着内を
// よく予測するかを比較する。placeProb 置換 (改善案4) の判断材料。
//
// Usage:
//   npx tsx scripts/validate-mc-top3.ts [--limit N] [--iterations N]
//
// 注意: 再実行 MC は当時の snapshot とは乱数・馬データ編集の差で一致しない。
// あくまで「同条件で再計算した場合の判別力比較」として読む。

import fs from "node:fs";
import path from "node:path";
import { runMonteCarlo } from "../lib/simulation";
import type { Course, Horse, RaceCondition } from "../lib/types";

const ROOT = process.cwd();
const WEEKLY_PATH = path.join(ROOT, "data", "weekly-races.json");
const OUT_MD = path.join(ROOT, "data", "analysis", "mc-top3-validation.md");
const OUT_JSON = path.join(ROOT, "data", "analysis", "mc-top3-validation.json");

const args = process.argv.slice(2);
function argValue(name: string, fallback: number): number {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) {
    const value = Number(args[index + 1]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
}
const limit = argValue("--limit", Number.POSITIVE_INFINITY);
const iterations = argValue("--iterations", 500);

const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

type WeeklyRace = {
  courseId: string;
  raceId?: string;
  label?: string;
  surface?: "Turf" | "Dirt";
  distance?: number;
  straightLength?: number;
  horses: Array<Record<string, unknown>>;
  result?: { top3HorseIds?: string[] };
};

type Sample = { mcTop3: number; formulaPlace: number; y: number };

function loadRaces(): WeeklyRace[] {
  const file = JSON.parse(fs.readFileSync(WEEKLY_PATH, "utf8"));
  const races: WeeklyRace[] = [
    ...(file.archives ?? []).flatMap((a: { races?: WeeklyRace[] }) => a.races ?? []),
    ...(file.currentWeek?.races ?? []),
  ];
  return races.filter((race) => {
    const top3 = race.result?.top3HorseIds ?? [];
    const first = race.horses?.[0] as { speed?: unknown; realOdds?: unknown } | undefined;
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

function fitLogistic(data: { x: number; y: number }[]): { a: number; b: number } {
  let a = 0;
  let b = 0.5;
  const lr = 0.05;
  for (let it = 0; it < 8000; it += 1) {
    let ga = 0;
    let gb = 0;
    for (const d of data) {
      const p = sigmoid(a + b * d.x);
      const e = p - d.y;
      ga += e;
      gb += e * d.x;
    }
    a -= (lr * ga) / data.length;
    b -= (lr * gb) / data.length;
  }
  return { a, b };
}

function logLoss(data: { x: number; y: number }[], coef: { a: number; b: number } | null): number {
  let sum = 0;
  for (const d of data) {
    const p = clampNum(coef ? sigmoid(coef.a + coef.b * d.x) : sigmoid(d.x), 1e-6, 1 - 1e-6);
    sum += -(d.y * Math.log(p) + (1 - d.y) * Math.log(1 - p));
  }
  return sum / data.length;
}

function evaluate(samples: Sample[], key: "mcTop3" | "formulaPlace") {
  const data = samples.map((s) => ({ x: logit(clampNum(s[key], 0.01, 0.99)), y: s.y }));
  const half = Math.floor(data.length / 2);
  const train = data.slice(0, half);
  const test = data.slice(half);
  const fullCoef = fitLogistic(data);
  const trainCoef = fitLogistic(train);
  return {
    raw: Number(logLoss(data, null).toFixed(4)),
    recalibratedFull: Number(logLoss(data, fullCoef).toFixed(4)),
    outOfSample: Number(logLoss(test, trainCoef).toFixed(4)),
    coef: { a: Number(fullCoef.a.toFixed(4)), b: Number(fullCoef.b.toFixed(4)) },
  };
}

const races = loadRaces().slice(0, Number.isFinite(limit) ? limit : undefined);
console.log(`対象レース: ${races.length} / iterations: ${iterations}`);

const samples: Sample[] = [];
let processed = 0;
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
  for (const row of results) {
    const horse = horses.find((h) => String(h.id) === String(row.horseId));
    const odds = Number(horse?.realOdds ?? 0);
    if (!(odds > 0)) continue;
    samples.push({
      mcTop3: row.top3Count / 100,
      formulaPlace: formulaPlaceProb(row.winCount, odds),
      y: top3.has(String(row.horseId)) ? 1 : 0,
    });
  }
  processed += 1;
  if (processed % 25 === 0) console.log(`  ...${processed}/${races.length}`);
}

console.log(`サンプル (馬単位): ${samples.length}`);

const mcEval = evaluate(samples, "mcTop3");
const formulaEval = evaluate(samples, "formulaPlace");

// 市場のみベースライン: implied から単純に top3 確率を再構成はできないため、
// formulaPlace の implied 項単独 (odds から線形) を参考値とする。
const marketData = samples.map((s, i) => ({ s, i }));
void marketData;

const generatedAt = new Date().toISOString();
const summary = {
  generatedAt,
  raceCount: processed,
  sampleCount: samples.length,
  iterations,
  mcTop3: mcEval,
  formulaPlaceProb: formulaEval,
  verdict:
    mcEval.outOfSample < formulaEval.outOfSample
      ? "MC top3 頻度のほうが out-of-sample 判別力が高い"
      : "現行 placeProb 式のほうが out-of-sample 判別力が高い",
};

const md = `# MC top3 検証 (placeProb 置換判断)

- 生成日時: ${generatedAt}
- 対象: ${processed} レース / ${samples.length} 馬 (iterations=${iterations}, 再実行MC)

## logLoss 比較 (小さいほど良い)

| 予測子 | raw | 再校正後(全体) | out-of-sample(後半) |
| --- | --- | --- | --- |
| MC top3 頻度 | ${mcEval.raw} | ${mcEval.recalibratedFull} | ${mcEval.outOfSample} |
| 現行 placeProb 式 | ${formulaEval.raw} | ${formulaEval.recalibratedFull} | ${formulaEval.outOfSample} |

## 判定

${summary.verdict}

## 注意

- 再実行 MC は当時の snapshot と乱数・馬データの差があるため、本番予測時の成績そのものではない。
- placeProb 式は市場 implied を含むため「市場のエコー」が混ざる。MC top3 は市場から独立した情報。
- 置換ではなくブレンド (placeProb と MC top3 の logit 結合) が有望なら次フェーズで検証する。
`;

fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
fs.writeFileSync(OUT_MD, md, "utf8");
fs.writeFileSync(OUT_JSON, JSON.stringify({ summary }, null, 2), "utf8");
console.log(JSON.stringify(summary, null, 1));
console.log(`-> ${path.relative(ROOT, OUT_MD)}`);
