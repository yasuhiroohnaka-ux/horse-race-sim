import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseCarriedWeight } from "../lib/shutubaWeight.mjs";

const html = readFileSync(new URL("./fixtures/shutuba-ar-kyowakoku-2026.html", import.meta.url), "utf8");
const rows = [...html.matchAll(/<tr[^>]*class="[^"]*HorseList[^"]*"[^>]*>[\s\S]*?<\/tr>/g)].map((match) => match[0]);

test("handicap weights come from the cell after 性齢, not from the empty 馬体重 cell", () => {
  // アルゼンチン共和国杯 2026: ジーティーダーリン 55 / ビザンチンドリーム 59.5 / マイネルエンペラー 58.5
  assert.deepEqual(rows.map(parseCarriedWeight), [55, 59.5, 58.5]);
});

test("rows without a weight cell return 0 so the caller can fall back", () => {
  assert.equal(parseCarriedWeight('<tr><td class="Weight"> </td></tr>'), 0);
  assert.equal(parseCarriedWeight(""), 0);
});
