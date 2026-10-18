import type { GeneratedReviewRace, GeneratedRaceResult } from './generatedRaceSchedule';
import type { ExpectationGrade, PredictionOrigin, PredictionSnapshot, PredictionSnapshotSourceStatus, RaceReviewRecord, ReviewSelectionHorse } from './types';

export type ArchiveSourceRace = Partial<GeneratedReviewRace> & {
  raceId: string;
  courseId: string;
  label: string;
  date: string;
  weekOf?: string | null;
  result?: GeneratedRaceResult;
};

export type DataQualityFlag =
  | "not live_pre_race"
  | "retrospective"
  | "legacy source unknown"
  | "backfill"
  | "saved_manual"
  | "odds missing"
  | "classification missing"
  | "recommendedBetAction unknown"
  | "snapshot after race"
  | "payout fallback";

export type ArchiveRow = {
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
  sourceStatus: PredictionSnapshotSourceStatus;
  livePreRaceEligible: boolean;
  dataQualityFlags: DataQualityFlag[];
  record: RaceReviewRecord | null;
  snapshot: PredictionSnapshot | null;
  sourceRace: ArchiveSourceRace;
};


export function getRaceKey(race: { raceId?: string | null; courseId?: string | null }) {
  const raceId = String(race.raceId ?? "").trim();
  if (raceId) return { raceId, courseId: String(race.courseId ?? "") };
  const courseId = String(race.courseId ?? "");
  const match = courseId.match(/(\d{12})$/);
  return { raceId: match?.[1] ?? "", courseId };
}


export function resolveCalendarRaceDate(params: {raceId?:string|null;raceDate?:string|null;snapshotRaceDate?:string|null;fallbackDate?:string|null;weekOf?:string|null}) {
  // An explicit calendar date also covers Monday holidays and postponed meetings.
  // A meeting day number is not a weekday and must never rewrite that date.
  return params.raceDate ?? params.snapshotRaceDate ?? params.fallbackDate ?? '';
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

function resolveRowSourceStatus(record: RaceReviewRecord | null, snapshot: PredictionSnapshot | null): PredictionSnapshotSourceStatus {
  const explicit = record?.snapshotSourceStatus ?? snapshot?.sourceStatus ?? snapshot?.dataLineage?.sourceStatus;
  if (explicit === "live_pre_race" || explicit === "retrospective" || explicit === "manual_snapshot" || explicit === "unknown") {
    return explicit;
  }
  if (snapshot?.predictionOrigin === "backfill") return "retrospective";
  if (snapshot?.predictionOrigin === "saved_manual" || snapshot?.snapshotType === "manual_snapshot") return "manual_snapshot";

  const captured = Date.parse(String(record?.snapshotTakenAt ?? snapshot?.snapshotTakenAt ?? snapshot?.capturedAt ?? ""));
  const scheduled = Date.parse(String(record?.meta.scheduledStartTime ?? snapshot?.scheduledStartTime ?? ""));
  if (Number.isFinite(captured) && Number.isFinite(scheduled)) {
    return captured < scheduled ? "live_pre_race" : "retrospective";
  }
  const raceDate = record?.meta.raceDate ?? snapshot?.raceDate ?? null;
  if (Number.isFinite(captured) && raceDate && new Date(captured).toISOString().slice(0, 10) > raceDate) {
    return "retrospective";
  }
  return "unknown";
}

function resolveLivePreRaceEligible(record: RaceReviewRecord | null, snapshot: PredictionSnapshot | null) {
  return record?.livePreRaceEligible === true || snapshot?.livePreRaceEligible === true || resolveRowSourceStatus(record, snapshot) === "live_pre_race";
}

function getQualityFlags(params: {
  record: RaceReviewRecord | null;
  snapshot: PredictionSnapshot | null;
  rowRealOdds: number | null;
  raceDate: string;
}): DataQualityFlag[] {
  const { record, snapshot, rowRealOdds, raceDate } = params;
  const flags: DataQualityFlag[] = [];
  const sourceStatus = resolveRowSourceStatus(record, snapshot);
  if (sourceStatus !== "live_pre_race") flags.push("not live_pre_race");
  if (sourceStatus === "retrospective") flags.push("retrospective");
  if (sourceStatus === "unknown") flags.push("legacy source unknown");
  if (snapshot?.predictionOrigin === "backfill") flags.push("backfill");
  if (snapshot?.predictionOrigin === "saved_manual") flags.push("saved_manual");
  if (!rowRealOdds || rowRealOdds <= 0) flags.push("odds missing");
  if (!record?.honmei?.classificationHint) flags.push("classification missing");
  if (!record?.honmei?.recommendedBetAction || record.honmei.recommendedBetAction === "unknown") flags.push("recommendedBetAction unknown");
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

export function recordToSourceRace(record: RaceReviewRecord): ArchiveSourceRace {
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

export function buildArchiveRow(params: {
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
  const sourceStatus = resolveRowSourceStatus(record, snapshot);

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
    sourceStatus,
    livePreRaceEligible: resolveLivePreRaceEligible(record, snapshot),
    dataQualityFlags: getQualityFlags({ record, snapshot, rowRealOdds: realOdds, raceDate: date }),
    record,
    snapshot,
    sourceRace: race,
  };
}


export function getStoredSelectionForHorse(row: ArchiveRow, horseId?: string | null): ReviewSelectionHorse | null {
  if (!horseId) return null;
  const target = String(horseId);
  const selections = [row.record?.honmei, row.record?.opponent, row.record?.wide];
  return selections.find((selection) => selection && String(selection.horseId) === target) ?? null;
}


export type ArchiveIndexRow = Omit<ArchiveRow, 'record' | 'snapshot' | 'sourceRace'> & { simLeaderSelection: ReviewSelectionHorse | null };
export function toArchiveIndexRow(row: ArchiveRow): ArchiveIndexRow {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Full details are served separately.
  const { record: _record, snapshot: _snapshot, sourceRace: _sourceRace, ...index } = row;
  return { ...index, simLeaderSelection: getStoredSelectionForHorse(row, row.simLeaderHorseId) };
}
export function buildArchiveRows(generated: ArchiveSourceRace[], records: Record<string,RaceReviewRecord>, snapshots: Record<string,PredictionSnapshot>): ArchiveRow[] {
  const ids = new Set(generated.map(race => getRaceKey(race).raceId).filter(Boolean));
  const races = [...generated, ...Object.values(records).filter(record => !ids.has(record.raceId)).map(recordToSourceRace)];
  return races.map(race => {
    const { raceId, courseId } = getRaceKey(race);
    const record = records[raceId] ?? null;
    return buildArchiveRow({ race: { ...race, raceId, courseId }, record, snapshot: snapshots[raceId] ?? record?.snapshot ?? null });
  }).sort((a,b) => (b.date+'-'+String(b.raceNumber ?? 0).padStart(2,'0')).localeCompare(a.date+'-'+String(a.raceNumber ?? 0).padStart(2,'0')));
}
