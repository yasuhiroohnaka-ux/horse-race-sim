import assert from "node:assert/strict";
import test from "node:test";
import { buildPreRacePostPayload } from "../lib/xPostPayload.mjs";
import { buildDailyVerdictThread } from "../lib/dailyVerdictThread.mjs";
import { liveSnapshotForRace, selectSnapshotWinCandidate } from "../lib/snapshotRecommendation.mjs";

const race = {
  raceId: "209901010111", raceDate: "2099-01-01", courseId: "tokyo-turf-1600-209901010111",
  label: "保存判定テスト", hashtag: "#保存判定テスト",
  horses: [
    { id: "1", name: "保存本命", realOdds: 3.8 },
    { id: "2", name: "相手", realOdds: 2.0 },
  ],
};
const snapshot = {
  snapshotId: "morning-1", raceId: race.raceId, raceDate: race.raceDate,
  capturedAt: "2099-01-01T00:00:00+09:00",
  scheduledStartTime: "2099-01-01T15:00:00+09:00",
  sourceStatus: "live_pre_race", predictionOrigin: "saved_live",
  livePreRaceEligible: true, scoringVersion: "tanpuku-win-v3.1",
  honmeiHorseId: "1", opponentHorseId: "2", valueHorseId: null,
  rankedRows: [
    { horseId: "2", horseName: "相手", rank: 1, score: 82, realOdds: 4.0, oddsSource: "official" },
    { horseId: "1", horseName: "保存本命", rank: 2, score: 80, realOdds: 4.2, oddsSource: "official" },
  ],
  selectionLog: { entries: [
    { role: "simulation_leader", horseId: "2", horseName: "相手" },
    { role: "honmei", horseId: "1", horseName: "保存本命", realOdds: 4.2,
      placeProb: 0.6, placeScore: 0.55, classificationHint: { classification: "win" },
      recommendedBetDecision: { action: "win", confidence: "medium", reasons: [], riskFlags: [], source: "explicit_live_rule" } },
    { role: "opponent", horseId: "2", horseName: "相手", placeProb: 0.5, placeScore: 0.4 },
  ] },
};

test("per-race post uses the saved morning decision and odds despite later race changes", () => {
  const reviewStore = { records: { [race.raceId]: { snapshot } } };
  const candidate = selectSnapshotWinCandidate([race], reviewStore, "tanpuku-win-v3.1");
  assert.ok(candidate);
  assert.equal(candidate.snapshot.snapshotId, "morning-1");
  assert.equal(candidate.tanpuku.winPick.horse.realOdds, 4.2);
  assert.equal(candidate.race.horses[0].realOdds, 4.0);
  const post = buildPreRacePostPayload({ day: "Sat", race: candidate.race,
    tanpukuPair: candidate.tanpuku, simBestHorse: candidate.simBestHorse });
  assert.equal(post.tanpukuHonmei.recommendedBetAction, "win");
  assert.deepEqual(post.tanpukuHonmei.recommendedBetDecision,
    snapshot.selectionLog.entries[1].recommendedBetDecision);
  const [dailyPost] = buildDailyVerdictThread([{
    venue: "東京", raceNumber: 11, raceName: race.label,
    horseName: candidate.tanpuku.winPick.horse.name,
    classification: candidate.tanpuku.winPick.classificationHint.classification,
    fieldComplete: true,
  }], { date: race.raceDate });
  assert.match(dailyPost, /保存本命 単勝勝負/);
});

test("missing or retrospective snapshot never falls back to a fresh verdict", () => {
  assert.equal(selectSnapshotWinCandidate([race], { records: {} }, "tanpuku-win-v3.1"), null);
  const retrospective = { ...snapshot, sourceStatus: "retrospective" };
  const reviewStore = { records: { [race.raceId]: { snapshot: retrospective } } };
  assert.equal(liveSnapshotForRace(reviewStore, race, "tanpuku-win-v3.1"), null);
  assert.equal(selectSnapshotWinCandidate([race], reviewStore, "tanpuku-win-v3.1"), null);
});
