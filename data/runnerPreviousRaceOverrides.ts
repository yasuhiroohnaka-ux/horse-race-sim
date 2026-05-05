import type { Horse } from "@/lib/types";

export type RunnerPreviousRaceOverride = Pick<
  Horse,
  | "previousRaceName"
  | "previousRaceDisplayName"
  | "previousFinish"
  | "previousRaceCourse"
  | "previousRaceDistance"
  | "previousRaceTrackType"
  | "previousRaceGrade"
  | "previousRaceDate"
>;

export const RUNNER_PREVIOUS_RACE_OVERRIDES: Record<
  string,
  Record<string, RunnerPreviousRaceOverride>
> = {
  // Temporary manual overrides for display/trend metadata. Replace these with
  // ingestion-pipeline supplied previousRaceName / previousFinish values later.
  "nhk-mile-c": {
    レザベーション: {
      previousRaceName: "ニュージーランドT",
      previousRaceDisplayName: "ニュージーランドT",
      previousFinish: 1,
      previousRaceCourse: "中山芝1600",
      previousRaceDistance: 1600,
      previousRaceTrackType: "芝",
      previousRaceGrade: "G2",
      previousRaceDate: "2026-04-11",
    },
    ロデオドライブ: {
      previousRaceName: "ニュージーランドT",
      previousRaceDisplayName: "ニュージーランドT",
      previousFinish: 2,
      previousRaceCourse: "中山芝1600",
      previousRaceDistance: 1600,
      previousRaceTrackType: "芝",
      previousRaceGrade: "G2",
      previousRaceDate: "2026-04-11",
    },
    ジーネキング: {
      previousRaceName: "ニュージーランドT",
      previousRaceDisplayName: "ニュージーランドT",
      previousFinish: 3,
      previousRaceCourse: "中山芝1600",
      previousRaceDistance: 1600,
      previousRaceTrackType: "芝",
      previousRaceGrade: "G2",
      previousRaceDate: "2026-04-11",
    },
    ディールメーカー: {
      previousRaceName: "ニュージーランドT",
      previousRaceDisplayName: "ニュージーランドT",
      previousFinish: 4,
      previousRaceCourse: "中山芝1600",
      previousRaceDistance: 1600,
      previousRaceTrackType: "芝",
      previousRaceGrade: "G2",
      previousRaceDate: "2026-04-11",
    },
    アルデトップガン: {
      previousRaceName: "ニュージーランドT",
      previousRaceDisplayName: "ニュージーランドT",
      previousFinish: 5,
      previousRaceCourse: "中山芝1600",
      previousRaceDistance: 1600,
      previousRaceTrackType: "芝",
      previousRaceGrade: "G2",
      previousRaceDate: "2026-04-11",
    },
    ダイヤモンドノット: {
      previousRaceName: "ファルコンS",
      previousRaceDisplayName: "ファルコンS",
      previousFinish: 1,
      previousRaceCourse: "中京芝1400",
      previousRaceDistance: 1400,
      previousRaceTrackType: "芝",
      previousRaceGrade: "G3",
      previousRaceDate: "2026-03-21",
    },
    アンドゥーリル: {
      previousRaceName: "チャーチルダウンズC",
      previousRaceDisplayName: "チャーチルダウンズC",
      previousFinish: 8,
      previousRaceCourse: "阪神芝1600",
      previousRaceDistance: 1600,
      previousRaceTrackType: "芝",
      previousRaceGrade: "G3",
      previousRaceDate: "2026-04-04",
    },
    サンダーストラック: {
      previousRaceName: "チャーチルダウンズC",
      previousRaceDisplayName: "チャーチルダウンズC",
      previousFinish: 12,
      previousRaceCourse: "阪神芝1600",
      previousRaceDistance: 1600,
      previousRaceTrackType: "芝",
      previousRaceGrade: "G3",
      previousRaceDate: "2026-04-04",
    },
  },
};
