"use client";

import Link from "next/link";
import { ARCHIVED_COURSES } from "@/lib/courses";
import { ARCHIVED_RACES } from "@/lib/raceData";

export default function ArchivePage() {
    return (
        <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
            <div className="max-w-3xl mx-auto">
                <header className="mb-8 text-center">
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">📦 過去のレース</h1>
                    <p className="text-slate-500 mt-2">アーカイブされたレースデータを確認・再シミュレーション</p>
                </header>

                <div className="space-y-4">
                    {ARCHIVED_RACES.map((race) => {
                        const course = ARCHIVED_COURSES.find(c => c.id === race.courseId);
                        if (!course) return null;

                        const topHorses = [...race.horses]
                            .sort((a, b) => b.predictionCount - a.predictionCount)
                            .slice(0, 3);

                        return (
                            <div key={race.courseId} className="bg-white rounded-lg shadow-md border border-slate-200 p-6">
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800">{race.label}</h2>
                                        <p className="text-sm text-slate-500 mt-1">
                                            {course.name} | {race.date} | {course.surface === 'Dirt' ? 'ダート' : '芝'} {course.distance}m
                                        </p>
                                    </div>
                                    <span className="px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-amber-700 text-xs font-medium">
                                        アーカイブ
                                    </span>
                                </div>

                                <div className="mb-4">
                                    <h3 className="text-sm font-medium text-slate-600 mb-2">集合知上位</h3>
                                    <div className="flex gap-3">
                                        {topHorses.map((h, i) => (
                                            <div key={h.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                                                <span className="text-xs font-bold text-slate-400">#{i + 1}</span>
                                                <span className="text-sm font-medium text-slate-800">{h.name}</span>
                                                <span className="text-xs text-purple-600 font-bold">{h.predictionCount}pt</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <p className="text-xs text-slate-400">
                                        {race.horses.length}頭 登録
                                    </p>
                                    <Link
                                        href={`/sim?archive=${race.courseId}`}
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition shadow hover:shadow-md"
                                    >
                                        このデータでシミュレーション →
                                    </Link>
                                </div>
                            </div>
                        );
                    })}

                    {ARCHIVED_RACES.length === 0 && (
                        <div className="text-center py-16 text-slate-400">
                            <p className="text-lg">アーカイブされたレースはまだありません</p>
                        </div>
                    )}
                </div>

                <footer className="mt-12 text-center text-xs text-slate-400">
                    <Link href="/" className="hover:text-slate-600 transition">← トップへ</Link>
                    <span className="mx-2">|</span>
                    <Link href="/sim" className="hover:text-slate-600 transition">シミュレーターへ</Link>
                    <span className="mx-2">|</span>
                    Powered by Next.js & Tailwind CSS
                </footer>
            </div>
        </div>
    );
}
