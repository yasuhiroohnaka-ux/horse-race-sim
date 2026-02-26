import { Horse } from "./types";
import {
  GENERATED_TRAINING_INSIGHTS,
  GENERATED_X_TRAINING_OVERRIDES,
} from "./generatedTrainingData";

export interface TrainingInsight {
  courseId: string;
  horseId: string;
  score: number; // -5 to +5
  note: string;
  source: string;
  publishedAt: string; // YYYY-MM-DD
  channel: "news" | "x";
}

export const TRAINING_INSIGHTS: TrainingInsight[] = [...GENERATED_TRAINING_INSIGHTS];
export const X_TRAINING_OVERRIDES: TrainingInsight[] = [...GENERATED_X_TRAINING_OVERRIDES];

const keyOf = (courseId: string, horseId: string): string => `${courseId}:${horseId}`;

const INSIGHT_MAP: Map<string, TrainingInsight> = new Map(
  [...TRAINING_INSIGHTS, ...X_TRAINING_OVERRIDES].map((entry) => [keyOf(entry.courseId, entry.horseId), entry])
);

export function applyTrainingInsight<T extends Horse>(courseId: string, horse: T): T {
  const insight = INSIGHT_MAP.get(keyOf(courseId, horse.id));
  if (!insight) {
    return {
      ...horse,
      trainingScore: horse.trainingScore ?? 0,
    };
  }

  return {
    ...horse,
    trainingScore: horse.trainingScore ?? insight.score,
    trainingNote: horse.trainingNote ?? insight.note,
  };
}
