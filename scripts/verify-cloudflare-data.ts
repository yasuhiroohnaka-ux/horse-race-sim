import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { GET as summaryGET } from '../app/api/performance/summary/route';
import { loadPreferredPredictionSnapshots } from '../lib/readPredictionSnapshots';
import { createHash } from 'node:crypto';
const summary=await (await summaryGET(new Request('https://test.invalid/api/performance/summary'))).json();
const before=JSON.parse(await fs.readFile('../evidence/oct6-summary-before.json','utf8'));
const categories=JSON.parse(await fs.readFile('../evidence/oct6-categories-before.json','utf8'));
const {categoryReturnStats,...panel}=summary;
assert.deepEqual(panel,before,'retained panel totals/scope/settlement date unchanged');
assert.deepEqual(categoryReturnStats,categories,'post text category statistics unchanged');
const manifestText=await fs.readFile('dist/server/data-manifest.mjs','utf8');
const manifest=JSON.parse(manifestText.replace(/^export default /,'').replace(/;\s*$/,''));
const snapshots=await loadPreferredPredictionSnapshots();
const weekly=JSON.parse((await fs.readFile('data/weekly-races.json','utf8')).replace(/^\uFEFF/,''));
const liveWeekly=JSON.parse(await fs.readFile('dist/client/__data/data/weekly-races.json','utf8'));
assert.deepEqual(liveWeekly,{currentWeek:weekly.currentWeek},'all current-week fields preserved without public archive loading');
for(const[id,value]of Object.entries(snapshots)) {
  const asset=JSON.parse(await fs.readFile('dist/client'+manifest.predictions[id].asset,'utf8'));
  assert.deepEqual(asset,{ok:true,snapshotsByRaceId:{[id]:value}});
}
const {hashes}=JSON.parse(await fs.readFile('../evidence/oct6-review-detach-preserved.json','utf8'));
for(const[file,hash]of Object.entries(hashes)) {
  assert.equal(createHash('sha256').update(await fs.readFile(file)).digest('hex'),hash,file+' preserved');
}
const result={checkedAt:new Date().toISOString(),samePanel:true,sameCategoryStats:true,snapshotAssets:Object.keys(snapshots).length,protectedFiles:Object.keys(hashes).length,rawDataAndCalibrationUnchanged:true,currentWeekUnchanged:true,liveWeeklyBytes:Buffer.byteLength(JSON.stringify(liveWeekly))};
await fs.writeFile('../evidence/oct6-detach-data-regression.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
