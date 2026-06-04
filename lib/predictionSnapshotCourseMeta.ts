import type { Course, PredictionOrigin } from "@/lib/types";

export type SnapshotCourseMeta = {
  raceId: string | null;
  raceDate: string | null;
  raceName: string | null;
  venue: string | null;
  venueKey: string | null;
  raceNumber: number | null;
  scheduledStartTime: string | null;
  snapshotType: "manual_snapshot" | "pre_race_final";
  predictionOrigin: PredictionOrigin;
};

function normalizeString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeRaceDate(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function extractRaceId(courseId: string | null): string | null {
  const match = String(courseId ?? "").match(/(\d{12})$/);
  return match?.[1] ?? null;
}

export function normalizeScheduledStartTime(raceDate: unknown, scheduledStartTime: unknown): string | null {
  const rawStartTime = normalizeString(scheduledStartTime);
  if (!rawStartTime) return null;

  const raceDateIso = normalizeRaceDate(raceDate);
  const timeMatch = rawStartTime.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch && raceDateIso) {
    const hour = timeMatch[1].padStart(2, "0");
    return `${raceDateIso}T${hour}:${timeMatch[2]}:00+09:00`;
  }

  return Number.isFinite(Date.parse(rawStartTime)) ? rawStartTime : null;
}

export function buildSnapshotCourseMeta(course: Course): SnapshotCourseMeta {
  const raceId = normalizeString(course.raceId) ?? extractRaceId(course.id);
  const raceDate = normalizeRaceDate(course.raceDate);
  const scheduledStartTime = normalizeScheduledStartTime(raceDate, course.scheduledStartTime);
  const liveCandidate = course.archived !== true && Boolean(raceId && raceDate && scheduledStartTime);

  return {
    raceId,
    raceDate,
    raceName: normalizeString(course.displayName) ?? normalizeString(course.name),
    venue: normalizeString(course.venue),
    venueKey: normalizeString(course.venueKey),
    raceNumber: Number.isFinite(Number(course.raceNumber)) ? Number(course.raceNumber) : null,
    scheduledStartTime,
    snapshotType: liveCandidate ? "pre_race_final" : "manual_snapshot",
    predictionOrigin: liveCandidate ? "saved_live" : "saved_manual",
  };
}
