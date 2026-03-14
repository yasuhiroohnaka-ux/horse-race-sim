import type { Horse } from "./types";

function normalizeHorseName(name: string): string {
  return String(name ?? "").toLowerCase().replace(/[\s　・･\-_.]/g, "");
}

function horseQualityScore(horse: Horse): number {
  let score = 0;
  if (String(horse.jockey ?? "").trim() && horse.jockey !== "未定") score += 3;
  if (String(horse.trainer ?? "").trim()) score += 2;
  if ((horse.realOdds ?? 0) > 0) score += 2;
  if ((horse.expertOdds ?? 0) > 0) score += 1;
  if ((horse.favoriteCount ?? 0) > 0) score += 1;
  if ((horse.predictionCount ?? 0) > 0) score += 1;
  if ((horse.recentFormScore ?? 0) !== 0) score += 1;
  if ((horse.trainingScore ?? 0) !== 0) score += 1;
  return score;
}

function choosePreferredHorse(existing: Horse, incoming: Horse): Horse {
  return horseQualityScore(incoming) > horseQualityScore(existing) ? incoming : existing;
}

export function dedupeHorses(horses: Horse[]): Horse[] {
  const deduped: Horse[] = [];
  const indexById = new Map<string, number>();
  const indexByNameGate = new Map<string, number>();

  for (const horse of horses) {
    const idKey = String(horse.id ?? "").trim();
    const normalizedName = normalizeHorseName(horse.name);
    const gate = Number(horse.gateNumber ?? 0);
    const nameGateKey = normalizedName && gate > 0 ? `${normalizedName}|${gate}` : "";

    const existingIndex =
      (idKey ? indexById.get(idKey) : undefined) ??
      (nameGateKey ? indexByNameGate.get(nameGateKey) : undefined);

    if (existingIndex === undefined) {
      const nextIndex = deduped.push(horse) - 1;
      if (idKey) indexById.set(idKey, nextIndex);
      if (nameGateKey) indexByNameGate.set(nameGateKey, nextIndex);
      continue;
    }

    deduped[existingIndex] = choosePreferredHorse(deduped[existingIndex], horse);
  }

  return deduped;
}

export function findHorseDuplicates(horses: Horse[]): Array<{ type: "id" | "nameGate"; key: string; count: number }> {
  const byId = new Map<string, number>();
  const byNameGate = new Map<string, number>();

  for (const horse of horses) {
    const idKey = String(horse.id ?? "").trim();
    const normalizedName = normalizeHorseName(horse.name);
    const gate = Number(horse.gateNumber ?? 0);
    const nameGateKey = normalizedName && gate > 0 ? `${normalizedName}|${gate}` : "";

    if (idKey) byId.set(idKey, (byId.get(idKey) ?? 0) + 1);
    if (nameGateKey) byNameGate.set(nameGateKey, (byNameGate.get(nameGateKey) ?? 0) + 1);
  }

  return [
    ...[...byId.entries()]
      .filter(([, count]) => count > 1)
      .map(([key, count]) => ({ type: "id" as const, key, count })),
    ...[...byNameGate.entries()]
      .filter(([, count]) => count > 1)
      .map(([key, count]) => ({ type: "nameGate" as const, key, count })),
  ];
}
