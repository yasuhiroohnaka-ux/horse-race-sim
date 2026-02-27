import { Horse } from "./types";
import { getDefaultHorses as getLegacyDefaultHorses } from "./raceData";
import { GENERATED_WEEKLY_HORSES_MAP } from "./generatedRaceSchedule";
import { applyNetkeibaRatings } from "./netkeibaRatings";
import { applyTrainingInsight } from "./trainingInsights";

function enrichHorse(courseId: string, horse: Horse): Horse {
  return applyTrainingInsight(courseId, applyNetkeibaRatings(horse));
}

export function getDefaultHorses(courseId: string): Horse[] {
  const generated = GENERATED_WEEKLY_HORSES_MAP[courseId];
  // Safety guard: only trust generated weekly data when enough horses are present.
  // This prevents accidental fallback to placeholder/sampled entries.
  if (generated && generated.length >= 8) {
    return generated.map((h, i) =>
      enrichHorse(courseId, {
        id: h.id,
        gateNumber: h.gateNumber > 0 ? h.gateNumber : i + 1,
        name: h.name,
        jockey: "未定",
        speed: h.speed,
        stamina: h.stamina,
        power: h.power,
        guts: h.guts,
        runningStyle: h.runningStyle,
        predictionCount: h.predictionCount,
        simulatedOdds: 0,
        realOdds: h.realOdds,
        sex: h.sex ?? "M",
        weight: Number.isFinite(h.weight) ? h.weight : 57,
        condition: 5,
      })
    );
  }

  return getLegacyDefaultHorses(courseId).map((h, i) =>
    enrichHorse(courseId, {
      ...h,
      gateNumber: h.gateNumber ?? i + 1,
      sex: h.sex ?? "M",
      weight: h.weight ?? 57,
      condition: h.condition ?? 5,
      jockey: h.jockey ?? "未定",
    })
  );
}
