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
  if (safeLines.length === 0) return `## ${title}\n\n- 特記事項なし\n`;
  return `## ${title}\n\n${safeLines.map((line) => `- ${line}`).join("\n")}\n`;
}

function buildRepresentativeRaceLine(race: RaceCommentaryPayload) {
  const actual = race.actualTop3.map((horse) => `${horse.position}着 ${horse.horseName}`).join(" / ");
  const segment = race.raceSegment !== "other" ? ` [segment: ${race.raceSegment}]` : "";
  const tags = race.missTags.length > 0 ? ` [tags: ${race.missTags.join(", ")}]` : "";
  return `**${race.raceLabel}**: ${race.summaryComment}${segment}${tags}${actual ? ` 実着順 ${actual}` : ""}`;
}

function buildRecommendationLines(recommendations: WeeklyDiagnosticRecommendation[]) {
  if (recommendations.length === 0) {
    return ["今週は強い改善シグナルは出ていません。継続観察で十分です。"];
  }

  return recommendations.map(
    (recommendation) =>
      `[${recommendation.priority.toUpperCase()} / ${recommendation.targetStyle}] ${recommendation.title}: ${recommendation.summary}`
  );
}

function buildComparisonLines(payload: WeeklyNotePayload) {
  const comparison = payload.comparison;
  if (!comparison) {
    return ["比較対象の前週データはまだありません。"];
  }

  return [
    `Snapshot本命の複勝率差 ${formatMaybePercent(comparison.deltas.snapshotHonmeiPlaceRateDelta)}pt`,
    `運用本命の複勝率差 ${formatMaybePercent(comparison.deltas.routineHonmeiPlaceRateDelta)}pt`,
    `妙味候補の複勝回収率差 ${formatMaybePercent(comparison.deltas.valuePlaceReturnRateDelta)}pt`,
    `本命一致率差 ${formatMaybePercent(comparison.deltas.agreementRateDelta)}pt`,
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
    const fade = race.marketFadeCandidate?.horseId ? ` marketFade=${race.marketFadeCandidate.horseId}` : "";
    const missTags = race.missTags.length > 0 ? ` missTags=${race.missTags.join(",")}` : "";
    return `**${race.raceLabel}**: ${race.summaryComment}${missTags}${fade}`;
  });

  return buildSection("レース別メモ", highlights);
}

export function buildWeeklyNoteDraft(payload: WeeklyNotePayload): WeeklyNoteDraft {
  const header = `# ${payload.weekKey} 週次回顧メモ\n\n生成日時: ${payload.generatedAt}\n`;

  const sections = [
    buildSummaryBlockSection(
      payload.summaryBlocks.find((block) => block.key === "weekly_overview") ?? {
        key: "weekly_overview",
        title: "週次概要",
        points: [],
      }
    ),
    buildSummaryBlockSection(
      payload.summaryBlocks.find((block) => block.key === "place_core") ?? {
        key: "place_core",
        title: "複勝軸の状況",
        points: [],
      }
    ),
    buildSummaryBlockSection(
      payload.summaryBlocks.find((block) => block.key === "segments") ?? {
        key: "segments",
        title: "Segment Comparison",
        points: [],
      }
    ),
    buildSummaryBlockSection(
      payload.summaryBlocks.find((block) => block.key === "miss_tags") ?? {
        key: "miss_tags",
        title: "外れタグ集計",
        points: [],
      }
    ),
    buildSummaryBlockSection(
      payload.summaryBlocks.find((block) => block.key === "value_core") ?? {
        key: "value_core",
        title: "妙味候補の状況",
        points: [],
      }
    ),
    buildSummaryBlockSection(
      payload.summaryBlocks.find((block) => block.key === "snapshot_ranks") ?? {
        key: "snapshot_ranks",
        title: "snapshot順位の状況",
        points: [],
      }
    ),
    buildSummaryBlockSection(
      payload.summaryBlocks.find((block) => block.key === "popularity_trends") ?? {
        key: "popularity_trends",
        title: "人気帯の傾向",
        points: [],
      }
    ),
    buildSummaryBlockSection(
      payload.summaryBlocks.find((block) => block.key === "market_heat") ?? {
        key: "market_heat",
        title: "市場熱シグナル",
        points: [],
      }
    ),
    buildSummaryBlockSection(
      payload.summaryBlocks.find((block) => block.key === "disagreement_review") ?? {
        key: "disagreement_review",
        title: "本命不一致レビュー",
        points: [],
      }
    ),
    buildSection("前週比較", buildComparisonLines(payload)),
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
