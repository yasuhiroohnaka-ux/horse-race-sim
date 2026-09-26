import fs from "node:fs/promises";
import path from "node:path";
import { loadReviewRecords } from "@/lib/reviewRecords";
import { TANPUKU_SCORING_VERSION } from "@/lib/tanpukuSelection.mjs";
import { VERDICT_LABELS } from "@/lib/verdictLabels.mjs";
import type { RaceReviewRecord } from "@/lib/types";

const ANALYSIS_PATH = path.join(process.cwd(), "data", "analysis", "backtest-selection.json");
const WEEKLY_PATH = path.join(process.cwd(), "data", "weekly-races.json");

export type VerdictKey = "win" | "place" | "skip";
type Metrics = { n: number; hitRate: number | null; roi: number | null; roiCi95: [number, number] | null };
type PairedRow = { classification: VerdictKey; honmeiHit: boolean; honmeiPayout: number; favoriteHit: boolean; favoritePayout: number };
type BacktestRow = { classification: string; tanHit: boolean; tanPayout: number };
type ArchiveRace = {
  raceId: string;
  horses?: Array<{ id: string }>;
  result?: { finishers?: Array<{ horseId: string; horseNumber: number }>; payouts?: { tansho?: { resultNumbers?: number[]; payouts?: number[] } } };
};
export type VerdictLine = { key: VerdictKey; label: string; blurb: string; share: number; honmei: Metrics; favorite: Metrics };
export type EngineScorecard = {
  version: string;
  lastSettledAt: string | null;
  pairedRaces: number;
  baselineUnavailableCount: number;
  verdicts: VerdictLine[];
  overall: { honmei: Metrics; favorite: Metrics };
  backtest: { generatedAt: string | null; overall: Metrics; verdicts: Array<{ key: VerdictKey; label: string; metrics: Metrics }> } | null;
};

const COPY: Record<VerdictKey, { label: string; blurb: string }> = {
  win: { label: VERDICT_LABELS.win, blurb: "単勝勝負として判定したレース" },
  place: { label: VERDICT_LABELS.place, blurb: "本命の単勝成績は参考値（単勝推奨なし）" },
  skip: { label: VERDICT_LABELS.skip, blurb: "本命の単勝成績は参考値（購入対象外）" },
};

function officialTan(race: ArchiveRace, horseId: string): { hit: boolean; payout: number } | null {
  const numbers = race.result?.payouts?.tansho?.resultNumbers;
  const payouts = race.result?.payouts?.tansho?.payouts;
  const finisher = race.result?.finishers?.find((entry) => String(entry.horseId) === String(horseId));
  if (!numbers?.length || !payouts || payouts.length < numbers.length || !finisher) return null;
  const index = numbers.findIndex((number) => Number(number) === Number(finisher.horseNumber));
  if (index < 0) return { hit: false, payout: 0 };
  const payout = Number(payouts[index]);
  return payout > 0 ? { hit: true, payout } : null;
}

function favoriteId(record: RaceReviewRecord, race: ArchiveRace): string | null {
  if (!race.horses?.length || !record.snapshot?.rankedRows?.length) return null;
  const odds = new Map<string, number>();
  for (const row of record.snapshot.rankedRows) {
    const id = String(row.horseId);
    const value = Number(row.realOdds);
    if (!id || !(value > 0) || odds.has(id)) return null;
    odds.set(id, value);
  }
  const ids = race.horses.map((horse) => String(horse.id));
  if (new Set(ids).size !== ids.length || ids.some((id) => !odds.has(id))) return null;
  return ids.sort((a, b) => odds.get(a)! - odds.get(b)! || a.localeCompare(b))[0] ?? null;
}

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function summarize<T>(rows: T[], hit: (row: T) => boolean, payout: (row: T) => number, seed: number): Metrics {
  const n = rows.length;
  if (n === 0) return { n: 0, hitRate: null, roi: null, roiCi95: null };
  const payouts = rows.map(payout);
  const hitRate = rows.filter(hit).length / n * 100;
  const roi = payouts.reduce((sum, value) => sum + value, 0) / n;
  const nextRandom = random(seed);
  const samples = Array.from({ length: 4000 }, () => {
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += payouts[Math.floor(nextRandom() * n)];
    return sum / n;
  }).sort((a, b) => a - b);
  return { n, hitRate, roi, roiCi95: [samples[99], samples[3899]] };
}

export function buildEngineScorecard(records: RaceReviewRecord[], archiveRaces: ArchiveRace[], backtestRows: BacktestRow[], backtestGeneratedAt: string | null): EngineScorecard {
  const byId = new Map(archiveRaces.map((race) => [String(race.raceId), race]));
  const eligible = records.filter((record) =>
    !record.excludedReason && record.status === "review_ready" &&
    record.snapshotSourceStatus === "live_pre_race" && record.livePreRaceEligible === true &&
    record.snapshot?.sourceStatus === "live_pre_race" && record.snapshot.livePreRaceEligible === true &&
    record.snapshot.predictionOrigin === "saved_live" && record.snapshot.scoringVersion === TANPUKU_SCORING_VERSION &&
    record.snapshot.dataQuality?.fieldComplete !== false && record.honmei?.settlementStatus === "settled" &&
    ["win", "place", "skip"].includes(record.honmei.classificationHint?.classification ?? "")
  );
  const paired: PairedRow[] = [];
  const settledDates: string[] = [];
  for (const record of eligible) {
    const race = byId.get(String(record.raceId));
    if (!race || !record.honmei) continue;
    const favoriteHorseId = favoriteId(record, race);
    if (!favoriteHorseId) continue;
    const honmei = officialTan(race, record.honmei.horseId);
    const favorite = officialTan(race, favoriteHorseId);
    if (!honmei || !favorite) continue;
    paired.push({
      classification: record.honmei.classificationHint!.classification as VerdictKey,
      honmeiHit: honmei.hit, honmeiPayout: honmei.payout,
      favoriteHit: favorite.hit, favoritePayout: favorite.payout,
    });
    if (record.payoutFetchedAt) settledDates.push(record.payoutFetchedAt);
  }
  const overall = {
    honmei: summarize(paired, (row) => row.honmeiHit, (row) => row.honmeiPayout, 31),
    favorite: summarize(paired, (row) => row.favoriteHit, (row) => row.favoritePayout, 32),
  };
  const verdicts = (["win", "place", "skip"] as const).map((key, index) => {
    const subset = paired.filter((row) => row.classification === key);
    return {
      key, label: COPY[key].label, blurb: COPY[key].blurb,
      share: paired.length ? subset.length / paired.length * 100 : 0,
      honmei: summarize(subset, (row) => row.honmeiHit, (row) => row.honmeiPayout, 100 + index),
      favorite: summarize(subset, (row) => row.favoriteHit, (row) => row.favoritePayout, 200 + index),
    };
  });
  const reference = backtestRows.length ? {
    generatedAt: backtestGeneratedAt,
    overall: summarize(backtestRows, (row) => row.tanHit, (row) => row.tanPayout, 300),
    verdicts: (["win", "place", "skip"] as const).map((key, index) => ({
      key, label: COPY[key].label,
      metrics: summarize(backtestRows.filter((row) => row.classification === key), (row) => row.tanHit, (row) => row.tanPayout, 400 + index),
    })),
  } : null;
  return {
    version: TANPUKU_SCORING_VERSION,
    lastSettledAt: settledDates.sort().at(-1) ?? null,
    pairedRaces: paired.length,
    baselineUnavailableCount: eligible.length - paired.length,
    verdicts, overall, backtest: reference,
  };
}

export async function readEngineScorecard(): Promise<EngineScorecard | null> {
  try {
    const [records, weeklyRaw, backtestRaw] = await Promise.all([
      loadReviewRecords(), fs.readFile(WEEKLY_PATH, "utf8"), fs.readFile(ANALYSIS_PATH, "utf8").catch(() => null),
    ]);
    const weekly = JSON.parse(weeklyRaw) as { currentWeek?: { races?: ArchiveRace[] }; archives?: Array<{ races?: ArchiveRace[] }> };
    const backtest = backtestRaw ? JSON.parse(backtestRaw) as { generatedAt?: string; rows?: BacktestRow[] } : null;
    return buildEngineScorecard(
      Object.values(records),
      [...(weekly.currentWeek?.races ?? []), ...(weekly.archives ?? []).flatMap((archive) => archive.races ?? [])],
      backtest?.rows ?? [], backtest?.generatedAt ?? null,
    );
  } catch {
    return null;
  }
}
