import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const WEEKLY_RACES_PATH = path.join(ROOT, "data", "weekly-races.json");
const GENERATED_REVIEWS_PATH = path.join(ROOT, "data", "generated-reviews.json");

const ARG_DAY = process.argv.find((arg) => arg.startsWith("--day="))?.split("=")[1] ?? "";
const TARGET_DAY = ARG_DAY === "Sat" || ARG_DAY === "Sun" ? ARG_DAY : null;
const INCLUDE_ARCHIVES = process.argv.includes("--include-archives");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function decodeHtmlText(value) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value) {
  return String(value ?? "").replace(/<[^>]*>/g, " ");
}

function normalizeSpace(value) {
  return decodeHtmlText(stripTags(value)).replace(/\s+/g, " ").trim();
}

function normalizeName(value) {
  return normalizeSpace(value).toLowerCase().replace(/[\s　・･\-_.]/g, "");
}

function raceDisplayLabel(race) {
  return String(race?.label ?? "").replace(/\s*出馬表$/, "").trim() || String(race?.label ?? "");
}

function reviewHashtag(race) {
  const raw = String(race?.hashtag ?? "").trim().replace(/出馬表/g, "").replace(/\s+/g, "");
  if (raw && raw !== "#") {
    return raw.startsWith("#") ? raw : `#${raw}`;
  }

  const label = raceDisplayLabel(race).replace(/\s+/g, "");
  return label ? `#${label}` : "";
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "horse-race-sim-bot/2.0",
      accept: "text/html,application/xml,text/xml,*/*",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`fetch failed ${res.status}: ${url}`);
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "";
  const latin1Head = Buffer.from(bytes.slice(0, 4096)).toString("latin1");
  const charsetRaw =
    contentType.match(/charset=([^;]+)/i)?.[1]?.trim() ||
    latin1Head.match(/charset=["']?([a-zA-Z0-9._-]+)/i)?.[1] ||
    "utf-8";
  const charset = charsetRaw.toLowerCase() === "x-euc-jp" ? "euc-jp" : charsetRaw.toLowerCase();

  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function reviewKeyForRace(race) {
  return String(race?.raceId ?? race?.courseId ?? "");
}

function parseNumber(raw) {
  const cleaned = String(raw ?? "").replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseResultEntries(resultHtml) {
  const rows = [...String(resultHtml).matchAll(/<tr[^>]*class="[^"]*HorseList[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)].map(
    (match) => match[1]
  );

  return rows
    .map((row) => {
      const position = Number.parseInt(row.match(/<div class="Rank">(\d+)<\/div>/i)?.[1] ?? "", 10);
      if (!(position > 0)) return null;

      const gateNumber = Number.parseInt(row.match(/<td class="Num Waku\d+">\s*<div>(\d{1,2})<\/div>/i)?.[1] ?? "", 10);
      const horseNumber = Number.parseInt(row.match(/<td class="Num Txt_C">\s*<div>(\d{1,2})<\/div>/i)?.[1] ?? "", 10);
      const externalHorseId = row.match(/\/horse\/(\d+)\/?/i)?.[1] ?? "";
      const horseName = normalizeSpace(
        row.match(/<span class="HorseNameSpan">([\s\S]*?)<\/span>/i)?.[1] ??
          row.match(/<a[^>]*href="[^"]*\/horse\/\d+\/?[^"]*"[^>]*>([\s\S]*?)<\/a>/i)?.[1] ??
          ""
      );
      const jockey = normalizeSpace(
        row.match(/<span class="JockeyNameSpan">([\s\S]*?)<\/span>/i)?.[1] ??
          row.match(/\/jockey\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i)?.[1] ??
          ""
      );
      const timeCells = [...row.matchAll(/<td class="Time[^"]*">([\s\S]*?)<\/td>/gi)].map((match) =>
        normalizeSpace(match[1])
      );
      const popularity = Number.parseInt(row.match(/<span class="OddsPeople">(\d+)<\/span>/i)?.[1] ?? "", 10);
      const odds = parseNumber(row.match(/<td class="Odds Txt_R">[\s\S]*?<span[^>]*>\s*([\d.]+)\s*<\/span>/i)?.[1] ?? "");

      return {
        position,
        gateNumber: Number.isFinite(gateNumber) ? gateNumber : 0,
        horseNumber: Number.isFinite(horseNumber) ? horseNumber : 0,
        externalHorseId: String(externalHorseId),
        name: horseName,
        jockey,
        finishTime: timeCells[0] || "",
        margin: timeCells[1] || "",
        popularity: Number.isFinite(popularity) ? popularity : 0,
        odds: Number.isFinite(odds) ? Math.round(odds * 10) / 10 : 0,
      };
    })
    .filter(Boolean);
}

function parsePayoutRow(resultHtml, className) {
  const row = resultHtml.match(new RegExp(`<tr class="${className}">([\\s\\S]*?)<\\/tr>`, "i"))?.[1] ?? "";
  if (!row) return null;

  const resultNumbers = [...row.matchAll(/<span>(\d+)<\/span>/g)]
    .map((match) => Number.parseInt(match[1], 10))
    .filter(Number.isFinite);
  const payouts = [...row.matchAll(/<td class="Payout">[\s\S]*?<span>([\s\S]*?)<\/span>/gi)]
    .flatMap((match) => normalizeSpace(match[1]).split(/\s+/))
    .map((value) => parseNumber(value))
    .filter((value) => Number.isFinite(value));

  if (resultNumbers.length === 0 && payouts.length === 0) return null;
  return { resultNumbers, payouts };
}

function parsePairPayoutRow(resultHtml, className) {
  const row = resultHtml.match(new RegExp(`<tr class="${className}">([\\s\\S]*?)<\\/tr>`, "i"))?.[1] ?? "";
  if (!row) return null;

  const resultNumbers = [...row.matchAll(/<ul>([\s\S]*?)<\/ul>/gi)]
    .map((match) =>
      [...match[1].matchAll(/<span>(\d+)<\/span>/g)]
        .map((entry) => Number.parseInt(entry[1], 10))
        .filter(Number.isFinite)
        .slice(0, 2)
    )
    .filter((pair) => pair.length === 2);
  const payouts = [...row.matchAll(/<td class="Payout">[\s\S]*?<span>([\s\S]*?)<\/span>/gi)]
    .flatMap((match) => normalizeSpace(match[1]).split(/\s+/))
    .map((value) => parseNumber(value))
    .filter((value) => Number.isFinite(value));

  if (resultNumbers.length === 0 && payouts.length === 0) return null;
  return { resultNumbers, payouts };
}

function getCourseInnerTilt(race) {
  const id = String(race?.courseId ?? "").toLowerCase();
  if (id.includes("nakayama")) return 0.7;
  if (id.includes("chukyo")) return 0.2;
  if (id.includes("hanshin")) return 0.1;
  if (id.includes("tokyo")) return -0.2;
  if (id.includes("niigata")) return -0.4;
  return 0;
}

function isFrontStyle(style) {
  return style === "Nige" || style === "Senko";
}

function buildWinnerReasons(race, winnerHorse) {
  if (!winnerHorse) {
    return ["公式結果を取得できた"];
  }

  const reasons = [];
  const horses = Array.isArray(race?.horses) ? race.horses : [];
  const fieldSize = Math.max(horses.length, 1);
  const fieldAverageWeight = horses.reduce((sum, horse) => sum + Number(horse?.weight ?? 57), 0) / fieldSize;
  const distanceChange = Number(winnerHorse.distanceChange ?? 0);
  const gateNumber = Number(winnerHorse.gateNumber ?? 99);
  const straightLength = Number(race?.straightLength ?? 360);
  const hasTightTurns = getCourseInnerTilt(race) > 0.35 || straightLength < 360;

  if (distanceChange <= -200) reasons.push("距離短縮で追走負荷が軽くなった");
  if (distanceChange >= 200) reasons.push("距離延長でもスタミナが持続した");
  if (Number(winnerHorse.weight ?? 57) <= fieldAverageWeight - 1) reasons.push("相対的に軽い斤量が効いた");

  if (isFrontStyle(winnerHorse.runningStyle) && hasTightTurns) {
    reasons.push("先行力を生かしやすい舞台だった");
  } else if (!isFrontStyle(winnerHorse.runningStyle) && straightLength >= 400) {
    reasons.push("直線で末脚を生かせる条件だった");
  }

  if (gateNumber <= Math.ceil(fieldSize / 4) && hasTightTurns) reasons.push("内目の枠からロスなく運べた");
  if ((winnerHorse.lastRaceGradeScore ?? 2) >= 3 || (winnerHorse.recentTimeIndex ?? 0) >= 1.2) {
    reasons.push("近走の能力水準がこの相手では上位だった");
  }
  if ((winnerHorse.recentFormScore ?? 0) >= 2.5) reasons.push("近走内容の良さがそのまま結果につながった");
  if ((winnerHorse.realOdds ?? 0) >= 10 && ((winnerHorse.lastRaceGradeScore ?? 2) >= 3 || (winnerHorse.recentTimeIndex ?? 0) > 0)) {
    reasons.push("人気以上に能力を出せる下地があった");
  }

  return [...new Set(reasons)].slice(0, 3);
}

function buildReview(race, top3, winnerHorse) {
  const winner = top3[0];
  if (!winner) return null;

  const reasons = buildWinnerReasons(race, winnerHorse);
  const second = top3[1]?.name ?? "2着馬";
  const third = top3[2]?.name ?? "3着馬";
  const abilityLike = reasons.some((reason) => reason.includes("能力") || reason.includes("水準"));
  const conditionLike = reasons.some(
    (reason) => reason.includes("距離") || reason.includes("斤量") || reason.includes("舞台") || reason.includes("枠")
  );
  const verdict =
    abilityLike && conditionLike
      ? "能力と条件が噛み合って押し切った"
      : abilityLike
        ? "能力上位で押し切った"
        : "条件が噛み合って突き抜けた";
  const summary = `${winner.name}は${verdict}。${reasons.join("、")}。`;
  const winnerLabel =
    winner.popularity > 0 && winner.odds > 0
      ? `1着 ${winner.name}(${winner.popularity}番人気 ${winner.odds}倍)`
      : `1着 ${winner.name}`;

  const reviewBase = `【${raceDisplayLabel(race)}回顧】${winnerLabel} / 2着 ${second} / 3着 ${third}。${summary}`;
  const hashtag = reviewHashtag(race);
  const maxLength = hashtag ? 279 - hashtag.length : 280;
  const clipped = reviewBase.length > maxLength ? `${reviewBase.slice(0, maxLength - 1)}…` : reviewBase;

  return {
    reasons,
    summary,
    xPostText: hashtag ? `${clipped} ${hashtag}` : clipped,
  };
}

function mergeRaceResult(race, resultHtml) {
  const parsedFinishers = parseResultEntries(resultHtml);
  if (parsedFinishers.length === 0) return { race, reviewDraft: null };

  const horses = Array.isArray(race?.horses) ? race.horses : [];
  const horseByExternalId = new Map(
    horses.filter((horse) => horse.externalHorseId).map((horse) => [String(horse.externalHorseId), horse])
  );
  const horseByName = new Map(horses.map((horse) => [normalizeName(horse.name), horse]));

  const finishers = parsedFinishers.map((entry) => {
    const localHorse =
      horseByExternalId.get(String(entry.externalHorseId)) ??
      horseByName.get(normalizeName(entry.name)) ??
      null;

    return {
      ...entry,
      horseId: localHorse?.id ? String(localHorse.id) : undefined,
    };
  });

  const top3 = finishers.filter((entry) => entry.position > 0).sort((a, b) => a.position - b.position).slice(0, 3);
  if (top3.length === 0) return { race, reviewDraft: null };

  const winner = top3[0];
  const winnerHorse =
    (winner.horseId && horses.find((horse) => String(horse.id) === String(winner.horseId))) ??
    horseByName.get(normalizeName(winner.name)) ??
    null;
  const review = buildReview(race, top3, winnerHorse);
  const payouts = {
    tansho: parsePayoutRow(resultHtml, "Tansho"),
    fukusho: parsePayoutRow(resultHtml, "Fukusho"),
    wide: parsePairPayoutRow(resultHtml, "Wide"),
  };

  const nextResult = {
    winnerHorseId: winner.horseId,
    winnerHorseName: winner.name,
    top3HorseIds: top3.map((entry) => entry.horseId).filter(Boolean),
    top3HorseNames: top3.map((entry) => entry.name),
    finishers,
    payouts,
  };

  const prevResultComparable = race.result ? { ...race.result, updatedAt: undefined } : null;
  const nextResultComparable = { ...nextResult, updatedAt: undefined };
  const resultUpdatedAt =
    prevResultComparable && JSON.stringify(prevResultComparable) === JSON.stringify(nextResultComparable)
      ? race.result.updatedAt
      : new Date().toISOString();

  const nextRace = {
    ...race,
    result: {
      updatedAt: resultUpdatedAt,
      ...nextResult,
    },
  };

  return { race: nextRace, reviewDraft: review };
}

async function updateRace(race) {
  if (!race?.raceId || !Array.isArray(race.horses) || race.horses.length === 0) {
    return { race, reviewDraft: null };
  }

  try {
    const resultHtml = await fetchText(`https://race.netkeiba.com/race/result.html?race_id=${race.raceId}`);
    return mergeRaceResult(race, resultHtml);
  } catch {
    return { race, reviewDraft: null };
  }
}

function updateGeneratedReviewEntry(generatedReviews, race, updatedRace, reviewDraft) {
  if (!reviewDraft) return false;

  const key = reviewKeyForRace(updatedRace);
  const previousReview = generatedReviews[key] ?? race.review ?? null;
  const nextReviewComparable = {
    raceId: String(updatedRace.raceId ?? ""),
    courseId: String(updatedRace.courseId ?? ""),
    summary: String(reviewDraft.summary ?? ""),
    xPostText: String(reviewDraft.xPostText ?? ""),
    reasons: Array.isArray(reviewDraft.reasons) ? reviewDraft.reasons.map((reason) => String(reason)) : [],
  };
  const previousComparable = previousReview
    ? {
        raceId: String(previousReview.raceId ?? updatedRace.raceId ?? ""),
        courseId: String(previousReview.courseId ?? updatedRace.courseId ?? ""),
        summary: String(previousReview.summary ?? ""),
        xPostText: String(previousReview.xPostText ?? ""),
        reasons: Array.isArray(previousReview.reasons) ? previousReview.reasons.map((reason) => String(reason)) : [],
      }
    : null;

  generatedReviews[key] = {
    ...nextReviewComparable,
    updatedAt:
      previousComparable && JSON.stringify(previousComparable) === JSON.stringify(nextReviewComparable)
        ? String(previousReview.updatedAt ?? "")
        : new Date().toISOString(),
  };

  return !previousComparable || JSON.stringify(previousComparable) !== JSON.stringify(nextReviewComparable);
}

async function updateRaceCollection(races, generatedReviews) {
  let changed = false;
  let reviewChanged = false;
  const nextRaces = [];

  for (const race of races) {
    if (TARGET_DAY && race.day !== TARGET_DAY) {
      nextRaces.push(race);
      continue;
    }

    const { race: updatedRace, reviewDraft } = await updateRace(race);
    if (JSON.stringify(updatedRace) !== JSON.stringify(race)) {
      changed = true;
    }

    if (updateGeneratedReviewEntry(generatedReviews, race, updatedRace, reviewDraft)) {
      reviewChanged = true;
    }

    nextRaces.push(updatedRace);
  }

  return { nextRaces, changed, reviewChanged };
}

async function main() {
  const weekly = await readJson(WEEKLY_RACES_PATH, { currentWeek: { races: [] }, archives: [] });
  const generatedReviews = await readJson(GENERATED_REVIEWS_PATH, {});
  const originalGeneratedReviews = JSON.stringify(generatedReviews);

  const currentWeekRaces = Array.isArray(weekly.currentWeek?.races) ? weekly.currentWeek.races : [];
  const currentWeekUpdate = await updateRaceCollection(currentWeekRaces, generatedReviews);

  let archivesChanged = false;
  let archiveReviewChanged = false;
  let nextArchives = Array.isArray(weekly.archives) ? weekly.archives : [];

  if (INCLUDE_ARCHIVES) {
    nextArchives = [];
    for (const archive of Array.isArray(weekly.archives) ? weekly.archives : []) {
      const archiveRaces = Array.isArray(archive?.races) ? archive.races : [];
      const archiveUpdate = await updateRaceCollection(archiveRaces, generatedReviews);
      if (archiveUpdate.changed) archivesChanged = true;
      if (archiveUpdate.reviewChanged) archiveReviewChanged = true;
      nextArchives.push({
        ...archive,
        races: archiveUpdate.nextRaces,
      });
    }
  }

  const changed = currentWeekUpdate.changed || archivesChanged;
  const reviewsChanged =
    currentWeekUpdate.reviewChanged ||
    archiveReviewChanged ||
    JSON.stringify(generatedReviews) !== originalGeneratedReviews;

  if (!changed && !reviewsChanged) {
    console.log(
      `[update-race-results] no changes${TARGET_DAY ? ` day=${TARGET_DAY}` : ""}${INCLUDE_ARCHIVES ? " includeArchives=true" : ""}`
    );
    return;
  }

  const next = {
    ...weekly,
    currentWeek: {
      ...weekly.currentWeek,
      updatedAt: new Date().toISOString(),
      races: currentWeekUpdate.nextRaces,
    },
    archives: nextArchives,
  };

  await fs.writeFile(WEEKLY_RACES_PATH, JSON.stringify(next, null, 2), "utf8");
  await fs.writeFile(GENERATED_REVIEWS_PATH, JSON.stringify(generatedReviews, null, 2), "utf8");
  const updatedCurrentCount = currentWeekUpdate.nextRaces.filter((race) => race.result?.winnerHorseName).length;
  const updatedArchiveCount = INCLUDE_ARCHIVES
    ? nextArchives.flatMap((archive) => archive?.races ?? []).filter((race) => race.result?.winnerHorseName).length
    : 0;
  console.log(
    `[update-race-results] updatedCurrent=${updatedCurrentCount}${
      INCLUDE_ARCHIVES ? ` updatedArchives=${updatedArchiveCount}` : ""
    }${TARGET_DAY ? ` day=${TARGET_DAY}` : ""}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
