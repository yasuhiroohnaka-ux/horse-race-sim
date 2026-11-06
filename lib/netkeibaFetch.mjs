// Polite netkeiba fetcher: charset detection, optional disk cache, minimum interval between requests.
import fs from "node:fs/promises";
import path from "node:path";

let lastRequestAt = 0;

async function waitForSlot(minIntervalMs) {
  const wait = lastRequestAt + minIntervalMs - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

function decode(bytes, contentType) {
  const head = Buffer.from(bytes.slice(0, 4096)).toString("latin1");
  const raw = contentType.match(/charset=([^;]+)/i)?.[1]?.trim() ||
    head.match(/charset=["']?([a-zA-Z0-9._-]+)/i)?.[1] || "utf-8";
  const charset = raw.toLowerCase() === "x-euc-jp" ? "euc-jp" : raw.toLowerCase();
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export async function fetchNetkeibaText(url, { cacheDir = null, minIntervalMs = 1100 } = {}) {
  const cacheFile = cacheDir
    ? path.join(cacheDir, url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9._-]+/g, "_") + ".html")
    : null;
  if (cacheFile) {
    try {
      return await fs.readFile(cacheFile, "utf8");
    } catch {
      // not cached yet
    }
  }
  await waitForSlot(minIntervalMs);
  const res = await fetch(url, {
    headers: { "user-agent": "horse-race-sim-bot/2.0", accept: "text/html,*/*" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`fetch failed ${res.status}: ${url}`);
  const html = decode(new Uint8Array(await res.arrayBuffer()), res.headers.get("content-type") || "");
  if (cacheFile) {
    await fs.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.writeFile(cacheFile, html, "utf8");
  }
  return html;
}

export function jstTimestamp(raceDate, hhmm) {
  if (!raceDate || !/^\d{1,2}:\d{2}$/.test(String(hhmm ?? ""))) return NaN;
  const [hour, minute] = String(hhmm).split(":");
  return Date.parse(`${raceDate}T${hour.padStart(2, "0")}:${minute}:00+09:00`);
}
