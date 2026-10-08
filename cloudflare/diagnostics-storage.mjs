const candidateKeys=['bestHitCandidates','worstMissCandidates','disagreementCandidates','valueHitCandidates'];
export function packDiagnostics(prepared) {
  const representatives={},misses={},versions=prepared.groups.all.versionsByRaceId;
  for(const group of Object.values(prepared.groups)) {
    group.versionRaceIds=Object.keys(group.versionsByRaceId);
    delete group.versionsByRaceId;
    for(const key of candidateKeys) {
      group.state[key]=group.state[key].map(entry=> {
        const id=entry.race.raceId;
        representatives[id]??={};representatives[id][key]=entry.race;
        return {score:entry.score,race:{raceId:id,date:entry.race.date}};
      });
    }
    group.state.raceMisses=group.state.raceMisses.map(entry=>{misses[entry.raceId]=entry;return entry.raceId;});
  }
  return {packed:{...prepared,misses,versions},representatives};
}
export function unpackDiagnostics(packed) {
  for(const group of Object.values(packed.groups)) {
    group.versionsByRaceId=Object.fromEntries(group.versionRaceIds.map(id=>[id,packed.versions[id]]));
    group.state.raceMisses=group.state.raceMisses.map(id=>packed.misses[id]);
  }
  return packed;
}
export async function hydrateRepresentatives(prepared,readRace) {
  const cache=new Map();
  for(const key of candidateKeys) {
    const candidates=prepared.groups.all.state[key];
    const chosen=candidates.slice().sort((a,b)=>b.score-a.score||b.race.date.localeCompare(a.race.date)).slice(0,3);
    for(const entry of chosen) {
      if('category' in entry.race)continue;
      const id=entry.race.raceId;
      if(!cache.has(id))cache.set(id,await readRace(id));
      entry.race=cache.get(id)[key];
    }
  }
}
