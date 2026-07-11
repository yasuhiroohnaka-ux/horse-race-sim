import { buildPriorityHashtags, sanitizeRaceTagLabel } from "@/lib/xTagSanitize.mjs";

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

export interface TanpukuHonmeiStatsForPost {
  calWinProb?: number | null;
  calPlaceProb?: number | null;
  odds?: number | null;
}

export interface BuildTanpukuPreRacePostParams {
  raceName?: string | null;
  hashtag?: string | null;
  topHorses: TanpukuPostHorse[];
  categoryReturnStats?: CategoryReturnStatForPost[] | null;
  maxLength?: number;
  wideRecommendation?: TanpukuWideRecommendation | null;
  classificationHint?: TanpukuClassificationHint | null;
  // 分類ドリブン文面用 (省略時は分類名のみの表現になる)
  honmeiStats?: TanpukuHonmeiStatsForPost | null;
  // ハッシュタグ増強用 (重賞のみ年付きタグ等を追加)
  raceGrade?: string | null;
  raceYear?: number | null;
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
  // X はタグ内の括弧・記号でタグが途切れるため必ずサニタイズを通す
  const sanitized = sanitizeRaceTagLabel(hashtag) || sanitizeRaceTagLabel(raceName);
  return sanitized ? `#${sanitized}` : "#競馬予想";
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

// 分類ドリブンの1行。win/place は校正値があれば数字を出し、skip は見送りを主役にする。
// 数字は断定を避けサンプル状況を併記する (win ゲートは件数が少なく暫定のため)。
function buildClassificationLine(params: BuildTanpukuPreRacePostParams): string {
  const classification = params.classificationHint?.classification;
  if (!classification) return "";

  const stats = params.honmeiStats ?? null;
  const calWinPct = Number.isFinite(Number(stats?.calWinProb))
    ? Math.round(Number(stats?.calWinProb) * 100)
    : null;
  const calPlacePct = Number.isFinite(Number(stats?.calPlaceProb))
    ? Math.round(Number(stats?.calPlaceProb) * 100)
    : null;
  const odds = Number(stats?.odds);

  if (classification === "win") {
    if (calWinPct !== null && Number.isFinite(odds) && odds > 0) {
      return `単勝勝負型: 校正勝率${calWinPct}%×${odds.toFixed(1)}倍 (winゲートは検証中)`;
    }
    return "単勝勝負型 (winゲートは検証中)";
  }
  if (classification === "place") {
    if (calPlacePct !== null) {
      return `複勝軸型: 校正複勝率${calPlacePct}%`;
    }
    return "複勝軸型";
  }
  // skip: 見送り宣言 (文言は既存投稿と互換)
  return "軸としては見送り寄りの読み (参考)";
}

function buildNoStatsPost(params: BuildTanpukuPreRacePostParams): string {
  const classificationLine = buildClassificationLine(params);
  return [
    ...buildBaseLines(params),
    ...(classificationLine ? ["", classificationLine] : []),
    "",
    "単複回収率重視のエンジンです。",
  ].join("\n");
}

function buildFullPost(params: BuildTanpukuPreRacePostParams, picked: PickedReturnStats): string {
  const { g1, stakes } = picked;
  if (!g1 || !stakes) return buildNoStatsPost(params);

  const classificationLine = buildClassificationLine(params);
  const wideLine = buildWideRecommendationLine(params);

  return [
    ...buildBaseLines(params),
    ...(classificationLine ? ["", classificationLine] : []),
    ...(wideLine ? ["", wideLine] : []),
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

  const classificationLine = buildClassificationLine(params);

  return [
    ...buildBaseLines(params),
    ...(classificationLine ? ["", classificationLine] : []),
    "",
    "単複回収率重視。",
    `現時点でG1のみ${g1.raceCount}R${getG1ShortSampleLabel(g1.raceCount)}:`,
    `単勝${formatRoi(g1.tanReturnRate)}% / 複勝${formatRoi(g1.fukuReturnRate)}%`,
    "",
    "重賞・OP以上:",
    `単勝${formatRoi(stakes.tanReturnRate)}% / 複勝${formatRoi(stakes.fukuReturnRate)}%`,
  ].join("\n");
}

// 優先度付きタグを末尾行として追加する。本文冒頭のレースタグは既出なので除外し、
// 残り字数が許す限り上から採用する (優先度の低いタグから自然に落ちる)。
function appendPriorityTags(body: string, params: BuildTanpukuPreRacePostParams, maxLength: number): string {
  const raceTagLine = buildHashtag(params.raceName, params.hashtag);
  const { required, optional } = buildPriorityHashtags({
    raceName: params.raceName,
    hashtag: params.hashtag,
    grade: params.raceGrade ?? null,
    year: params.raceYear ?? null,
    horseName: params.topHorses[0]?.horseName ?? null,
    skip: params.classificationHint?.classification === "skip",
  });

  const candidates = [...required, ...optional].filter((tag) => tag !== raceTagLine);
  const adopted: string[] = [];
  let currentLength = countTextChars(body) + 2; // "\n\n" 分
  for (const tag of candidates) {
    const cost = countTextChars(tag) + (adopted.length > 0 ? 1 : 0);
    if (currentLength + cost > maxLength) break;
    adopted.push(tag);
    currentLength += cost;
  }

  return adopted.length > 0 ? `${body}\n\n${adopted.join(" ")}` : body;
}

export function buildTanpukuPreRacePostText(params: BuildTanpukuPreRacePostParams): string {
  const maxLength = params.maxLength ?? DEFAULT_X_POST_LIMIT;
  const picked = pickReturnStats(params.categoryReturnStats);

  const full = buildFullPost(params, picked);
  if (countTextChars(full) <= maxLength) return appendPriorityTags(full, params, maxLength);

  const short = buildShortPost(params, picked);
  if (countTextChars(short) <= maxLength) return appendPriorityTags(short, params, maxLength);

  return appendPriorityTags(buildNoStatsPost(params), params, maxLength);
}
