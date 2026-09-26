import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyVerdictThread, countXWeightedChars, selectWinCandidate } from "../lib/dailyVerdictThread.mjs";

test("eight daily verdicts split by venue under the X weighted limit", () => {
  const rows = Array.from({ length: 8 }, (_, index) => ({
    venue: index < 4 ? "中山" : "阪神",
    raceNumber: 8 + index % 4,
    raceName: `長いレース名${index}特別競走`,
    horseName: `テストホース${index}`,
    classification: (index % 2 ? "place" : "win") as "place" | "win",
    fieldComplete: true,
  }));
  const posts = buildDailyVerdictThread(rows, { date: "2026-09-26" });
  assert.equal(posts.length, 2);
  assert.ok(posts[0].includes("中山8R"));
  assert.ok(posts[1].includes("阪神8R"));
  assert.ok(posts.every((post) => countXWeightedChars(post) <= 280));
});

test("incomplete fields are listed without a betting verdict", () => {
  const [post] = buildDailyVerdictThread([{
    venue: "中山", raceNumber: 9, raceName: "芙蓉ステークス",
    horseName: "参考馬", classification: "win", fieldComplete: false,
  }], { date: "2026-09-26" });
  assert.match(post, /中山9R 芙蓉ステークス データ不完全のため判定なし/);
  assert.ok(!post.includes("参考馬"));
});

test("started race is labeled while a later race keeps its verdict", () => {
  const [post] = buildDailyVerdictThread([
    { venue: "中山", raceNumber: 9, raceName: "先のレース", raceStatus: "started",
      horseName: "古い本命", classification: "win", fieldComplete: true },
    { venue: "中山", raceNumber: 10, raceName: "次のレース", raceStatus: null,
      horseName: "新しい本命", classification: "place", fieldComplete: true },
  ], { date: "2026-09-26" });
  assert.match(post, /中山9R 先のレース 発走済み/);
  assert.doesNotMatch(post, /古い本命/);
  assert.match(post, /中山10R 次のレース ◎新しい本命 抑え/);
});

test("missing saved verdict is shown without an inferred action", () => {
  const [post] = buildDailyVerdictThread([{
    venue: "阪神", raceNumber: 11, raceName: "対象レース", raceStatus: "missing_snapshot",
    horseName: null, classification: null, fieldComplete: true,
  }], { date: "2026-09-26" });
  assert.match(post, /阪神11R 対象レース 事前判定未取得/);
});

test("no win verdict yields no per-race recommendation candidate", () => {
  const candidates = [
    { fieldComplete: true, simBestHorse: { score: 100 }, tanpuku: { winPick: { classificationHint: { classification: "place" } } } },
    { fieldComplete: true, simBestHorse: { score: 90 }, tanpuku: { winPick: { classificationHint: { classification: "skip" } } } },
    { fieldComplete: false, simBestHorse: { score: 120 }, tanpuku: { winPick: { classificationHint: { classification: "win" } } } },
  ];
  assert.equal(selectWinCandidate(candidates), null);
  const win = { fieldComplete: true, simBestHorse: { score: 80 }, tanpuku: { winPick: { classificationHint: { classification: "win" } } } };
  assert.equal(selectWinCandidate([...candidates, win]), win);
});
