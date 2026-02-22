import { Horse, Course, RaceCondition, RaceResult, RunningStyle } from "./types";
export type { Horse, RunningStyle };


// Constants
const BASE_SPEED = 16.0; // m/s (approx 60km/h)
const MAX_SPEED_VARIANCE = 0.5; // Random speed fluctuation
const STAMINA_DRAIN_RATE = 1.0;
// NOTE: predictionBonus は物理エンジンから除去済み。
// 能力値（speed/stamina/power/guts）のみで純粋に競走する。
// 集合知（predictionCount）は calculateCrowdWinRate() で別途計算する。

// Helper to calculate odds
export function calculateOdds(horses: Horse[]): Horse[] {
    const totalPredictions = horses.reduce((sum, h) => sum + h.predictionCount, 0);
    if (totalPredictions === 0) return horses;

    return horses.map(horse => {
        if (horse.predictionCount === 0) {
            return { ...horse, simulatedOdds: 999.9 }; // No support
        }
        // Theoretical Odds = (1 / WinProbability) * HouseEdge(0.8)
        // Here we just use a simple ratio inverted
        const probability = horse.predictionCount / totalPredictions;
        const odds = Math.floor((1 / probability) * 0.8 * 10) / 10; // 80% return rate
        return { ...horse, simulatedOdds: Math.max(1.0, odds) };
    });
}

// Crowd win rate from predictionCount (独立した集合知エンジン)
// 物理シミュとは完全に分離。predictionCount の割合をそのまま勝率%に変換する。
export function calculateCrowdWinRate(horses: Horse[]): Map<string, number> {
    const total = horses.reduce((sum, h) => sum + h.predictionCount, 0);
    if (total === 0) return new Map(horses.map(h => [h.id, 0]));
    return new Map(horses.map(h => [
        h.id,
        Math.round((h.predictionCount / total) * 100)
    ]));
}

// Helper to apply Track Bias
function getRunningStyleBonus(style: string, bias: RaceCondition['trackBias']): number {
    // Positive frontBack bias favors Front (Nige/Senko)
    // Negative frontBack favors Back (Sashi/Oikomi)
    // Simplified logic: bias is -5 to +5
    const biasVal = bias.frontBack;

    if (style === 'Nige' || style === 'Senko') {
        return biasVal > 0 ? biasVal * 0.2 : 0; // Front favored
    }
    if (style === 'Sashi' || style === 'Oikomi') {
        return biasVal < 0 ? Math.abs(biasVal) * 0.2 : 0; // Back favored
    }
    return 0;
}

// Single Race Simulation
export function runRace(
    horses: Horse[],
    course: Course,
    condition: RaceCondition,
    horseConditions?: { id: string, modifier: number }[]
): RaceResult[] {
    // 1. Initialize Simulation State
    let currentPositions = horses.map(h => ({
        id: h.id,
        distanceCovered: 0,
        currentSpeed: h.speed * 0.15 + BASE_SPEED, // Initial speed based on ability
        stamina: h.stamina,
        fatigue: 0,
        finished: false,
        finishTime: 0
    }));

    const RACE_TICK = 1.0; // 1 second update
    let raceTime = 0;
    let finishedCount = 0;

    // 2. Race Loop
    while (finishedCount < horses.length && raceTime < 300) { // Max 5 mins safety
        raceTime += RACE_TICK;

        currentPositions.forEach(pos => {
            if (pos.finished) return;

            const horse = horses.find(h => h.id === pos.id)!;
            const raceConditionModifier = horseConditions?.find(c => c.id === horse.id)?.modifier || 1.0;

            // Speed Modifiers (純粋な物理エンジン。集合知は混入しない)
            const randomFlux = (Math.random() - 0.5) * 1.5; // Increased variance (was MAX_SPEED_VARIANCE)
            const styleBonus = getRunningStyleBonus(horse.runningStyle, condition.trackBias);

            // Determine Speed
            let speed = (pos.currentSpeed + randomFlux + styleBonus) * raceConditionModifier;

            // Stamina Check
            if (pos.stamina <= 0) {
                speed *= 0.8; // Out of gas
            } else {
                pos.stamina -= STAMINA_DRAIN_RATE * (speed / BASE_SPEED);
            }

            // Update Distance
            pos.distanceCovered += speed * RACE_TICK;

            // Check Finish
            if (pos.distanceCovered >= course.distance) {
                pos.finished = true;
                pos.finishTime = raceTime; // Record time
                finishedCount++;
            }
        });
    }

    // 3. Sort by Finish Time
    return currentPositions
        .sort((a, b) => a.finishTime - b.finishTime)
        .map((p, index) => ({
            horseId: p.id,
            finishTime: p.finishTime,
            position: index + 1
        }));
}

// Monte Carlo Simulation
export function runMonteCarlo(
    horses: Horse[],
    course: Course,
    condition: RaceCondition,
    iterations: number = 100
): { horseId: string, winCount: number, bestTime: number }[] {

    const stats = new Map<string, { wins: number, bestTime: number }>();
    horses.forEach(h => stats.set(h.id, { wins: 0, bestTime: 9999 }));

    for (let i = 0; i < iterations; i++) {
        // Assign "Race Day Condition" per horse for this specific race iteration
        // Range: 0.985 to 1.015 (±1.5% variance)
        const horseConditions = horses.map(h => ({
            id: h.id,
            modifier: 0.985 + Math.random() * 0.03
        }));

        const result = runRace(horses, course, condition, horseConditions);

        // Winner
        const winnerId = result[0].horseId;
        const currentWins = stats.get(winnerId)!.wins;
        stats.get(winnerId)!.wins = currentWins + 1;

        // Best Times
        result.forEach(r => {
            const currentBest = stats.get(r.horseId)!.bestTime;
            if (r.finishTime < currentBest) {
                stats.get(r.horseId)!.bestTime = r.finishTime;
            }
        });
    }

    return Array.from(stats.entries()).map(([id, data]) => ({
        horseId: id,
        winCount: data.wins,
        bestTime: data.bestTime
    })).sort((a, b) => b.winCount - a.winCount);
}
