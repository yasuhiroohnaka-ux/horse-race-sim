import { GENERATED_ARCHIVED_RACES, GENERATED_WEEKLY_RACES } from "./generatedRaceSchedule";
import { buildCourseDisplayName, buildCourseShortComment } from "./raceCardContent";
import { Course } from "./types";

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
    id: "nakayama-turf-1800",
    name: "中山 芝 1800m (中山記念)",
    displayName: "中山記念（中山 芝 1800m） 出馬表",
    shortComment: "春の中距離戦線を占う伝統の別定G2。機動力と総合力が問われる。",
    venue: "中山",
    grade: "G2",
    distance: 1800,
    surface: "Turf",
    straightLength: 310,
    hashtag: "#中山記念",
    archived: true,
    defaultBias: { innerOuter: -1, frontBack: 2 },
    segments: buildSegments(1800, 310),
  },
  {
    id: "nakayama-turf-1200",
    name: "中山 芝 1200m (オーシャンS)",
    displayName: "オーシャンS（中山 芝 1200m） 出馬表",
    shortComment: "高松宮記念へ向かう前哨戦。中山1200m適性が色濃く出る。",
    venue: "中山",
    grade: "G3",
    distance: 1200,
    surface: "Turf",
    straightLength: 310,
    hashtag: "#オーシャンS",
    archived: true,
    defaultBias: { innerOuter: -1, frontBack: 2 },
    segments: buildSegments(1200, 310),
  },
  {
    id: "hanshin-turf-1600",
    name: "阪神 芝 1600m (チューリップ賞)",
    displayName: "チューリップ賞（阪神 芝 1600m） 出馬表",
    shortComment: "桜花賞へ向かう牝馬路線の重要トライアル。完成度と瞬発力を見たい一戦。",
    venue: "阪神",
    grade: "G2",
    distance: 1600,
    surface: "Turf",
    straightLength: 473.6,
    hashtag: "#チューリップ賞",
    archived: true,
    defaultBias: { innerOuter: 0, frontBack: -1 },
    segments: buildSegments(1600, 474),
  },
  {
    id: "tokyo-dirt-1600",
    name: "東京 ダート 1600m (フェブラリーS)",
    displayName: "フェブラリーS（東京 ダート 1600m） 出馬表",
    shortComment: "JRAダートG1の開幕戦。マイルでの総合力と立ち回りが問われる。",
    venue: "東京",
    grade: "G1",
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

function buildGeneratedCourse(race: {
  courseId: string;
  label: string;
  grade: string;
  day: string;
  raceNumber: number;
  isSpecialRace: boolean;
  isFinalRace: boolean;
  isJumpRace: boolean;
  raceSegment: Course["raceSegment"];
  venue: string;
  venueKey: string;
  surface: "Turf" | "Dirt";
  distance: number;
  straightLength: number;
  hashtag: string;
}, archived?: boolean): Course {
  return {
    id: race.courseId,
    name: `${race.venue} ${surfaceLabel(race.surface)} ${race.distance}m (${race.label})`,
    displayName: buildCourseDisplayName({
      name: race.label,
      label: race.label,
      venue: race.venue,
      surface: race.surface,
      distance: race.distance,
    }),
    shortComment: buildCourseShortComment({
      label: race.label,
      grade: race.grade,
      venue: race.venue,
      surface: race.surface,
      distance: race.distance,
    }),
    venue: race.venue,
    day: race.day,
    grade: race.grade,
    raceNumber: race.raceNumber,
    distance: race.distance,
    surface: race.surface,
    straightLength: race.straightLength,
    hashtag: race.hashtag,
    isSpecialRace: race.isSpecialRace,
    isFinalRace: race.isFinalRace,
    isJumpRace: race.isJumpRace,
    raceSegment: race.raceSegment,
    archived,
    defaultBias: {
      innerOuter: INNER_OUTER_BY_TRACK[race.venueKey] ?? 0,
      frontBack: FRONT_BACK_BY_TRACK[race.venueKey] ?? 0,
    },
    segments: buildSegments(race.distance, race.straightLength),
  };
}

function buildActiveCourses(): Course[] {
  return GENERATED_WEEKLY_RACES.map((race) => buildGeneratedCourse(race));
}

function buildGeneratedArchivedCourses(): Course[] {
  return GENERATED_ARCHIVED_RACES.map((race) => buildGeneratedCourse(race, true));
}

function uniqueCourses(courses: Course[]): Course[] {
  const byId = new Map(courses.map((course) => [course.id, course]));
  return [...byId.values()];
}

export const ACTIVE_COURSES = buildActiveCourses();
export const ARCHIVED_COURSES = uniqueCourses([...buildGeneratedArchivedCourses(), ...ARCHIVED_COURSE_LIST]);
export const COURSES: Course[] = [...ACTIVE_COURSES, ...ARCHIVED_COURSES];
