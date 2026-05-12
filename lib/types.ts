export type RunningStyle = "Nige" | "Senko" | "Sashi" | "Oikomi";

// --- Single-pick classification (prediction-time hint) ---
// Classifies a honmei pick as win-oriented, place-oriented, or skip.
// This is a prediction-time hint, NOT a retrospective confirmed label.
// The honmei candidate is selected by placeScore (stability-weighted composite),
// and classification asks: "does this candidate also have strong win credentials,
// or is it primarily place-oriented, or are both too weak to recommend?"
// Values are UI-friendly so they can be displayed directly.
// A separate confirmed classification may be introduced later for retrospective analysis.
export type PickClassification = "win" | "place" | "skip";
export type RecommendedBetAction = PickClassification | "unknown";
export type RecommendedBetDecisionConfidence = "high" | "medium" | "low" | "unknown";
export type RecommendedBetDecisionSource = "explicit_live_rule" | "safety_rule" | "fallback" | "unknown";

export interface RecommendedBetDecision {
  action: RecommendedBetAction;
  confidence: RecommendedBetDecisionConfidence;
  reasons: string[];
  riskFlags: string[];
  source: RecommendedBetDecisionSource;
}

export interface PickClassificationHint {
  classification: PickClassification;
  confidence: number; // 0–1, how strongly the classification applies
  reason: string | null; // human-readable reason in Japanese
}
export type HorseSex = "M" | "F";
export type GroundCondition = "Firm" | "Good" | "Yielding" | "Soft";
export type Weather = "Sunny" | "Cloudy" | "Rain" | "Snow";
export type WindDirection = "Headwind" | "Tailwind" | "Crosswind";
export type PaceScenario = "Slow" | "Average" | "Fast";
export type PredictionOrigin = "saved_live" | "saved_manual" | "backfill";
export type PredictionSnapshotSourceStatus =
  | "live_pre_race"
  | "manual_snapshot"
  | "retrospective"
  | "unknown";
export type ExpectationGrade = "S" | "A" | "B" | "C";
export type DiagnosticsAggregationScope = "all" | "saved_only" | "live_pre_race_only";
export type RaceSegment = "special" | "special_final12" | "final12" | "other";
export type RaceDiagnosticsSegmentKey =
  | "special_only"
  | "final12_only"
  | "all_expanded"
  | "special_non_final"
  | "special_final12";

export interface Horse {
  id: string;
  name: string;
  speed: number;
  stamina: number;
  power: number;
  guts: number;
  runningStyle: RunningStyle;
  gateNumber: number;
  jockey: string;
  trainer?: string;
  jockeyPower?: number;
  stablePower?: number;
  trainingScore?: number;
  trainingNote?: string;
  recentFormScore?: number;
  recentAverageFinish?: number;
  recentTimeIndex?: number;
  previousRaceName?: string;
  previousRaceDisplayName?: string;
  previousRaceNames?: string[];
  previousFinish?: number;
  previousRaceSource?: string;
  runnerPreviousRaceOverrideApplied?: boolean;
  previousRaceCourse?: string;
  previousRaceDistance?: number;
  previousRaceTrackType?: "芝" | "ダート" | "障害" | string;
  previousRaceGrade?: string;
  previousRaceDate?: string;
  lastRaceGradeScore?: number;
  lastRaceGradeLabel?: string;
  lastRaceName?: string;
  lastRaceDistance?: number;
  distanceChange?: number;
  condition?: number;
  weight?: number;
  sex?: HorseSex;
  favoriteCount?: number;
  xBuzzScore?: number;
  oddsSource?: string;
  oddsFetchedAt?: string;
  runningStyleSource?: string;
  runningStyleInitialSource?: string;
  predictionCount: number;
  simulatedOdds?: number;
  expertOdds?: number;
  realOdds?: number;
  pedigreeScore?: number;
  courseFitScore?: number;
  distanceFitScore?: number;
  groundFitScore?: number;
  paceFitScore?: number;
}

export type TrendHintType =
  | "previousRace"
  | "drawBias"
  | "gateBias"
  | "frameBias"
  | "previousRaceFinishPattern";

export interface TrendHintCondition {
  previousRaceNames?: string[];
  previousFinish?: number;
  gateNumberMin?: number;
  gateNumberMax?: number;
  frameNumbers?: number[];
}

export interface TrendHintRecord {
  win: number;
  second: number;
  third: number;
  out: number;
}

export interface TrendHintStats {
  record: TrendHintRecord;
  winRate: number;
  place2Rate: number;
  place3Rate: number;
}

export interface TrendHint {
  id: string;
  type: TrendHintType;
  label: string;
  condition: TrendHintCondition;
  stats: TrendHintStats;
  adjustment: number;
  adjustmentMode?: "score" | "explanationOnly";
  confidence: number;
  explanation: string;
}

export interface RaceTrendAdjustmentPolicy {
  maxPositiveAdjustment: number;
  maxNegativeAdjustment: number;
  defaultConfidence: number;
}

export interface RaceTrendProfile {
  raceKey: string;
  raceName: string;
  course: string;
  courseIds?: string[];
  matchRaceNames?: string[];
  notes: string[];
  trendHints: TrendHint[];
  adjustmentPolicy: RaceTrendAdjustmentPolicy;
}

export interface TrendHintMatchResult {
  id: string;
  type: TrendHintType;
  label: string;
  rawAdjustment: number;
  adjustment: number;
  confidence: number;
  sampleSize: number;
  sampleWeight: number;
  evidenceLabel?: string;
  explanation: string;
}

export interface RaceTrendScoreResult {
  baseScore: number;
  trendAdjustment: number;
  adjustedScore: number;
  matchedTrendHints: TrendHintMatchResult[];
}

export interface RaceTrendRankedScoreResult extends RaceTrendScoreResult {
  horseId: string;
  originalRank: number;
  adjustedRank: number;
}

export interface CourseSegment {
  distance: number;
  slope: number;
  type: "straight" | "corner";
}

export interface Course {
  id: string;
  name: string;
  displayName?: string;
  shortComment?: string;
  venue?: string;
  day?: string;
  grade?: string;
  raceNumber?: number;
  distance: number;
  surface: "Turf" | "Dirt";
  segments: CourseSegment[];
  straightLength: number;
  hashtag: string;
  isSpecialRace?: boolean;
  isFinalRace?: boolean;
  isJumpRace?: boolean;
  raceSegment?: RaceSegment;
  archived?: boolean;
  defaultBias?: TrackBias;
}

export interface TrackBias {
  innerOuter: number;
  frontBack: number;
}

export interface RaceCondition {
  courseId: string;
  trackBias: TrackBias;
  groundCondition: GroundCondition;
  weather: Weather;
  windDirection: WindDirection;
  windSpeed: number;
  paceScenario: PaceScenario;
}

export interface RaceResult {
  horseId: string;
  finishTime: number;
  position: number;
}

export type PredictionSnapshotContributorKey =
  | "abilityScore"
  | "courseFit"
  | "distanceFit"
  | "groundFit"
  | "paceFit"
  | "marketEdge";

export interface PredictionSnapshotContributor {
  key: PredictionSnapshotContributorKey;
  label: string;
  value: number;
}

export interface PredictionSnapshotSignalReason {
  signalLabel: string;
  signalDetailLabel: string | null;
  signalReason: string | null;
}

export interface PredictionSnapshotRow {
  horseId: string;
  externalHorseId?: string | null;
  horseName: string;
  rank: number;
  score: number;
  winProb: number;
  baseScore?: number;
  trendAdjustment?: number;
  adjustedScore?: number;
  originalRank?: number;
  adjustedRank?: number;
  matchedTrendHints?: TrendHintMatchResult[];
  fairOdds: number | null;
  realOdds: number | null;
  oddsSource?: string | null;
  oddsFetchedAt?: string | null;
  edge: number;
  runningStyle: RunningStyle;
  runningStyleSource?: string | null;
  runningStyleInitialSource?: string | null;
  gateNumber: number;
  jockey: string;
  previousRaceName?: string | null;
  previousRaceDisplayName?: string | null;
  previousFinish?: number | null;
  previousRaceSource?: string | null;
  runnerPreviousRaceOverrideApplied?: boolean | null;
  majorContributors: PredictionSnapshotContributor[];
}

export interface PredictionSnapshotMarketMeta {
  fieldSize: number;
  oddsFetchedAt: string | null;
  oddsSource: string | null;
}

export interface PredictionSnapshotExpectationEntry {
  horseId: string | null;
  grade: ExpectationGrade | null;
  reasons: string[];
}

export interface PredictionSnapshotExpectation {
  simulationLeader: PredictionSnapshotExpectationEntry;
  tanpukuHonmei: PredictionSnapshotExpectationEntry;
  agreement: {
    sameHorse: boolean;
    summary: string | null;
  };
}

export interface PredictionSnapshotDataLineage {
  sourceStatus: PredictionSnapshotSourceStatus;
  predictionOrigin: PredictionOrigin;
  capturedAt: string;
  scheduledStartTime: string | null;
  capturedBeforeScheduledStart: boolean | null;
  dataUpdatedAt: string | null;
  weeklyRacesUpdatedAt?: string | null;
  oddsSource: string | null;
  oddsFetchedAt: string | null;
}

export type PredictionSnapshotSelectionRole =
  | "simulation_leader"
  | "honmei"
  | "opponent"
  | "wide"
  | "value"
  | "watch";

export interface PredictionSnapshotSelectionLogEntry {
  role: PredictionSnapshotSelectionRole;
  horseId: string | null;
  horseName: string | null;
  rank: number | null;
  selectionMethod: "rank2" | "light_adjusted" | "legacy_value" | "stable_next" | "simulation_rank" | "market_watch";
  selectionReason: string | null;
  classificationHint?: PickClassificationHint;
  recommendedBetAction?: RecommendedBetAction;
  recommendedBetDecision?: RecommendedBetDecision;
  score: number | null;
  winProb: number | null;
  realOdds: number | null;
  placeOdds: number | null;
  placeProb: number | null;
  placeScore: number | null;
  valueScore: number | null;
  top3Stability: number | null;
  overbetLabel: string | null;
  scoreGap: number | null;
  runnerUpHorseId: string | null;
  runnerUpHorseName: string | null;
  runnerUpPlaceScore: number | null;
  runnerUpPlaceProb: number | null;
}

export interface PredictionSnapshotSelectionLog {
  createdAt: string;
  scoringVersion: string;
  entries: PredictionSnapshotSelectionLogEntry[];
  valueCandidateCount: number | null;
  marketHeatSummary: Record<string, unknown> | null;
}

export interface PredictionSnapshot {
  snapshotId: string;
  raceId: string;
  courseId: string;
  capturedAt: string;
  snapshotTakenAt?: string;
  snapshotType?: "manual_snapshot" | "pre_race_final";
  raceDate?: string | null;
  raceName?: string | null;
  venue?: string | null;
  venueKey?: string | null;
  raceNumber?: number | null;
  scheduledStartTime?: string | null;
  sourceStatus?: PredictionSnapshotSourceStatus;
  livePreRaceEligible?: boolean;
  dataLineage?: PredictionSnapshotDataLineage;
  predictionOrigin: PredictionOrigin;
  scoringVersion: string;
  modelFamily: string;
  modelVersion: string;
  scoringConfigHash: string;
  simulationCount: number;
  condition: RaceCondition;
  rankedRows: PredictionSnapshotRow[];
  honmeiHorseId: string | null;
  opponentHorseId?: string | null;
  opponentSelectionMethod?: "rank2" | "light_adjusted" | "legacy_value" | "stable_next";
  opponentScore?: number | null;
  opponentRank?: number | null;
  honmeiScore?: number | null;
  honmeiRank?: number | null;
  pairScoreGap?: number | null;
  pairRankGap?: number | null;
  valueHorseId: string | null;
  watchHorseId: string | null;
  expectation?: PredictionSnapshotExpectation | null;
  selectionLog?: PredictionSnapshotSelectionLog;
  signalReasons: Record<string, PredictionSnapshotSignalReason>;
  marketMeta: PredictionSnapshotMarketMeta;
}

export type ReviewProcessingStatus =
  | "not_snapshotted"
  | "snapshotted"
  | "result_pending"
  | "payout_pending"
  | "discovered"
  | "retry_scheduled"
  | "review_partial"
  | "review_ready"
  | "review_failed";

export type ReviewMissingReason =
  | "NO_SNAPSHOT"
  | "NO_MAIN_PICK"
  | "NO_PARTNER_PICK"
  | "NO_RESULT"
  | "NO_PAYOUT"
  | "JOIN_KEY_MISMATCH"
  | "UPSTREAM_NOT_READY"
  | "UPSTREAM_PAYOUT_NOT_READY";

export type ReviewCompatibilityMode = "native_opponent" | "legacy_value_candidate";

export interface ReviewRaceMeta {
  raceId: string;
  courseId: string;
  raceDate: string | null;
  weekOf: string | null;
  day: string | null;
  raceName: string | null;
  venue: string | null;
  venueKey: string | null;
  raceNumber: number | null;
  scheduledStartTime: string | null;
}

export interface ReviewSelectionHorse {
  horseId: string;
  externalHorseId?: string | null;
  horseName: string | null;
  rank: number | null;
  score: number | null;
  winProb: number | null;
  realOdds: number | null;
  placeOdds: number | null;
  placeProb: number | null;
  placeScore: number | null;
  valueScore: number | null;
  selectionMethod?: "rank2" | "light_adjusted" | "legacy_value" | "stable_next";
  selectionReason?: string | null;
  overbetLabel?: string | null;
  scoreGap?: number | null;
  runnerUpHorseId?: string | null;
  runnerUpHorseName?: string | null;
  runnerUpPlaceScore?: number | null;
  runnerUpPlaceProb?: number | null;
  settlementStatus?: "pending_result" | "pending_payouts" | "settled";
  // Prediction-time classification hint.
  // Indicates whether this honmei candidate leans toward win, place, or skip.
  // This is set at prediction time and is NOT a retrospective confirmed label.
  // Legacy records without this field are treated as "unclassified".
  classificationHint?: PickClassificationHint;
  // Display/evaluation betting action separated from legacy pickType/settlement buckets.
  // Derived from prediction-time classificationHint when present; legacy records may be "unknown".
  recommendedBetAction?: RecommendedBetAction;
  recommendedBetDecision?: RecommendedBetDecision;
  tanOutcome?: "not_settled" | "hit" | "miss" | "hit_missing_payout";
  fukuOutcome?: "not_settled" | "hit" | "miss" | "hit_missing_payout";
  tanPayout?: number;
  fukuPayout?: number;
  tanPayoutSource?: "official" | "missing";
  fukuPayoutSource?: "official" | "missing";
}

export interface ReviewPairMetrics {
  honmeiHorseId: string | null;
  opponentHorseId: string | null;
  rankGap: number | null;
  scoreGap: number | null;
  sameTop3: boolean | null;
  wideOutcome: "not_settled" | "hit" | "miss" | "hit_missing_payout";
  widePayout: number;
  widePayoutSource: "official" | "missing";
}

export interface ReviewLegacyValueSelection {
  horseId: string;
  horseName: string | null;
  fukuOutcome: "not_settled" | "hit" | "miss" | "hit_missing_payout";
  fukuPayout: number;
  fukuPayoutSource: "official" | "missing";
}

export interface RaceReviewRecord {
  raceId: string;
  courseId: string;
  status: ReviewProcessingStatus;
  reviewReady: boolean;
  compatibilityMode: ReviewCompatibilityMode;
  createdAt: string;
  updatedAt: string;
  snapshotTakenAt: string | null;
  snapshotSourceStatus?: PredictionSnapshotSourceStatus | null;
  livePreRaceEligible?: boolean;
  resultFetchedAt: string | null;
  payoutFetchedAt: string | null;
  lastTriedAt: string | null;
  lastRetryAt: string | null;
  nextRetryAt: string | null;
  retryCount: number;
  missingReasons: ReviewMissingReason[];
  lastError: string | null;
  meta: ReviewRaceMeta;
  snapshot: PredictionSnapshot | null;
  expectation: PredictionSnapshotExpectation | null;
  honmei: ReviewSelectionHorse | null;
  opponent: ReviewSelectionHorse | null;
  wide: ReviewSelectionHorse | null;
  legacyValue: ReviewLegacyValueSelection | null;
  actualWinnerHorseId: string | null;
  actualTop3HorseIds: string[];
  pair: ReviewPairMetrics;
}

export interface ReviewRecordStore {
  version: 1;
  generatedAt: string;
  records: Record<string, RaceReviewRecord>;
}

export type WeeklyDiagnosticsPopularityBandKey = "top3" | "mid" | "longshot";

export interface WeeklyDiagnosticsMeta {
  weekKey: string;
  generatedAt: string;
  aggregationScope: DiagnosticsAggregationScope;
  sourceStatusSummary?: ReviewSourceStatusSummary;
  scoringVersion: string | null;
  modelVersion: string | null;
  scoringConfigHash: string | null;
  scoringVersions: string[];
  modelVersions: string[];
  scoringConfigHashes: string[];
  raceCount: number;
  settledRaceCount: number;
  dateRange: {
    start: string | null;
    end: string | null;
  };
}

export interface WeeklyDiagnosticsRankStat {
  rank: 1 | 2 | 3;
  raceCount: number;
  placeHitCount: number;
  placeRate: number;
}

export interface WeeklyDiagnosticsPlaceCore {
  snapshotHonmei: {
    raceCount: number;
    placeHitCount: number;
    placeRate: number;
  };
  routineHonmei: {
    raceCount: number;
    placeHitCount: number;
    placeRate: number;
    placeReturnRate: number;
  };
  snapshotRanks: WeeklyDiagnosticsRankStat[];
}

export interface WeeklyDiagnosticsPopularityBand {
  band: WeeklyDiagnosticsPopularityBandKey;
  raceCount: number;
  placeHitCount: number;
  placeRate: number;
  placeReturnRate: number;
}

export interface WeeklyDiagnosticsValueCore {
  raceCount: number;
  skippedCount: number;
  placeHitCount: number;
  placeRate: number;
  placeReturnRate: number;
  candidateRate: number;
  popularityBands: WeeklyDiagnosticsPopularityBand[];
  longshot: {
    raceCount: number;
    placeHitCount: number;
    placeRate: number;
    placeReturnRate: number;
  };
}

export interface WeeklyDiagnosticsAgreement {
  raceCount: number;
  sameHonmeiCount: number;
  agreementRate: number;
  samePlaceRate: number;
  disagreementSnapshotPlaceRate: number;
  disagreementRoutinePlaceRate: number;
}

export interface WeeklyDiagnosticsWidePairStats {
  targetRaceCount: number;
  valueCandidateRaceCount: number;
  settledRaceCount: number;
  pendingRaceCount: number;
  hitCount: number;
  hitRate: number;
  totalStake: number;
  totalPayout: number;
  returnRate: number;
  averagePayout: number;
  pendingDetails: WeeklyDiagnosticsWidePendingDetail[];
}

export interface WeeklyDiagnosticsWideBoxStats {
  targetRaceCount: number;
  settledRaceCount: number;
  pendingRaceCount: number;
  hitRaceCount: number;
  hitRate: number;
  totalStake: number;
  totalPayout: number;
  returnRate: number;
  averagePayout: number;
  pendingDetails: WeeklyDiagnosticsWidePendingDetail[];
}

export type WeeklyDiagnosticsWideStrategyKey =
  | "tanpukuHonmeiValueCandidate"
  | "simHonmeiTanpukuHonmeiValueCandidateBox";

export interface WeeklyDiagnosticsWidePendingDetail {
  raceKey: string;
  strategyKey: WeeklyDiagnosticsWideStrategyKey;
  pendingReason: string;
  missingTargetFields: string[];
  missingFinisherFields: string[];
}

export interface WeeklyDiagnosticsWideStats {
  tanpukuHonmeiValueCandidate: WeeklyDiagnosticsWidePairStats;
  simHonmeiTanpukuHonmeiValueCandidateBox: WeeklyDiagnosticsWideBoxStats;
}

export type WeeklyDiagnosticsMissTag =
  | "rank_error"
  | "market_overfade"
  | "place_prob_overestimate"
  | "longshot_overreach"
  | "value_misallocation"
  | "top3_total_miss"
  | "data_insufficient";

export interface WeeklyDiagnosticsMissTagDetail {
  tag: WeeklyDiagnosticsMissTag;
  reason: string;
  evidence: Record<string, number | string | boolean | null>;
}

export interface WeeklyDiagnosticsRaceMiss {
  raceId: string;
  courseId: string;
  label: string;
  date: string;
  raceNumber: number | null;
  isSpecialRace: boolean;
  isFinalRace: boolean;
  isJumpRace: boolean;
  raceSegment: RaceSegment;
  primaryMissTag: WeeklyDiagnosticsMissTag | null;
  missTags: WeeklyDiagnosticsMissTag[];
  missTagDetails: WeeklyDiagnosticsMissTagDetail[];
}

export interface WeeklyDiagnosticsMissTagCount {
  tag: WeeklyDiagnosticsMissTag;
  raceCount: number;
  rate: number;
}

export interface WeeklyDiagnosticsMissTagSummary {
  missRaceCount: number;
  primary: WeeklyDiagnosticsMissTagCount[];
  all: WeeklyDiagnosticsMissTagCount[];
  races: WeeklyDiagnosticsRaceMiss[];
}

export interface WeeklyDiagnosticsSegmentSummary {
  key: RaceDiagnosticsSegmentKey;
  label: string;
  raceCount: number;
  settledRaceCount: number;
  placeCore: WeeklyDiagnosticsPlaceCore;
  valueCore: WeeklyDiagnosticsValueCore;
  wideStats: WeeklyDiagnosticsWideStats;
  agreement: WeeklyDiagnosticsAgreement;
  disagreement: {
    raceCount: number;
    snapshotPlaceRate: number;
    routinePlaceRate: number;
    valuePlaceCount: number;
    snapshotOnlyPlaceCount: number;
    routineOnlyPlaceCount: number;
  };
  missDiagnostics: WeeklyDiagnosticsMissTagSummary;
}

export interface WeeklyDiagnosticsRepresentativeRace {
  raceId: string;
  courseId: string;
  label: string;
  date: string;
  raceNumber: number | null;
  isSpecialRace: boolean;
  isFinalRace: boolean;
  isJumpRace: boolean;
  raceSegment: RaceSegment;
  category: "best_hit" | "worst_miss" | "disagreement" | "value_hit";
  resultTop3HorseIds: string[];
  resultTop3HorseNames: string[];
  snapshotHonmeiHorseId: string | null;
  snapshotHonmeiHorseName: string | null;
  snapshotHonmeiPlaced: boolean | null;
  routineHonmeiHorseId: string | null;
  routineHonmeiHorseName: string | null;
  routineHonmeiPlaced: boolean | null;
  valueHorseId: string | null;
  valueHorseName: string | null;
  valuePlaced: boolean | null;
  valueReturnRate: number | null;
  primaryMissTag: WeeklyDiagnosticsMissTag | null;
  missTags: WeeklyDiagnosticsMissTag[];
  missTagDetails: WeeklyDiagnosticsMissTagDetail[];
  reviewSummary: string | null;
}

export interface WeeklyDiagnosticsSignals {
  snapshotHonmeiUnderperformsRoutineHonmei: boolean;
  secondRankOutperformsFirstRank: boolean;
  thirdRankOutperformsFirstRank: boolean;
  valueCandidateWorksBetterInLongshots: boolean;
  agreementImprovesPlaceRate: boolean;
  disagreementFavoursRoutine: boolean;
  disagreementFavoursSnapshot: boolean;
}

export type WeeklyDiagnosticRecommendationCategory =
  | "place_core"
  | "value_core"
  | "agreement"
  | "ranking"
  | "longshot"
  | "data_quality";

export type WeeklyDiagnosticRecommendationTargetStyle =
  | "place_hit_rate"
  | "place_return_rate"
  | "balanced"
  | "sample_quality";

export type WeeklyDiagnosticRecommendationPriority = "high" | "medium" | "low";
export type WeeklyDiagnosticRecommendationAction =
  | "collect_live_pre_race_sample"
  | "inspect_retrospective_only"
  | "logic_review_candidate";

export interface ReviewSourceStatusSummary {
  totalRecords: number;
  reviewReadyRecords: number;
  livePreRaceRecords: number;
  retrospectiveRecords: number;
  manualSnapshotRecords: number;
  unknownLegacyRecords: number;
  livePreRaceEligibleTrue: number;
  livePreRaceEligibleFalse: number;
}

export interface PredictionSnapshotSourceStatusSummary {
  totalSnapshots: number;
  livePreRaceSnapshots: number;
  retrospectiveSnapshots: number;
  manualSnapshotSnapshots: number;
  unknownLegacySnapshots: number;
  livePreRaceEligibleTrue: number;
  livePreRaceEligibleFalse: number;
}

export interface WeeklyDiagnosticRecommendation {
  id: string;
  category: WeeklyDiagnosticRecommendationCategory;
  targetStyle: WeeklyDiagnosticRecommendationTargetStyle;
  priority: WeeklyDiagnosticRecommendationPriority;
  recommendationAction?: WeeklyDiagnosticRecommendationAction;
  title: string;
  summary: string;
  evidence: Record<string, number | string | boolean | null>;
  metricSignals: string[];
}

export interface WeeklyDiagnosticsMissPatternCounts {
  rankError: number;
  top3TotalMiss: number;
  valueRescueHit: number;
  honmeiAndValueMiss: number;
}

export interface WeeklyDiagnosticsMarketHeatCounts {
  honmeiOverbetCount: number;
  honmeiOverbetPlaceHitCount: number;
  honmeiNonOverbetCount: number;
  honmeiNonOverbetPlaceHitCount: number;
}

export interface WeeklyDiagnosticsExpectationGradeBucket {
  grade: ExpectationGrade;
  raceCount: number;
  placeHitCount: number;
  placeRate: number;
}

export interface WeeklyDiagnosticsExpectationGradeStats {
  raceCount: number;
  settledRaceCount: number;
  buckets: WeeklyDiagnosticsExpectationGradeBucket[];
}

export interface WeeklyDiagnosticsExpectationGradeCounts {
  simulationLeader: WeeklyDiagnosticsExpectationGradeStats;
  tanpukuHonmei: WeeklyDiagnosticsExpectationGradeStats;
}

export interface WeeklyDiagnosticsEvaluation {
  primaryKpis: {
    tanpukuHonmeiPlaceHitRate: number;
    tanpukuHonmeiPlaceRoi: number;
  };
  secondaryKpis: {
    sim1VsSim2PlaceGap: number | null;
    honmeiValueDivergenceRate: number | null;
    missPatternCounts: WeeklyDiagnosticsMissPatternCounts;
    marketHeatCounts: WeeklyDiagnosticsMarketHeatCounts;
    expectationGradeCounts: WeeklyDiagnosticsExpectationGradeCounts;
  };
}

export interface WeeklyDiagnosticsStoreEntry {
  storeKey: string;
  weekKey: string;
  aggregationScope: DiagnosticsAggregationScope;
  scoringVersion: string | null;
  modelVersion: string | null;
  scoringConfigHash: string | null;
  savedAt: string;
  diagnostics: WeeklyDiagnostics;
}

export interface WeeklyDiagnosticsStore {
  entries: WeeklyDiagnosticsStoreEntry[];
}

export interface WeeklyDiagnosticsComparisonSummary {
  current: {
    weekKey: string;
    aggregationScope: DiagnosticsAggregationScope;
    scoringVersion: string | null;
    modelVersion: string | null;
    scoringConfigHash: string | null;
  };
  previous: {
    weekKey: string;
    aggregationScope: DiagnosticsAggregationScope;
    scoringVersion: string | null;
    modelVersion: string | null;
    scoringConfigHash: string | null;
  } | null;
  deltas: {
    snapshotHonmeiPlaceRateDelta: number | null;
    routineHonmeiPlaceRateDelta: number | null;
    valuePlaceReturnRateDelta: number | null;
    agreementRateDelta: number | null;
  };
}

export interface WeeklyDiagnostics {
  meta: WeeklyDiagnosticsMeta;
  placeCore: WeeklyDiagnosticsPlaceCore;
  valueCore: WeeklyDiagnosticsValueCore;
  wideStats: WeeklyDiagnosticsWideStats;
  agreement: WeeklyDiagnosticsAgreement;
  disagreement: {
    raceCount: number;
    snapshotPlaceRate: number;
    routinePlaceRate: number;
    valuePlaceCount: number;
    snapshotOnlyPlaceCount: number;
    routineOnlyPlaceCount: number;
  };
  representativeRaces: {
    bestHits: WeeklyDiagnosticsRepresentativeRace[];
    worstMisses: WeeklyDiagnosticsRepresentativeRace[];
    disagreementCases: WeeklyDiagnosticsRepresentativeRace[];
    valueHits: WeeklyDiagnosticsRepresentativeRace[];
  };
  missDiagnostics: WeeklyDiagnosticsMissTagSummary;
  segments: Record<RaceDiagnosticsSegmentKey, WeeklyDiagnosticsSegmentSummary>;
  signals: WeeklyDiagnosticsSignals;
  evaluation: WeeklyDiagnosticsEvaluation;
  recommendations: WeeklyDiagnosticRecommendation[];
}

export interface RaceCommentarySimHorse {
  rank: number;
  horseId: string;
  horseName: string;
  winProb: number;
  fairOdds: number | null;
  realOdds: number | null;
}

export interface RaceCommentaryActualHorse {
  position: number;
  horseId: string | null;
  horseName: string;
  popularity: number | null;
  odds: number | null;
}

export interface RaceCommentaryPayoutItem {
  horseNumber: number;
  payout: number;
}

export interface RaceCommentaryPayouts {
  tansho: RaceCommentaryPayoutItem[];
  fukusho: RaceCommentaryPayoutItem[];
}

export interface RaceCommentaryPayload {
  raceId: string;
  courseId: string;
  raceLabel: string;
  raceNumber: number | null;
  isSpecialRace: boolean;
  isFinalRace: boolean;
  isJumpRace: boolean;
  raceSegment: RaceSegment;
  simHonmeiHorseId: string | null;
  simSecondHorseId: string | null;
  simThirdHorseId: string | null;
  snapshotTop3: RaceCommentarySimHorse[];
  actualTop3: RaceCommentaryActualHorse[];
  payouts: RaceCommentaryPayouts | null;
  resultPattern: string;
  primaryMissTag: WeeklyDiagnosticsMissTag | null;
  missTags: WeeklyDiagnosticsMissTag[];
  missTagDetails: WeeklyDiagnosticsMissTagDetail[];
  marketFadeCandidate: {
    horseId: string | null;
    reason: string | null;
  } | null;
  marketGapComment: string | null;
  marketOverbetSignal: boolean;
  summaryComment: string;
}

export interface WeeklyNoteSummaryBlock {
  key:
    | "weekly_overview"
    | "place_core"
    | "segments"
    | "value_core"
    | "miss_tags"
    | "snapshot_ranks"
    | "popularity_trends"
    | "market_heat"
    | "disagreement_review"
    | "comparison"
    | "best_hits"
    | "worst_misses"
    | "next_actions";
  title: string;
  points: string[];
}

export interface WeeklyNotePayload {
  weekKey: string;
  generatedAt: string;
  diagnostics: WeeklyDiagnostics;
  recommendations: WeeklyDiagnosticRecommendation[];
  comparison: WeeklyDiagnosticsComparisonSummary | null;
  summaryBlocks: WeeklyNoteSummaryBlock[];
  representativeRaces: {
    bestHits: RaceCommentaryPayload[];
    worstMisses: RaceCommentaryPayload[];
    disagreementCases: RaceCommentaryPayload[];
    valueHits: RaceCommentaryPayload[];
  };
  raceCommentaries: RaceCommentaryPayload[];
}

export interface WeeklyNoteDraft {
  weekKey: string;
  generatedAt: string;
  format: "markdown" | "text";
  content: string;
}
