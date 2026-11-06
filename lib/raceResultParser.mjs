// Parses the race-level conditions and per-horse passing order from netkeiba result.html.
import { mapGroundLabel } from "./pastRunParser.mjs";

function text(html) {
  return String(html ?? "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function intOrNull(raw) {
  const value = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(value) ? value : null;
}

export function parseResultRaceData(resultHtml) {
  const block = String(resultHtml ?? "").match(/class="RaceData01"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
  const plain = text(block);
  const surfaceLabel = plain.match(/(芝|ダ|障)\s*(\d{3,4})m/);
  return {
    startTime: plain.match(/(\d{1,2}:\d{2})発走/)?.[1] ?? null,
    surface: surfaceLabel?.[1] === "芝" ? "Turf" : surfaceLabel?.[1] === "ダ" ? "Dirt"
      : surfaceLabel?.[1] === "障" ? "Jump" : null,
    distance: intOrNull(surfaceLabel?.[2]),
    // Turf pages print the ground in Item03, dirt pages in Item04.
    groundCondition: [...block.matchAll(/class="Item0[34]"[^>]*>([\s\S]*?)<\/span>/gi)]
      .map((match) => mapGroundLabel(text(match[1]).replace(/^馬場\s*[:：]\s*/, "")))
      .find(Boolean) ?? mapGroundLabel(plain.match(/馬場\s*[:：]\s*(不良|稍重|稍|重|良)/)?.[1] ?? ""),
  };
}

export function parseResultPassing(resultHtml) {
  const rows = [...String(resultHtml ?? "").matchAll(
    /<tr[^>]*class="[^"]*HorseList[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => match[1]);
  return rows.map((row) => {
    const horseNumber = intOrNull(row.match(/<td class="Num Txt_C">\s*<div>(\d{1,2})<\/div>/i)?.[1]);
    if (!horseNumber) return null;
    const position = intOrNull(row.match(/<div class="Rank">\s*(\d{1,2})\s*<\/div>/i)?.[1]);
    const passingRaw = text(row.match(/<td class="PassageRate"[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? "");
    return {
      position: position && position > 0 ? position : null,
      gateNumber: intOrNull(row.match(/<td class="Num Waku\d+">\s*<div>(\d{1,2})<\/div>/i)?.[1]),
      horseNumber,
      externalHorseId: row.match(/\/horse\/(\d+)/i)?.[1] ?? null,
      passing: /^\d{1,2}(-\d{1,2})*$/.test(passingRaw) ? passingRaw.split("-").map(Number) : null,
    };
  }).filter(Boolean);
}
