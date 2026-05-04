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
  "nhk-mile-c": {
    サンプルNZT2着馬: {
      previousRaceName: "ニュージーランドT",
      previousRaceDisplayName: "ニュージーランドT",
      previousFinish: 2,
      previousRaceCourse: "中山芝1600",
      previousRaceDistance: 1600,
      previousRaceTrackType: "芝",
      previousRaceGrade: "G2",
    },
    サンプル皐月賞組: {
      previousRaceName: "皐月賞",
      previousRaceDisplayName: "皐月賞",
      previousFinish: 8,
      previousRaceCourse: "中山芝2000",
      previousRaceDistance: 2000,
      previousRaceTrackType: "芝",
      previousRaceGrade: "G1",
    },
  },
};
