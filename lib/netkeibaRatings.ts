import { Horse } from "./types";
import { JOCKEY_WIN_RATE, TRAINER_WIN_RATE } from "./generatedNetkeibaData";

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const hash = (text: string): number => {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
};

function winRateToPower(winRate: number, floor = 40, ceil = 95): number {
  const normalized = clamp((winRate - 5) / 22, 0, 1);
  return Math.round(floor + normalized * (ceil - floor));
}

export function getJockeyPower(jockey: string): number {
  const winRate = JOCKEY_WIN_RATE[jockey];
  if (typeof winRate === "number") {
    return winRateToPower(winRate);
  }
  return 60;
}

export function getStablePower(horse: Pick<Horse, "trainer" | "id" | "name" | "realOdds" | "jockey">): number {
  if (horse.trainer && TRAINER_WIN_RATE[horse.trainer] !== undefined) {
    return winRateToPower(TRAINER_WIN_RATE[horse.trainer], 42, 96);
  }

  const jockeyPower = getJockeyPower(horse.jockey);
  const odds = Math.max(horse.realOdds ?? 30, 1.1);
  const oddsBase = clamp(88 - Math.log10(odds) * 24, 45, 88);
  const jitter = (hash(`${horse.id}:${horse.name}`) % 7) - 3;
  return Math.round(clamp(oddsBase * 0.6 + jockeyPower * 0.4 + jitter, 40, 94));
}

export function applyNetkeibaRatings<T extends Horse>(horse: T): T {
  return {
    ...horse,
    jockeyPower: horse.jockeyPower ?? getJockeyPower(horse.jockey),
    stablePower: horse.stablePower ?? getStablePower(horse),
  };
}
