export const RACE_DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export function raceDayLabel(date) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))return null;
  const parsed=new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())?null:RACE_DAY_LABELS[parsed.getUTCDay()];
}
export function raceDiscoveryDates(weekOf) {
  const start=Date.parse(`${weekOf}T00:00:00Z`);
  if(!Number.isFinite(start))throw new Error('Invalid race discovery date');
  // Include the following Monday/Tuesday: holidays and replacement meetings can
  // continue beyond a calendar week. Actual calendar links choose the race days.
  return Array.from({length:9},(_,offset)=>new Date(start+offset*86400000).toISOString().slice(0,10));
}
export function calendarRaceDates(html) {
  return [...new Set([...String(html).matchAll(/(?:kaisai_date=|data-kaisaidate=["']?)(\d{8})/g)]
    .map(match=>`${match[1].slice(0,4)}-${match[1].slice(4,6)}-${match[1].slice(6,8)}`))].sort();
}
export function selectRaceDiscoveryDates(weekOf, calendarDates, knownDates=[]) {
  const window=raceDiscoveryDates(weekOf), allowed=new Set(window);
  const published=calendarDates.filter(date=>allowed.has(date));
  const dates=[...new Set([...published,...knownDates])].filter(date=>allowed.has(date)).sort();
  // A calendar outage must not silently revert to a weekend-only assumption.
  return published.length?dates:window;
}
export function raceDateFromWeek(weekOf, day) {
  const labels=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const offset=labels.indexOf(day);
  if(offset<0||!/^\d{4}-\d{2}-\d{2}$/.test(String(weekOf)))return null;
  return new Date(Date.parse(`${weekOf}T00:00:00Z`)+offset*86400000).toISOString().slice(0,10);
}
export function raceOddsOpening(date) {
  const previous=new Date(Date.parse(`${date}T00:00:00Z`)-86400000).toISOString().slice(0,10);
  return `${previous}T${raceDayLabel(date)==='Sat'?'18':'19'}:30:00+09:00`;
}
export function mergeDatedRaceSeed(seeds, seed) {
  const previous=seeds.get(seed.raceId);
  // A postponed race can remain linked from its original day. Dated lists are
  // authoritative; retain its later replacement date when the same ID recurs.
  if(!previous || previous.dateIso<seed.dateIso)seeds.set(seed.raceId,seed);
}
