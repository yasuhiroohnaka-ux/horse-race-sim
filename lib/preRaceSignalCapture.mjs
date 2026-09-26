import { getRaceStartTimestamp } from "./raceTiming.mjs";

function text(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function horseKey(value) {
  return text(value).normalize("NFKC").replace(/[\s　・･\-_.]/g, "").toLowerCase();
}

function positiveNumber(value) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function signedNumber(value) {
  const raw = String(value ?? "").replace(/[＋−]/g, (mark) => mark === "＋" ? "+" : "-").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseShutubaSignals(html) {
  const byGate = new Map();
  const rows = String(html ?? "").match(/<tr[^>]*class="[^"]*HorseList[^"]*"[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  for (const row of rows) {
    const gate = Number(row.match(/class="Umaban\d*[^"]*"[^>]*>\s*(\d{1,2})\s*<\/td>/i)?.[1]);
    if (!Number.isInteger(gate) || gate <= 0) continue;
    const name = text(row.match(/<span class="HorseName"[\s\S]*?<a[^>]*title="([^"]+)"/i)?.[1] ??
      row.match(/<td class="HorseInfo"[\s\S]*?<a[^>]*title="([^"]+)"/i)?.[1] ??
      row.match(/<a[^>]*href="[^"]*\/horse\/\d+[^>]*>([\s\S]*?)<\/a>/i)?.[1]);
    if (!name) continue;
    const weightCell = row.match(/<td[^>]*class="[^"]*Weight[^"]*"[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? "";
    const weight = positiveNumber(weightCell.match(/^\s*(\d{3})(?=<|\s|$)/)?.[1]);
    const weightDiff = signedNumber(weightCell.match(/<small>\s*\(([+＋\-−]?\d+)\)\s*<\/small>/i)?.[1]);
    const odds = positiveNumber(row.match(/id="odds-[^"]+"[^>]*>\s*(\d+(?:\.\d+)?)\s*<\/span>/i)?.[1]);
    byGate.set(gate, {
      gateNumber: gate,
      externalHorseId: row.match(/\/horse\/(\d+)\/?/i)?.[1] ?? null,
      horseName: name,
      odds,
      bodyWeightKg: weight,
      bodyWeightDiffKg: weightDiff,
    });
  }
  return byGate;
}

export function parseOreproOdds(html) {
  const byGate = new Map();
  const rows = String(html ?? "").match(/<tr[^>]*class="[^"]*HorseList[^"]*"[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  for (const row of rows) {
    const gate = Number(row.match(/class="Waku\d+[^"]*"[^>]*>\s*(\d{1,2})\s*<\/td>/i)?.[1]);
    const name = text(row.match(/<dt class="Horse">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1]);
    const cell = row.match(/<td class="Popular">([\s\S]*?)<\/td>/i)?.[1] ?? "";
    const odds = positiveNumber(cell.match(/<span[^>]*>\s*(\d+(?:\.\d+)?)\s*<\/span>/i)?.[1]);
    if (Number.isInteger(gate) && gate > 0 && name && odds !== null) byGate.set(gate, { name, odds });
  }
  return byGate;
}

export function parseTrainingSignals(html) {
  const byHorseId = new Map();
  const sections = String(html ?? "").split(/<td[^>]*class="[^"]*Horse_Info[^"]*"[^>]*>/i).slice(1);
  for (const section of sections) {
    const externalHorseId = section.match(/\/horse\/(\d+)\/?/i)?.[1];
    const horseName = text(section.match(/<div class="Horse_Name">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1]);
    const row = section.match(/<tr[^>]*class="[^"]*OikiriDataHead1[^"]*HorseList[^"]*"[^>]*>([\s\S]*?)<\/tr>/i)?.[1] ?? "";
    if (!externalHorseId || !horseName || !row) continue;
    const date = row.match(/class="Training_Day"[^>]*>\s*(\d{4}\/\d{2}\/\d{2})/i)?.[1]?.replaceAll("/", "-") ?? null;
    const course = text(row.match(/class="Training_Day"[^>]*>[\s\S]*?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i)?.[1]);
    const timeCell = row.match(/class="TrainingTimeData[^\"]*"[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? "";
    const times = [...timeCell.matchAll(/<li[^>]*>\s*([\d.\-]+)\s*<span class="RapTime">\s*\(?([\d.]*)\)?<\/span>/gi)];
    const cumulativeSeconds = times.map((match) => positiveNumber(match[1]));
    const lapSeconds = times.map((match) => positiveNumber(match[2]));
    const companionNote = text(timeCell.match(/<div class="Comment_Cell">([\s\S]*?)<\/div>/i)?.[1]);
    const outcomes = [companionNote.includes("先着") ? 1 : null, companionNote.includes("併入") ? 0 : null,
      companionNote.includes("遅れ") ? -1 : null].filter((value) => value !== null);
    const companionOutcome = outcomes.length === 1 ? outcomes[0] : null;
    const final1fSeconds = [...cumulativeSeconds].reverse().find((value) => value !== null) ?? null;
    byHorseId.set(externalHorseId, {
      horseName, date, course: course || null, cumulativeSeconds, lapSeconds,
      final1fSeconds, companionOutcome,
      load: text(row.match(/class="TrainingLoad"[^>]*>([\s\S]*?)<\/td>/i)?.[1]) || null,
      grade: text(row.match(/class="Rank_[A-D]"[^>]*>([\s\S]*?)<\/td>/i)?.[1]) || null,
    });
  }
  return byHorseId;
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length < 2) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value) {
  return value === null || !Number.isFinite(value) ? null : Math.round(value * 10000) / 10000;
}

/** @param {{race: any, capturedAt: string, sourceTimes: Record<string, string | null>,
 * shutubaHtml?: string, oreproHtml?: string, oikiriHtml?: string, previousCaptures?: any[]}} params */
export function buildPreRaceSignalCapture({ race, capturedAt, sourceTimes, shutubaHtml, oreproHtml, oikiriHtml, previousCaptures = [] }) {
  const startAt = getRaceStartTimestamp(race);
  const capturedMs = Date.parse(capturedAt);
  if (!startAt || !Number.isFinite(capturedMs) || capturedMs >= startAt) {
    throw new RangeError("signal capture must finish before scheduled start");
  }
  const validSourceTime = (source) => {
    const value = sourceTimes?.[source] ?? null;
    const ms = Date.parse(value ?? "");
    return Number.isFinite(ms) && ms <= capturedMs && ms < startAt ? value : null;
  };
  const shutubaAt = validSourceTime("shutuba");
  const oreproAt = validSourceTime("orepro");
  const oikiriAt = validSourceTime("oikiri");
  const shutuba = shutubaAt ? parseShutubaSignals(shutubaHtml) : new Map();
  const orepro = oreproAt ? parseOreproOdds(oreproHtml) : new Map();
  const training = oikiriAt ? parseTrainingSignals(oikiriHtml) : new Map();
  const previous = [...previousCaptures]
    .filter((capture) => String(capture.raceId) === String(race.raceId) &&
      Number.isFinite(Date.parse(capture.capturedAt)) && Date.parse(capture.capturedAt) < capturedMs &&
      Date.parse(capture.capturedAt) < startAt)
    .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  const rows = (race.horses ?? []).map((horse) => {
    const fromPage = shutuba.get(Number(horse.gateNumber));
    const matched = fromPage && horseKey(fromPage.horseName) === horseKey(horse.name) ? fromPage : null;
    const oreproEntry = orepro.get(Number(horse.gateNumber));
    const matchedOrepro = oreproEntry && horseKey(oreproEntry.name) === horseKey(horse.name) ? oreproEntry : null;
    const work = training.get(String(horse.externalHorseId ?? ""));
    const matchedWork = work && horseKey(work.horseName) === horseKey(horse.name) &&
      work.date && work.date <= race.raceDate ? work : null;
    const odds = matched?.odds ?? matchedOrepro?.odds ?? null;
    const oddsSource = matched?.odds != null ? "netkeiba_shutuba" : matchedOrepro?.odds != null ? "netkeiba_orepro" : null;
    const baseline = previous.map((capture) => (capture.horses ?? []).find((entry) =>
      String(entry.horseId) === String(horse.id) && entry.oddsSource === oddsSource &&
      positiveNumber(entry.odds) !== null &&
      Number.isFinite(Date.parse(entry.oddsFetchedAt ?? "")) &&
      Date.parse(entry.oddsFetchedAt) <= Date.parse(capture.capturedAt) &&
      Date.parse(entry.oddsFetchedAt) < startAt))
      .find(Boolean);
    const oddsMoveLog = odds !== null && baseline?.odds ? Math.log(baseline.odds / odds) : null;
    return {
      horseId: String(horse.id), externalHorseId: String(horse.externalHorseId ?? "") || null,
      gateNumber: Number(horse.gateNumber), horseName: String(horse.name),
      odds, oddsSource, oddsFetchedAt: oddsSource === "netkeiba_shutuba" ? shutubaAt : oddsSource ? oreproAt : null,
      bodyWeightKg: matched?.bodyWeightKg ?? null,
      bodyWeightDiffKg: matched?.bodyWeightDiffKg ?? null,
      bodyWeightFetchedAt: matched?.bodyWeightKg != null ? shutubaAt : null,
      training: matchedWork,
      trainingFetchedAt: matchedWork ? oikiriAt : null,
      relative: { oddsMoveLog: round(oddsMoveLog), oddsMoveVsField: null,
        bodyWeightVsFieldKg: null, bodyWeightDiffVsFieldKg: null,
        trainingFinal1fVsCourseSeconds: null, companionVsField: null },
    };
  });
  const oddsMoveMedian = median(rows.map((row) => row.relative.oddsMoveLog));
  const weightMedian = median(rows.map((row) => row.bodyWeightKg));
  const weightDiffMedian = median(rows.map((row) => row.bodyWeightDiffKg));
  const companionMedian = median(rows.map((row) => row.training?.companionOutcome));
  const trainingMedianByCourse = new Map();
  for (const course of new Set(rows.map((row) => row.training?.course).filter(Boolean))) {
    trainingMedianByCourse.set(course, median(rows.filter((row) => row.training?.course === course)
      .map((row) => row.training?.final1fSeconds)));
  }
  for (const row of rows) {
    row.relative.oddsMoveVsField = oddsMoveMedian === null || row.relative.oddsMoveLog === null ? null :
      round(row.relative.oddsMoveLog - oddsMoveMedian);
    row.relative.bodyWeightVsFieldKg = weightMedian === null || row.bodyWeightKg === null ? null :
      round(row.bodyWeightKg - weightMedian);
    row.relative.bodyWeightDiffVsFieldKg = weightDiffMedian === null || row.bodyWeightDiffKg === null ? null :
      round(row.bodyWeightDiffKg - weightDiffMedian);
    const courseMedian = trainingMedianByCourse.get(row.training?.course) ?? null;
    row.relative.trainingFinal1fVsCourseSeconds = courseMedian === null || row.training?.final1fSeconds == null ? null :
      round(courseMedian - row.training.final1fSeconds);
    row.relative.companionVsField = companionMedian === null || row.training?.companionOutcome == null ? null :
      round(row.training.companionOutcome - companionMedian);
  }
  return {
    schemaVersion: "pre-race-signals-v1", raceId: String(race.raceId), raceDate: race.raceDate,
    scheduledStartTime: new Date(startAt).toISOString(), capturedAt,
    fieldComplete: Number.isInteger(Number(race.expectedFieldSize)) && Number(race.expectedFieldSize) > 0 ?
      rows.length === Number(race.expectedFieldSize) : null,
    sources: { shutuba: { fetchedAt: shutubaAt, url: `https://race.netkeiba.com/race/shutuba.html?race_id=${race.raceId}` },
      orepro: { fetchedAt: oreproAt, url: `https://orepro.netkeiba.com/bet/shutuba.html?race_id=${race.raceId}` },
      oikiri: { fetchedAt: oikiriAt, url: `https://race.netkeiba.com/race/oikiri.html?race_id=${race.raceId}&type=1` } },
    coverage: { odds: rows.filter((row) => row.odds !== null).length,
      bodyWeight: rows.filter((row) => row.bodyWeightKg !== null).length,
      training: rows.filter((row) => row.training !== null).length },
    horses: rows,
  };
}

/**
 * Count distinct races with usable race-relative observations. These are collection
 * milestones, not a model-selection result; B2 must still freeze its cutoff and split.
 * @param {any[]} captures
 */
export function summarizeSignalReadiness(captures) {
  const byRace = new Map();
  for (const capture of captures) {
    const at = Date.parse(capture?.capturedAt ?? "");
    const start = Date.parse(capture?.scheduledStartTime ?? "");
    if (!capture?.raceId || !Number.isFinite(at) || !Number.isFinite(start) || at >= start) continue;
    const sourceHorses = Array.isArray(capture.horses) ? capture.horses : [];
    const horses = sourceHorses.filter((horse) => {
      const times = [horse.oddsFetchedAt, horse.bodyWeightFetchedAt, horse.trainingFetchedAt]
        .filter(Boolean).map((value) => Date.parse(value));
      return times.every((time) => Number.isFinite(time) && time <= at && time < start);
    });
    const observed = byRace.get(String(capture.raceId)) ?? {
      oddsMovement: false, bodyWeight: false, trainingFinal1f: false,
      companion: false, fullOdds: false, fullBodyWeight: false, fullTraining: false,
    };
    observed.oddsMovement ||= horses.some((horse) => horse.relative?.oddsMoveVsField != null);
    observed.bodyWeight ||= horses.some((horse) => horse.relative?.bodyWeightVsFieldKg != null &&
      horse.relative?.bodyWeightDiffVsFieldKg != null);
    observed.trainingFinal1f ||= horses.some((horse) => horse.relative?.trainingFinal1fVsCourseSeconds != null);
    observed.companion ||= horses.some((horse) => horse.relative?.companionVsField != null);
    const allTrackedHorsesValid = horses.length > 0 && horses.length === sourceHorses.length;
    observed.fullOdds ||= allTrackedHorsesValid && horses.every((horse) => horse.odds != null);
    observed.fullBodyWeight ||= allTrackedHorsesValid && horses.every((horse) =>
      horse.bodyWeightKg != null && horse.bodyWeightDiffKg != null);
    observed.fullTraining ||= allTrackedHorsesValid && horses.every((horse) => horse.training != null);
    byRace.set(String(capture.raceId), observed);
  }
  const count = (key) => [...byRace.values()].filter((race) => race[key]).length;
  const jointRelativeRaces = [...byRace.values()].filter((race) =>
    race.oddsMovement && race.bodyWeight && race.trainingFinal1f).length;
  return {
    raceCount: byRace.size, minimumRaces: 100, jointRelativeRaces,
    relative: {
      oddsMovement: count("oddsMovement"), bodyWeight: count("bodyWeight"),
      trainingFinal1f: count("trainingFinal1f"), companion: count("companion"),
    },
    trackedEntriesComplete: { odds: count("fullOdds"), bodyWeight: count("fullBodyWeight"),
      training: count("fullTraining") },
    readyForB2: jointRelativeRaces >= 100,
  };
}
