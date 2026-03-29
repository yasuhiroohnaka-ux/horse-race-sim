import { NextResponse } from "next/server";
import { getWeeklyNotePayload } from "@/lib/notePayload";

export async function GET() {
  try {
    const payload = await getWeeklyNotePayload();
    return NextResponse.json({
      ok: true,
      payload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to build note payload";
    return NextResponse.json(
      {
        ok: false,
        error: message,
        payload: null,
      },
      { status: 500 }
    );
  }
}
