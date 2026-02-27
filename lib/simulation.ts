import { Horse, Course, RaceCondition, RaceResult, RunningStyle } from "./types";
export type { Horse, RunningStyle };

// Constants
const BASE_SPEED = 16.0; // m/s base
const SPEED_ABILITY_FACTOR = 0.018;
const STAMINA_DRAIN_RATE = 1.0;

// Helper to calculate odds from crowd score
export function calculateOdds(horses: Horse[]): Horse[] {
    const totalPredictions = horses.reduce((sum, h) => sum + h.predictionCount, 0);
    if (totalPredictions === 0) return horses;

    return horses.map((horse) => {
        if (horse.predictionCount === 0) {
            return { ...horse, simulatedOdds: 999.9 };
        }
        const probability = horse.predictionCount / totalPredictions;
        const odds = Math.floor((1 / probability) * 0.8 * 10) / 10;
        return { ...horse, simulatedOdds: Math.max(1.0, odds) };
    });
}

// Crowd win rate from predictionCount (independent from physical sim)
export function calculateCrowdWinRate(horses: Horse[]): Map<string, number> {
    const total = horses.reduce((sum, h) => sum + h.predictionCount, 0);
    if (total === 0) return new Map(horses.map((h) => [h.id, 0]));
    return new Map(
        horses.map((h) => [h.id, Math.round((h.predictionCount / total) * 1000) / 10])
    );
}

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

function getGroundConditionModifiers(
    groundCondition: string,
    surface: string
): { speedMod: number; staminaDrainMod: number } {
    const sf = surface === "Dirt" ? 0.5 : 1.0;
    switch (groundCondition) {
        case "Firm":
            return { speedMod: 1 + 0.01 * sf, staminaDrainMod: 1 - 0.05 * sf };
        case "Good":
            return { speedMod: 1.0, staminaDrainMod: 1.0 };
        case "Yielding":
            return { speedMod: 1 - 0.02 * sf, staminaDrainMod: 1 + 0.15 * sf };
        case "Soft":
            return { speedMod: 1 - 0.04 * sf, staminaDrainMod: 1 + 0.35 * sf };
        default:
            return { speedMod: 1.0, staminaDrainMod: 1.0 };
    }
}

function getRunningStyleBonus(style: string, bias: RaceCondition["trackBias"]): number {
    const biasVal = bias.frontBack;
    if (style === "Nige" || style === "Senko") {
        return biasVal > 0 ? biasVal * 0.05 : 0;
    }
    if (style === "Sashi" || style === "Oikomi") {
        return biasVal < 0 ? Math.abs(biasVal) * 0.05 : 0;
    }
    return 0;
}

function isFrontStyle(style: RunningStyle): boolean {
    return style === "Nige" || style === "Senko";
}

function isBackStyle(style: RunningStyle): boolean {
    return style === "Sashi" || style === "Oikomi";
}

function getHorseAbilityScore(horse: Horse): number {
    return horse.speed * 0.46 + horse.stamina * 0.26 + horse.power * 0.17 + horse.guts * 0.11;
}

function getPaceAdjustmentByStyle(horses: Horse[]): Map<string, number> {
    const frontCount = horses.filter((h) => h.runningStyle === "Nige" || h.runningStyle === "Senko").length;
    const fieldSize = Math.max(horses.length, 1);
    const frontRatio = frontCount / fieldSize;
    const pressure = Math.max(-0.2, Math.min(0.2, frontRatio - 0.45));

    return new Map(
        horses.map((horse) => {
            const isFront = horse.runningStyle === "Nige" || horse.runningStyle === "Senko";
            const signed = isFront ? -pressure : pressure;
            const modifier = Math.max(0.985, Math.min(1.015, 1 + signed * 0.08));
            return [horse.id, modifier];
        })
    );
}

function getCourseInnerTilt(course: Course): number {
    const cornerDistance = course.segments
        .filter((s) => s.type === "corner")
        .reduce((sum, s) => sum + s.distance, 0);
    const cornerRatio = cornerDistance / Math.max(course.distance, 1);
    const shortStraightNorm = clamp((420 - course.straightLength) / 220, -0.6, 0.8);
    return clamp(cornerRatio * 1.1 + shortStraightNorm * 0.9, -1.0, 1.0);
}

function getDrawTacticalAdjustmentMap(
    horses: Horse[],
    course: Course,
    condition: RaceCondition
): Map<string, number> {
    const sorted = [...horses].sort((a, b) => a.gateNumber - b.gateNumber);
    const n = Math.max(sorted.length, 1);
    const smallField = n < 8;
    const damp = smallField ? 0.1 : 1.0;
    const frontBackBias = clamp(condition.trackBias.frontBack / 5, -1, 1);
    const outerFavBias = clamp(condition.trackBias.innerOuter / 5, -1, 1);
    const courseInnerTilt = getCourseInnerTilt(course);

    const byId = new Map(sorted.map((h, i) => [h.id, { idx: i }]));

    return new Map(
        sorted.map((horse) => {
            const idx = byId.get(horse.id)?.idx ?? 0;
            const lanePos = n <= 1 ? 0 : (idx / (n - 1)) * 2 - 1; // -1 inner, +1 outer
            const left = idx > 0 ? sorted[idx - 1] : null;
            const right = idx < n - 1 ? sorted[idx + 1] : null;
            const neighFront = [left, right].filter((x) => x && isFrontStyle(x.runningStyle as RunningStyle)).length;
            const neighBack = [left, right].filter((x) => x && isBackStyle(x.runningStyle as RunningStyle)).length;

            const lanePct = (-lanePos * courseInnerTilt + lanePos * outerFavBias) * 0.0035 * damp;
            const styleBiasPct = isFrontStyle(horse.runningStyle)
                ? frontBackBias * 0.0025 * damp
                : isBackStyle(horse.runningStyle)
                    ? -frontBackBias * 0.0025 * damp
                    : 0;

            let tacticalPct = 0;
            if (horse.runningStyle === "Nige") {
                if (right && isFrontStyle(right.runningStyle)) tacticalPct -= 0.003 * damp;
                if (left && isFrontStyle(left.runningStyle)) tacticalPct -= 0.001 * damp;
                if (neighFront === 0) tacticalPct += 0.0015 * damp;
            } else if (horse.runningStyle === "Senko") {
                tacticalPct -= neighFront * 0.0012 * damp;
                if (neighFront >= 2) tacticalPct -= 0.0008 * damp;
            } else {
                tacticalPct -= neighBack * 0.001 * damp;
                if (lanePos < -0.3 && neighBack > 0) tacticalPct -= 0.0006 * damp;
            }

            const modifier = smallField
                ? clamp(1 + lanePct + styleBiasPct + tacticalPct, 0.997, 1.003)
                : clamp(1 + lanePct + styleBiasPct + tacticalPct, 0.988, 1.012);
            return [horse.id, modifier];
        })
    );
}

// Single Race Simulation
export function runRace(
    horses: Horse[],
    course: Course,
    condition: RaceCondition,
    horseConditions?: { id: string; modifier: number }[]
): RaceResult[] {
    const groundMod = getGroundConditionModifiers(condition.groundCondition, course.surface);
    const paceMap = getPaceAdjustmentByStyle(horses);
    const drawTacticalMap = getDrawTacticalAdjustmentMap(horses, course, condition);

    const currentPositions = horses.map((h) => {
        const conditionVal = h.condition ?? 5;
        const conditionMod = 1 + (conditionVal - 5) * 0.003;
        const weightVal = h.weight ?? 57;
        const weightMod = 1 - (weightVal - 57) * 0.002;
        const jockeyPower = h.jockeyPower ?? 60;
        const stablePower = h.stablePower ?? 60;
        const jockeyMod = 1 + (jockeyPower - 60) * 0.0008;
        const stableMod = 1 + (stablePower - 60) * 0.0006;
        const ability = getHorseAbilityScore(h);
        const baseAbilitySpeed = ability * (SPEED_ABILITY_FACTOR * 0.95) + BASE_SPEED;
        const staminaBuffer = clamp(
            h.stamina * (1 + (h.guts - 80) * 0.0015 + (h.power - 80) * 0.001),
            55,
            130
        );
        const paceMod = paceMap.get(h.id) ?? 1.0;
        const drawTacticalMod = drawTacticalMap.get(h.id) ?? 1.0;
        const launchMod = 0.995 + Math.random() * 0.01;

        return {
            id: h.id,
            distanceCovered: 0,
            currentSpeed: baseAbilitySpeed * conditionMod * weightMod * jockeyMod * stableMod * paceMod * drawTacticalMod * launchMod,
            stamina: staminaBuffer,
            fatigue: 0,
            finished: false,
            finishTime: 0,
        };
    });

    const RACE_TICK = 1.0;
    let raceTime = 0;
    let finishedCount = 0;

    while (finishedCount < horses.length && raceTime < 300) {
        raceTime += RACE_TICK;

        currentPositions.forEach((pos) => {
            if (pos.finished) return;

            const horse = horses.find((h) => h.id === pos.id);
            if (!horse) return;
            const raceConditionModifier = horseConditions?.find((c) => c.id === horse.id)?.modifier || 1.0;

            const randomFlux = (Math.random() - 0.5) * 3.0; // ±1.5 m/s
            const styleBonus = getRunningStyleBonus(horse.runningStyle, condition.trackBias);

            let speed = (pos.currentSpeed + randomFlux + styleBonus) * raceConditionModifier * groundMod.speedMod;

            if (pos.stamina <= 0) {
                speed *= 0.8;
            } else {
                pos.stamina -= STAMINA_DRAIN_RATE * (speed / BASE_SPEED) * groundMod.staminaDrainMod;
            }

            pos.distanceCovered += speed * RACE_TICK;

            if (pos.distanceCovered >= course.distance) {
                pos.finished = true;
                pos.finishTime = raceTime;
                finishedCount++;
            }
        });
    }

    return currentPositions
        .sort((a, b) => a.finishTime - b.finishTime)
        .map((p, index) => ({
            horseId: p.id,
            finishTime: p.finishTime,
            position: index + 1,
        }));
}

// Monte Carlo Simulation
export function runMonteCarlo(
    horses: Horse[],
    course: Course,
    condition: RaceCondition,
    iterations: number = 100
): { horseId: string; winCount: number; bestTime: number }[] {
    const stats = new Map<string, { wins: number; bestTime: number }>();
    horses.forEach((h) => stats.set(h.id, { wins: 0, bestTime: 9999 }));

    for (let i = 0; i < iterations; i++) {
        const horseConditions = horses.map((h) => ({
            id: h.id,
            modifier: 0.97 + Math.random() * 0.06,
        }));

        const result = runRace(horses, course, condition, horseConditions);
        const winnerId = result[0]?.horseId;
        if (winnerId && stats.has(winnerId)) {
            stats.get(winnerId)!.wins += 1;
        }

        result.forEach((r) => {
            const currentBest = stats.get(r.horseId)?.bestTime ?? 9999;
            if (r.finishTime < currentBest && stats.has(r.horseId)) {
                stats.get(r.horseId)!.bestTime = r.finishTime;
            }
        });
    }

    // Light Bayesian smoothing to avoid overconfident 0% / 100% artifacts.
    const abilityById = new Map(horses.map((h) => [h.id, getHorseAbilityScore(h)]));
    const abilityTotal = Math.max(1, horses.reduce((sum, h) => sum + (abilityById.get(h.id) ?? 0), 0));
    const priorStrength = Math.max(8, Math.round(iterations * 0.2));

    return Array.from(stats.entries())
        .map(([id, data]) => {
            const abilityShare = (abilityById.get(id) ?? 0) / abilityTotal;
            const prior = priorStrength * abilityShare;
            const smoothedWinPct = ((data.wins + prior) / (iterations + priorStrength)) * 100;
            return {
                horseId: id,
                winCount: Math.round(smoothedWinPct * 10) / 10,
                bestTime: data.bestTime,
            };
        })
        .sort((a, b) => b.winCount - a.winCount);
}
