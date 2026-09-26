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
