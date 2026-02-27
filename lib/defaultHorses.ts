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

  // Prefer generated weekly data only when the field size is sufficiently complete.
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

  // Fallback path: keep legacy full-field entries, but overlay generated gate/weight
  // values when available so draw updates are visible even with partial generated data.
  const generatedById = new Map((generated ?? []).map((g) => [String(g.id), g]));

  return getLegacyDefaultHorses(courseId).map((h, i) => {
    const g = generatedById.get(String(h.id));
    const gateNumber = g && Number.isFinite(g.gateNumber) && g.gateNumber > 0 ? g.gateNumber : h.gateNumber ?? i + 1;
    const weight = g && Number.isFinite(g.weight) && g.weight > 0 ? g.weight : h.weight ?? 57;

    return enrichHorse(courseId, {
      ...h,
      gateNumber,
      sex: h.sex ?? "M",
      weight,
      condition: h.condition ?? 5,
      jockey: h.jockey ?? "未定",
    });
  });
}
