import { NextResponse } from "next/server";
import { getWeeklyDiagnostics } from "@/lib/weeklyDiagnostics";
import {
  buildWeeklyDiagnosticsComparison,
  ensureWeeklyDiagnosticsStored,
  toAvailableWeeklyDiagnosticsEntries,
} from "@/lib/weeklyDiagnosticsStore";
import type { DiagnosticsAggregationScope } from "@/lib/types";

function normalizeAggregationScope(value: string | null): DiagnosticsAggregationScope {
  return value === "all" ? "all" : "saved_only";
}

export async function GET(request: Request) {
  try {
    const scope = normalizeAggregationScope(new URL(request.url).searchParams.get("scope"));
    const diagnostics = await getWeeklyDiagnostics(scope);
    const { saved, storeKey, entry, store } = await ensureWeeklyDiagnosticsStored(diagnostics);
    const comparison = buildWeeklyDiagnosticsComparison(entry, store);

    return NextResponse.json({
      ok: true,
      scope,
      diagnostics: entry.diagnostics,
      saved,
      storeKey,
      comparison,
      availableEntries: toAvailableWeeklyDiagnosticsEntries(store),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to build weekly diagnostics";
    return NextResponse.json(
      {
        ok: false,
        error: message,
        scope: "saved_only",
        diagnostics: null,
        saved: false,
        storeKey: null,
        comparison: null,
        availableEntries: [],
      },
      { status: 500 }
    );
  }
}
