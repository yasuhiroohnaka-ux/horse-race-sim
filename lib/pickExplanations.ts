/**
 * Shared explanation builders for pick visibility.
 * Used by sim page, archive page, and future X-post formatting.
 */

export type AgreementStatus = "agree" | "disagree" | "unknown";

export type PickExplanationContributor = {
  label: string;
  value?: number;
};

export type PickExplanationEntry = {
  horseName?: string | null;
  horseId?: string | null;
  winProb?: number | null;
  placeProb?: number | null;
  placeScore?: number | null;
  valueScore?: number | null;
  top3Stability?: number | null;
  marketSupport?: number | null;
  overbetRisk?: number | null;
  placeReturnEdge?: number | null;
  longshotBonus?: number | null;
  scoreGap?: number | null;
  overbetLabel?: string | null;
  selectionReason?: string | null;
  signalReason?: string | null;
  majorContributors?: PickExplanationContributor[] | null;
};

export type PickExplanations = {
  simHonmei: string;
  tanpukuHonmei: string;
  opponentCandidate: string;
  wideLongshot: string;
  agreement: string;
  disagreement: string | null;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function pct(value: number, digits = 0): string {
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${normalized.toFixed(digits)}%`;
}

function r3(value: number): string {
  return value.toFixed(3);
}

function joinJapanese(items: string[]): string {
  return items.filter(Boolean).join("・");
}

function normalizeText(value?: string | null): string | null {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || null;
}

function getContributorLabels(entry?: PickExplanationEntry | null): string[] {
  return (entry?.majorContributors ?? [])
    .map((contributor) => normalizeText(contributor.label))
    .filter((label): label is string => Boolean(label))
    .slice(0, 3);
}

export function formatOverbetLabel(label?: string | null): string | null {
  if (label === "overbet_high") return "過剰人気リスク高";
  if (label === "overbet_moderate") return "過剰人気リスク中";
  return null;
}

export function buildSimHonmeiExplanation(entry?: PickExplanationEntry | null): string {
  if (!entry) {
    return "総合試走1位データがなく、根拠表示は未取得。";
  }

  const contributors = getContributorLabels(entry);
  const signalReason = normalizeText(entry.signalReason);

  if (isFiniteNumber(entry.winProb) && contributors.length > 0) {
    return `winProb ${pct(entry.winProb)}で、${joinJapanese(contributors)}が押し上げた総合試走1位。`;
  }

  if (isFiniteNumber(entry.winProb)) {
    return `winProb ${pct(entry.winProb)}を基準に、勝ち切り期待が最も高い馬として評価。`;
  }

  if (contributors.length > 0) {
    return `${joinJapanese(contributors)}が優勢で、シミュレーション上位に入った。`;
  }

  if (signalReason) {
    return signalReason;
  }

  return "総合評価の積み上がりで総合試走1位になった。";
}

export function buildTanpukuHonmeiExplanation(entry?: PickExplanationEntry | null): string {
  if (!entry) {
    return "馬券推奨本命データがなく、表示できません。";
  }

  if (isFiniteNumber(entry.placeScore) && isFiniteNumber(entry.top3Stability) && entry.top3Stability >= 0.55) {
    return `placeScore ${r3(entry.placeScore)}が高く、3着内安定度${pct(entry.top3Stability)}を評価して馬券推奨本命に選出。`;
  }

  if (isFiniteNumber(entry.placeScore) && isFiniteNumber(entry.marketSupport) && entry.marketSupport >= 0.65) {
    return `placeScore ${r3(entry.placeScore)}が高く、市場支持もある馬券推奨本命。`;
  }

  if (isFiniteNumber(entry.placeScore) && isFiniteNumber(entry.overbetRisk) && entry.overbetRisk <= 0.12) {
    return `placeScore ${r3(entry.placeScore)}が高く、過剰人気リスクを抑えた馬券推奨本命。`;
  }

  const selectionReason = normalizeText(entry.selectionReason);
  if (selectionReason) {
    return selectionReason;
  }

  if (isFiniteNumber(entry.placeScore)) {
    return `placeScore ${r3(entry.placeScore)}が上位で、馬券推奨本命として採用。`;
  }

  return "複勝寄りの安定性を評価して馬券推奨本命に選出。";
}

export function buildOpponentCandidateExplanation(entry?: PickExplanationEntry | null): string {
  if (!entry) {
    return "相手候補は不在。相手候補として採用できる次点馬がいなかった。";
  }

  const selectionReason = normalizeText(entry.selectionReason);
  if (selectionReason) {
    return selectionReason;
  }

  if (
    isFiniteNumber(entry.placeScore) &&
    isFiniteNumber(entry.scoreGap) &&
    isFiniteNumber(entry.top3Stability)
  ) {
    return `馬券推奨本命と同じ placeScore 軸で次点。scoreGap ${r3(entry.scoreGap)} と3着内安定度${pct(entry.top3Stability)}を見て相手候補に選出。`;
  }

  if (isFiniteNumber(entry.placeScore) && isFiniteNumber(entry.top3Stability)) {
    return `placeScore ${r3(entry.placeScore)}が次点で、3着内安定度${pct(entry.top3Stability)}も高いため相手候補に選出。`;
  }

  if (isFiniteNumber(entry.placeScore) && isFiniteNumber(entry.placeProb)) {
    return `placeScore ${r3(entry.placeScore)}が次点で、複勝率${pct(entry.placeProb)}を評価して相手候補に選出。`;
  }

  if (isFiniteNumber(entry.placeScore)) {
    return `馬券推奨本命と同じ placeScore 軸で次点のため相手候補に選出。`;
  }

  return "馬券推奨本命に近い安定指標を評価して相手候補に選出。";
}

export function buildWideLongshotExplanation(entry?: PickExplanationEntry | null): string {
  if (!entry) {
    return "ワイド高配当狙いは不在。妙味条件を満たす別軸候補がいなかった。";
  }

  const selectionReason = normalizeText(entry.selectionReason);
  if (selectionReason) {
    return selectionReason;
  }

  if (
    isFiniteNumber(entry.valueScore) &&
    isFiniteNumber(entry.placeReturnEdge) &&
    isFiniteNumber(entry.placeProb)
  ) {
    return `valueScore ${r3(entry.valueScore)} と複勝寄り期待値${pct(entry.placeReturnEdge)}が高く、複勝率${pct(entry.placeProb)}も残しているためワイド高配当狙いに選出。`;
  }

  if (isFiniteNumber(entry.valueScore) && isFiniteNumber(entry.placeReturnEdge)) {
    return `valueScore ${r3(entry.valueScore)} と複勝寄り期待値${pct(entry.placeReturnEdge)}を重視した別軸のワイド高配当狙い。`;
  }

  if (isFiniteNumber(entry.valueScore)) {
    return `本命次点ではなく、valueScore ${r3(entry.valueScore)} の妙味を優先してワイド高配当狙いに選出。`;
  }

  return "安定本線ではなく、配当妙味を優先した別軸候補。";
}

export function buildAgreementExplanation(
  agreementStatus: AgreementStatus,
  simEntry?: PickExplanationEntry | null,
  winEntry?: PickExplanationEntry | null
): string {
  if (agreementStatus === "agree") {
    return "試走と馬券推奨が一致。勝ち切り評価と安定評価が揃った。";
  }

  if (agreementStatus === "disagree") {
    return "総合試走1位と馬券推奨本命は不一致。勝ち切り評価と安定評価の差を分けて見ている。";
  }

  if (simEntry && !winEntry) {
    return "総合試走1位のみ取得でき、馬券推奨本命との比較は未完了。";
  }

  if (!simEntry && winEntry) {
    return "馬券推奨本命のみ取得でき、総合試走1位との比較は未完了。";
  }

  return "総合試走1位と馬券推奨本命の比較データがありません。";
}

export function buildDisagreementExplanation(
  agreementStatus: AgreementStatus,
  simEntry?: PickExplanationEntry | null,
  winEntry?: PickExplanationEntry | null
): string | null {
  if (agreementStatus !== "disagree") return null;
  if (!simEntry || !winEntry) {
    return "比較対象の片方しかないため、不一致理由は暫定表示です。";
  }

  if (
    isFiniteNumber(simEntry.overbetRisk) &&
    isFiniteNumber(winEntry.overbetRisk) &&
    simEntry.overbetRisk - winEntry.overbetRisk > 0.15
  ) {
    return "総合試走1位は過剰人気リスクが高く、馬券推奨本命ではその点を嫌った。";
  }

  if (
    isFiniteNumber(simEntry.top3Stability) &&
    isFiniteNumber(winEntry.top3Stability) &&
    winEntry.top3Stability - simEntry.top3Stability > 0.05
  ) {
    return "馬券推奨本命は3着内安定度をより強く評価して前に出た。";
  }

  if (
    isFiniteNumber(simEntry.placeScore) &&
    isFiniteNumber(winEntry.placeScore) &&
    winEntry.placeScore - simEntry.placeScore > 0.02
  ) {
    return `馬券推奨本命は placeScore ${r3(winEntry.placeScore)}で優位となり、安定評価で上回った。`;
  }

  if (
    isFiniteNumber(simEntry.marketSupport) &&
    isFiniteNumber(winEntry.marketSupport) &&
    winEntry.marketSupport - simEntry.marketSupport > 0.1
  ) {
    return "馬券推奨本命は市場支持とのバランスでも優位だった。";
  }

  return "総合試走1位は勝ち切り寄り、馬券推奨本命は安定寄りの評価になった。";
}

function buildStableOpponentCandidateExplanation(entry?: PickExplanationEntry | null): string {
  if (!entry) {
    return "相手候補は、馬券推奨本命を除いた中で安定指標を比較して選ぶ次点候補です。";
  }

  const selectionReason = normalizeText(entry.selectionReason);
  if (selectionReason) {
    return selectionReason;
  }

  const detailParts: string[] = [];
  if (isFiniteNumber(entry.placeProb)) detailParts.push(`placeProb ${pct(entry.placeProb)}`);
  if (isFiniteNumber(entry.top3Stability)) detailParts.push(`top3安定 ${pct(entry.top3Stability)}`);
  if (isFiniteNumber(entry.placeScore)) detailParts.push(`placeScore ${r3(entry.placeScore)}`);
  if (isFiniteNumber(entry.winProb)) detailParts.push(`simWinProb ${pct(entry.winProb)}`);
  if (isFiniteNumber(entry.scoreGap)) detailParts.push(`本命差 ${r3(entry.scoreGap)}`);

  if (detailParts.length > 0) {
    return `馬券推奨本命を除いた中で、placeProb を最優先に top3Stability・placeScore・simWinProb を比較し、安定次点として相手候補に選出。${detailParts.join(" / ")}`;
  }

  return "馬券推奨本命に次ぐ安定評価として相手候補に選出。3着内の残りやすさを重視しています。";
}

export function buildPickExplanations(params: {
  agreementStatus: AgreementStatus;
  simEntry?: PickExplanationEntry | null;
  winEntry?: PickExplanationEntry | null;
  opponentEntry?: PickExplanationEntry | null;
  wideEntry?: PickExplanationEntry | null;
}): PickExplanations {
  return {
    simHonmei: buildSimHonmeiExplanation(params.simEntry),
    tanpukuHonmei: buildTanpukuHonmeiExplanation(params.winEntry),
    opponentCandidate: buildStableOpponentCandidateExplanation(params.opponentEntry),
    wideLongshot: buildWideLongshotExplanation(params.wideEntry),
    agreement: buildAgreementExplanation(params.agreementStatus, params.simEntry, params.winEntry),
    disagreement: buildDisagreementExplanation(params.agreementStatus, params.simEntry, params.winEntry),
  };
}
