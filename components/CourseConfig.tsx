"use client";

import { ACTIVE_COURSES, ARCHIVED_COURSES } from "@/lib/courses";
import { Course, TrackBias } from "@/lib/types";
import { Label } from "@radix-ui/react-label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/lib/ui/select";
import { Slider } from "@/lib/ui/slider";

// Need to implement simplified UI components if shadcn is not fully installed, 
// but for now I'll use standard HTML/Tailwind if shadcn components are missing.
// Checking package.json, we installed radix-ui primitives but not full shadcn components.
// I'll implement a custom UI for now using radix primitives or just pure Tailwind for speed.

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
        Firm:     { label: '良',   color: 'text-green-600' },
        Good:     { label: '稍重', color: 'text-yellow-600' },
        Yielding: { label: '重',   color: 'text-orange-600' },
        Soft:     { label: '不良', color: 'text-red-600' },
    };

    return (
        <div className="bg-white p-4 rounded-lg shadow-md border border-slate-200">
            {/* Course Selection + Ground Condition - コンパクト横並び */}
            <div className="flex flex-wrap items-center gap-3 mb-3">
                <h2 className="text-sm font-bold text-slate-500 shrink-0">コース</h2>
                <select
                    className="flex-1 min-w-[200px] p-2 text-sm border border-slate-300 rounded-md font-medium"
                    value={selectedCourse.id}
                    onChange={(e) => onCourseChange(e.target.value)}
                >
                    <optgroup label="今週のレース">
                        {ACTIVE_COURSES.filter(c => ['nakayama-turf-1800', 'nakayama-turf-1200', 'hanshin-turf-1600'].includes(c.id)).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </optgroup>
                    <optgroup label="その他コース">
                        {ACTIVE_COURSES.filter(c => !['nakayama-turf-1800', 'nakayama-turf-1200', 'hanshin-turf-1600'].includes(c.id)).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </optgroup>
                    {ARCHIVED_COURSES.length > 0 && (
                        <optgroup label="アーカイブ">
                            {ARCHIVED_COURSES.map(c => (
                                <option key={c.id} value={c.id}>📦 {c.name}</option>
                            ))}
                        </optgroup>
                    )}
                </select>
                <select
                    className={`p-2 text-sm border border-slate-300 rounded-md font-bold ${groundLabels[groundCondition]?.color ?? ''}`}
                    value={groundCondition}
                    onChange={(e) => onGroundConditionChange(e.target.value)}
                >
                    <option value="Firm">🟢 良</option>
                    <option value="Good">🟡 稍重</option>
                    <option value="Yielding">🟠 重</option>
                    <option value="Soft">🔴 不良</option>
                </select>
                <span className="text-xs text-slate-400">
                    {selectedCourse.distance}m / 直線{selectedCourse.straightLength}m
                </span>
            </div>

            {/* Track Bias Sliders - 2列横並び */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                <div>
                    <div className="flex justify-between mb-1">
                        <label className="text-xs text-slate-500">内外バイアス</label>
                        <span className="text-xs text-blue-600 font-bold">
                            {bias.innerOuter === 0 ? "フラット" : bias.innerOuter < 0 ? `内${bias.innerOuter}` : `外+${bias.innerOuter}`}
                        </span>
                    </div>
                    <input
                        type="range"
                        min="-5" max="5" step="1"
                        value={bias.innerOuter}
                        onChange={(e) => onBiasChange({ ...bias, innerOuter: parseInt(e.target.value) })}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-300 mt-0.5">
                        <span>内有利</span>
                        <span>外有利</span>
                    </div>
                </div>

                <div>
                    <div className="flex justify-between mb-1">
                        <label className="text-xs text-slate-500">脚質バイアス</label>
                        <span className="text-xs text-green-600 font-bold">
                            {bias.frontBack === 0 ? "フラット" : bias.frontBack > 0 ? `前+${bias.frontBack}` : `後${bias.frontBack}`}
                        </span>
                    </div>
                    <input
                        type="range"
                        min="-5" max="5" step="1"
                        value={bias.frontBack}
                        onChange={(e) => onBiasChange({ ...bias, frontBack: parseInt(e.target.value) })}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-300 mt-0.5">
                        <span>差し有利</span>
                        <span>先行有利</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
