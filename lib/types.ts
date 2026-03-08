export type RunningStyle = "Nige" | "Senko" | "Sashi" | "Oikomi";
export type HorseSex = "M" | "F";
export type GroundCondition = "Firm" | "Good" | "Yielding" | "Soft";
export type Weather = "Sunny" | "Cloudy" | "Rain" | "Snow";
export type WindDirection = "Headwind" | "Tailwind" | "Crosswind";
export type PaceScenario = "Slow" | "Average" | "Fast";

export interface Horse {
  id: string;
  name: string;
  speed: number;
  stamina: number;
  power: number;
  guts: number;
  runningStyle: RunningStyle;
  gateNumber: number;
  jockey: string;
  trainer?: string;
  jockeyPower?: number;
  stablePower?: number;
  trainingScore?: number;
  trainingNote?: string;
  recentFormScore?: number;
  recentAverageFinish?: number;
  recentTimeIndex?: number;
  lastRaceGradeScore?: number;
  lastRaceGradeLabel?: string;
  lastRaceDistance?: number;
  distanceChange?: number;
  condition?: number;
  weight?: number;
  sex?: HorseSex;
  favoriteCount?: number;
  xBuzzScore?: number;
  oddsSource?: string;
  predictionCount: number;
  simulatedOdds?: number;
  expertOdds?: number;
  realOdds?: number;
  pedigreeScore?: number;
  courseFitScore?: number;
  distanceFitScore?: number;
  groundFitScore?: number;
  paceFitScore?: number;
}

export interface CourseSegment {
  distance: number;
  slope: number;
  type: "straight" | "corner";
}

export interface Course {
  id: string;
  name: string;
  grade?: string;
  distance: number;
  surface: "Turf" | "Dirt";
  segments: CourseSegment[];
  straightLength: number;
  hashtag: string;
  archived?: boolean;
  defaultBias?: TrackBias;
}

export interface TrackBias {
  innerOuter: number;
  frontBack: number;
}

export interface RaceCondition {
  courseId: string;
  trackBias: TrackBias;
  groundCondition: GroundCondition;
  weather: Weather;
  windDirection: WindDirection;
  windSpeed: number;
  paceScenario: PaceScenario;
}

export interface RaceResult {
  horseId: string;
  finishTime: number;
  position: number;
}
