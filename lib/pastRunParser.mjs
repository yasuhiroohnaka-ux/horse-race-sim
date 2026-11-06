// Parses netkeiba shutuba_past.html (the 5 previous runs shown for each entry).
// Only facts printed on the page are returned; missing values stay null.

const GROUND_LABELS = [
  [/不良/, "Soft"],
  [/稍/, "Good"],
  [/重/, "Yielding"],
  [/良/, "Firm"],
];

export function mapGroundLabel(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  for (const [pattern, ground] of GROUND_LABELS) if (pattern.test(value)) return ground;
  return null;
}

export function isWetGround(ground) {
  return ground === "Good" || ground === "Yielding" || ground === "Soft";
}

function text(html) {
  return String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function intOrNull(raw) {
  const value = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(value) ? value : null;
}

function floatOrNull(raw) {
  const value = Number.parseFloat(String(raw ?? ""));
  return Number.isFinite(value) ? value : null;
}

function div(cellHtml, className) {
  return cellHtml.match(new RegExp(`<div class="${className}"[^>]*>([\\s\\S]*?)</div>`, "i"))?.[1] ?? "";
}

export function parsePastRunCell(cellHtml) {
  const cell = String(cellHtml ?? "");
  const data01 = text(div(cell, "Data01"));
  const date = data01.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (!date) return null;

  const data05 = text(div(cell, "Data05"));
  const data03 = text(div(cell, "Data03"));
  const data06 = text(div(cell, "Data06"));
  const data07 = text(div(cell, "Data07"));
  const surfaceLabel = data05.match(/^(芝|ダ|障)/)?.[1] ?? null;
  const passingRaw = data06.match(/^(\d{1,2}(?:-\d{1,2})*)/)?.[1] ?? null;
  const finish = intOrNull(cell.match(/<span class="Num">\s*(\d{1,2})\s*<\/span>/i)?.[1]);
  const timeMatch = data05.match(/(\d+):(\d{1,2}\.\d)/);

  return {
    raceId: cell.match(/myhorse_(\d{12})/)?.[1] ?? cell.match(/\/race\/(\d{12})/)?.[1] ?? null,
    date: `${date[1]}-${date[2]}-${date[3]}`,
    venue: data01.replace(/^\d{4}\.\d{2}\.\d{2}\s*/, "").replace(/\s*\d{1,2}$/, "").trim() || null,
    surface: surfaceLabel === "芝" ? "Turf" : surfaceLabel === "ダ" ? "Dirt" : surfaceLabel === "障" ? "Jump" : null,
    distance: intOrNull(data05.match(/(?:芝|ダ|障)(\d{3,4})/)?.[1]),
    timeSeconds: timeMatch ? Number(timeMatch[1]) * 60 + Number(timeMatch[2]) : null,
    ground: mapGroundLabel(div(cell, "Data05").match(/<strong>([^<]+)<\/strong>/i)?.[1] ?? data05.split(" ").at(-1)),
    fieldSize: intOrNull(data03.match(/(\d{1,2})頭/)?.[1]),
    horseNumber: intOrNull(data03.match(/(\d{1,2})番/)?.[1]),
    popularity: intOrNull(data03.match(/(\d{1,2})人/)?.[1]),
    finish: finish && finish > 0 ? finish : null,
    passing: passingRaw ? passingRaw.split("-").map(Number) : null,
    last3f: floatOrNull(data06.match(/\((\d{2}\.\d)\)/)?.[1]),
    bodyWeight: intOrNull(data06.match(/(\d{3})\(/)?.[1]),
    timeDiff: floatOrNull(data07.match(/\((-?\d+\.\d)\)\s*$/)?.[1]),
  };
}

export function parseShutubaPastRuns(shutubaPastHtml) {
  const rows = [...String(shutubaPastHtml ?? "").matchAll(
    /<tr[^>]*class="[^"]*HorseList[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => match[1]);
  const entries = [];
  for (const row of rows) {
    const horseNumber = intOrNull(row.match(/<td class="Waku">\s*(\d{1,2})\s*<\/td>/i)?.[1]);
    // Look only inside Horse02: names can carry an icon span (e.g. マル外), and a looser match
    // would pick up the rival horse linked in a past-run cell.
    const horse02 = row.match(/<div class="Horse02">([\s\S]*?)<\/div>/i)?.[1] ?? "";
    const horseLink = horse02.match(/<a[^>]*\/horse\/(\d+)[^>]*>([\s\S]*?)<\/a>/i);
    if (!horseLink || !text(horseLink[2])) continue;
    const runs = [...row.matchAll(/<td class="Past[^"]*"[^>]*>([\s\S]*?)<\/td>/g)]
      .map((match) => parsePastRunCell(match[0]))
      .filter(Boolean)
      .slice(0, 5);
    entries.push({
      horseNumber,
      externalHorseId: horseLink[1],
      horseName: text(horseLink[2]),
      runs,
    });
  }
  return entries;
}
