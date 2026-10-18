import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWeeklyDiagnostics, loadWeeklyDiagnosticsContext, prepareWeeklyDiagnostics, finishPreparedDiagnostics, updatePreparedDiagnostics, type DiagnosticsContext } from '../lib/weeklyDiagnostics';

function stable(value: unknown) {
  return JSON.parse(JSON.stringify(value, (key, item) => key === 'generatedAt' ? '<generated>' : item));
}
function oneRace(context: DiagnosticsContext, id: string): DiagnosticsContext {
  const select = <T>(values: Record<string,T>) => id in values ? { [id]: values[id] } : {};
  return { ...context, races: context.races.filter(race => race.raceId === id),
    snapshotsByRaceId: select(context.snapshotsByRaceId), settlementsByRaceId: select(context.settlementsByRaceId),
    reviewsByRaceId: select(context.reviewsByRaceId), widePayoutsByRaceId: select(context.widePayoutsByRaceId), horseLookupsByRaceId: select(context.horseLookupsByRaceId) };
}
for (const scope of ['all','saved_only','live_pre_race_only'] as const) {
  test(`prepared diagnostics match all fields and changed race contributions: ${scope}`, async () => {
    const context = await loadWeeklyDiagnosticsContext(scope);
    const prepared = prepareWeeklyDiagnostics(context);
    assert.deepEqual(stable(finishPreparedDiagnostics(structuredClone(prepared))), stable(buildWeeklyDiagnostics(context)));
    const races = context.races.filter(race => race.result?.top3HorseIds.length && context.snapshotsByRaceId[String(race.raceId)]);
    // Exercise more than one race, both candidate ranking and counters, version metadata,
    // segments, wide payouts, expectation grades, and empty/changed rank rows.
    for (const race of [races[0], races[Math.floor(races.length/2)], races.at(-1)].filter(Boolean)) {
      const id = String(race!.raceId);
      const previous = context.snapshotsByRaceId[id];
      const next = { ...previous, honmeiHorseId: race!.result!.top3HorseIds[1],
        modelVersion: 'regression-new-model', scoringConfigHash: 'regression-new-config',
        rankedRows: previous.rankedRows.slice().reverse().map((row,index)=>({...row,rank:index+1})) };
      updatePreparedDiagnostics(prepared, oneRace(context,id), next);
      context.snapshotsByRaceId[id] = next;
    }
    assert.deepEqual(stable(finishPreparedDiagnostics(prepared)), stable(buildWeeklyDiagnostics(context)));
  });
}
