// 発走前市場オッズを基準に、保存 snapshot の特徴量だけで増分情報を時系列評価する。
// Usage: node scripts/market-residual-eval.mjs [--split=YYYY-MM-DD] [--iterations=2000]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REVIEW_PATH = path.join(ROOT, "data", "review-records.json");
const ARCHIVE_PATH = path.join(ROOT, "data", "weekly-races.json");
const OUT_BASE = path.join(ROOT, "data", "analysis", "market-residual-eval");
const splitArg = process.argv.find((arg) => arg.startsWith("--split="));
const splitDate = splitArg?.slice(8) ?? null;
if (splitDate && !/^\d{4}-\d{2}-\d{2}$/.test(splitDate)) throw new Error("--split must be YYYY-MM-DD");
const iterationsArg = process.argv.find((arg) => arg.startsWith("--iterations="));
const bootstrapIterations = iterationsArg ? Number(iterationsArg.slice(13)) : 10000;
if (!Number.isInteger(bootstrapIterations) || bootstrapIterations < 200) throw new Error("--iterations must be >= 200");

const ARCHIVE_FIELDS = [
  "speed", "stamina", "power", "guts", "trainingScore", "recentFormScore",
  "recentAverageFinish", "recentTimeIndex", "lastRaceGradeScore", "distanceChange",
  "favoriteCount", "xBuzzScore", "predictionCount", "weight", "runningStyle",
  "gateNumber", "realOdds",
];
const SNAPSHOT_FEATURES = [
  { key: "winProb", label: "snapshot.winProb", value: (row) => row.winProb },
  { key: "simTop3Rate", label: "snapshot.simTop3Rate", value: (row) => row.simTop3Rate },
  { key: "score", label: "snapshot.score", value: (row) => row.score },
  { key: "edge", label: "snapshot.edge", value: (row) => row.edge },
  { key: "gateNumber", label: "snapshot.gateNumber", value: (row) => row.gateNumber },
  { key: "previousFinish", label: "snapshot.previousFinish", value: (row) => row.previousFinish },
  ...["abilityScore", "marketEdge", "courseFit", "distanceFit", "groundFit", "paceFit"].map((key) => ({
    key: `contributor:${key}`,
    label: `snapshot.majorContributors.${key}掲載`,
    value: (row) => Number((row.majorContributors ?? []).some((item) => item.key === key)),
  })),
  ...["Nige", "Senko", "Sashi", "Oikomi"].map((style) => ({
    key: `runningStyle:${style}`,
    label: `snapshot.runningStyle=${style}`,
    value: (row) => Number(row.runningStyle === style),
  })),
];

function loadArchiveMap() {
  const data = JSON.parse(fs.readFileSync(ARCHIVE_PATH, "utf8"));
  const races = [...(data.currentWeek?.races ?? []), ...(data.archives ?? []).flatMap((entry) => entry.races ?? [])];
  return new Map(races.map((race) => [String(race.raceId), race]));
}

function buildSamples() {
  const records = Object.values(JSON.parse(fs.readFileSync(REVIEW_PATH, "utf8")).records);
  const archiveMap = loadArchiveMap();
  const excluded = {};
  const skip = (reason) => { excluded[reason] = (excluded[reason] ?? 0) + 1; };
  const races = [];
  const audit = { archiveHorseRows: 0, reviewUpdatedAfterSnapshot: 0, archiveHorseUpdatedAtPresent: 0, oddsDifferences: 0, gateDifferences: 0, runningStyleDifferences: 0 };
  for (const record of records) {
    if (record.status !== "review_ready" || record.snapshotSourceStatus !== "live_pre_race" ||
      record.livePreRaceEligible !== true || record.snapshot?.sourceStatus !== "live_pre_race" ||
      record.snapshot?.predictionOrigin !== "saved_live" || record.snapshot?.livePreRaceEligible !== true ||
      record.fieldComplete === false || record.snapshot?.fieldComplete === false ||
      record.snapshot?.dataQuality?.fieldComplete === false || !record.actualWinnerHorseId) {
      skip("not_eligible_live_complete_review");
      continue;
    }
    const archive = archiveMap.get(String(record.raceId));
    const snapshotRows = record.snapshot.rankedRows;
    if (!archive?.horses?.length || !Array.isArray(snapshotRows) || snapshotRows.length !== archive.horses.length) {
      skip("roster_count_missing_or_mismatch");
      continue;
    }
    const archivedHorses = new Map(archive.horses.map((horse) => [String(horse.id), horse]));
    const ids = snapshotRows.map((row) => String(row.horseId ?? ""));
    if (new Set(ids).size !== ids.length || ids.some((id) => !archivedHorses.has(id)) ||
      !ids.includes(String(record.actualWinnerHorseId))) {
      skip("roster_ids_or_winner_missing");
      continue;
    }
    const capturedAt = Date.parse(record.snapshot.capturedAt ?? record.snapshotTakenAt ?? "");
    const startAt = Date.parse(record.snapshot.scheduledStartTime ?? archive.scheduledStartTime ?? "");
    if (!Number.isFinite(capturedAt) || !Number.isFinite(startAt) || capturedAt >= startAt) {
      skip("snapshot_time_not_before_start");
      continue;
    }
    const inverseOdds = snapshotRows.map((row) => 1 / Number(row.realOdds));
    if (inverseOdds.some((value) => !Number.isFinite(value) || value <= 0)) {
      skip("snapshot_odds_missing");
      continue;
    }
    const total = inverseOdds.reduce((a, b) => a + b, 0);
    for (const row of snapshotRows) {
      const horse = archivedHorses.get(String(row.horseId));
      audit.archiveHorseRows += 1;
      if (Number.isFinite(Date.parse(horse.updatedAt ?? ""))) audit.archiveHorseUpdatedAtPresent += 1;
      if (Number.isFinite(Date.parse(record.updatedAt ?? "")) && Date.parse(record.updatedAt) > capturedAt) audit.reviewUpdatedAfterSnapshot += 1;
      if (Number(horse.realOdds) !== Number(row.realOdds)) audit.oddsDifferences += 1;
      if (Number(horse.gateNumber) !== Number(row.gateNumber)) audit.gateDifferences += 1;
      if (String(horse.runningStyle ?? "") !== String(row.runningStyle ?? "")) audit.runningStyleDifferences += 1;
    }
    races.push({
      raceId: String(record.raceId),
      date: String(record.meta?.raceDate ?? record.snapshot.raceDate ?? ""),
      capturedAt: record.snapshot.capturedAt,
      winnerIndex: ids.indexOf(String(record.actualWinnerHorseId)),
      rows: snapshotRows.map((row, index) => ({ ...row, m: inverseOdds[index] / total })),
    });
  }
  races.sort((a, b) => a.date.localeCompare(b.date) || a.capturedAt.localeCompare(b.capturedAt) || a.raceId.localeCompare(b.raceId));
  return { races, excluded, audit };
}

function featureRaces(races, feature) {
  let missing = 0;
  let constant = 0;
  const usable = [];
  for (const race of races) {
    const rawValues = race.rows.map((row) => feature.value(row));
    if (rawValues.some((value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)))) { missing += 1; continue; }
    const values = rawValues.map(Number);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
    if (!(std > 1e-9)) constant += 1;
    usable.push({ ...race, hasVariation: std > 1e-9, z: values.map((value) => std > 1e-9 ? (value - mean) / std : 0) });
  }
  return { races: usable, missing, constant };
}

function raceNllAndDerivatives(race, a, c) {
  const logits = race.rows.map((row, index) => a * Math.log(row.m) + c * (race.z?.[index] ?? 0));
  const max = Math.max(...logits);
  const weights = logits.map((value) => Math.exp(value - max));
  const sum = weights.reduce((x, y) => x + y, 0);
  const winner = race.winnerIndex;
  const probs = weights.map((value) => value / sum);
  const logM = race.rows.map((row) => Math.log(row.m));
  const xs = [logM, race.z ?? race.rows.map(() => 0)];
  const means = xs.map((vector) => vector.reduce((acc, value, i) => acc + probs[i] * value, 0));
  const grad = means.map((value, k) => value - xs[k][winner]);
  const hessian = xs.map((vector, k) => xs.map((other, j) =>
    vector.reduce((acc, value, i) => acc + probs[i] * value * other[i], 0) - means[k] * means[j]));
  return { nll: Math.log(sum) + max - logits[winner], grad, hessian };
}

function meanNll(races, a, c) {
  return races.reduce((sum, race) => sum + raceNllAndDerivatives(race, a, c).nll, 0) / races.length;
}

function fit(races, withFeature) {
  let a = 1;
  let c = 0;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const g = [0, 0];
    const h = [[0, 0], [0, 0]];
    for (const race of races) {
      const d = raceNllAndDerivatives(race, a, c);
      for (let i = 0; i < 2; i += 1) {
        g[i] += d.grad[i];
        for (let j = 0; j < 2; j += 1) h[i][j] += d.hessian[i][j];
      }
    }
    if (Math.max(Math.abs(g[0]), withFeature ? Math.abs(g[1]) : 0) / races.length < 1e-9) break;
    const ridge = 1e-8 * races.length;
    const h00 = h[0][0] + ridge;
    const h11 = h[1][1] + ridge;
    const determinant = h00 * h11 - h[0][1] * h[1][0];
    const da = withFeature && determinant > 1e-12 ? (h11 * g[0] - h[0][1] * g[1]) / determinant : g[0] / h00;
    const dc = withFeature && determinant > 1e-12 ? (h00 * g[1] - h[1][0] * g[0]) / determinant : 0;
    const previous = meanNll(races, a, c);
    let step = 1;
    while (step > 1 / 1024 && meanNll(races, a - step * da, c - step * dc) > previous) step /= 2;
    if (step <= 1 / 1024) break;
    a -= step * da;
    c -= step * dc;
    if (Math.abs(step * da) + Math.abs(step * dc) < 1e-9) break;
  }
  return { a, c };
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted, probability) {
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(probability * (sorted.length - 1))))];
}

function bootstrapDelta(deltas, iterations, seed, alpha) {
  const random = seededRandom(seed);
  const samples = [];
  for (let b = 0; b < iterations; b += 1) {
    let sum = 0;
    for (let i = 0; i < deltas.length; i += 1) sum += deltas[Math.floor(random() * deltas.length)];
    samples.push(sum / deltas.length);
  }
  samples.sort((x, y) => x - y);
  return [percentile(samples, alpha / 2), percentile(samples, 1 - alpha / 2)];
}

const { races, excluded, audit } = buildSamples();
if (races.length < 30) throw new Error(`Too few eligible races: ${races.length}`);
const splitIndex = splitDate ? races.findIndex((race) => race.date >= splitDate) : Math.floor(races.length * 0.6);
if (splitIndex < 30 || races.length - splitIndex < 30) throw new Error("At least 30 races are required on each side of the time split");
const trainIds = new Set(races.slice(0, splitIndex).map((race) => race.raceId));
const featureSets = SNAPSHOT_FEATURES.map((feature) => ({ feature, ...featureRaces(races, feature) }));
const hasEnoughData = (train, test) => train.length >= 30 && test.length >= 30 && train.some((race) => race.hasVariation) && test.some((race) => race.hasVariation);
const testedCount = featureSets.filter((set) => hasEnoughData(
  set.races.filter((race) => trainIds.has(race.raceId)),
  set.races.filter((race) => !trainIds.has(race.raceId))
)).length;
const results = featureSets.map((set, index) => {
  const train = set.races.filter((race) => trainIds.has(race.raceId));
  const test = set.races.filter((race) => !trainIds.has(race.raceId));
  if (!hasEnoughData(train, test)) return {
    feature: set.feature.label,
    status: train.length < 30 || test.length < 30 ? "insufficient" : "no_variation",
    trainN: train.length, testN: test.length, missingRaces: set.missing, constantRaces: set.constant,
  };
  const market = fit(train, false);
  const model = fit(train, true);
  if (meanNll(train, model.a, model.c) > meanNll(train, market.a, 0) + 1e-8) {
    throw new Error(`${set.feature.label}: model fit is worse than the market-only training fit`);
  }
  const deltas = test.map((race) => raceNllAndDerivatives(race, model.a, model.c).nll - raceNllAndDerivatives(race, market.a, 0).nll);
  const deltaNll = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const ci95 = bootstrapDelta(deltas, bootstrapIterations, 20260926 + index, 0.05);
  const adjustedCi = bootstrapDelta(deltas, bootstrapIterations, 20271026 + index, 0.05 / testedCount);
  return {
    feature: set.feature.label, status: "tested", trainN: train.length, testN: test.length,
    missingRaces: set.missing, constantRaces: set.constant,
    marketCoefficient: market.a, coefficient: model.c, modelMarketCoefficient: model.a,
    rawMarketNll: meanNll(test, 1, 0), marketNll: meanNll(test, market.a, 0), modelNll: meanNll(test, model.a, model.c),
    deltaNll, ci95, bonferroniCi: adjustedCi,
    passesGate: deltaNll <= -0.005 && adjustedCi[1] < 0,
  };
});
const fullMarket = fit(races.slice(0, splitIndex), false);
const fullTest = races.slice(splitIndex);
const archiveAudit = ARCHIVE_FIELDS.map((field) => ({
  feature: `archive.horses.${field}`,
  status: "excluded_unverified_pre_race_value",
  reason: `archive horse entries lack per-field pre-race timestamp; ${field === "realOdds" ? "final odds can overwrite this field" : "using snapshot-only values where available"}`,
}));
const output = {
  generatedAt: new Date().toISOString(),
  method: "conditional logit; race-wise z-score; paired time-split test NLL; race bootstrap; Bonferroni family-wise CI",
  split: { date: splitDate, mode: splitDate ? "sensitivity" : "primary_60_40", trainN: splitIndex, testN: fullTest.length, testFrom: fullTest[0]?.date },
  eligibility: { raceN: races.length, excluded, archiveAudit: audit },
  fullMarket: { trainCoefficient: fullMarket.a, testNll: meanNll(fullTest, fullMarket.a, 0), rawMarketTestNll: meanNll(fullTest, 1, 0) },
  multipleTesting: { testedCount, alpha: 0.05, correction: "Bonferroni" },
  features: results,
  excludedArchiveFeatures: archiveAudit,
};
fs.writeFileSync(`${OUT_BASE}.json`, `${JSON.stringify(output, null, 2)}\n`);
const f = (value) => typeof value === "number" && Number.isFinite(value) ? value.toFixed(4) : "-";
const md = `# 市場残差評価\n\n` +
  `発走前 snapshot の全出走馬オッズから市場確率を構成。${races.length} レースを時系列分割し、前半 ${splitIndex} 件で係数を学習、後半 ${fullTest.length} 件 (${fullTest[0]?.date}〜) で評価。archive の事後更新リスクがある特徴量は除外。\n\n` +
  (splitDate ? `- 指定分割 ${splitDate} は感度分析。計画の主判定は既定の60/40分割で行い、分割を結果から選ばない。\n` : `- この既定60/40分割を主判定とする。別分割は感度分析として扱う。\n`) +
  `- 市場のみ test NLL: ${f(output.fullMarket.testNll)} (市場そのまま ${f(output.fullMarket.rawMarketTestNll)})\n` +
  `- 候補 ${testedCount} 個。係数と ΔNLL は各候補で同じレース集合の市場のみと比較。95% CI はレース単位ブートストラップ ${bootstrapIterations} 回。採用判定には Bonferroni 補正 CI を使用。\n` +
  `- 採用条件: test ΔNLL ≤ −0.005 かつ補正 CI 上限 < 0。今回通過: ${results.filter((item) => item.passesGate).length} 個。\n\n` +
  `| 特徴量 | train / test n | 係数 c | 市場NLL | モデルNLL | ΔNLL | 95% CI | 補正CI | 判定 |\n| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |\n` +
  results.map((item) => `| ${item.feature} | ${item.trainN} / ${item.testN} | ${f(item.coefficient)} | ${f(item.marketNll)} | ${f(item.modelNll)} | ${f(item.deltaNll)} | ${item.ci95 ? item.ci95.map(f).join("〜") : "-"} | ${item.bonferroniCi ? item.bonferroniCi.map(f).join("〜") : "-"} | ${item.status === "tested" ? item.passesGate ? "通過" : "未通過" : item.status === "no_variation" ? "レース内変動なし" : "件数不足"} |`).join("\n") +
  `\n\n## リーク監査\n\n` +
  `review-records の更新時刻が snapshot より後の horse 行は ${audit.reviewUpdatedAfterSnapshot}。archive horse の updatedAt がある行は ${audit.archiveHorseUpdatedAtPresent}/${audit.archiveHorseRows}、archive と snapshot のオッズ差 ${audit.oddsDifferences} 行、枠差 ${audit.gateDifferences} 行、脚質差 ${audit.runningStyleDifferences} 行。archive 側には各特徴量が snapshot 時点で固定されていた証拠がないため、以下は全て学習・評価から除外。枠・脚質は snapshot の保存値のみ使用。\n\n` +
  `| archive 候補 | 判定 | 理由 |\n| --- | --- | --- |\n` +
  archiveAudit.map((item) => `| ${item.feature} | 除外 | ${item.reason} |`).join("\n") +
  `\n\n## 除外件数\n\n` +
  Object.entries(excluded).map(([reason, count]) => `- ${reason}: ${count}`).join("\n") + `\n`;
fs.writeFileSync(`${OUT_BASE}.md`, md);
console.log(`eligible=${races.length} train=${splitIndex} test=${fullTest.length} from=${fullTest[0]?.date}`);
console.log(`market NLL=${f(output.fullMarket.testNll)} raw market=${f(output.fullMarket.rawMarketTestNll)} tested=${testedCount} passed=${results.filter((item) => item.passesGate).length}`);
console.log(`wrote ${path.relative(ROOT, OUT_BASE)}.{json,md}`);
