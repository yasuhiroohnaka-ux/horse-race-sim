"use client";

import { COURSE_GRADE_FILTER_OPTIONS, CourseGrade, CourseGradeFilter } from "@/lib/courseGrades";

interface GradeFilterChipsProps {
  value: CourseGradeFilter;
  onChange: (value: CourseGradeFilter) => void;
  counts?: Record<CourseGrade, number>;
  totalCount?: number;
}

export function GradeFilterChips({ value, onChange, counts, totalCount }: GradeFilterChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {COURSE_GRADE_FILTER_OPTIONS.map((option) => {
        const isActive = option.value === value;
        const count = option.value === "ALL" ? totalCount : counts?.[option.value];

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={[
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              isActive
                ? "border-ink bg-turf text-white "
                : "border-line bg-card text-ink-2 hover:border-line hover:text-ink",
            ].join(" ")}
            aria-pressed={isActive}
          >
            <span>{option.label}</span>
            {typeof count === "number" ? (
              <span
                className={[
                  "rounded-full px-1.5 py-0.5 text-[10px] leading-none",
                  isActive ? "bg-white/20 text-white" : "bg-paper text-ink-2",
                ].join(" ")}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
