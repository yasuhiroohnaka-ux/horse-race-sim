"use client";

import { useState } from "react";
import { COURSES } from "@/lib/courses";
import { Horse, RaceCondition, TrackBias } from "@/lib/types";
import { runMonteCarlo } from "@/lib/simulation";
import { CourseConfig } from "@/components/CourseConfig";
import { HorseInput } from "@/components/HorseInput";
import { SimulationResults } from "@/components/SimulationResults";

export default function SimulatorPage() {
    const [selectedCourseId, setSelectedCourseId] = useState(COURSES[0].id);
    const [bias, setBias] = useState<TrackBias>({ innerOuter: 0, frontBack: 0 });
    const [horses, setHorses] = useState<Horse[]>([
        { id: '1', name: 'Contrail', speed: 85, stamina: 80, power: 75, guts: 80, runningStyle: 'Sashi', predictionCount: 120, simulatedOdds: 0 },
        { id: '2', name: 'Efforia', speed: 82, stamina: 85, power: 80, guts: 75, runningStyle: 'Senko', predictionCount: 80, simulatedOdds: 0 },
        { id: '3', name: 'Titleholder', speed: 78, stamina: 90, power: 85, guts: 85, runningStyle: 'Nige', predictionCount: 50, simulatedOdds: 0 },
        { id: '4', name: 'Gran Alegria', speed: 90, stamina: 60, power: 70, guts: 70, runningStyle: 'Sashi', predictionCount: 200, simulatedOdds: 0 },
    ]);
    const [results, setResults] = useState<{ horseId: string; winCount: number; bestTime: number }[] | null>(null);
    const [isRunning, setIsRunning] = useState(false);

    const selectedCourse = COURSES.find(c => c.id === selectedCourseId) || COURSES[0];

    const handleRunSimulation = () => {
        setIsRunning(true);
        // Add small delay to allow UI to update (loading state)
        setTimeout(() => {
            const condition: RaceCondition = {
                courseId: selectedCourseId,
                trackBias: bias,
                groundCondition: 'Good'
            };

            const simResults = runMonteCarlo(horses, selectedCourse, condition, 100);
            setResults(simResults);
            setIsRunning(false);
        }, 500);
    };

    const handlePostToX = () => {
        if (!results) return;

        // Find winner
        const winnerId = results[0].horseId;
        const winner = horses.find(h => h.id === winnerId);

        // Find Crowd Favorite
        const favorite = [...horses].sort((a, b) => b.predictionCount - a.predictionCount)[0];

        const text = `
Everyone's Favorite: ${favorite.name} (${favorite.predictionCount} votes)
Simulation Winner: ${winner?.name} (Win Rate: ${results[0].winCount}%)

Course: ${selectedCourse.name}
#Keiba #Simulation
    `.trim();

        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    return (
        <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
            <div className="max-w-4xl mx-auto">
                <header className="mb-8 text-center">
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">🏇 AI Horse Racing Simulator</h1>
                    <p className="text-slate-500 mt-2">Crowd Wisdom x Physics Engine</p>
                </header>

                <div className="space-y-6">
                    <CourseConfig
                        selectedCourse={selectedCourse}
                        bias={bias}
                        onCourseChange={setSelectedCourseId}
                        onBiasChange={setBias}
                    />

                    <HorseInput
                        horses={horses}
                        onHorsesChange={setHorses}
                    />

                    {!results && (
                        <div className="text-center py-8">
                            <button
                                onClick={handleRunSimulation}
                                disabled={isRunning}
                                className="px-8 py-4 bg-blue-600 text-white text-xl font-bold rounded-full shadow-lg hover:bg-blue-700 hover:shadow-xl transition transform active:scale-95 disabled:opacity-50"
                            >
                                {isRunning ? "Simulating Race..." : "Run 100 Simulations 🚀"}
                            </button>
                        </div>
                    )}

                    {results && (
                        <SimulationResults
                            results={results}
                            horses={horses}
                            onReset={() => setResults(null)}
                            onPostToX={handlePostToX}
                        />
                    )}
                </div>

                <footer className="mt-12 text-center text-xs text-slate-400">
                    Powered by Next.js & Tailwind CSS
                </footer>
            </div>
        </div>
    );
}
