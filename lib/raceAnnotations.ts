import {
  OAKS_2026_COURSE_IDS,
  OAKS_2026_RACE_KEY,
  oaks2026TrendNotes,
  oaksHeuristicHints,
} from "@/data/annotations/oaks-2026";
import type { Course, RaceTrendHeuristicHint, RaceTrendNote } from "@/lib/types";

interface RaceTrendNoteSet {
  raceKey: string;
  courseIds: string[];
  matchRaceNames: string[];
  notes: RaceTrendNote[];
  heuristicHints?: RaceTrendHeuristicHint[];
}

const RACE_TREND_NOTE_SETS: RaceTrendNoteSet[] = [
  {
    raceKey: OAKS_2026_RACE_KEY,
    courseIds: OAKS_2026_COURSE_IDS,
    matchRaceNames: ["オークス", "優駿牝馬"],
    notes: oaks2026TrendNotes,
    heuristicHints: oaksHeuristicHints,
  },
];

function normalizeText(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\u3000/g, "")
    .replace(/\s+/g, "")
    .replace(/[\u30fb\uff65\-_.#]/g, "");
}

function findRaceTrendNoteSet(course: Course): RaceTrendNoteSet | null {
  const normalizedCourseId = normalizeText(course.id);
  const normalizedRaceText = normalizeText(
    [
      course.name,
      course.displayName,
      course.hashtag,
      course.venue,
      course.grade,
      String(course.raceNumber ?? ""),
    ]
      .filter(Boolean)
      .join(" ")
  );

  return (
    RACE_TREND_NOTE_SETS.find((set) => {
      if (set.courseIds.map(normalizeText).includes(normalizedCourseId)) return true;
      return set.matchRaceNames.some((name) => normalizedRaceText.includes(normalizeText(name)));
    }) ?? null
  );
}

export function findRaceTrendNotes(course: Course): RaceTrendNote[] {
  return findRaceTrendNoteSet(course)?.notes ?? [];
}

export function findRaceHeuristicHints(course: Course): RaceTrendHeuristicHint[] {
  return findRaceTrendNoteSet(course)?.heuristicHints ?? [];
}
