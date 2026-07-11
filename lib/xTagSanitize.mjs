// X 投稿ハッシュタグの共通サニタイズと優先度リスト。
// X ではタグに括弧・記号が入るとそこでタグが途切れるため、
// レース名 (例: 垂水Ｓ(3勝クラス)) は必ずここを通してタグ化する。
// 旧状態では xPostPayload.mjs にのみサニタイズがあり、tanpukuXPost.ts と
// keiba-routine の回顧投稿が生のレース名をタグ化して壊れタグを配信していた。

export function cleanXText(value) {
  const withoutControlChars = Array.from(String(value ?? ""))
    .map((ch) => {
      const code = ch.charCodeAt(0);
      return code <= 0x1f || code === 0x7f ? " " : ch;
    })
    .join("");
  return withoutControlChars
    .replace(/　/g, " ")
    .replace(/s+/g, " ")
    .trim();
}

export function cleanName(value) {
  return cleanXText(value).replace(/^#+/, "");
}

export function stripRaceTagPunctuation(value) {
  return String(value ?? "")
    .replace(/[()（）・/／[\]{}「」『』【】<>＜＞:：,，.．!！?？]/g, "")
    .replace(/―/g, "")
    .replace(/\s+/g, "")
    .trim();
}

export function sanitizeRaceTagLabel(value) {
  const cleaned = cleanName(value).replace(/出馬表/g, "");
  const parenthetical = cleaned.match(/[（(]([^()（）]+)[)）]/)?.[1] ?? null;
  const outer = cleaned.replace(/[（(].*?[)）]/g, "");
  const normalizedOuter = stripRaceTagPunctuation(outer);
  const normalizedInner = stripRaceTagPunctuation(parenthetical);
  const looksLikeCourseLabel =
    /(?:芝|ダート|障害)\d+m/i.test(cleaned) ||
    /^(札幌|函館|福島|新潟|東京|中山|中京|京都|阪神|小倉)/.test(cleaned);
  if (normalizedOuter && !looksLikeCourseLabel) return normalizedOuter;
  if (normalizedInner) return normalizedInner;
  return normalizedOuter;
}

export function buildRaceHashtag(raceName, hashtagValue = null) {
  const cleaned = sanitizeRaceTagLabel(hashtagValue) || sanitizeRaceTagLabel(raceName);
  return cleaned ? `#${cleaned}` : "#AI予想";
}

/**
 * 優先度付きハッシュタグリスト。
 * required は必ず残すタグ、optional は字数が許す限り上から採用し、
 * 溢れたら「下から」削る (呼び出し側で末尾から間引く)。
 * skip 分類の投稿は見送り宣言なので拡散タグを積まない。
 *
 * @param {{
 *   raceName?: string | null,
 *   hashtag?: string | null,
 *   grade?: string | null,
 *   year?: number | null,
 *   horseName?: string | null,
 *   skip?: boolean,
 * }} [options]
 * @returns {{ required: string[], optional: string[] }}
 */
export function buildPriorityHashtags({
  raceName,
  hashtag = null,
  grade = null,
  year = null,
  horseName = null,
  skip = false,
} = {}) {
  const raceTag = sanitizeRaceTagLabel(hashtag) || sanitizeRaceTagLabel(raceName);
  const required = [raceTag ? `#${raceTag}` : "#競馬予想", "#AI予想"];
  if (skip) return { required, optional: [] };

  const optional = ["#競馬予想", "#競馬"];
  const normalizedGrade = String(grade ?? "").toUpperCase();
  const gradeTag = /^G[123]$/.test(normalizedGrade) ? `#${normalizedGrade}` : null;
  const numericYear = Number(year);
  if (raceTag && gradeTag && Number.isFinite(numericYear) && numericYear > 2000) {
    optional.push(`#${raceTag}${numericYear}`);
  }
  if (gradeTag) optional.push(gradeTag, "#JRA");
  optional.push("#データ競馬");
  const horseTag = sanitizeRaceTagLabel(horseName);
  if (horseTag) optional.push(`#${horseTag}`);

  return { required, optional: optional.filter((tag) => !required.includes(tag)) };
}
