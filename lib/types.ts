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
  trainer?: string;
  jockeyPower?: number; // 0-100 (netkeiba jockey metrics)
  stablePower?: number; // 0-100 (netkeiba trainer/stable metrics)
  trainingScore?: number; // -5 to +5 (Wed/Thu workout signal)
  trainingNote?: string;  // Short memo for why trainingScore was set

  // Condition & Weight
  condition?: number;    // 状態値 0-10 (5=普通, 高い=好調)
  weight?: number;       // 斤量 (kg) — 混合戦牝馬は-2kg
  sex?: 'M' | 'F';      // 性別 (牡=M, 牝=F)

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
  hashtag: string;        // X投稿用ハッシュタグ
  archived?: boolean;     // アーカイブ済みフラグ
  defaultBias?: TrackBias; // コース特性に基づくデフォルトバイアス
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
