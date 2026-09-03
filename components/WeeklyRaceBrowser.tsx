"use client";

import { useState } from "react";
import Link from "next/link";
import { GradeFilterChips } from "@/components/GradeFilterChips";
import { countCoursesByGrade, courseBadgeLabel, CourseGradeFilter, filterCoursesByGrade } from "@/lib/courseGrades";
import type { Course } from "@/lib/types";

interface WeeklyRaceBrowserProps {
  courses: Course[];
}

export function WeeklyRaceBrowser({ courses }: WeeklyRaceBrowserProps) {
  const [gradeFilter, setGradeFilter] = useState<CourseGradeFilter>("ALL");

  const counts = countCoursesByGrade(courses);
  const filteredCourses = filterCoursesByGrade(courses, gradeFilter);
  const dayLabel = (day?: string) => {
    if (day === "Sat") return "土曜";
    if (day === "Sun") return "日曜";
    return null;
  };

  return (
    <section className="rounded-[var(--r-lg)] border border-line bg-card p-6 ">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="t-label">THIS WEEK</p>
          <h2 className="mt-1 text-2xl font-bold text-ink">今週の対象レース</h2>
          <p className="mt-2 text-sm text-ink-2">
            重賞、L、OPに加え、特別戦や最終12Rまで含めて、今週シミュレーションできるレースを一覧化しています。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-ink-2">{filteredCourses.length}レース表示</p>
          <Link href="/sim" className="text-sm font-semibold text-info hover:underline">
            シミュレーション画面へ
          </Link>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-ink-3">GRADE FILTER</p>
          <GradeFilterChips value={gradeFilter} onChange={setGradeFilter} counts={counts} totalCount={courses.length} />
        </div>
      </div>

      {filteredCourses.length > 0 ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredCourses.map((course) => (
            <Link
              key={course.id}
              href={`/sim?course=${encodeURIComponent(course.id)}`}
              className="rounded-[var(--r-md)] border border-line bg-paper-sunk p-4 transition hover:border-info hover:bg-info-wash"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-turf px-2.5 py-1 text-[11px] font-bold text-white">
                  {courseBadgeLabel(course)}
                </span>
                {dayLabel(course.day) ? <span className="text-xs text-ink-3">{dayLabel(course.day)}</span> : null}
              </div>
              <p className="mt-3 text-lg font-bold text-ink">{course.displayName ?? course.name}</p>
              <p className="mt-2 text-sm text-ink-2">{course.shortComment ?? "コース形状と市場とのズレをすぐ確認できます。"}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[var(--r-md)] border border-dashed border-line bg-paper-sunk px-4 py-8 text-center text-sm text-ink-2">
          該当するレースはありません。
        </div>
      )}
    </section>
  );
}
