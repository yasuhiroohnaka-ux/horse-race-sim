"use client";

import { ACTIVE_COURSES, ARCHIVED_COURSES } from "@/lib/courses";
import { Course, TrackBias } from "@/lib/types";

interface CourseConfigProps {
  selectedCourse: Course;
  bias: TrackBias;
  groundCondition: string;
  onCourseChange: (courseId: string) => void;
  onBiasChange: (bias: TrackBias) => void;
  onGroundConditionChange: (condition: string) => void;
}

export function CourseConfig({ selectedCourse, bias, groundCondition, onCourseChange, onBiasChange, onGroundConditionChange }: CourseConfigProps) {
  const groundLabels: Record<string, { label: string; color: string }> = {
    Firm: { label: "良", color: "text-green-600" },
    Good: { label: "稍重", color: "text-yellow-600" },
    Yielding: { label: "重", color: "text-orange-600" },
    Soft: { label: "不良", color: "text-red-600" },
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-md border border-slate-200">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h2 className="text-sm font-bold text-slate-500 shrink-0">コース</h2>
        <select
          className="flex-1 min-w-[240px] p-2 text-sm border border-slate-300 rounded-md font-medium"
          value={selectedCourse.id}
          onChange={(e) => onCourseChange(e.target.value)}
        >
          <optgroup label="今週の重賞">
            {ACTIVE_COURSES.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </optgroup>
          {ARCHIVED_COURSES.length > 0 && (
            <optgroup label="アーカイブ">
              {ARCHIVED_COURSES.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <select
          className={`p-2 text-sm border border-slate-300 rounded-md font-bold ${groundLabels[groundCondition]?.color ?? ""}`}
          value={groundCondition}
          onChange={(e) => onGroundConditionChange(e.target.value)}
        >
          <option value="Firm">良</option>
          <option value="Good">稍重</option>
          <option value="Yielding">重</option>
          <option value="Soft">不良</option>
        </select>
        <span className="text-xs text-slate-400">
          {selectedCourse.distance}m / 直線 {selectedCourse.straightLength}m
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        <div>
          <div className="flex justify-between mb-1">
            <label className="text-xs text-slate-500">内外バイアス</label>
            <span className="text-xs text-blue-600 font-bold">
              {bias.innerOuter === 0 ? "フラット" : bias.innerOuter < 0 ? `内 ${bias.innerOuter}` : `外 +${bias.innerOuter}`}
            </span>
          </div>
          <input
            type="range"
            min="-5"
            max="5"
            step="1"
            value={bias.innerOuter}
            onChange={(e) => onBiasChange({ ...bias, innerOuter: parseInt(e.target.value, 10) })}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-300 mt-0.5">
            <span>内有利</span>
            <span>外有利</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <label className="text-xs text-slate-500">前後バイアス</label>
            <span className="text-xs text-green-600 font-bold">
              {bias.frontBack === 0 ? "フラット" : bias.frontBack > 0 ? `前 +${bias.frontBack}` : `差 ${bias.frontBack}`}
            </span>
          </div>
          <input
            type="range"
            min="-5"
            max="5"
            step="1"
            value={bias.frontBack}
            onChange={(e) => onBiasChange({ ...bias, frontBack: parseInt(e.target.value, 10) })}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-300 mt-0.5">
            <span>差し有利</span>
            <span>前有利</span>
          </div>
        </div>
      </div>
    </div>
  );
}
