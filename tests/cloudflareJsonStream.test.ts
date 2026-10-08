import assert from 'node:assert/strict';
import test from 'node:test';
import { publicReviewResponse, RETIRED_REVIEW_PATHS } from '../lib/publicReviewAccess.mjs';

test('old review links redirect to retained results, including query and RSC navigation', () => {
  for (const url of ['/archive','/archive?raceId=202605040209','/archive/?_rsc=old']) {
    const response=publicReviewResponse(new Request('https://test.invalid'+url,{headers:{RSC:'1'}}));
    assert.equal(response?.status,307);
    assert.equal(response?.headers.get('Location'),'/#performance');
  }
});
test('retired APIs reject all public reads and writes before touching storage', async () => {
  for (const path of RETIRED_REVIEW_PATHS) for(const method of ['GET','POST','HEAD']) {
    const response=publicReviewResponse(new Request('https://test.invalid'+path+'/?scope=all',{method}));
    assert.equal(response?.status,410,path);
    if(method==='HEAD')assert.equal(await response?.text(),'');
    else assert.equal((await response?.json()).summaryUrl,'/api/performance/summary');
  }
  for(const path of ['/sim','/api/performance/summary','/api/prediction-snapshots','/api/calibration-report']) {
    assert.equal(publicReviewResponse(new Request('https://test.invalid'+path)),null);
  }
});
