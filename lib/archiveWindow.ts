import type { ArchiveRow } from './archiveModel';

export function latestCompletedWindow(rows: Pick<ArchiveRow, 'date' | 'record' | 'sourceRace'>[]) {
  const dates = rows.filter(row => row.record?.actualTop3HorseIds.length || row.sourceRace.result?.top3HorseIds.length)
    .map(row => row.date).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
  const to = dates.at(-1);
  if (!to) return null;
  return { from: new Date(Date.parse(`${to}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0,10), to };
}
