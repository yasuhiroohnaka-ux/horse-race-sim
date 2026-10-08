import fs from 'node:fs/promises';
import { loadReviewRecords } from '../lib/reviewRecords';
import { loadWeeklyDiagnosticsContext, buildWeeklyDiagnostics } from '../lib/weeklyDiagnostics';

const records = Object.values(await loadReviewRecords());
const snapshots = (await fs.readFile('data/prediction-snapshots.jsonl','utf8')).split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s));
const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v));
const latest = records.filter(r=>r.actualTop3HorseIds.length>0).map(r=>r.meta.raceDate ?? '').sort().at(-1)!;
const result: Record<string,unknown> = {all:{records:records.length, recordBytes:bytes(records), snapshots:snapshots.length,snapshotBytes:bytes(snapshots)}};
for(const [label,date] of [['latestRace',latest],['today','2026-10-06']]) {
  const from=new Date(Date.parse(date+'T00:00:00Z')-6*86400000).toISOString().slice(0,10);
  const included=records.filter(r=>String(r.meta.raceDate)>=from && String(r.meta.raceDate)<=date);
  const ids=new Set(included.map(r=>r.raceId));
  const ss=snapshots.filter(s=>ids.has(s.raceId));
  result[label]={from,to:date,records:included.length,recordBytes:bytes(included),snapshots:ss.length,snapshotBytes:bytes(ss)};
}
const context=await loadWeeklyDiagnosticsContext('all');
result.context=Object.fromEntries(Object.entries(context).map(([k,v])=>[k,{count:Array.isArray(v)?v.length:typeof v==='object'?Object.keys(v).length:undefined,bytes:bytes(v)}]));
const samples=[];
for(let i=0;i<6;i++) {const start=process.cpuUsage();buildWeeklyDiagnostics(context);const t=process.cpuUsage(start);samples.push((t.user+t.system)/1000)}
result.diagnosticsNodeCpuMs=samples;
await fs.writeFile('../evidence/oct6-archive-size-audit.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
