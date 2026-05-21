type HorseNameLike = {
  name?: string | null;
};

export function normalizeHorseEntryKey(name: string | null | undefined): string {
  return String(name ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\u3000/g, "")
    .replace(/\s+/g, "")
    .replace(/[\u30fb\uff65\-_.]/g, "");
}

function uniqueEntryKeys(entryKeys: Iterable<string | null | undefined>): string[] {
  return [...new Set([...entryKeys].map((key) => String(key ?? "").trim()).filter(Boolean))];
}

export function countOfficialEntryRosterMatches(
  horses: HorseNameLike[],
  officialEntryKeys: Iterable<string | null | undefined>
): number {
  const officialKeys = new Set(uniqueEntryKeys(officialEntryKeys));
  if (officialKeys.size === 0) return 0;

  return horses.reduce((count, horse) => {
    const horseKey = normalizeHorseEntryKey(horse.name);
    return horseKey && officialKeys.has(horseKey) ? count + 1 : count;
  }, 0);
}

export function shouldApplyOfficialEntryRoster(
  horses: HorseNameLike[],
  officialEntryKeys: Iterable<string | null | undefined>,
  sourceOverlap?: number | null
): boolean {
  const keys = uniqueEntryKeys(officialEntryKeys);
  if (horses.length === 0 || keys.length === 0) return false;

  const matchCount = countOfficialEntryRosterMatches(horses, keys);
  const comparableSize = Math.min(horses.length, keys.length);
  const minimumMatches = Math.max(1, Math.ceil(comparableSize * 0.75));
  const overlap = Number(sourceOverlap ?? matchCount);

  return matchCount >= minimumMatches && (!Number.isFinite(overlap) || overlap >= minimumMatches);
}

export function filterToOfficialEntryRoster<T extends HorseNameLike>(
  horses: T[],
  officialEntryKeys: Iterable<string | null | undefined>,
  sourceOverlap?: number | null
): T[] {
  const keys = uniqueEntryKeys(officialEntryKeys);
  if (!shouldApplyOfficialEntryRoster(horses, keys, sourceOverlap)) return horses;

  const officialKeys = new Set(keys);
  return horses.filter((horse) => officialKeys.has(normalizeHorseEntryKey(horse.name)));
}
