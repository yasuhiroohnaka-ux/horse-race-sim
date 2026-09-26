function raceIdOf(race) {
  return String(race?.raceId ?? "").trim();
}

function normalizedLabel(race) {
  return String(race?.label ?? "").normalize("NFKC").replace(/\s+/g, "").trim();
}

export function dayFromRaceDate(value) {
  const date = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) return null;
  const weekday = new Date(timestamp).getUTCDay();
  return weekday === 6 ? "Sat" : weekday === 0 ? "Sun" : null;
}

export function auditRaceConsistency(weekly) {
  const duplicateLabels = [];
  const raceNumberMismatches = [];
  const dayMismatches = [];
  const incorrectRaceIds = [];
  const weeks = [weekly?.currentWeek, ...(weekly?.archives ?? [])];

  for (const week of weeks) {
    const byIdentity = new Map();
    for (const race of week?.races ?? []) {
      const raceId = raceIdOf(race);
      if (race?.excludedReason === "INCORRECT_RACE_ID") incorrectRaceIds.push(raceId);
      const encodedRaceNumber = /^\d{12}$/.test(raceId) ? Number(raceId.slice(-2)) : null;
      const raceNumber = Number(race?.raceNumber);
      if (encodedRaceNumber !== null && Number.isFinite(raceNumber) && encodedRaceNumber !== raceNumber) {
        raceNumberMismatches.push({ raceId, raceNumber, encodedRaceNumber });
      }

      const label = normalizedLabel(race);
      const venue = String(race?.venueKey ?? race?.venue ?? "").normalize("NFKC").trim();
      const day = String(race?.day ?? "").trim();
      const actualDay = dayFromRaceDate(race?.raceDate);
      if (actualDay && day !== actualDay) {
        dayMismatches.push({ raceId, raceDate: race.raceDate, day, expectedDay: actualDay });
      }
      if (!raceId || !label || !venue || !day) continue;
      const effectiveDay = race?.raceDate || day;
      const key = `${week.weekOf}|${effectiveDay}|${venue}|${label}`;
      const existing = byIdentity.get(key);
      if (existing) {
        existing.raceIds.push(raceId);
      } else {
        byIdentity.set(key, { weekOf: week.weekOf, day, venue, label, raceIds: [raceId] });
      }
    }
    duplicateLabels.push(...[...byIdentity.values()].filter((entry) => new Set(entry.raceIds).size > 1));
  }

  return { duplicateLabels, raceNumberMismatches, dayMismatches, incorrectRaceIds };
}
