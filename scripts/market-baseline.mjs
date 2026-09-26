/**
 * Choose the shortest odds captured before the race. Missing runner odds make the baseline unknown.
 * @param {Array<{horseId: string | number, realOdds: number}>} rows
 * @param {Array<string | number> | null} expectedHorseIds
 */
export function pickPreRaceFavorite(rows, expectedHorseIds = null) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const oddsByHorseId = new Map();
  for (const row of rows) {
    const horseId = String(row?.horseId ?? "").trim();
    const odds = Number(row?.realOdds);
    if (!horseId || !(odds > 0) || oddsByHorseId.has(horseId)) return null;
    oddsByHorseId.set(horseId, odds);
  }
  const horseIds = expectedHorseIds ? [...expectedHorseIds].map(String) : [...oddsByHorseId.keys()];
  if (horseIds.length === 0 || new Set(horseIds).size !== horseIds.length) return null;
  if (horseIds.some((horseId) => !oddsByHorseId.has(horseId))) return null;
  return horseIds
    .map((horseId) => ({ horseId, odds: oddsByHorseId.get(horseId) }))
    .sort((a, b) => a.odds - b.odds || a.horseId.localeCompare(b.horseId))[0];
}

/** Settle against the official win payout table, including dead heats. */
export function settleOfficialTan(result, horseId) {
  const numbers = result?.payouts?.tansho?.resultNumbers;
  const payouts = result?.payouts?.tansho?.payouts;
  if (!Array.isArray(numbers) || numbers.length === 0 || !Array.isArray(payouts) || payouts.length < numbers.length) return null;
  const finisher = (result.finishers ?? []).find((entry) => String(entry.horseId ?? "") === String(horseId));
  if (!finisher || !(Number(finisher.horseNumber) > 0)) return null;
  const index = numbers.findIndex((number) => Number(number) === Number(finisher.horseNumber));
  if (index < 0) return { hit: false, payout: 0 };
  const payout = Number(payouts[index]);
  return payout > 0 ? { hit: true, payout } : null;
}

export function summarizeFavoriteComparison(rows) {
  const n = rows.length;
  if (n === 0) {
    return { n: 0, honmeiHitRate: null, honmeiRoi: null, favoriteHitRate: null, favoriteRoi: null, hitRateDelta: null, roiDelta: null };
  }
  const honmeiHitRate = 100 * rows.filter((row) => row.honmeiHit).length / n;
  const honmeiRoi = rows.reduce((sum, row) => sum + Number(row.honmeiPayout), 0) / n;
  const favoriteHitRate = 100 * rows.filter((row) => row.favoriteHit).length / n;
  const favoriteRoi = rows.reduce((sum, row) => sum + Number(row.favoritePayout), 0) / n;
  return {
    n,
    honmeiHitRate,
    honmeiRoi,
    favoriteHitRate,
    favoriteRoi,
    hitRateDelta: honmeiHitRate - favoriteHitRate,
    roiDelta: honmeiRoi - favoriteRoi,
  };
}
