export type RunningStyle = 'Nige' | 'Senko' | 'Sashi' | 'Oikomi';

export interface Horse {
  id: string;
  name: string;
  // Core Ability Stats (0-100 or similar scale)
  speed: number;
  stamina: number;
  power: number;
  guts: number;

  // Characteristics
  runningStyle: RunningStyle;
  gateNumber: number;
  jockey: string;

  // External Factors
  predictionCount: number; // Number of votes/mentions
  simulatedOdds?: number;  // Calculated based on predictionCount
  realOdds?: number;       // Official/Actual odds from market
}

export interface CourseSegment {
  distance: number; // Length of this segment in meters
  slope: number;    // Gradient percentage (positive = uphill)
  type: 'straight' | 'corner';
}

export interface Course {
  id: string;
  name: string;
  distance: number;
  surface: 'Turf' | 'Dirt';
  segments: CourseSegment[];
  straightLength: number; // Last straight length
}

export interface TrackBias {
  innerOuter: number; // -5 (Inner) to +5 (Outer)
  frontBack: number;  // -5 (Front) to +5 (Back)
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
