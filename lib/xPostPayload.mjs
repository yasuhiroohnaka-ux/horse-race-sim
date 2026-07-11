/**
 * Structured X post payload builders.
 */

import { formatCategoryReturnStatsForX } from "./categoryReturnStats.mjs";
import { buildRecommendedBetDecision } from "./recommendedBetDecisionCore.mjs";
import { buildRaceHashtag, cleanName, cleanXText } from "./xTagSanitize.mjs";

const X_POST_LIMIT = 140;
const X_NAME_LIMIT_STEPS = [null, 18, 14, 12, 10, 8, 6];

function pct(v) {
  const value = Math.abs(Number(v ?? 0)) <= 1 ? Number(v ?? 0) * 100 : Number(v ?? 0);
  return Number.isFinite(value) ? value.toFixed(0) : "0";
}

function pct1(v) {
  const value = Number(v ?? 0);
  return Number.isFinite(value) ? value.toFixed(1) : "0.0";
}

function countTextChars(text) {
  return [...String(text ?? "")].length;
}

function trimDisplayName(value, maxChars = null) {
  const cleaned = cleanName(value);
  if (!cleaned || maxChars === null || !Number.isFinite(maxChars)) return cleaned;
  const chars = [...cleaned];
  if (chars.length <= maxChars) return cleaned;
  return `${chars.slice(0, Math.max(1, maxChars - 1)).join("")}…`;
}

function normalizeHorseKey(value) {
  return cleanName(value).toLowerCase();
}

// 決定ロジックは lib/recommendedBetDecisionCore.mjs の単一実装を使う (旧・生値閾値の複製は撤去済み)

function findMarketFavorite(race) {
  return [...(race?.horses ?? [])]
    .filter((horse) => Number(horse?.realOdds) > 0)
    .sort((a, b) => Number(a.realOdds) - Number(b.realOdds))[0] ?? null;
}

function buildDisagreementReason(tanpukuPair, simHorseId) {
  if (!simHorseId) return "";
  const simEntry = tanpukuPair?.scored?.find((entry) => entry.horse.id === simHorseId) ?? null;
  const winEntry = tanpukuPair?.winPick ?? null;
  if (!simEntry || !winEntry) return "シミュ1位は別馬";

  if (Number(simEntry.overbetRisk ?? 0) - Number(winEntry.overbetRisk ?? 0) > 0.15) {
    return "シミュ1位は過剰人気寄り";
  }
  if (Number(winEntry.top3Stability ?? 0) - Number(simEntry.top3Stability ?? 0) > 0.05) {
    return "本命は安定度を優先";
  }
  if (Number(winEntry.placeScore ?? 0) - Number(simEntry.placeScore ?? 0) > 0.02) {
    return "本命は軸評価を優先";
  }

  return "シミュ1位は別馬";
}

function buildShortPreRaceText({
  raceName,
  hashtag,
  winName,
  opponentName,
  wideName,
  simTopName,
}) {
  const normalizedWin = cleanName(winName);
  const normalizedOpponent = cleanName(opponentName);
  const normalizedWide = cleanName(wideName);
  const normalizedSimTop = cleanName(simTopName);
  const distinctSimTop =
    normalizedSimTop &&
    ![normalizedWin, normalizedOpponent, normalizedWide].filter(Boolean).includes(normalizedSimTop);

  const attempts = [];
  if (normalizedSimTop) {
    attempts.push({ includeNote: true, includeStar: Boolean(distinctSimTop) });
    attempts.push({ includeNote: false, includeStar: Boolean(distinctSimTop) });
  }
  attempts.push({ includeNote: false, includeStar: false });

  for (const attempt of attempts) {
    for (const maxNameLength of X_NAME_LIMIT_STEPS) {
      const lines = [
        buildRaceHashtag(raceName, hashtag),
        "AI予想",
        normalizedWin ? `◎${trimDisplayName(normalizedWin, maxNameLength)}` : null,
        normalizedOpponent ? `○${trimDisplayName(normalizedOpponent, maxNameLength)}` : null,
        normalizedWide ? `△${trimDisplayName(normalizedWide, maxNameLength)}` : null,
        attempt.includeStar && normalizedSimTop ? `☆${trimDisplayName(normalizedSimTop, maxNameLength)}` : null,
        attempt.includeNote ? "※シミュ1位" : null,
      ].filter(Boolean);

      const text = lines.join("\n");
      if (countTextChars(text) <= X_POST_LIMIT) {
        return {
          text,
          textLength: countTextChars(text),
          includeStar: Boolean(attempt.includeStar && normalizedSimTop),
          includeNote: attempt.includeNote,
        };
      }
    }
  }

  const fallback = [
    buildRaceHashtag(raceName, hashtag),
    "AI予想",
    normalizedWin ? `◎${trimDisplayName(normalizedWin, 6)}` : null,
    normalizedOpponent ? `○${trimDisplayName(normalizedOpponent, 6)}` : null,
    normalizedWide ? `△${trimDisplayName(normalizedWide, 6)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    text: fallback,
    textLength: countTextChars(fallback),
    includeStar: false,
    includeNote: false,
  };
}

export function buildPreRacePostPayload({ day, race, tanpukuPair, simBestHorse }) {
  const winPick = tanpukuPair.winPick;
  const opponentPick = tanpukuPair.opponentPick;
  const widePick = tanpukuPair.widePick ?? tanpukuPair.valuePick;
  const scoringVersion = tanpukuPair.scoringVersion;

  const simHonmeiId = simBestHorse?.horse?.id ?? null;
  const simHonmeiName = simBestHorse?.horse?.name ?? null;
  const agreementStatus = simHonmeiId === winPick.horse.id ? "agree" : "disagree";
  const marketFav = findMarketFavorite(race);
  const selectionComment =
    agreementStatus === "disagree" ? buildDisagreementReason(tanpukuPair, simHonmeiId) : "";
  const textResult = buildShortPreRaceText({
    raceName: race?.label,
    hashtag: race?.hashtag ?? null,
    winName: winPick?.horse?.name,
    opponentName: opponentPick?.horse?.name ?? null,
    wideName: widePick?.horse?.name ?? null,
    simTopName: simHonmeiName,
  });

  return {
    postType: "pre_race",
    raceId: String(race.raceId ?? race.courseId ?? ""),
    raceName: race.label,
    tanpukuHonmei: {
      horseId: winPick.horse.id,
      horseName: winPick.horse.name,
      placeProb: winPick.placeProb,
      placeScore: winPick.placeScore,
      classificationHint: winPick.classificationHint ?? null,
      recommendedBetAction:
        winPick.recommendedBetDecision?.action ??
        buildRecommendedBetDecision({
          sourceStatus: "live_pre_race",
          livePreRaceEligible: true,
          classificationHint: winPick.classificationHint,
          oddsSource: winPick.horse?.oddsSource ?? null,
          scoreGap: winPick.scoreGap,
          placeProb: winPick.placeProb,
          top3Stability: winPick.top3Stability,
          fieldSize: race.horses?.length ?? null,
          engineAgreement: simHonmeiId ? simHonmeiId === winPick.horse.id : null,
          overbetLabel: winPick.overbetLabel ?? null,
          hasSelectionLog: false,
        }).action,
      recommendedBetDecision:
        winPick.recommendedBetDecision ??
        buildRecommendedBetDecision({
          sourceStatus: "live_pre_race",
          livePreRaceEligible: true,
          classificationHint: winPick.classificationHint,
          oddsSource: winPick.horse?.oddsSource ?? null,
          scoreGap: winPick.scoreGap,
          placeProb: winPick.placeProb,
          top3Stability: winPick.top3Stability,
          fieldSize: race.horses?.length ?? null,
          engineAgreement: simHonmeiId ? simHonmeiId === winPick.horse.id : null,
          overbetLabel: winPick.overbetLabel ?? null,
          hasSelectionLog: false,
        }),
    },
    opponentCandidate: opponentPick
      ? {
          horseId: opponentPick.horse.id,
          horseName: opponentPick.horse.name,
          placeProb: opponentPick.placeProb,
          placeScore: opponentPick.placeScore,
        }
      : null,
    simHonmei: simHonmeiId ? { horseId: simHonmeiId, horseName: simHonmeiName } : null,
    wideLongshot: widePick
      ? {
          horseId: widePick.horse.id,
          horseName: widePick.horse.name,
          odds: Number(widePick.horse.realOdds),
        }
      : null,
    valueCandidate: widePick
      ? {
          horseId: widePick.horse.id,
          horseName: widePick.horse.name,
          odds: Number(widePick.horse.realOdds),
        }
      : null,
    marketFavorite: marketFav
      ? { horseId: marketFav.id, horseName: marketFav.name, odds: Number(marketFav.realOdds) }
      : null,
    agreementStatus,
    selectionComment,
    resultComment: null,
    scoringVersion,
    text: textResult.text,
    textLength: textResult.textLength,
    encodedText: encodeURIComponent(textResult.text),
  };
}

export function buildReviewPostPayload({ race, winRec, simBestHorseId }) {
  const result = race.result;
  if (!result) return null;

  const top3Names = (result.finishers ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .slice(0, 3)
    .map((finisher) => cleanName(finisher.name) || "?");
  const top3Ids = (result.top3HorseIds ?? []).map((id) => String(id));

  const tanpukuHorseId = winRec ? String(winRec.horseId) : null;
  const tanpukuHorseName = winRec ? cleanName(winRec.horseName) : null;
  const tanpukuHit = tanpukuHorseId ? top3Ids.includes(tanpukuHorseId) : null;

  const simHit = simBestHorseId ? top3Ids.includes(String(simBestHorseId)) : null;
  const agreementStatus =
    tanpukuHorseId && simBestHorseId
      ? tanpukuHorseId === String(simBestHorseId)
        ? "agree"
        : "disagree"
      : "unknown";

  let resultComment = "";
  if (agreementStatus === "agree") {
    resultComment = tanpukuHit ? "シミュと本命は一致して好走" : "シミュと本命は一致したが凡走";
  } else if (agreementStatus === "disagree") {
    if (tanpukuHit && !simHit) resultComment = "本命は好走、シミュ1位は凡走";
    else if (!tanpukuHit && simHit) resultComment = "シミュ1位は好走、本命は凡走";
    else if (tanpukuHit && simHit) resultComment = "本命とシミュ1位はどちらも好走";
    else resultComment = "本命とシミュ1位はどちらも凡走";
  }

  const lines = [`${cleanName(race.label) || "レース"} 回顧`, `1-3着 ${top3Names.join(" / ")}`];
  if (tanpukuHorseName) {
    lines.push(`本命 ${tanpukuHorseName} ${tanpukuHit ? "好走" : "凡走"}`);
  }
  // 分類→結果の突き合わせ (予測時の型が結果とどう噛み合ったかを開示する)
  const reviewClassification = winRec?.classificationHint?.classification ?? null;
  if (reviewClassification && tanpukuHit !== null) {
    const classLabel =
      reviewClassification === "win" ? "単勝勝負型" : reviewClassification === "place" ? "複勝軸型" : "見送り";
    const outcome =
      reviewClassification === "skip"
        ? `見送り (候補は${tanpukuHit ? "3着内" : "圏外"})`
        : tanpukuHit
          ? "3着内"
          : "圏外";
    lines.push(`分類: ${classLabel} → ${outcome}`);
  }
  if (resultComment) lines.push(resultComment);

  lines.push(`${buildRaceHashtag(race.label, race.hashtag ?? null)} #AI予想`);

  const text = lines.join("\n");
  return {
    postType: "review",
    raceId: String(race.raceId ?? race.courseId ?? ""),
    raceName: race.label,
    tanpukuHonmei: tanpukuHorseId
      ? { horseId: tanpukuHorseId, horseName: tanpukuHorseName }
      : null,
    simHonmei: simBestHorseId ? { horseId: String(simBestHorseId) } : null,
    valueCandidate: null,
    marketFavorite: null,
    agreementStatus,
    selectionComment: null,
    resultComment,
    scoringVersion: winRec?.scoringVersion ?? null,
    text,
    textLength: countTextChars(text),
    encodedText: encodeURIComponent(text),
  };
}

export function buildWeeklySummaryPostPayload({ weeklyPerf, recs, weekOf, categoryReturnStats = [] }) {
  const settled = recs.filter((record) => record.weekOf === weekOf && record.resolved);
  const winRecs = settled.filter((record) => record.pickType === "win");
  const valueRecs = settled.filter((record) => record.pickType === "value");
  const bets = winRecs.length;

  const fukuHits = winRecs.filter((record) => record.fukuOutcome === "hit").length;
  const fukuHitRate = bets > 0 ? (fukuHits / bets) * 100 : 0;
  const fukuPayout = winRecs.reduce((sum, record) => sum + (record.fukuPayout ?? 0), 0);
  const fukuRoi = bets > 0 ? (fukuPayout / (bets * 100)) * 100 : 0;

  const valueBets = valueRecs.length;
  const valueFukuHits = valueRecs.filter((record) => record.fukuOutcome === "hit").length;
  const valueFukuRate = valueBets > 0 ? (valueFukuHits / valueBets) * 100 : 0;

  const classificationOf = (record) => record.classificationHint?.classification ?? null;
  const placeRecs = winRecs.filter((record) => classificationOf(record) === "place");
  const winClassRecs = winRecs.filter((record) => classificationOf(record) === "win");
  const skipRecs = winRecs.filter((record) => classificationOf(record) === "skip");
  const placeFukuHits = placeRecs.filter((record) => record.fukuOutcome === "hit").length;

  const lines = [`週間まとめ ${bets}R`, `本命 複勝率${pct1(fukuHitRate)}% 複回収${pct1(fukuRoi)}%`];
  if (placeRecs.length + winClassRecs.length + skipRecs.length > 0) {
    lines.push(
      `内訳: 複勝軸${placeRecs.length}R(複${placeFukuHits}) / 単勝型${winClassRecs.length}R / 見送り${skipRecs.length}R`
    );
  }
  if (valueBets > 0) {
    lines.push(`ワイド高配当狙い 複勝率${pct1(valueFukuRate)}%`);
  }
  if (weeklyPerf) {
    const tanHitRate = weeklyPerf.bets > 0 ? (weeklyPerf.tanHits / weeklyPerf.bets) * 100 : 0;
    const tanRoi = weeklyPerf.tanStake > 0 ? (weeklyPerf.tanPayout / weeklyPerf.tanStake) * 100 : 0;
    lines.push(`単勝 的中率${pct1(tanHitRate)}% 回収${pct1(tanRoi)}%`);
  }
  if (categoryReturnStats.length > 0) {
    lines.push(formatCategoryReturnStatsForX(categoryReturnStats));
  }

  const text = lines.join("\n");
  return {
    postType: "weekly_summary",
    raceId: null,
    raceName: null,
    tanpukuHonmei: null,
    simHonmei: null,
    valueCandidate: null,
    marketFavorite: null,
    agreementStatus: null,
    selectionComment: null,
    resultComment: null,
    scoringVersion: null,
    categoryReturnStats,
    text,
    textLength: countTextChars(text),
    encodedText: encodeURIComponent(text),
  };
}

export function buildManualPreRacePayload({
  raceName,
  hashtag,
  tanpukuPair,
  simBest,
  selectionComment,
}) {
  const winPick = tanpukuPair.winPick;
  const opponentPick = tanpukuPair.opponentPick;
  const widePick = tanpukuPair.widePick ?? tanpukuPair.valuePick;
  const scoringVersion = tanpukuPair.scoringVersion;

  const simHorseId = simBest?.horseId ?? null;
  const simHorseName = simBest?.horseName ?? null;
  const agreementStatus =
    simHorseId && winPick ? (simHorseId === winPick.horse.id ? "agree" : "disagree") : "unknown";
  const marketFav = findMarketFavorite({ horses: (tanpukuPair.scored ?? []).map((entry) => entry.horse) });
  const textResult = buildShortPreRaceText({
    raceName: raceName || hashtag,
    hashtag: hashtag || null,
    winName: winPick?.horse?.name,
    opponentName: opponentPick?.horse?.name ?? null,
    wideName: widePick?.horse?.name ?? null,
    simTopName: simHorseName,
  });

  return {
    postType: "pre_race",
    raceId: null,
    raceName,
    tanpukuHonmei: {
      horseId: winPick.horse.id,
      horseName: winPick.horse.name,
      placeProb: winPick.placeProb,
      placeScore: winPick.placeScore,
    },
    opponentCandidate: opponentPick
      ? {
          horseId: opponentPick.horse.id,
          horseName: opponentPick.horse.name,
          placeProb: opponentPick.placeProb,
          placeScore: opponentPick.placeScore,
        }
      : null,
    simHonmei: simHorseId ? { horseId: simHorseId, horseName: simHorseName } : null,
    wideLongshot: widePick
      ? {
          horseId: widePick.horse.id,
          horseName: widePick.horse.name,
          odds: Number(widePick.horse.realOdds),
        }
      : null,
    valueCandidate: widePick
      ? {
          horseId: widePick.horse.id,
          horseName: widePick.horse.name,
          odds: Number(widePick.horse.realOdds),
        }
      : null,
    marketFavorite: marketFav
      ? { horseId: marketFav.id, horseName: marketFav.name, odds: Number(marketFav.realOdds) }
      : null,
    agreementStatus,
    selectionComment: selectionComment || null,
    resultComment: null,
    scoringVersion,
    text: textResult.text,
    textLength: textResult.textLength,
    encodedText: encodeURIComponent(textResult.text),
  };
}

export function buildManualReviewPayload({
  raceName,
  race,
  settlement,
  snapshot,
  agreementExplanation,
  disagreementExplanation,
  raceSegment = null,
  missTags = [],
  primaryMissTag = null,
}) {
  const result = race.result;
  if (!result) return null;

  const top3Names = (result.finishers ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .slice(0, 3)
    .map((finisher) => cleanName(finisher.name) || "?");
  const top3Ids = (result.top3HorseIds ?? []).map((id) => String(id));

  const winRec = settlement?.win ?? null;
  const valueRec = settlement?.value ?? null;
  const tanpukuHorseId = winRec ? String(winRec.horseId) : null;
  const tanpukuHorseName = winRec ? cleanName(winRec.horseName) : null;
  const tanpukuHit = tanpukuHorseId ? top3Ids.includes(tanpukuHorseId) : null;

  const snapshotHorseId = snapshot?.honmeiHorseId ? String(snapshot.honmeiHorseId) : null;
  const simHorseName = snapshotHorseId
    ? cleanName(snapshot?.rankedRows?.find((row) => row.horseId === snapshotHorseId)?.horseName ?? snapshotHorseId)
    : null;
  const simHit = snapshotHorseId ? top3Ids.includes(snapshotHorseId) : null;
  const agreementStatus =
    tanpukuHorseId && snapshotHorseId
      ? tanpukuHorseId === snapshotHorseId
        ? "agree"
        : "disagree"
      : "unknown";

  let resultComment = "";
  if (agreementStatus === "agree") {
    resultComment = tanpukuHit ? "本命とシミュは一致して好走" : "本命とシミュは一致したが凡走";
  } else if (agreementStatus === "disagree") {
    if (tanpukuHit && !simHit) resultComment = "本命は好走、シミュ1位は凡走";
    else if (!tanpukuHit && simHit) resultComment = "シミュ1位は好走、本命は凡走";
    else if (tanpukuHit && simHit) resultComment = "本命とシミュ1位はどちらも好走";
    else resultComment = "本命とシミュ1位はどちらも凡走";
  }

  const lines = [`${cleanName(raceName) || "レース"} 回顧`, `1-3着 ${top3Names.join(" / ")}`];
  if (tanpukuHorseName) {
    lines.push(`本命 ${tanpukuHorseName} ${tanpukuHit ? "好走" : "凡走"}`);
  }
  if (snapshotHorseId && agreementStatus === "disagree" && simHorseName) {
    lines.push(`シミュ1位 ${simHorseName} ${simHit ? "好走" : "凡走"}`);
  }
  if (resultComment) lines.push(resultComment);
  if (disagreementExplanation) {
    lines.push(cleanXText(disagreementExplanation));
  } else if (agreementExplanation) {
    lines.push(cleanXText(agreementExplanation));
  }
  if (valueRec) {
    const valueHit = top3Ids.includes(String(valueRec.horseId));
    lines.push(`ワイド高配当狙い ${cleanName(valueRec.horseName)} ${valueHit ? "好走" : "凡走"}`);
  }
  if (missTags.length > 0) {
    lines.push(`missTags: ${missTags.join(", ")}`);
  }

  const text = lines.join("\n");
  return {
    postType: "review",
    raceId: String(race.raceId ?? race.courseId ?? ""),
    raceName,
    tanpukuHonmei: tanpukuHorseId
      ? { horseId: tanpukuHorseId, horseName: tanpukuHorseName }
      : null,
    simHonmei: snapshotHorseId ? { horseId: snapshotHorseId } : null,
    opponentCandidate: null,
    wideLongshot: valueRec
      ? { horseId: valueRec.horseId, horseName: cleanName(valueRec.horseName) }
      : null,
    valueCandidate: valueRec
      ? { horseId: valueRec.horseId, horseName: cleanName(valueRec.horseName) }
      : null,
    marketFavorite: null,
    agreementStatus,
    selectionComment: disagreementExplanation || agreementExplanation || null,
    resultComment,
    raceSegment,
    primaryMissTag,
    missTags,
    scoringVersion: null,
    text,
    textLength: countTextChars(text),
    encodedText: encodeURIComponent(text),
  };
}
