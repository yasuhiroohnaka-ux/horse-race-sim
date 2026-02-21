"use client";

import { COURSES } from "@/lib/courses";
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
    onCourseChange: (courseId: string) => void;
    onBiasChange: (bias: TrackBias) => void;
}

export function CourseConfig({ selectedCourse, bias, onCourseChange, onBiasChange }: CourseConfigProps) {
    return (
        <div className="bg-white p-6 rounded-lg shadow-md border border-slate-200">
            <h2 className="text-xl font-bold mb-4 text-slate-800">1. Race Configuration</h2>

            {/* Course Selection */}
            <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">Select Course</label>
                <select
                    className="w-full p-2 border border-slate-300 rounded-md"
                    value={selectedCourse.id}
                    onChange={(e) => onCourseChange(e.target.value)}
                >
                    {COURSES.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
                <p className="text-sm text-slate-500 mt-1">
                    Distance: {selectedCourse.distance}m | Straight: {selectedCourse.straightLength}m
                </p>
            </div>

            {/* Track Bias Sliders */}
            <div className="space-y-6">
                <div>
                    <div className="flex justify-between mb-2">
                        <label className="text-sm font-medium text-slate-700">Track Position Bias</label>
                        <span className="text-sm text-blue-600 font-bold">
                            {bias.innerOuter === 0 ? "Neutral" : bias.innerOuter < 0 ? `Inner Favored (${bias.innerOuter})` : `Outer Favored (+${bias.innerOuter})`}
                        </span>
                    </div>
                    <input
                        type="range"
                        min="-5" max="5" step="1"
                        value={bias.innerOuter}
                        onChange={(e) => onBiasChange({ ...bias, innerOuter: parseInt(e.target.value) })}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-slate-400 mt-1">
                        <span>Inner (-5)</span>
                        <span>Neutral</span>
                        <span>Outer (+5)</span>
                    </div>
                </div>

                <div>
                    <div className="flex justify-between mb-2">
                        <label className="text-sm font-medium text-slate-700">Running Style Bias</label>
                        <span className="text-sm text-green-600 font-bold">
                            {bias.frontBack === 0 ? "Neutral" : bias.frontBack > 0 ? `Front Favored (+${bias.frontBack})` : `Back Favored (${bias.frontBack})`}
                        </span>
                    </div>
                    <input
                        type="range"
                        min="-5" max="5" step="1"
                        value={bias.frontBack}
                        onChange={(e) => onBiasChange({ ...bias, frontBack: parseInt(e.target.value) })}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-slate-400 mt-1">
                        <span>Sashi/Oikomi (-5)</span>
                        <span>Neutral</span>
                        <span>Nige/Senko (+5)</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
