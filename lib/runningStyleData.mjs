const VALID_STYLES = new Set(['Nige', 'Senko', 'Sashi', 'Oikomi']);

function normalizeOverrideEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const runningStyle = String(entry.runningStyle ?? '').trim();
  const source = String(entry.source ?? '').trim();
  const updatedAt = String(entry.updatedAt ?? '').trim();
  if (!VALID_STYLES.has(runningStyle)) return null;
  return { runningStyle, source: source || 'saved_manual_override', updatedAt: updatedAt || null };
}

export function normalizeOverrideStore(parsed) {
  if (!parsed || typeof parsed !== 'object') return {};
  const normalized = {};
  for (const [courseId, horseMap] of Object.entries(parsed)) {
    if (!horseMap || typeof horseMap !== 'object') continue;
    const normalizedHorseMap = {};
    for (const [horseId, entry] of Object.entries(horseMap)) {
      const normalizedEntry = normalizeOverrideEntry(entry);
      if (!normalizedEntry) continue;
      normalizedHorseMap[String(horseId)] = normalizedEntry;
    }
    if (Object.keys(normalizedHorseMap).length > 0) normalized[String(courseId)] = normalizedHorseMap;
  }
  return normalized;
}

export function buildRunningStylesResponse(race, overrides, cookieOverrides) {
  return Object.fromEntries((race.horses ?? []).map(horse => {
    const horseId = String(horse?.id ?? '').trim();
    const overrideStyle = String(overrides[horseId]?.runningStyle ?? '').trim();
    const cookieStyle = String(cookieOverrides[horseId] ?? '').trim();
    const runningStyle = overrideStyle || cookieStyle || String(horse?.runningStyle ?? '').trim();
    if (!horseId || !VALID_STYLES.has(runningStyle)) return null;
    return [horseId, runningStyle];
  }).filter(entry => entry !== null));
}
