import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const ROOT = process.cwd();
const STATE_PATH = path.join(ROOT, "data", "routine-state.json");

export async function GET() {
  try {
    const raw = await fs.readFile(STATE_PATH, "utf8");
    const state = JSON.parse(raw.replace(/^\uFEFF/, ""));
    return NextResponse.json({
      performance: state.performance ?? null,
      updatedAt: state.performance?.updatedAt ?? null,
    });
  } catch {
    return NextResponse.json({ performance: null, updatedAt: null });
  }
}

