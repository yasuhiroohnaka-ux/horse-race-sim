#!/usr/bin/env node
// 選定ロジックのバックテスト: weekly-races.json のアーカイブに対して pickTanpukuPair を
// 再実行し、公式払戻ベースで単勝/複勝の的中率・回収率を採点する。
//
// Usage:
//   node scripts/backtest-selection.mjs
//   node scripts/backtest-selection.mjs --baseline=lib/tanpukuSelection.v25.mjs
//   node scripts/backtest-selection.mjs --split=2026-05-24        # train/holdout 分割
//   node scripts/backtest-selection.mjs --odds=archive            # 診断用 (リークあり)
//   node scripts/backtest-selection.mjs --write                   # data/analysis に md/json 出力
//
// 設計上の不変条件 (2026-09-03 の監査で踏んだ落とし穴の再発防止):
//
// 1. 採点は必ず公式払戻。`result.finishers[].odds * 100` は全 333 レースで
//    `result.payouts.tansho.payouts[0]` と完全一致することを確認済みなので、
//    どの馬を買った場合でもこれを払戻として使える。
//    事前オッズ × 100 を払戻とみなすと穴馬帯で約2倍の過大評価になる。
// 2. 選定に渡すオッズは「予想時点で見えていた値」でなければならない。
//    アーカイブの `horses[].realOdds` はレース後に確定オッズで上書きされている
//    ものが混在する (30倍超でも約49%が確定オッズと一致=リーク)。既定では
//    review-records.json の snapshot.rankedRows に保存された事前オッズで上書きする。
// 3. ROI は必ずブートストラップ信頼区間つきで報告する。n=333 / 的中30%前後では
//    95%CI が ±20pt 開くので、点推定だけの比較は意思決定に使えない。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE_PATH = path.join(ROOT, "data", "weekly-races.json");
const RECORDS_PATH = path.join(ROOT, "data", "review-records.json");
const ANALYSIS_DIR = path.join(ROOT, "data", "analysis");

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const MODULE_PATH = getArg("module", "lib/tanpukuSelection.mjs");
const BASELINE_PATH = getArg("baseline", null);
const ODDS_SOURCE = getArg("odds", "snapshot"); // snapshot | archive
const SPLIT_DATE = getArg("split", null);
const FROM_DATE = getArg("from", null);
const TO_DATE = getArg("to", null);
const WRITE = args.includes("--write");
const BOOTSTRAP_ITERATIONS = Number(getArg("iterations", "20000"));

// ---------------------------------------------------------------------------
// データ読み込み
// ---------------------------------------------------------------------------

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
}

/** 予想時点の事前オッズ: raceId -> (horseId -> odds) */
function loadPreRaceOdds() {
  const file = readJson(RECORDS_PATH);
  const map = new Map();
  for (const record of Object.values(file.records ?? {})) {
    const rows = record.snapshot?.rankedRows ?? [];
    if (rows.length === 0) continue;
    const raceId = String(record.meta?.raceId ?? record.raceId ?? "");
    if (!raceId) continue;
    const odds = new Map();
    for (const row of rows) {
      const value = Number(row.realOdds);
      if (value > 0) odds.set(String(row.horseId), value);
    }
    if (odds.size > 0) map.set(raceId, odds);
  }
  return map;
}

/** 確定オッズ (=公式単勝払戻/100): raceId -> (horseId -> odds) */
function buildFinalOdds(race) {
  const map = new Map();
  for (const finisher of race.result?.finishers ?? []) {
    const value = Number(finisher.odds);
    if (value > 0) map.set(String(finisher.horseId), value);
  }
  return map;
}

function loadRaces() {
  const archive = readJson(ARCHIVE_PATH);
  const races = [];
  for (const week of archive.archives ?? []) {
    for (const race of week.races ?? []) {
      if (!race.result?.payouts?.tansho) continue;
      if (!Array.isArray(race.horses) || race.horses.length === 0) continue;
      const date = String(race.raceDate ?? "");
      if (FROM_DATE && date < FROM_DATE) continue;
      if (TO_DATE && date > TO_DATE) continue;
      races.push(race);
    }
  }
  races.sort(
    (a, b) =>
      String(a.raceDate).localeCompare(String(b.raceDate)) ||
      String(a.raceId).localeCompare(String(b.raceId))
  );
  return races;
}

/**
 * 選定に渡すレースを組み立てる。既定では horses[].realOdds を事前オッズで
 * 上書きし、アーカイブに混入した確定オッズのリークを断つ。
 */
function buildSelectionRace(race, preRaceOdds) {
  if (ODDS_SOURCE === "archive") return { race, oddsCoverage: 1 };
  const odds = preRaceOdds.get(String(race.raceId));
  if (!odds) return { race, oddsCoverage: 0 };
  let covered = 0;
  const horses = race.horses.map((horse) => {
    const value = odds.get(String(horse.id));
    if (!(value > 0)) return horse;
    covered += 1;
    return { ...horse, realOdds: value };
  });
  return { race: { ...race, horses }, oddsCoverage: covered / race.horses.length };
}

// ---------------------------------------------------------------------------
// 採点
// ---------------------------------------------------------------------------

const FUKU_UNAVAILABLE = null;

function settleTan(race, finalOdds, horseId) {
  const won = String(race.result?.winnerHorseId ?? "") === String(horseId);
  if (!won) return { hit: false, payout: 0 };
  const odds = finalOdds.get(String(horseId));
  const official = Number(race.result?.payouts?.tansho?.payouts?.[0] ?? 0);
  return { hit: true, payout: official > 0 ? official : Math.round((odds ?? 0) * 100) };
}

function settleFuku(race, horseId) {
  const top3 = (race.result?.top3HorseIds ?? []).map(String);
  const index = top3.indexOf(String(horseId));
  if (index < 0) return { hit: false, payout: 0 };
  const payouts = race.result?.payouts?.fukusho?.payouts ?? [];
  const numbers = race.result?.payouts?.fukusho?.resultNumbers ?? [];
  // resultNumbers は馬番なので、finisher 経由で pick の馬番を引く
  const finisher = (race.result?.finishers ?? []).find((f) => String(f.horseId) === String(horseId));
  const horseNumber = Number(finisher?.horseNumber ?? NaN);
  const slot = numbers.findIndex((n) => Number(n) === horseNumber);
  const payout = Number(payouts[slot >= 0 ? slot : index] ?? 0);
  return { hit: true, payout: payout > 0 ? payout : FUKU_UNAVAILABLE ?? 0 };
}

async function runSelection(modulePath, races, preRaceOdds) {
  const mod = await import(new URL(`file://${path.join(ROOT, modulePath).replace(/\\/g, "/")}`));
  const pick = mod.pickTanpukuPair;
  if (typeof pick !== "function") throw new Error(`${modulePath} does not export pickTanpukuPair`);
  const rows = [];
  const failures = [];
  for (const race of races) {
    const { race: selectionRace, oddsCoverage } = buildSelectionRace(race, preRaceOdds);
    let pair = null;
    try {
      pair = pick(selectionRace, false, true);
    } catch (error) {
      failures.push({ raceId: race.raceId, error: String(error?.message ?? error) });
      continue;
    }
    if (!pair?.winPick?.horse) continue;
    const entry = pair.winPick;
    const horseId = String(entry.horse.id);
    const finalOdds = buildFinalOdds(race);
    const tan = settleTan(race, finalOdds, horseId);
    const fuku = settleFuku(race, horseId);
    rows.push({
      raceId: String(race.raceId),
      date: String(race.raceDate ?? ""),
      horseId,
      horseName: entry.horse.name ?? "",
      preOdds: Number(entry.odds ?? entry.horse.realOdds ?? 0),
      finalOdds: Number(finalOdds.get(horseId) ?? 0),
      fieldSize: race.horses.length,
      classification: entry.classificationHint?.classification ?? "unknown",
      calWinProb: Number(entry.calWinProb ?? 0),
      tanHit: tan.hit,
      tanPayout: tan.payout,
      fukuHit: fuku.hit,
      fukuPayout: fuku.payout,
      oddsCoverage,
    });
  }
  return { rows, failures, version: mod.TANPUKU_SCORING_VERSION ?? "unknown" };
}

// ---------------------------------------------------------------------------
// 統計
// ---------------------------------------------------------------------------

function summarize(rows) {
  const n = rows.length;
  if (n === 0) return { n: 0, tanHits: 0, tanHitRate: 0, tanRoi: 0, fukuHitRate: 0, fukuRoi: 0 };
  const tanHits = rows.filter((r) => r.tanHit).length;
  const fukuHits = rows.filter((r) => r.fukuHit).length;
  const tanReturn = rows.reduce((acc, r) => acc + r.tanPayout, 0);
  const fukuReturn = rows.reduce((acc, r) => acc + r.fukuPayout, 0);
  return {
    n,
    tanHits,
    tanHitRate: (tanHits / n) * 100,
    tanRoi: (tanReturn / (n * 100)) * 100,
    fukuHitRate: (fukuHits / n) * 100,
    fukuRoi: (fukuReturn / (n * 100)) * 100,
  };
}

/** 単勝 ROI のブートストラップ 95% 信頼区間 */
function bootstrapRoiCi(rows, iterations = BOOTSTRAP_ITERATIONS) {
  const n = rows.length;
  if (n < 5) return [NaN, NaN];
  const pnl = rows.map((r) => r.tanPayout - 100);
  const samples = new Float64Array(iterations);
  for (let i = 0; i < iterations; i += 1) {
    let sum = 0;
    for (let j = 0; j < n; j += 1) sum += pnl[(Math.random() * n) | 0];
    samples[i] = sum / n + 100;
  }
  const sorted = Array.from(samples).sort((a, b) => a - b);
  return [sorted[Math.floor(iterations * 0.025)], sorted[Math.floor(iterations * 0.975)]];
}

const ODDS_BANDS = [
  ["1.0-2.5", 1, 2.5],
  ["2.5-4.0", 2.5, 4],
  ["4.0-7.0", 4, 7],
  ["7.0-15", 7, 15],
  ["15-30", 15, 30],
  ["30+", 30, Infinity],
];

const FIELD_BANDS = [
  ["<=9", 0, 9],
  ["10-13", 10, 13],
  ["14-15", 14, 15],
  ["16+", 16, Infinity],
];

function groupRows(rows) {
  return {
    byClass: ["win", "place", "skip"].map((key) => ({
      key,
      rows: rows.filter((r) => r.classification === key),
    })),
    byOdds: ODDS_BANDS.map(([key, lo, hi]) => ({
      key,
      rows: rows.filter((r) => r.preOdds >= lo && r.preOdds < hi),
    })),
    byField: FIELD_BANDS.map(([key, lo, hi]) => ({
      key,
      rows: rows.filter((r) => r.fieldSize >= lo && r.fieldSize <= hi),
    })),
  };
}

// ---------------------------------------------------------------------------
// 出力
// ---------------------------------------------------------------------------

const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "-");
const pad = (v, width) => String(v).padStart(width);

function renderBlock(label, rows, { withCi = true } = {}) {
  const s = summarize(rows);
  if (s.n === 0) return `  ${label.padEnd(14)} n=0`;
  const ci = withCi ? bootstrapRoiCi(rows, Math.min(BOOTSTRAP_ITERATIONS, 8000)) : [NaN, NaN];
  const ciText = withCi && Number.isFinite(ci[0]) ? `  CI95[${f1(ci[0])}, ${f1(ci[1])}]` : "";
  return `  ${label.padEnd(14)} n=${pad(s.n, 3)}  単的中 ${pad(f1(s.tanHitRate), 5)}%  単ROI ${pad(f1(s.tanRoi), 6)}%  複的中 ${pad(f1(s.fukuHitRate), 5)}%  複ROI ${pad(f1(s.fukuRoi), 6)}%${ciText}`;
}

function renderReport(result, label) {
  const lines = [];
  lines.push(`=== ${label} (${result.version}) ===`);
  lines.push(renderBlock("ALL", result.rows));
  lines.push("  -- classification --");
  const grouped = groupRows(result.rows);
  for (const g of grouped.byClass) lines.push(renderBlock(g.key, g.rows));
  lines.push("  -- 事前オッズ帯 --");
  for (const g of grouped.byOdds) lines.push(renderBlock(g.key, g.rows, { withCi: false }));
  lines.push("  -- 頭数 --");
  for (const g of grouped.byField) lines.push(renderBlock(g.key, g.rows, { withCi: false }));
  const half = Math.floor(result.rows.length / 2);
  const [firstLabel, first, secondLabel, second] = SPLIT_DATE
    ? [
        "train",
        result.rows.filter((r) => r.date < SPLIT_DATE),
        "holdout",
        result.rows.filter((r) => r.date >= SPLIT_DATE),
      ]
    : ["1st half", result.rows.slice(0, half), "2nd half", result.rows.slice(half)];
  lines.push(SPLIT_DATE ? `  -- 時系列分割 (split=${SPLIT_DATE}) --` : "  -- 前後半 --");
  lines.push(renderBlock(firstLabel, first));
  lines.push(renderBlock(secondLabel, second));
  for (const cls of ["win", "place", "skip"]) {
    lines.push(renderBlock(`  ${firstLabel}/${cls}`, first.filter((r) => r.classification === cls), { withCi: false }));
    lines.push(renderBlock(`  ${secondLabel}/${cls}`, second.filter((r) => r.classification === cls), { withCi: false }));
  }
  if (result.failures.length > 0) {
    lines.push(`  !! 選定失敗 ${result.failures.length} 件: ${result.failures.slice(0, 3).map((f) => f.raceId).join(", ")}`);
  }
  return lines.join("\n");
}

function renderComparison(target, baseline) {
  const a = summarize(baseline.rows);
  const b = summarize(target.rows);
  const lines = [];
  lines.push("=== 差分 (target − baseline) ===");
  lines.push(
    `  単的中 ${f1(a.tanHitRate)}% → ${f1(b.tanHitRate)}%  (${b.tanHitRate - a.tanHitRate >= 0 ? "+" : ""}${f1(b.tanHitRate - a.tanHitRate)}pt)`
  );
  lines.push(
    `  単ROI  ${f1(a.tanRoi)}% → ${f1(b.tanRoi)}%  (${b.tanRoi - a.tanRoi >= 0 ? "+" : ""}${f1(b.tanRoi - a.tanRoi)}pt)`
  );
  const changed = target.rows.filter((row) => {
    const other = baseline.rows.find((r) => r.raceId === row.raceId);
    return other && other.horseId !== row.horseId;
  });
  lines.push(`  本命が変わったレース: ${changed.length} / ${target.rows.length}`);
  if (changed.length > 0) {
    const changedSummary = summarize(changed);
    const baselineChanged = baseline.rows.filter((r) => changed.some((c) => c.raceId === r.raceId));
    const baselineSummary = summarize(baselineChanged);
    lines.push(
      `    その部分集合: baseline 単ROI ${f1(baselineSummary.tanRoi)}% (的中 ${f1(baselineSummary.tanHitRate)}%) → target 単ROI ${f1(changedSummary.tanRoi)}% (的中 ${f1(changedSummary.tanHitRate)}%)`
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const preRaceOdds = loadPreRaceOdds();
  const races = loadRaces();
  const target = await runSelection(MODULE_PATH, races, preRaceOdds);

  const coverage = target.rows.filter((r) => r.oddsCoverage > 0.9).length;
  console.log(
    `対象 ${races.length} レース / 選定成功 ${target.rows.length} 件 / 事前オッズ被覆 ${coverage} 件 (odds source: ${ODDS_SOURCE})`
  );
  console.log("");
  console.log(renderReport(target, `target: ${MODULE_PATH}`));

  let baseline = null;
  if (BASELINE_PATH) {
    baseline = await runSelection(BASELINE_PATH, races, preRaceOdds);
    console.log("");
    console.log(renderReport(baseline, `baseline: ${BASELINE_PATH}`));
    console.log("");
    console.log(renderComparison(target, baseline));
  }

  if (WRITE) {
    fs.mkdirSync(ANALYSIS_DIR, { recursive: true });
    const payload = {
      generatedAt: new Date().toISOString(),
      oddsSource: ODDS_SOURCE,
      splitDate: SPLIT_DATE,
      target: { module: MODULE_PATH, version: target.version, summary: summarize(target.rows) },
      baseline: baseline
        ? { module: BASELINE_PATH, version: baseline.version, summary: summarize(baseline.rows) }
        : null,
      rows: target.rows,
    };
    const jsonPath = path.join(ANALYSIS_DIR, "backtest-selection.json");
    fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`\nwrote ${path.relative(ROOT, jsonPath)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
