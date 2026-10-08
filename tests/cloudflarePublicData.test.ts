import assert from 'node:assert/strict';
import test from 'node:test';
import { serveDataResponse } from '../cloudflare/data-response.mjs';
import { snapshotMetadata } from '../lib/cloudflareSnapshotMetadata';
import { toNormalizedSnapshot } from '../lib/predictionSnapshotApi';
import { validPredictionRaceId } from '../lib/predictionRaceId.mjs';
import fs from 'node:fs/promises';

test('legacy course snapshot keys are preserved without allowing path traversal',()=>{
  for(const id of ['202605040209','nakayama-turf-1800','tokyo-dirt-1600'])assert.equal(validPredictionRaceId(id),true);
  for(const id of ['',null,'../data','constructor','__proto__'])assert.equal(validPredictionRaceId(id),false);
});

test('single-race reads retain snapshot priority, saved changes, new races and POST validation', async () => {
  const canonical=toNormalizedSnapshot(JSON.parse(await fs.readFile('tests/fixtures/cloudflare-snapshot.json','utf8')));
  const raceId=canonical.raceId;
  const metadata=await snapshotMetadata(canonical);
  const manifest={predictions:{[raceId]:{asset:'/one.json',preference:JSON.parse(metadata.preference),sha256:metadata.sha256}}};
  const saved=new Map<string,{body:string;customMetadata:Record<string,string>}>();
  const reads:string[]=[];
  const env={ASSETS:{fetch:async(request:Request)=>{
    reads.push(new URL(request.url).pathname);
    return Response.json({ok:true,snapshotsByRaceId:{[raceId]:canonical}});
  }},APP_DATA:{
    list:async()=>({objects:[...saved].map(([key,item])=>({key,customMetadata:item.customMetadata})),truncated:false}),
    get:async(key:string)=>saved.has(key)?{json:async()=>JSON.parse(saved.get(key)!.body)}:null,
    put:async(key:string,body:string,options:{customMetadata:Record<string,string>})=>{saved.set(key,{body,customMetadata:options.customMetadata});},
  }};
  const get=(id:string,method='GET')=>serveDataResponse(new Request('https://test.invalid/api/prediction-snapshots?raceId='+id,{method}),env,manifest);
  const post=(value:unknown)=>serveDataResponse(new Request('https://test.invalid/api/prediction-snapshots',{method:'POST',body:JSON.stringify(value)}),env,manifest);
  assert.deepEqual((await (await get(raceId))!.json()).snapshotsByRaceId,{[raceId]:canonical});
  assert.deepEqual(reads,['/one.json']);
  assert.equal((await post({}))?.status,400);
  const probe={...canonical,_test:'saved'};
  assert.equal((await post(probe))?.status,200);
  reads.length=0;
  assert.equal((await (await get(raceId))!.json()).snapshotsByRaceId[raceId]._test,'saved');
  assert.deepEqual(reads,[],'changed race reads only its R2 object');
  assert.equal(await (await get(raceId,'HEAD'))!.text(),'');
  assert.deepEqual((await (await get('209999999999'))!.json()).snapshotsByRaceId,{});
  assert.equal((await post({...probe,raceId:'209999999999'}))?.status,200);
  assert.equal((await (await get('209999999999'))!.json()).snapshotsByRaceId['209999999999']._test,'saved');
  // Restore exact original data under the same immutable snapshot ID.
  assert.equal((await post(canonical))?.status,200);
  assert.deepEqual((await (await get(raceId))!.json()).snapshotsByRaceId[raceId],canonical);
});

test('retired and unscoped routes cannot trigger full history or diagnostics loading',async()=>{
  const unreachable=new Proxy({}, {get(){throw new Error('Storage must not be accessed');}});
  for(const [route,status] of [['/api/performance',410],['/api/archive?raceId=123',410],['/api/prediction-snapshots',400],['/api/prediction-snapshots?raceId=../data',400],['/api/performance/summary?scope=all',400]] as const) {
    const response=await serveDataResponse(new Request('https://test.invalid'+route),unreachable,{});
    assert.equal(response?.status,status,route);
  }
});
