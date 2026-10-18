import assert from 'node:assert/strict';
import test from 'node:test';
import { raceDayLabel, calendarRaceDates, selectRaceDiscoveryDates, raceOddsOpening, raceDateFromWeek, mergeDatedRaceSeed } from '../lib/raceCalendar.mjs';
import { resolveCalendarRaceDate, type ArchiveRow } from '../lib/archiveModel';
import { latestCompletedWindow } from '../lib/archiveWindow';

test('JRA 2026-10-10/11/12 three-day meeting includes Monday on the following calendar week',()=>{
  // JRA https://www.jra.go.jp/news/202610/100402.html : Tokyo/Kyoto meeting day 5 on Monday.
  const dates=calendarRaceDates('<a href="?kaisai_date=20261010"></a><a href="?kaisai_date=20261011"></a><a href="?kaisai_date=20261012"></a>');
  assert.deepEqual(selectRaceDiscoveryDates('2026-10-05',dates),['2026-10-10','2026-10-11','2026-10-12']);
  assert.equal(raceDayLabel('2026-10-12'),'Mon');
  assert.equal(resolveCalendarRaceDate({raceId:'202605040511',raceDate:'2026-10-12',weekOf:'2026-10-05'}),'2026-10-12');
  assert.equal(raceOddsOpening('2026-10-12'),'2026-10-11T19:30:00+09:00');
});
test('replacement Tuesday, month boundary, calendar outage and known dated entries remain discoverable',()=>{
  assert.deepEqual(selectRaceDiscoveryDates('2026-10-05',['2026-10-13']),['2026-10-13']);
  assert.ok(selectRaceDiscoveryDates('2026-09-28',[]).includes('2026-10-06'));
  assert.ok(selectRaceDiscoveryDates('2026-10-05',[],['2026-10-10']).includes('2026-10-12'));
  assert.equal(resolveCalendarRaceDate({raceId:'202605040511',raceDate:'2026-10-13'}),'2026-10-13');
  assert.equal(raceDateFromWeek('2026-10-12','Tue'),'2026-10-13');
  assert.equal(raceDateFromWeek('2026-10-12','invalid'),null);
  const seeds=new Map();
  for(const dateIso of ['2026-10-11','2026-10-13','2026-10-11'])mergeDatedRaceSeed(seeds,{raceId:'202605040511',dateIso});
  assert.equal(seeds.get('202605040511').dateIso,'2026-10-13');
});
test('seven-day archive anchors on completed date, ignores future entries and remains stable across a break',()=>{
  const rows=[{date:'2026-10-04',record:{actualTop3HorseIds:['1','2','3']},sourceRace:{}},{date:'2026-10-12',record:{actualTop3HorseIds:[]},sourceRace:{}}] as ArchiveRow[];
  assert.deepEqual(latestCompletedWindow(rows),{from:'2026-09-28',to:'2026-10-04'});
  assert.equal(latestCompletedWindow(rows.slice(1)),null);
  rows[1].record!.actualTop3HorseIds=['2','3','4'];
  assert.deepEqual(latestCompletedWindow(rows),{from:'2026-10-06',to:'2026-10-12'});
});
