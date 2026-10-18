import fs from 'node:fs/promises';
import { loadWeeklyDiagnosticsContext, buildWeeklyDiagnostics } from '../lib/weeklyDiagnostics';
const outputs: Record<string,unknown> = {};
for(const scope of ['all','saved_only','live_pre_race_only'] as const) {
  const context=await loadWeeklyDiagnosticsContext(scope);
  outputs[scope]=buildWeeklyDiagnostics(context);
}
await fs.writeFile('../evidence/oct6-original-diagnostics.json',JSON.stringify(outputs),{flag:'wx'});
console.log('Captured original diagnostics for all three scopes.');
