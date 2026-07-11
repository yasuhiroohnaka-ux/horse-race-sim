#!/usr/bin/env node
// 校正レポート: review-records.json の確定済み本命実績から
// winProb / placeProb のロジスティック再校正係数をフィットし、
// バケット校正表・分割検証・分類バックテストを md / json で出力する。
//
// Usage:
//   node scripts/calibration-report.mjs                       # レポート出力のみ
//   node scripts/calibration-report.mjs --write-coefficients  # lib/generatedCalibration.mjs を再生成
//   node scripts/calibration-report.mjs --write-coefficients --force-write-coefficients
//                                                            # 更新ゲートを明示的に上書き
//   node scripts/calibration-report.mjs --vault               # vault 50_logs にもレポートを複製
//
// 方針: 係数の更新 (--write-coefficients) は手動操作。週次ルーチンには
// レポート出力のみを組み込み、ドリフトを確認してから係数を更新する。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CALIBRATION_META,
  PLACE_CALIBRATION,
  WIN_CALIBRATION,
} from "../lib/generatedCalibration.mjs";
import { classifyHonmeiPick } from "../lib/tanpukuSelection.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECORDS_PATH = path.join(ROOT, "data", "review-records.json");
const ANALYSIS_DIR = path.join(ROOT, "data", "analysis");
const GENERATED_PATH = path.join(ROOT, "lib", "generatedCalibration.mjs");
const VAULT_LOG_DIR = "C:/Users/kouyu/OneDrive/デスクトップ/markdowns/HorseRaceSim/50_logs";

const args = process.argv.slice(2);
const writeCoefficients = args.includes("--write-coefficients");
const forceWriteCoefficients = args.includes("--force-write-coefficients");
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

// 複勝オッズの線形近似 placeOdds ≈ odds * slope + intercept を
// 確定済み複勝的中の実払戻 (fukuPayout/100) に OLS でフィットする。
// 注意: 的中サンプルのみで観測されるため軽い選択バイアスを含む。
// 旧近似 odds*0.35+1.0 は実払戻比 1.4-1.6 倍過大だった (2026-06-11 検証)。
function fitPlaceOddsModel(records) {
  const hits = records.filter((x) => x.honmei.fukuOutcome === "hit" && x.honmei.fukuPayout > 0);
  if (hits.length < 30) return null;
  const xs = hits.map((x) => Number(x.honmei.realOdds));
  const ys = hits.map((x) => x.honmei.fukuPayout / 100);
  const n = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0);
  const sxy = xs.reduce((a, v, i) => a + v * ys[i], 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  return { slope: Number(slope.toFixed(4)), intercept: Number(intercept.toFixed(4)), sampleSize: n };
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

function safeLogLoss(data, predict) {
  return data.length > 0 ? logLoss(data, predict) : null;
}

function dateRangeFor(records) {
  if (records.length === 0) return { from: null, to: null };
  return {
    from: records[0].meta?.raceDate ?? null,
    to: records[records.length - 1].meta?.raceDate ?? null,
  };
}

function isLivePreRaceRecord(record) {
  return (
    record.livePreRaceEligible === true &&
    record.snapshot?.livePreRaceEligible === true &&
    record.snapshot?.predictionOrigin === "saved_live"
  );
}

function evaluationMetrics(records, winCoef, placeCoef) {
  const winData = makeWinData(records);
  const placeData = makePlaceData(records);
  return {
    n: records.length,
    dateRange: dateRangeFor(records),
    win: {
      rawModel: safeLogLoss(winData, (d) => sigmoid(d.x)),
      rawMarket: safeLogLoss(winData, (d) => sigmoid(d.market)),
      calibrated: safeLogLoss(winData, (d) => sigmoid(winCoef.a + winCoef.b * d.x)),
    },
    place: {
      rawModel: safeLogLoss(placeData, (d) => sigmoid(d.x)),
      calibrated: safeLogLoss(placeData, (d) => sigmoid(placeCoef.a + placeCoef.b * d.x)),
    },
  };
}

function compareCalibrationMetrics(records, candidateWinCoef, candidatePlaceCoef) {
  const deployed = evaluationMetrics(records, WIN_CALIBRATION, PLACE_CALIBRATION);
  const candidate = evaluationMetrics(records, candidateWinCoef, candidatePlaceCoef);
  return {
    n: records.length,
    dateRange: deployed.dateRange,
    win: {
      rawModel: deployed.win.rawModel,
      rawMarket: deployed.win.rawMarket,
      deployed: deployed.win.calibrated,
      candidate: candidate.win.calibrated,
    },
    place: {
      rawModel: deployed.place.rawModel,
      deployed: deployed.place.calibrated,
      candidate: candidate.place.calibrated,
    },
  };
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
    wideHit: pct(list.filter((x) => x.pair?.wideOutcome === "hit").length / n),
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
  const widest = Object.values(obj).reduce((best, v) =>
    Object.keys(v).length > Object.keys(best).length ? v : best
  );
  const cols = ["class", ...Object.keys(widest)];
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
  deployed: {
    logLoss: logLoss(winData, (d) => sigmoid(WIN_CALIBRATION.a + WIN_CALIBRATION.b * d.x)),
    brier: brier(winData, (d) => sigmoid(WIN_CALIBRATION.a + WIN_CALIBRATION.b * d.x)),
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
  deployed: {
    logLoss: logLoss(placeData, (d) => sigmoid(PLACE_CALIBRATION.a + PLACE_CALIBRATION.b * d.x)),
    brier: brier(placeData, (d) => sigmoid(PLACE_CALIBRATION.a + PLACE_CALIBRATION.b * d.x)),
  },
};

// 分割検証: 前半でフィットし後半で評価 (時系列順)
const half = Math.floor(records.length / 2);
const trainRecords = records.slice(0, half);
const testRecords = records.slice(half);
const trainWinCoef = fitLogistic(makeWinData(trainRecords));
const trainPlaceCoef = fitLogistic(makePlaceData(trainRecords));
const testWinData = makeWinData(testRecords);
const testPlaceData = makePlaceData(testRecords);
const splitValidation = {
  train: { n: trainRecords.length, winCoef: trainWinCoef, placeCoef: trainPlaceCoef },
  testWinLogLoss: {
    rawModel: logLoss(testWinData, (d) => sigmoid(d.x)),
    rawMarket: logLoss(testWinData, (d) => sigmoid(d.market)),
    deployed: logLoss(testWinData, (d) => sigmoid(WIN_CALIBRATION.a + WIN_CALIBRATION.b * d.x)),
    trainFitCalibrated: logLoss(testWinData, (d) => sigmoid(trainWinCoef.a + trainWinCoef.b * d.x)),
  },
  testPlaceLogLoss: {
    rawModel: logLoss(testPlaceData, (d) => sigmoid(d.x)),
    deployed: logLoss(testPlaceData, (d) => sigmoid(PLACE_CALIBRATION.a + PLACE_CALIBRATION.b * d.x)),
    trainFitCalibrated: logLoss(testPlaceData, (d) => sigmoid(trainPlaceCoef.a + trainPlaceCoef.b * d.x)),
  },
  testClassification: classificationBacktest(testRecords, trainWinCoef, trainPlaceCoef),
};

const fullBacktest = classificationBacktest(records, WIN_CALIBRATION, PLACE_CALIBRATION);
const candidateFullBacktest = classificationBacktest(records, winCoef, placeCoef);
const overall = roiSummary(records);
const placeOddsModel = fitPlaceOddsModel(records);

// 市場ギャップ別成績 (officialImplied - 校正勝率)。
// marketGapLabel / overbetLabel の閾値根拠 (v2.5: moderate≥0.05 / high≥0.15)
const marketGapBands = [
  [-1, -0.05, "underbet (校正側が5pt以上高い)"],
  [-0.05, 0.05, "fair_priced (±5pt一致)"],
  [0.05, 0.15, "overbet_moderate (市場5-15pt高い)"],
  [0.15, 1, "overbet_high (市場15pt以上高い)"],
].map(([lo, hi, label]) => {
  const list = records.filter((x) => {
    const gap =
      1 / Number(x.honmei.realOdds) -
      sigmoid(
        WIN_CALIBRATION.a +
          WIN_CALIBRATION.b * logit(clamp(Number(x.honmei.winProb), 0.01, 0.99))
      );
    return gap >= lo && gap < hi;
  });
  return { band: label, ...roiSummary(list) };
});

// 直近50件の分類別成績 (skip 機会損失と wideRecommendation の鮮度監視)
const recentRecords = records.slice(-50);
const recentBacktest = classificationBacktest(recentRecords, WIN_CALIBRATION, PLACE_CALIBRATION);

// 配備済み係数の純粋な事後評価。再フィット後の日付かつ live_pre_race のみを使い、
// retrospective/backfill と全件再フィットの in-sample 指標を運用判断へ混ぜない。
const deployedCutoffDate = String(CALIBRATION_META?.dateRange?.to ?? "");
const livePreRaceRecords = records.filter(isLivePreRaceRecord);
const retrospectiveRecords = records.filter((record) => !isLivePreRaceRecord(record));
const postCalibrationRecords = livePreRaceRecords.filter(
  (record) => String(record.meta?.raceDate ?? "") > deployedCutoffDate
);
const postCalibrationHoldout = {
  cutoffDate: deployedCutoffDate || null,
  ...compareCalibrationMetrics(postCalibrationRecords, winCoef, placeCoef),
  deployedClassification: classificationBacktest(
    postCalibrationRecords,
    WIN_CALIBRATION,
    PLACE_CALIBRATION
  ),
  candidateClassification: classificationBacktest(postCalibrationRecords, winCoef, placeCoef),
};

// 係数更新の判断用: 直近50件を完全に取り置き、それ以前だけで再フィットした候補を
// 配備係数・市場と同じ holdout 上で比較する。
const rollingHoldoutSize = Math.min(50, Math.floor(records.length / 2));
const rollingTrainRecords = records.slice(0, records.length - rollingHoldoutSize);
const rollingTestRecords = records.slice(records.length - rollingHoldoutSize);
const rollingWinCoef = fitLogistic(makeWinData(rollingTrainRecords));
const rollingPlaceCoef = fitLogistic(makePlaceData(rollingTrainRecords));
const rollingComparison = compareCalibrationMetrics(
  rollingTestRecords,
  rollingWinCoef,
  rollingPlaceCoef
);
const finiteMetric = (value) => typeof value === "number" && Number.isFinite(value);
const rollingAdoptionGate = {
  candidateWinBeatsMarket:
    finiteMetric(rollingComparison.win.candidate) &&
    finiteMetric(rollingComparison.win.rawMarket) &&
    rollingComparison.win.candidate < rollingComparison.win.rawMarket,
  candidateWinNoWorseThanDeployed:
    finiteMetric(rollingComparison.win.candidate) &&
    finiteMetric(rollingComparison.win.deployed) &&
    rollingComparison.win.candidate <= rollingComparison.win.deployed,
  candidatePlaceNoWorseThanDeployed:
    finiteMetric(rollingComparison.place.candidate) &&
    finiteMetric(rollingComparison.place.deployed) &&
    rollingComparison.place.candidate <= rollingComparison.place.deployed,
};
rollingAdoptionGate.shouldWriteCoefficients =
  rollingAdoptionGate.candidateWinBeatsMarket &&
  rollingAdoptionGate.candidateWinNoWorseThanDeployed &&
  rollingAdoptionGate.candidatePlaceNoWorseThanDeployed;
const rollingRefitValidation = {
  train: {
    n: rollingTrainRecords.length,
    dateRange: dateRangeFor(rollingTrainRecords),
    winCoef: rollingWinCoef,
    placeCoef: rollingPlaceCoef,
  },
  test: {
    ...rollingComparison,
    deployedClassification: classificationBacktest(
      rollingTestRecords,
      WIN_CALIBRATION,
      PLACE_CALIBRATION
    ),
    candidateClassification: classificationBacktest(
      rollingTestRecords,
      rollingWinCoef,
      rollingPlaceCoef
    ),
  },
  adoptionGate: rollingAdoptionGate,
};

const recordComposition = {
  livePreRace: {
    n: livePreRaceRecords.length,
    overall: roiSummary(livePreRaceRecords),
    classification: classificationBacktest(
      livePreRaceRecords,
      WIN_CALIBRATION,
      PLACE_CALIBRATION
    ),
  },
  retrospective: {
    n: retrospectiveRecords.length,
    overall: roiSummary(retrospectiveRecords),
    classification: classificationBacktest(
      retrospectiveRecords,
      WIN_CALIBRATION,
      PLACE_CALIBRATION
    ),
  },
};

const generatedAt = new Date().toISOString();
const reportJson = {
  generatedAt,
  sampleSize: records.length,
  dateRange: { from: dateFrom, to: dateTo },
  winCalibration: {
    coef: winCoef,
    deployedCoef: WIN_CALIBRATION,
    deployedMeta: CALIBRATION_META,
    metrics: winMetrics,
  },
  placeCalibration: {
    coef: placeCoef,
    deployedCoef: PLACE_CALIBRATION,
    deployedMeta: CALIBRATION_META,
    metrics: placeMetrics,
  },
  placeOddsModel,
  marketGapBands,
  winBuckets: calibrationBuckets(records, "win", winCoef),
  placeBuckets: calibrationBuckets(records, "place", placeCoef),
  overall,
  classificationBacktest: fullBacktest,
  candidateClassificationBacktest: candidateFullBacktest,
  recentClassificationBacktest: recentBacktest,
  monitoring: {
    recordComposition,
    postCalibrationHoldout,
    rollingRefitValidation,
  },
  splitValidation,
};

const md = `# 校正レポート (tanpuku honmei)

- 生成日時: ${generatedAt}
- 対象: 確定済み本命 ${records.length} 件 (${dateFrom} 〜 ${dateTo})
- 再校正モデル: p_cal = sigmoid(a + b * logit(p_model)) を logLoss 最小化でフィット
- 実運用評価: 配備済み ${CALIBRATION_META?.sampleSize ?? "?"} 件係数を、フィット期間後の live_pre_race だけで判定

## フィット結果

| 対象 | 配備係数 a/b | 全件候補 a/b | rawModel | rawMarket | 配備係数 | 全件候補(in-sample) |
| --- | --- | --- | --- | --- | --- | --- |
| winProb | ${WIN_CALIBRATION.a} / ${WIN_CALIBRATION.b} | ${winCoef.a} / ${winCoef.b} | ${winMetrics.rawModel.logLoss} | ${winMetrics.rawMarket.logLoss} | ${winMetrics.deployed.logLoss} | ${winMetrics.calibrated.logLoss} |
| placeProb | ${PLACE_CALIBRATION.a} / ${PLACE_CALIBRATION.b} | ${placeCoef.a} / ${placeCoef.b} | ${placeMetrics.rawModel.logLoss} | - | ${placeMetrics.deployed.logLoss} | ${placeMetrics.calibrated.logLoss} |

全件候補は同じデータへフィットした in-sample 参考値。係数更新の判断には下の時系列 holdout だけを使う。

## データ構成

| 区分 | n | 単ROI | 複ROI | ワイドROI |
| --- | --- | --- | --- | --- |
| live_pre_race | ${recordComposition.livePreRace.n} | ${recordComposition.livePreRace.overall.tanRoi} | ${recordComposition.livePreRace.overall.fukuRoi} | ${recordComposition.livePreRace.overall.wideRoi} |
| retrospective / backfill | ${recordComposition.retrospective.n} | ${recordComposition.retrospective.overall.tanRoi} | ${recordComposition.retrospective.overall.fukuRoi} | ${recordComposition.retrospective.overall.wideRoi} |

成績評価と採用判断は live_pre_race を正とし、retrospective はフィット補助・診断に限定する。

## 配備係数の事後 holdout (${postCalibrationHoldout.n} 件)

- 対象: 配備係数の最終学習日 ${postCalibrationHoldout.cutoffDate ?? "?"} より後の live_pre_race (${postCalibrationHoldout.dateRange.from ?? "?"} 〜 ${postCalibrationHoldout.dateRange.to ?? "?"})

| 対象 | rawModel | rawMarket | 配備係数 | 全件候補(参考・in-sample) |
| --- | --- | --- | --- | --- |
| winProb logLoss | ${postCalibrationHoldout.win.rawModel} | ${postCalibrationHoldout.win.rawMarket} | ${postCalibrationHoldout.win.deployed} | ${postCalibrationHoldout.win.candidate} |
| placeProb logLoss | ${postCalibrationHoldout.place.rawModel} | - | ${postCalibrationHoldout.place.deployed} | ${postCalibrationHoldout.place.candidate} |

### 事後 holdout の配備分類成績

${objectTableMd(postCalibrationHoldout.deployedClassification)}
## 直近${rollingRefitValidation.test.n}件を取り置いた再フィット検証

- train: ${rollingRefitValidation.train.n} 件 (${rollingRefitValidation.train.dateRange.from} 〜 ${rollingRefitValidation.train.dateRange.to})
- 候補係数 win: a=${rollingRefitValidation.train.winCoef.a}, b=${rollingRefitValidation.train.winCoef.b} / place: a=${rollingRefitValidation.train.placeCoef.a}, b=${rollingRefitValidation.train.placeCoef.b}

| 対象 | rawModel | rawMarket | 配備係数 | 再フィット候補 |
| --- | --- | --- | --- | --- |
| winProb logLoss | ${rollingRefitValidation.test.win.rawModel} | ${rollingRefitValidation.test.win.rawMarket} | ${rollingRefitValidation.test.win.deployed} | ${rollingRefitValidation.test.win.candidate} |
| placeProb logLoss | ${rollingRefitValidation.test.place.rawModel} | - | ${rollingRefitValidation.test.place.deployed} | ${rollingRefitValidation.test.place.candidate} |

係数更新ゲート: **${rollingRefitValidation.adoptionGate.shouldWriteCoefficients ? "通過" : "未通過"}** (win候補が市場を上回る=${rollingRefitValidation.adoptionGate.candidateWinBeatsMarket} / win候補が配備以上=${rollingRefitValidation.adoptionGate.candidateWinNoWorseThanDeployed} / place候補が配備以上=${rollingRefitValidation.adoptionGate.candidatePlaceNoWorseThanDeployed})

## winProb 校正バケット

${tableMd(reportJson.winBuckets, ["band", "n", "avgRaw", "avgCalibrated", "actual"])}
## placeProb 校正バケット

${tableMd(reportJson.placeBuckets, ["band", "n", "avgRaw", "avgCalibrated", "actual"])}
## 複勝オッズ近似モデル (実払戻 OLS フィット)

${placeOddsModel ? `- placeOdds ≈ odds × ${placeOddsModel.slope} + ${placeOddsModel.intercept} (n=${placeOddsModel.sampleSize}、的中サンプルのみ)` : "- サンプル不足のためフィットなし"}
- 旧近似 odds×0.35+1.0 は実払戻比で約1.4-1.6倍過大だった。

## 市場ギャップ別成績 (officialImplied − 校正勝率)

${tableMd(marketGapBands, ["band", "n", "tanRoi", "fukuRoi", "wideRoi"])}
overbetLabel の閾値 (moderate ≥0.05 / high ≥0.15) はこの表が根拠。

## 全体成績

| n | tanHit | fukuHit | tanRoi | fukuRoi | wideRoi |
| --- | --- | --- | --- | --- | --- |
| ${overall.n} | ${overall.tanHit} | ${overall.fukuHit} | ${overall.tanRoi} | ${overall.fukuRoi} | ${overall.wideRoi} |

## 分類バックテスト (現行 CLASSIFY ゲート / 配備係数)

${objectTableMd(fullBacktest)}
- skip 行の tanRoi/fukuRoi はそのまま「見送りによる機会損失」(低いほど skip が正しい)。
- wideRecommendation のゲートは place 分類なので、place 行の wideHit/wideRoi がワイド推奨の成績。

### 全件再フィット候補での参考分類 (採用前・in-sample)

${objectTableMd(candidateFullBacktest)}

## 直近50件の分類別成績 (鮮度監視)

${objectTableMd(recentBacktest)}
skip の ROI が継続的に80%超なら閾値の緩和を、place の wideRoi が100%割れなら wideRecommendation の見直しを検討する。

## 分割検証 (前半 ${splitValidation.train.n} 件でフィット → 後半 ${testRecords.length} 件で評価)

- train係数 win: a=${trainWinCoef.a}, b=${trainWinCoef.b} / place: a=${trainPlaceCoef.a}, b=${trainPlaceCoef.b}
- 後半 winProb logLoss: rawModel ${splitValidation.testWinLogLoss.rawModel} / rawMarket ${splitValidation.testWinLogLoss.rawMarket} / 配備 ${splitValidation.testWinLogLoss.deployed} / 前半fit ${splitValidation.testWinLogLoss.trainFitCalibrated}
- 後半 placeProb logLoss: rawModel ${splitValidation.testPlaceLogLoss.rawModel} / 配備 ${splitValidation.testPlaceLogLoss.deployed} / 前半fit ${splitValidation.testPlaceLogLoss.trainFitCalibrated}

### 後半 out-of-sample 分類成績

${objectTableMd(splitValidation.testClassification)}
## 運用メモ

- skip ゲートは分割検証で再現性を確認済み。win ゲートは件数が少なく不安定なので、win 分類の confidence は控えめに扱う。
- 係数を更新する場合は \`node scripts/calibration-report.mjs --write-coefficients\` を実行し、
  このレポートの「直近50件を取り置いた再フィット検証」で更新ゲートが通過した場合だけコミットする。
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

if (writeCoefficients && !rollingAdoptionGate.shouldWriteCoefficients && !forceWriteCoefficients) {
  console.error(
    "係数更新を中止: 直近50件 holdout の更新ゲートが未通過です。" +
      " レポートを確認し、意図的に上書きする場合だけ --force-write-coefficients を追加してください。"
  );
  process.exitCode = 2;
} else if (writeCoefficients) {
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

// 複勝オッズの線形近似 (確定済み複勝的中の実払戻に OLS フィット)。
// 旧近似 odds*0.35+1.0 は実払戻比 1.4-1.6 倍過大だった。
export const PLACE_ODDS_MODEL = Object.freeze({ slope: ${placeOddsModel?.slope ?? 0.165}, intercept: ${placeOddsModel?.intercept ?? 0.898}, sampleSize: ${placeOddsModel?.sampleSize ?? 0} });

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

export function estimatePlaceOdds(odds) {
  const value = Number(odds);
  if (!(value > 0)) return 1.0;
  return Math.max(1.0, value * PLACE_ODDS_MODEL.slope + PLACE_ODDS_MODEL.intercept);
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
