import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dayFromRaceDate } from "./race-consistency-audit.mjs";

const INCORRECT_RACE_IDS = new Set(["202601010310", "202609040209", "202609040509"]);

export function terminalizeIncorrectRaceRecord(record) {
  record.excludedReason = "INCORRECT_RACE_ID";
  record.status = "review_failed";
  record.reviewReady = false;
  record.livePreRaceEligible = false;
  record.missingReasons = ["INCORRECT_RACE_ID"];
  record.lastError = "INCORRECT_RACE_ID";
  record.nextRetryAt = null;
}

export function repairRaceIdentityRecords(weekly, reviewStore) {
  const correctedDayRaceIds = [];
  const excludedRaceIds = [];
  const terminalReviewIds = [];

  for (const week of [weekly.currentWeek, ...(weekly.archives ?? [])]) {
    for (const race of week?.races ?? []) {
      const day = dayFromRaceDate(race.raceDate);
      if (day && race.day !== day) {
        race.day = day;
        correctedDayRaceIds.push(String(race.raceId));
      }
      if (INCORRECT_RACE_IDS.has(String(race.raceId)) && race.excludedReason !== "INCORRECT_RACE_ID") {
        race.excludedReason = "INCORRECT_RACE_ID";
        excludedRaceIds.push(String(race.raceId));
      }
    }
  }

  for (const [raceId, record] of Object.entries(reviewStore.records ?? {})) {
    const day = dayFromRaceDate(record.meta?.raceDate);
    if (day && record.meta.day !== day) record.meta.day = day;
    if (!INCORRECT_RACE_IDS.has(raceId)) continue;
    terminalizeIncorrectRaceRecord(record);
    terminalReviewIds.push(raceId);
  }

  return { correctedDayRaceIds, excludedRaceIds, terminalReviewIds };
}

function preserveJsonStyle(raw, value) {
  const newline = raw.includes("\r\n") ? "\r\n" : "\n";
  const json = JSON.stringify(value, null, 2).replaceAll("\n", newline);
  return raw.endsWith("\n") ? json + newline : json;
}

async function main() {
  const weeklyPath = path.join(process.cwd(), "data", "weekly-races.json");
  const reviewPath = path.join(process.cwd(), "data", "review-records.json");
  const [weeklyRaw, reviewRaw] = await Promise.all([
    fs.readFile(weeklyPath, "utf8"), fs.readFile(reviewPath, "utf8"),
  ]);
  const weekly = JSON.parse(weeklyRaw);
  const reviewStore = JSON.parse(reviewRaw);
  const report = repairRaceIdentityRecords(weekly, reviewStore);
  for (const raceId of INCORRECT_RACE_IDS) {
    if (!report.terminalReviewIds.includes(raceId)) {
      throw new Error(`missing review record for known incorrect race ID: ${raceId}`);
    }
  }
  await fs.writeFile(weeklyPath, preserveJsonStyle(weeklyRaw, weekly), "utf8");
  await fs.writeFile(reviewPath, preserveJsonStyle(reviewRaw, reviewStore), "utf8");
  console.log(JSON.stringify({
    correctedDayLabels: report.correctedDayRaceIds.length,
    excludedRaceIds: report.excludedRaceIds,
    terminalReviewIds: report.terminalReviewIds,
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
