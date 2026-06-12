export interface CategoryReturnStatForPost {
  key: string;
  raceCount: number;
  tanReturnRate: number;
  fukuReturnRate: number;
}

export interface TanpukuPostHorse {
  horseName: string;
  mark?: "◎" | "○" | "▲" | null;
  markNote?: string | null;
}

export interface TanpukuWideRecommendation {
  recommended: boolean;
  horseNames?: string[];
  reason?: string;
}

export interface TanpukuClassificationHint {
  classification: "win" | "place" | "skip";
  confidence: number;
  reason?: string;
}

export interface BuildTanpukuPreRacePostParams {
  raceName?: string | null;
  hashtag?: string | null;
  topHorses: TanpukuPostHorse[];
  categoryReturnStats?: CategoryReturnStatForPost[] | null;
  maxLength?: number;
  wideRecommendation?: TanpukuWideRecommendation | null;
  classificationHint?: TanpukuClassificationHint | null;
}

interface PickedReturnStats {
  g1: CategoryReturnStatForPost | null;
  stakes: CategoryReturnStatForPost | null;
}

const DEFAULT_X_POST_LIMIT = 280;

function countTextChars(text: string): number {
  return Array.from(text).length;
}

function cleanLine(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function buildHashtag(raceName?: string | null, hashtag?: string | null): string {
  const explicit = cleanLine(hashtag);
  if (explicit) return explicit.startsWith("#") ? explicit : `#${explicit}`;

  const fallback = cleanLine(raceName).replace(/\s+/g, "");
  return fallback ? `#${fallback}` : "#競馬予想";
}

function formatRoi(value: number): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : "0.0";
}

export function getG1SamplePhrase(raceCount: number): string {
  if (raceCount < 10) return "参考値ながら";
  if (raceCount < 30) return "検証中データで";
  return "集計で";
}

function getG1ShortSampleLabel(raceCount: number): string {
  if (raceCount < 10) return "参考値";
  if (raceCount < 30) return "検証中";
  return "集計";
}

export function pickReturnStats(stats?: CategoryReturnStatForPost[] | null): PickedReturnStats {
  const list = stats ?? [];
  return {
    g1: list.find((stat) => stat.key === "g1_only") ?? null,
    stakes:
      list.find((stat) => stat.key === "open_extended") ??
      list.find((stat) => stat.key === "graded_only") ??
      null,
  };
}

function buildMarks(topHorses: TanpukuPostHorse[]): string[] {
  const defaultMarks: NonNullable<TanpukuPostHorse["mark"]>[] = ["◎", "○", "▲"];
  return topHorses
    .slice(0, 3)
    .map((horse, index) => buildMarkLine(horse.mark ?? defaultMarks[index], horse))
    .filter(Boolean);
}

function buildMarkLine(mark: string, horse?: TanpukuPostHorse): string {
  const horseName = cleanLine(horse?.horseName);
  if (!horseName) return "";
  const note = cleanLine(horse?.markNote);
  return `${mark}${horseName}${note ? ` ※${note}` : ""}`;
}

function buildBaseLines(params: BuildTanpukuPreRacePostParams): string[] {
  return [
    buildHashtag(params.raceName, params.hashtag),
    "",
    "AI予想エンジン週中チェック",
    "",
    ...buildMarks(params.topHorses),
  ];
}

function buildWideRecommendationLine(params: BuildTanpukuPreRacePostParams): string {
  const wide = params.wideRecommendation;
  if (!wide?.recommended || !wide.horseNames || wide.horseNames.length < 2) return "";
  return `ワイド: ◎${wide.horseNames[0]}×○${wide.horseNames[1]}`;
}

function buildSkipLine(params: BuildTanpukuPreRacePostParams): string {
  if (params.classificationHint?.classification === "skip") {
    return "軸としては見送り寄りの読み (参考)";
  }
  return "";
}

function buildNoStatsPost(params: BuildTanpukuPreRacePostParams): string {
  return [
    ...buildBaseLines(params),
    "",
    "単複回収率重視のエンジンです。",
  ].join("\n");
}

function buildFullPost(params: BuildTanpukuPreRacePostParams, picked: PickedReturnStats): string {
  const { g1, stakes } = picked;
  if (!g1 || !stakes) return buildNoStatsPost(params);

  const wideLine = buildWideRecommendationLine(params);
  const skipLine = buildSkipLine(params);

  return [
    ...buildBaseLines(params),
    ...(wideLine ? ["", wideLine] : []),
    ...(skipLine ? ["", skipLine] : []),
    "",
    "単複回収率重視のエンジンです。",
    "",
    "現時点の集計では、",
    `G1のみは${g1.raceCount}Rの${getG1SamplePhrase(g1.raceCount)}`,
    `単勝${formatRoi(g1.tanReturnRate)}% / 複勝${formatRoi(g1.fukuReturnRate)}%。`,
    "",
    "重賞・OP以上では",
    `${stakes.raceCount}R集計で`,
    `単勝${formatRoi(stakes.tanReturnRate)}% / 複勝${formatRoi(stakes.fukuReturnRate)}%。`,
  ].join("\n");
}

function buildShortPost(params: BuildTanpukuPreRacePostParams, picked: PickedReturnStats): string {
  const { g1, stakes } = picked;
  if (!g1 || !stakes) return buildNoStatsPost(params);

  return [
    ...buildBaseLines(params),
    "",
    "単複回収率重視。",
    `現時点でG1のみ${g1.raceCount}R${getG1ShortSampleLabel(g1.raceCount)}:`,
    `単勝${formatRoi(g1.tanReturnRate)}% / 複勝${formatRoi(g1.fukuReturnRate)}%`,
    "",
    "重賞・OP以上:",
    `単勝${formatRoi(stakes.tanReturnRate)}% / 複勝${formatRoi(stakes.fukuReturnRate)}%`,
  ].join("\n");
}

export function buildTanpukuPreRacePostText(params: BuildTanpukuPreRacePostParams): string {
  const maxLength = params.maxLength ?? DEFAULT_X_POST_LIMIT;
  const picked = pickReturnStats(params.categoryReturnStats);
  const full = buildFullPost(params, picked);
  if (countTextChars(full) <= maxLength) return full;

  const short = buildShortPost(params, picked);
  if (countTextChars(short) <= maxLength) return short;

  return buildNoStatsPost(params);
}
