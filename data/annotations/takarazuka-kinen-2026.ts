import type { RaceTrendHeuristicHint, RaceTrendNote } from "@/lib/types";

export const TAKARAZUKA_KINEN_2026_RACE_KEY = "2026-takarazuka-kinen";

export const TAKARAZUKA_KINEN_2026_COURSE_IDS = [
  "takarazuka-kinen",
  "hanshin-turf-2200-takarazuka-kinen",
  "kyoto-turf-2200-takarazuka-kinen",
];

const SOURCE_LABEL = "スクリーンショット由来・要照合";

export const takarazukaKinen2026TrendNotes: RaceTrendNote[] = [
  {
    id: "takarazuka-2026-age-record",
    raceKey: TAKARAZUKA_KINEN_2026_RACE_KEY,
    title: "年齢別の成績",
    category: "age",
    summary: "勝ち馬は4歳・5歳から出ており、6歳以上は連下評価が中心。",
    point: "勝ち馬は4、5歳から。6歳以上はGI実績の裏付けが必要。",
    rows: [
      {
        label: "4歳",
        record: "4-2-5-27",
        winRate: "10.5%",
        quinellaRate: "15.8%",
        showRate: "28.9%",
      },
      {
        label: "5歳",
        record: "6-4-4-42",
        winRate: "10.7%",
        quinellaRate: "17.9%",
        showRate: "25.0%",
      },
      {
        label: "6歳",
        record: "0-3-1-25",
        winRate: "0.0%",
        quinellaRate: "10.3%",
        showRate: "13.8%",
      },
      {
        label: "7歳",
        record: "0-1-0-19",
        winRate: "0.0%",
        quinellaRate: "5.0%",
        showRate: "5.0%",
      },
      {
        label: "8歳",
        record: "0-0-0-6",
        winRate: "0.0%",
        quinellaRate: "0.0%",
        showRate: "0.0%",
      },
    ],
    cautions: [
      "年齢だけで機械的に消さず、6歳以上はGI連対級の実績があるかを確認する。",
      "4歳・5歳は勝ち切り候補、6歳以上は相手・押さえ寄りに整理する。",
    ],
    sourceLabel: SOURCE_LABEL,
  },
  {
    id: "takarazuka-2026-previous-race-record",
    raceKey: TAKARAZUKA_KINEN_2026_RACE_KEY,
    title: "前走レース別の成績",
    category: "previousRace",
    summary: "天皇賞・春と大阪杯が主流ローテ。QEII世Cはサンプルが少なく参考値。",
    point: "天皇賞・春組と大阪杯組を中心視。その他ローテは個別の実績で補う。",
    rows: [
      {
        label: "天皇賞・春",
        record: "3-2-4-30",
        winRate: "7.7%",
        quinellaRate: "12.8%",
        showRate: "23.1%",
      },
      {
        label: "大阪杯",
        record: "2-4-2-24",
        winRate: "6.3%",
        quinellaRate: "18.8%",
        showRate: "25.0%",
      },
      {
        label: "QEII世C",
        record: "1-0-0-6",
        winRate: "14.3%",
        quinellaRate: "14.3%",
        showRate: "14.3%",
      },
      {
        label: "金鯱賞",
        record: "0-0-0-1",
        winRate: "0.0%",
        quinellaRate: "0.0%",
        showRate: "0.0%",
      },
      {
        label: "日経賞",
        record: "0-0-0-4",
        winRate: "0.0%",
        quinellaRate: "0.0%",
        showRate: "0.0%",
      },
      {
        label: "新潟大賞典",
        record: "0-0-0-2",
        winRate: "0.0%",
        quinellaRate: "0.0%",
        showRate: "0.0%",
      },
      {
        label: "有馬記念",
        record: "0-0-0-1",
        winRate: "0.0%",
        quinellaRate: "0.0%",
        showRate: "0.0%",
      },
    ],
    cautions: [
      "前走レースの勝率だけでなく、距離短縮・距離延長・前走負荷を併せて見る。",
      "QEII世C、金鯱賞、日経賞、新潟大賞典、有馬記念は母数が少ないため参考値。",
    ],
    sourceLabel: SOURCE_LABEL,
  },
  {
    id: "takarazuka-2026-longshot-placed",
    raceKey: TAKARAZUKA_KINEN_2026_RACE_KEY,
    title: "6番人気以下で馬券に絡んだ馬",
    category: "longshot",
    summary: "阪神開催では人気薄の好走が多く、差し・追い込みだけでなく逃げ・先行も残っている。",
    point: "人気薄はGI実績、道悪適性、脚質と馬場の噛み合いを確認。",
    rows: [
      {
        label: "2016 マリアライト",
        extra: { 着順: "1着", 人気: 8, 性齢: "牝5", 馬体重: 438, 脚質: "差し" },
      },
      {
        label: "2018 ミッキーロケット",
        extra: { 着順: "1着", 人気: 7, 性齢: "牡5", 馬体重: 476, 脚質: "先行" },
      },
      {
        label: "2018 ワーザー",
        extra: { 着順: "2着", 人気: 10, 性齢: "騸7", 馬体重: 446, 脚質: "差し" },
      },
      {
        label: "2018 ノーブルマーズ",
        extra: { 着順: "3着", 人気: 12, 性齢: "牡5", 馬体重: 490, 脚質: "差し" },
      },
      {
        label: "2019 スワーヴリチャード",
        extra: { 着順: "3着", 人気: 6, 性齢: "牡5", 馬体重: 524, 脚質: "先行" },
      },
      {
        label: "2020 キセキ",
        extra: { 着順: "2着", 人気: 6, 性齢: "牡6", 馬体重: 502, 脚質: "まくり" },
      },
      {
        label: "2020 モズベッロ",
        extra: { 着順: "3着", 人気: 12, 性齢: "牡4", 馬体重: 480, 脚質: "差し" },
      },
      {
        label: "2021 ユニコーンライオン",
        extra: { 着順: "2着", 人気: 7, 性齢: "牡5", 馬体重: 524, 脚質: "逃げ" },
      },
      {
        label: "2023 スルーセブンシーズ",
        extra: { 着順: "2着", 人気: 10, 性齢: "牝5", 馬体重: 446, 脚質: "追い込み" },
      },
      {
        label: "2025 メイショウタバル",
        extra: { 着順: "1着", 人気: 7, 性齢: "牡4", 馬体重: 504, 脚質: "逃げ" },
      },
      {
        label: "2025 ジャスティンパレス",
        extra: { 着順: "3着", 人気: 10, 性齢: "牡6", 馬体重: 470, 脚質: "追い込み" },
      },
    ],
    cautions: [
      "画像注記は阪神開催のみ。京都開催や馬場差が大きい年は別扱いにする。",
      "人気薄でも大型馬・先行馬・道悪巧者など複数条件が重なる馬を優先する。",
    ],
    sourceLabel: SOURCE_LABEL,
  },
  {
    id: "takarazuka-2026-tokyo-2400-g1-winners",
    raceKey: TAKARAZUKA_KINEN_2026_RACE_KEY,
    title: "東京芝2400mのGIと宝塚記念を勝った馬",
    category: "courseExperience",
    summary: "東京芝2400mのGI勝ち馬が宝塚記念も勝つ例があり、底力の裏付けとして使える。",
    point: "東京芝2400mGI勝ちの実績は、中距離の底力確認材料。",
    rows: [
      { label: "2000 テイエムオペラオー", extra: { 東京芝2400mのGI: "ジャパンC" } },
      { label: "2004 タップダンスシチー", extra: { 東京芝2400mのGI: "ジャパンC" } },
      { label: "2006 ディープインパクト", extra: { 東京芝2400mのGI: "日本ダービー、ジャパンC" } },
      { label: "2007 アドマイヤムーン", extra: { 東京芝2400mのGI: "ジャパンC" } },
      { label: "2012 オルフェーヴル", extra: { 東京芝2400mのGI: "日本ダービー" } },
      { label: "2023 イクイノックス", extra: { 東京芝2400mのGI: "ジャパンC" } },
    ],
    cautions: [
      "東京2400m実績は万能ではなく、阪神2200mの機動力・馬場適性とセットで見る。",
      "2000年以降の該当例として扱う。",
    ],
    sourceLabel: SOURCE_LABEL,
  },
  {
    id: "takarazuka-2026-derby-winner-record",
    raceKey: TAKARAZUKA_KINEN_2026_RACE_KEY,
    title: "日本ダービー馬の宝塚記念成績",
    category: "courseExperience",
    summary: "ダービー馬でも明暗が分かれる。三冠馬・二冠馬級や直近GI級の内容がある馬は評価しやすい。",
    point: "ダービー馬という肩書きだけでなく、直近内容と複数GI級の実績を見る。",
    rows: [
      { label: "1999 スペシャルウィーク", extra: { 着順: "2着", 前走: "天皇賞・春1着", 注釈: "" } },
      { label: "2003 ネオユニヴァース", extra: { 着順: "4着", 前走: "日本ダービー1着", 注釈: "当時3歳、2冠馬" } },
      { label: "2006 ディープインパクト", extra: { 着順: "1着", 前走: "天皇賞・春1着", 注釈: "3冠馬" } },
      { label: "2007 メイショウサムソン", extra: { 着順: "2着", 前走: "天皇賞・春1着", 注釈: "2冠馬" } },
      { label: "2007 ウオッカ", extra: { 着順: "8着", 前走: "日本ダービー1着", 注釈: "牝馬" } },
      { label: "2008 メイショウサムソン", extra: { 着順: "2着", 前走: "天皇賞・春2着", 注釈: "2冠馬" } },
      { label: "2009 ディープスカイ", extra: { 着順: "3着", 前走: "安田記念2着", 注釈: "" } },
      { label: "2010 ロジユニヴァース", extra: { 着順: "13着", 前走: "日経賞6着", 注釈: "" } },
      { label: "2011 エイシンフラッシュ", extra: { 着順: "3着", 前走: "天皇賞・春2着", 注釈: "" } },
      { label: "2012 オルフェーヴル", extra: { 着順: "1着", 前走: "天皇賞・春1着", 注釈: "3冠馬" } },
      { label: "2012 エイシンフラッシュ", extra: { 着順: "6着", 前走: "ドバイWC6着", 注釈: "" } },
      { label: "2015 ワンアンドオンリー", extra: { 着順: "11着", 前走: "ドバイSC3着", 注釈: "" } },
      { label: "2016 ドゥラメンテ", extra: { 着順: "2着", 前走: "ドバイSC2着", 注釈: "2冠馬" } },
      { label: "2016 ワンアンドオンリー", extra: { 着順: "14着", 前走: "ドバイSC5着", 注釈: "" } },
      { label: "2019 レイデオロ", extra: { 着順: "5着", 前走: "ドバイSC6着", 注釈: "" } },
      { label: "2019 マカヒキ", extra: { 着順: "11着", 前走: "大阪杯4着", 注釈: "" } },
      { label: "2020 ワグネリアン", extra: { 着順: "13着", 前走: "大阪杯5着", 注釈: "" } },
      { label: "2024 ドウデュース", extra: { 着順: "6着", 前走: "ドバイターフ5着", 注釈: "" } },
    ],
    cautions: [
      "ダービー馬は人気になりやすいため、宝塚記念の馬場・ペース適性が足りるかを優先する。",
      "海外帰りや休み明けの負荷は個別に評価する。",
    ],
    sourceLabel: SOURCE_LABEL,
  },
  {
    id: "takarazuka-2026-non-firm-winner-record",
    raceKey: TAKARAZUKA_KINEN_2026_RACE_KEY,
    title: "芝の良馬場以外での勝利実績",
    category: "courseCondition",
    summary: "道悪開催では、馬券圏内18頭中16頭に芝の良馬場以外での勝利実績があった。",
    point: "稍重・重の宝塚記念では、芝の良馬場以外で勝っている馬を重視。",
    rows: [
      { label: "2016 稍 マリアライト", extra: { 着順: "1着", 該当: "○" } },
      { label: "2016 稍 ドゥラメンテ", extra: { 着順: "2着", 該当: "未" } },
      { label: "2016 稍 キタサンブラック", extra: { 着順: "3着", 該当: "○" } },
      { label: "2017 稍 サトノクラウン", extra: { 着順: "1着", 該当: "○" } },
      { label: "2017 稍 ゴールドアクター", extra: { 着順: "2着", 該当: "○" } },
      { label: "2017 稍 ミッキークイーン", extra: { 着順: "3着", 該当: "○" } },
      { label: "2018 稍 ミッキーロケット", extra: { 着順: "1着", 該当: "○" } },
      { label: "2018 稍 ワーザー", extra: { 着順: "2着", 該当: "○" } },
      { label: "2018 稍 ノーブルマーズ", extra: { 着順: "3着", 該当: "重馬場3着" } },
      { label: "2020 稍 クロノジェネシス", extra: { 着順: "1着", 該当: "○" } },
      { label: "2020 稍 キセキ", extra: { 着順: "2着", 該当: "○" } },
      { label: "2020 稍 モズベッロ", extra: { 着順: "3着", 該当: "○" } },
      { label: "2024 重 ブローザホーン", extra: { 着順: "1着", 該当: "○" } },
      { label: "2024 重 ソールオリエンス", extra: { 着順: "2着", 該当: "○" } },
      { label: "2024 重 ベラジオオペラ", extra: { 着順: "3着", 該当: "○" } },
      { label: "2025 稍 メイショウタバル", extra: { 着順: "1着", 該当: "○" } },
      { label: "2025 稍 ベラジオオペラ", extra: { 着順: "2着", 該当: "○" } },
      { label: "2025 稍 ジャスティンパレス", extra: { 着順: "3着", 該当: "○" } },
    ],
    cautions: [
      "過去10年で道悪開催は6回という前提。良馬場なら重みを下げる。",
      "勝利実績がなくても、重馬場での好走や血統・走法で補えるかを確認する。",
    ],
    sourceLabel: SOURCE_LABEL,
  },
  {
    id: "takarazuka-2026-older-horse-record",
    raceKey: TAKARAZUKA_KINEN_2026_RACE_KEY,
    title: "6歳以上の好走馬",
    category: "age",
    summary: "6歳以上で馬券圏内に来た馬は過去10年で5頭。すべてGIで連対していた。",
    point: "6歳以上はGI連対級の実績がないと評価を上げにくい。",
    rows: [
      { label: "2017 ゴールドアクター", extra: { 着順: "2着", 性齢: "牡6", GI実績: "15年有馬記念V" } },
      { label: "2018 ワーザー", extra: { 着順: "2着", 性齢: "騸7", GI実績: "香港GI4勝" } },
      { label: "2020 キセキ", extra: { 着順: "2着", 性齢: "牡6", GI実績: "17年菊花賞V" } },
      { label: "2022 ヒシイグアス", extra: { 着順: "2着", 性齢: "牡6", GI実績: "21年香港C2着" } },
      { label: "2025 ジャスティンパレス", extra: { 着順: "3着", 性齢: "牡6", GI実績: "23年天皇賞・春V" } },
    ],
    cautions: [
      "6歳以上は近走の衰え、休み明け、道悪適性を厳しめに確認する。",
      "GI連対実績がない高齢馬は相手までに留める。",
    ],
    sourceLabel: SOURCE_LABEL,
  },
  {
    id: "takarazuka-2026-long-rest",
    raceKey: TAKARAZUKA_KINEN_2026_RACE_KEY,
    title: "中15週以上で臨んだ馬",
    category: "interval",
    summary: "中15週以上の長期休み明けは人気馬でも崩れており、割引材料として扱う。",
    point: "休み明け初戦・今年2戦目で中15週以上は過信しない。",
    rows: [
      {
        label: "2019 タツゴウゲキ",
        extra: { 人気: 12, 着順: "12着", 前走月: "2018年6月", 前走: "宝塚記念", 前走着順: "15着" },
      },
      {
        label: "2020 グローリーヴェイズ",
        extra: { 人気: 5, 着順: "17着", 前走月: "2019年12月", 前走: "香港ヴァーズ", 前走着順: "1着" },
      },
      {
        label: "2025 レガレイラ",
        extra: { 人気: 2, 着順: "11着", 前走月: "2024年12月", 前走: "有馬記念", 前走着順: "1着" },
      },
    ],
    cautions: [
      "2020年はコロナでドバイ中止の特殊事情あり。",
      "画像内の今年該当馬メモは出走表・ローテと必ず照合する。",
    ],
    sourceLabel: SOURCE_LABEL,
  },
];

export const takarazukaKinenHeuristicHints: RaceTrendHeuristicHint[] = [
  {
    id: "takarazuka-age-core",
    label: "年齢",
    description: "勝ち馬は4歳・5歳中心。6歳以上はGI連対級の実績を条件に相手評価。",
  },
  {
    id: "takarazuka-prev-race-core",
    label: "前走ローテ",
    description: "天皇賞・春と大阪杯が主流。長期休み明けや有馬記念直行は過信しない。",
  },
  {
    id: "takarazuka-ground-core",
    label: "馬場",
    description: "稍重・重なら芝の良馬場以外での勝利実績を強く確認する。",
  },
];
