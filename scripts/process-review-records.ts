import { extractRaceId } from "@/lib/reviewRecords";
import { runReviewPipeline, type ReviewPipelinePhase } from "@/lib/reviewPipeline";
import { verifyCurrentWeekRaceIdentities } from "./race-identity-check.mjs";

type DayLabel = "Sat" | "Sun";

function argValue(name: string): string | null {
  const matched = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return matched ? matched.slice(name.length + 3) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`) || argValue(name) === "true";
}

async function main() {
  const phase = (argValue("phase") ?? "all") as ReviewPipelinePhase;
  const dayFilter = (argValue("day") ?? "") as DayLabel | "";
  const raceIdFilter = extractRaceId(argValue("race-id"));
  const nowArg = argValue("now");
  const includeArchives = hasFlag("include-archives") || argValue("scope") === "all";
  const refreshExisting = hasFlag("refresh-existing");
  const forceRetryNow = hasFlag("force-retry-now");
  const debug = hasFlag("debug");
  const now = nowArg ? new Date(nowArg) : new Date();
  let resolvedRaceIdFilter = raceIdFilter;
  if (Number.isNaN(now.getTime())) {
    throw new Error(`invalid --now value: ${nowArg}`);
  }

  if (phase === "snapshot" || phase === "all") {
    const identity = await verifyCurrentWeekRaceIdentities({
      now,
      dayFilter: dayFilter === "Sat" || dayFilter === "Sun" ? dayFilter : null,
      raceIdFilter,
    });
    console.log(`[review-pipeline] race identity ${JSON.stringify(identity)}`);
    const corrections = identity.corrected as Array<{ from: string; to: string }>;
    resolvedRaceIdFilter = corrections.find((item) =>
      item.from === raceIdFilter)?.to ?? raceIdFilter;
  }

  const result = await runReviewPipeline({
    phase,
    now,
    dayFilter: dayFilter === "Sat" || dayFilter === "Sun" ? dayFilter : null,
    raceIdFilter: resolvedRaceIdFilter,
    includeArchives,
    refreshExisting,
    forceRetryNow,
    debug,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
