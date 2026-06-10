#!/usr/bin/env node
// 校正レポート: review-records.json の確定済み本命実績から
// winProb / placeProb のロジスティック再校正係数をフィットし、
// バケット校正表・分割検証・分類バックテストを md / json で出力する。
//
// Usage:
//   node scripts/calibration-report.mjs                       # レポート出力のみ
//   node scripts/calibration-report.mjs --write-coefficients  # lib/generatedCalibration.mjs を再生成
//   node scripts/calibration-report.mjs --vault               # vault 50_logs にもレポートを複製
//
// 方針: 係数の更新 (--write-coefficients) は手動操作。週次ルーチンには
// レポート出力のみを組み込み、ドリフトを確認してから係数を更新する。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyHonmeiPick } from "../lib/tanpukuSelection.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECORDS_PATH = path.join(ROOT, "data", "review-records.json");
const ANALYSIS_DIR = path.join(ROOT, "data", "analysis");
const GENERATED_PATH = path.join(ROOT, "lib", "generatedCalibration.mjs");
const VAULT_LOG_DIR = "C:/Users/kouyu/OneDrive/デスクトップ/markdowns/HorseRaceSim/50_logs";

const args = process.argv.slice(2);
const writeCoefficients = args.includes("--write-coefficients");
const copyToVault = args.includes("--vault");

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const pct = (v) => `${(v * 100).toFixed(1)}%`;

function loadSettledRecords() {
  const file = JSON.parse(fs.readFileSync(RECORDS_PATH, "utf8"));
  return Object.values(file.records ?? {})
    .filter(
      (x) =>
        x.reviewReady &&
        x.honmei &&
        x.honmei.settlementStatus === "settled" &&
        Number(x.honmei.realOdds) > 0
    )
    .sort((a, b) => String(a.meta?.raceDate ?? "").localeCompare(String(b.meta?.raceDate ?? "")));
}

// 2パラメータのロジスティック再校正 p_cal = sigmoid(a + b * logit(p_model))
function fitLogistic(data, iterations = 20000, lr = 0.05) {
  let a = 0;
  let b = 0.5;
  for (let it = 0; it < iterations; it++) {
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
  return { a: Number(a.toFixed(4)), b: Number(b.toFixed(4)) };
}

function logLoss(data, predict) {
  let sum = 0;
  for (const d of data) {
    const p = clamp(predict(d), 1e-6, 1 - 1e-6);
    sum += -(d.y * Math.log(p) + (1 - d.y) * Math.log(1 - p));
  }
  return Number((sum / data.length).toFixed(4));
}

function brier(data, predict) {
  let sum = 0;
  for (const d of data) sum += (predict(d) - d.y) ** 2;
  return Number((sum / data.length).toFixed(4));
}

function makeWinData(records) {
  return records.map((x) => ({
    x: logit(clamp(Number(x.honmei.winProb), 0.01, 0.99)),
    market: logit(clamp(1 / Number(x.honmei.realOdds), 0.01, 0.99)),
    y: x.honmei.tanOutcome === "hit" ? 1 : 0,
  }));
}

function makePlaceData(records) {
  return records.map((x) => ({
    x: logit(clamp(Number(x.honmei.placeProb), 0.01, 0.99)),
    y: x.honmei.fukuOutcome === "hit" ? 1 : 0,
  }));
}

function calibrationBuckets(records, kind, coef) {
  const buckets =
    kind === "win"
      ? [[0, 0.3], [0.3, 0.45], [0.45, 0.5], [0.5, 0.6], [0.6, 1.01]]
      : [[0, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 1.01]];
  const rows = [];
  for (const [lo, hi] of buckets) {
    const list = records.filter((x) => {
      const p = Number(kind === "win" ? x.honmei.winProb : x.honmei.placeProb);
      return p >= lo && p < hi;
    });
    if (!list.length) continue;
    const hits = list.filter((x) =>
      kind === "win" ? x.honmei.tanOutcome === "hit" : x.honmei.fukuOutcome === "hit"
    ).length;
    const avgRaw =
      list.reduce((s, x) => s + Number(kind === "win" ? x.honmei.winProb : x.honmei.placeProb), 0) /
      list.length;
    const avgCal =
      list.reduce(
        (s, x) =>
          s +
          sigmoid(
            coef.a +
              coef.b * logit(clamp(Number(kind === "win" ? x.honmei.winProb : x.honmei.placeProb), 0.01, 0.99))
          ),
        0
      ) / list.length;
    rows.push({
      band: `${lo}-${hi >= 1 ? "1.0" : hi}`,
      n: list.length,
      avgRaw: pct(avgRaw),
      avgCalibrated: pct(avgCal),
      actual: pct(hits / list.length),
    });
  }
  return rows;
}

function buildClassifierEntry(record, winCoef, placeCoef) {
  const h = record.honmei;
  const odds = Number(h.realOdds);
  const calWinProb = sigmoid(winCoef.a + winCoef.b * logit(clamp(Number(h.winProb), 0.01, 0.99)));
  const calPlaceProb = sigmoid(
    placeCoef.a + placeCoef.b * logit(clamp(Number(h.placeProb), 0.01, 0.99))
  );
  return {
    winProb: Number(h.winProb),
    placeProb: Number(h.placeProb),
    odds,
    calWinProb,
    calPlaceProb,
    calTanRoi: calWinProb * odds * 100,
    fieldSize: (record.snapshot?.rankedRows ?? []).length || null,
    overbetLabel: h.overbetLabel ?? null,
    top3Stability: Number(h.top3Stability ?? 0),
    tanRoi: Number(h.winProb) * odds * 100,
    scoreGap: Number(h.scoreGap ?? 0),
  };
}

function roiSummary(list) {
  const n = list.length;
  if (!n) return { n: 0 };
  return {
    n,
    tanHit: pct(list.filter((x) => x.honmei.tanOutcome === "hit").length / n),
    fukuHit: pct(list.filter((x) => x.honmei.fukuOutcome === "hit").length / n),
    tanRoi: `${(list.reduce((s, x) => s + (x.honmei.tanPayout || 0), 0) / n).toFixed(1)}%`,
    fukuRoi: `${(list.reduce((s, x) => s + (x.honmei.fukuPayout || 0), 0) / n).toFixed(1)}%`,
    wideRoi: `${(list.reduce((s, x) => s + (x.pair?.widePayout || 0), 0) / n).toFixed(1)}%`,
  };
}

function classificationBacktest(records, winCoef, placeCoef) {
  const groups = {};
  for (const record of records) {
    const entry = buildClassifierEntry(record, winCoef, placeCoef);
    const hint = classifyHonmeiPick(entry);
    (groups[hint.classification] ??= []).push(record);
  }
  return Object.fromEntries(Object.entries(groups).map(([k, l]) => [k, roiSummary(l)]));
}

function tableMd(rows, columns) {
  if (!rows.length) return "(データなし)\n";
  const header = `| ${columns.join(" | ")} |`;
  const sep = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${columns.map((c) => r[c] ?? "").join(" | ")} |`).join("\n");
  return `${header}\n${sep}\n${body}\n`;
}

function objectTableMd(obj) {
  const keys = Object.keys(obj);
  if (!keys.length) return "(データなし)\n";
  const cols = ["class", ...Object.keys(Object.values(obj)[0])];
  const rows = keys.map((k) => ({ class: k, ...obj[k] }));
  return tableMd(rows, cols);
}

// --- main ---

const records = loadSettledRecords();
if (records.length < 30) {
  console.error(`確定済みレコードが ${records.length} 件しかありません。30件以上で実行してください。`);
  process.exit(1);
}

const dateFrom = records[0].meta?.raceDate ?? "?";
const dateTo = records[records.length - 1].meta?.raceDate ?? "?";

const winData = makeWinData(records);
const placeData = makePlaceData(records);

const winCoef = fitLogistic(winData);
const placeCoef = fitLogistic(placeData);

const winMetrics = {
  rawModel: { logLoss: logLoss(winData, (d) => sigmoid(d.x)), brier: brier(winData, (d) => sigmoid(d.x)) },
  rawMarket: {
    logLoss: logLoss(winData, (d) => sigmoid(d.market)),
    brier: brier(winData, (d) => sigmoid(d.market)),
  },
  calibrated: {
    logLoss: logLoss(winData, (d) => sigmoid(winCoef.a + winCoef.b * d.x)),
    brier: brier(winData, (d) => sigmoid(winCoef.a + winCoef.b * d.x)),
  },
};
const placeMetrics = {
  rawModel: {
    logLoss: logLoss(placeData, (d) => sigmoid(d.x)),
    brier: brier(placeData, (d) => sigmoid(d.x)),
  },
  calibrated: {
    logLoss: logLoss(placeData, (d) => sigmoid(placeCoef.a + placeCoef.b * d.x)),
    brier: brier(placeData, (d) => sigmoid(placeCoef.a + placeCoef.b * d.x)),
  },
};

// 分割検証: 前半でフィットし後半で評価 (時系列順)
const half = Math.floor(records.length / 2);
const trainRecords = records.slice(0, half);
const testRecords = records.slice(half);
const trainWinCoef = fitLogistic(makeWinData(trainRecords));
const trainPlaceCoef = fitLogistic(makePlaceData(trainRecords));
const testWinData = makeWinData(testRecords);
const splitValidation = {
  train: { n: trainRecords.length, winCoef: trainWinCoef, placeCoef: trainPlaceCoef },
  testWinLogLoss: {
    rawModel: logLoss(testWinData, (d) => sigmoid(d.x)),
    rawMarket: logLoss(testWinData, (d) => sigmoid(d.market)),
    trainFitCalibrated: logLoss(testWinData, (d) => sigmoid(trainWinCoef.a + trainWinCoef.b * d.x)),
  },
  testClassification: classificationBacktest(testRecords, trainWinCoef, trainPlaceCoef),
};

const fullBacktest = classificationBacktest(records, winCoef, placeCoef);
const overall = roiSummary(records);

const generatedAt = new Date().toISOString();
const reportJson = {
  generatedAt,
  sampleSize: records.length,
  dateRange: { from: dateFrom, to: dateTo },
  winCalibration: { coef: winCoef, metrics: winMetrics },
  placeCalibration: { coef: placeCoef, metrics: placeMetrics },
  winBuckets: calibrationBuckets(records, "win", winCoef),
  placeBuckets: calibrationBuckets(records, "place", placeCoef),
  overall,
  classificationBacktest: fullBacktest,
  splitValidation,
};

const md = `# 校正レポート (tanpuku honmei)

- 生成日時: ${generatedAt}
- 対象: 確定済み本命 ${records.length} 件 (${dateFrom} 〜 ${dateTo})
- 再校正モデル: p_cal = sigmoid(a + b * logit(p_model)) を logLoss 最小化でフィット

## フィット結果

| 対象 | a | b | rawModel logLoss | rawMarket logLoss | calibrated logLoss |
| --- | --- | --- | --- | --- | --- |
| winProb | ${winCoef.a} | ${winCoef.b} | ${winMetrics.rawModel.logLoss} | ${winMetrics.rawMarket.logLoss} | ${winMetrics.calibrated.logLoss} |
| placeProb | ${placeCoef.a} | ${placeCoef.b} | ${placeMetrics.rawModel.logLoss} | - | ${placeMetrics.calibrated.logLoss} |

校正後の winProb が市場単体 (rawMarket) を上回る (logLoss が小さい) 限り、エンジンには市場超過のシグナルがある。

## winProb 校正バケット

${tableMd(reportJson.winBuckets, ["band", "n", "avgRaw", "avgCalibrated", "actual"])}
## placeProb 校正バケット

${tableMd(reportJson.placeBuckets, ["band", "n", "avgRaw", "avgCalibrated", "actual"])}
## 全体成績

| n | tanHit | fukuHit | tanRoi | fukuRoi | wideRoi |
| --- | --- | --- | --- | --- | --- |
| ${overall.n} | ${overall.tanHit} | ${overall.fukuHit} | ${overall.tanRoi} | ${overall.fukuRoi} | ${overall.wideRoi} |

## 分類バックテスト (現行 CLASSIFY ゲート / 全期間係数)

${objectTableMd(fullBacktest)}
## 分割検証 (前半 ${splitValidation.train.n} 件でフィット → 後半 ${testRecords.length} 件で評価)

- train係数 win: a=${trainWinCoef.a}, b=${trainWinCoef.b} / place: a=${trainPlaceCoef.a}, b=${trainPlaceCoef.b}
- 後半 winProb logLoss: rawModel ${splitValidation.testWinLogLoss.rawModel} / rawMarket ${splitValidation.testWinLogLoss.rawMarket} / 校正後 ${splitValidation.testWinLogLoss.trainFitCalibrated}

### 後半 out-of-sample 分類成績

${objectTableMd(splitValidation.testClassification)}
## 運用メモ

- skip ゲートは分割検証で再現性を確認済み。win ゲートは件数が少なく不安定なので、win 分類の confidence は控えめに扱う。
- 係数を更新する場合は \`node scripts/calibration-report.mjs --write-coefficients\` を実行し、
  このレポートの分割検証で劣化がないことを確認してからコミットする。
`;

fs.mkdirSync(ANALYSIS_DIR, { recursive: true });
fs.writeFileSync(path.join(ANALYSIS_DIR, "calibration-report.md"), md, "utf8");
fs.writeFileSync(
  path.join(ANALYSIS_DIR, "calibration-report.json"),
  JSON.stringify(reportJson, null, 2),
  "utf8"
);
console.log(`report -> data/analysis/calibration-report.md (n=${records.length})`);
console.log(`win coef: a=${winCoef.a} b=${winCoef.b} | place coef: a=${placeCoef.a} b=${placeCoef.b}`);
console.log("classification backtest:", JSON.stringify(fullBacktest, null, 1));

if (writeCoefficients) {
  const module = `// AUTO-GENERATED by scripts/calibration-report.mjs --write-coefficients
// 確定済み本命実績に対するロジスティック再校正係数。手編集しないこと。
// 再生成: node scripts/calibration-report.mjs --write-coefficients

export const CALIBRATION_VERSION = "cal-${generatedAt.slice(0, 10)}-n${records.length}";

export const CALIBRATION_META = Object.freeze({
  fittedAt: "${generatedAt}",
  sampleSize: ${records.length},
  dateRange: { from: "${dateFrom}", to: "${dateTo}" },
  method: "logistic recalibration p_cal = sigmoid(a + b * logit(p_model)), fit on settled honmei outcomes",
  winLogLoss: { rawModel: ${winMetrics.rawModel.logLoss}, rawMarket: ${winMetrics.rawMarket.logLoss}, calibrated: ${winMetrics.calibrated.logLoss} },
  placeLogLoss: { rawModel: ${placeMetrics.rawModel.logLoss}, calibrated: ${placeMetrics.calibrated.logLoss} },
});

export const WIN_CALIBRATION = Object.freeze({ a: ${winCoef.a}, b: ${winCoef.b} });
export const PLACE_CALIBRATION = Object.freeze({ a: ${placeCoef.a}, b: ${placeCoef.b} });

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function recalibrate(prob, coef) {
  const p = clamp(Number(prob), 0.01, 0.99);
  const z = coef.a + coef.b * Math.log(p / (1 - p));
  return 1 / (1 + Math.exp(-z));
}

export function calibrateWinProb(prob) {
  return recalibrate(prob, WIN_CALIBRATION);
}

export function calibratePlaceProb(prob) {
  return recalibrate(prob, PLACE_CALIBRATION);
}
`;
  fs.writeFileSync(GENERATED_PATH, module, "utf8");
  console.log("coefficients -> lib/generatedCalibration.mjs");
}

if (copyToVault) {
  try {
    const vaultPath = path.join(VAULT_LOG_DIR, `${generatedAt.slice(0, 10)}-calibration-report.md`);
    fs.writeFileSync(vaultPath, md, "utf8");
    console.log(`vault copy -> ${vaultPath}`);
  } catch (error) {
    console.warn(`vault への書き込みに失敗: ${error?.message ?? error}`);
  }
}
