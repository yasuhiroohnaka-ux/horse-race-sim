export interface RaceVolatility {
  courseId: string;
  upsetScore: number; // 0-100
  reason: string;
  source: string;
}

import { GENERATED_RACE_VOLATILITY } from "./generatedRaceVolatility";

export const RACE_VOLATILITY: Record<string, RaceVolatility> = GENERATED_RACE_VOLATILITY;

export function getUpsetScore(courseId: string): number {
  return RACE_VOLATILITY[courseId]?.upsetScore ?? 45;
}
