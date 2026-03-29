import { NextResponse } from "next/server";
import { getWeeklyDiagnostics } from "@/lib/weeklyDiagnostics";
import {
  buildWeeklyDiagnosticsComparison,
  ensureWeeklyDiagnosticsStored,
  toAvailableWeeklyDiagnosticsEntries,
} from "@/lib/weeklyDiagnosticsStore";

export async function GET() {
  try {
    const diagnostics = await getWeeklyDiagnostics();
    const { saved, storeKey, entry, store } = await ensureWeeklyDiagnosticsStored(diagnostics);
    const comparison = buildWeeklyDiagnosticsComparison(entry, store);

    return NextResponse.json({
      ok: true,
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
