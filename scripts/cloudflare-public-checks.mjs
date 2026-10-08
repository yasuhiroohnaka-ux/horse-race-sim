import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
export async function checkPublicRoutes(fetchRoute, {live=false}={}) {
  const checks=[];
  async function request(route, expected, options={}) {
    // Separate requests and avoid second boundaries for route-level CPU matching.
    if(live)await new Promise(resolve=>setTimeout(resolve,2200-Date.now()%1000));
    const start=new Date().toISOString();
    const response=await fetchRoute(route,{...options,redirect:'manual'});
    const body=await response.text();
    checks.push({route,method:options.method??'GET',start,end:new Date().toISOString(),status:response.status,bytes:Buffer.byteLength(body),ray:response.headers.get('cf-ray'),kind:response.headers.get('X-Horse-Response'),location:response.headers.get('location')});
    assert.equal(response.status,expected,route+': '+body.slice(0,160));
    return {response,body,data:response.headers.get('content-type')?.includes('json')?JSON.parse(body):null};
  }
  let restoreNeeded=false,restored=false;
  const canonical=JSON.parse(await fs.readFile('../evidence/oct6-save-test-canonical-snapshot.json','utf8'));
  const snapshotPath='/api/prediction-snapshots?raceId='+canonical.raceId;
  const post=payload=>request('/api/prediction-snapshots',200,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  try {
    const home=await request('/',200);
    assert.match(home.body,/id="performance"/);
    assert.ok(!home.body.includes('href="/archive"'));
    for(const route of ['/sim','/monitor']) {
      const page=await request(route,200);
      assert.ok(!page.body.includes('href="/archive"'));
    }
    const redirect=await request('/archive?raceId='+canonical.raceId,307);
    assert.equal(redirect.response.headers.get('location'),'/#performance');
    const rsc=await request('/archive?_rsc=old',307,{headers:{RSC:'1'}});
    assert.equal(rsc.response.headers.get('location'),'/#performance');
    for(const route of ['/api/performance','/api/archive','/api/weekly-diagnostics','/api/note-payload','/api/note-draft'])await request(route,410);
    await request('/api/review-repair',410,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const summary=await request('/api/performance/summary',200);
    const expected=JSON.parse(await fs.readFile('dist/client/__cloudflare-static/summary.body','utf8'));
    assert.deepEqual(summary.data,expected);
    assert.ok(summary.body.length<12000,'only small aggregate result is published');
    const calibration=await request('/api/calibration-report',200);
    const expectedCal=JSON.parse(await fs.readFile('dist/client/__cloudflare-static/calibration.body','utf8'));
    assert.deepEqual(calibration.data,expectedCal);
    await request('/api/prediction-snapshots',400);
    await request('/api/performance/summary?scope=all',400);
    const before=await request(snapshotPath,200);
    assert.deepEqual(before.data.snapshotsByRaceId[canonical.raceId],canonical);
    const weekly=JSON.parse((await fs.readFile('data/weekly-races.json','utf8')).replace(/^\uFEFF/,''));
    const courseId=weekly.currentWeek.races[0].courseId;
    const styles=await request('/api/horse-running-style?courseId='+encodeURIComponent(courseId),200);
    assert.equal(styles.data.courseId,courseId);
    assert.ok(styles.data.runningStyles);
    const probe={...canonical,_cloudflareMigrationProbe:'approved-detached-review-check'};
    restoreNeeded=true;
    await post(probe);
    const readback=await request(snapshotPath,200);
    assert.equal(readback.data.snapshotsByRaceId[canonical.raceId]._cloudflareMigrationProbe,probe._cloudflareMigrationProbe);
    // Snapshot writes must not change settled results or retrain coefficients.
    assert.deepEqual((await request('/api/performance/summary',200)).data,expected);
    await post(canonical);
    restored=true;restoreNeeded=false;
    assert.deepEqual((await request(snapshotPath,200)).data.snapshotsByRaceId[canonical.raceId],canonical);
  } finally {
    if(restoreNeeded) {await post(canonical);restored=true;}
    await fs.writeFile('../evidence/'+(live?'oct6-detach-live':'oct6-detach-local-worker')+'.json',JSON.stringify({checkedAt:new Date().toISOString(),restoredCanonical:restored,checks},null,2));
  }
  return {ok:true,restoredCanonical:restored,checks};
}
