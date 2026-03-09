import type { Course } from "./types";

export const COURSE_GRADE_VALUES = ["G1", "G2", "G3", "L", "OP"] as const;

export type CourseGrade = (typeof COURSE_GRADE_VALUES)[number];
export type CourseGradeFilter = CourseGrade | "ALL";

export const COURSE_GRADE_FILTER_OPTIONS: ReadonlyArray<{
  value: CourseGradeFilter;
  label: string;
}> = [
  { value: "ALL", label: "すべて" },
  { value: "G1", label: "G1" },
  { value: "G2", label: "G2" },
  { value: "G3", label: "G3" },
  { value: "L", label: "L" },
  { value: "OP", label: "OP" },
];

const COURSE_GRADE_SET = new Set<string>(COURSE_GRADE_VALUES);

type CourseLike = Pick<Course, "grade" | "name">;

export function getCourseGrade(course: CourseLike): CourseGrade | null {
  const grade = String(course.grade ?? "").trim().toUpperCase();
  if (COURSE_GRADE_SET.has(grade)) return grade as CourseGrade;

  if (course.name.includes("G1")) return "G1";
  if (course.name.includes("G2")) return "G2";
  if (course.name.includes("G3")) return "G3";
  if (course.name.includes("(L)")) return "L";
  if (course.name.includes("OP") || course.name.includes("オープン")) return "OP";
  return null;
}

export function courseBadgeLabel(course: CourseLike): string {
  return getCourseGrade(course) ?? "注目";
}

export function filterCoursesByGrade<T extends CourseLike>(courses: readonly T[], filter: CourseGradeFilter): T[] {
  if (filter === "ALL") return [...courses];
  return courses.filter((course) => getCourseGrade(course) === filter);
}

export function countCoursesByGrade<T extends CourseLike>(courses: readonly T[]): Record<CourseGrade, number> {
  const counts: Record<CourseGrade, number> = {
    G1: 0,
    G2: 0,
    G3: 0,
    L: 0,
    OP: 0,
  };

  for (const course of courses) {
    const grade = getCourseGrade(course);
    if (grade) counts[grade] += 1;
  }

  return counts;
}
