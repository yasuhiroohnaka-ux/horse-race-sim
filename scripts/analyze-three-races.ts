import fs from "node:fs/promises";
import path from "node:path";
import { ARCHIVED_COURSES, COURSES } from "../lib/courses";
import { runMonteCarlo } from "../lib/simulation";
import { buildRaceAnalysisRows } from "../lib/raceAnalysis";
import { pickTanpukuPair } from "../lib/tanpukuSelection.mjs";
import type { Course, Horse, RaceCondition } from "../lib/types";

const ROOT = process.cwd();
const WEEKLY_RACES_PATH = path.join(ROOT, "data", "weekly-races.json");

const TARGETS: Array<{ key: string; courseId: string; label: string }> = [
  { key: "satsuki", courseId: "nakayama-turf-2000-202606030811", label: "皐月賞" },
  { key: "fukushima_himba", courseId: "fukushima-turf-1800-202603010411", label: "福島牝馬S" },
  { key: "antares", courseId: "hanshin-dirt-1800-202609020711", label: "アンタレスS" },
];

function findCourse(courseId: string, race: any): Course {
  const matched = COURSES.find((c) => c.id === courseId) ?? ARCHIVED_COURSES.find((c) => c.id === courseId);
  if (matched) return matched;
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
      { distance: Math.max(200, Math.round(race.distance * 0.2)), slope: 0, type: "straight" },
      { distance: Math.max(150, Math.round(race.distance * 0.2)), slope: 0, type: "corner" },
      { distance: Math.max(150, Math.round(race.distance * 0.2)), slope: 0, type: "corner" },
      { distance: Math.max(220, Math.round(race.straightLength)), slope: 1.0, type: "straight" },
    ],
  } as Course;
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

async function main() {
  const raw = await fs.readFile(WEEKLY_RACES_PATH, "utf8");
  const data = JSON.parse(raw.replace(/^\uFEFF/, ""));
  const races: any[] = data?.currentWeek?.races ?? [];

  const output: Record<string, unknown> = {};

  for (const target of TARGETS) {
    const race = races.find((r) => r.courseId === target.courseId);
    if (!race) {
      output[target.key] = { error: `race not found ${target.courseId}` };
      continue;
    }
    const course = findCourse(target.courseId, race);
    const condition = buildCondition(course, race);
    const horses: Horse[] = race.horses;
    console.error(`[${target.key}] runners=${horses.length}`);

    // Run Monte Carlo (default 100 iterations) — but for stable picture run more
    const mcResults = runMonteCarlo(horses, course, condition, 500);
    const rows = buildRaceAnalysisRows(mcResults, horses, course, condition);
    const tanpuku: any = pickTanpukuPair(race, false, true);

    const top5 = rows.slice(0, 8).map((r) => ({
      rank: r.simWinRate,
      name: r.name,
      gate: r.gateNumber,
      jockey: r.jockey,
      ability: Number(r.displayAbilityScore?.toFixed?.(1) ?? r.displayAbilityScore),
      simWinRate: r.simWinRate,
      fairOdds: r.fairOdds,
      officialOdds: r.officialOdds,
      officialImplied: r.officialImplied,
      officialRank: r.officialRank,
      expertImplied: r.expertImplied,
      officialGap: r.officialGap,
      marketExpertGap: r.marketExpertGap,
      signal: r.signalDetailLabel ?? r.signalLabel,
      style: r.horse.runningStyle,
      lastFinish: r.horse.recentAverageFinish,
      formScore: r.horse.recentFormScore,
      lastGrade: r.horse.lastRaceGradeScore,
    }));

    output[target.key] = {
      label: target.label,
      courseId: target.courseId,
      course: { name: course.name, distance: course.distance, surface: course.surface, straightLength: course.straightLength, venue: course.venue },
      condition,
      simulationTopRows: top5,
      tanpuku: tanpuku
        ? {
            scoringVersion: tanpuku.scoringVersion,
            winPick: pickSummary(tanpuku.winPick),
            opponentPick: pickSummary(tanpuku.opponentPick),
            widePick: pickSummary(tanpuku.widePick),
            winRunnerUp: tanpuku.winRunnerUp,
            classificationHint: tanpuku.winPick?.classificationHint,
            marketHeatSummary: tanpuku.marketHeatSummary,
          }
        : null,
    };
  }

  process.stdout.write(JSON.stringify(output, null, 2));
}

function pickSummary(p: any) {
  if (!p) return null;
  return {
    horseId: p.horse?.id,
    name: p.horse?.name,
    gate: p.horse?.gateNumber,
    runningStyle: p.horse?.runningStyle,
    odds: p.odds,
    placeOdds: p.placeOdds,
    winProb: p.winProb,
    placeProb: p.placeProb,
    placeScore: p.placeScore,
    valueScore: p.valueScore,
    top3Stability: p.top3Stability,
    overbetLabel: p.overbetLabel,
    selectionReason: p.selectionReason,
    scoreGap: p.scoreGap,
    tanRoi: p.tanRoi,
    fukuRoi: p.fukuRoi,
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
