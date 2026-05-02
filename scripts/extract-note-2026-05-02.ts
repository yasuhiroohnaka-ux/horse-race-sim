/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs/promises";
import path from "node:path";
import { COURSES } from "../lib/courses";
import {
  buildRaceAnalysisRows,
  getResolvedTraitScores,
  getScenarioProfile,
} from "../lib/raceAnalysis";
import { runMonteCarlo } from "../lib/simulation";
import { filterRaceDayNoOddsHorses } from "../lib/raceDayExclusions.mjs";
import { pickTanpukuPair, scoreTanpukuHorse } from "../lib/tanpukuSelection.mjs";
import type { Course, RaceCondition } from "../lib/types";

const ROOT = process.cwd();
const WEEKLY_RACES_PATH = path.join(ROOT, "data", "weekly-races.json");
const RUNS = Number(process.env.SIM_RUNS ?? 10000);

const TARGETS = [
  {
    courseId: "kyoto-dirt-1900-202608030311",
    focusNames: ["シルバーレシオ", "メルカントゥール", "ケイアイアギト"],
  },
  {
    courseId: "tokyo-turf-1400-202605020311",
    focusNames: ["セフィロ", "ワールズエンド", "マイネルチケット"],
  },
  {
    courseId: "kyoto-turf-3200-202608030411",
    focusNames: ["エヒト", "アドマイヤテラ", "クロワデュノール", "ヘデントール"],
  },
];

function fallbackCourse(race: any): Course {
  return {
    id: race.courseId,
    name: `${race.venue} ${race.surface} ${race.distance}m (${race.label})`,
    venue: race.venue,
    day: race.day,
    grade: race.grade,
    distance: race.distance,
    surface: race.surface,
    straightLength: race.straightLength,
    hashtag: `#${race.label}`,
    archived: false,
    defaultBias: race.trackBias ?? { innerOuter: 0, frontBack: 0 },
    segments: [
      { distance: Math.max(200, Math.round(race.distance * 0.22)), slope: 0, type: "straight" },
      { distance: Math.max(150, Math.round(race.distance * 0.2)), slope: 0, type: "corner" },
      { distance: Math.max(150, Math.round(race.distance * 0.2)), slope: 0, type: "corner" },
      { distance: Math.max(220, Math.round(race.straightLength)), slope: 1, type: "straight" },
    ],
  };
}

function buildCondition(course: Course, race: any): RaceCondition {
  const live = race.liveRaceCondition ?? null;
  return {
    courseId: course.id,
    trackBias: race.trackBias ?? course.defaultBias ?? { innerOuter: 0, frontBack: 0 },
    groundCondition: live?.groundCondition ?? "Firm",
    weather: live?.weather ?? "Sunny",
    windDirection: live?.windDirection ?? "Crosswind",
    windSpeed: typeof live?.windSpeed === "number" ? live.windSpeed : 3,
    paceScenario: live?.paceScenario ?? "Average",
  };
}

function round1(value: unknown) {
  return Math.round(Number(value ?? 0) * 10) / 10;
}

function round3(value: unknown) {
  return Math.round(Number(value ?? 0) * 1000) / 1000;
}

function percent(value: unknown) {
  return round1(Number(value ?? 0) * 100);
}

function summarizePick(pick: any) {
  if (!pick) return null;
  return {
    name: pick.horse?.name,
    gate: pick.horse?.gateNumber,
    jockey: pick.horse?.jockey,
    style: pick.horse?.runningStyle,
    odds: pick.odds,
    placeOdds: pick.placeOdds,
    winProb: percent(pick.winProb),
    placeProb: percent(pick.placeProb),
    placeScore: round3(pick.placeScore),
    valueScore: round3(pick.valueScore),
    top3Stability: percent(pick.top3Stability),
    overbetLabel: pick.overbetLabel,
    scoreGap: round3(pick.scoreGap),
    tanRoi: round1(pick.tanRoi),
    fukuRoi: round1(pick.fukuRoi),
    classificationHint: pick.classificationHint,
    selectionReason: pick.selectionReason,
  };
}

async function main() {
  const raw = await fs.readFile(WEEKLY_RACES_PATH, "utf8");
  const data = JSON.parse(raw.replace(/^\uFEFF/, ""));
  const races: any[] = data.currentWeek?.races ?? [];

  const output: any = {
    generatedAt: new Date().toISOString(),
    runs: RUNS,
    dataUpdatedAt: data.currentWeek?.updatedAt,
    races: [],
  };

  for (const target of TARGETS) {
    const race = races.find((entry) => entry.courseId === target.courseId);
    if (!race) continue;

    const course = COURSES.find((entry) => entry.id === race.courseId) ?? fallbackCourse(race);
    const condition = buildCondition(course, race);
    const horses = filterRaceDayNoOddsHorses(race.horses, race);
    const mcResults = runMonteCarlo(horses, course, condition, RUNS);
    const rows = buildRaceAnalysisRows(mcResults, horses, course, condition);
    const tanpuku: any = pickTanpukuPair({ ...race, horses }, false, true);

    function summarizeRow(row: any) {
      const traits = getResolvedTraitScores(row.horse, course, condition);
      const scenario = getScenarioProfile(row.horse, course, condition);
      const tanpukuScore: any = scoreTanpukuHorse(row.horse, { ...race, horses }, false, null);

      return {
        rank: rows.indexOf(row) + 1,
        name: row.name,
        gate: row.gateNumber,
        jockey: row.jockey,
        style: row.horse.runningStyle,
        ability: round1(row.displayAbilityScore),
        simWinRate: row.simWinRate,
        fairOdds: row.fairOdds,
        officialOdds: row.officialOdds,
        officialRank: row.officialRank,
        officialGap: row.officialGap,
        expertRank: row.expertRank,
        signal: row.signalDetailLabel ?? row.signalLabel,
        traits: {
          pedigree: round1(traits.pedigree),
          courseFit: round1(traits.courseFit),
          distanceFit: round1(traits.distanceFit),
          groundFit: round1(traits.groundFit),
          paceFit: round1(traits.paceFit),
        },
        raw: {
          speed: row.horse.speed,
          stamina: row.horse.stamina,
          power: row.horse.power,
          guts: row.horse.guts,
          condition: row.horse.condition,
          recentFormScore: row.horse.recentFormScore,
          lastRaceDistance: row.horse.lastRaceDistance,
          distanceChange: row.horse.distanceChange,
        },
        scenario: {
          abilityScore: round1(scenario.displayAbilityScore),
          speedModifier: round3(scenario.speedModifier),
          staminaModifier: round3(scenario.staminaModifier),
          volatility: round3(scenario.volatility),
        },
        tanpukuScore: tanpukuScore
          ? {
              winProb: percent(tanpukuScore.winProb),
              placeProb: percent(tanpukuScore.placeProb),
              placeScore: round3(tanpukuScore.placeScore),
              valueScore: round3(tanpukuScore.valueScore),
              top3Stability: percent(tanpukuScore.top3Stability),
              placeReturnEdge: percent(tanpukuScore.placeReturnEdge),
              tanRoi: round1(tanpukuScore.tanRoi),
              fukuRoi: round1(tanpukuScore.fukuRoi),
              overbetRisk: round3(tanpukuScore.overbetRisk),
              overbetLabel: tanpukuScore.overbetLabel,
            }
          : null,
      };
    }

    output.races.push({
      race: {
        label: race.label,
        date: race.raceDate,
        venue: race.venue,
        raceNumber: race.raceNumber,
        grade: race.grade,
        surface: race.surface,
        distance: race.distance,
        straightLength: race.straightLength,
        runners: horses.length,
        oddsSource: race.oddsSource,
      },
      condition,
      topRows: rows.slice(0, 10).map(summarizeRow),
      focusRows: target.focusNames.map((name) => rows.find((row) => row.name === name)).filter(Boolean).map(summarizeRow),
      tanpuku: tanpuku
        ? {
            scoringVersion: tanpuku.scoringVersion,
            winPick: summarizePick(tanpuku.winPick),
            opponentPick: summarizePick(tanpuku.opponentPick),
            widePick: summarizePick(tanpuku.widePick),
            winRunnerUp: summarizePick(tanpuku.winRunnerUp),
            valueRunnerUp: summarizePick(tanpuku.valueRunnerUp),
            marketHeatSummary: tanpuku.marketHeatSummary,
          }
        : null,
    });
  }

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
