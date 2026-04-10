export const TANPUKU_SCORING_VERSION = "tanpuku-place-v2.3";

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function horseIdKey(horse) {
  return String(horse?.id ?? "");
}

function isScratchedHorse(horse) {
  const text = [
    horse?.status,
    horse?.raceStatus,
    horse?.entryStatus,
    horse?.withdrawStatus,
    horse?.scratchStatus,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  return ["取消", "除外", "scratched", "scratch", "withdrawn", "withdraw", "cancelled", "canceled"].some((token) =>
    text.includes(token.toLowerCase())
  );
}

function comparePlaceEntries(a, b) {
  return (
    b.placeScore - a.placeScore ||
    b.placeProb - a.placeProb ||
    (a.horse.gateNumber ?? 999) - (b.horse.gateNumber ?? 999) ||
    horseIdKey(a.horse).localeCompare(horseIdKey(b.horse))
  );
}

function compareValueEntries(a, b) {
  return (
    b.valueScore - a.valueScore ||
    b.placeReturnEdge - a.placeReturnEdge ||
    b.placeProb - a.placeProb ||
    (a.horse.gateNumber ?? 999) - (b.horse.gateNumber ?? 999) ||
    horseIdKey(a.horse).localeCompare(horseIdKey(b.horse))
  );
}

export function compareOpponentEntries(a, b) {
  return (
    b.placeProb - a.placeProb ||
    b.top3Stability - a.top3Stability ||
    b.placeScore - a.placeScore ||
    b.winProb - a.winProb ||
    (a.horse.gateNumber ?? 999) - (b.horse.gateNumber ?? 999) ||
    horseIdKey(a.horse).localeCompare(horseIdKey(b.horse))
  );
}

export function pickOpponentEntry(scoredEntries, honmeiHorseId) {
  const eligibleScored = Array.isArray(scoredEntries)
    ? scoredEntries.filter(
        (entry) => !isScratchedHorse(entry.horse) && horseIdKey(entry.horse) !== String(honmeiHorseId ?? "")
      )
    : [];
  const sorted = [...eligibleScored].sort(compareOpponentEntries);
  return {
    sorted,
    entry: sorted[0] ?? null,
  };
}

function computePaceModifier(race) {
  const front = race.horses.filter((h) => h.runningStyle === "Nige" || h.runningStyle === "Senko").length;
  const ratio = front / Math.max(race.horses.length, 1);
  return ratio - 0.45;
}

function getDistanceShiftRaceBias(race) {
  const distance = Number(race.distance ?? 0);
  const straightLength = Number(race.straightLength ?? 360);
  const sprintBias = clamp((1600 - distance) / 500, 0, 1);
  const stayingBias = clamp((distance - 1800) / 800, 0, 1);
  const straightBias = clamp((straightLength - 380) / 180, -1, 1);
  const frontBias = clamp(Number(race.trackBias?.frontBack ?? 0) / 5, -1, 1);

  return clamp(
    stayingBias * 0.95 -
      sprintBias * 0.9 +
      straightBias * 0.25 -
      getCourseInnerTiltFromId(race.courseId) * 0.28 -
      frontBias * 0.24,
    -1.2,
    1.2
  );
}

function getDistanceShiftScore(horse, race) {
  const lastRaceDistance = Number(horse.lastRaceDistance ?? 0);
  if (!(lastRaceDistance > 0)) return 0;

  const distanceChange = Number.isFinite(Number(horse.distanceChange))
    ? Number(horse.distanceChange)
    : Number(race.distance ?? 0) - lastRaceDistance;
  if (Math.abs(distanceChange) < 100) return 0;

  const changeUnits = clamp(distanceChange / 400, -1.25, 1.25);
  const styleBias =
    horse.runningStyle === "Nige"
      ? -0.65
      : horse.runningStyle === "Senko"
        ? -0.25
        : horse.runningStyle === "Sashi"
          ? 0.25
          : 0.55;
  const staminaEdge = clamp((horse.stamina - horse.speed) / 18, -1.4, 1.4);
  const recoveryEdge = clamp((horse.guts - 75) / 18, -0.8, 0.8);
  const horseBias = clamp(styleBias + staminaEdge * 0.72 + recoveryEdge * 0.18, -1.4, 1.4);
  const alignment = changeUnits * (horseBias * 0.75 + getDistanceShiftRaceBias(race) * 0.55);
  const resilience = clamp(
    ((horse.recentFormScore ?? 0) / 5) * 0.65 + (((horse.lastRaceGradeScore ?? 2) - 2) / 3) * 0.35,
    -1,
    1
  );

  return clamp(alignment * 6 - Math.abs(changeUnits) + Math.abs(changeUnits) * resilience * 1.8, -6, 6);
}

function isFrontStyle(style) {
  return style === "Nige" || style === "Senko";
}

function isBackStyle(style) {
  return style === "Sashi" || style === "Oikomi";
}

function getCourseInnerTiltFromId(courseId = "") {
  const id = String(courseId).toLowerCase();
  if (id.includes("nakayama")) return 0.7;
  if (id.includes("chukyo")) return 0.2;
  if (id.includes("hanshin")) return 0.1;
  if (id.includes("tokyo")) return -0.2;
  if (id.includes("niigata")) return -0.4;
  return 0;
}

function buildDrawTacticalMap(race, applyDraw = true) {
  const horses = race.horses || [];
  if (!applyDraw) {
    return new Map(horses.map((h) => [h.id, 1.0]));
  }
  const sorted = [...horses].sort(
    (a, b) => (a.gateNumber ?? 999) - (b.gateNumber ?? 999) || String(a.id).localeCompare(String(b.id))
  );
  const n = Math.max(sorted.length, 1);
  const smallField = n < 8;
  const damp = smallField ? 0.1 : 1.0;
  const innerTilt = getCourseInnerTiltFromId(race.courseId);
  const bias = race.trackBias ?? { innerOuter: 0, frontBack: 0 };
  const outerFav = clamp((bias.innerOuter ?? 0) / 5, -1, 1);
  const frontFav = clamp((bias.frontBack ?? 0) / 5, -1, 1);

  return new Map(
    sorted.map((horse, i) => {
      const lanePos = n <= 1 ? 0 : (i / (n - 1)) * 2 - 1;
      const left = i > 0 ? sorted[i - 1] : null;
      const right = i < n - 1 ? sorted[i + 1] : null;
      const neighFront = [left, right].filter((x) => x && isFrontStyle(x.runningStyle)).length;
      const neighBack = [left, right].filter((x) => x && isBackStyle(x.runningStyle)).length;

      const lanePct = (-lanePos * innerTilt + lanePos * outerFav) * 0.007 * damp;
      const styleBiasPct = isFrontStyle(horse.runningStyle)
        ? frontFav * 0.005 * damp
        : isBackStyle(horse.runningStyle)
          ? -frontFav * 0.005 * damp
          : 0;
      let tacticalPct = 0;
      if (horse.runningStyle === "Nige") {
        if (right && isFrontStyle(right.runningStyle)) tacticalPct -= 0.005 * damp;
        if (left && isFrontStyle(left.runningStyle)) tacticalPct -= 0.002 * damp;
        if (neighFront === 0) tacticalPct += 0.003 * damp;
      } else if (horse.runningStyle === "Senko") {
        tacticalPct -= neighFront * 0.002 * damp;
        if (neighFront >= 2) tacticalPct -= 0.0015 * damp;
      } else {
        tacticalPct -= neighBack * 0.0015 * damp;
        if (lanePos < -0.3 && neighBack > 0) tacticalPct -= 0.001 * damp;
      }

      const modifier = smallField
        ? clamp(1 + lanePct + styleBiasPct + tacticalPct, 0.995, 1.005)
        : clamp(1 + lanePct + styleBiasPct + tacticalPct, 0.975, 1.025);
      return [horse.id, modifier];
    })
  );
}

export function scoreTanpukuHorse(horse, race, includeBodyWeight = false, drawMap = null) {
  const ability = horse.speed * 0.35 + horse.stamina * 0.25 + horse.power * 0.2 + horse.guts * 0.2;
  const popularity = Number(horse.predictionCount ?? 0);
  const simWinProxy = horse.realOdds && horse.realOdds > 0 ? 100 / horse.realOdds : 0;
  const pace = computePaceModifier(race);
  const frontStyle = horse.runningStyle === "Nige" || horse.runningStyle === "Senko";
  const paceAdvantage = frontStyle ? -pace * 10 : pace * 10;
  const bodyWeightBonus = includeBodyWeight ? Number(horse.bodyWeightDiff ?? 0) * -0.3 : 0;
  const drawMod = drawMap?.get(horse.id) ?? 1.0;
  const distanceShiftBonus = getDistanceShiftScore(horse, race);
  return ability * drawMod + popularity * 0.15 + simWinProxy * 0.35 + paceAdvantage + bodyWeightBonus + distanceShiftBonus;
}

function buildOfficialImpliedProbability(odds) {
  return odds > 0 ? clamp(1 / odds, 0.02, 0.7) : 0;
}

function buildPlaceProbability(winProb, officialImplied) {
  return clamp(winProb * 0.95 + officialImplied * 0.35 + 0.15, 0.1, 0.88);
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

function buildPlaceReturnEdge(placeProb, placeOdds, realOdds) {
  const expectedPlaceReturn = placeProb * placeOdds;
  const rawEdge = clamp((expectedPlaceReturn - 1) / 1.4, 0, 1);
  // Discount for extreme odds: model accuracy degrades for longshots
  const oddsCredibility = clamp(1.2 - realOdds / 40, 0.4, 1.0);
  return rawEdge * oddsCredibility;
}

function buildOverbetLabel(officialImplied, winProb) {
  const gap = officialImplied - winProb;
  if (gap >= 0.12) return "overbet_high";
  if (gap >= 0.06) return "overbet_moderate";
  return null;
}

function buildLongshotBonus(realOdds, placeProb, overbetRisk) {
  if (placeProb < 0.30) return 0;
  const oddsBonus = clamp((realOdds - 5) / 30, 0, 0.6);
  const viableBonus = clamp((placeProb - 0.30) / 0.30, 0, 1);
  return clamp(oddsBonus * 0.5 + viableBonus * 0.3 - overbetRisk * 0.3, 0, 0.6);
}

function buildSelectionReason(kind, entry, gapToRunnerUp) {
  const contributors =
    kind === "win"
      ? [
          { label: "複勝確率", value: entry.placeProb, weight: 0.55 },
          { label: "上位安定度", value: entry.top3Stability, weight: 0.2 },
          { label: "市場支持", value: entry.marketSupport, weight: 0.15 },
          { label: "過熱リスク", value: entry.overbetRisk, weight: -0.1 },
        ]
      : [
          { label: "複勝期待値", value: entry.placeReturnEdge, weight: 0.35 },
          { label: "複勝確率", value: entry.placeProb, weight: 0.5 },
          { label: "人気薄補正", value: entry.longshotBonus, weight: 0.15 },
        ];

  const strongest = contributors
    .map((item) => ({ ...item, contribution: item.value * Math.abs(item.weight) }))
    .sort((left, right) => right.contribution - left.contribution)
    .slice(0, 2)
    .map((item) => `${item.label}${Math.round(item.value * 100)}%`);

  const gapText = Number.isFinite(gapToRunnerUp) && gapToRunnerUp > 0 ? ` 2位差${gapToRunnerUp.toFixed(3)}` : "";
  if (kind === "win") {
    return `${strongest.join("・")}を重視して複勝軸に選出。${gapText}`.trim();
  }
  return `${strongest.join("・")}を重視して妙味候補に選出。${gapText}`.trim();
}

function buildOpponentSelectionReason(entry, gapFromHonmei) {
  const detailParts = [];

  if (Number.isFinite(gapFromHonmei)) {
    detailParts.push(`本命差${gapFromHonmei.toFixed(3)}`);
  }
  if (Number.isFinite(entry.top3Stability)) {
    detailParts.push(`3着内安定度${Math.round(entry.top3Stability * 100)}%`);
  }
  if (Number.isFinite(entry.placeProb)) {
    detailParts.push(`複勝率${Math.round(entry.placeProb * 100)}%`);
  }

  const detailText = detailParts.length > 0 ? `、${detailParts.join(" / ")}を評価して` : "で";
  return `placeScore ${entry.placeScore.toFixed(3)}が本命候補と同じ軸で次点${detailText}相手候補に選出。`;
}

function buildWidePickSelectionReason(entry, gapToRunnerUp) {
  const detailParts = [];

  if (Number.isFinite(entry.placeReturnEdge)) {
    detailParts.push(`複勝寄り期待値${Math.round(entry.placeReturnEdge * 100)}%`);
  }
  if (Number.isFinite(entry.valueScore)) {
    detailParts.push(`valueScore ${entry.valueScore.toFixed(3)}`);
  }
  if (Number.isFinite(entry.placeProb)) {
    detailParts.push(`複勝率${Math.round(entry.placeProb * 100)}%`);
  }
  if (Number.isFinite(gapToRunnerUp) && gapToRunnerUp > 0) {
    detailParts.push(`次点差${gapToRunnerUp.toFixed(3)}`);
  }

  return `本命次点ではなく、${detailParts.join(" / ")}を見てワイド高配当狙いに選出。`;
}

function buildStableOpponentSelectionReason(entry, gapFromHonmei) {
  const detailParts = [];

  if (Number.isFinite(entry.placeProb)) {
    detailParts.push(`placeProb ${Math.round(entry.placeProb * 100)}%`);
  }
  if (Number.isFinite(entry.top3Stability)) {
    detailParts.push(`top3安定 ${Math.round(entry.top3Stability * 100)}%`);
  }
  if (Number.isFinite(entry.placeScore)) {
    detailParts.push(`placeScore ${entry.placeScore.toFixed(3)}`);
  }
  if (Number.isFinite(entry.winProb)) {
    detailParts.push(`simWinProb ${Math.round(entry.winProb * 100)}%`);
  }
  if (Number.isFinite(gapFromHonmei)) {
    detailParts.push(`本命差 ${gapFromHonmei.toFixed(3)}`);
  }

  const detailText = detailParts.length > 0 ? ` (${detailParts.join(" / ")})` : "";
  return `単複本命を除いた中で、placeProb を最優先に top3Stability・placeScore・simWinProb を比較し、安定次点として相手候補に選出${detailText}。`;
}

function buildScoredEntry(horse, race, includeBodyWeight, drawMap) {
  const score = scoreTanpukuHorse(horse, race, includeBodyWeight, drawMap);
  const odds = Number(horse.realOdds ?? 0);
  if (!(odds > 0)) return null;

  const officialImplied = buildOfficialImpliedProbability(odds);
  const winProb = clamp(score / 220, 0.03, 0.7);
  const placeProb = buildPlaceProbability(winProb, officialImplied);
  const placeOdds = Math.max(1.1, odds * 0.35 + 1.0);
  const top3Stability = buildTop3Stability(horse, placeProb, winProb);
  const marketSupport = buildMarketSupport(horse, officialImplied);
  const overbetRisk = buildOverbetRisk(officialImplied, winProb);
  const placeReturnEdge = buildPlaceReturnEdge(placeProb, placeOdds, odds);
  const longshotBonus = buildLongshotBonus(odds, placeProb, overbetRisk);
  const tanRoi = winProb * odds * 100;
  const fukuRoi = placeProb * placeOdds * 100;
  const placeScore = clamp(
    0.55 * placeProb + 0.2 * top3Stability + 0.15 * marketSupport - 0.1 * overbetRisk,
    0,
    1
  );
  const valueScore = clamp(0.55 * placeProb + 0.35 * placeReturnEdge + 0.10 * longshotBonus, 0, 1);

  return {
    horse,
    score,
    odds,
    officialImplied,
    winProb,
    placeProb,
    placeOdds,
    top3Stability,
    marketSupport,
    overbetRisk,
    placeReturnEdge,
    longshotBonus,
    placeScore,
    valueScore,
    tanRoi,
    fukuRoi,
    overbetLabel: buildOverbetLabel(officialImplied, winProb),
  };
}

export function pickTanpukuPair(race, includeBodyWeight = false, applyDraw = true) {
  const drawMap = buildDrawTacticalMap(race, applyDraw);
  const scored = race.horses
    .map((horse) => buildScoredEntry(horse, race, includeBodyWeight, drawMap))
    .filter(Boolean);

  if (scored.length === 0) return null;

  const VALUE_MIN_PLACE_PROB = 0.25;
  const VALUE_MIN_TOP3_STABILITY = 0.12;

  const eligibleScored = scored.filter((entry) => !isScratchedHorse(entry.horse));
  const placeSorted = [...eligibleScored].sort(comparePlaceEntries);

  if (placeSorted.length === 0) return null;

  const winPickBase = placeSorted[0];
  const winRunnerUp = placeSorted.find((entry) => entry.horse.id !== winPickBase.horse.id) ?? null;
  const opponentResult = pickOpponentEntry(eligibleScored, winPickBase.horse.id);
  const opponentBase = opponentResult.entry;
  const excludedWideIds = new Set([winPickBase.horse.id, winRunnerUp?.horse.id].filter(Boolean));

  // Quality gate: filter wide longshot candidates with minimum viability
  const valueCandidates = eligibleScored.filter(
    (entry) =>
      !excludedWideIds.has(entry.horse.id) &&
      entry.placeProb >= VALUE_MIN_PLACE_PROB &&
      entry.top3Stability >= VALUE_MIN_TOP3_STABILITY &&
      entry.overbetLabel !== "overbet_high"
  );
  const valueSorted = [...valueCandidates].sort(compareValueEntries);

  const valuePickBase = valueSorted[0] ?? null;
  const valueRunnerUp = valuePickBase
    ? valueSorted.find((entry) => entry.horse.id !== valuePickBase.horse.id) ?? null
    : null;

  const winPick = {
    ...winPickBase,
    scoreGap: round3(winPickBase.placeScore - (winRunnerUp?.placeScore ?? 0)),
    selectionReason: buildSelectionReason("win", winPickBase, winPickBase.placeScore - (winRunnerUp?.placeScore ?? 0)),
  };
  const widePick = valuePickBase
    ? {
        ...valuePickBase,
        scoreGap: round3(valuePickBase.valueScore - (valueRunnerUp?.valueScore ?? 0)),
        selectionReason: buildWidePickSelectionReason(valuePickBase, valuePickBase.valueScore - (valueRunnerUp?.valueScore ?? 0)),
      }
    : null;
  const opponentPick = opponentBase
    ? {
        ...opponentBase,
        scoreGap: round3(winPickBase.placeScore - opponentBase.placeScore),
        selectionReason: buildStableOpponentSelectionReason(opponentBase, winPickBase.placeScore - opponentBase.placeScore),
      }
    : null;

  const enrichedScored = scored.map((entry) => ({
    ...entry,
    placeScore: round3(entry.placeScore),
    valueScore: round3(entry.valueScore),
    placeProb: round3(entry.placeProb),
    winProb: round3(entry.winProb),
    placeOdds: round1(entry.placeOdds),
    tanRoi: round1(entry.tanRoi),
    fukuRoi: round1(entry.fukuRoi),
    top3Stability: round3(entry.top3Stability),
    marketSupport: round3(entry.marketSupport),
    overbetRisk: round3(entry.overbetRisk),
    placeReturnEdge: round3(entry.placeReturnEdge),
    longshotBonus: round3(entry.longshotBonus),
    overbetLabel: entry.overbetLabel,
  }));

  const overbetEntries = enrichedScored.filter((e) => e.overbetLabel);
  const marketHeatSummary = {
    honmeiOverbetLabel: winPickBase.overbetLabel,
    overbetHorseCount: overbetEntries.length,
    maxOverbetGap: round3(Math.max(0, ...scored.map((e) => e.officialImplied - e.winProb))),
  };

  const winRunnerUpEnriched = winRunnerUp
    ? {
        horseId: winRunnerUp.horse.id,
        horseName: winRunnerUp.horse.name,
        placeScore: round3(winRunnerUp.placeScore),
        valueScore: round3(winRunnerUp.valueScore),
        placeProb: round3(winRunnerUp.placeProb),
        winProb: round3(winRunnerUp.winProb),
        top3Stability: round3(winRunnerUp.top3Stability),
        marketSupport: round3(winRunnerUp.marketSupport),
        overbetRisk: round3(winRunnerUp.overbetRisk),
      }
    : null;

  const valueRunnerUpEnriched = valueRunnerUp
    ? {
        horseId: valueRunnerUp.horse.id,
        horseName: valueRunnerUp.horse.name,
        placeScore: round3(valueRunnerUp.placeScore),
        valueScore: round3(valueRunnerUp.valueScore),
        placeProb: round3(valueRunnerUp.placeProb),
        placeReturnEdge: round3(valueRunnerUp.placeReturnEdge),
        longshotBonus: round3(valueRunnerUp.longshotBonus),
      }
    : null;

  const valueCandidateCount = valueCandidates.length;

  return {
    scoringVersion: TANPUKU_SCORING_VERSION,
    scored: enrichedScored,
    marketHeatSummary,
    valueCandidateCount,
    winRunnerUp: winRunnerUpEnriched,
    valueRunnerUp: valueRunnerUpEnriched,
    opponentPick: opponentPick
      ? {
          ...opponentPick,
          placeScore: round3(opponentPick.placeScore),
          valueScore: round3(opponentPick.valueScore),
          placeProb: round3(opponentPick.placeProb),
          winProb: round3(opponentPick.winProb),
          placeOdds: round1(opponentPick.placeOdds),
          tanRoi: round1(opponentPick.tanRoi),
          fukuRoi: round1(opponentPick.fukuRoi),
          top3Stability: round3(opponentPick.top3Stability),
          marketSupport: round3(opponentPick.marketSupport),
          overbetRisk: round3(opponentPick.overbetRisk),
          placeReturnEdge: round3(opponentPick.placeReturnEdge),
          longshotBonus: round3(opponentPick.longshotBonus),
        }
      : null,
    widePick: widePick
      ? {
          ...widePick,
          placeScore: round3(widePick.placeScore),
          valueScore: round3(widePick.valueScore),
          placeProb: round3(widePick.placeProb),
          winProb: round3(widePick.winProb),
          placeOdds: round1(widePick.placeOdds),
          tanRoi: round1(widePick.tanRoi),
          fukuRoi: round1(widePick.fukuRoi),
          top3Stability: round3(widePick.top3Stability),
          marketSupport: round3(widePick.marketSupport),
          overbetRisk: round3(widePick.overbetRisk),
          placeReturnEdge: round3(widePick.placeReturnEdge),
          longshotBonus: round3(widePick.longshotBonus),
        }
      : null,
    winPick: {
      ...winPick,
      placeScore: round3(winPick.placeScore),
      valueScore: round3(winPick.valueScore),
      placeProb: round3(winPick.placeProb),
      winProb: round3(winPick.winProb),
      placeOdds: round1(winPick.placeOdds),
      tanRoi: round1(winPick.tanRoi),
      fukuRoi: round1(winPick.fukuRoi),
      top3Stability: round3(winPick.top3Stability),
      marketSupport: round3(winPick.marketSupport),
      overbetRisk: round3(winPick.overbetRisk),
      placeReturnEdge: round3(winPick.placeReturnEdge),
      longshotBonus: round3(winPick.longshotBonus),
    },
    valuePick: widePick
      ? {
          ...widePick,
          placeScore: round3(widePick.placeScore),
          valueScore: round3(widePick.valueScore),
          placeProb: round3(widePick.placeProb),
          winProb: round3(widePick.winProb),
          placeOdds: round1(widePick.placeOdds),
          tanRoi: round1(widePick.tanRoi),
          fukuRoi: round1(widePick.fukuRoi),
          top3Stability: round3(widePick.top3Stability),
          marketSupport: round3(widePick.marketSupport),
          overbetRisk: round3(widePick.overbetRisk),
          placeReturnEdge: round3(widePick.placeReturnEdge),
          longshotBonus: round3(widePick.longshotBonus),
        }
      : null,
  };
}
