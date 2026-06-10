import { Course, Horse, RaceCondition, RaceResult, RunningStyle } from "./types";
import {
  calculateCrowdWinRate,
  calculateOdds,
  clamp,
  getScenarioProfile,
  round1,
} from "./raceAnalysis";
import { MONTE_CARLO_RUNS } from "./simulationConfig";

export type { Horse, RunningStyle };
export { calculateCrowdWinRate, calculateOdds };

const BASE_SPEED = 16.05;
const SPEED_ABILITY_FACTOR = 0.0088;
const STAMINA_DRAIN_RATE = 1.02;
const JOCKEY_MOD_FACTOR = 0.00045;
const STABLE_MOD_FACTOR = 0.0003;
const MONTE_CARLO_MEAN_REVERSION = 0.34;

function getGroundConditionModifiers(
  groundCondition: RaceCondition["groundCondition"],
  surface: Course["surface"]
): { speedMod: number; staminaDrainMod: number } {
  const dirtMultiplier = surface === "Dirt" ? 0.8 : 1;
  switch (groundCondition) {
    case "Firm":
      return { speedMod: 1.01, staminaDrainMod: 0.96 };
    case "Good":
      return { speedMod: 1.0, staminaDrainMod: 1.0 };
    case "Yielding":
      return { speedMod: 0.985, staminaDrainMod: 1.12 * dirtMultiplier };
    case "Soft":
      return { speedMod: 0.968, staminaDrainMod: 1.24 * dirtMultiplier };
    default:
      return { speedMod: 1.0, staminaDrainMod: 1.0 };
  }
}

function getWeatherModifiers(weather: RaceCondition["weather"]): { speedMod: number; staminaDrainMod: number } {
  switch (weather) {
    case "Sunny":
      return { speedMod: 1.0, staminaDrainMod: 1.0 };
    case "Cloudy":
      return { speedMod: 0.998, staminaDrainMod: 1.01 };
    case "Rain":
      return { speedMod: 0.99, staminaDrainMod: 1.06 };
    case "Snow":
      return { speedMod: 0.982, staminaDrainMod: 1.11 };
    default:
      return { speedMod: 1.0, staminaDrainMod: 1.0 };
  }
}

function getRunningStyleBonus(style: RunningStyle, bias: RaceCondition["trackBias"]): number {
  const biasValue = bias.frontBack;
  if (style === "Nige" || style === "Senko") {
    return biasValue > 0 ? biasValue * 0.055 : 0;
  }
  if (style === "Sashi" || style === "Oikomi") {
    return biasValue < 0 ? Math.abs(biasValue) * 0.055 : 0;
  }
  return 0;
}

function isFrontStyle(style: RunningStyle): boolean {
  return style === "Nige" || style === "Senko";
}

function isBackStyle(style: RunningStyle): boolean {
  return style === "Sashi" || style === "Oikomi";
}

function getRecentPerformanceModifier(horse: Horse): number {
  const formScore = clamp(horse.recentFormScore ?? 0, -5, 5);
  const timeIndex = clamp(horse.recentTimeIndex ?? 0, -5, 5);
  const gradeScore = clamp(horse.lastRaceGradeScore ?? 2, 0, 5);
  const averageFinish = horse.recentAverageFinish;
  const finishBonus = Number.isFinite(averageFinish)
    ? clamp((7 - Number(averageFinish)) * 0.002, -0.012, 0.012)
    : 0;
  return clamp(1 + finishBonus + formScore * 0.0018 + timeIndex * 0.0018 + (gradeScore - 2) * 0.0015, 0.96, 1.04);
}

function getPaceAdjustmentByStyle(horses: Horse[], condition: RaceCondition): Map<string, number> {
  const frontCount = horses.filter((horse) => horse.runningStyle === "Nige" || horse.runningStyle === "Senko").length;
  const fieldSize = Math.max(horses.length, 1);
  const frontRatio = frontCount / fieldSize;
  const scenarioPressure =
    condition.paceScenario === "Slow" ? -0.12 : condition.paceScenario === "Fast" ? 0.12 : 0;
  const pressure = clamp(frontRatio - 0.45 + scenarioPressure, -0.28, 0.28);

  return new Map(
    horses.map((horse) => {
      const signed = isFrontStyle(horse.runningStyle) ? -pressure : pressure * 0.82;
      return [horse.id, clamp(1 + signed * 0.09, 0.978, 1.024)];
    })
  );
}

function getCourseInnerTilt(course: Course): number {
  const cornerDistance = course.segments
    .filter((segment) => segment.type === "corner")
    .reduce((sum, segment) => sum + segment.distance, 0);
  const cornerRatio = cornerDistance / Math.max(course.distance, 1);
  const shortStraightNorm = clamp((420 - course.straightLength) / 220, -0.6, 0.8);
  return clamp(cornerRatio * 1.1 + shortStraightNorm * 0.9, -1, 1);
}

function getDrawTacticalAdjustmentMap(
  horses: Horse[],
  course: Course,
  condition: RaceCondition
): Map<string, number> {
  const sorted = [...horses].sort((a, b) => a.gateNumber - b.gateNumber);
  const fieldSize = Math.max(sorted.length, 1);
  const smallFieldDamp = fieldSize < 8 ? 0.2 : 1;
  const frontBackBias = clamp(condition.trackBias.frontBack / 5, -1, 1);
  const innerOuterBias = clamp(condition.trackBias.innerOuter / 5, -1, 1);
  const courseInnerTilt = getCourseInnerTilt(course);

  return new Map(
    sorted.map((horse, index) => {
      const lanePos = fieldSize <= 1 ? 0 : (index / (fieldSize - 1)) * 2 - 1;
      const left = index > 0 ? sorted[index - 1] : null;
      const right = index < fieldSize - 1 ? sorted[index + 1] : null;
      const nearbyFront = [left, right].filter((entry) => entry && isFrontStyle(entry.runningStyle)).length;
      const nearbyBack = [left, right].filter((entry) => entry && isBackStyle(entry.runningStyle)).length;

      const lanePct = (-lanePos * courseInnerTilt + lanePos * innerOuterBias) * 0.0034 * smallFieldDamp;
      const styleBiasPct = isFrontStyle(horse.runningStyle)
        ? frontBackBias * 0.0026 * smallFieldDamp
        : isBackStyle(horse.runningStyle)
          ? -frontBackBias * 0.0024 * smallFieldDamp
          : 0;

      let tacticalPct = 0;
      if (horse.runningStyle === "Nige") {
        if (right && isFrontStyle(right.runningStyle)) tacticalPct -= 0.003;
        if (nearbyFront === 0) tacticalPct += 0.0016;
      } else if (horse.runningStyle === "Senko") {
        tacticalPct -= nearbyFront * 0.0011;
      } else {
        tacticalPct -= nearbyBack * 0.0009;
        if (lanePos < -0.3 && nearbyBack > 0) tacticalPct -= 0.0005;
      }

      const modifier = fieldSize < 8
        ? clamp(1 + lanePct + styleBiasPct + tacticalPct, 0.996, 1.004)
        : clamp(1 + lanePct + styleBiasPct + tacticalPct, 0.988, 1.013);
      return [horse.id, modifier];
    })
  );
}

export function runRace(
  horses: Horse[],
  course: Course,
  condition: RaceCondition,
  horseConditions?: { id: string; modifier: number }[]
): RaceResult[] {
  const groundMod = getGroundConditionModifiers(condition.groundCondition, course.surface);
  const weatherMod = getWeatherModifiers(condition.weather);
  const paceMap = getPaceAdjustmentByStyle(horses, condition);
  const drawTacticalMap = getDrawTacticalAdjustmentMap(horses, course, condition);
  const horseConditionMap = new Map((horseConditions ?? []).map((item) => [item.id, item.modifier]));
  const profileById = new Map(horses.map((horse) => [horse.id, getScenarioProfile(horse, course, condition)]));

  const currentPositions = horses.map((horse) => {
    const profile = profileById.get(horse.id)!;
    const conditionVal = horse.condition ?? 5;
    const conditionMod = 1 + (conditionVal - 5) * 0.003;
    const weightVal = horse.weight ?? 57;
    const weightMod = 1 - (weightVal - 57) * 0.002;
    const jockeyMod = 1 + ((horse.jockeyPower ?? 60) - 60) * JOCKEY_MOD_FACTOR;
    const stableMod = 1 + ((horse.stablePower ?? 60) - 60) * STABLE_MOD_FACTOR;
    const recentPerfMod = getRecentPerformanceModifier(horse);
    const baseAbilitySpeed = BASE_SPEED + profile.abilityScore * SPEED_ABILITY_FACTOR;
    const staminaBuffer = clamp(
      horse.stamina *
        profile.staminaModifier *
        (1 + (horse.guts - 80) * 0.0015 + (horse.power - 80) * 0.001),
      55,
      145
    );
    const paceMod = paceMap.get(horse.id) ?? 1;
    const drawTacticalMod = drawTacticalMap.get(horse.id) ?? 1;
    const launchMod = 0.982 + Math.random() * 0.036;

    return {
      id: horse.id,
      distanceCovered: 0,
      currentSpeed:
        baseAbilitySpeed *
        conditionMod *
        weightMod *
        jockeyMod *
        stableMod *
        recentPerfMod *
        paceMod *
        drawTacticalMod *
        profile.speedModifier *
        groundMod.speedMod *
        weatherMod.speedMod *
        launchMod,
      stamina: staminaBuffer,
      finishTime: Number.POSITIVE_INFINITY,
      finished: false,
      volatility: profile.volatility,
      closingKick: clamp(1 + (horse.guts - 75) * 0.001 + (profile.traitScores.paceFit - 75) * 0.0008, 0.98, 1.08),
      externalModifier: horseConditionMap.get(horse.id) ?? 1,
    };
  });

  const raceTick = 1;
  let raceTime = 0;
  let finishedCount = 0;

  while (finishedCount < horses.length && raceTime < 320) {
    raceTime += raceTick;

    currentPositions.forEach((position) => {
      if (position.finished) return;

      const horse = horses.find((entry) => entry.id === position.id);
      if (!horse) return;

      const progressRatio = clamp(position.distanceCovered / Math.max(course.distance, 1), 0, 1);
      const randomFlux = (Math.random() - 0.5) * 5.2 * position.volatility;
      const styleBonus = getRunningStyleBonus(horse.runningStyle, condition.trackBias);
      const finishKick = progressRatio > 0.7 ? position.closingKick : 1;

      let speed = (position.currentSpeed + randomFlux + styleBonus) * position.externalModifier * finishKick;

      if (position.stamina <= 0) {
        speed *= 0.82;
      } else {
        position.stamina -=
          STAMINA_DRAIN_RATE *
          (speed / BASE_SPEED) *
          groundMod.staminaDrainMod *
          weatherMod.staminaDrainMod;
      }

      position.distanceCovered += Math.max(0, speed) * raceTick;

      if (position.distanceCovered >= course.distance) {
        position.finished = true;
        position.finishTime = raceTime;
        finishedCount += 1;
      }
    });
  }

  currentPositions.forEach((position) => {
    if (Number.isFinite(position.finishTime)) return;
    const remaining = Math.max(course.distance - position.distanceCovered, 0);
    position.finishTime = raceTime + remaining / Math.max(position.currentSpeed * 0.75, 1);
  });

  return currentPositions
    .sort((a, b) => a.finishTime - b.finishTime)
    .map((position, index) => ({
      horseId: position.id,
      finishTime: round1(position.finishTime),
      position: index + 1,
    }));
}

export function runMonteCarlo(
  horses: Horse[],
  course: Course,
  condition: RaceCondition,
  iterations = MONTE_CARLO_RUNS
): { horseId: string; winCount: number; bestTime: number; top3Count: number }[] {
  const stats = new Map<string, { wins: number; top3: number; bestTime: number }>();
  horses.forEach((horse) => stats.set(horse.id, { wins: 0, top3: 0, bestTime: Number.POSITIVE_INFINITY }));

  for (let index = 0; index < iterations; index += 1) {
    const horseConditions = horses.map((horse) => {
      const profile = getScenarioProfile(horse, course, condition);
      const swing = 0.08 * profile.volatility;
      return {
        id: horse.id,
        modifier: 1 - swing + Math.random() * swing * 2,
      };
    });

    const result = runRace(horses, course, condition, horseConditions);
    const winnerId = result[0]?.horseId;
    if (winnerId && stats.has(winnerId)) {
      stats.get(winnerId)!.wins += 1;
    }

    for (const row of result.slice(0, 3)) {
      const entry = stats.get(row.horseId);
      if (entry) entry.top3 += 1;
    }

    result.forEach((row) => {
      const currentBest = stats.get(row.horseId)?.bestTime ?? Number.POSITIVE_INFINITY;
      if (row.finishTime < currentBest && stats.has(row.horseId)) {
        stats.get(row.horseId)!.bestTime = row.finishTime;
      }
    });
  }

  const abilityById = new Map(horses.map((horse) => [horse.id, getScenarioProfile(horse, course, condition).abilityScore]));
  const abilityTotal = Math.max(1, horses.reduce((sum, horse) => sum + (abilityById.get(horse.id) ?? 0), 0));
  const priorStrength = Math.max(3, Math.round(iterations * 0.04));
  const fieldMeanPct = 100 / Math.max(1, horses.length);
  const top3SlotCount = Math.min(3, Math.max(1, horses.length));
  const fieldMeanTop3Pct = (100 * top3SlotCount) / Math.max(1, horses.length);

  return Array.from(stats.entries())
    .map(([id, data]) => {
      const abilityShare = (abilityById.get(id) ?? 0) / abilityTotal;
      const prior = priorStrength * abilityShare;
      const smoothedWinPct = ((data.wins + prior) / (iterations + priorStrength)) * 100;
      const calibratedWinPct =
        smoothedWinPct * (1 - MONTE_CARLO_MEAN_REVERSION) +
        fieldMeanPct * MONTE_CARLO_MEAN_REVERSION;
      const smoothedTop3Pct = ((data.top3 + prior * top3SlotCount) / (iterations + priorStrength)) * 100;
      const calibratedTop3Pct =
        smoothedTop3Pct * (1 - MONTE_CARLO_MEAN_REVERSION) +
        fieldMeanTop3Pct * MONTE_CARLO_MEAN_REVERSION;
      return {
        horseId: id,
        winCount: round1(calibratedWinPct),
        bestTime: round1(data.bestTime),
        top3Count: round1(clamp(calibratedTop3Pct, 0, 100)),
      };
    })
    .sort((a, b) => b.winCount - a.winCount);
}
