import type {
  RaceReviewRecord,
  ReviewMissingReason,
  ReviewProcessingStatus,
  ReviewSelectionHorse,
} from "@/lib/types";

export const REVIEW_MAX_RETRY = 5;
export const REVIEW_RETRY_DELAY_MINUTES = 20;

function uniqueReasons(reasons: ReviewMissingReason[]) {
  return [...new Set(reasons)];
}

function hasSettledSelection(selection: ReviewSelectionHorse | null, requireTan: boolean) {
  if (!selection) return false;
  if (selection.settlementStatus !== "settled") return false;
  if (requireTan && selection.tanOutcome === "not_settled") return false;
  if (selection.fukuOutcome === "not_settled") return false;
  return true;
}

function hasResolvedPair(record: Pick<RaceReviewRecord, "pair" | "honmei" | "opponent">) {
  if (!record.honmei || !record.opponent) return false;
  if (record.pair.wideOutcome === "not_settled" || record.pair.wideOutcome === "hit_missing_payout") return false;
  return record.pair.widePayoutSource === "official";
}

export function normalizeLegacyReviewStatus(status: ReviewProcessingStatus | null | undefined): ReviewProcessingStatus {
  switch (status) {
    case "review_ready":
    case "review_failed":
    case "discovered":
    case "retry_scheduled":
    case "review_partial":
      return status;
    case "not_snapshotted":
      return "discovered";
    case "snapshotted":
    case "result_pending":
    case "payout_pending":
      return "review_partial";
    default:
      return "discovered";
  }
}

export function getMissingReasons(params: {
  record: Pick<
    RaceReviewRecord,
    "snapshot" | "honmei" | "opponent" | "actualWinnerHorseId" | "actualTop3HorseIds" | "pair"
  >;
  resultAvailable: boolean;
  payoutsAvailable: boolean;
  joinKeyMismatch?: boolean;
}): ReviewMissingReason[] {
  const reasons: ReviewMissingReason[] = [];
  const { record, resultAvailable, payoutsAvailable, joinKeyMismatch = false } = params;

  if (joinKeyMismatch) {
    reasons.push("JOIN_KEY_MISMATCH");
  }
  if (!record.snapshot) {
    reasons.push("NO_SNAPSHOT");
  }
  if (!record.honmei) {
    reasons.push("NO_MAIN_PICK");
  }
  if (!record.opponent) {
    reasons.push("NO_PARTNER_PICK");
  }

  const hasResult = Boolean(record.actualWinnerHorseId && record.actualTop3HorseIds.length > 0);
  if (!hasResult) {
    reasons.push(resultAvailable ? "NO_RESULT" : "UPSTREAM_NOT_READY");
  } else {
    const hasResolvedPayouts =
      hasSettledSelection(record.honmei, true) &&
      hasSettledSelection(record.opponent, false) &&
      hasResolvedPair(record);

    if (!hasResolvedPayouts) {
      reasons.push(payoutsAvailable ? "NO_PAYOUT" : "UPSTREAM_PAYOUT_NOT_READY");
    }
  }

  return uniqueReasons(reasons);
}

export function isReviewComplete(params: {
  record: Pick<
    RaceReviewRecord,
    "snapshot" | "honmei" | "opponent" | "actualWinnerHorseId" | "actualTop3HorseIds" | "pair"
  >;
  resultAvailable: boolean;
  payoutsAvailable: boolean;
  joinKeyMismatch?: boolean;
}) {
  return getMissingReasons(params).length === 0;
}

export function hasAnyReviewCore(record: Pick<RaceReviewRecord, "snapshot" | "honmei" | "opponent">) {
  return Boolean(record.snapshot || record.honmei || record.opponent);
}

export function shouldRetryReviewRecord(record: Pick<RaceReviewRecord, "status" | "nextRetryAt">, now: Date) {
  if (record.status === "review_ready" || record.status === "review_failed") return false;
  if (!record.nextRetryAt) return true;
  const nextRetryAt = Date.parse(record.nextRetryAt);
  return !Number.isFinite(nextRetryAt) || nextRetryAt <= now.getTime();
}

export function getNextRetryAt(now: Date, retryCount: number) {
  const delayMinutes = REVIEW_RETRY_DELAY_MINUTES * Math.max(1, retryCount + 1);
  return new Date(now.getTime() + delayMinutes * 60_000).toISOString();
}

export function deriveIncompleteStatus(params: {
  record: Pick<RaceReviewRecord, "retryCount" | "snapshot" | "honmei" | "opponent">;
  missingReasons: ReviewMissingReason[];
}): ReviewProcessingStatus {
  const { record, missingReasons } = params;
  if (
    record.retryCount >= REVIEW_MAX_RETRY &&
    missingReasons.some((reason) => reason !== "UPSTREAM_NOT_READY" && reason !== "UPSTREAM_PAYOUT_NOT_READY")
  ) {
    return "review_failed";
  }
  if (hasAnyReviewCore(record)) {
    return "review_partial";
  }
  return "retry_scheduled";
}

export function formatMissingReason(reason: ReviewMissingReason) {
  switch (reason) {
    case "NO_SNAPSHOT":
      return "snapshot 未取得";
    case "NO_MAIN_PICK":
      return "本命候補 未取得";
    case "NO_PARTNER_PICK":
      return "相手候補 未取得";
    case "NO_RESULT":
      return "結果未反映";
    case "NO_PAYOUT":
      return "払戻不完全";
    case "JOIN_KEY_MISMATCH":
      return "join key 不一致";
    case "UPSTREAM_NOT_READY":
      return "結果待ち";
    case "UPSTREAM_PAYOUT_NOT_READY":
      return "払戻待ち";
    default:
      return reason;
  }
}
