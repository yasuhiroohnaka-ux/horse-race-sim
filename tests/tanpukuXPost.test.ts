import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTanpukuPreRacePostText,
  type CategoryReturnStatForPost,
} from "../lib/tanpukuXPost";

const horses = [
  { horseName: "ダイヤモンドノット", mark: "◎" as const, markNote: "単複本命" },
  { horseName: "カヴァレリッツォ", mark: "○" as const, markNote: "相手候補" },
  { horseName: "ロデオドライブ", mark: "▲" as const, markNote: "試走1位" },
];

function stats(g1RaceCount: number): CategoryReturnStatForPost[] {
  return [
    {
      key: "g1_only",
      raceCount: g1RaceCount,
      tanReturnRate: 214,
      fukuReturnRate: 112,
    },
    {
      key: "open_extended",
      raceCount: 53,
      tanReturnRate: 116.2,
      fukuReturnRate: 94,
    },
  ];
}

function build(overrides: Partial<Parameters<typeof buildTanpukuPreRacePostText>[0]> = {}) {
  return buildTanpukuPreRacePostText({
    raceName: "NHKマイルC",
    hashtag: "#NHKマイルC",
    topHorses: horses,
    categoryReturnStats: stats(5),
    ...overrides,
  });
}

test("G1 count below 10 is labeled as reference value", () => {
  const text = build({ categoryReturnStats: stats(5) });
  assert.match(text, /G1のみは5Rの参考値ながら/);
});

test("G1 count below 30 is labeled as under verification", () => {
  const text = build({ categoryReturnStats: stats(20) });
  assert.match(text, /G1のみは20Rの検証中データで/);
});

test("G1 count 30 or above is labeled as aggregated", () => {
  const text = build({ categoryReturnStats: stats(30) });
  assert.match(text, /G1のみは30Rの集計で/);
});

test("top three tanpuku selections are inserted as marks", () => {
  const text = build();
  assert.match(text, /◎ダイヤモンドノット ※単複本命/);
  assert.match(text, /○カヴァレリッツォ ※相手候補/);
  assert.match(text, /▲ロデオドライブ ※試走1位/);
});

test("post does not use decisive conclusion wording", () => {
  const text = build();
  for (const banned of ["結論", "最終結論", "確定", "本命確定", "的中保証", "勝率保証"]) {
    assert.equal(text.includes(banned), false, `${banned} should not be included`);
  }
});

test("post is generated without archive category stats", () => {
  const text = build({ categoryReturnStats: null });
  assert.match(text, /単複回収率重視のエンジンです。/);
  assert.equal(text.includes("人気より条件適性。"), false);
  assert.equal(text.includes("G1のみ"), false);
});

test("long full post falls back to short template", () => {
  const text = build({
    topHorses: [
      { horseName: "とても長い名前のテストホース一号" },
      { horseName: "とても長い名前のテストホース二号" },
      { horseName: "とても長い名前のテストホース三号" },
    ],
    maxLength: 170,
  });

  assert.match(text, /単複回収率重視。/);
  assert.equal(text.includes("単複回収率重視のエンジンです。"), false);
  assert.ok(Array.from(text).length <= 280);
});

test("trial rank wording is used only for the distinct trial leader mark", () => {
  const text = build();

  const markedLines = text.split("\n").filter((line) => /[◎○▲]/.test(line));
  assert.deepEqual(markedLines, [
    "◎ダイヤモンドノット ※単複本命",
    "○カヴァレリッツォ ※相手候補",
    "▲ロデオドライブ ※試走1位",
  ]);
});

test("trial leader mark can be omitted without rendering a placeholder", () => {
  const text = build({
    topHorses: horses.slice(0, 2),
  });

  const markedLines = text.split("\n").filter((line) => /[◎○▲]/.test(line));
  assert.deepEqual(markedLines, [
    "◎ダイヤモンドノット ※単複本命",
    "○カヴァレリッツォ ※相手候補",
  ]);
  assert.equal(text.includes("▲"), false);
  assert.equal(text.includes("試走1位"), false);
});

test("post ending does not add popularity-over-fit slogan", () => {
  const text = build();
  assert.equal(text.includes("人気より適正重視"), false);
  assert.equal(text.includes("人気より条件適性。"), false);
  assert.equal(text.includes("シミュ1位"), false);
});

test("wide recommendation line appears in full post when recommended", () => {
  const text = build({
    wideRecommendation: {
      recommended: true,
      horseNames: ["ダイヤモンドノット", "カヴァレリッツォ"],
      reason: "place分類",
    },
  });
  assert.match(text, /ワイド: ◎ダイヤモンドノット×○カヴァレリッツォ/);
});

test("skip classification adds cautionary wording in full post", () => {
  const text = build({
    classificationHint: {
      classification: "skip",
      confidence: 0.65,
      reason: "少頭数",
    },
  });
  assert.match(text, /見送り寄りの読み/);
});

test("post with wide recommendation and skip still fits within 280 chars", () => {
  const text = build({
    wideRecommendation: {
      recommended: true,
      horseNames: ["ダイヤモンドノット", "カヴァレリッツォ"],
      reason: "place分類",
    },
    classificationHint: {
      classification: "place",
      confidence: 0.6,
    },
  });
  assert.ok(Array.from(text).length <= 280, `text length ${Array.from(text).length} exceeds 280`);
});
