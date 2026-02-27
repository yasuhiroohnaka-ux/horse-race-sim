import { Horse, Course, RaceCondition, RaceResult, RunningStyle } from "./types";
import { getUpsetScore } from "./raceVolatility";
export type { Horse, RunningStyle };


// Constants
const BASE_SPEED = 16.0; // m/s base
const SPEED_ABILITY_FACTOR = 0.06; // SP→速度変換（低めで差を縮め波乱を生む）
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

// 馬場状態による速度・スタミナ補正
// Turf は馬場の影響大、Dirt は小さめ
function getGroundConditionModifiers(
    groundCondition: string,
    surface: string
): { speedMod: number; staminaDrainMod: number } {
    const sf = surface === 'Dirt' ? 0.5 : 1.0;
    switch (groundCondition) {
        case 'Firm':     return { speedMod: 1 + 0.01 * sf, staminaDrainMod: 1 - 0.05 * sf };
        case 'Good':     return { speedMod: 1.0,            staminaDrainMod: 1.0 };
        case 'Yielding': return { speedMod: 1 - 0.02 * sf, staminaDrainMod: 1 + 0.15 * sf };
        case 'Soft':     return { speedMod: 1 - 0.04 * sf, staminaDrainMod: 1 + 0.35 * sf };
        default:         return { speedMod: 1.0,            staminaDrainMod: 1.0 };
    }
}

// Helper to apply Track Bias
function getRunningStyleBonus(style: string, bias: RaceCondition['trackBias']): number {
    // Positive frontBack bias favors Front (Nige/Senko)
    // Negative frontBack favors Back (Sashi/Oikomi)
    // Simplified logic: bias is -5 to +5
    const biasVal = bias.frontBack;

    if (style === 'Nige' || style === 'Senko') {
        return biasVal > 0 ? biasVal * 0.15 : 0; // Front favored
    }
    if (style === 'Sashi' || style === 'Oikomi') {
        return biasVal < 0 ? Math.abs(biasVal) * 0.15 : 0; // Back favored
    }
    return 0;
}

function getPaceAdjustmentByStyle(horses: Horse[]): Map<string, number> {
    const frontCount = horses.filter(h => h.runningStyle === 'Nige' || h.runningStyle === 'Senko').length;
    const fieldSize = Math.max(horses.length, 1);
    const frontRatio = frontCount / fieldSize;
    const pressure = Math.max(-0.25, Math.min(0.25, frontRatio - 0.45));

    return new Map(
        horses.map((horse) => {
            const isFront = horse.runningStyle === 'Nige' || horse.runningStyle === 'Senko';
            const signed = isFront ? -pressure : pressure;
            const modifier = Math.max(0.96, Math.min(1.04, 1 + signed * 0.20));
            return [horse.id, modifier];
        })
    );
}

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

function isFrontStyle(style: RunningStyle): boolean {
    return style === 'Nige' || style === 'Senko';
}

function isBackStyle(style: RunningStyle): boolean {
    return style === 'Sashi' || style === 'Oikomi';
}

function getCourseInnerTilt(course: Course): number {
    const cornerDistance = course.segments
        .filter(s => s.type === 'corner')
        .reduce((sum, s) => sum + s.distance, 0);
    const cornerRatio = cornerDistance / Math.max(course.distance, 1);
    const shortStraightNorm = clamp((420 - course.straightLength) / 220, -0.6, 0.8);
    return clamp(cornerRatio * 1.1 + shortStraightNorm * 0.9, -1.0, 1.0); // + means inner-favored
}

function getDrawTacticalAdjustmentMap(
    horses: Horse[],
    course: Course,
    condition: RaceCondition
): Map<string, number> {
    const sorted = [...horses].sort((a, b) => a.gateNumber - b.gateNumber);
    const n = Math.max(sorted.length, 1);
    const smallField = n < 8;
    const damp = smallField ? 0.10 : 1.0; // Almost disable draw effects for small fields.
    const frontBackBias = clamp(condition.trackBias.frontBack / 5, -1, 1); // +front favored
    const outerFavBias = clamp(condition.trackBias.innerOuter / 5, -1, 1); // +outer favored
    const courseInnerTilt = getCourseInnerTilt(course); // +inner favored

    const byId = new Map(sorted.map((h, i) => [h.id, { idx: i, horse: h }]));

    return new Map(
        sorted.map((horse) => {
            const meta = byId.get(horse.id)!;
            const idx = meta.idx;
            const lanePos = n <= 1 ? 0 : (idx / (n - 1)) * 2 - 1; // -1 inner, +1 outer
            const left = idx > 0 ? sorted[idx - 1] : null;
            const right = idx < n - 1 ? sorted[idx + 1] : null;
            const neighFront = [left, right].filter(x => x && isFrontStyle(x.runningStyle as RunningStyle)).length;
            const neighBack = [left, right].filter(x => x && isBackStyle(x.runningStyle as RunningStyle)).length;

            // Lane value from course shape + daily inner/outer bias.
            const lanePct = (-lanePos * courseInnerTilt + lanePos * outerFavBias) * 0.007 * damp; // about +/-0.7%

            // Daily front/back bias by running style.
            const styleBiasPct = isFrontStyle(horse.runningStyle)
                ? frontBackBias * 0.005 * damp
                : isBackStyle(horse.runningStyle)
                    ? -frontBackBias * 0.005 * damp
                    : 0;

            // Post-position tactical crowding / pressure.
            let tacticalPct = 0;
            if (horse.runningStyle === 'Nige') {
                if (right && isFrontStyle(right.runningStyle)) tacticalPct -= 0.005 * damp; // likely covered from outside
                if (left && isFrontStyle(left.runningStyle)) tacticalPct -= 0.002 * damp;
                if (neighFront === 0) tacticalPct += 0.003 * damp; // lone speed edge
            } else if (horse.runningStyle === 'Senko') {
                tacticalPct -= neighFront * 0.002 * damp;
                if (neighFront >= 2) tacticalPct -= 0.0015 * damp;
            } else {
                // Sashi/Oikomi: traffic risk when back-runners cluster in adjacent gates.
                tacticalPct -= neighBack * 0.0015 * damp;
                if (lanePos < -0.3 && neighBack > 0) tacticalPct -= 0.001 * damp; // inner congestion risk
            }

            const modifier = smallField
                ? clamp(1 + lanePct + styleBiasPct + tacticalPct, 0.995, 1.005)
                : clamp(1 + lanePct + styleBiasPct + tacticalPct, 0.975, 1.025);
            return [horse.id, modifier];
        })
    );
}

function getUndervaluedBoostMap(horses: Horse[], courseId: string): Map<string, number> {
    const n = Math.max(horses.length, 1);
    const upsetNorm = Math.max(0, Math.min(1, (getUpsetScore(courseId) - 50) / 50));
    if (upsetNorm <= 0) {
        return new Map(horses.map(h => [h.id, 1]));
    }

    const ability = new Map(
        horses.map(h => [
            h.id,
            h.speed * 0.36 +
            h.stamina * 0.28 +
            h.power * 0.18 +
            h.guts * 0.18 +
            (h.trainingScore ?? 0) * 0.8 +
            ((h.jockeyPower ?? 60) - 60) * 0.2 +
            ((h.stablePower ?? 60) - 60) * 0.15
        ])
    );

    const abilityRank = new Map(
        [...horses]
            .sort((a, b) => (ability.get(b.id) ?? 0) - (ability.get(a.id) ?? 0))
            .map((h, idx) => [h.id, idx + 1])
    );
    const popularityRank = new Map(
        [...horses]
            .sort((a, b) => (b.predictionCount ?? 0) - (a.predictionCount ?? 0))
            .map((h, idx) => [h.id, idx + 1])
    );

    return new Map(
        horses.map(h => {
            const aRank = abilityRank.get(h.id) ?? n;
            const pRank = popularityRank.get(h.id) ?? n;
            const rankGap = pRank - aRank; // >0 means underrated by popularity
            const gapNorm = Math.max(0, rankGap / Math.max(1, n - 1));
            const longshot = Math.max(0, Math.min(1, ((h.realOdds ?? 8) - 8) / 24));
            const boost = 1 + upsetNorm * gapNorm * (0.018 + longshot * 0.022);
            return [h.id, Math.max(0.98, Math.min(1.06, boost))];
        })
    );
}

// Single Race Simulation
export function runRace(
    horses: Horse[],
    course: Course,
    condition: RaceCondition,
    horseConditions?: { id: string, modifier: number }[]
): RaceResult[] {
    // 馬場状態の補正値
    const groundMod = getGroundConditionModifiers(condition.groundCondition, course.surface);
    const paceMap = getPaceAdjustmentByStyle(horses);
    const drawTacticalMap = getDrawTacticalAdjustmentMap(horses, course, condition);
    const undervaluedMap = getUndervaluedBoostMap(horses, course.id);

    // 1. Initialize Simulation State
    // 状態値: 0-10 (5=普通)。5から離れるほど速度に±3%影響
    // 斤量: 57kgを基準に、1kgあたり±0.3%速度補正
    let currentPositions = horses.map(h => {
        const conditionVal = h.condition ?? 5;
        const conditionMod = 1 + (conditionVal - 5) * 0.006;   // 0→-3%, 10→+3%
        const weightVal = h.weight ?? 57;
        const weightMod = 1 - (weightVal - 57) * 0.003;        // 55kg→+0.6%, 59kg→-0.6%
        const jockeyPower = h.jockeyPower ?? 60;
        const stablePower = h.stablePower ?? 60;
        const trainingScore = h.trainingScore ?? 0;
        const jockeyMod = 1 + (jockeyPower - 60) * 0.0015;
        const stableMod = 1 + (stablePower - 60) * 0.0010;
        const trainingMod = 1 + trainingScore * 0.005;
        const paceMod = paceMap.get(h.id) ?? 1.0;
        const drawTacticalMod = drawTacticalMap.get(h.id) ?? 1.0;
        const undervaluedMod = undervaluedMap.get(h.id) ?? 1.0;

        return {
            id: h.id,
            distanceCovered: 0,
            currentSpeed: (h.speed * SPEED_ABILITY_FACTOR + BASE_SPEED) * conditionMod * weightMod * jockeyMod * stableMod * trainingMod * paceMod * drawTacticalMod * undervaluedMod,
            stamina: h.stamina,
            fatigue: 0,
            finished: false,
            finishTime: 0,
        };
    });

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
            const randomFlux = (Math.random() - 0.5) * 2.0; // ±1.0 m/s per tick
            const styleBonus = getRunningStyleBonus(horse.runningStyle, condition.trackBias);

            // Determine Speed (馬場状態の速度補正を適用)
            let speed = (pos.currentSpeed + randomFlux + styleBonus)
                * raceConditionModifier
                * groundMod.speedMod;

            // Stamina Check (馬場状態のスタミナ消耗補正を適用)
            if (pos.stamina <= 0) {
                speed *= 0.8; // Out of gas
            } else {
                pos.stamina -= STAMINA_DRAIN_RATE * (speed / BASE_SPEED) * groundMod.staminaDrainMod;
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
        // Range: 0.96 to 1.04 (±4% variance — 展開や位置取りのブレを表現)
        const horseConditions = horses.map(h => ({
            id: h.id,
            modifier: 0.96 + Math.random() * 0.08
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
