function rowFor(snapshot, horseId) {
  return snapshot.rankedRows?.find((row) => String(row.horseId) === String(horseId)) ?? null;
}

function selectionFor(snapshot, role, horseId) {
  return snapshot.selectionLog?.entries?.find((entry) =>
    entry.role === role && String(entry.horseId) === String(horseId)) ?? null;
}

export function liveSnapshotForRace(reviewStore, race, scoringVersion) {
  const raceId = String(race?.raceId ?? "");
  const snapshot = reviewStore?.records?.[raceId]?.snapshot ?? null;
  if (!snapshot || String(snapshot.raceId) !== raceId ||
    snapshot.raceDate !== race.raceDate ||
    snapshot.sourceStatus !== "live_pre_race" ||
    snapshot.predictionOrigin !== "saved_live" ||
    snapshot.livePreRaceEligible !== true ||
    snapshot.scoringVersion !== scoringVersion ||
    snapshot.dataQuality?.fieldComplete === false ||
    !snapshot.selectionLog?.entries?.length) return null;
  const capturedAt = Date.parse(String(snapshot.capturedAt ?? ""));
  const startAt = Date.parse(String(snapshot.scheduledStartTime ?? ""));
  if (!Number.isFinite(capturedAt) || !Number.isFinite(startAt) || capturedAt >= startAt) return null;
  return snapshot;
}

function pickFromEntry(snapshot, entry) {
  if (!entry?.horseId) return null;
  const row = rowFor(snapshot, entry.horseId);
  if (!row) return null;
  return {
    ...entry,
    horse: {
      id: String(entry.horseId),
      name: entry.horseName ?? row.horseName,
      realOdds: entry.realOdds ?? row.realOdds,
      oddsSource: row.oddsSource ?? snapshot.marketMeta?.oddsSource ?? null,
    },
  };
}

export function recommendationFromSnapshot(race, snapshot) {
  if (!snapshot) return null;
  const winEntry = selectionFor(snapshot, "honmei", snapshot.honmeiHorseId);
  const winPick = pickFromEntry(snapshot, winEntry);
  if (!winPick?.recommendedBetDecision || !winPick.classificationHint) return null;
  const opponentPick = pickFromEntry(snapshot,
    selectionFor(snapshot, "opponent", snapshot.opponentHorseId));
  const widePick = pickFromEntry(snapshot,
    selectionFor(snapshot, "wide", snapshot.valueHorseId));
  const valuePick = pickFromEntry(snapshot,
    selectionFor(snapshot, "value", snapshot.valueHorseId));
  const simRow = rowFor(snapshot, snapshot.selectionLog.entries.find((entry) =>
    entry.role === "simulation_leader")?.horseId ?? snapshot.rankedRows?.[0]?.horseId);
  const snapshotRace = {
    ...race,
    horses: (snapshot.rankedRows ?? []).map((row) => ({
      id: row.horseId, name: row.horseName, realOdds: row.realOdds,
    })),
  };
  return {
    race: snapshotRace,
    sourceRace: race,
    snapshot,
    tanpuku: {
      scoringVersion: snapshot.scoringVersion,
      winPick,
      opponentPick,
      widePick,
      valuePick,
      winRunnerUp: winEntry?.runnerUpHorseId
        ? { horseId: winEntry.runnerUpHorseId, horseName: winEntry.runnerUpHorseName,
          placeScore: winEntry.runnerUpPlaceScore, placeProb: winEntry.runnerUpPlaceProb }
        : null,
      valueRunnerUp: valuePick?.runnerUpHorseId
        ? { horseId: valuePick.runnerUpHorseId, horseName: valuePick.runnerUpHorseName,
          placeScore: valuePick.runnerUpPlaceScore, placeProb: valuePick.runnerUpPlaceProb }
        : null,
    },
    simBestHorse: simRow ? { horse: { id: simRow.horseId, name: simRow.horseName }, score: simRow.score } : null,
  };
}

export function selectSnapshotWinCandidate(races, reviewStore, scoringVersion) {
  return races.map((race) => recommendationFromSnapshot(race,
    liveSnapshotForRace(reviewStore, race, scoringVersion)))
    .filter((candidate) => candidate?.tanpuku?.winPick?.classificationHint?.classification === "win" &&
      candidate.tanpuku.winPick.recommendedBetDecision.action === "win")
    .sort((left, right) => (right.simBestHorse?.score ?? -Infinity) -
      (left.simBestHorse?.score ?? -Infinity))[0] ?? null;
}
