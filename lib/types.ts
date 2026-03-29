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
  displayName?: string;
  shortComment?: string;
  venue?: string;
  day?: string;
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

export type PredictionSnapshotContributorKey =
  | "abilityScore"
  | "courseFit"
  | "distanceFit"
  | "groundFit"
  | "paceFit"
  | "marketEdge";

export interface PredictionSnapshotContributor {
  key: PredictionSnapshotContributorKey;
  label: string;
  value: number;
}

export interface PredictionSnapshotSignalReason {
  signalLabel: string;
  signalDetailLabel: string | null;
  signalReason: string | null;
}

export interface PredictionSnapshotRow {
  horseId: string;
  horseName: string;
  rank: number;
  score: number;
  winProb: number;
  fairOdds: number | null;
  realOdds: number | null;
  edge: number;
  runningStyle: RunningStyle;
  gateNumber: number;
  jockey: string;
  majorContributors: PredictionSnapshotContributor[];
}

export interface PredictionSnapshotMarketMeta {
  fieldSize: number;
  oddsFetchedAt: string | null;
  oddsSource: string | null;
}

export interface PredictionSnapshot {
  snapshotId: string;
  raceId: string;
  courseId: string;
  capturedAt: string;
  modelFamily: string;
  modelVersion: string;
  scoringConfigHash: string;
  simulationCount: number;
  condition: RaceCondition;
  rankedRows: PredictionSnapshotRow[];
  honmeiHorseId: string | null;
  valueHorseId: string | null;
  watchHorseId: string | null;
  signalReasons: Record<string, PredictionSnapshotSignalReason>;
  marketMeta: PredictionSnapshotMarketMeta;
}
