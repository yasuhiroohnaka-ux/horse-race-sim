import { NextResponse } from "next/server";
import { getWeeklyNoteDraft } from "@/lib/noteDraft";

export async function GET() {
  try {
    const draft = await getWeeklyNoteDraft();
    return NextResponse.json({
      ok: true,
      ...draft,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to build note draft";
    return NextResponse.json(
      {
        ok: false,
        weekKey: null,
        generatedAt: null,
        format: "markdown",
        content: "",
        error: message,
      },
      { status: 500 }
    );
  }
}
