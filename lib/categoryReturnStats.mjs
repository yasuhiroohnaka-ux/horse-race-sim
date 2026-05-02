const GRADE_GROUPS = {
  graded: new Set(["G1", "G2", "G3"]),
  open: new Set(["G1", "G2", "G3", "L", "OP"]),
};

export const CATEGORY_RETURN_STAT_DEFINITIONS = [
  {
    key: "g1_only",
    label: "G1のみ",
    xLabel: "G1",
    matches: (meta) => normalizeGrade(meta?.grade) === "G1",
  },
  {
    key: "graded_only",
    label: "G1含む重賞のみ",
    xLabel: "重賞",
    matches: (meta) => GRADE_GROUPS.graded.has(normalizeGrade(meta?.grade)),
  },
  {
    key: "open_extended",
    label: "重賞・リステッド・オープン",
    xLabel: "重賞L/OP",
    matches: (meta) => GRADE_GROUPS.open.has(normalizeGrade(meta?.grade)),
  },
  {
    key: "conditions_9_10_12",
    label: "条件戦(9,10,12R)",
    xLabel: "条件",
    matches: (meta) =>
      normalizeGrade(meta?.grade) === "OTHER" && [9, 10, 12].includes(Number(meta?.raceNumber)),
  },
];

const FALLBACK_RACE_META_BY_RACE_ID = {
  "202605010811": { raceId: "202605010811", label: "フェブラリーS", grade: "G1", raceNumber: 11 },
  "202606020211": { raceId: "202606020211", label: "中山記念", grade: "G2", raceNumber: 11 },
  "202606020111": { raceId: "202606020111", label: "オーシャンS", grade: "G3", raceNumber: 11 },
  "202609010411": { raceId: "202609010411", label: "チューリップ賞", grade: "G2", raceNumber: 11 },
};

function normalizeGrade(value) {
  const text = String(value ?? "").trim().toUpperCase();
  if (text === "LISTED") return "L";
  if (text === "OPEN") return "OP";
  if (!text || text === "NONE") return "OTHER";
  return text;
}

function normalizeKey(value) {
  return String(value ?? "").trim();
}

function extractRaceId(value) {
  const match = String(value ?? "").match(/(\d{12})/);
  return match?.[1] ?? "";
}

function collectWeeklyRaceMeta(weeklyData) {
  const races = [];
  const addRaces = (week) => {
    for (const race of week?.races ?? []) {
      races.push({ ...race, weekOf: race.weekOf ?? week?.weekOf ?? null });
    }
  };

  addRaces(weeklyData?.currentWeek);
  for (const archive of weeklyData?.archives ?? []) addRaces(archive);
  return races;
}

export function buildCategoryReturnRaceMetaLookup(weeklyData) {
  const byRaceId = new Map();
  const byCourseId = new Map();
  const byWeekAndLabel = new Map();
  const byLabel = new Map();

  for (const race of collectWeeklyRaceMeta(weeklyData)) {
    const raceId = normalizeKey(race.raceId) || extractRaceId(race.courseId);
    const courseId = normalizeKey(race.courseId);
    const label = normalizeKey(race.label);
    const meta = {
      raceId,
      courseId,
      label,
      weekOf: race.weekOf ?? null,
      grade: normalizeGrade(race.grade),
      raceNumber: Number.isFinite(Number(race.raceNumber)) ? Number(race.raceNumber) : null,
      raceDate: race.raceDate ?? race.date ?? null,
    };

    if (raceId) byRaceId.set(raceId, meta);
    if (courseId) byCourseId.set(courseId, meta);
    if (label && meta.weekOf) byWeekAndLabel.set(`${meta.weekOf}|${label}`, meta);
    if (label && !byLabel.has(label)) byLabel.set(label, meta);
  }

  for (const [raceId, meta] of Object.entries(FALLBACK_RACE_META_BY_RACE_ID)) {
    if (!byRaceId.has(raceId)) byRaceId.set(raceId, { ...meta, grade: normalizeGrade(meta.grade) });
  }

  return { byRaceId, byCourseId, byWeekAndLabel, byLabel };
}

export function resolveCategoryReturnRaceMeta(record, lookup) {
  const raceId = normalizeKey(record?.raceId) || extractRaceId(record?.courseId);
  const courseId = normalizeKey(record?.courseId);
  const label = normalizeKey(record?.raceLabel ?? record?.label ?? record?.raceName);
  const weekOf = normalizeKey(record?.weekOf);

  if (raceId && lookup.byRaceId.has(raceId)) return lookup.byRaceId.get(raceId);
  if (courseId && lookup.byCourseId.has(courseId)) return lookup.byCourseId.get(courseId);
  if (weekOf && label && lookup.byWeekAndLabel.has(`${weekOf}|${label}`)) {
    return lookup.byWeekAndLabel.get(`${weekOf}|${label}`);
  }
  if (label && lookup.byLabel.has(label)) return lookup.byLabel.get(label);
  return null;
}

function isOfficialSettledWinRecord(record) {
  return (
    record?.pickType === "win" &&
    record?.settlementStatus === "settled" &&
    record?.tanPayoutSource === "official" &&
    record?.fukuPayoutSource === "official"
  );
}

function isOfficialSettledSelection(selection) {
  return (
    selection?.settlementStatus === "settled" &&
    selection?.tanPayoutSource === "official" &&
    selection?.fukuPayoutSource === "official"
  );
}

function normalizeReviewRecordForCategoryStats(record) {
  const selection = record?.honmei;
  if (!isOfficialSettledSelection(selection)) return null;
  return {
    raceId: record?.raceId ?? record?.meta?.raceId ?? null,
    courseId: record?.courseId ?? record?.meta?.courseId ?? null,
    raceLabel: record?.meta?.raceName ?? record?.snapshot?.raceName ?? null,
    weekOf: record?.meta?.weekOf ?? record?.snapshot?.weekOf ?? null,
    pickType: "win",
    settlementStatus: selection.settlementStatus,
    tanOutcome: selection.tanOutcome,
    fukuOutcome: selection.fukuOutcome,
    tanPayout: Number(selection.tanPayout ?? 0),
    fukuPayout: Number(selection.fukuPayout ?? 0),
    tanPayoutSource: selection.tanPayoutSource,
    fukuPayoutSource: selection.fukuPayoutSource,
    tanHit: selection.tanHit ?? selection.tanOutcome === "hit",
    fukuHit: selection.fukuHit ?? selection.fukuOutcome === "hit",
    fallbackMeta: {
      grade: record?.meta?.grade,
      raceNumber: record?.meta?.raceNumber,
    },
  };
}

function emptyBucket(definition) {
  return {
    key: definition.key,
    label: definition.label,
    xLabel: definition.xLabel,
    raceCount: 0,
    tanHitCount: 0,
    fukuHitCount: 0,
    tanPayout: 0,
    fukuPayout: 0,
    tanReturnRate: 0,
    fukuReturnRate: 0,
    combinedReturnRate: 0,
    missingMetaCount: 0,
  };
}

function finalizeBucket(bucket) {
  const stake = bucket.raceCount * 100;
  return {
    ...bucket,
    tanReturnRate: stake > 0 ? (bucket.tanPayout / stake) * 100 : 0,
    fukuReturnRate: stake > 0 ? (bucket.fukuPayout / stake) * 100 : 0,
    combinedReturnRate: stake > 0 ? ((bucket.tanPayout + bucket.fukuPayout) / (stake * 2)) * 100 : 0,
  };
}

export function buildCategoryReturnStats(records, weeklyData) {
  const lookup = buildCategoryReturnRaceMetaLookup(weeklyData);
  const buckets = new Map(CATEGORY_RETURN_STAT_DEFINITIONS.map((definition) => [definition.key, emptyBucket(definition)]));

  for (const record of records ?? []) {
    if (!isOfficialSettledWinRecord(record)) continue;
    const meta = resolveCategoryReturnRaceMeta(record, lookup);

    for (const definition of CATEGORY_RETURN_STAT_DEFINITIONS) {
      const bucket = buckets.get(definition.key);
      if (!meta) {
        bucket.missingMetaCount += 1;
        continue;
      }
      if (!definition.matches(meta)) continue;

      bucket.raceCount += 1;
      if (record.tanOutcome === "hit" || record.tanHit === true) bucket.tanHitCount += 1;
      if (record.fukuOutcome === "hit" || record.fukuHit === true) bucket.fukuHitCount += 1;
      bucket.tanPayout += Number(record.tanPayout ?? 0);
      bucket.fukuPayout += Number(record.fukuPayout ?? 0);
    }
  }

  return CATEGORY_RETURN_STAT_DEFINITIONS.map((definition) => finalizeBucket(buckets.get(definition.key)));
}

export function buildCategoryReturnStatsFromReviewRecords(records, weeklyData) {
  const normalized = (records ?? [])
    .map((record) => normalizeReviewRecordForCategoryStats(record))
    .filter(Boolean);
  const lookup = buildCategoryReturnRaceMetaLookup(weeklyData);
  const buckets = new Map(CATEGORY_RETURN_STAT_DEFINITIONS.map((definition) => [definition.key, emptyBucket(definition)]));

  for (const record of normalized) {
    const meta = resolveCategoryReturnRaceMeta(record, lookup) ?? record.fallbackMeta ?? null;

    for (const definition of CATEGORY_RETURN_STAT_DEFINITIONS) {
      const bucket = buckets.get(definition.key);
      if (!meta) {
        bucket.missingMetaCount += 1;
        continue;
      }
      if (!definition.matches(meta)) continue;

      bucket.raceCount += 1;
      if (record.tanOutcome === "hit" || record.tanHit === true) bucket.tanHitCount += 1;
      if (record.fukuOutcome === "hit" || record.fukuHit === true) bucket.fukuHitCount += 1;
      bucket.tanPayout += Number(record.tanPayout ?? 0);
      bucket.fukuPayout += Number(record.fukuPayout ?? 0);
    }
  }

  return CATEGORY_RETURN_STAT_DEFINITIONS.map((definition) => finalizeBucket(buckets.get(definition.key)));
}

export function formatCategoryReturnStatsForX(stats) {
  const lines = ["単複カテゴリ回収"];
  for (const stat of stats ?? []) {
    lines.push(
      `${stat.xLabel} ${stat.raceCount}R 単${Math.round(stat.tanReturnRate)} 複${Math.round(stat.fukuReturnRate)}`
    );
  }
  return lines.join("\n");
}

export function formatCategoryReturnStatsMarkdown(stats) {
  const rows = [
    "| 区分 | 対象 | 単勝 | 複勝 | 単複合算 | 的中 | 払戻 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const stat of stats ?? []) {
    rows.push(
      `| ${stat.label} | ${stat.raceCount}R | ${stat.tanReturnRate.toFixed(1)}% | ${stat.fukuReturnRate.toFixed(1)}% | ${stat.combinedReturnRate.toFixed(1)}% | 単${stat.tanHitCount}/${stat.raceCount}・複${stat.fukuHitCount}/${stat.raceCount} | 単${stat.tanPayout.toLocaleString("ja-JP")}円・複${stat.fukuPayout.toLocaleString("ja-JP")}円 |`
    );
  }

  return rows.join("\n");
}
