import { Course } from "./types";
import { GENERATED_WEEKLY_RACES } from "./generatedRaceSchedule";
export type { Course };

const INNER_OUTER_BY_TRACK: Record<string, number> = {
  nakayama: -1,
  hanshin: 0,
  tokyo: 0,
  chukyo: 0,
  kyoto: -1,
  niigata: 1,
  kokura: -1,
  fukushima: -1,
  sapporo: -1,
  hakodate: -1,
};

const FRONT_BACK_BY_TRACK: Record<string, number> = {
  nakayama: 2,
  hanshin: -1,
  tokyo: -2,
  chukyo: 0,
  kyoto: 0,
  niigata: -1,
  kokura: 1,
  fukushima: 1,
  sapporo: 0,
  hakodate: 0,
};

const ARCHIVED_COURSE_LIST: Course[] = [
  {
    id: "tokyo-dirt-1600",
    name: "東京 ダート 1600m (フェブラリーS)",
    distance: 1600,
    surface: "Dirt",
    straightLength: 501.6,
    hashtag: "#フェブラリーS",
    archived: true,
    defaultBias: { innerOuter: 1, frontBack: -1 },
    segments: [
      { distance: 400, slope: 0, type: "straight" },
      { distance: 350, slope: 0, type: "corner" },
      { distance: 350, slope: 0, type: "corner" },
      { distance: 501, slope: 2.0, type: "straight" },
    ],
  },
];

function buildSegments(distance: number, straightLength: number) {
  const firstStraight = Math.max(140, Math.round(distance * 0.14));
  const lastStraight = Math.max(220, Math.round(straightLength));
  const remain = Math.max(distance - firstStraight - lastStraight, 400);
  const corner = Math.round(remain / 2);
  return [
    { distance: firstStraight, slope: 0, type: "straight" as const },
    { distance: corner / 2, slope: 0, type: "corner" as const },
    { distance: corner / 2, slope: 0, type: "corner" as const },
    { distance: remain - corner, slope: 0, type: "straight" as const },
    { distance: lastStraight, slope: 1.2, type: "straight" as const },
  ];
}

function surfaceLabel(surface: "Turf" | "Dirt") {
  return surface === "Dirt" ? "ダート" : "芝";
}

function buildActiveCourses(): Course[] {
  return GENERATED_WEEKLY_RACES.map((race) => ({
    id: race.courseId,
    name: `${race.venue} ${surfaceLabel(race.surface)} ${race.distance}m (${race.label})`,
    distance: race.distance,
    surface: race.surface,
    straightLength: race.straightLength,
    hashtag: race.hashtag,
    defaultBias: {
      innerOuter: INNER_OUTER_BY_TRACK[race.venueKey] ?? 0,
      frontBack: FRONT_BACK_BY_TRACK[race.venueKey] ?? 0,
    },
    segments: buildSegments(race.distance, race.straightLength),
  }));
}

export const ACTIVE_COURSES = buildActiveCourses();
export const ARCHIVED_COURSES = ARCHIVED_COURSE_LIST;
export const COURSES: Course[] = [...ACTIVE_COURSES, ...ARCHIVED_COURSES];
