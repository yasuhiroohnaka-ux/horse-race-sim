import { Horse } from "./types";
import { getDefaultHorses as getLegacyDefaultHorses } from "./raceData";
import { GENERATED_WEEKLY_HORSES_MAP } from "./generatedRaceSchedule";
import { GENERATED_DRAW_OVERRIDES } from "./generatedDrawOverrides";
import { applyNetkeibaRatings } from "./netkeibaRatings";

function enrichHorse(_courseId: string, horse: Horse): Horse {
  return applyNetkeibaRatings(horse);
}

function normalizeName(name: string): string {
  return String(name ?? "").toLowerCase().replace(/[\s　・･\-_.]/g, "");
}

export function getDefaultHorses(courseId: string): Horse[] {
  const generated = GENERATED_WEEKLY_HORSES_MAP[courseId];

  if (generated && generated.length > 0) {
    return generated
      .map((h, i) =>
        enrichHorse(courseId, {
          id: h.id,
          gateNumber: h.gateNumber > 0 ? h.gateNumber : i + 1,
          name: h.name,
          jockey: h.jockey || "未定",
          trainer: h.trainer,
          speed: h.speed,
          stamina: h.stamina,
          power: h.power,
          guts: h.guts,
          runningStyle: h.runningStyle,
          favoriteCount: h.favoriteCount,
          xBuzzScore: h.xBuzzScore,
          predictionCount: h.predictionCount,
          simulatedOdds: 0,
          realOdds: h.realOdds,
          oddsSource: h.oddsSource,
          sex: h.sex ?? "M",
          weight: Number.isFinite(h.weight) ? h.weight : 57,
          condition: h.condition ?? 5,
          trainingScore: h.trainingScore ?? 0,
          recentFormScore: h.recentFormScore ?? 0,
          recentAverageFinish: h.recentAverageFinish ?? 0,
          recentTimeIndex: h.recentTimeIndex ?? 0,
          lastRaceGradeScore: h.lastRaceGradeScore ?? 2,
          lastRaceGradeLabel: h.lastRaceGradeLabel ?? "OP",
          lastRaceDistance: h.lastRaceDistance ?? 0,
          distanceChange: h.distanceChange ?? 0
        })
      )
      .sort((a, b) => (a.gateNumber ?? 999) - (b.gateNumber ?? 999));
  }

  const generatedById = new Map((generated ?? []).map((g) => [String(g.id), g]));
  const drawOverrides = GENERATED_DRAW_OVERRIDES[courseId] ?? {};
  const drawByName = new Map(Object.entries(drawOverrides).map(([name, gate]) => [normalizeName(name), Number(gate)]));

  return getLegacyDefaultHorses(courseId)
    .map((h, i) => {
      const g = generatedById.get(String(h.id));
      const byName = drawByName.get(normalizeName(h.name));
      const gateNumber =
        Number.isFinite(byName) && (byName ?? 0) > 0
          ? Number(byName)
          : g && Number.isFinite(g.gateNumber) && g.gateNumber > 0
            ? g.gateNumber
            : h.gateNumber ?? i + 1;
      const weight = g && Number.isFinite(g.weight) && g.weight > 0 ? g.weight : h.weight ?? 57;

      return enrichHorse(courseId, {
        ...h,
        gateNumber,
        sex: h.sex ?? "M",
        weight,
        favoriteCount: h.favoriteCount ?? g?.favoriteCount ?? 0,
        xBuzzScore: h.xBuzzScore ?? g?.xBuzzScore ?? 0,
        oddsSource: h.oddsSource ?? g?.oddsSource,
        condition: h.condition ?? 5,
        recentFormScore: h.recentFormScore ?? 0,
        recentAverageFinish: h.recentAverageFinish ?? 0,
        recentTimeIndex: h.recentTimeIndex ?? 0,
        lastRaceGradeScore: h.lastRaceGradeScore ?? 2,
        lastRaceGradeLabel: h.lastRaceGradeLabel ?? "OP",
        lastRaceDistance: h.lastRaceDistance ?? 0,
        distanceChange: h.distanceChange ?? 0,
        jockey: h.jockey ?? "未定"
      });
    })
    .sort((a, b) => (a.gateNumber ?? 999) - (b.gateNumber ?? 999));
}
