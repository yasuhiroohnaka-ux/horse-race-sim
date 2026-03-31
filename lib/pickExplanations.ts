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
  valueCandidate: string;
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
  if (label === "overbet_high") return "市場過熱リスク高";
  if (label === "overbet_moderate") return "市場過熱リスク注意";
  return null;
}

export function buildSimHonmeiExplanation(entry?: PickExplanationEntry | null): string {
  if (!entry) {
    return "シミュ本命データがなく、根拠表示は最小限です。";
  }

  const contributors = getContributorLabels(entry);
  const signalReason = normalizeText(entry.signalReason);

  if (isFiniteNumber(entry.winProb) && contributors.length > 0) {
    return `winProb ${pct(entry.winProb)}で、${joinJapanese(contributors)}が支えたシミュレーション1位。`;
  }

  if (isFiniteNumber(entry.winProb)) {
    return `winProb ${pct(entry.winProb)}と能力評価が最上位で、勝ち切り期待はこの馬がもっとも高い。`;
  }

  if (contributors.length > 0) {
    return `${joinJapanese(contributors)}が上位で、シミュレーション順位1位になった。`;
  }

  if (signalReason) {
    return signalReason;
  }

  return "能力評価と適性評価の合計が上位で、シミュレーション順位1位になった。";
}

export function buildTanpukuHonmeiExplanation(entry?: PickExplanationEntry | null): string {
  if (!entry) {
    return "単複 recommendation がなく、単複本命は表示できません。";
  }

  if (isFiniteNumber(entry.placeScore) && isFiniteNumber(entry.top3Stability) && entry.top3Stability >= 0.55) {
    return `placeScore ${r3(entry.placeScore)}が最上位で、3着内安定度${pct(entry.top3Stability)}を重視するとこの馬が軸候補。`;
  }

  if (isFiniteNumber(entry.placeScore) && isFiniteNumber(entry.marketSupport) && entry.marketSupport >= 0.65) {
    return `placeScore ${r3(entry.placeScore)}が最上位で、市場支持も踏まえた複勝軸評価ではこの馬を優先。`;
  }

  if (isFiniteNumber(entry.placeScore) && isFiniteNumber(entry.overbetRisk) && entry.overbetRisk <= 0.12) {
    return `placeScore ${r3(entry.placeScore)}が上位で、市場過熱を避けつつ複勝軸としての安定感を優先した。`;
  }

  const selectionReason = normalizeText(entry.selectionReason);
  if (selectionReason) {
    return selectionReason;
  }

  if (isFiniteNumber(entry.placeScore)) {
    return `placeScore ${r3(entry.placeScore)}が上位で、複勝軸としてはこちらを優先した。`;
  }

  return "複勝軸の安定度を優先して単複本命に選出した。";
}

export function buildValueCandidateExplanation(entry?: PickExplanationEntry | null): string {
  if (!entry) {
    return "該当なし。quality gate を通る妙味候補はいなかった。";
  }

  if (
    isFiniteNumber(entry.valueScore) &&
    isFiniteNumber(entry.placeReturnEdge) &&
    isFiniteNumber(entry.longshotBonus) &&
    entry.longshotBonus >= 0.1
  ) {
    return `valueScore ${r3(entry.valueScore)}が最上位で、複勝期待値${pct(entry.placeReturnEdge)}と人気妙味のバランスで浮上。`;
  }

  if (isFiniteNumber(entry.valueScore) && isFiniteNumber(entry.placeReturnEdge)) {
    return `valueScore ${r3(entry.valueScore)}が最上位で、複勝期待値${pct(entry.placeReturnEdge)}を評価して妙味候補に選出。`;
  }

  const selectionReason = normalizeText(entry.selectionReason);
  if (selectionReason) {
    return selectionReason;
  }

  if (isFiniteNumber(entry.valueScore)) {
    return `valueScore ${r3(entry.valueScore)}が上位で、回収期待のバランスから妙味候補に浮上した。`;
  }

  return "quality gate を満たした中で、回収期待を優先して妙味候補に選出した。";
}

export function buildAgreementExplanation(
  agreementStatus: AgreementStatus,
  simEntry?: PickExplanationEntry | null,
  winEntry?: PickExplanationEntry | null
): string {
  if (agreementStatus === "agree") {
    return "シミュレーション1位と単複本命は一致。能力評価と複勝軸評価が同じ方向を向いている。";
  }

  if (agreementStatus === "disagree") {
    return "シミュレーション1位と単複本命は不一致。勝率評価と複勝軸評価を画面上で分けて表示している。";
  }

  if (simEntry && !winEntry) {
    return "シミュ本命のみ取得できたため、単複本命との比較はまだできない。";
  }

  if (!simEntry && winEntry) {
    return "単複本命のみ取得できたため、シミュ本命との比較はまだできない。";
  }

  return "シミュ本命と単複本命の比較データがありません。";
}

export function buildDisagreementExplanation(
  agreementStatus: AgreementStatus,
  simEntry?: PickExplanationEntry | null,
  winEntry?: PickExplanationEntry | null
): string | null {
  if (agreementStatus !== "disagree") return null;
  if (!simEntry || !winEntry) {
    return "比較対象が片方のみのため、不一致理由は最小表示です。";
  }

  if (
    isFiniteNumber(simEntry.overbetRisk) &&
    isFiniteNumber(winEntry.overbetRisk) &&
    simEntry.overbetRisk - winEntry.overbetRisk > 0.15
  ) {
    return "シミュレーション1位は市場過熱リスクが高く、単複本命では別馬を優先した。";
  }

  if (
    isFiniteNumber(simEntry.top3Stability) &&
    isFiniteNumber(winEntry.top3Stability) &&
    winEntry.top3Stability - simEntry.top3Stability > 0.05
  ) {
    return "シミュレーション1位は勝率寄りだが、単複本命は3着内安定度を重視して差し替えた。";
  }

  if (
    isFiniteNumber(simEntry.placeScore) &&
    isFiniteNumber(winEntry.placeScore) &&
    winEntry.placeScore - simEntry.placeScore > 0.02
  ) {
    return `単複本命は placeScore ${r3(winEntry.placeScore)}で上回り、複勝軸としてはこちらを優先した。`;
  }

  if (
    isFiniteNumber(simEntry.marketSupport) &&
    isFiniteNumber(winEntry.marketSupport) &&
    winEntry.marketSupport - simEntry.marketSupport > 0.1
  ) {
    return "単複本命は市場支持と複勝軸評価のバランスで上回り、こちらを優先した。";
  }

  return "シミュレーション1位は勝率寄りだが、単複本命は複勝軸の安定度を重視して差し替えた。";
}

export function buildPickExplanations(params: {
  agreementStatus: AgreementStatus;
  simEntry?: PickExplanationEntry | null;
  winEntry?: PickExplanationEntry | null;
  valueEntry?: PickExplanationEntry | null;
}): PickExplanations {
  return {
    simHonmei: buildSimHonmeiExplanation(params.simEntry),
    tanpukuHonmei: buildTanpukuHonmeiExplanation(params.winEntry),
    valueCandidate: buildValueCandidateExplanation(params.valueEntry),
    agreement: buildAgreementExplanation(params.agreementStatus, params.simEntry, params.winEntry),
    disagreement: buildDisagreementExplanation(params.agreementStatus, params.simEntry, params.winEntry),
  };
}
