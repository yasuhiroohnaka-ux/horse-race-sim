import type { RaceTrendProfile, TrendHintRecord } from "@/lib/types";

function stats(record: TrendHintRecord, winRate: number, place2Rate: number, place3Rate: number) {
  return {
    record,
    winRate,
    place2Rate,
    place3Rate,
  };
}

const NZT_ALIASES = [
  "ニュージーランドT",
  "ニュージーランドＴ",
  "ニュージーランドトロフィー",
  "NZT",
];

const CHURCHILL_DOWNS_ALIASES = [
  "チャーチルダウンズC",
  "チャーチルダウンズＣ",
  "チャーチルダウンズカップ",
  "アーリントンC",
  "アーリントンＣ",
  "アーリントンカップ",
];

export const RACE_TREND_PROFILES: RaceTrendProfile[] = [
  {
    raceKey: "nhk-mile-c",
    raceName: "NHKマイルC",
    course: "東京芝1600",
    courseIds: ["nhk-mile-c"],
    matchRaceNames: ["NHKマイル", "NHKマイルC", "ＮＨＫマイル", "ＮＨＫマイルＣ"],
    notes: [
      "Aコース最終週で行われるため、内の傷みや外差し傾向に注意。ただし枠だけで大きく評価を変えない。",
    ],
    trendHints: [
      {
        id: "nhk-mile-previous-race-nzt",
        type: "previousRace",
        label: "前走ニュージーランドT組",
        condition: {
          previousRaceNames: NZT_ALIASES,
        },
        stats: stats({ win: 2, second: 2, third: 2, out: 36 }, 0.048, 0.095, 0.143),
        adjustment: -0.015,
        confidence: 0.4,
        explanation:
          "前走ニュージーランドT組は出走数のわりに勝ち切りが少ないため、過信注意。ただし個別の内容次第。",
      },
      {
        id: "nhk-mile-previous-race-satsuki-sho",
        type: "previousRace",
        label: "前走皐月賞組",
        condition: {
          previousRaceNames: ["皐月賞"],
        },
        stats: stats({ win: 2, second: 2, third: 0, out: 9 }, 0.154, 0.308, 0.308),
        adjustment: 0.025,
        confidence: 0.45,
        explanation:
          "皐月賞組はサンプルは多くないが好走率が高め。G1経験・馬の質を軽く評価。",
      },
      {
        id: "nhk-mile-previous-race-falcon-s",
        type: "previousRace",
        label: "前走ファルコンS組",
        condition: {
          previousRaceNames: ["ファルコンS", "ファルコンＳ", "ファルコンステークス"],
        },
        stats: stats({ win: 2, second: 0, third: 2, out: 21 }, 0.08, 0.08, 0.16),
        adjustment: 0.005,
        confidence: 0.35,
        explanation:
          "ファルコンS組は勝ち馬も出ているが、連対率は控えめ。短距離寄りの適性を個別に見る。",
      },
      {
        id: "nhk-mile-previous-race-churchill-downs-c",
        type: "previousRace",
        label: "前走チャーチルダウンズC組",
        condition: {
          previousRaceNames: CHURCHILL_DOWNS_ALIASES,
        },
        stats: stats({ win: 1, second: 0, third: 5, out: 29 }, 0.029, 0.029, 0.171),
        adjustment: -0.005,
        confidence: 0.35,
        explanation:
          "チャーチルダウンズCは旧アーリントンCを含む。複勝圏はあるが勝ち切りは少なく、補正は控えめ。",
      },
      {
        id: "nhk-mile-previous-race-mainichi-hai",
        type: "previousRace",
        label: "前走毎日杯組",
        condition: {
          previousRaceNames: ["毎日杯"],
        },
        stats: stats({ win: 0, second: 2, third: 0, out: 6 }, 0, 0.25, 0.25),
        adjustment: 0.01,
        confidence: 0.3,
        explanation:
          "毎日杯組はサンプルが少ないが連対例あり。距離短縮や質の高さを軽く見る程度に留める。",
      },
      {
        id: "nhk-mile-previous-race-asahi-hai-fs",
        type: "previousRace",
        label: "前走朝日杯FS組",
        condition: {
          previousRaceNames: ["朝日杯FS", "朝日杯ＦＳ"],
        },
        stats: stats({ win: 0, second: 0, third: 0, out: 2 }, 0, 0, 0),
        adjustment: -0.005,
        confidence: 0.2,
        explanation:
          "前走朝日杯FS組は該当例が少なく好走なし。サンプルが極小のため、評価はほぼ動かさない。",
      },
      {
        id: "nhk-mile-frame-1",
        type: "frameBias",
        label: "1枠は過信注意",
        condition: { frameNumbers: [1] },
        stats: stats({ win: 0, second: 1, third: 0, out: 19 }, 0, 0.05, 0.05),
        adjustment: 0,
        adjustmentMode: "explanationOnly",
        confidence: 0.4,
        explanation:
          "1枠は過去10年で勝ち切れておらず複勝率も低め。枠は既存ロジックも見ているため、trendでは説明タグに留める。",
      },
      {
        id: "nhk-mile-frame-2",
        type: "frameBias",
        label: "2枠は標準寄り",
        condition: { frameNumbers: [2] },
        stats: stats({ win: 1, second: 2, third: 1, out: 16 }, 0.05, 0.15, 0.2),
        adjustment: 0,
        adjustmentMode: "explanationOnly",
        confidence: 0.3,
        explanation:
          "2枠は複勝率が一定水準。枠は既存ロジックも見ているため、trendでは説明タグに留める。",
      },
      {
        id: "nhk-mile-frame-3",
        type: "frameBias",
        label: "3枠は複勝圏まで",
        condition: { frameNumbers: [3] },
        stats: stats({ win: 0, second: 1, third: 3, out: 16 }, 0, 0.05, 0.2),
        adjustment: 0,
        adjustmentMode: "explanationOnly",
        confidence: 0.3,
        explanation:
          "3枠は勝ち切りなしだが複勝例はある。枠は既存ロジックも見ているため、trendでは説明タグに留める。",
      },
      {
        id: "nhk-mile-frame-4",
        type: "frameBias",
        label: "4枠は苦戦傾向",
        condition: { frameNumbers: [4] },
        stats: stats({ win: 0, second: 0, third: 1, out: 19 }, 0, 0, 0.05),
        adjustment: 0,
        adjustmentMode: "explanationOnly",
        confidence: 0.4,
        explanation:
          "4枠は過去傾向では連対なし。枠は既存ロジックも見ているため、trendでは説明タグに留める。",
      },
      {
        id: "nhk-mile-frame-5",
        type: "frameBias",
        label: "5枠は複勝率高め",
        condition: { frameNumbers: [5] },
        stats: stats({ win: 0, second: 3, third: 3, out: 14 }, 0, 0.15, 0.3),
        adjustment: 0,
        adjustmentMode: "explanationOnly",
        confidence: 0.4,
        explanation:
          "5枠は勝ちはないが複勝率が高め。枠は既存ロジックも見ているため、trendでは説明タグに留める。",
      },
      {
        id: "nhk-mile-frame-6",
        type: "frameBias",
        label: "6枠は勝率高め",
        condition: { frameNumbers: [6] },
        stats: stats({ win: 4, second: 0, third: 0, out: 15 }, 0.211, 0.211, 0.211),
        adjustment: 0,
        adjustmentMode: "explanationOnly",
        confidence: 0.45,
        explanation:
          "6枠は勝率が目立つ。ただし枠は既存ロジックも見ているため、trendでは説明タグに留める。",
      },
      {
        id: "nhk-mile-frame-7",
        type: "frameBias",
        label: "7枠は控えめ",
        condition: { frameNumbers: [7] },
        stats: stats({ win: 1, second: 2, third: 0, out: 27 }, 0.033, 0.1, 0.1),
        adjustment: 0,
        adjustmentMode: "explanationOnly",
        confidence: 0.3,
        explanation:
          "7枠は好走数がやや控えめ。枠は既存ロジックも見ているため、trendでは説明タグに留める。",
      },
      {
        id: "nhk-mile-frame-8",
        type: "frameBias",
        label: "8枠は勝率高め",
        condition: { frameNumbers: [8] },
        stats: stats({ win: 4, second: 1, third: 2, out: 23 }, 0.133, 0.167, 0.233),
        adjustment: 0,
        adjustmentMode: "explanationOnly",
        confidence: 0.45,
        explanation:
          "8枠は過去傾向で勝ち切りが目立つ。枠は既存ロジックも見ているため、trendでは説明タグに留める。",
      },
      {
        id: "nhk-mile-gate-single-digit",
        type: "gateBias",
        label: "一桁馬番は勝率控えめ",
        condition: { gateNumberMax: 9 },
        stats: stats({ win: 1, second: 5, third: 5, out: 79 }, 0.011, 0.067, 0.122),
        adjustment: 0,
        adjustmentMode: "explanationOnly",
        confidence: 0.4,
        explanation:
          "一桁馬番は過去10年で勝率が低め。馬番は既存ロジックも見ているため、trendでは説明タグに留める。",
      },
      {
        id: "nhk-mile-gate-double-digit",
        type: "gateBias",
        label: "二桁馬番傾向",
        condition: { gateNumberMin: 10 },
        stats: stats({ win: 9, second: 5, third: 5, out: 70 }, 0.101, 0.157, 0.213),
        adjustment: 0,
        adjustmentMode: "explanationOnly",
        confidence: 0.45,
        explanation:
          "NHKマイルCはAコース最終週で二桁馬番の好走が目立つ。ただし馬番は既存ロジックも見ているため、trendでは説明タグに留める。",
      },
      {
        id: "nhk-mile-nzt-winner-risk",
        type: "previousRaceFinishPattern",
        label: "NZT1着馬は過信注意",
        condition: {
          previousRaceNames: NZT_ALIASES,
          previousFinish: 1,
        },
        stats: stats({ win: 0, second: 0, third: 0, out: 9 }, 0, 0, 0),
        adjustment: -0.02,
        confidence: 0.35,
        explanation:
          "NZT勝ち馬は過去傾向ではNHKマイルCで苦戦。ただしサンプルは少なく、能力評価を大きく下げない。",
      },
      {
        id: "nhk-mile-nzt-second",
        type: "previousRaceFinishPattern",
        label: "NZT2着馬",
        condition: {
          previousRaceNames: NZT_ALIASES,
          previousFinish: 2,
        },
        stats: stats({ win: 1, second: 2, third: 0, out: 4 }, 0.143, 0.429, 0.429),
        adjustment: 0.025,
        confidence: 0.45,
        explanation:
          "NZTはNHKマイルCと着順が直結しにくい。特に2着馬は東京替わりで上積みするケースに注意。",
      },
      {
        id: "nhk-mile-nzt-third",
        type: "previousRaceFinishPattern",
        label: "NZT3着馬",
        condition: {
          previousRaceNames: NZT_ALIASES,
          previousFinish: 3,
        },
        stats: stats({ win: 1, second: 0, third: 1, out: 7 }, 0.111, 0.111, 0.222),
        adjustment: 0.012,
        confidence: 0.35,
        explanation:
          "NZT3着馬も好走例あり。ただしサンプルは小さいため、軽い注意タグに留める。",
      },
    ],
    adjustmentPolicy: {
      maxPositiveAdjustment: 0.05,
      maxNegativeAdjustment: -0.05,
      defaultConfidence: 0.4,
    },
  },
];
