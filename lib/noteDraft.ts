import type {
  RaceCommentaryPayload,
  WeeklyDiagnosticRecommendation,
  WeeklyNoteDraft,
  WeeklyNotePayload,
  WeeklyNoteSummaryBlock,
} from "@/lib/types";
import { getWeeklyNotePayload } from "@/lib/notePayload";

function formatMaybePercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(1)}%`;
}

function buildSection(title: string, lines: string[]) {
  const safeLines = lines.filter(Boolean);
  if (safeLines.length === 0) return `## ${title}\n\n- 特筆すべき材料はまだ少ない。\n`;
  return `## ${title}\n\n${safeLines.map((line) => `- ${line}`).join("\n")}\n`;
}

function buildRepresentativeRaceLine(race: RaceCommentaryPayload) {
  const actual = race.actualTop3.map((horse) => `${horse.position}着 ${horse.horseName}`).join(" / ");
  return `**${race.raceLabel}**: ${race.summaryComment}${actual ? ` 実着順は ${actual}。` : ""}`;
}

function buildRecommendationLines(recommendations: WeeklyDiagnosticRecommendation[]) {
  if (recommendations.length === 0) {
    return ["今週は明確な改善候補ルールが強く発火していない。現状維持で観察を続けたい。"];
  }

  return recommendations.map(
    (recommendation) =>
      `【${recommendation.priority.toUpperCase()} / ${recommendation.targetStyle}】${recommendation.title}: ${recommendation.summary}`
  );
}

function buildComparisonLines(payload: WeeklyNotePayload) {
  const comparison = payload.comparison;
  if (!comparison) {
    return ["比較対象となる前回データはまだない。今週の数値を基準線として固定していく。"];
  }

  return [
    `Snapshot本命の複勝率差は ${formatMaybePercent(comparison.deltas.snapshotHonmeiPlaceRateDelta)}pt。`,
    `単複本命の複勝率差は ${formatMaybePercent(comparison.deltas.routineHonmeiPlaceRateDelta)}pt。`,
    `妙味候補の複回収率差は ${formatMaybePercent(comparison.deltas.valuePlaceReturnRateDelta)}pt。`,
    `本命一致率の差は ${formatMaybePercent(comparison.deltas.agreementRateDelta)}pt。`,
  ];
}

function buildSummaryBlockSection(block: WeeklyNoteSummaryBlock) {
  return buildSection(block.title, block.points);
}

function buildRepresentativeSection(title: string, races: RaceCommentaryPayload[]) {
  return buildSection(
    title,
    races.slice(0, 3).map((race) => buildRepresentativeRaceLine(race))
  );
}

function buildRaceCommentaryHighlights(raceCommentaries: RaceCommentaryPayload[]) {
  const highlights = raceCommentaries.slice(0, 5).map((race) => {
    const fade = race.marketFadeCandidate?.horseId
      ? ` 市場差分では ${race.marketFadeCandidate.horseId} が過剰人気候補。`
      : "";
    return `**${race.raceLabel}**: ${race.summaryComment}${fade}`;
  });

  return buildSection("レース短評メモ", highlights);
}

export function buildWeeklyNoteDraft(payload: WeeklyNotePayload): WeeklyNoteDraft {
  const header = `# ${payload.weekKey} 単複回顧メモ\n\n生成日時: ${payload.generatedAt}\n`;

  const sections = [
    buildSummaryBlockSection(payload.summaryBlocks.find((block) => block.key === "weekly_overview") ?? {
      key: "weekly_overview",
      title: "今週の総括",
      points: [],
    }),
    buildSummaryBlockSection(payload.summaryBlocks.find((block) => block.key === "place_core") ?? {
      key: "place_core",
      title: "複勝軸候補はどうだったか",
      points: [],
    }),
    buildSummaryBlockSection(payload.summaryBlocks.find((block) => block.key === "value_core") ?? {
      key: "value_core",
      title: "妙味複勝候補はどうだったか",
      points: [],
    }),
    buildSummaryBlockSection(payload.summaryBlocks.find((block) => block.key === "snapshot_ranks") ?? {
      key: "snapshot_ranks",
      title: "シミュレーション上位勢の傾向",
      points: [],
    }),
    buildSummaryBlockSection(payload.summaryBlocks.find((block) => block.key === "popularity_trends") ?? {
      key: "popularity_trends",
      title: "人気帯別の傾向",
      points: [],
    }),
    buildSummaryBlockSection(payload.summaryBlocks.find((block) => block.key === "disagreement_review") ?? {
      key: "disagreement_review",
      title: "本命不一致レースの振り返り",
      points: [],
    }),
    buildSection("前回比でどう変わったか", buildComparisonLines(payload)),
    buildRepresentativeSection("当たりレース", payload.representativeRaces.bestHits),
    buildRepresentativeSection("外したレース", payload.representativeRaces.worstMisses),
    buildSection("次に見直す点", buildRecommendationLines(payload.recommendations)),
    buildRaceCommentaryHighlights(payload.raceCommentaries),
  ];

  return {
    weekKey: payload.weekKey,
    generatedAt: new Date().toISOString(),
    format: "markdown",
    content: `${header}\n${sections.join("\n")}`.trim(),
  };
}

export async function getWeeklyNoteDraft() {
  const payload = await getWeeklyNotePayload();
  return buildWeeklyNoteDraft(payload);
}
