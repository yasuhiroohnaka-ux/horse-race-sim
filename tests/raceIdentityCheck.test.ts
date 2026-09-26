import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveRaceIdentity, verifyCurrentWeekRaceIdentities } from "../scripts/race-identity-check.mjs";

function page(label: string, names: string[]) {
  const rows = names.map((name, index) =>
    `<tr class="HorseList"><td class="Umaban1">${index + 1}</td>` +
    `<td class="HorseInfo"><a href="/horse/${100 + index}" title="${name}">${name}</a></td></tr>`).join("");
  return `<title>${label} 出馬表 | netkeiba</title><div class="RaceData01">13:50 発走</div>${rows}`;
}

test("wrong race name is repaired only by a same-meeting race with the exact roster", async () => {
  const pages = new Map([
    ["202609040209", page("3歳以上1勝クラス", ["別馬", "別馬2"])],
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
    fetchHtml: async () => page("スプリンターズS(G1)", ["アルファ", "ベータ"]) });
  assert.equal(result.status, "verified");
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
      ["202609040209", page("3歳以上1勝クラス", ["別馬"])],
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
