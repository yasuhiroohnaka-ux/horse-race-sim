import { Horse } from "./types";
import { getDefaultHorses as getLegacyDefaultHorses } from "./raceData";
import { GENERATED_WEEKLY_HORSES_MAP } from "./generatedRaceSchedule";
import { applyNetkeibaRatings } from "./netkeibaRatings";
import { applyTrainingInsight } from "./trainingInsights";

export function getDefaultHorses(courseId: string): Horse[] {
  const generated = GENERATED_WEEKLY_HORSES_MAP[courseId];
  if (generated && generated.length > 0) {
    return generated.map((h, i) =>
      applyTrainingInsight(
        courseId,
        applyNetkeibaRatings({
          id: h.id,
          gateNumber: i + 1,
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
          sex: "M",
          weight: 57,
          condition: 5,
        } as Horse)
      )
    );
  }

  return getLegacyDefaultHorses(courseId);
}

