function toJstDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeIsoDate(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function isOfficialOddsSource(value) {
  return String(value ?? "").trim().toLowerCase() === "official";
}

function hasPositiveOdds(horse) {
  const odds = Number(horse?.realOdds ?? horse?.odds ?? 0);
  return Number.isFinite(odds) && odds > 0;
}

function shouldApplyRaceDayNoOddsExclusion(race, horses, now = new Date()) {
  const raceDate = normalizeIsoDate(race?.raceDate ?? race?.date);
  if (!raceDate || raceDate !== toJstDateString(now)) return false;

  const raceHasOfficialOdds =
    isOfficialOddsSource(race?.oddsSource) || horses.some((horse) => isOfficialOddsSource(horse?.oddsSource));
  if (!raceHasOfficialOdds) return false;

  return horses.some((horse) => hasPositiveOdds(horse));
}

export function isRaceDayNoOddsExcludedHorse(horse) {
  return !hasPositiveOdds(horse);
}

export function filterRaceDayNoOddsHorses(horses, race = {}, now = new Date()) {
  const entries = Array.isArray(horses) ? horses : [];
  if (!shouldApplyRaceDayNoOddsExclusion(race, entries, now)) return entries;
  return entries.filter((horse) => !isRaceDayNoOddsExcludedHorse(horse));
}

export function getRaceDayNoOddsExclusions(horses, race = {}, now = new Date()) {
  const entries = Array.isArray(horses) ? horses : [];
  if (!shouldApplyRaceDayNoOddsExclusion(race, entries, now)) {
    return { active: false, excluded: [], included: entries };
  }

  const excluded = entries.filter((horse) => isRaceDayNoOddsExcludedHorse(horse));
  return {
    active: true,
    excluded,
    included: entries.filter((horse) => !isRaceDayNoOddsExcludedHorse(horse)),
  };
}

export { toJstDateString };
