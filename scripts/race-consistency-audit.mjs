function raceIdOf(race) {
  return String(race?.raceId ?? "").trim();
}

function normalizedLabel(race) {
  return String(race?.label ?? "").normalize("NFKC").replace(/\s+/g, "").trim();
}

export function auditRaceConsistency(weekly) {
  const duplicateLabels = [];
  const raceNumberMismatches = [];
  const weeks = [weekly?.currentWeek, ...(weekly?.archives ?? [])];

  for (const week of weeks) {
    const byIdentity = new Map();
    for (const race of week?.races ?? []) {
      const raceId = raceIdOf(race);
      const encodedRaceNumber = /^\d{12}$/.test(raceId) ? Number(raceId.slice(-2)) : null;
      const raceNumber = Number(race?.raceNumber);
      if (encodedRaceNumber !== null && Number.isFinite(raceNumber) && encodedRaceNumber !== raceNumber) {
        raceNumberMismatches.push({ raceId, raceNumber, encodedRaceNumber });
      }

      const label = normalizedLabel(race);
      const venue = String(race?.venueKey ?? race?.venue ?? "").normalize("NFKC").trim();
      const day = String(race?.day ?? "").trim();
      if (!raceId || !label || !venue || !day) continue;
      const key = `${week.weekOf}|${day}|${venue}|${label}`;
      const existing = byIdentity.get(key);
      if (existing) {
        existing.raceIds.push(raceId);
      } else {
        byIdentity.set(key, { weekOf: week.weekOf, day, venue, label, raceIds: [raceId] });
      }
    }
    duplicateLabels.push(...[...byIdentity.values()].filter((entry) => new Set(entry.raceIds).size > 1));
  }

  return { duplicateLabels, raceNumberMismatches };
}
