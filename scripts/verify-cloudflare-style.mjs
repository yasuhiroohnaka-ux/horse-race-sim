import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const phase=process.argv[2];
if(!['before','after'].includes(phase))throw new Error('Use before or after');
const weekly=JSON.parse((await fs.readFile('data/weekly-races.json','utf8')).replace(/^\uFEFF/,''));
const race=weekly.currentWeek.races[0];
const route='/api/horse-running-style?courseId='+encodeURIComponent(race.courseId);
const cookie='horse_running_style_overrides='+encodeURIComponent(JSON.stringify({[race.courseId]:{[String(race.horses[0].id)]:'Oikomi'}}));
const before=phase==='after'?JSON.parse(await fs.readFile('../evidence/oct6-style-before.json','utf8')):null;
const checks=[];
for(const label of ['plain','cookie']) {
  await new Promise(resolve=>setTimeout(resolve,2200-Date.now()%1000));
  const start=new Date().toISOString();
  const response=await fetch('https://horse-race-sim.svo-app.workers.dev'+route,{headers:label==='cookie'?{Cookie:cookie}:{},signal:AbortSignal.timeout(30000)});
  const data=await response.json();
  checks.push({label,route,start,end:new Date().toISOString(),status:response.status,ray:response.headers.get('cf-ray'),kind:response.headers.get('X-Horse-Response'),data});
  assert.equal(response.status,200);
  if(before)assert.deepEqual(data,before.checks.find(check=>check.label===label).data,label+' response unchanged');
}
await fs.writeFile('../evidence/oct6-style-'+phase+'.json',JSON.stringify({checkedAt:new Date().toISOString(),phase,checks},null,2));
console.log(JSON.stringify({phase,checks:checks.map(({data,...check})=>({...check,horses:Object.keys(data.runningStyles).length})),sameResponses:phase==='after'}));
