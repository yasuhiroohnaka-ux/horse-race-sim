function raceIdOf(race) {
  return String(race?.raceId ?? "").trim();
}

function racesById(races) {
  const byId = new Map();
  for (const race of Array.isArray(races) ? races : []) {
    const raceId = raceIdOf(race);
    if (raceId) {
      byId.set(raceId, race);
    }
  }
  return byId;
}

function raceIdentity(race) {
  if (race?.isSpecialRace !== true) return null;
  const label = String(race?.label ?? "").normalize("NFKC").replace(/\s+/g, "").trim();
  const venue = String(race?.venueKey ?? race?.venue ?? "").normalize("NFKC").trim();
  const day = String(race?.day ?? "").trim();
  return label && venue && day ? `${day}|${venue}|${label}` : null;
}

export function mergeRefreshedRaces({ previousWeekOf, weekOf, previousRaces, refreshedRaces }) {
  const refreshedById = racesById(refreshedRaces);

  if (previousWeekOf !== weekOf) {
    return {
      races: [...refreshedById.values()].sort((a, b) => raceIdOf(a).localeCompare(raceIdOf(b))),
      missingRaces: []
    };
  }

  const previousById = racesById(previousRaces);
  const mergedById = new Map();
  const refreshedIdentities = new Set([...refreshedById.values()].map(raceIdentity).filter(Boolean));

  for (const [raceId, refreshedRace] of refreshedById) {
    const previousRace = previousById.get(raceId);
    if (!previousRace) {
      mergedById.set(raceId, refreshedRace);
      continue;
    }

    const mergedRace = { ...previousRace, ...refreshedRace };
    if (previousRace.excludedReason === "SUPERSEDED_RACE_ID") delete mergedRace.excludedReason;
    if (previousRace.result != null) {
      mergedRace.result = previousRace.result;
    }
    mergedById.set(raceId, mergedRace);
  }

  const missingRaces = [];
  for (const [raceId, previousRace] of previousById) {
    if (refreshedById.has(raceId)) continue;
    const identity = raceIdentity(previousRace);
    mergedById.set(
      raceId,
      identity && refreshedIdentities.has(identity)
        ? { ...previousRace, excludedReason: "SUPERSEDED_RACE_ID" }
        : previousRace
    );
    missingRaces.push({
      raceId,
      label: String(previousRace?.label ?? "").trim()
    });
  }

  return {
    races: [...mergedById.values()].sort((a, b) => raceIdOf(a).localeCompare(raceIdOf(b))),
    missingRaces: missingRaces.sort((a, b) => a.raceId.localeCompare(b.raceId))
  };
}
