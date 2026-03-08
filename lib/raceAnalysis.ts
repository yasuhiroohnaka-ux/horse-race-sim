import { Course, Horse, RaceCondition, RunningStyle } from "./types";

export interface ResolvedTraitScores {
  pedigree: number;
  courseFit: number;
  distanceFit: number;
  groundFit: number;
  paceFit: number;
}

export interface ScenarioProfile {
  abilityScore: number;
  traitScores: ResolvedTraitScores;
  speedModifier: number;
  staminaModifier: number;
  volatility: number;
}

export interface RaceAnalysisRow {
  horseId: string;
  name: string;
  gateNumber: number;
  jockey: string;
  abilityScore: number;
  simWinRate: number;
  bestTime: number;
  fairOdds: number | null;
  officialOdds: number | null;
  officialImplied: number;
  officialRank: number;
  expertOdds: number | null;
  expertImplied: number;
  expertRank: number;
  buzzShare: number;
  favoriteCount: number;
  officialGap: number;
  expertGap: number;
  marketExpertGap: number;
  signalLabel: string;
  horse: Horse;
}

const SURFACE_BASE_BY_STYLE: Record<Course["surface"], Record<RunningStyle, number>> = {
  Turf: {
    Nige: 77,
    Senko: 79,
    Sashi: 81,
    Oikomi: 79,
  },
  Dirt: {
    Nige: 82,
    Senko: 80,
    Sashi: 75,
    Oikomi: 72,
  },
};

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isFrontStyle(style: RunningStyle): boolean {
  return style === "Nige" || style === "Senko";
}

function isBackStyle(style: RunningStyle): boolean {
  return style === "Sashi" || style === "Oikomi";
}

function getCornerRatio(course: Course): number {
  const cornerDistance = course.segments
    .filter((segment) => segment.type === "corner")
    .reduce((sum, segment) => sum + segment.distance, 0);
  return cornerDistance / Math.max(course.distance, 1);
}

function getTrackTightness(course: Course): number {
  return clamp((420 - course.straightLength) / 220 + getCornerRatio(course) * 0.8, -1, 1);
}

function getGroundSeverity(condition: RaceCondition): number {
  switch (condition.groundCondition) {
    case "Firm":
      return 0;
    case "Good":
      return 0.25;
    case "Yielding":
      return 0.65;
    case "Soft":
      return 1;
    default:
      return 0.3;
  }
}

function getWeatherSeverity(condition: RaceCondition): number {
  switch (condition.weather) {
    case "Sunny":
      return 0;
    case "Cloudy":
      return 0.15;
    case "Rain":
      return 0.7;
    case "Snow":
      return 1;
    default:
      return 0.2;
  }
}

function getDistanceShiftRaceBias(
  course: Course,
  condition: RaceCondition,
  tightness: number,
  distanceScale: number
): number {
  const sprintBias = clamp((1600 - course.distance) / 500, 0, 1);
  const stayingBias = clamp((course.distance - 1800) / 800, 0, 1);
  const straightBias = clamp((course.straightLength - 380) / 180, -1, 1);
  const frontBias = clamp(condition.trackBias.frontBack / 5, -1, 1);

  let bias =
    stayingBias * 0.95 -
    sprintBias * 0.9 +
    straightBias * 0.25 -
    tightness * 0.28 -
    frontBias * 0.24 +
    distanceScale * 0.24 +
    getGroundSeverity(condition) * 0.32;

  if (condition.paceScenario === "Fast") bias += 0.3;
  if (condition.paceScenario === "Slow") bias -= 0.3;

  return clamp(bias, -1.2, 1.2);
}

function getDistanceShiftAdjustment(
  horse: Horse,
  course: Course,
  condition: RaceCondition,
  tightness: number,
  distanceScale: number
): number {
  const lastRaceDistance = Number(horse.lastRaceDistance ?? 0);
  if (!(lastRaceDistance > 0)) return 0;

  const distanceChangeRaw = Number.isFinite(Number(horse.distanceChange))
    ? Number(horse.distanceChange)
    : course.distance - lastRaceDistance;
  if (Math.abs(distanceChangeRaw) < 100) return 0;

  const changeUnits = clamp(distanceChangeRaw / 400, -1.25, 1.25);
  const styleBias =
    horse.runningStyle === "Nige"
      ? -0.65
      : horse.runningStyle === "Senko"
        ? -0.25
        : horse.runningStyle === "Sashi"
          ? 0.25
          : 0.55;
  const staminaEdge = clamp((horse.stamina - horse.speed) / 18, -1.4, 1.4);
  const recoveryEdge = clamp((horse.guts - 75) / 18, -0.8, 0.8);
  const horseBias = clamp(styleBias + staminaEdge * 0.72 + recoveryEdge * 0.18, -1.4, 1.4);
  const raceBias = getDistanceShiftRaceBias(course, condition, tightness, distanceScale);
  const alignment = changeUnits * (horseBias * 0.75 + raceBias * 0.55);
  const resilience = clamp(
    ((horse.recentFormScore ?? 0) / 5) * 0.65 + (((horse.lastRaceGradeScore ?? 2) - 2) / 3) * 0.35,
    -1,
    1
  );
  const magnitudePenalty = Math.abs(changeUnits) * 1.05;

  return clamp(alignment * 5.8 - magnitudePenalty + Math.abs(changeUnits) * resilience * 1.8, -8, 8);
}

export function calculateExpertSignal(horse: Horse): number {
  const favorite = Math.max(0, horse.favoriteCount ?? 0);
  const buzz = Math.max(0, horse.xBuzzScore ?? 0);
  const publicSupport = Math.max(0, horse.predictionCount ?? 0);
  return Math.max(1, favorite + publicSupport * 0.08 + buzz * 1.4);
}

export function calculateOdds(horses: Horse[]): Horse[] {
  if (horses.length === 0) return horses;

  const signals = horses.map((horse) => calculateExpertSignal(horse));
  const totalSignal = signals.reduce((sum, signal) => sum + signal, 0);
  const fallbackProbability = 1 / Math.max(horses.length, 1);

  return horses.map((horse, index) => {
    const probability = totalSignal > 0 ? signals[index] / totalSignal : fallbackProbability;
    const expertOdds = probability > 0 ? round1(Math.max(1.1, 0.9 / probability)) : 999.9;
    return {
      ...horse,
      expertOdds,
      simulatedOdds: expertOdds,
    };
  });
}

export function calculateCrowdWinRate(horses: Horse[]): Map<string, number> {
  const total = horses.reduce((sum, horse) => sum + Math.max(0, horse.predictionCount ?? 0), 0);
  if (total <= 0) {
    const flat = horses.length > 0 ? round1(100 / horses.length) : 0;
    return new Map(horses.map((horse) => [horse.id, flat]));
  }

  return new Map(
    horses.map((horse) => [horse.id, round1((Math.max(0, horse.predictionCount ?? 0) / total) * 100)])
  );
}

export function calculateOfficialImpliedProbability(odds?: number): number {
  if (!(odds && odds > 0)) return 0;
  return round1(clamp(100 / odds, 0, 100));
}

export function calculateFairOdds(winRate: number): number | null {
  if (!(winRate > 0)) return null;
  return round1(100 / winRate);
}

export function getResolvedTraitScores(
  horse: Horse,
  course: Course,
  condition: RaceCondition
): ResolvedTraitScores {
  const tightness = getTrackTightness(course);
  const distanceScale = clamp((course.distance - 1200) / 1200, 0, 1);
  const groundSeverity = getGroundSeverity(condition);
  const weatherSeverity = getWeatherSeverity(condition);
  const styleSurfaceBase = SURFACE_BASE_BY_STYLE[course.surface][horse.runningStyle];
  const frontBoost = isFrontStyle(horse.runningStyle) ? 1 : -0.6;
  const backBoost = isBackStyle(horse.runningStyle) ? 1 : -0.5;

  const pedigreeDerived =
    course.surface === "Dirt"
      ? horse.power * 0.38 + horse.stamina * 0.23 + horse.guts * 0.23 + horse.speed * 0.16
      : horse.speed * 0.33 + horse.stamina * 0.29 + horse.guts * 0.2 + horse.power * 0.18;

  const courseDerived =
    course.surface === "Dirt"
      ? horse.power * 0.28 + horse.guts * 0.2 + horse.speed * 0.18 + horse.stamina * 0.14 + styleSurfaceBase * 0.2
      : horse.speed * 0.22 + horse.stamina * 0.18 + horse.guts * 0.14 + horse.power * 0.16 + styleSurfaceBase * 0.3;

  const distanceDerived =
    horse.speed * (0.48 - distanceScale * 0.26) +
    horse.stamina * (0.22 + distanceScale * 0.34) +
    horse.guts * 0.14 +
    horse.power * 0.1 +
    (distanceScale > 0.55 ? backBoost * 4 : frontBoost * 4);
  const distanceShiftAdjustment = getDistanceShiftAdjustment(horse, course, condition, tightness, distanceScale);

  const groundDerived =
    course.surface === "Dirt"
      ? horse.power * 0.34 + horse.guts * 0.23 + horse.stamina * 0.19 + horse.speed * 0.12 + 10
      : horse.speed * 0.26 + horse.stamina * 0.2 + horse.power * 0.2 + horse.guts * 0.16 + 14;

  const paceTemplate = {
    Slow: {
      Nige: 89,
      Senko: 84,
      Sashi: 73,
      Oikomi: 69,
    },
    Average: {
      Nige: 78,
      Senko: 79,
      Sashi: 78,
      Oikomi: 76,
    },
    Fast: {
      Nige: 67,
      Senko: 74,
      Sashi: 84,
      Oikomi: 88,
    },
  }[condition.paceScenario][horse.runningStyle];

  const pedigree = horse.pedigreeScore ?? round1(clamp(pedigreeDerived + groundSeverity * 3 + weatherSeverity * 2, 45, 99));
  const courseFit = horse.courseFitScore ?? round1(clamp(courseDerived + tightness * (frontBoost * 6 - backBoost * 4), 45, 99));
  const distanceFit = horse.distanceFitScore ?? round1(clamp(distanceDerived + distanceShiftAdjustment, 45, 99));
  const groundFit =
    horse.groundFitScore ??
    round1(
      clamp(
        groundDerived +
          groundSeverity * ((horse.power - 72) * 0.3 + (horse.guts - 72) * 0.25 + (horse.stamina - 72) * 0.2) +
          weatherSeverity * 3,
        45,
        99
      )
    );
  const paceFit =
    horse.paceFitScore ??
    round1(
      clamp(
        paceTemplate + (horse.stamina - 75) * 0.08 + (horse.guts - 75) * 0.08 + (horse.speed - 75) * 0.04,
        45,
        99
      )
    );

  return {
    pedigree,
    courseFit,
    distanceFit,
    groundFit,
    paceFit,
  };
}

export function getBaseAbilityScore(horse: Horse): number {
  const averageFinish = Number.isFinite(horse.recentAverageFinish) && (horse.recentAverageFinish ?? 0) > 0
    ? clamp((8 - Number(horse.recentAverageFinish)) * 0.9, -6, 4.5)
    : 0;

  const rawScore =
    horse.speed * 0.31 +
    horse.stamina * 0.24 +
    horse.power * 0.17 +
    horse.guts * 0.12 +
    (horse.jockeyPower ?? 60) * 0.09 +
    (horse.stablePower ?? 60) * 0.05 +
    (horse.trainingScore ?? 0) * 0.7 +
    (horse.recentFormScore ?? 0) * 0.8 +
    (horse.recentTimeIndex ?? 0) * 0.6 +
    ((horse.lastRaceGradeScore ?? 2) - 2) * 0.9 +
    averageFinish;

  return round1(clamp(rawScore, 35, 99));
}

function getWindEffects(style: RunningStyle, condition: RaceCondition): { speed: number; stamina: number } {
  const windLevel = clamp(condition.windSpeed / 12, 0, 1);
  if (windLevel === 0) return { speed: 0, stamina: 0 };

  if (condition.windDirection === "Headwind") {
    return isFrontStyle(style)
      ? { speed: -0.018 * windLevel, stamina: -0.016 * windLevel }
      : { speed: 0.006 * windLevel, stamina: 0.004 * windLevel };
  }

  if (condition.windDirection === "Tailwind") {
    return isFrontStyle(style)
      ? { speed: 0.014 * windLevel, stamina: 0.004 * windLevel }
      : { speed: 0.005 * windLevel, stamina: 0 };
  }

  return {
    speed: isBackStyle(style) ? -0.003 * windLevel : -0.006 * windLevel,
    stamina: -0.006 * windLevel,
  };
}

function getPaceEffects(style: RunningStyle, condition: RaceCondition, paceFit: number): { speed: number; stamina: number } {
  const fitEdge = (paceFit - 75) / 1000;

  switch (condition.paceScenario) {
    case "Slow":
      return isFrontStyle(style)
        ? { speed: 0.012 + fitEdge, stamina: 0.004 + fitEdge * 0.7 }
        : { speed: -0.01 + fitEdge, stamina: -0.003 + fitEdge * 0.4 };
    case "Fast":
      return isFrontStyle(style)
        ? { speed: -0.014 + fitEdge, stamina: -0.012 + fitEdge * 0.7 }
        : { speed: 0.011 + fitEdge, stamina: 0.01 + fitEdge * 0.5 };
    default:
      return { speed: fitEdge * 0.8, stamina: fitEdge * 0.5 };
  }
}

export function getScenarioProfile(horse: Horse, course: Course, condition: RaceCondition): ScenarioProfile {
  const traitScores = getResolvedTraitScores(horse, course, condition);
  const baseAbility = getBaseAbilityScore(horse);
  const groundSeverity = getGroundSeverity(condition);
  const weatherSeverity = getWeatherSeverity(condition);
  const windEffects = getWindEffects(horse.runningStyle, condition);
  const paceEffects = getPaceEffects(horse.runningStyle, condition, traitScores.paceFit);

  const traitSpeedEdge =
    (traitScores.pedigree - 72) * 0.0007 +
    (traitScores.courseFit - 72) * 0.0008 +
    (traitScores.distanceFit - 72) * 0.0006 +
    (traitScores.groundFit - 72) * (0.0004 + groundSeverity * 0.0008) +
    (traitScores.paceFit - 72) * 0.0009 +
    weatherSeverity * (traitScores.groundFit - 70) * 0.0005;

  const traitStaminaEdge =
    (traitScores.distanceFit - 72) * 0.0012 +
    (traitScores.groundFit - 72) * (0.0008 + groundSeverity * 0.0009) +
    (traitScores.paceFit - 72) * 0.0007 +
    weatherSeverity * (traitScores.pedigree - 70) * 0.0004;

  const speedModifier = clamp(1 + traitSpeedEdge + windEffects.speed + paceEffects.speed, 0.9, 1.13);
  const staminaModifier = clamp(1 + traitStaminaEdge + windEffects.stamina + paceEffects.stamina, 0.9, 1.16);
  const scenarioAbility = round1(clamp(baseAbility * ((speedModifier + staminaModifier) / 2), 35, 99));
  const volatility = clamp(
    1.18 - ((horse.guts + traitScores.paceFit + Math.max(horse.trainingScore ?? 0, 0) * 5) / 220),
    0.72,
    1.18
  );

  return {
    abilityScore: scenarioAbility,
    traitScores,
    speedModifier,
    staminaModifier,
    volatility,
  };
}

function getSignalLabel(simWinRate: number, officialImplied: number, expertImplied: number): string {
  const officialGap = simWinRate - officialImplied;
  const expertGap = simWinRate - expertImplied;
  const marketExpertGap = expertImplied - officialImplied;

  if (officialGap <= -8 && officialImplied >= expertImplied) return "危険人気";
  if (officialGap >= 8 && marketExpertGap >= 2) return "プロ先行妙味";
  if (officialGap >= 8) return "市場盲点";
  if (expertGap <= -6 && marketExpertGap > 0) return "ガチ勢過熱";
  if (marketExpertGap >= 6) return "ガチ勢先行";
  if (marketExpertGap <= -6) return "一般人気先行";
  if (officialGap >= 3) return "やや妙味";
  if (officialGap <= -3) return "やや過熱";
  return "概ね妥当";
}

export function buildRaceAnalysisRows(
  results: { horseId: string; winCount: number; bestTime: number }[],
  horses: Horse[],
  course: Course,
  condition: RaceCondition
): RaceAnalysisRow[] {
  const crowdWinMap = calculateCrowdWinRate(horses);
  const resultById = new Map(results.map((result) => [result.horseId, result]));
  const profileById = new Map(horses.map((horse) => [horse.id, getScenarioProfile(horse, course, condition)]));

  const totalExpertSignal = Math.max(
    1,
    horses.reduce((sum, horse) => sum + calculateExpertSignal(horse), 0)
  );

  const officialRankMap = new Map(
    [...horses]
      .sort((a, b) => (a.realOdds ?? Number.MAX_SAFE_INTEGER) - (b.realOdds ?? Number.MAX_SAFE_INTEGER))
      .map((horse, index) => [horse.id, index + 1])
  );

  const expertRankMap = new Map(
    [...horses]
      .sort((a, b) => calculateExpertSignal(b) - calculateExpertSignal(a))
      .map((horse, index) => [horse.id, index + 1])
  );

  return horses
    .map((horse) => {
      const result = resultById.get(horse.id);
      const simWinRate = round1(result?.winCount ?? 0);
      const officialImplied = calculateOfficialImpliedProbability(horse.realOdds);
      const expertImplied = round1((calculateExpertSignal(horse) / totalExpertSignal) * 100);
      const officialGap = round1(simWinRate - officialImplied);
      const expertGap = round1(simWinRate - expertImplied);
      const marketExpertGap = round1(expertImplied - officialImplied);
      const fairOdds = calculateFairOdds(simWinRate);

      return {
        horseId: horse.id,
        name: horse.name,
        gateNumber: horse.gateNumber,
        jockey: horse.jockey,
        abilityScore: profileById.get(horse.id)?.abilityScore ?? getBaseAbilityScore(horse),
        simWinRate,
        bestTime: round1(result?.bestTime ?? 0),
        fairOdds,
        officialOdds: horse.realOdds ?? null,
        officialImplied,
        officialRank: officialRankMap.get(horse.id) ?? horses.length,
        expertOdds: horse.expertOdds ?? horse.simulatedOdds ?? calculateFairOdds(expertImplied),
        expertImplied,
        expertRank: expertRankMap.get(horse.id) ?? horses.length,
        buzzShare: crowdWinMap.get(horse.id) ?? 0,
        favoriteCount: horse.favoriteCount ?? 0,
        officialGap,
        expertGap,
        marketExpertGap,
        signalLabel: getSignalLabel(simWinRate, officialImplied, expertImplied),
        horse,
      };
    })
    .sort((a, b) => b.simWinRate - a.simWinRate || a.officialRank - b.officialRank);
}
