import { isPreferredPredictionSnapshot } from '../lib/sourceStatus';
import { isPredictionSnapshot, toNormalizedSnapshot } from '../lib/predictionSnapshotApi';
import { snapshotMetadata } from '../lib/cloudflareSnapshotMetadata';
import { publicReviewResponse } from '../lib/publicReviewAccess.mjs';
import { validPredictionRaceId } from '../lib/predictionRaceId.mjs';
import { serveRunningStyleRead } from './running-style-response.mjs';

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Horse-Response': 'race-snapshot' };
const json = (value, status=200) => new Response(JSON.stringify(value), { status, headers });

async function readSnapshot(env, entry) {
  if (entry.snapshot) return entry.snapshot;
  const stored = await env.APP_DATA.get(entry.key);
  if (!stored) throw new Error('Saved snapshot changed during read; retry');
  return toNormalizedSnapshot(await stored.json());
}

async function preferredSavedSnapshot(env, raceId, baseline) {
  let selected, preference = baseline?.preference, cursor;
  do {
    const page = await env.APP_DATA.list({ prefix: 'snapshots/', cursor, include: ['customMetadata'] });
    for (const object of page.objects) {
      let metadata = object.customMetadata, snapshot;
      if (metadata?.version !== '1') {
        const stored = await env.APP_DATA.get(object.key);
        if (!stored) continue;
        const raw = await stored.json();
        if (!isPredictionSnapshot(raw)) continue;
        snapshot = toNormalizedSnapshot(raw);
        metadata = await snapshotMetadata(snapshot);
      }
      const candidate = JSON.parse(metadata.preference);
      if (String(candidate.raceId) !== raceId || !isPreferredPredictionSnapshot(candidate, preference)) continue;
      selected = { key: object.key, metadata, snapshot };
      preference = candidate;
    }
    cursor = page.truncated ? page.cursor : undefined;
    if (page.truncated && !cursor) throw new Error('Missing snapshot pagination cursor');
  } while (cursor);
  return selected;
}

export async function serveDataResponse(request, env, manifest) {
  const runningStyle = await serveRunningStyleRead(request, env);
  if (runningStyle) return runningStyle;
  const retired = publicReviewResponse(request);
  if (retired) return retired;
  const url = new URL(request.url);
  const pathname = decodeURI(url.pathname).replace(/\/+$/, '');
  if (pathname === '/api/performance/summary' && url.search) {
    // The public panel uses the default scope. Never execute a full history
    // aggregation on the Worker because of an old filter/bookmark.
    return json({ ok: false, error: 'Filtered summaries are not published.', summaryUrl: '/api/performance/summary' }, 400);
  }
  if (pathname !== '/api/prediction-snapshots') return null;
  if (request.method === 'POST') {
    try {
      const payload = await request.json();
      if (!isPredictionSnapshot(payload)) return json({ok:false,error:'invalid prediction snapshot payload'},400);
      const snapshot = toNormalizedSnapshot(payload), id = String(snapshot.snapshotId ?? '');
      if (!/^[a-fA-F0-9-]{36}$/.test(id)) throw new Error('Invalid snapshot ID');
      await env.APP_DATA.put(`snapshots/${id}.json`, JSON.stringify(snapshot), {customMetadata: await snapshotMetadata(snapshot)});
      return json({ok:true,snapshotId:snapshot.snapshotId});
    } catch(error) {
      return json({ok:false,error:error instanceof Error ? error.message : 'failed to save prediction snapshot'},500);
    }
  }
  if (!['GET','HEAD'].includes(request.method)) return json({ok:false,error:'Method not allowed'},405);
  const raceId = url.searchParams.get('raceId');
  if (!validPredictionRaceId(raceId)) return json({ok:false,error:'A valid raceId is required.'},400);
  try {
    const baseline = manifest.predictions[raceId];
    const selected = await preferredSavedSnapshot(env, raceId, baseline);
    if (selected && selected.metadata.sha256 !== baseline?.sha256) {
      const snapshot = await readSnapshot(env, selected);
      return request.method === 'HEAD' ? new Response(null,{headers}) : json({ok:true,snapshotsByRaceId:{[raceId]:snapshot}});
    }
    if (!baseline) return request.method === 'HEAD' ? new Response(null,{headers}) : json({ok:true,snapshotsByRaceId:{}});
    const response = await env.ASSETS.fetch(new Request(`https://assets.invalid${baseline.asset}`));
    if (!response.ok) throw new Error('Missing generated prediction snapshot');
    return new Response(request.method === 'HEAD' ? null : response.body,{headers});
  } catch {
    return json({ok:false,error:'Failed to read prediction snapshot.'},500);
  }
}
