import type { Course } from "./types";
import type { RaceAnalysisRow } from "./raceAnalysis";

export type ExpectationGrade = "S" | "A" | "B" | "C";

export type BettingPickEntry = {
  horse?: {
    id?: string | number;
    name?: string | null;
  } | null;
  odds?: number | null;
  placeOdds?: number | null;
  winProb?: number | null;
  placeProb?: number | null;
  placeScore?: number | null;
  valueScore?: number | null;
  top3Stability?: number | null;
  overbetRisk?: number | null;
  scoreGap?: number | null;
  overbetLabel?: string | null;
  classificationHint?: {
    classification?: "win" | "place" | "skip" | string;
    confidence?: number;
    reason?: string | null;
  } | null;
};

export type BettingExpectationView = {
  simulationLeader: {
    horseName: string;
    rank: number;
    bettingGrade: ExpectationGrade;
    reasons: string[];
  };
  tanpukuHonmei: {
    horseName: string;
    rank: number | null;
    expectationGrade: ExpectationGrade;
    reasons: string[];
  };
  agreement: {
    sameHorse: boolean;
    summary: string;
  };
};

type GradeContext = {
  entry?: BettingPickEntry | null;
  row?: RaceAnalysisRow | null;
  rank: number | null;
  raceNumber?: number | null;
  sameHorse: boolean;
  kind: "simulationLeader" | "tanpukuHonmei";
  counterpartGrade?: ExpectationGrade | null;
};

const GRADE_ORDER: Record<ExpectationGrade, number> = { C: 0, B: 1, A: 2, S: 3 };

function finite(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getHorseId(entry?: BettingPickEntry | null) {
  return entry?.horse?.id === undefined || entry.horse?.id === null ? "" : String(entry.horse.id);
}

function getHorseName(row?: RaceAnalysisRow | null, entry?: BettingPickEntry | null) {
  return row?.name ?? entry?.horse?.name ?? "-";
}

function getRealOdds(entry?: BettingPickEntry | null, row?: RaceAnalysisRow | null) {
  return finite(entry?.odds) ?? finite(row?.officialOdds);
}

function gradeFromScore(score: number): ExpectationGrade {
  if (score >= 7) return "S";
  if (score >= 5) return "A";
  if (score >= 3) return "B";
  return "C";
}

function minGrade(left: ExpectationGrade, right: ExpectationGrade): ExpectationGrade {
  return GRADE_ORDER[left] <= GRADE_ORDER[right] ? left : right;
}

function hasStrongCounterpart(grade?: ExpectationGrade | null) {
  return grade === "S" || grade === "A";
}

function buildReasons(context: GradeContext) {
  const { entry, row, rank, raceNumber, sameHorse, kind } = context;
  const reasons: string[] = [];
  let score = 0;

  const placeScore = finite(entry?.placeScore);
  const valueScore = finite(entry?.valueScore);
  const top3Stability = finite(entry?.top3Stability);
  const overbetRisk = finite(entry?.overbetRisk);
  const scoreGap = finite(entry?.scoreGap);
  const realOdds = getRealOdds(entry, row);
  const classification = entry?.classificationHint?.classification;

  if (sameHorse) {
    score += kind === "simulationLeader" ? 2 : 1.5;
    reasons.push("試走と馬券推奨が一致");
  } else if (kind === "simulationLeader") {
    score -= 1;
    reasons.push("馬券推奨本命は別馬");
  } else {
    reasons.push(rank ? `総合試走${rank}位から馬券向きに浮上` : "試走順位以外の馬券指標を重視");
  }

  if (scoreGap !== null) {
    if (scoreGap >= 0.05) {
      score += 2;
      reasons.push("scoreGap 0.05以上で複勝安定性を評価");
    } else if (scoreGap >= 0.02) {
      score += 1;
      reasons.push("scoreGap は一定水準");
    } else {
      score -= 1;
      reasons.push("scoreGap が小さく過信は禁物");
    }
  }

  if (top3Stability !== null) {
    if (top3Stability >= 0.55) {
      score += 2;
      reasons.push("top3安定度が高い");
    } else if (top3Stability >= 0.45) {
      score += 1;
      reasons.push("top3安定度は標準以上");
    } else if (top3Stability < 0.3) {
      score -= 1;
      reasons.push("top3安定度に不安");
    }
  }

  if (placeScore !== null) {
    if (placeScore >= 0.6) {
      score += 2;
      reasons.push("placeScore が高い");
    } else if (placeScore >= 0.52) {
      score += 1;
      reasons.push("placeScore は買える水準");
    } else if (placeScore < 0.45) {
      score -= 1;
      reasons.push("placeScore は控えめ");
    }
  }

  if (valueScore !== null) {
    if (valueScore >= 0.55) {
      score += 1.5;
      reasons.push("valueScore に妙味あり");
    } else if (valueScore >= 0.48) {
      score += 0.5;
      reasons.push("妙味は最低限ある");
    }
  }

  if (overbetRisk !== null) {
    if (overbetRisk <= 0.08) {
      score += 1;
      reasons.push("過剰人気リスクが低い");
    } else if (overbetRisk >= 0.2) {
      score -= 2;
      reasons.push("過剰人気リスクが高い");
    } else if (overbetRisk >= 0.12) {
      score -= 1;
      reasons.push("人気過剰に注意");
    }
  }

  if (realOdds !== null && realOdds > 0) {
    if (realOdds >= 3 && realOdds < 7) {
      score += 1;
      reasons.push("回顧傾向で良好な3-6.9倍帯");
    } else if (realOdds < 3) {
      score -= 1;
      reasons.push("低オッズで妙味は控えめ");
    } else if (realOdds >= 7 && valueScore !== null && valueScore >= 0.55) {
      score += 0.5;
      reasons.push("高めのオッズを妙味で補完");
    } else if (realOdds >= 7) {
      score -= 0.5;
      reasons.push("高めのオッズで信頼度は慎重");
    }
  } else {
    score -= 0.5;
    reasons.push("実オッズ未取得のため評価を控えめに調整");
  }

  if (raceNumber === 9 || raceNumber === 10) {
    score += 1;
    reasons.push("回顧傾向で良好な9-10R");
  } else if (raceNumber === 12) {
    score -= 1;
    reasons.push("12Rは回顧傾向が弱く控えめ評価");
  }

  if (classification === "win") {
    score += 1;
    reasons.push("classification は単勝向き");
  } else if (classification === "place") {
    score += 1;
    reasons.push("classification は複勝向き");
  } else if (classification === "skip") {
    score -= 2;
    reasons.push("classification は見送り寄り");
  }

  if (kind === "simulationLeader" && rank === 1 && row) {
    score += row.simWinRate >= 18 ? 1 : 0;
    if (row.simWinRate >= 18) reasons.push("試走勝率は高水準");
  }

  let grade = gradeFromScore(score);
  if (classification === "skip") grade = minGrade(grade, "C");
  if (entry?.overbetLabel === "overbet_high") grade = minGrade(grade, "C");
  if (kind === "simulationLeader" && !sameHorse && hasStrongCounterpart(context.counterpartGrade)) {
    grade = minGrade(grade, context.counterpartGrade === "S" ? "C" : "B");
    reasons.push("別馬の馬券推奨期待度が高いため試走1位の馬券評価を抑制");
  }

  return {
    grade,
    reasons: reasons.slice(0, 4),
  };
}

function buildAgreementSummary(params: {
  sameHorse: boolean;
  simulationGrade: ExpectationGrade;
  tanpukuGrade: ExpectationGrade;
  simEntry?: BettingPickEntry | null;
  tanpukuEntry?: BettingPickEntry | null;
  raceNumber?: number | null;
}) {
  const { sameHorse, simEntry, tanpukuEntry, raceNumber } = params;
  if (sameHorse) return "試走と馬券推奨が一致";
  if (raceNumber === 12) return "総合試走1位とは異なります。12Rのため期待度を控えめに見ています。";

  const simOverbet = finite(simEntry?.overbetRisk) ?? 0;
  const tanOverbet = finite(tanpukuEntry?.overbetRisk) ?? 0;
  if (simOverbet - tanOverbet >= 0.12) {
    return "総合試走1位は能力上位ですが、人気過剰リスクを見て馬券推奨では下げています。";
  }

  const tanScoreGap = finite(tanpukuEntry?.scoreGap);
  const tanTop3 = finite(tanpukuEntry?.top3Stability);
  if ((tanScoreGap !== null && tanScoreGap >= 0.05) || (tanTop3 !== null && tanTop3 >= 0.55)) {
    return "総合試走1位とは異なります。複勝安定性を重視して馬券推奨本命を選んでいます。";
  }

  const tanValue = finite(tanpukuEntry?.valueScore);
  if (tanValue !== null && tanValue >= 0.55) {
    return "馬券推奨本命は試走順位では下ですが、複勝安定性と妙味のバランスを評価しています。";
  }

  return "scoreGap と複勝安定性を重視して、単純rank1ではなく別馬を推奨しています。";
}

export function buildBettingExpectationView(params: {
  rows: RaceAnalysisRow[];
  simulationLeaderEntry?: BettingPickEntry | null;
  tanpukuHonmeiEntry?: BettingPickEntry | null;
  course?: Pick<Course, "raceNumber"> | null;
}): BettingExpectationView {
  const simulationRow = params.rows[0] ?? null;
  const tanpukuId = getHorseId(params.tanpukuHonmeiEntry);
  const simulationId = simulationRow?.horseId ?? getHorseId(params.simulationLeaderEntry);
  const tanpukuRankIndex = tanpukuId ? params.rows.findIndex((row) => String(row.horseId) === tanpukuId) : -1;
  const tanpukuRow = tanpukuRankIndex >= 0 ? params.rows[tanpukuRankIndex] : null;
  const tanpukuRank = tanpukuRankIndex >= 0 ? tanpukuRankIndex + 1 : null;
  const sameHorse = Boolean(simulationId && tanpukuId && String(simulationId) === String(tanpukuId));
  const raceNumber = params.course?.raceNumber ?? null;

  // These S/A/B/C labels are provisional expectation labels, seeded from
  // retrospective data that currently includes post-race snapshots. They are
  // intentionally not treated as strict live win/place probabilities.
  const tanpuku = buildReasons({
    entry: params.tanpukuHonmeiEntry,
    row: tanpukuRow,
    rank: tanpukuRank,
    raceNumber,
    sameHorse,
    kind: "tanpukuHonmei",
  });
  const simulation = buildReasons({
    entry: params.simulationLeaderEntry,
    row: simulationRow,
    rank: simulationRow ? 1 : null,
    raceNumber,
    sameHorse,
    kind: "simulationLeader",
    counterpartGrade: tanpuku.grade,
  });

  return {
    simulationLeader: {
      horseName: getHorseName(simulationRow, params.simulationLeaderEntry),
      rank: 1,
      bettingGrade: simulation.grade,
      reasons: simulation.reasons,
    },
    tanpukuHonmei: {
      horseName: getHorseName(tanpukuRow, params.tanpukuHonmeiEntry),
      rank: tanpukuRank,
      expectationGrade: tanpuku.grade,
      reasons: tanpuku.reasons,
    },
    agreement: {
      sameHorse,
      summary: buildAgreementSummary({
        sameHorse,
        simulationGrade: simulation.grade,
        tanpukuGrade: tanpuku.grade,
        simEntry: params.simulationLeaderEntry,
        tanpukuEntry: params.tanpukuHonmeiEntry,
        raceNumber,
      }),
    },
  };
}
