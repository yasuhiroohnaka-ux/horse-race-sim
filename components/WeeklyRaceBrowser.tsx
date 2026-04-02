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
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-slate-400">THIS WEEK</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">今週の対象レース</h2>
          <p className="mt-2 text-sm text-slate-500">
            重賞、L、OPに加え、特別戦や最終12Rまで含めて、今週シミュレーションできるレースを一覧化しています。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-500">{filteredCourses.length}レース表示</p>
          <Link href="/sim" className="text-sm font-semibold text-blue-600 hover:underline">
            シミュレーション画面へ
          </Link>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-slate-400">GRADE FILTER</p>
          <GradeFilterChips value={gradeFilter} onChange={setGradeFilter} counts={counts} totalCount={courses.length} />
        </div>
      </div>

      {filteredCourses.length > 0 ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredCourses.map((course) => (
            <Link
              key={course.id}
              href={`/sim?course=${encodeURIComponent(course.id)}`}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-300 hover:bg-blue-50"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white">
                  {courseBadgeLabel(course)}
                </span>
                {dayLabel(course.day) ? <span className="text-xs text-slate-400">{dayLabel(course.day)}</span> : null}
              </div>
              <p className="mt-3 text-lg font-bold text-slate-900">{course.displayName ?? course.name}</p>
              <p className="mt-2 text-sm text-slate-500">{course.shortComment ?? "コース形状と市場とのズレをすぐ確認できます。"}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          該当するレースはありません。
        </div>
      )}
    </section>
  );
}
