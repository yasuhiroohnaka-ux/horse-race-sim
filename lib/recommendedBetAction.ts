import type {
  PickClassificationHint,
  RecommendedBetAction,
  RecommendedBetDecision,
} from "@/lib/types";
import {
  buildRecommendedBetDecision as buildRecommendedBetDecisionCore,
  isRecommendedBetAction as isRecommendedBetActionCore,
  resolveRecommendedBetActionFromClassificationHint as resolveFromHintCore,
} from "@/lib/recommendedBetDecisionCore.mjs";

// 決定ロジックの実体は lib/recommendedBetDecisionCore.mjs (単一実装)。
// このファイルは TypeScript 側へ型を付けるラッパー。
// scripts/keiba-routine.mjs (plain node) も同じ Core を import する。

export function isRecommendedBetAction(value: unknown): value is RecommendedBetAction {
  return isRecommendedBetActionCore(value);
}

export function resolveRecommendedBetActionFromClassificationHint(
  classificationHint: PickClassificationHint | null | undefined
): RecommendedBetAction {
  return resolveFromHintCore(classificationHint) as RecommendedBetAction;
}

export function normalizeRecommendedBetAction(value: unknown): RecommendedBetAction {
  return isRecommendedBetAction(value) ? value : "unknown";
}

export function deriveRecommendedBetActionForSelection(
  value: unknown,
  classificationHint: PickClassificationHint | null | undefined
): RecommendedBetAction {
  return isRecommendedBetAction(value)
    ? value
    : resolveRecommendedBetActionFromClassificationHint(classificationHint);
}

export type RecommendedBetDecisionInput = {
  sourceStatus?: string | null;
  livePreRaceEligible?: boolean | null;
  classificationHint?: PickClassificationHint | { classification?: unknown; reason?: unknown } | null;
  explicitAction?: unknown;
  winProb?: number | null;
  tanRoi?: number | null;
  scoreGap?: number | null;
  placeProb?: number | null;
  top3Stability?: number | null;
  valueScore?: number | null;
  fieldSize?: number | null;
  engineAgreement?: boolean | null;
  overbetLabel?: string | null;
  oddsSource?: string | null;
  runningStyleSource?: string | null;
  previousRaceSource?: string | null;
  hasSelectionLog?: boolean;
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function buildUnknownRecommendedBetDecision(
  riskFlags: string[] = [],
  reasons: string[] = []
): RecommendedBetDecision {
  return {
    action: "unknown",
    confidence: "unknown",
    reasons: unique(reasons),
    riskFlags: unique(riskFlags),
    source: riskFlags.length ? "safety_rule" : "fallback",
  };
}

export function normalizeRecommendedBetDecision(value: unknown): RecommendedBetDecision | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<RecommendedBetDecision>;
  if (!isRecommendedBetAction(candidate.action)) return null;
  const confidence =
    candidate.confidence === "high" ||
    candidate.confidence === "medium" ||
    candidate.confidence === "low" ||
    candidate.confidence === "unknown"
      ? candidate.confidence
      : candidate.action === "unknown"
        ? "unknown"
        : "low";
  const source =
    candidate.source === "explicit_live_rule" ||
    candidate.source === "safety_rule" ||
    candidate.source === "fallback" ||
    candidate.source === "unknown"
      ? candidate.source
      : candidate.action === "unknown"
        ? "fallback"
        : "unknown";
  return {
    action: candidate.action,
    confidence,
    reasons: Array.isArray(candidate.reasons) ? candidate.reasons.map(String).filter(Boolean) : [],
    riskFlags: Array.isArray(candidate.riskFlags) ? candidate.riskFlags.map(String).filter(Boolean) : [],
    source,
  };
}

export function buildRecommendedBetDecision(input: RecommendedBetDecisionInput): RecommendedBetDecision {
  return buildRecommendedBetDecisionCore(input) as RecommendedBetDecision;
}
