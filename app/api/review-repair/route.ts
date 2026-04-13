import { NextResponse } from "next/server";
import { extractRaceId } from "@/lib/reviewRecords";
import { runReviewPipeline } from "@/lib/reviewPipeline";

type RepairPayload = {
  raceId?: string | null;
  includeArchives?: boolean;
  forceRetryNow?: boolean;
  refreshExisting?: boolean;
  debug?: boolean;
};

export async function POST(request: Request) {
  try {
    const payload = ((await request.json().catch(() => ({}))) ?? {}) as RepairPayload;
    const result = await runReviewPipeline({
      phase: "all",
      raceIdFilter: extractRaceId(payload.raceId),
      includeArchives: payload.includeArchives ?? true,
      refreshExisting: payload.refreshExisting ?? false,
      forceRetryNow: payload.forceRetryNow ?? Boolean(payload.raceId),
      debug: payload.debug ?? false,
    });

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to repair review records";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
