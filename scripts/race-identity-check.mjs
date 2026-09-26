import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseShutubaSignals } from "../lib/preRaceSignalCapture.mjs";
import { getRaceStartTimestamp } from "../lib/raceTiming.mjs";
import { terminalizeIncorrectRaceRecord } from "./repair-race-identity-f4.mjs";

function normalized(value) {
  return String(value ?? "").normalize("NFKC").replace(/[\s\u3000]/g, "")
    .replace(/\((?:G[1-3]|L|OP)\)$/i, "").trim();
}

export function parseRacePageIdentity(html) {
  const title = String(html ?? "").match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const label = title.split("|")[0].replace(/<[^>]*>/g, "")
    .replace(/&amp;/gi, "&").replace(/\s*出馬表\s*$/i, "").trim();
  const horses = [...parseShutubaSignals(html).values()];
  const raceData = String(html ?? "").match(/class="RaceData01"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
  const time = raceData.replace(/<[^>]*>/g, " ").match(/(\d{1,2}):(\d{2})\s*発走/);
  return { label, fieldSize: horses.length || null,
    horseNames: horses.map((horse) => normalized(horse.horseName)),
    scheduledStartTime: time ? `${time[1].padStart(2, "0")}:${time[2]}` : null };
}

export async function resolveRaceIdentity({ raceId, label, horseNames, fetchHtml }) {
  const expectedLabel = normalized(label);
  const expectedNames = new Set((horseNames ?? []).map(normalized).filter(Boolean));
  const read = async (id) => parseRacePageIdentity(await fetchHtml(id));
  let original;
  try { original = await read(raceId); }
  catch (error) { return { status: "unavailable", raceId, error: String(error) }; }
  if (!original.label || !original.fieldSize) {
    return { status: "unavailable", raceId, error: "race name or field size unavailable" };
  }
  if (normalized(original.label) === expectedLabel) {
    return { status: "verified", raceId, page: original };
  }

  if (/^\d{12}$/.test(String(raceId))) {
    const prefix = String(raceId).slice(0, 10);
    for (let number = 1; number <= 12; number++) {
      const candidateId = `${prefix}${String(number).padStart(2, "0")}`;
      if (candidateId === raceId) continue;
      let page;
      try { page = await read(candidateId); }
      catch { continue; }
      if (normalized(page.label) !== expectedLabel || page.fieldSize !== expectedNames.size) continue;
      if (page.horseNames.length !== expectedNames.size ||
        !page.horseNames.every((name) => expectedNames.has(name))) continue;
      return { status: "corrected", raceId: candidateId, previousRaceId: raceId, page: page, observedLabel: original.label };
    }
  }
  return { status: "mismatch", raceId, observedLabel: original.label,
    observedFieldSize: original.fieldSize };
}

async function fetchShutubaHtml(raceId) {
  const url = `https://race.netkeiba.com/race/shutuba.html?race_id=${raceId}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10000),
    headers: { "user-agent": "horse-race-sim-bot/1.0", accept: "text/html,*/*" } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "";
  const head = Buffer.from(bytes.slice(0, 4096)).toString("latin1");
  const charset = (contentType.match(/charset=([^;]+)/i)?.[1] ??
    head.match(/charset=["']?([a-zA-Z0-9._-]+)/i)?.[1] ?? "utf-8").trim().toLowerCase();
  return new TextDecoder(charset === "x-euc-jp" ? "euc-jp" : charset).decode(bytes);
}

function preserveJsonStyle(raw, value) {
  const newline = raw.includes("\r\n") ? "\r\n" : "\n";
  const json = JSON.stringify(value, null, 2).replaceAll("\n", newline);
  return raw.endsWith("\n") ? json + newline : json;
}

/** @param {{now?: Date, dayFilter?: "Sat" | "Sun" | null, raceIdFilter?: string | null,
 * fetchHtml?: (raceId: string) => Promise<string>, root?: string}} options */
export async function verifyCurrentWeekRaceIdentities({ now = new Date(), dayFilter = null,
  raceIdFilter = null, fetchHtml = fetchShutubaHtml, root = process.cwd() } = {}) {
  const weeklyPath = path.join(root, "data", "weekly-races.json");
  const raw = await fs.readFile(weeklyPath, "utf8");
  const weekly = JSON.parse(raw);
  const races = weekly.currentWeek?.races ?? [];
  const report = { verified: 0, corrected: [], mismatched: [], checkedFieldSizes: 0, terminalReviewIds: [] };
  let changed = false;
  for (const race of races) {
    if (dayFilter && race.day !== dayFilter) continue;
    if (raceIdFilter && String(race.raceId) !== String(raceIdFilter)) continue;
    const startAt = getRaceStartTimestamp(race);
    if (startAt === null || now.getTime() >= startAt) continue;
    if (race.excludedReason && race.excludedReason !== "INCORRECT_RACE_ID") continue;
    const result = await resolveRaceIdentity({ raceId: race.raceId, label: race.label,
      horseNames: race.horses?.map((horse) => horse.name), fetchHtml });
    if (result.status === "unavailable") {
      throw new Error(`race identity unavailable for ${race.raceId}: ${result.error}`);
    }
    if (result.status === "mismatch") {
      race.excludedReason = "INCORRECT_RACE_ID";
      report.mismatched.push({ raceId: race.raceId, label: race.label,
        observedLabel: result.observedLabel });
      changed = true;
      continue;
    }
    report.verified++;
    if (race.excludedReason === "INCORRECT_RACE_ID") {
      delete race.excludedReason;
      changed = true;
    }
    if (result.page.fieldSize && race.expectedFieldSize !== result.page.fieldSize) {
      race.expectedFieldSize = result.page.fieldSize;
      report.checkedFieldSizes++;
      changed = true;
    }
    if (result.status === "corrected") {
      const oldId = String(race.raceId);
      if (races.some((other) => other !== race && String(other.raceId) === result.raceId)) {
        race.excludedReason = "SUPERSEDED_RACE_ID";
      } else {
        race.raceId = result.raceId;
        race.courseId = String(race.courseId).replace(oldId, result.raceId);
        race.raceNumber = Number(result.raceId.slice(-2));
        if (result.page.scheduledStartTime) race.scheduledStartTime = result.page.scheduledStartTime;
      }
      report.corrected.push({ from: oldId, to: result.raceId });
      changed = true;
    }
  }
  if (changed) {
    await fs.writeFile(weeklyPath, preserveJsonStyle(raw, weekly), "utf8");
    const reviewPath = path.join(root, "data", "review-records.json");
    const reviewRaw = await fs.readFile(reviewPath, "utf8").catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (reviewRaw !== null) {
      const reviewStore = JSON.parse(reviewRaw);
      for (const raceId of [...report.corrected.map((item) => item.from),
        ...report.mismatched.map((item) => item.raceId)]) {
        const record = reviewStore.records?.[raceId];
        if (!record) continue;
        terminalizeIncorrectRaceRecord(record);
        report.terminalReviewIds.push(raceId);
      }
      if (report.terminalReviewIds.length > 0) {
        await fs.writeFile(reviewPath, preserveJsonStyle(reviewRaw, reviewStore), "utf8");
      }
    }
    execFileSync(process.execPath, [path.join(root, "scripts", "sync-race-schedule.mjs")],
      { cwd: root, stdio: "inherit" });
  }
  return report;
}
