/**
 * Structured X post payload builders.
 *
 * Post types:
 *   pre_race       — レース前予想 (tanpuku honmei 主役)
 *   review         — レース後結果振り返り
 *   weekly_summary — 週間成績まとめ
 */

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function pct(v) {
  return (v * 100).toFixed(0);
}

function pct1(v) {
  return v.toFixed(1);
}

function findMarketFavorite(race) {
  return [...race.horses]
    .filter((h) => Number(h.realOdds) > 0)
    .sort((a, b) => Number(a.realOdds) - Number(b.realOdds))[0] ?? null;
}

function buildDisagreementReason(tanpukuPair, simHorseId) {
  if (!simHorseId) return "";
  const simEntry = tanpukuPair.scored.find((e) => e.horse.id === simHorseId);
  const winEntry = tanpukuPair.scored.find((e) => e.horse.id === tanpukuPair.winPick.horse.id);
  if (!simEntry || !winEntry) return "複勝軸スコアが上回ったため単複本命に採用";

  if (simEntry.overbetRisk - winEntry.overbetRisk > 0.15) {
    return "シミュ1位は市場過熱気味のため、単複本命は過熱リスクの低い馬を採用";
  }
  if (winEntry.top3Stability - simEntry.top3Stability > 0.05) {
    return "シミュ1位は勝率寄りだが、単複本命は3着内安定度を重視";
  }
  return "複勝軸スコア(placeScore)が上回ったため単複本命に採用";
}

// ---------------------------------------------------------------------------
// pre_race
// ---------------------------------------------------------------------------

export function buildPreRacePostPayload({ day, race, tanpukuPair, simBestHorse }) {
  const winPick = tanpukuPair.winPick;
  const valuePick = tanpukuPair.valuePick;
  const scoringVersion = tanpukuPair.scoringVersion;

  const simHonmeiId = simBestHorse?.horse?.id ?? null;
  const simHonmeiName = simBestHorse?.horse?.name ?? null;
  const agreementStatus = simHonmeiId === winPick.horse.id ? "agree" : "disagree";

  const marketFav = findMarketFavorite(race);
  const selectionComment =
    agreementStatus === "disagree" ? buildDisagreementReason(tanpukuPair, simHonmeiId) : "";

  // --- render text ---
  const lines = [`${race.label}`];
  lines.push(
    `▶本命: ${winPick.horse.name}(複勝率${pct(winPick.placeProb)}% 軸${winPick.placeScore.toFixed(3)})`
  );

  if (agreementStatus === "disagree" && simHonmeiName) {
    lines.push(`※シミュ1位: ${simHonmeiName}`);
    if (selectionComment) lines.push(selectionComment);
  }

  if (valuePick) {
    lines.push(
      `▶妙味: ${valuePick.horse.name}(${Number(valuePick.horse.realOdds).toFixed(1)}倍 複回収${valuePick.fukuRoi.toFixed(0)}%)`
    );
  }

  // Market favorite warning: show only when different from both picks and overbet
  if (
    marketFav &&
    marketFav.id !== winPick.horse.id &&
    (!valuePick || marketFav.id !== valuePick.horse.id)
  ) {
    const mfLabel = tanpukuPair.scored.find((e) => e.horse.id === marketFav.id)?.overbetLabel;
    if (mfLabel) {
      lines.push(`※1番人気${marketFav.name}は過熱気味`);
    }
  }

  return {
    postType: "pre_race",
    raceId: String(race.raceId ?? race.courseId ?? ""),
    raceName: race.label,
    tanpukuHonmei: {
      horseId: winPick.horse.id,
      horseName: winPick.horse.name,
      placeProb: winPick.placeProb,
      placeScore: winPick.placeScore,
    },
    simHonmei: simHonmeiId ? { horseId: simHonmeiId, horseName: simHonmeiName } : null,
    valueCandidate: valuePick
      ? {
          horseId: valuePick.horse.id,
          horseName: valuePick.horse.name,
          odds: Number(valuePick.horse.realOdds),
        }
      : null,
    marketFavorite: marketFav
      ? { horseId: marketFav.id, horseName: marketFav.name, odds: Number(marketFav.realOdds) }
      : null,
    agreementStatus,
    selectionComment,
    resultComment: null,
    scoringVersion,
    text: lines.join("\n"),
  };
}

// ---------------------------------------------------------------------------
// review
// ---------------------------------------------------------------------------

export function buildReviewPostPayload({ race, winRec, simBestHorseId }) {
  const result = race.result;
  if (!result) return null;

  const winnerName = result.winnerHorseName ?? "?";
  const top3Names = (result.finishers ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .slice(0, 3)
    .map((f) => f.name ?? "?");
  const top3Ids = (result.top3HorseIds ?? []).map((id) => String(id));

  const tanpukuHorseId = winRec ? String(winRec.horseId) : null;
  const tanpukuHorseName = winRec ? String(winRec.horseName) : null;
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
    resultComment = tanpukuHit ? "一致で的中" : "一致で外れ";
  } else if (agreementStatus === "disagree") {
    if (tanpukuHit && !simHit) resultComment = "不一致 → 単複本命が的中(シミュ外れ)";
    else if (!tanpukuHit && simHit) resultComment = "不一致 → シミュ本命が的中(単複外れ)";
    else if (tanpukuHit && simHit) resultComment = "不一致だが両方的中";
    else resultComment = "不一致で両方外れ";
  }

  const lines = [`${race.label} 結果`];
  lines.push(`着順: ${top3Names.join(" → ")}`);

  if (tanpukuHorseName) {
    const mark = tanpukuHit ? "✅的中" : "❌";
    lines.push(`▶本命: ${tanpukuHorseName} → ${mark}`);
  }

  if (resultComment) lines.push(resultComment);

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
    text: lines.join("\n"),
  };
}

// ---------------------------------------------------------------------------
// weekly_summary
// ---------------------------------------------------------------------------

export function buildWeeklySummaryPostPayload({ weeklyPerf, recs, weekOf }) {
  const settled = recs.filter((r) => r.weekOf === weekOf && r.resolved);
  const winRecs = settled.filter((r) => r.pickType === "win");
  const valueRecs = settled.filter((r) => r.pickType === "value");
  const bets = winRecs.length;

  const fukuHits = winRecs.filter((r) => r.fukuOutcome === "hit").length;
  const fukuHitRate = bets > 0 ? (fukuHits / bets) * 100 : 0;
  const fukuPayout = winRecs.reduce((s, r) => s + (r.fukuPayout ?? 0), 0);
  const fukuRoi = bets > 0 ? (fukuPayout / (bets * 100)) * 100 : 0;

  const valueBets = valueRecs.length;
  const valueFukuHits = valueRecs.filter((r) => r.fukuOutcome === "hit").length;
  const valueFukuRate = valueBets > 0 ? (valueFukuHits / valueBets) * 100 : 0;

  const lines = [`今週の単複成績(${bets}R)`];
  lines.push(`▶本命 複勝率${pct1(fukuHitRate)}% 複回収${pct1(fukuRoi)}%`);

  if (valueBets > 0) {
    lines.push(`▶妙味 複勝率${pct1(valueFukuRate)}%(${valueBets}R)`);
  }

  // Simple weekly summary from weeklyPerf if available
  if (weeklyPerf) {
    const tanHitRate = weeklyPerf.bets > 0 ? (weeklyPerf.tanHits / weeklyPerf.bets) * 100 : 0;
    const tanRoi = weeklyPerf.tanStake > 0 ? (weeklyPerf.tanPayout / weeklyPerf.tanStake) * 100 : 0;
    lines.push(`▶単勝 的中率${pct1(tanHitRate)}% 回収${pct1(tanRoi)}%`);
  }

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
    text: lines.join("\n"),
  };
}
