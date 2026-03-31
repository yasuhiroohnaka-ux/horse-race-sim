import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  DEFAULT_PREDICTION_ORIGIN,
  DEFAULT_SCORING_VERSION,
  normalizePredictionOrigin,
  normalizeScoringVersion,
} from "@/lib/predictionSnapshots";
import type { PredictionSnapshot } from "@/lib/types";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const SNAPSHOT_PATH = path.join(DATA_DIR, "prediction-snapshots.jsonl");

function isPredictionSnapshot(value: unknown): value is PredictionSnapshot {
  if (!value || typeof value !== "object") return false;

  const snapshot = value as Partial<PredictionSnapshot>;
  return (
    typeof snapshot.snapshotId === "string" &&
    typeof snapshot.raceId === "string" &&
    typeof snapshot.courseId === "string" &&
    typeof snapshot.capturedAt === "string" &&
    typeof snapshot.modelFamily === "string" &&
    typeof snapshot.modelVersion === "string" &&
    typeof snapshot.scoringConfigHash === "string" &&
    typeof snapshot.simulationCount === "number" &&
    Array.isArray(snapshot.rankedRows) &&
    snapshot.condition !== undefined &&
    snapshot.signalReasons !== undefined &&
    snapshot.marketMeta !== undefined
  );
}

function toNormalizedSnapshot(value: PredictionSnapshot): PredictionSnapshot {
  return {
    ...value,
    predictionOrigin: normalizePredictionOrigin(value.predictionOrigin, DEFAULT_PREDICTION_ORIGIN),
    scoringVersion: normalizeScoringVersion(value.scoringVersion, DEFAULT_SCORING_VERSION),
  };
}

function toIsoTime(value: string): number {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  try {
    const raw = await fs.readFile(SNAPSHOT_PATH, "utf8");
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const latestByRaceId: Record<string, PredictionSnapshot> = {};
    for (const line of lines) {
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      if (!isPredictionSnapshot(parsed)) continue;
      const normalized = toNormalizedSnapshot(parsed);
      const raceId = String(normalized.raceId ?? "");
      if (!raceId) continue;

      const existing = latestByRaceId[raceId];
      if (!existing || toIsoTime(normalized.capturedAt) >= toIsoTime(existing.capturedAt)) {
        latestByRaceId[raceId] = normalized;
      }
    }

    return NextResponse.json({
      ok: true,
      snapshotsByRaceId: latestByRaceId,
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      return NextResponse.json({ ok: true, snapshotsByRaceId: {} });
    }

    const message = error instanceof Error ? error.message : "failed to read prediction snapshots";
    return NextResponse.json({ ok: false, error: message, snapshotsByRaceId: {} }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as unknown;
    if (!isPredictionSnapshot(payload)) {
      return NextResponse.json({ ok: false, error: "invalid prediction snapshot payload" }, { status: 400 });
    }
    const normalizedPayload = toNormalizedSnapshot(payload);

    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.appendFile(SNAPSHOT_PATH, `${JSON.stringify(normalizedPayload)}\n`, "utf8");

    return NextResponse.json({
      ok: true,
      snapshotId: normalizedPayload.snapshotId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to save prediction snapshot";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
