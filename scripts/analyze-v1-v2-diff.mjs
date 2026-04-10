/**
 * v1 vs v2 honmei selection diff analysis
 *
 * v1 (tanpuku-baseline-v1): honmei = max winProb (= max base score)
 * v2 (tanpuku-place-v2):    honmei = max placeScore
 *
 * This script re-runs both selection methods on the same race data
 * and compares outcomes against actual results.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { scoreTanpukuHorse, pickTanpukuPair } from "../lib/tanpukuSelection.mjs";

const ROOT = process.cwd();
const WEEKLY_RACES_PATH = path.join(ROOT, "data", "weekly-races.json");
const STATE_PATH = path.join(ROOT, "data", "routine-state.json");

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

function buildOfficialImpliedProbability(odds) {
  return odds > 0 ? clamp(1 / odds, 0.02, 0.7) : 0;
}

function buildPlaceProbability(winProb, officialImplied) {
  return clamp(winProb * 1.55 + officialImplied * 0.55 + 0.08, 0.1, 0.92);
}

function buildTop3Stability(horse, placeProb, winProb) {
  const recentForm = clamp(((Number(horse.recentFormScore ?? 0) || 0) + 1) / 6, 0, 1);
  const recentFinish = clamp(1 - ((Number(horse.recentAverageFinish ?? 6) || 6) - 1) / 8, 0, 1);
  return clamp(placeProb * 0.45 + (placeProb - winProb) * 0.75 + recentForm * 0.1 + recentFinish * 0.1, 0, 1);
}

function buildMarketSupport(_horse, officialImplied) {
  return clamp(officialImplied * 2.25, 0, 1);
}

function buildOverbetRisk(officialImplied, winProb) {
  return clamp((officialImplied - winProb) * 2.4, 0, 1);
}

function buildPlaceReturnEdge(placeProb, placeOdds) {
  return clamp((placeProb * placeOdds - 1) / 1.4, 0, 1);
}

function buildLongshotBonus(realOdds, placeProb, overbetRisk) {
  const oddsBonus = clamp((realOdds - 5) / 20, 0, 1);
  const viableBonus = clamp((placeProb - 0.16) / 0.28, 0, 1);
  return clamp(oddsBonus * 0.7 + viableBonus * 0.3 - overbetRisk * 0.2, 0, 1);
}

function computeFullScoring(horse, race) {
  const score = scoreTanpukuHorse(horse, race, false, null);
  const odds = Number(horse.realOdds ?? 0);
  if (!(odds > 0)) return null;

  const officialImplied = buildOfficialImpliedProbability(odds);
  const winProb = clamp(score / 220, 0.03, 0.7);
  const placeProb = buildPlaceProbability(winProb, officialImplied);
  const placeOdds = Math.max(1.1, odds * 0.35 + 1.0);
  const top3Stability = buildTop3Stability(horse, placeProb, winProb);
  const marketSupport = buildMarketSupport(horse, officialImplied);
  const overbetRisk = buildOverbetRisk(officialImplied, winProb);
  const placeReturnEdge = buildPlaceReturnEdge(placeProb, placeOdds);
  const longshotBonus = buildLongshotBonus(odds, placeProb, overbetRisk);

  const placeScore = clamp(
    0.55 * placeProb + 0.2 * top3Stability + 0.15 * marketSupport - 0.1 * overbetRisk,
    0, 1
  );
  const valueScore = clamp(0.5 * placeProb + 0.35 * placeReturnEdge + 0.15 * longshotBonus, 0, 1);

  return {
    horseId: horse.id,
    horseName: horse.name,
    odds,
    score: round3(score),
    winProb: round3(winProb),
    officialImplied: round3(officialImplied),
    placeProb: round3(placeProb),
    placeOdds: round3(placeOdds),
    top3Stability: round3(top3Stability),
    marketSupport: round3(marketSupport),
    overbetRisk: round3(overbetRisk),
    placeReturnEdge: round3(placeReturnEdge),
    longshotBonus: round3(longshotBonus),
    placeScore: round3(placeScore),
    valueScore: round3(valueScore),
  };
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

// --- v2.1 candidate: fix placeProb saturation ---
// Current v2: clamp(winProb * 1.55 + officialImplied * 0.55 + 0.08, 0.1, 0.92)
// Problem: almost all competitive horses hit the 0.92 ceiling
// Fix: reduce multipliers so top horses spread across 0.55-0.85 range
function buildPlaceProbabilityV21(winProb, officialImplied) {
  return clamp(winProb * 0.95 + officialImplied * 0.35 + 0.15, 0.1, 0.88);
}

function computeFullScoringV21(horse, race) {
  const score = scoreTanpukuHorse(horse, race, false, null);
  const odds = Number(horse.realOdds ?? 0);
  if (!(odds > 0)) return null;

  const officialImplied = buildOfficialImpliedProbability(odds);
  const winProb = clamp(score / 220, 0.03, 0.7);
  const placeProb = buildPlaceProbabilityV21(winProb, officialImplied);
  const placeOdds = Math.max(1.1, odds * 0.35 + 1.0);
  const top3Stability = buildTop3Stability(horse, placeProb, winProb);
  const marketSupport = buildMarketSupport(horse, officialImplied);
  const overbetRisk = buildOverbetRisk(officialImplied, winProb);

  const placeScore = clamp(
    0.55 * placeProb + 0.2 * top3Stability + 0.15 * marketSupport - 0.1 * overbetRisk,
    0, 1
  );

  return {
    horseId: horse.id,
    horseName: horse.name,
    odds,
    winProb: round3(winProb),
    placeProb: round3(placeProb),
    placeScore: round3(placeScore),
  };
}

async function main() {
  const weeklyRaces = await readJson(WEEKLY_RACES_PATH, {});
  const state = await readJson(STATE_PATH, {});

  // Collect all races with results
  const allRaces = [];
  const currentWeekRaces = weeklyRaces.currentWeek?.races ?? [];
  for (const race of currentWeekRaces) {
    if (race.result?.top3HorseIds?.length > 0 && race.horses?.length > 0) {
      allRaces.push(race);
    }
  }
  for (const archive of weeklyRaces.archives ?? []) {
    for (const race of archive.races ?? []) {
      if (race.result?.top3HorseIds?.length > 0 && race.horses?.length > 0) {
        allRaces.push(race);
      }
    }
  }

  // Build recommendation lookup from state (for payout data)
  const recsByRaceId = {};
  for (const rec of state.tanpukuRecommendations ?? []) {
    if (!rec.raceId) continue;
    if (!recsByRaceId[rec.raceId]) recsByRaceId[rec.raceId] = [];
    recsByRaceId[rec.raceId].push(rec);
  }

  console.log(`\n=== v1 vs v2 本命選出差分レポート ===`);
  console.log(`対象レース数: ${allRaces.length}\n`);

  const rows = [];
  let v1FukuHit = 0, v2FukuHit = 0, v1Total = 0, v2Total = 0;
  let samePickCount = 0, diffPickCount = 0;
  let v1HitV2Miss = 0, v2HitV1Miss = 0, bothHit = 0, bothMiss = 0;

  // Loss classification tags
  const tags = {
    place_prob_overestimate: 0,
    market_support_mislead: 0,
    overbet_penalty_too_weak: 0,
    value_bonus_misallocation: 0,
    rank1_to_place_shift_worse: 0,
    placeprob_ceiling_saturation: 0,
  };

  for (const race of allRaces) {
    const raceId = race.raceId ?? "";
    const label = race.label ?? raceId;
    const top3 = (race.result.top3HorseIds ?? []).map(String);

    // Build race-like object for scoring
    const raceObj = {
      horses: race.horses,
      distance: race.distance,
      straightLength: race.straightLength,
      courseId: race.courseId,
      trackBias: { innerOuter: 0, frontBack: 0 },
    };

    // Score all horses
    const scored = race.horses
      .map(h => computeFullScoring(h, raceObj))
      .filter(Boolean);

    if (scored.length === 0) continue;

    // v1: pick by max winProb (= max base score)
    const v1Sorted = [...scored].sort((a, b) => b.winProb - a.winProb || b.score - a.score);
    const v1Pick = v1Sorted[0];
    const v1RunnerUp = v1Sorted[1] ?? null;

    // v2: pick by max placeScore
    const v2Sorted = [...scored].sort((a, b) => b.placeScore - a.placeScore || b.placeProb - a.placeProb);
    const v2Pick = v2Sorted[0];
    const v2RunnerUp = v2Sorted[1] ?? null;

    const v1Placed = top3.includes(String(v1Pick.horseId));
    const v2Placed = top3.includes(String(v2Pick.horseId));
    const changed = v1Pick.horseId !== v2Pick.horseId;

    v1Total++;
    v2Total++;
    if (v1Placed) v1FukuHit++;
    if (v2Placed) v2FukuHit++;
    if (changed) diffPickCount++;
    else samePickCount++;

    if (v1Placed && v2Placed) bothHit++;
    else if (v1Placed && !v2Placed) v1HitV2Miss++;
    else if (!v1Placed && v2Placed) v2HitV1Miss++;
    else bothMiss++;

    // Classify v2 losses
    if (!v2Placed && changed) {
      // placeProb overestimate: v2 pick had high placeProb but didn't place
      if (v2Pick.placeProb >= 0.85) tags.place_prob_overestimate++;

      // market support mislead: v2 pick had high marketSupport but didn't place
      if (v2Pick.marketSupport >= 0.6 && !v2Placed) tags.market_support_mislead++;

      // overbet penalty too weak: v2 pick had high overbetRisk but wasn't penalized enough
      if (v2Pick.overbetRisk > 0.1 && v2Pick.officialImplied > v2Pick.winProb) tags.overbet_penalty_too_weak++;

      // v1 would have hit but v2 shifted away
      if (v1Placed) tags.rank1_to_place_shift_worse++;
    }

    // placeProb ceiling saturation (both v1 and v2 picks hit ceiling)
    if (v2Pick.placeProb >= 0.9 && v2RunnerUp && v2RunnerUp.placeProb >= 0.88) {
      tags.placeprob_ceiling_saturation++;
    }

    // value bonus misallocation: value pick had resources but honmei missed
    if (!v2Placed) {
      const recs = recsByRaceId[raceId] ?? [];
      const valueRec = recs.find(r => r.pickType === "value");
      if (valueRec && !valueRec.fukuHit) tags.value_bonus_misallocation++;
    }

    // Determine primary change driver
    let changePrimary = "same_pick";
    if (changed) {
      const drivers = [];
      // Compare what gave v2Pick the edge over v1Pick in placeScore terms
      const v2PickEntry = scored.find(s => s.horseId === v2Pick.horseId);
      const v1PickEntry = scored.find(s => s.horseId === v1Pick.horseId);
      if (v2PickEntry && v1PickEntry) {
        const placeProbDiff = v2PickEntry.placeProb - v1PickEntry.placeProb;
        const stabilityDiff = v2PickEntry.top3Stability - v1PickEntry.top3Stability;
        const marketDiff = v2PickEntry.marketSupport - v1PickEntry.marketSupport;
        const overbetDiff = v2PickEntry.overbetRisk - v1PickEntry.overbetRisk;

        const contributions = [
          { label: "placeProb", value: placeProbDiff * 0.55 },
          { label: "top3Stability", value: stabilityDiff * 0.2 },
          { label: "marketSupport", value: marketDiff * 0.15 },
          { label: "overbetRisk", value: -overbetDiff * 0.1 },
        ];
        contributions.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
        changePrimary = contributions[0].label;
      }
    }

    const row = {
      raceId,
      label,
      v1Honmei: `${v1Pick.horseName}(${v1Pick.horseId})`,
      v1Odds: v1Pick.odds,
      v1WinProb: v1Pick.winProb,
      v1PlaceScore: v1Pick.placeScore,
      v2Honmei: `${v2Pick.horseName}(${v2Pick.horseId})`,
      v2Odds: v2Pick.odds,
      v2WinProb: v2Pick.winProb,
      v2PlaceScore: v2Pick.placeScore,
      v2PlaceProb: v2Pick.placeProb,
      v2MarketSupport: v2Pick.marketSupport,
      v2OverbetRisk: v2Pick.overbetRisk,
      v2Top3Stability: v2Pick.top3Stability,
      changed,
      changePrimary,
      top3: top3.join(","),
      v1Placed,
      v2Placed,
      // Score breakdown for top 2 (v2 sort)
      v2Top2Gap: v2RunnerUp ? round3(v2Pick.placeScore - v2RunnerUp.placeScore) : null,
      v2RunnerUpName: v2RunnerUp ? `${v2RunnerUp.horseName}(${v2RunnerUp.horseId})` : null,
      v2RunnerUpPlaceScore: v2RunnerUp?.placeScore ?? null,
      v2RunnerUpPlaceProb: v2RunnerUp?.placeProb ?? null,
    };
    rows.push(row);
  }

  // Print race-by-race comparison
  console.log("--- レース別比較 ---\n");
  for (const r of rows) {
    const changeMarker = r.changed ? "★変更" : "同一";
    const v1Mark = r.v1Placed ? "✓複" : "✗";
    const v2Mark = r.v2Placed ? "✓複" : "✗";
    console.log(`[${r.raceId}] ${r.label} ${changeMarker}`);
    console.log(`  v1本命: ${r.v1Honmei} odds=${r.v1Odds} winProb=${r.v1WinProb} placeScore=${r.v1PlaceScore} → ${v1Mark}`);
    console.log(`  v2本命: ${r.v2Honmei} odds=${r.v2Odds} placeProb=${r.v2PlaceProb} placeScore=${r.v2PlaceScore} mktSup=${r.v2MarketSupport} overbetRisk=${r.v2OverbetRisk} top3Stab=${r.v2Top3Stability} → ${v2Mark}`);
    if (r.changed) console.log(`  変更主因: ${r.changePrimary}`);
    console.log(`  v2 2位候補: ${r.v2RunnerUpName} placeScore=${r.v2RunnerUpPlaceScore} placeProb=${r.v2RunnerUpPlaceProb} gap=${r.v2Top2Gap}`);
    console.log(`  実着順top3: ${r.top3}`);
    console.log();
  }

  // Summary
  console.log("=== サマリ ===\n");
  console.log(`レース数: ${v1Total}`);
  console.log(`v1 複勝的中: ${v1FukuHit}/${v1Total} = ${(v1FukuHit / v1Total * 100).toFixed(1)}%`);
  console.log(`v2 複勝的中: ${v2FukuHit}/${v2Total} = ${(v2FukuHit / v2Total * 100).toFixed(1)}%`);
  console.log(`同一選出: ${samePickCount}, 変更: ${diffPickCount}`);
  console.log(`v1的中 & v2的中: ${bothHit}`);
  console.log(`v1的中 & v2外れ: ${v1HitV2Miss} ← v2で悪化`);
  console.log(`v1外れ & v2的中: ${v2HitV1Miss} ← v2で改善`);
  console.log(`両方外れ: ${bothMiss}`);

  // ROI comparison using recommendation payouts
  let v2FukuPayoutSum = 0;
  let v2SettledCount = 0;
  for (const recs of Object.values(recsByRaceId)) {
    const winRec = recs.find(r => r.pickType === "win" && r.settlementStatus === "settled");
    if (winRec) {
      v2SettledCount++;
      v2FukuPayoutSum += winRec.fukuPayout ?? 0;
    }
  }
  if (v2SettledCount > 0) {
    console.log(`\nv2 複回収率 (recommendation実績): ${(v2FukuPayoutSum / (v2SettledCount * 100) * 100).toFixed(1)}%`);
  }

  // Loss tags
  console.log("\n=== 負けパターン分類 ===\n");
  for (const [tag, count] of Object.entries(tags)) {
    console.log(`  ${tag}: ${count}`);
  }

  // placeProb saturation analysis
  console.log("\n=== placeProb 飽和分析 ===\n");
  let saturatedCount = 0;
  let saturatedRaces = 0;
  for (const race of allRaces) {
    const raceObj = {
      horses: race.horses,
      distance: race.distance,
      straightLength: race.straightLength,
      courseId: race.courseId,
      trackBias: { innerOuter: 0, frontBack: 0 },
    };
    const scored = race.horses.map(h => computeFullScoring(h, raceObj)).filter(Boolean);
    const atCeiling = scored.filter(s => s.placeProb >= 0.9);
    if (atCeiling.length >= 2) {
      saturatedRaces++;
      saturatedCount += atCeiling.length;
    }
  }
  console.log(`  placeProb >= 0.9 が2頭以上のレース: ${saturatedRaces}/${allRaces.length}`);
  console.log(`  飽和馬の総数: ${saturatedCount}`);
  console.log(`  → placeProb近似の上限0.92がほぼ全レースで飽和し、差別化が破綻している`);

  // Detailed look at changed & v2-worse races
  const v2WorseRaces = rows.filter(r => r.changed && r.v1Placed && !r.v2Placed);
  if (v2WorseRaces.length > 0) {
    console.log("\n=== v2で悪化した変更レース詳細 ===\n");
    for (const r of v2WorseRaces) {
      console.log(`  [${r.raceId}] ${r.label}`);
      console.log(`    v1: ${r.v1Honmei} → 複勝的中`);
      console.log(`    v2: ${r.v2Honmei} → 外れ (主因: ${r.changePrimary})`);
    }
  }

  // Changed & v2-improved
  const v2BetterRaces = rows.filter(r => r.changed && !r.v1Placed && r.v2Placed);
  if (v2BetterRaces.length > 0) {
    console.log("\n=== v2で改善した変更レース詳細 ===\n");
    for (const r of v2BetterRaces) {
      console.log(`  [${r.raceId}] ${r.label}`);
      console.log(`    v1: ${r.v1Honmei} → 外れ`);
      console.log(`    v2: ${r.v2Honmei} → 複勝的中 (主因: ${r.changePrimary})`);
    }
  }

  // === v2.1 placeProb fix comparison ===
  console.log("\n=== v2.1 (placeProb近似修正) テスト ===\n");
  console.log("修正: placeProb = clamp(winProb * 0.95 + officialImplied * 0.35 + 0.15, 0.1, 0.88)");
  console.log("目的: 上限飽和を解消し、placeScoreの差別化を取り戻す\n");

  let v21FukuHit = 0;
  let v21Total = 0;
  let v21SaturatedRaces = 0;
  let v21ChangedFromV2 = 0;
  let v21V2HitV21Miss = 0;
  let v21V2MissV21Hit = 0;

  for (const race of allRaces) {
    const raceId = race.raceId ?? "";
    const label = race.label ?? raceId;
    const top3 = (race.result.top3HorseIds ?? []).map(String);
    const raceObj = {
      horses: race.horses,
      distance: race.distance,
      straightLength: race.straightLength,
      courseId: race.courseId,
      trackBias: { innerOuter: 0, frontBack: 0 },
    };

    const scored21 = race.horses.map(h => computeFullScoringV21(h, raceObj)).filter(Boolean);
    if (scored21.length === 0) continue;

    const v21Sorted = [...scored21].sort((a, b) => b.placeScore - a.placeScore || b.placeProb - a.placeProb);
    const v21Pick = v21Sorted[0];
    const v21RunnerUp = v21Sorted[1] ?? null;
    const v21Placed = top3.includes(String(v21Pick.horseId));

    // Compare to v2
    const scored2 = race.horses.map(h => computeFullScoring(h, raceObj)).filter(Boolean);
    const v2Sorted2 = [...scored2].sort((a, b) => b.placeScore - a.placeScore || b.placeProb - a.placeProb);
    const v2Pick2 = v2Sorted2[0];
    const v2Placed2 = top3.includes(String(v2Pick2.horseId));

    v21Total++;
    if (v21Placed) v21FukuHit++;
    if (v21Pick.horseId !== v2Pick2.horseId) v21ChangedFromV2++;
    if (v2Placed2 && !v21Placed) v21V2HitV21Miss++;
    if (!v2Placed2 && v21Placed) v21V2MissV21Hit++;

    const atCeiling = scored21.filter(s => s.placeProb >= 0.85);
    if (atCeiling.length >= 2) v21SaturatedRaces++;

    const v21Mark = v21Placed ? "✓複" : "✗";
    const v2Mark2 = v2Placed2 ? "✓複" : "✗";
    const changed21 = v21Pick.horseId !== v2Pick2.horseId;
    if (changed21) {
      console.log(`[${raceId}] ${label}`);
      console.log(`  v2:   ${v2Pick2.horseName}(${v2Pick2.horseId}) placeProb=${v2Pick2.placeProb} placeScore=${v2Pick2.placeScore} → ${v2Mark2}`);
      console.log(`  v2.1: ${v21Pick.horseName}(${v21Pick.horseId}) placeProb=${v21Pick.placeProb} placeScore=${v21Pick.placeScore} → ${v21Mark}`);
      console.log(`  v2.1 2位: ${v21RunnerUp?.horseName ?? "-"} placeScore=${v21RunnerUp?.placeScore ?? "-"} gap=${v21RunnerUp ? round3(v21Pick.placeScore - v21RunnerUp.placeScore) : "-"}`);
      console.log();
    }
  }

  console.log("--- v2.1 サマリ ---");
  console.log(`v2.1 複勝的中: ${v21FukuHit}/${v21Total} = ${(v21FukuHit / v21Total * 100).toFixed(1)}%`);
  console.log(`v2→v2.1 変更: ${v21ChangedFromV2}件`);
  console.log(`v2的中→v2.1外れ: ${v21V2HitV21Miss}`);
  console.log(`v2外れ→v2.1的中: ${v21V2MissV21Hit}`);
  console.log(`v2.1 飽和レース (placeProb>=0.85 が2頭以上): ${v21SaturatedRaces}/${v21Total}`);

  // Final v1 vs v2 vs v2.1 comparison
  console.log("\n=== v1 / v2 / v2.1 最終比較 ===\n");
  console.log(`v1  複勝率: ${(v1FukuHit / v1Total * 100).toFixed(1)}% (${v1FukuHit}/${v1Total})`);
  console.log(`v2  複勝率: ${(v2FukuHit / v2Total * 100).toFixed(1)}% (${v2FukuHit}/${v2Total})`);
  console.log(`v2.1 複勝率: ${(v21FukuHit / v21Total * 100).toFixed(1)}% (${v21FukuHit}/${v21Total})`);
}

main().catch(console.error);
