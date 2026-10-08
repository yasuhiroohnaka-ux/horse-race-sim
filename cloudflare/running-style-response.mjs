import { parseCookie } from 'next/dist/compiled/@edge-runtime/cookies';
import { buildRunningStylesResponse, normalizeOverrideStore } from '../lib/runningStyleData.mjs';

async function readJson(env, key, optional=false) {
  const stored=await env.APP_DATA.get(key);
  let text;
  if(stored)text=await stored.text();
  else {
    const response=await env.ASSETS.fetch(new Request('https://assets.invalid/__data/'+key));
    if(response.status===404 && optional)return {};
    if(!response.ok)throw new Error('Running style data is unavailable');
    text=await response.text();
  }
  return JSON.parse(text.replace(/^\uFEFF/,''));
}

/** Read-only fast path. POST keeps the existing storage/cookie/error contract. */
export async function serveRunningStyleRead(request, env) {
  const url=new URL(request.url);
  if(decodeURI(url.pathname).replace(/\/+$/,'')!=='/api/horse-running-style' || !['GET','HEAD'].includes(request.method))return null;
  const headers={'Cache-Control':'no-store','X-Horse-Response':'running-style-data'};
  const json=(body,status=200)=>request.method==='HEAD'?new Response(null,{status,headers}):Response.json(body,{status,headers});
  const courseId=url.searchParams.get('courseId')?.trim()??'';
  if(!courseId)return json({error:'courseId is required'},400);
  try {
    // Preserve both R2 precedence and the same currentWeek JSON parse as before.
    const weekly=await readJson(env,'data/weekly-races.json');
    const race=(weekly.currentWeek?.races??[]).find(race=>race?.courseId===courseId);
    if(!race)return json({error:'race not found for courseId'},404);
    const store=normalizeOverrideStore(await readJson(env,'data/running-style-overrides.json',true));
    const value=parseCookie(request.headers.get('cookie')??'').get('horse_running_style_overrides')??'';
    let cookie={};
    try { const parsed=JSON.parse(value);if(parsed && typeof parsed==='object')cookie=parsed; } catch { /* same cookie fallback as Next handler */ }
    const runningStyles=buildRunningStylesResponse(race,store[courseId]??{},cookie[courseId]??{});
    return json({courseId,runningStyles,overrideStorage:{kind:'cloudflare_r2',available:true,reason:null}});
  } catch {
    return json({error:'Running style data is unavailable'},500);
  }
}
