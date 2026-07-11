const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_PATTERN = /^(\d{1,2}):(\d{2})$/;

function toTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function getRaceStartTimestamp(race) {
  const scheduled = String(race?.scheduledStartTime ?? "").trim();
  if (!scheduled) return null;

  const direct = Date.parse(scheduled);
  if (Number.isFinite(direct) && scheduled.includes("T")) return direct;

  const raceDate = String(race?.raceDate ?? "").trim();
  const timeMatch = scheduled.match(HHMM_PATTERN);
  if (!ISO_DATE_PATTERN.test(raceDate) || !timeMatch) return null;

  const hour = String(Number(timeMatch[1])).padStart(2, "0");
  const timestamp = Date.parse(`${raceDate}T${hour}:${timeMatch[2]}:00+09:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isBeforeRaceStart(race, instant = new Date(), minimumLeadMs = 0) {
  const start = getRaceStartTimestamp(race);
  const now = toTimestamp(instant);
  const lead = Number.isFinite(Number(minimumLeadMs)) ? Math.max(0, Number(minimumLeadMs)) : 0;
  return start !== null && now !== null && now + lead < start;
}

export function isAfterRaceCompletionBuffer(race, instant = new Date(), bufferMs = 30 * 60_000) {
  const start = getRaceStartTimestamp(race);
  const now = toTimestamp(instant);
  return start !== null && now !== null && now >= start + bufferMs;
}

export function classifyRecommendationTiming(race, postedAt) {
  const start = getRaceStartTimestamp(race);
  const posted = toTimestamp(postedAt);
  if (start === null || posted === null) return "unknown";
  return posted < start ? "live_pre_race" : "retrospective";
}
