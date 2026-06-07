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

const TENNO_SHO_SPRING_ALIASES = ["天皇賞・春", "天皇賞春", "天皇賞（春）", "天皇賞(春)"];

const QEII_CUP_ALIASES = ["QEII世C", "QEII世Ｃ", "クイーンエリザベス2世C", "クイーンエリザベス2世Ｃ"];

export const RACE_TREND_PROFILES: RaceTrendProfile[] = [
  {
    raceKey: "victoria-mile",
    raceName: "ヴィクトリアマイル",
    course: "東京芝1600",
    courseIds: ["victoria-mile", "tokyo-turf-1600-202605020811"],
    matchRaceNames: ["ヴィクトリアマイル", "ヴィクトリアマイルＣ"],
    notes: [
      "東京芝1600m・牝馬限定G1。前半3F33〜34秒台の速い流れになりやすく、追走力と持続力が問われる。阪神牝馬Sとはペース特性が異なるため、ローテの見方に注意。",
      "過去10年の好走馬の多くが、牡馬混合の重賞・リステッド以上で実績あり。ただし傾向の目安として扱い、強い加点材料にはしない。",
      "過去10年の馬券圏内30頭中22頭が芝1800m以上で勝利（残り5頭は芝マイルG1馬）。底力・持続力の指標として参考にする。単純な距離延長適性ではなく、タフな条件への耐性として見る。",
      "4歳・5歳が中心（各約40%）。6歳は複勝圏はあるが勝率はやや落ちる傾向。7歳は母数4なので勝率25%は参考値であり、強い評価材料にしない。",
    ],
    trendHints: [
      {
        id: "vm-previous-race-hanshin-baba-s",
        type: "previousRace",
        label: "前走阪神牝馬S組",
        condition: {
          previousRaceNames: ["阪神牝馬S", "阪神牝馬Ｓ", "阪神牝馬ステークス"],
        },
        stats: stats({ win: 4, second: 3, third: 5, out: 56 }, 0.059, 0.103, 0.176),
        adjustment: 0.01,
        confidence: 0.4,
        explanation:
          "阪神牝馬Sは出走数最多の主流ローテ。ただし阪神牝馬Sは前半3F35秒超のスロー寄り傾向があり、VM本番の33〜34秒台の速い流れとは条件が異なる。実績は評価しつつ、展開対応は個別判断。",
      },
      {
        id: "vm-previous-race-nakayama-baba-s",
        type: "previousRace",
        label: "前走中山牝馬S組",
        condition: {
          previousRaceNames: ["中山牝馬S", "中山牝馬Ｓ", "中山牝馬ステークス"],
        },
        stats: stats({ win: 1, second: 2, third: 1, out: 10 }, 0.071, 0.214, 0.286),
        adjustment: 0.015,
        confidence: 0.4,
        explanation:
          "中山牝馬S組はサンプル14と少ないが複勝率が高め。タフな条件を経由した持続力を軽く加点。ただし少サンプルのため過信しない。",
      },
      {
        id: "vm-previous-race-fukushima-baba-s",
        type: "previousRace",
        label: "前走福島牝馬S組",
        condition: {
          previousRaceNames: ["福島牝馬S", "福島牝馬Ｓ", "福島牝馬ステークス"],
        },
        stats: stats({ win: 0, second: 1, third: 0, out: 18 }, 0, 0.053, 0.053),
        adjustment: -0.005,
        confidence: 0.3,
        explanation:
          "福島牝馬S組は過去傾向で苦戦気味。ただし出走馬層の偏りも考えられるため、強い減点はしない。軽い注意程度。",
      },
      {
        id: "vm-previous-race-kinko-sho",
        type: "previousRace",
        label: "前走金鯱賞組（参考値）",
        condition: {
          previousRaceNames: ["金鯱賞"],
        },
        stats: stats({ win: 0, second: 1, third: 0, out: 2 }, 0, 0.333, 0.333),
        adjustment: 0,
        adjustmentMode: "explanationOnly",
        confidence: 0.2,
        explanation:
          "金鯱賞組はサンプル3の参考値。連対率33.3%に見えるが母数が極小のため信頼性は低い。スコアは動かさず説明タグのみ。",
      },
      {
        id: "vm-previous-race-nakayama-kinen",
        type: "previousRace",
        label: "前走中山記念組（参考値）",
        condition: {
          previousRaceNames: ["中山記念"],
        },
        stats: stats({ win: 0, second: 0, third: 0, out: 2 }, 0, 0, 0),
        adjustment: 0,
        adjustmentMode: "explanationOnly",
        confidence: 0.2,
        explanation:
          "中山記念組はサンプル2の参考値。好走例なしだが母数が少なすぎるため、評価の根拠にはしない。",
      },
      {
        id: "vm-previous-race-aichi-hai",
        type: "previousRace",
        label: "前走愛知杯組（参考値）",
        condition: {
          previousRaceNames: ["愛知杯"],
        },
        stats: stats({ win: 0, second: 0, third: 0, out: 6 }, 0, 0, 0),
        adjustment: 0,
        adjustmentMode: "explanationOnly",
        confidence: 0.25,
        explanation:
          "愛知杯（旧京都牝馬Sを含む）組は好走例なし。サンプル6と少なく出走馬層の偏りも考えられる。軽い注意タグのみ、強い減点はしない。",
      },
    ],
    adjustmentPolicy: {
      maxPositiveAdjustment: 0.04,
      maxNegativeAdjustment: -0.04,
      defaultConfidence: 0.4,
    },
  },
  {
    raceKey: "nhk-mile-c",
    raceName: "NHKマイルC",
    course: "東京芝1600",
    courseIds: ["nhk-mile-c", "tokyo-turf-1600-202605020611"],
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
  {
    raceKey: "takarazuka-kinen",
    raceName: "宝塚記念",
    course: "阪神芝2200",
    courseIds: [
      "takarazuka-kinen",
      "hanshin-turf-2200-takarazuka-kinen",
      "kyoto-turf-2200-takarazuka-kinen",
    ],
    matchRaceNames: ["宝塚記念"],
    notes: [
      "勝ち馬は4歳・5歳中心。6歳以上は馬券圏内例があるが、GI連対級の実績を条件に相手評価へ寄せる。",
      "天皇賞・春と大阪杯が主流ローテ。QEII世Cは勝ち馬ありだが母数が小さいため参考値。",
      "稍重・重の開催では、馬券圏内18頭中16頭に芝の良馬場以外での勝利実績があった。良馬場以外なら道悪適性を重視する。",
      "中15週以上の長期休み明けは人気馬でも崩れているため、直行組は過信しない。",
    ],
    trendHints: [
      {
        id: "takarazuka-previous-race-tenno-sho-spring",
        type: "previousRace",
        label: "前走天皇賞・春組",
        condition: {
          previousRaceNames: TENNO_SHO_SPRING_ALIASES,
        },
        stats: stats({ win: 3, second: 2, third: 4, out: 30 }, 0.077, 0.128, 0.231),
        adjustment: 0.012,
        confidence: 0.4,
        explanation:
          "天皇賞・春組は主流ローテで複勝率23.1%。距離短縮で追走力が問われるため、長距離適性だけでなく中距離の機動力も見る。",
      },
      {
        id: "takarazuka-previous-race-osaka-hai",
        type: "previousRace",
        label: "前走大阪杯組",
        condition: {
          previousRaceNames: ["大阪杯"],
        },
        stats: stats({ win: 2, second: 4, third: 2, out: 24 }, 0.063, 0.188, 0.25),
        adjustment: 0.012,
        confidence: 0.4,
        explanation:
          "大阪杯組は複勝率25.0%で安定。阪神内回り寄りの総合力を評価しつつ、間隔と前走負荷を確認する。",
      },
      {
        id: "takarazuka-previous-race-qeii-cup",
        type: "previousRace",
        label: "前走QEII世C組（参考値）",
        condition: {
          previousRaceNames: QEII_CUP_ALIASES,
        },
        stats: stats({ win: 1, second: 0, third: 0, out: 6 }, 0.143, 0.143, 0.143),
        adjustment: 0,
        adjustmentMode: "explanationOnly",
        confidence: 0.25,
        explanation:
          "QEII世C組は勝ち馬がいるがサンプル7の参考値。海外遠征帰りの状態面が大きいため、スコアは動かさず説明タグに留める。",
      },
      {
        id: "takarazuka-previous-race-arima-kinen",
        type: "previousRace",
        label: "前走有馬記念組（直行注意）",
        condition: {
          previousRaceNames: ["有馬記念"],
        },
        stats: stats({ win: 0, second: 0, third: 0, out: 1 }, 0, 0, 0),
        adjustment: 0,
        adjustmentMode: "explanationOnly",
        confidence: 0.2,
        explanation:
          "有馬記念からの直行は画像データ上サンプル1で好走なし。長期休み明けになりやすいため、調整過程と状態を優先確認する。",
      },
      {
        id: "takarazuka-previous-race-nikkei-sho",
        type: "previousRace",
        label: "前走日経賞組（参考値）",
        condition: {
          previousRaceNames: ["日経賞"],
        },
        stats: stats({ win: 0, second: 0, third: 0, out: 4 }, 0, 0, 0),
        adjustment: 0,
        adjustmentMode: "explanationOnly",
        confidence: 0.2,
        explanation:
          "日経賞組は画像データ上0-0-0-4。母数が小さいため強い減点にはせず、ローテ注意タグとして扱う。",
      },
      {
        id: "takarazuka-previous-race-kinko-sho",
        type: "previousRace",
        label: "前走金鯱賞組（参考値）",
        condition: {
          previousRaceNames: ["金鯱賞"],
        },
        stats: stats({ win: 0, second: 0, third: 0, out: 1 }, 0, 0, 0),
        adjustment: 0,
        adjustmentMode: "explanationOnly",
        confidence: 0.2,
        explanation:
          "金鯱賞組は画像データ上サンプル1。評価材料としては弱く、個別能力と状態を見る。",
      },
      {
        id: "takarazuka-previous-race-niigata-daishoten",
        type: "previousRace",
        label: "前走新潟大賞典組（参考値）",
        condition: {
          previousRaceNames: ["新潟大賞典"],
        },
        stats: stats({ win: 0, second: 0, third: 0, out: 2 }, 0, 0, 0),
        adjustment: 0,
        adjustmentMode: "explanationOnly",
        confidence: 0.2,
        explanation:
          "新潟大賞典組は画像データ上0-0-0-2。母数が小さいため強い減点にはせず、格と距離適性を個別確認する。",
      },
    ],
    adjustmentPolicy: {
      maxPositiveAdjustment: 0.04,
      maxNegativeAdjustment: -0.04,
      defaultConfidence: 0.4,
    },
  },
];
