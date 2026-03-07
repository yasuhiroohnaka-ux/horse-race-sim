export type RunningStyle = 'Nige' | 'Senko' | 'Sashi' | 'Oikomi';

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
  condition?: number;
  weight?: number;
  sex?: 'M' | 'F';
  favoriteCount?: number;
  xBuzzScore?: number;
  oddsSource?: string;
  predictionCount: number;
  simulatedOdds?: number;
  realOdds?: number;
}

export interface CourseSegment {
  distance: number;
  slope: number;
  type: 'straight' | 'corner';
}

export interface Course {
  id: string;
  name: string;
  distance: number;
  surface: 'Turf' | 'Dirt';
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
  groundCondition: 'Firm' | 'Good' | 'Yielding' | 'Soft';
}

export interface RaceResult {
  horseId: string;
  finishTime: number;
  position: number;
}
