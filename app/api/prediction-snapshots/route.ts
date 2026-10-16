import path from 'node:path';
import { NextResponse } from 'next/server';
import { appendDataFile } from '@/lib/dataFile.mjs';
import { isPredictionSnapshot, toNormalizedSnapshot } from '@/lib/predictionSnapshotApi';
import { loadPreferredPredictionSnapshots } from '@/lib/readPredictionSnapshots';
import { validPredictionRaceId } from '@/lib/predictionRaceId.mjs';

const SNAPSHOT_PATH = path.join(process.cwd(), 'data', 'prediction-snapshots.jsonl');

export async function GET(request: Request) {
  const raceId = new URL(request.url).searchParams.get('raceId');
  if (!raceId || !validPredictionRaceId(raceId)) {
    return NextResponse.json({ok: false, error: 'A valid raceId is required.'}, {status: 400});
  }
  try {
    const snapshots = await loadPreferredPredictionSnapshots();
    return NextResponse.json({ok: true, snapshotsByRaceId: snapshots[raceId] ? {[raceId]: snapshots[raceId]} : {}});
  } catch {
    return NextResponse.json({ok: false, error: 'Failed to read prediction snapshot.'}, {status: 500});
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as unknown;
    if (!isPredictionSnapshot(payload)) {
      return NextResponse.json({ ok: false, error: "invalid prediction snapshot payload" }, { status: 400 });
    }
    const normalizedPayload = toNormalizedSnapshot(payload);

    await appendDataFile(SNAPSHOT_PATH, `${JSON.stringify(normalizedPayload)}\n`, "utf8");

    return NextResponse.json({
      ok: true,
      snapshotId: normalizedPayload.snapshotId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to save prediction snapshot";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
