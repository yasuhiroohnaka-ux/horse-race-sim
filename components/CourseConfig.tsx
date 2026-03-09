"use client";

import { useEffect, useState } from "react";
import { GradeFilterChips } from "@/components/GradeFilterChips";
import { ACTIVE_COURSES, ARCHIVED_COURSES } from "@/lib/courses";
import { countCoursesByGrade, CourseGradeFilter, filterCoursesByGrade, getCourseGrade } from "@/lib/courseGrades";
import { Course, GroundCondition, PaceScenario, RaceCondition, Weather, WindDirection } from "@/lib/types";

interface CourseConfigProps {
  selectedCourse: Course;
  condition: RaceCondition;
  onCourseChange: (courseId: string) => void;
  onConditionChange: (condition: RaceCondition) => void;
  liveConditionSummary?: string;
}

const groundLabels: Record<GroundCondition, string> = {
  Firm: "良",
  Good: "稍重",
  Yielding: "重",
  Soft: "不良",
};

const weatherLabels: Record<Weather, string> = {
  Sunny: "晴れ",
  Cloudy: "曇り",
  Rain: "雨",
  Snow: "雪",
};

const windLabels: Record<WindDirection, string> = {
  Headwind: "向かい風",
  Tailwind: "追い風",
  Crosswind: "横風",
};

const paceLabels: Record<PaceScenario, string> = {
  Slow: "スロー",
  Average: "平均",
  Fast: "ハイ",
};

export function CourseConfig({ selectedCourse, condition, onCourseChange, onConditionChange, liveConditionSummary }: CourseConfigProps) {
  const [gradeFilter, setGradeFilter] = useState<CourseGradeFilter>(getCourseGrade(selectedCourse) ?? "ALL");

  useEffect(() => {
    setGradeFilter(getCourseGrade(selectedCourse) ?? "ALL");
  }, [selectedCourse.id]);

  const updateBias = (key: "innerOuter" | "frontBack", value: number) => {
    onConditionChange({
      ...condition,
      trackBias: {
        ...condition.trackBias,
        [key]: value,
      },
    });
  };

  const allCourses = [...ACTIVE_COURSES, ...ARCHIVED_COURSES];
  const counts = countCoursesByGrade(allCourses);
  const activeCourses = filterCoursesByGrade(ACTIVE_COURSES, gradeFilter);
  const archivedCourses = filterCoursesByGrade(ARCHIVED_COURSES, gradeFilter);

  const handleGradeFilterChange = (nextFilter: CourseGradeFilter) => {
    setGradeFilter(nextFilter);

    if (nextFilter === "ALL") return;
    const visibleCourses = [...filterCoursesByGrade(ACTIVE_COURSES, nextFilter), ...filterCoursesByGrade(ARCHIVED_COURSES, nextFilter)];
    if (!visibleCourses.some((course) => course.id === selectedCourse.id) && visibleCourses[0]) {
      onCourseChange(visibleCourses[0].id);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-slate-400">RACE SCENARIO</p>
          <h2 className="text-lg font-bold text-slate-900">条件設定</h2>
          <p className="mt-1 text-xs text-slate-500">
            公式オッズとガチ勢オッズの乖離を見るため、試走シナリオを先に固定します。
          </p>
          {liveConditionSummary ? (
            <p className="mt-2 text-xs font-medium text-sky-600">{liveConditionSummary}</p>
          ) : null}
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {selectedCourse.distance}m / 直線 {selectedCourse.straightLength}m
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(280px,1.2fr)_repeat(3,minmax(140px,0.6fr))]">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-500">レース</span>
          <p className="text-[11px] font-medium tracking-[0.16em] text-slate-400">GRADE FILTER</p>
          <GradeFilterChips
            value={gradeFilter}
            onChange={handleGradeFilterChange}
            counts={counts}
            totalCount={allCourses.length}
          />
          <select
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
            value={selectedCourse.id}
            onChange={(event) => onCourseChange(event.target.value)}
          >
            <optgroup label="今週の対象レース">
              {activeCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </optgroup>
            {archivedCourses.length > 0 && (
              <optgroup label="アーカイブ">
                {archivedCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-500">馬場</span>
          <select
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
            value={condition.groundCondition}
            onChange={(event) => onConditionChange({ ...condition, groundCondition: event.target.value as GroundCondition })}
          >
            {Object.entries(groundLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-500">天気</span>
          <select
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
            value={condition.weather}
            onChange={(event) => onConditionChange({ ...condition, weather: event.target.value as Weather })}
          >
            {Object.entries(weatherLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-500">展開</span>
          <select
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
            value={condition.paceScenario}
            onChange={(event) => onConditionChange({ ...condition, paceScenario: event.target.value as PaceScenario })}
          >
            {Object.entries(paceLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">風</h3>
            <span className="text-xs font-medium text-slate-500">{condition.windSpeed} m/s</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(120px,0.8fr)_minmax(180px,1.2fr)]">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-500">風向き</span>
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
                value={condition.windDirection}
                onChange={(event) => onConditionChange({ ...condition, windDirection: event.target.value as WindDirection })}
              >
                {Object.entries(windLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-500">風速</span>
              <input
                type="range"
                min="0"
                max="12"
                step="1"
                value={condition.windSpeed}
                onChange={(event) => onConditionChange({ ...condition, windSpeed: Number(event.target.value) })}
                className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200"
              />
            </label>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            向かい風は前受けの消耗を増やし、追い風は先行勢の粘りに寄せます。横風は全体のブレを大きくします。
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">馬場バイアス</h3>
            <span className="text-xs text-slate-500">内外 / 前後</span>
          </div>
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">内外バイアス</span>
                <span className="text-xs font-semibold text-slate-700">
                  {condition.trackBias.innerOuter === 0
                    ? "フラット"
                    : condition.trackBias.innerOuter < 0
                      ? `内 ${condition.trackBias.innerOuter}`
                      : `外 +${condition.trackBias.innerOuter}`}
                </span>
              </div>
              <input
                type="range"
                min="-5"
                max="5"
                step="1"
                value={condition.trackBias.innerOuter}
                onChange={(event) => updateBias("innerOuter", Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200"
              />
              <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                <span>内有利</span>
                <span>外有利</span>
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">前後バイアス</span>
                <span className="text-xs font-semibold text-slate-700">
                  {condition.trackBias.frontBack === 0
                    ? "フラット"
                    : condition.trackBias.frontBack > 0
                      ? `前 +${condition.trackBias.frontBack}`
                      : `差 ${condition.trackBias.frontBack}`}
                </span>
              </div>
              <input
                type="range"
                min="-5"
                max="5"
                step="1"
                value={condition.trackBias.frontBack}
                onChange={(event) => updateBias("frontBack", Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200"
              />
              <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                <span>差し有利</span>
                <span>前有利</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">馬場: {groundLabels[condition.groundCondition]}</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">天気: {weatherLabels[condition.weather]}</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">風: {windLabels[condition.windDirection]} {condition.windSpeed}m/s</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">展開: {paceLabels[condition.paceScenario]}</span>
      </div>
    </div>
  );
}
