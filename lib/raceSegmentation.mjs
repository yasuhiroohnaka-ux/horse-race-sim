/**
 * @typedef {"special" | "special_final12" | "final12" | "other"} RaceSegment
 * @typedef {"special_only" | "final12_only" | "all_expanded" | "special_non_final" | "special_final12"} RaceDiagnosticsSegmentKey
 * @typedef {{
 *   raceId?: string | null;
 *   courseId?: string | null;
 *   label?: string | null;
 *   grade?: string | null;
 *   raceNumber?: number | string | null;
 *   day?: string | null;
 *   surface?: string | null;
 *   surfaceLabel?: string | null;
 *   raceData?: string | null;
 *   title?: string | null;
 *   isSpecialRace?: boolean | null;
 *   isFinalRace?: boolean | null;
 *   isJumpRace?: boolean | null;
 *   raceSegment?: RaceSegment | null;
 * }} RaceLike
 * @typedef {{
 *   includeSpecialRaces: boolean;
 *   includeFinalRace: boolean;
 *   excludeJumpRaces: boolean;
 *   finalRaceNumber: number;
 * }} RaceTargetingConfig
 * @typedef {{
 *   raceNumber: number | null;
 *   isSpecialRace: boolean;
 *   isFinalRace: boolean;
 *   isJumpRace: boolean;
 *   raceSegment: RaceSegment;
 * }} RaceTargetFlags
 */

export const TARGET_RACE_CONFIG = Object.freeze(
  /** @type {RaceTargetingConfig} */ ({
    includeSpecialRaces: true,
    includeFinalRace: true,
    excludeJumpRaces: true,
    finalRaceNumber: 12,
  })
);

export const SPECIAL_RACE_GRADES = new Set(["G1", "G2", "G3", "L", "OP"]);

export const RACE_DIAGNOSTIC_SEGMENTS = Object.freeze(
  /** @type {RaceDiagnosticsSegmentKey[]} */ ([
    "special_only",
    "final12_only",
    "all_expanded",
    "special_non_final",
    "special_final12",
  ])
);

const GENERIC_CLASS_PATTERNS = [
  /(?:^|\s)(?:[0-9]+|\u4e00|\u4e8c|\u4e09|\u56db)\u6b73(?:\u4ee5\u4e0a)?(?:\s|$)/u,
  /(?:1|2|3)\u52dd\u30af\u30e9\u30b9/u,
  /(?:1|2|3)Win/iu,
  /\u65b0\u99ac/u,
  /\u672a\u52dd\u5229/u,
  /\u969c\u5bb3/u,
  /Maiden/iu,
  /Newcomer/iu,
];

const JUMP_PATTERNS = [/\u969c/u, /\u30b8\u30e3\u30f3\u30d7/iu, /\bJump\b/iu];

function normalizeString(value) {
  const normalized = String(value ?? "").trim();
  return normalized || "";
}

function toRaceNumber(value) {
  const direct = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(direct) && direct > 0 ? direct : null;
}

export function resolveRaceNumber(race) {
  const direct = toRaceNumber(race?.raceNumber);
  if (direct !== null) return direct;

  const raceIdMatch = normalizeString(race?.raceId).match(/(\d{2})$/);
  if (raceIdMatch) {
    return toRaceNumber(raceIdMatch[1]);
  }

  const courseIdMatch = normalizeString(race?.courseId).match(/(\d{2})$/);
  if (courseIdMatch) {
    return toRaceNumber(courseIdMatch[1]);
  }

  return null;
}

function isJumpRace(race) {
  if (race?.isJumpRace === true) return true;
  const surface = normalizeString(race?.surface);
  if (surface.toLowerCase() === "jump") return true;

  const haystacks = [
    normalizeString(race?.surfaceLabel),
    normalizeString(race?.label),
    normalizeString(race?.raceData),
    normalizeString(race?.title),
  ];
  return haystacks.some((value) => JUMP_PATTERNS.some((pattern) => pattern.test(value)));
}

function isNamedConditionSpecial(label, raceNumber) {
  if (!(raceNumber >= 9)) return false;
  if (!label) return false;
  return !GENERIC_CLASS_PATTERNS.some((pattern) => pattern.test(label));
}

export function getRaceTargetFlags(race, config = TARGET_RACE_CONFIG) {
  if (race?.isSpecialRace === true || race?.isFinalRace === true || race?.raceSegment) {
    const raceNumber = resolveRaceNumber(race);
    const derivedJump = isJumpRace(race);
    const isSpecialRace = race?.isSpecialRace === true;
    const isFinalRace = race?.isFinalRace === true || raceNumber === config.finalRaceNumber;
    const raceSegment =
      race?.raceSegment && race.raceSegment !== "other"
        ? race.raceSegment
        : isSpecialRace && isFinalRace
          ? "special_final12"
          : isSpecialRace
            ? "special"
            : isFinalRace
              ? "final12"
              : "other";

    return {
      raceNumber,
      isSpecialRace,
      isFinalRace,
      isJumpRace: derivedJump,
      raceSegment,
    };
  }

  const raceNumber = resolveRaceNumber(race);
  const label = normalizeString(race?.label);
  const grade = normalizeString(race?.grade).toUpperCase();
  const jump = isJumpRace(race);
  const isSpecialRace = !jump && (SPECIAL_RACE_GRADES.has(grade) || isNamedConditionSpecial(label, raceNumber));
  const isFinalRace = raceNumber === config.finalRaceNumber;

  return {
    raceNumber,
    isSpecialRace,
    isFinalRace,
    isJumpRace: jump,
    raceSegment: isSpecialRace && isFinalRace ? "special_final12" : isSpecialRace ? "special" : isFinalRace ? "final12" : "other",
  };
}

export function isExpandedTargetRace(race, config = TARGET_RACE_CONFIG) {
  const flags = getRaceTargetFlags(race, config);
  if (config.excludeJumpRaces && flags.isJumpRace) return false;
  if (config.includeSpecialRaces && flags.isSpecialRace) return true;
  if (config.includeFinalRace && flags.isFinalRace) return true;
  return false;
}

export function matchesRaceDiagnosticSegment(race, segmentKey, config = TARGET_RACE_CONFIG) {
  const flags = getRaceTargetFlags(race, config);
  switch (segmentKey) {
    case "special_only":
      return flags.isSpecialRace;
    case "final12_only":
      return flags.isFinalRace;
    case "all_expanded":
      return isExpandedTargetRace(race, config);
    case "special_non_final":
      return flags.isSpecialRace && !flags.isFinalRace;
    case "special_final12":
      return flags.isSpecialRace && flags.isFinalRace;
    default:
      return false;
  }
}
