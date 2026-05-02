"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Filter, RotateCcw, X } from "lucide-react";
import {
  GENERATED_ARCHIVED_RACES,
  GENERATED_COMPLETED_RACES,
  type GeneratedRaceResult,
  type GeneratedReviewRace,
} from "@/lib/generatedRaceSchedule";
import type {
  ExpectationGrade,
  PredictionOrigin,
  PredictionSnapshot,
  RaceReviewRecord,
  ReviewSelectionHorse,
} from "@/lib/types";

type SnapshotLookupResponse = {
  ok: boolean;
  snapshotsByRaceId: Record<string, PredictionSnapshot>;
};

type PerformanceLookupResponse = {
  reviewRecordsByRaceId: Record<string, RaceReviewRecord>;
  settlementsByRaceId: Record<string, unknown>;
  settlementsByCourseId: Record<string, unknown>;
  summary: unknown;
  categoryReturnStats?: CategoryReturnStat[];
};

type ArchiveSourceRace = Partial<GeneratedReviewRace> & {
  raceId: string;
  courseId: string;
  label: string;
  date: string;
  weekOf?: string | null;
  result?: GeneratedRaceResult;
};

type DataQualityFlag =
  | "backfill"
  | "saved_manual"
  | "odds missing"
  | "classification missing"
  | "snapshot after race"
  | "payout fallback";

type ArchiveRow = {
  key: string;
  raceId: string;
  courseId: string;
  date: string;
  venue: string;
  raceNumber: number | null;
  raceName: string;
  honmei: ReviewSelectionHorse | null;
  honmeiDisplay: string;
  expectationGrade: ExpectationGrade | null;
  simLeaderHorseId: string | null;
  simLeaderDisplay: string;
  betGrade: ExpectationGrade | null;
  agreement: boolean | null;
  disagreementReason: string | null;
  resultText: string;
  tanOutcome: string;
  fukuOutcome: string;
  tanPayout: number;
  fukuPayout: number;
  scoreGap: number | null;
  realOdds: number | null;
  snapshotTakenAt: string | null;
  snapshotOrigin: PredictionOrigin | null;
  dataQualityFlags: DataQualityFlag[];
  record: RaceReviewRecord | null;
  snapshot: PredictionSnapshot | null;
  sourceRace: ArchiveSourceRace;
};

type RaceBandFilter = "all" | "9-10" | "11" | "12";
type HitFilter = "all" | "tan" | "fuku" | "miss";
type AgreementFilter = "all" | "match" | "mismatch";
type OriginFilter = "all" | PredictionOrigin;

type Filters = {
  from: string;
  to: string;
  venue: string;
  raceBand: RaceBandFilter;
  expectation: "all" | ExpectationGrade;
  hit: HitFilter;
  origin: OriginFilter;
  agreement: AgreementFilter;
  query: string;
};

type CalendarDay = {
  date: string;
  raceCount: number;
  fukuHitCount: number;
  fukuRate: number;
  roi: number;
  gradeCounts: Record<ExpectationGrade, number>;
};

type ReturnSummary = {
  raceCount: number;
  tanHitCount: number;
  fukuHitCount: number;
  tanPayout: number;
  fukuPayout: number;
  tanRate: number;
  fukuRate: number;
  tanRoi: number;
  fukuRoi: number;
};

type ReturnSummarySource = {
  tanOutcome?: string | null;
  fukuOutcome?: string | null;
  tanPayout?: number | null;
  fukuPayout?: number | null;
};

type CategoryReturnStat = {
  key: string;
  label: string;
  raceCount: number;
  tanHitCount: number;
  fukuHitCount: number;
  tanPayout: number;
  fukuPayout: number;
  tanReturnRate: number;
  fukuReturnRate: number;
  combinedReturnRate: number;
};

const EMPTY_FILTERS: Filters = {
  from: "",
  to: "",
  venue: "all",
  raceBand: "all",
  expectation: "all",
  hit: "all",
  origin: "all",
  agreement: "all",
  query: "",
};

const GRADES: ExpectationGrade[] = ["S", "A", "B", "C"];
const ORIGINS: PredictionOrigin[] = ["saved_live", "saved_manual", "backfill"];
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function getRaceKey(race: { raceId?: string | null; courseId?: string | null }) {
  const raceId = String(race.raceId ?? "").trim();
  if (raceId) return { raceId, courseId: String(race.courseId ?? "") };
  const courseId = String(race.courseId ?? "");
  const match = courseId.match(/(\d{12})$/);
  return { raceId: match?.[1] ?? "", courseId };
}

function formatTimestamp(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function parseDateParts(value?: string | null) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (![y, m, d].every(Number.isFinite)) return null;
  return { year: y, month: m, day: d };
}

function formatDateParts(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getLocalDateDow(value?: string | null) {
  const parts = parseDateParts(value);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day).getDay();
}

function inferJraWeekendDowFromRaceId(raceId?: string | null) {
  const normalized = String(raceId ?? "");
  const match = normalized.match(/^\d{4}\d{2}\d{2}(\d{2})\d{2}$/);
  if (!match) return null;
  const raceDayNumber = Number(match[1]);
  if (!Number.isFinite(raceDayNumber)) return null;
  return raceDayNumber % 2 === 1 ? 6 : 0;
}

function deriveRaceDateFromWeekOf(weekOf?: string | null, targetDow?: number | null) {
  const parts = parseDateParts(weekOf);
  if (!parts || targetDow === null || targetDow === undefined) return null;
  const base = new Date(parts.year, parts.month - 1, parts.day);
  const baseDow = base.getDay();
  let offset = (targetDow - baseDow + 7) % 7;
  if (offset === 0 && targetDow === 0) offset = 7;
  return formatDateParts(new Date(parts.year, parts.month - 1, parts.day + offset));
}

function resolveCalendarRaceDate(params: {
  raceId?: string | null;
  raceDate?: string | null;
  snapshotRaceDate?: string | null;
  fallbackDate?: string | null;
  weekOf?: string | null;
}) {
  const explicitRaceDate = params.raceDate ?? params.snapshotRaceDate ?? params.fallbackDate ?? "";
  const inferredDow = inferJraWeekendDowFromRaceId(params.raceId);
  const explicitDow = getLocalDateDow(explicitRaceDate);

  if (explicitRaceDate && inferredDow !== null && explicitDow !== null && explicitDow !== inferredDow) {
    return deriveRaceDateFromWeekOf(params.weekOf, inferredDow) ?? explicitRaceDate;
  }

  return explicitRaceDate;
}

function formatPayout(value: number) {
  return value > 0 ? `${Math.round(value).toLocaleString("ja-JP")}円` : "-";
}

function formatRate(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatCount(value: number) {
  return value.toLocaleString("ja-JP");
}

function formatOdds(value: number | null) {
  return value && value > 0 ? value.toFixed(1) : "-";
}

function formatScoreGap(value: number | null) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(3) : "-";
}

function formatOutcome(value: string) {
  if (value === "hit") return "的中";
  if (value === "miss") return "外れ";
  if (value === "hit_missing_payout") return "的中・払戻未確定";
  return "未確定";
}

function gradeTone(grade: ExpectationGrade | null) {
  if (grade === "S") return "bg-rose-100 text-rose-700 border-rose-200";
  if (grade === "A") return "bg-amber-100 text-amber-800 border-amber-200";
  if (grade === "B") return "bg-sky-100 text-sky-800 border-sky-200";
  if (grade === "C") return "bg-slate-100 text-slate-700 border-slate-200";
  return "bg-slate-50 text-slate-400 border-slate-200";
}

function qualityTone(flag: DataQualityFlag) {
  if (flag === "backfill") return "bg-purple-100 text-purple-700";
  if (flag === "saved_manual") return "bg-cyan-100 text-cyan-800";
  if (flag === "snapshot after race") return "bg-rose-100 text-rose-700";
  if (flag === "payout fallback") return "bg-orange-100 text-orange-800";
  return "bg-slate-100 text-slate-700";
}

function displayHorse(horseId?: string | null, horseName?: string | null) {
  if (!horseId && !horseName) return "-";
  if (!horseId) return horseName ?? "-";
  return horseName ? `${horseName} (${horseId})` : horseId;
}

function findSnapshotRow(snapshot: PredictionSnapshot | null, horseId?: string | null) {
  if (!snapshot || !horseId) return null;
  return snapshot.rankedRows.find((row) => String(row.horseId) === String(horseId)) ?? null;
}

function getTopSnapshotRow(snapshot: PredictionSnapshot | null) {
  if (!snapshot) return null;
  return [...snapshot.rankedRows].sort((a, b) => a.rank - b.rank)[0] ?? null;
}

function getRaceDate(record: RaceReviewRecord | null, race: ArchiveSourceRace, snapshot: PredictionSnapshot | null) {
  return resolveCalendarRaceDate({
    raceId: record?.raceId ?? snapshot?.raceId ?? race.raceId,
    raceDate: record?.meta.raceDate,
    snapshotRaceDate: snapshot?.raceDate,
    fallbackDate: race.raceDate ?? race.date,
    weekOf: record?.meta.weekOf ?? race.weekOf,
  });
}

function getRaceNumber(record: RaceReviewRecord | null, race: ArchiveSourceRace, snapshot: PredictionSnapshot | null) {
  return record?.meta.raceNumber ?? snapshot?.raceNumber ?? race.raceNumber ?? null;
}

function getVenue(record: RaceReviewRecord | null, race: ArchiveSourceRace, snapshot: PredictionSnapshot | null) {
  return record?.meta.venue ?? snapshot?.venue ?? race.venue ?? "-";
}

function getRaceName(record: RaceReviewRecord | null, race: ArchiveSourceRace, snapshot: PredictionSnapshot | null) {
  return record?.meta.raceName ?? snapshot?.raceName ?? race.label ?? "-";
}

function getResultText(record: RaceReviewRecord | null, race: ArchiveSourceRace) {
  if (race.result?.top3HorseNames?.length) {
    return race.result.top3HorseNames.map((name, index) => `${index + 1}着 ${name}`).join(" / ");
  }
  if (record?.actualTop3HorseIds.length) {
    return record.actualTop3HorseIds.map((id, index) => `${index + 1}着 ${id}`).join(" / ");
  }
  return "-";
}

function isSnapshotAfterRace(snapshotTakenAt: string | null, raceDate: string, scheduledStartTime?: string | null) {
  if (!snapshotTakenAt || !raceDate) return false;
  const snapshotTime = Date.parse(snapshotTakenAt);
  if (!Number.isFinite(snapshotTime)) return false;

  if (scheduledStartTime && /^\d{1,2}:\d{2}$/.test(scheduledStartTime)) {
    const raceTime = Date.parse(`${raceDate}T${scheduledStartTime}:00+09:00`);
    return Number.isFinite(raceTime) ? snapshotTime > raceTime : false;
  }

  const snapshotDate = new Date(snapshotTime).toISOString().slice(0, 10);
  return snapshotDate > raceDate;
}

function getQualityFlags(params: {
  record: RaceReviewRecord | null;
  snapshot: PredictionSnapshot | null;
  rowRealOdds: number | null;
  raceDate: string;
}): DataQualityFlag[] {
  const { record, snapshot, rowRealOdds, raceDate } = params;
  const flags: DataQualityFlag[] = [];
  if (snapshot?.predictionOrigin === "backfill") flags.push("backfill");
  if (snapshot?.predictionOrigin === "saved_manual") flags.push("saved_manual");
  if (!rowRealOdds || rowRealOdds <= 0) flags.push("odds missing");
  if (!record?.honmei?.classificationHint) flags.push("classification missing");
  if (isSnapshotAfterRace(record?.snapshotTakenAt ?? snapshot?.snapshotTakenAt ?? snapshot?.capturedAt ?? null, raceDate, record?.meta.scheduledStartTime)) {
    flags.push("snapshot after race");
  }
  if (
    record?.honmei?.tanOutcome === "hit_missing_payout" ||
    record?.honmei?.fukuOutcome === "hit_missing_payout" ||
    (record?.honmei?.tanOutcome === "hit" && record.honmei.tanPayoutSource !== "official") ||
    (record?.honmei?.fukuOutcome === "hit" && record.honmei.fukuPayoutSource !== "official")
  ) {
    flags.push("payout fallback");
  }
  return flags;
}

function recordToSourceRace(record: RaceReviewRecord): ArchiveSourceRace {
  const date = resolveCalendarRaceDate({
    raceId: record.raceId,
    raceDate: record.meta.raceDate,
    snapshotRaceDate: record.snapshot?.raceDate,
    fallbackDate: record.createdAt.slice(0, 10),
    weekOf: record.meta.weekOf,
  });
  return {
    raceId: record.raceId,
    courseId: record.courseId,
    label: record.meta.raceName ?? record.snapshot?.raceName ?? record.raceId,
    date,
    raceDate: date,
    weekOf: record.meta.weekOf,
    raceNumber: record.meta.raceNumber ?? record.snapshot?.raceNumber ?? undefined,
    venue: record.meta.venue ?? record.snapshot?.venue ?? undefined,
    venueKey: record.meta.venueKey ?? record.snapshot?.venueKey ?? undefined,
    grade: "OTHER",
  };
}

function buildArchiveRow(params: {
  race: ArchiveSourceRace;
  record: RaceReviewRecord | null;
  snapshot: PredictionSnapshot | null;
}): ArchiveRow {
  const { race, record, snapshot } = params;
  const { raceId, courseId } = getRaceKey(race);
  const expectation = record?.expectation ?? snapshot?.expectation ?? null;
  const honmei = record?.honmei ?? null;
  const simTopRow = getTopSnapshotRow(snapshot);
  const simLeaderHorseId = expectation?.simulationLeader.horseId ?? simTopRow?.horseId ?? null;
  const simLeaderRow = findSnapshotRow(snapshot, simLeaderHorseId) ?? simTopRow;
  const honmeiHorseId = honmei?.horseId ?? expectation?.tanpukuHonmei.horseId ?? snapshot?.honmeiHorseId ?? null;
  const honmeiRow = findSnapshotRow(snapshot, honmeiHorseId);
  const agreement =
    typeof expectation?.agreement.sameHorse === "boolean"
      ? expectation.agreement.sameHorse
      : simLeaderHorseId && honmeiHorseId
        ? String(simLeaderHorseId) === String(honmeiHorseId)
        : null;
  const realOdds = Number(honmei?.realOdds ?? honmeiRow?.realOdds ?? 0) || null;
  const date = getRaceDate(record, race, snapshot);

  return {
    key: raceId || courseId,
    raceId,
    courseId,
    date,
    venue: getVenue(record, race, snapshot),
    raceNumber: getRaceNumber(record, race, snapshot),
    raceName: getRaceName(record, race, snapshot),
    honmei,
    honmeiDisplay: displayHorse(honmeiHorseId, honmei?.horseName ?? honmeiRow?.horseName),
    expectationGrade: expectation?.tanpukuHonmei.grade ?? null,
    simLeaderHorseId,
    simLeaderDisplay: displayHorse(simLeaderHorseId, simLeaderRow?.horseName),
    betGrade: expectation?.simulationLeader.grade ?? null,
    agreement,
    disagreementReason: agreement === false ? expectation?.agreement.summary ?? honmei?.selectionReason ?? null : null,
    resultText: getResultText(record, race),
    tanOutcome: honmei?.tanOutcome ?? "not_settled",
    fukuOutcome: honmei?.fukuOutcome ?? "not_settled",
    tanPayout: Number(honmei?.tanPayout ?? 0),
    fukuPayout: Number(honmei?.fukuPayout ?? 0),
    scoreGap: Number.isFinite(Number(honmei?.scoreGap ?? record?.pair.scoreGap ?? snapshot?.pairScoreGap))
      ? Number(honmei?.scoreGap ?? record?.pair.scoreGap ?? snapshot?.pairScoreGap)
      : null,
    realOdds,
    snapshotTakenAt: record?.snapshotTakenAt ?? snapshot?.snapshotTakenAt ?? snapshot?.capturedAt ?? null,
    snapshotOrigin: snapshot?.predictionOrigin ?? null,
    dataQualityFlags: getQualityFlags({ record, snapshot, rowRealOdds: realOdds, raceDate: date }),
    record,
    snapshot,
    sourceRace: race,
  };
}

function matchesFilters(row: ArchiveRow, filters: Filters, options?: { ignoreDate?: boolean }) {
  if (!options?.ignoreDate) {
    if (filters.from && row.date < filters.from) return false;
    if (filters.to && row.date > filters.to) return false;
  }
  if (filters.venue !== "all" && row.venue !== filters.venue) return false;
  if (filters.raceBand === "9-10" && row.raceNumber !== 9 && row.raceNumber !== 10) return false;
  if (filters.raceBand === "11" && row.raceNumber !== 11) return false;
  if (filters.raceBand === "12" && row.raceNumber !== 12) return false;
  if (filters.expectation !== "all" && row.expectationGrade !== filters.expectation) return false;
  if (filters.hit === "tan" && row.tanOutcome !== "hit") return false;
  if (filters.hit === "fuku" && row.fukuOutcome !== "hit") return false;
  if (filters.hit === "miss" && (row.tanOutcome === "hit" || row.fukuOutcome === "hit" || row.fukuOutcome === "not_settled")) return false;
  if (filters.origin !== "all" && row.snapshotOrigin !== filters.origin) return false;
  if (filters.agreement === "match" && row.agreement !== true) return false;
  if (filters.agreement === "mismatch" && row.agreement !== false) return false;
  const query = filters.query.trim().toLowerCase();
  if (query) {
    const target = [row.date, row.venue, row.raceName, row.honmeiDisplay, row.simLeaderDisplay, row.raceId].join(" ").toLowerCase();
    if (!target.includes(query)) return false;
  }
  return true;
}

function isSettledOutcome(value: string) {
  return value !== "not_settled";
}

function isHitOutcome(value: string) {
  return value === "hit" || value === "hit_missing_payout";
}

function buildReturnSummary(
  rows: ArchiveRow[],
  getSource: (row: ArchiveRow) => ReturnSummarySource | null = (row) => row
): ReturnSummary {
  const summary = {
    raceCount: 0,
    tanHitCount: 0,
    fukuHitCount: 0,
    tanPayout: 0,
    fukuPayout: 0,
  };

  for (const row of rows) {
    const source = getSource(row);
    if (!source) continue;
    const tanOutcome = source.tanOutcome ?? "not_settled";
    const fukuOutcome = source.fukuOutcome ?? "not_settled";
    if (!isSettledOutcome(tanOutcome) && !isSettledOutcome(fukuOutcome)) continue;
    summary.raceCount += 1;
    if (isHitOutcome(tanOutcome)) summary.tanHitCount += 1;
    if (isHitOutcome(fukuOutcome)) summary.fukuHitCount += 1;
    summary.tanPayout += Number(source.tanPayout ?? 0);
    summary.fukuPayout += Number(source.fukuPayout ?? 0);
  }

  return {
    ...summary,
    tanRate: summary.raceCount > 0 ? (summary.tanHitCount / summary.raceCount) * 100 : 0,
    fukuRate: summary.raceCount > 0 ? (summary.fukuHitCount / summary.raceCount) * 100 : 0,
    tanRoi: summary.raceCount > 0 ? (summary.tanPayout / (summary.raceCount * 100)) * 100 : 0,
    fukuRoi: summary.raceCount > 0 ? (summary.fukuPayout / (summary.raceCount * 100)) * 100 : 0,
  };
}

function getStoredSelectionForHorse(row: ArchiveRow, horseId?: string | null): ReviewSelectionHorse | null {
  if (!horseId) return null;
  const target = String(horseId);
  const selections = [row.record?.honmei, row.record?.opponent, row.record?.wide];
  return selections.find((selection) => selection && String(selection.horseId) === target) ?? null;
}

function buildCalendarDays(rows: ArchiveRow[]): CalendarDay[] {
  const grouped = new Map<string, ArchiveRow[]>();
  for (const row of rows) {
    if (!row.date) continue;
    grouped.set(row.date, [...(grouped.get(row.date) ?? []), row]);
  }

  return Array.from(grouped.entries())
    .map(([date, dayRows]) => {
      const gradeCounts = { S: 0, A: 0, B: 0, C: 0 };
      let fukuHitCount = 0;
      let fukuPayout = 0;
      for (const row of dayRows) {
        if (row.expectationGrade) gradeCounts[row.expectationGrade] += 1;
        if (row.fukuOutcome === "hit") fukuHitCount += 1;
        fukuPayout += row.fukuPayout;
      }
      const raceCount = dayRows.length;
      return {
        date,
        raceCount,
        fukuHitCount,
        fukuRate: raceCount > 0 ? (fukuHitCount / raceCount) * 100 : 0,
        roi: raceCount > 0 ? (fukuPayout / (raceCount * 100)) * 100 : 0,
        gradeCounts,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function groupCalendarByMonth(days: CalendarDay[]) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const months = Array.from(new Set(days.map((day) => day.date.slice(0, 7)))).sort();
  return months.map((month) => {
    const [year, monthNumber] = month.split("-").map((value) => Number.parseInt(value, 10));
    const first = new Date(year, monthNumber - 1, 1);
    const last = new Date(year, monthNumber, 0);
    const cells: Array<CalendarDay | null> = [];
    for (let i = 0; i < first.getDay(); i += 1) cells.push(null);
    for (let day = 1; day <= last.getDate(); day += 1) {
      const date = `${month}-${String(day).padStart(2, "0")}`;
      cells.push(byDate.get(date) ?? null);
    }
    return { month, cells };
  });
}

function GradeBadge({ grade }: { grade: ExpectationGrade | null }) {
  return <span className={`inline-flex min-w-7 justify-center rounded-md border px-2 py-0.5 text-xs font-bold ${gradeTone(grade)}`}>{grade ?? "-"}</span>;
}

function SegmentButton<T extends string>({
  active,
  value,
  label,
  onClick,
}: {
  active: boolean;
  value: T;
  label: string;
  onClick: (value: T) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`h-9 rounded-md border px-3 text-sm font-semibold transition ${
        active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
      }`}
    >
      {label}
    </button>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 py-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

function ReturnSummaryCard({
  title,
  summary,
  note,
}: {
  title: string;
  summary: ReturnSummary;
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900">{title}</p>
          <p className="mt-1 text-xs text-slate-500">{formatCount(summary.raceCount)}R / 単複各100円</p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>単 {summary.tanHitCount}/{summary.raceCount}</p>
          <p>複 {summary.fukuHitCount}/{summary.raceCount}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-md bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-500">単勝回収率</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatRate(summary.tanRoi)}</p>
          <p className="mt-1 text-xs text-slate-500">的中率 {formatRate(summary.tanRate)}</p>
        </div>
        <div className="rounded-md bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-500">複勝回収率</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatRate(summary.fukuRoi)}</p>
          <p className="mt-1 text-xs text-slate-500">的中率 {formatRate(summary.fukuRate)}</p>
        </div>
      </div>
      {note ? <p className="mt-3 text-xs leading-5 text-slate-500">{note}</p> : null}
    </div>
  );
}

function CategoryReturnStatsTable({ stats }: { stats: CategoryReturnStat[] }) {
  return (
    <section className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-bold text-slate-900">カテゴリ別 単複回収率</p>
        <p className="mt-1 text-xs text-slate-500">単勝100円・複勝100円、公式払戻で確定済みの本命推奨のみ集計</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-xs font-bold text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">区分</th>
              <th className="px-4 py-3 text-right">対象</th>
              <th className="px-4 py-3 text-right">単勝</th>
              <th className="px-4 py-3 text-right">複勝</th>
              <th className="px-4 py-3 text-right">単複合算</th>
              <th className="px-4 py-3 text-right">的中</th>
              <th className="px-4 py-3 text-right">払戻</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stats.map((stat) => (
              <tr key={stat.key}>
                <td className="px-4 py-3 font-semibold text-slate-900">{stat.label}</td>
                <td className="px-4 py-3 text-right text-slate-700">{formatCount(stat.raceCount)}R</td>
                <td className="px-4 py-3 text-right font-bold text-slate-900">{formatRate(stat.tanReturnRate)}</td>
                <td className="px-4 py-3 text-right font-bold text-slate-900">{formatRate(stat.fukuReturnRate)}</td>
                <td className="px-4 py-3 text-right text-slate-700">{formatRate(stat.combinedReturnRate)}</td>
                <td className="px-4 py-3 text-right text-slate-700">
                  単{stat.tanHitCount}/{stat.raceCount}・複{stat.fukuHitCount}/{stat.raceCount}
                </td>
                <td className="px-4 py-3 text-right text-slate-700">
                  単{formatPayout(stat.tanPayout)} / 複{formatPayout(stat.fukuPayout)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ArchivePage() {
  const [snapshotsByRaceId, setSnapshotsByRaceId] = useState<Record<string, PredictionSnapshot>>({});
  const [reviewRecordsByRaceId, setReviewRecordsByRaceId] = useState<Record<string, RaceReviewRecord>>({});
  const [categoryReturnStats, setCategoryReturnStats] = useState<CategoryReturnStat[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const generatedCards = useMemo<ArchiveSourceRace[]>(
    () => [
      ...GENERATED_COMPLETED_RACES.map((race) => ({ ...race, archived: false })),
      ...GENERATED_ARCHIVED_RACES.map((race) => ({ ...race, archived: true })),
    ],
    []
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      const [snapshotRes, performanceRes] = await Promise.all([
        fetch("/api/prediction-snapshots", { cache: "no-store" }),
        fetch("/api/performance", { cache: "no-store" }),
      ]);
      const snapshotJson = (await snapshotRes.json()) as SnapshotLookupResponse;
      const performanceJson = (await performanceRes.json()) as PerformanceLookupResponse;
      if (cancelled) return;
      setSnapshotsByRaceId(snapshotJson.snapshotsByRaceId ?? {});
      setReviewRecordsByRaceId(performanceJson.reviewRecordsByRaceId ?? {});
      setCategoryReturnStats(performanceJson.categoryReturnStats ?? []);
      setIsLoading(false);
    };

    void load().catch((error) => {
      console.warn("failed to load archive data", error);
      if (!cancelled) setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const generatedRaceIds = new Set(generatedCards.map((race) => getRaceKey(race).raceId).filter(Boolean));
    const recordOnlyRaces = Object.values(reviewRecordsByRaceId)
      .filter((record) => !generatedRaceIds.has(record.raceId))
      .map(recordToSourceRace);
    const sourceRaces = [...generatedCards, ...recordOnlyRaces];

    return sourceRaces
      .map((race) => {
        const { raceId, courseId } = getRaceKey(race);
        const record = reviewRecordsByRaceId[raceId] ?? null;
        const snapshot = (raceId ? snapshotsByRaceId[raceId] : null) ?? record?.snapshot ?? null;
        return buildArchiveRow({ race: { ...race, raceId, courseId }, record, snapshot });
      })
      .sort((a, b) => `${b.date}-${String(b.raceNumber ?? 0).padStart(2, "0")}`.localeCompare(`${a.date}-${String(a.raceNumber ?? 0).padStart(2, "0")}`));
  }, [generatedCards, reviewRecordsByRaceId, snapshotsByRaceId]);

  const venues = useMemo(() => Array.from(new Set(rows.map((row) => row.venue).filter(Boolean))).sort(), [rows]);
  const filteredRows = useMemo(() => rows.filter((row) => matchesFilters(row, filters)), [filters, rows]);
  const totalReturnSummary = useMemo(() => buildReturnSummary(rows), [rows]);
  const filteredReturnSummary = useMemo(() => buildReturnSummary(filteredRows), [filteredRows]);
  const filteredSimLeaderReturnSummary = useMemo(
    () => buildReturnSummary(filteredRows, (row) => getStoredSelectionForHorse(row, row.simLeaderHorseId)),
    [filteredRows]
  );
  const filteredAgreementReturnSummary = useMemo(
    () => buildReturnSummary(filteredRows, (row) => (row.agreement === true ? row.honmei : null)),
    [filteredRows]
  );
  const calendarRows = useMemo(() => rows.filter((row) => matchesFilters(row, filters, { ignoreDate: true })), [filters, rows]);
  const calendarMonths = useMemo(() => groupCalendarByMonth(buildCalendarDays(calendarRows)), [calendarRows]);
  const selectedRow = useMemo(() => filteredRows.find((row) => row.key === selectedKey) ?? rows.find((row) => row.key === selectedKey) ?? null, [filteredRows, rows, selectedKey]);

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const resetFilters = () => setFilters(EMPTY_FILTERS);
  const selectDate = (date: string) => setFilters((current) => ({ ...current, from: date, to: date }));

  return (
    <main className="min-h-screen bg-stone-50 py-8 text-slate-900">
      <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-700">Archive</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">回顧アーカイブ</h1>
          </div>
          <div className="grid grid-cols-3 gap-3 text-right text-sm">
            <div>
              <p className="text-slate-500">表示</p>
              <p className="text-xl font-bold">{filteredRows.length}</p>
            </div>
            <div>
              <p className="text-slate-500">全件</p>
              <p className="text-xl font-bold">{rows.length}</p>
            </div>
            <div>
              <p className="text-slate-500">読込</p>
              <p className="text-xl font-bold">{isLoading ? "..." : "完了"}</p>
            </div>
          </div>
        </header>

        <section className="mb-6 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900">表示中の結果確定レース</p>
                <p className="mt-1 text-xs text-slate-500">{formatCount(filteredReturnSummary.raceCount)}R / 単複各100円</p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <p>単 {filteredReturnSummary.tanHitCount}/{filteredReturnSummary.raceCount}</p>
                <p>複 {filteredReturnSummary.fukuHitCount}/{filteredReturnSummary.raceCount}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-md bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-500">単勝回収率</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{formatRate(filteredReturnSummary.tanRoi)}</p>
                <p className="mt-1 text-xs text-slate-500">的中率 {formatRate(filteredReturnSummary.tanRate)}</p>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-500">複勝回収率</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{formatRate(filteredReturnSummary.fukuRoi)}</p>
                <p className="mt-1 text-xs text-slate-500">的中率 {formatRate(filteredReturnSummary.fukuRate)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900">全結果確定レース</p>
                <p className="mt-1 text-xs text-slate-500">{formatCount(totalReturnSummary.raceCount)}R / 単複各100円</p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <p>単 {totalReturnSummary.tanHitCount}/{totalReturnSummary.raceCount}</p>
                <p>複 {totalReturnSummary.fukuHitCount}/{totalReturnSummary.raceCount}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-md bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-500">単勝回収率</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{formatRate(totalReturnSummary.tanRoi)}</p>
                <p className="mt-1 text-xs text-slate-500">的中率 {formatRate(totalReturnSummary.tanRate)}</p>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-500">複勝回収率</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{formatRate(totalReturnSummary.fukuRoi)}</p>
                <p className="mt-1 text-xs text-slate-500">的中率 {formatRate(totalReturnSummary.fukuRate)}</p>
              </div>
            </div>
          </div>

          <ReturnSummaryCard
            title="総合試走1位（表示中・払戻あり）"
            summary={filteredSimLeaderReturnSummary}
            note="総合試走1位が保存済みの馬券候補に含まれ、公式払戻がある行のみ集計"
          />

          <ReturnSummaryCard
            title="試走1位=馬券本命（表示中）"
            summary={filteredAgreementReturnSummary}
            note="総合試走1位と馬券推奨本命が一致した行のみ集計"
          />
        </section>

        {categoryReturnStats.length > 0 ? <CategoryReturnStatsTable stats={categoryReturnStats} /> : null}

        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Filter className="h-4 w-4 text-teal-700" />
              フィルタ
            </div>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:border-slate-400"
            >
              <RotateCcw className="h-4 w-4" />
              リセット
            </button>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr]">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm font-semibold text-slate-600">
                開始日
                <input
                  type="date"
                  value={filters.from}
                  onChange={(event) => updateFilter("from", event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-900"
                />
              </label>
              <label className="text-sm font-semibold text-slate-600">
                終了日
                <input
                  type="date"
                  value={filters.to}
                  onChange={(event) => updateFilter("to", event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-900"
                />
              </label>
              <label className="text-sm font-semibold text-slate-600">
                場
                <select
                  value={filters.venue}
                  onChange={(event) => updateFilter("venue", event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-900"
                >
                  <option value="all">すべて</option>
                  {venues.map((venue) => (
                    <option key={venue} value={venue}>
                      {venue}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-600">
                検索
                <input
                  type="search"
                  value={filters.query}
                  onChange={(event) => updateFilter("query", event.target.value)}
                  placeholder="レース・馬名"
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-900"
                />
              </label>
            </div>

            <div className="space-y-3">
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-600">R帯</p>
                <div className="flex flex-wrap gap-2">
                  <SegmentButton active={filters.raceBand === "all"} value="all" label="すべて" onClick={(value) => updateFilter("raceBand", value)} />
                  <SegmentButton active={filters.raceBand === "9-10"} value="9-10" label="9-10R" onClick={(value) => updateFilter("raceBand", value)} />
                  <SegmentButton active={filters.raceBand === "11"} value="11" label="11R" onClick={(value) => updateFilter("raceBand", value)} />
                  <SegmentButton active={filters.raceBand === "12"} value="12" label="12R" onClick={(value) => updateFilter("raceBand", value)} />
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-600">期待度</p>
                <div className="flex flex-wrap gap-2">
                  <SegmentButton active={filters.expectation === "all"} value="all" label="すべて" onClick={(value) => updateFilter("expectation", value)} />
                  {GRADES.map((grade) => (
                    <SegmentButton key={grade} active={filters.expectation === grade} value={grade} label={grade} onClick={(value) => updateFilter("expectation", value)} />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-600">的中</p>
                <div className="flex flex-wrap gap-2">
                  <SegmentButton active={filters.hit === "all"} value="all" label="すべて" onClick={(value) => updateFilter("hit", value)} />
                  <SegmentButton active={filters.hit === "tan"} value="tan" label="単勝" onClick={(value) => updateFilter("hit", value)} />
                  <SegmentButton active={filters.hit === "fuku"} value="fuku" label="複勝" onClick={(value) => updateFilter("hit", value)} />
                  <SegmentButton active={filters.hit === "miss"} value="miss" label="外れ" onClick={(value) => updateFilter("hit", value)} />
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <label className="text-sm font-semibold text-slate-600">
                  snapshotOrigin
                  <select
                    value={filters.origin}
                    onChange={(event) => updateFilter("origin", event.target.value as OriginFilter)}
                    className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-900"
                  >
                    <option value="all">すべて</option>
                    {ORIGINS.map((origin) => (
                      <option key={origin} value={origin}>
                        {origin}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold text-slate-600">
                  一致
                  <select
                    value={filters.agreement}
                    onChange={(event) => updateFilter("agreement", event.target.value as AgreementFilter)}
                    className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-900"
                  >
                    <option value="all">すべて</option>
                    <option value="match">一致</option>
                    <option value="mismatch">不一致</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <CalendarDays className="h-4 w-4 text-teal-700" />
              カレンダー
            </div>
            {(filters.from || filters.to) && (
              <button
                type="button"
                onClick={() => setFilters((current) => ({ ...current, from: "", to: "" }))}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400"
              >
                日付解除
              </button>
            )}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {calendarMonths.map(({ month, cells }) => (
              <div key={month} className="rounded-lg border border-slate-200 p-3">
                <h2 className="mb-3 text-sm font-bold text-slate-800">{month}</h2>
                <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500">
                  {WEEKDAYS.map((weekday) => (
                    <div key={weekday} className="py-1">
                      {weekday}
                    </div>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {cells.map((day, index) =>
                    day ? (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => selectDate(day.date)}
                        className={`min-h-28 rounded-md border p-2 text-left transition ${
                          filters.from === day.date && filters.to === day.date
                            ? "border-teal-700 bg-teal-50"
                            : "border-slate-200 bg-white hover:border-teal-400"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-bold text-slate-900">{Number(day.date.slice(8, 10))}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">{day.raceCount}R</span>
                        </div>
                        <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                          <p>複 {day.fukuHitCount}/{day.raceCount} ({formatRate(day.fukuRate)})</p>
                          <p>ROI {formatRate(day.roi)}</p>
                          <p>S{day.gradeCounts.S} A{day.gradeCounts.A} B{day.gradeCounts.B} C{day.gradeCounts.C}</p>
                        </div>
                      </button>
                    ) : (
                      <div key={`blank-${month}-${index}`} className="min-h-28 rounded-md border border-transparent" />
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-bold">回顧テーブル</h2>
            <p className="text-sm text-slate-500">{filteredRows.length}件</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1450px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-3">日付</th>
                  <th className="px-3 py-3">場</th>
                  <th className="px-3 py-3 text-right">R</th>
                  <th className="px-3 py-3">レース名</th>
                  <th className="px-3 py-3">馬券推奨本命</th>
                  <th className="px-3 py-3">期待度</th>
                  <th className="px-3 py-3">総合試走1位</th>
                  <th className="px-3 py-3">馬券評価</th>
                  <th className="px-3 py-3">一致</th>
                  <th className="px-3 py-3">結果</th>
                  <th className="px-3 py-3 text-right">単勝払戻</th>
                  <th className="px-3 py-3 text-right">複勝払戻</th>
                  <th className="px-3 py-3 text-right">scoreGap</th>
                  <th className="px-3 py-3 text-right">realOdds</th>
                  <th className="px-3 py-3">snapshotOrigin</th>
                  <th className="px-3 py-3">dataQuality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => (
                  <tr
                    key={row.key}
                    tabIndex={0}
                    onClick={() => setSelectedKey(row.key)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") setSelectedKey(row.key);
                    }}
                    className="cursor-pointer bg-white hover:bg-teal-50/60 focus:bg-teal-50 focus:outline-none"
                  >
                    <td className="whitespace-nowrap px-3 py-3 font-medium">{row.date || "-"}</td>
                    <td className="whitespace-nowrap px-3 py-3">{row.venue}</td>
                    <td className="px-3 py-3 text-right">{row.raceNumber ?? "-"}</td>
                    <td className="max-w-56 truncate px-3 py-3 font-medium">{row.raceName}</td>
                    <td className="max-w-48 truncate px-3 py-3">{row.honmeiDisplay}</td>
                    <td className="px-3 py-3"><GradeBadge grade={row.expectationGrade} /></td>
                    <td className="max-w-48 truncate px-3 py-3">{row.simLeaderDisplay}</td>
                    <td className="px-3 py-3"><GradeBadge grade={row.betGrade} /></td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${row.agreement ? "bg-emerald-100 text-emerald-700" : row.agreement === false ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                        {row.agreement ? "一致" : row.agreement === false ? "不一致" : "-"}
                      </span>
                    </td>
                    <td className="max-w-56 truncate px-3 py-3">{row.resultText}</td>
                    <td className="px-3 py-3 text-right">{formatPayout(row.tanPayout)}</td>
                    <td className="px-3 py-3 text-right">{formatPayout(row.fukuPayout)}</td>
                    <td className="px-3 py-3 text-right font-mono">{formatScoreGap(row.scoreGap)}</td>
                    <td className="px-3 py-3 text-right font-mono">{formatOdds(row.realOdds)}</td>
                    <td className="whitespace-nowrap px-3 py-3">{row.snapshotOrigin ?? "-"}</td>
                    <td className="px-3 py-3">
                      <div className="flex max-w-64 flex-wrap gap-1">
                        {row.dataQualityFlags.length ? row.dataQualityFlags.map((flag) => (
                          <span key={flag} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${qualityTone(flag)}`}>{flag}</span>
                        )) : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">ok</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {selectedRow && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" role="dialog" aria-modal="true">
          <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-teal-700">{selectedRow.date} / {selectedRow.venue} {selectedRow.raceNumber ?? "-"}R</p>
                <h2 className="mt-1 text-xl font-bold">{selectedRow.raceName}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:border-slate-400"
                aria-label="閉じる"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4">
              <div className="mb-4 flex flex-wrap gap-2">
                {selectedRow.dataQualityFlags.length ? selectedRow.dataQualityFlags.map((flag) => (
                  <span key={flag} className={`rounded-full px-2 py-1 text-xs font-bold ${qualityTone(flag)}`}>{flag}</span>
                )) : <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">ok</span>}
              </div>

              <Field label="総合試走1位" value={selectedRow.simLeaderDisplay} />
              <Field label="馬券評価" value={<GradeBadge grade={selectedRow.betGrade} />} />
              <Field label="馬券推奨本命" value={selectedRow.honmeiDisplay} />
              <Field label="期待度" value={<GradeBadge grade={selectedRow.expectationGrade} />} />
              <Field label="一致 / 不一致" value={selectedRow.agreement ? "一致" : selectedRow.agreement === false ? "不一致" : "-"} />
              <Field label="不一致理由" value={selectedRow.disagreementReason ?? "-"} />
              <Field label="結果" value={selectedRow.resultText} />
              <Field label="単勝 / 複勝" value={`${formatOutcome(selectedRow.tanOutcome)} ${formatPayout(selectedRow.tanPayout)} / ${formatOutcome(selectedRow.fukuOutcome)} ${formatPayout(selectedRow.fukuPayout)}`} />
              <Field label="scoreGap" value={formatScoreGap(selectedRow.scoreGap)} />
              <Field label="odds" value={formatOdds(selectedRow.realOdds)} />
              <Field label="snapshotTakenAt" value={formatTimestamp(selectedRow.snapshotTakenAt)} />
              <Field label="raceDate" value={selectedRow.date || "-"} />
              <Field label="snapshotOrigin" value={selectedRow.snapshotOrigin ?? "-"} />
              <Field label="dataQuality flags" value={selectedRow.dataQualityFlags.length ? selectedRow.dataQualityFlags.join(" / ") : "ok"} />
              <Field label="classificationHint" value={selectedRow.honmei?.classificationHint ? `${selectedRow.honmei.classificationHint.classification} (${Math.round(selectedRow.honmei.classificationHint.confidence * 100)}%) ${selectedRow.honmei.classificationHint.reason ?? ""}` : "-"} />
              <Field label="selectionReason" value={selectedRow.honmei?.selectionReason ?? "-"} />
              <Field label="raceId" value={selectedRow.raceId || "-"} />
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
