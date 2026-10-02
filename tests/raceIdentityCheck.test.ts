import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseRacePageIdentity, resolveRaceIdentity, verifyCurrentWeekRaceIdentities } from "../scripts/race-identity-check.mjs";
import { parseShutubaSignals } from "../lib/preRaceSignalCapture.mjs";

function page(label: string, names: string[], { raceId = "202609040208", drawn = true } = {}) {
  const rows = names.map((name, index) =>
    `<tr class="HorseList"><td class="Umaban1">${drawn ? index + 1 : ""}</td>` +
    `<td class="HorseInfo"><a href="/horse/${100 + index}" title="${name}">${name}</a></td></tr>`).join("");
  return `<link rel="canonical" href="https://race.netkeiba.com/race/shutuba.html?race_id=${raceId}">` +
    `<title>${label} 出馬表 | netkeiba</title><div class="RaceData01">13:50 発走</div>` +
    `<div class="RaceData02"><span>${names.length}頭</span></div>` +
    `<table class="Shutuba_Table RaceTable01 ShutubaTable">${rows}</table>`;
}

test("wrong race name is repaired only by a same-meeting race with the exact roster", async () => {
  const pages = new Map([
    ["202609040209", page("3歳以上1勝クラス", ["別馬", "別馬2"], { raceId: "202609040209" })],
    ["202609040208", page("武田尾特別(2勝クラス)", ["アルファ", "ベータ"])],
  ]);
  const result = await resolveRaceIdentity({ raceId: "202609040209",
    label: "武田尾特別(2勝クラス)", horseNames: ["アルファ", "ベータ"],
    fetchHtml: async (id: string) => {
      const html = pages.get(id);
      if (!html) throw new Error("not found");
      return html;
    } });
  assert.equal(result.status, "corrected");
  assert.equal(result.raceId, "202609040208");

  const noMatch = await resolveRaceIdentity({ raceId: "202609040209",
    label: "武田尾特別(2勝クラス)", horseNames: ["アルファ", "別馬"],
    fetchHtml: async (id: string) => {
      const html = pages.get(id);
      if (!html) throw new Error("not found");
      return html;
    } });
  assert.equal(noMatch.status, "mismatch");
});

test("matching name retains the ID and reports source field size", async () => {
  const result = await resolveRaceIdentity({ raceId: "202609040208",
    label: "武田尾特別(2勝クラス)", horseNames: ["アルファ"],
    fetchHtml: async () => page("武田尾特別(2勝クラス)", ["アルファ", "ベータ"]) });
  assert.equal(result.status, "verified");
  assert.ok(result.page);
  assert.equal(result.page.fieldSize, 2);
});

test("grade suffix on the source page is not treated as a different race", async () => {
  const result = await resolveRaceIdentity({ raceId: "202606040911",
    label: "スプリンターズS", horseNames: ["アルファ", "ベータ"],
    fetchHtml: async () => page("スプリンターズS(G1)", ["アルファ", "ベータ"], { raceId: "202606040911" }) });
  assert.equal(result.status, "verified");
});

test("public pre-draw fixture verifies all 15 runners without supplying numbered signals", async () => {
  const html = await fs.readFile(new URL("./fixtures/shutuba-before-draw.html", import.meta.url), "utf8");
  const identity = parseRacePageIdentity(html);
  assert.equal(identity.fieldSize, 15);
  assert.equal(identity.horseNames.length, 15);
  assert.equal(identity.horseNames[0], "イヌボウノウタゴエ");
  assert.equal(identity.scheduledStartTime, "14:35");
  assert.equal(parseShutubaSignals(html).size, 0);
  const result = await resolveRaceIdentity({ raceId: "202605040209", label: "tvk賞(2勝クラス)",
    horseNames: ["イヌボウノウタゴエ"], fetchHtml: async () => html });
  assert.equal(result.status, "verified");
  assert.equal(result.page?.fieldSize, 15);
});

test("field identity is independent of unpublished horse-number placeholders", async () => {
  for (const placeholder of ["", " ", "&nbsp;", "-", "--", "未定", "0"]) {
    const html = page("対象レース", ["アルファ", "ベータ"], { drawn: false })
      .replaceAll('<td class="Umaban1"></td>', `<td class="Umaban Txt_C">${placeholder}</td>`);
    const result = await resolveRaceIdentity({ raceId: "202609040208", label: "対象レース",
      horseNames: ["アルファ", "ベータ"], fetchHtml: async () => html });
    assert.equal(result.status, "verified", placeholder);
    assert.equal(result.page?.fieldSize, 2);
    assert.equal(parseShutubaSignals(html).size, 0);
  }
  const drawn = page("対象レース", ["アルファ", "ベータ"]);
  assert.equal(parseRacePageIdentity(drawn).fieldSize, 2);
  assert.deepEqual([...parseShutubaSignals(drawn).keys()], [1, 2]);
});

test("post-draw page counts only the entry table, excluding prediction and dummy rows", async () => {
  const html = await fs.readFile(new URL("./fixtures/shutuba-after-draw.html", import.meta.url), "utf8");
  const identity = parseRacePageIdentity(html);
  assert.equal(identity.fieldSize, 12);
  assert.equal(identity.horseNames.length, 12);
  assert.equal(parseShutubaSignals(html).size, 12);
  const result = await resolveRaceIdentity({ raceId: "202605040109", label: "八ヶ岳特別(2勝クラス)",
    horseNames: ["ディープキング"], fetchHtml: async () => html });
  assert.equal(result.status, "verified");
});

test("missing or duplicate roster evidence never becomes a verified field", async () => {
  const valid = page("対象レース", ["アルファ", "ベータ"], { drawn: false });
  const invalid = new Map([
    ["empty body", ""],
    ["HTTP 200 challenge", "<title>Just a moment...</title>"],
    ["count without rows", valid.replace(/<tr[\s\S]*$/i, "")],
    ["rows without count", valid.replace("2頭", "未定")],
    ["count mismatch", valid.replace("2頭", "3頭")],
    ["truncated row", valid.slice(0, valid.lastIndexOf("</tr>"))],
    ["missing name", valid.replaceAll("ベータ", "")],
    ["missing horse ID", valid.replace("/horse/101", "/horse/unknown")],
    ["duplicate normalized name", valid.replaceAll("ベータ", "アルファ　")],
    ["duplicate horse ID", valid.replace("/horse/101", "/horse/100")],
    ["duplicate row", valid.replace("</table>", `${valid.match(/<tr[\s\S]*?<\/tr>/i)?.[0]}</table>`)],
    ["missing entry table", valid.replace("ShutubaTable", "PredictRap_Table")],
    ["duplicate entry table", valid + valid.match(/<table[\s\S]*?<\/table>/i)?.[0]],
    ["missing title", valid.replace(/<title>[\s\S]*?<\/title>/i, "")],
    ["missing page ID", valid.replace(/<link[^>]*>/i, "")],
  ]);
  for (const [reason, html] of invalid) {
    for (const drawn of [false, true]) {
      let number = 0;
      const source = drawn ? html.replaceAll('<td class="Umaban1"></td>', () =>
        `<td class="Umaban1">${++number}</td>`) : html;
      const result = await resolveRaceIdentity({ raceId: "202609040208", label: "対象レース",
        horseNames: ["アルファ", "ベータ"], fetchHtml: async () => source });
      assert.equal(result.status, "unavailable", `${reason}, drawn=${drawn}`);
    }
  }
});

test("fetch errors and same-name responses for another race fail closed", async () => {
  for (const message of ["HTTP 503", "fetch failed", "The operation was aborted due to timeout"]) {
    const result = await resolveRaceIdentity({ raceId: "202609040208", label: "対象レース",
      horseNames: ["アルファ"], fetchHtml: async () => { throw new Error(message); } });
    assert.equal(result.status, "unavailable");
    assert.match(result.error ?? "", new RegExp(message));
  }
  const wrongId = await resolveRaceIdentity({ raceId: "202609040208", label: "対象レース",
    horseNames: ["アルファ"], fetchHtml: async () =>
      page("対象レース", ["アルファ"], { raceId: "202605040209", drawn: false }) });
  assert.equal(wrongId.status, "unavailable");

  const wrongRoster = await resolveRaceIdentity({ raceId: "202609040208", label: "対象レース",
    horseNames: ["アルファ", "ベータ"], fetchHtml: async (raceId: string) =>
      page("対象レース", ["別馬", "ベータ"], { raceId, drawn: false }) });
  assert.equal(wrongRoster.status, "mismatch");
});

test("pre-draw correction requires an exact unique roster on the requested candidate page", async () => {
  const originalId = "202609040209";
  const candidateId = "202609040208";
  for (const [names, status] of [
    [["アルファ", "ベータ"], "corrected"],
    [["アルファ", "別馬"], "mismatch"],
    [["アルファ", "アルファ"], "mismatch"],
    [["アルファ"], "mismatch"],
  ] as const) {
    const result = await resolveRaceIdentity({ raceId: originalId, label: "対象レース",
      horseNames: ["アルファ", "ベータ"], fetchHtml: async (id: string) => {
        if (id === originalId) return page("別レース", ["別馬"], { raceId: id, drawn: false });
        if (id === candidateId) return page("対象レース", [...names], { raceId: id, drawn: false });
        throw new Error("not found");
      } });
    assert.equal(result.status, status);
    if (status === "corrected") assert.equal(result.raceId, candidateId);
  }
});

test("missing or duplicate stored names cannot authorize an identity or correction", async () => {
  for (const horseNames of [[], [""], ["アルファ", "アルファ　"]]) {
    const result = await resolveRaceIdentity({ raceId: "202609040208", label: "対象レース", horseNames,
      fetchHtml: async () => page("対象レース", ["アルファ", "ベータ"], { drawn: false }) });
    assert.equal(result.status, "unavailable");
  }
});

test("pre-draw verification saves field size; unavailable pages leave all saved data unchanged", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "race-identity-pre-draw-"));
  try {
    await fs.mkdir(path.join(root, "data"));
    await fs.mkdir(path.join(root, "scripts"));
    await fs.writeFile(path.join(root, "scripts", "sync-race-schedule.mjs"),
      'import fs from "node:fs"; fs.writeFileSync("synced", "yes");');
    const weeklyPath = path.join(root, "data", "weekly-races.json");
    const reviewPath = path.join(root, "data", "review-records.json");
    const raw = JSON.stringify({ currentWeek: { races: [{ raceId: "202609040208",
      raceDate: "2026-09-06", scheduledStartTime: "13:50", day: "Sun", label: "対象レース",
      expectedFieldSize: null, horses: [{ name: "アルファ" }] }] }, archives: [] }, null, 2);
    const reviewRaw = '{"records":{}}\n';
    await fs.writeFile(weeklyPath, raw);
    await fs.writeFile(reviewPath, reviewRaw);
    const options = { root, now: new Date("2026-09-06T00:00:00Z"), dayFilter: "Sun" as const };
    for (const fetchHtml of [
      async () => { throw new Error("HTTP 503"); },
      async () => page("対象レース", ["アルファ", "ベータ"], { drawn: false }).replace("2頭", "3頭"),
    ]) {
      await assert.rejects(verifyCurrentWeekRaceIdentities({ ...options, fetchHtml }), /identity unavailable/);
      assert.equal(await fs.readFile(weeklyPath, "utf8"), raw);
      assert.equal(await fs.readFile(reviewPath, "utf8"), reviewRaw);
      await assert.rejects(fs.access(path.join(root, "synced")));
    }
    const report = await verifyCurrentWeekRaceIdentities({ ...options,
      fetchHtml: async () => page("対象レース", ["アルファ", "ベータ"], { drawn: false }) });
    assert.equal(report.verified, 1);
    assert.equal(report.checkedFieldSizes, 1);
    assert.deepEqual(report.corrected, []);
    const saved = JSON.parse(await fs.readFile(weeklyPath, "utf8"));
    assert.equal(saved.currentWeek.races[0].expectedFieldSize, 2);
    assert.deepEqual(saved.currentWeek.races[0].horses, [{ name: "アルファ" }]);
    assert.equal(await fs.readFile(reviewPath, "utf8"), reviewRaw);
    assert.equal(await fs.readFile(path.join(root, "synced"), "utf8"), "yes");
  } finally {
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error("unsafe test cleanup path");
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("pre-snapshot check rekeys a race and terminates its stale review record", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "race-identity-f4-"));
  try {
    await fs.mkdir(path.join(root, "data"));
    await fs.mkdir(path.join(root, "scripts"));
    await fs.writeFile(path.join(root, "scripts", "sync-race-schedule.mjs"), "");
    await fs.writeFile(path.join(root, "data", "weekly-races.json"), JSON.stringify({
      currentWeek: { races: [{ raceId: "202609040209",
        courseId: "hanshin-turf-1600-202609040209", raceNumber: 9,
        raceDate: "2026-09-06", scheduledStartTime: "13:50", day: "Sun",
        label: "武田尾特別(2勝クラス)", horses: [{ name: "アルファ" }, { name: "ベータ" }] }] },
      archives: [],
    }, null, 2));
    await fs.writeFile(path.join(root, "data", "review-records.json"), JSON.stringify({
      records: { "202609040209": { status: "review_partial", meta: { raceDate: "2026-09-06" } } },
    }, null, 2));
    const pages = new Map([
      ["202609040209", page("3歳以上1勝クラス", ["別馬"], { raceId: "202609040209" })],
      ["202609040208", page("武田尾特別(2勝クラス)", ["アルファ", "ベータ"])],
    ]);
    const report = await verifyCurrentWeekRaceIdentities({ root,
      now: new Date("2026-09-06T00:00:00Z"), dayFilter: "Sun",
      fetchHtml: async (id: string) => {
        const html = pages.get(id);
        if (!html) throw new Error("not found");
        return html;
      } });
    const weekly = JSON.parse(await fs.readFile(path.join(root, "data", "weekly-races.json"), "utf8"));
    const records = JSON.parse(await fs.readFile(path.join(root, "data", "review-records.json"), "utf8"));
    assert.deepEqual(report.corrected, [{ from: "202609040209", to: "202609040208" }]);
    assert.equal(weekly.currentWeek.races[0].raceId, "202609040208");
    assert.equal(weekly.currentWeek.races[0].courseId, "hanshin-turf-1600-202609040208");
    assert.equal(records.records["202609040209"].status, "review_failed");
    assert.equal(records.records["202609040209"].excludedReason, "INCORRECT_RACE_ID");
  } finally {
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error("unsafe test cleanup path");
    await fs.rm(root, { recursive: true, force: true });
  }
});
