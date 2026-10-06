import assert from 'node:assert/strict';
import test from 'node:test';
import { serveRunningStyleRead } from '../cloudflare/running-style-response.mjs';

const courseId='tokyo-turf-1600';
const race={courseId,horses:[{id:'1',runningStyle:'Nige'},{id:'2',runningStyle:'Senko'},{id:'3',runningStyle:'Sashi'},{id:'4',runningStyle:'Oikomi'}]};
function fixture({weeklyInR2=false,storeMissing=false}={}) {
  const reads:string[]=[];
  const weekly={currentWeek:{races:[race]}};
  const store={[courseId]:{'1':{runningStyle:' Senko '},'2':{runningStyle:'bad'},'3':{runningStyle:'Sashi',source:'manual'}}};
  const env={APP_DATA:{get:async(key:string)=>{
    reads.push('r2:'+key);
    if(key==='data/weekly-races.json')return weeklyInR2?{text:async()=>JSON.stringify(weekly)}:null;
    return storeMissing?null:{text:async()=>JSON.stringify(store)};
  }},ASSETS:{fetch:async(request:Request)=>{
    const name=new URL(request.url).pathname;reads.push('asset:'+name);
    return name.endsWith('weekly-races.json')?Response.json(weekly):new Response('',{status:404});
  }}};
  return {env,reads,weekly,store};
}
const request=(cookie='',method='GET',id=courseId)=>new Request('https://test.invalid/api/horse-running-style?courseId='+encodeURIComponent(id),{method,headers:cookie?{Cookie:cookie}:{}});
test('GET retains R2 > cookie > race priority and exactly the same three reads',async()=>{
  const {env,reads}=fixture();
  const cookie={[courseId]:{'1':'Nige','2':'Oikomi','3':'Nige','4':'invalid'}};
  const response=await serveRunningStyleRead(request('horse_running_style_overrides='+encodeURIComponent(JSON.stringify(cookie))),env);
  assert.equal(response?.status,200);
  assert.deepEqual(await response?.json(),{courseId,runningStyles:{'1':'Senko','2':'Oikomi','3':'Sashi'},overrideStorage:{kind:'cloudflare_r2',available:true,reason:null}});
  assert.deepEqual(reads,['r2:data/weekly-races.json','asset:/__data/data/weekly-races.json','r2:data/running-style-overrides.json']);
});
test('current-week R2 data still takes precedence; missing store and invalid cookie preserve original race styles',async()=>{
  const {env,reads}=fixture({weeklyInR2:true,storeMissing:true});
  const response=await serveRunningStyleRead(request('horse_running_style_overrides=%7Bbroken'),env);
  assert.deepEqual((await response?.json()).runningStyles,{'1':'Nige','2':'Senko','3':'Sashi','4':'Oikomi'});
  assert.ok(!reads.includes('asset:/__data/data/weekly-races.json'));
  assert.equal((await serveRunningStyleRead(request('', 'GET','absent'),env))?.status,404);
  assert.equal((await serveRunningStyleRead(request('', 'GET',''),env))?.status,400);
});
test('HEAD returns no body, POST remains in the existing handler, storage errors stay visible',async()=>{
  const {env}=fixture();
  assert.equal(await (await serveRunningStyleRead(request('','HEAD'),env))?.text(),'');
  assert.equal(await serveRunningStyleRead(request('','POST'),new Proxy({},{get(){throw Error('no read');}})),null);
  assert.equal((await serveRunningStyleRead(request(),{APP_DATA:{get:async()=>{throw Error('unavailable');}}}))?.status,500);
});
