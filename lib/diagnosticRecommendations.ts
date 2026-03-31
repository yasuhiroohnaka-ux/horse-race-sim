import type { WeeklyDiagnosticRecommendation, WeeklyDiagnostics } from "@/lib/types";

const PLACE_RATE_GAP_THRESHOLD = 5;
const PLACE_RATE_STRONG = 45;
const PLACE_RATE_USABLE = 35;
const PLACE_RATE_WEAK = 33;
const ROI_STRONG = 120;
const ROI_WEAK = 95;
const ROI_GAP_THRESHOLD = 15;
const MIN_SAMPLE_SMALL = 2;
const MIN_SAMPLE_MEDIUM = 3;

function addRecommendation(
  target: WeeklyDiagnosticRecommendation[],
  recommendation: WeeklyDiagnosticRecommendation | null
) {
  if (recommendation) target.push(recommendation);
}

export function buildDiagnosticRecommendations(
  diagnostics: Omit<WeeklyDiagnostics, "recommendations">
): WeeklyDiagnosticRecommendation[] {
  const recommendations: WeeklyDiagnosticRecommendation[] = [];
  const firstRank = diagnostics.placeCore.snapshotRanks.find((item) => item.rank === 1);
  const secondRank = diagnostics.placeCore.snapshotRanks.find((item) => item.rank === 2);
  const thirdRank = diagnostics.placeCore.snapshotRanks.find((item) => item.rank === 3);
  const longshotBand = diagnostics.valueCore.popularityBands.find((item) => item.band === "longshot");

  const snapshotPlaceRate = diagnostics.placeCore.snapshotHonmei.placeRate;
  const routinePlaceRate = diagnostics.placeCore.routineHonmei.placeRate;
  const routineReturnRate = diagnostics.placeCore.routineHonmei.placeReturnRate;
  const valuePlaceRate = diagnostics.valueCore.placeRate;
  const valueReturnRate = diagnostics.valueCore.placeReturnRate;

  if (
    diagnostics.signals.snapshotHonmeiUnderperformsRoutineHonmei &&
    diagnostics.placeCore.snapshotHonmei.raceCount >= MIN_SAMPLE_MEDIUM &&
    diagnostics.placeCore.routineHonmei.raceCount >= MIN_SAMPLE_MEDIUM &&
    routinePlaceRate - snapshotPlaceRate >= PLACE_RATE_GAP_THRESHOLD
  ) {
    addRecommendation(recommendations, {
      id: "routine_honmei_over_snapshot_honmei",
      category: "place_core",
      targetStyle: "place_hit_rate",
      priority: "high",
      title: "Snapshot本命を勝率寄りに押しすぎている可能性",
      summary: "現状は Snapshot本命より単複本命の方が複勝軸として安定している可能性があります。",
      evidence: {
        snapshotPlaceRate,
        routinePlaceRate,
        rateGap: routinePlaceRate - snapshotPlaceRate,
        snapshotRaceCount: diagnostics.placeCore.snapshotHonmei.raceCount,
        routineRaceCount: diagnostics.placeCore.routineHonmei.raceCount,
      },
      metricSignals: ["snapshotHonmeiUnderperformsRoutineHonmei"],
    });
  }

  if (
    diagnostics.signals.secondRankOutperformsFirstRank &&
    (secondRank?.raceCount ?? 0) >= MIN_SAMPLE_SMALL &&
    (firstRank?.raceCount ?? 0) >= MIN_SAMPLE_SMALL &&
    (secondRank?.placeRate ?? 0) - (firstRank?.placeRate ?? 0) >= PLACE_RATE_GAP_THRESHOLD
  ) {
    addRecommendation(recommendations, {
      id: "second_rank_as_place_axis",
      category: "ranking",
      targetStyle: "place_hit_rate",
      priority: "high",
      title: "2番手を複勝軸として再評価すべき可能性",
      summary: "Snapshot1番手より2番手の方が複勝率で上回っており、軸の置き方を見直す余地があります。",
      evidence: {
        firstRankPlaceRate: firstRank?.placeRate ?? null,
        secondRankPlaceRate: secondRank?.placeRate ?? null,
        firstRankRaceCount: firstRank?.raceCount ?? null,
        secondRankRaceCount: secondRank?.raceCount ?? null,
      },
      metricSignals: ["secondRankOutperformsFirstRank"],
    });
  }

  if (
    (diagnostics.signals.thirdRankOutperformsFirstRank ||
      ((thirdRank?.placeRate ?? 0) >= PLACE_RATE_USABLE &&
        (thirdRank?.raceCount ?? 0) >= MIN_SAMPLE_SMALL)) &&
    (thirdRank?.raceCount ?? 0) >= MIN_SAMPLE_SMALL
  ) {
    addRecommendation(recommendations, {
      id: "third_rank_viable_place_pool",
      category: "ranking",
      targetStyle: "place_hit_rate",
      priority: diagnostics.signals.thirdRankOutperformsFirstRank ? "medium" : "low",
      title: "3番手まで複勝候補として見る価値がある可能性",
      summary: "Snapshot3番手が一定の複勝率を持っており、1頭固定より候補プール型の使い方が向く可能性があります。",
      evidence: {
        firstRankPlaceRate: firstRank?.placeRate ?? null,
        thirdRankPlaceRate: thirdRank?.placeRate ?? null,
        thirdRankRaceCount: thirdRank?.raceCount ?? null,
      },
      metricSignals: diagnostics.signals.thirdRankOutperformsFirstRank ? ["thirdRankOutperformsFirstRank"] : [],
    });
  }

  if (
    diagnostics.signals.valueCandidateWorksBetterInLongshots &&
    (longshotBand?.raceCount ?? 0) >= MIN_SAMPLE_SMALL &&
    (longshotBand?.placeReturnRate ?? 0) >= valueReturnRate + ROI_GAP_THRESHOLD
  ) {
    addRecommendation(recommendations, {
      id: "value_candidate_longshot_specialist",
      category: "longshot",
      targetStyle: "place_return_rate",
      priority: "high",
      title: "妙味候補は人気薄限定で機能している可能性",
      summary: "妙味候補は全体運用よりも、7番人気以下に絞った方が複回収率を引き上げられる可能性があります。",
      evidence: {
        overallValuePlaceReturnRate: valueReturnRate,
        longshotPlaceReturnRate: longshotBand?.placeReturnRate ?? null,
        longshotPlaceRate: longshotBand?.placeRate ?? null,
        longshotRaceCount: longshotBand?.raceCount ?? null,
      },
      metricSignals: ["valueCandidateWorksBetterInLongshots"],
    });
  }

  if (
    diagnostics.signals.agreementImprovesPlaceRate &&
    diagnostics.agreement.sameHonmeiCount >= MIN_SAMPLE_SMALL
  ) {
    addRecommendation(recommendations, {
      id: "agreement_is_place_stability_filter",
      category: "agreement",
      targetStyle: "place_hit_rate",
      priority: "medium",
      title: "本命一致時の方が複勝率が安定している可能性",
      summary: "Snapshot本命と単複本命が一致したレースをフィルタとして使うと、複勝軸の安定性が上がる可能性があります。",
      evidence: {
        agreementRate: diagnostics.agreement.agreementRate,
        samePlaceRate: diagnostics.agreement.samePlaceRate,
        disagreementSnapshotPlaceRate: diagnostics.agreement.disagreementSnapshotPlaceRate,
        disagreementRoutinePlaceRate: diagnostics.agreement.disagreementRoutinePlaceRate,
        sameHonmeiCount: diagnostics.agreement.sameHonmeiCount,
      },
      metricSignals: ["agreementImprovesPlaceRate"],
    });
  }

  if (
    diagnostics.signals.disagreementFavoursRoutine &&
    diagnostics.disagreement.raceCount >= MIN_SAMPLE_SMALL &&
    diagnostics.agreement.disagreementRoutinePlaceRate - diagnostics.agreement.disagreementSnapshotPlaceRate >=
      PLACE_RATE_GAP_THRESHOLD
  ) {
    addRecommendation(recommendations, {
      id: "prefer_routine_when_disagreement",
      category: "agreement",
      targetStyle: "place_hit_rate",
      priority: "high",
      title: "不一致時は単複本命を優先した方がよい可能性",
      summary: "本命不一致レースでは Snapshot本命より単複本命の方が複勝圏に届きやすい傾向があります。",
      evidence: {
        disagreementRaceCount: diagnostics.disagreement.raceCount,
        disagreementSnapshotPlaceRate: diagnostics.agreement.disagreementSnapshotPlaceRate,
        disagreementRoutinePlaceRate: diagnostics.agreement.disagreementRoutinePlaceRate,
        routineOnlyPlaceCount: diagnostics.disagreement.routineOnlyPlaceCount,
      },
      metricSignals: ["disagreementFavoursRoutine"],
    });
  }

  if (
    diagnostics.signals.disagreementFavoursSnapshot &&
    diagnostics.disagreement.raceCount >= MIN_SAMPLE_SMALL &&
    diagnostics.agreement.disagreementSnapshotPlaceRate - diagnostics.agreement.disagreementRoutinePlaceRate >=
      PLACE_RATE_GAP_THRESHOLD
  ) {
    addRecommendation(recommendations, {
      id: "prefer_snapshot_when_disagreement",
      category: "agreement",
      targetStyle: "place_hit_rate",
      priority: "high",
      title: "不一致時はSnapshot本命を優先した方がよい可能性",
      summary: "本命不一致レースでは単複本命より Snapshot本命の方が複勝圏に届きやすい傾向があります。",
      evidence: {
        disagreementRaceCount: diagnostics.disagreement.raceCount,
        disagreementSnapshotPlaceRate: diagnostics.agreement.disagreementSnapshotPlaceRate,
        disagreementRoutinePlaceRate: diagnostics.agreement.disagreementRoutinePlaceRate,
        snapshotOnlyPlaceCount: diagnostics.disagreement.snapshotOnlyPlaceCount,
      },
      metricSignals: ["disagreementFavoursSnapshot"],
    });
  }

  if (
    valueReturnRate >= ROI_STRONG &&
    valuePlaceRate >= PLACE_RATE_USABLE &&
    routinePlaceRate <= PLACE_RATE_WEAK
  ) {
    addRecommendation(recommendations, {
      id: "value_style_current_strength",
      category: "value_core",
      targetStyle: "place_return_rate",
      priority: "medium",
      title: "現状は複勝軸型より妙味複勝型に強みがある可能性",
      summary: "本命系の複勝率よりも、妙味候補の複回収率と複勝率のバランスの方が良い週です。",
      evidence: {
        routinePlaceRate,
        routinePlaceReturnRate: routineReturnRate,
        valuePlaceRate,
        valuePlaceReturnRate: valueReturnRate,
      },
      metricSignals: [],
    });
  }

  if (
    routinePlaceRate >= PLACE_RATE_STRONG &&
    valueReturnRate <= ROI_WEAK &&
    diagnostics.placeCore.routineHonmei.raceCount >= MIN_SAMPLE_MEDIUM
  ) {
    addRecommendation(recommendations, {
      id: "place_axis_style_current_strength",
      category: "place_core",
      targetStyle: "place_hit_rate",
      priority: "medium",
      title: "現状は妙味より複勝軸型を重視した方がよい可能性",
      summary: "妙味候補の回収寄り運用より、単複本命を軸にした複勝重視の使い方が安定しやすい週です。",
      evidence: {
        routinePlaceRate,
        routinePlaceReturnRate: routineReturnRate,
        valuePlaceRate,
        valuePlaceReturnRate: valueReturnRate,
      },
      metricSignals: [],
    });
  }

  const heat = diagnostics.evaluation.secondaryKpis.marketHeatCounts;
  if (heat && heat.honmeiOverbetCount >= MIN_SAMPLE_SMALL && heat.honmeiNonOverbetCount >= MIN_SAMPLE_SMALL) {
    const overbetPlaceRate = (heat.honmeiOverbetPlaceHitCount / heat.honmeiOverbetCount) * 100;
    const nonOverbetPlaceRate = (heat.honmeiNonOverbetPlaceHitCount / heat.honmeiNonOverbetCount) * 100;
    if (nonOverbetPlaceRate - overbetPlaceRate >= PLACE_RATE_GAP_THRESHOLD) {
      addRecommendation(recommendations, {
        id: "market_overbet_honmei_drag",
        category: "place_core",
        targetStyle: "place_hit_rate",
        priority: "medium",
        title: "市場過熱馬の本命選出が複勝率を押し下げている可能性",
        summary: `過熱ラベル付き本命の複勝率${Math.round(overbetPlaceRate)}%に対し、非過熱本命は${Math.round(nonOverbetPlaceRate)}%。overbetRisk の減点幅拡大または overbet 本命への警告表示を検討。`,
        evidence: {
          honmeiOverbetCount: heat.honmeiOverbetCount,
          overbetPlaceRate: Math.round(overbetPlaceRate),
          nonOverbetPlaceRate: Math.round(nonOverbetPlaceRate),
          gap: Math.round(nonOverbetPlaceRate - overbetPlaceRate),
        },
        metricSignals: ["marketHeatCounts"],
      });
    }
  }

  return recommendations;
}
