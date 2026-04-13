import { extractRaceId } from "@/lib/reviewRecords";
import { runReviewPipeline, type ReviewPipelinePhase } from "@/lib/reviewPipeline";

type DayLabel = "Sat" | "Sun";

function argValue(name: string): string | null {
  const matched = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return matched ? matched.slice(name.length + 3) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`) || argValue(name) === "true";
}

function jstNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
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
  const now = nowArg ? new Date(nowArg) : jstNow();
  if (Number.isNaN(now.getTime())) {
    throw new Error(`invalid --now value: ${nowArg}`);
  }

  const result = await runReviewPipeline({
    phase,
    now,
    dayFilter: dayFilter === "Sat" || dayFilter === "Sun" ? dayFilter : null,
    raceIdFilter,
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
