import fs from 'node:fs/promises';
import path from 'node:path';
import { loadPreferredPredictionSnapshots } from '../lib/readPredictionSnapshots';
import { snapshotMetadata } from '../lib/cloudflareSnapshotMetadata';
import { validPredictionRaceId } from '../lib/predictionRaceId.mjs';

const root = '/__cloudflare-data/snapshots';
const output = path.resolve('dist/client');
const snapshots = await loadPreferredPredictionSnapshots();
const predictions: Record<string, unknown> = {};
await fs.mkdir(path.join(output, root), {recursive:true});
for (const [raceId, snapshot] of Object.entries(snapshots)) {
  if (!validPredictionRaceId(raceId)) throw new Error('Invalid race ID in build inputs');
  const metadata = await snapshotMetadata(snapshot);
  const asset = `${root}/${raceId}.json`;
  const body = JSON.stringify({ok:true,snapshotsByRaceId:{[raceId]:snapshot}});
  if (Buffer.byteLength(body) >= 25*1024*1024) throw new Error('Snapshot exceeds asset limit');
  await fs.writeFile(path.join(output,asset),body);
  predictions[raceId] = {asset,preference:JSON.parse(metadata.preference),sha256:metadata.sha256};
}
await fs.writeFile('dist/server/data-manifest.mjs',`export default ${JSON.stringify({predictions})};\n`);
// The remaining live odds/conditions/style handlers use only currentWeek.
// Keep historical data for offline evaluation, without parsing it on live reads.
const weekly=JSON.parse((await fs.readFile('data/weekly-races.json','utf8')).replace(/^\uFEFF/,''));
await fs.writeFile(path.join(output,'__data/data/weekly-races.json'),JSON.stringify({currentWeek:weekly.currentWeek}));
console.log(`Prepared ${Object.keys(predictions).length} individual prediction assets; no full review/diagnostics payloads.`);
