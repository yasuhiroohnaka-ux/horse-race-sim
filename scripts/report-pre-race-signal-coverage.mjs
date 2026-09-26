import fs from "node:fs/promises";
import path from "node:path";
import { summarizeSignalReadiness } from "../lib/preRaceSignalCapture.mjs";

const inputPath = path.join(process.cwd(), "data", "pre-race-signals.jsonl");
const raw = await fs.readFile(inputPath, "utf8").catch((error) => {
  if (error?.code === "ENOENT") return "";
  throw error;
});
const captures = raw.split(/\r?\n/).filter(Boolean).map((line, index) => {
  try { return JSON.parse(line); }
  catch { throw new Error(`invalid JSON in ${inputPath}:${index + 1}`); }
});
const summary = summarizeSignalReadiness(captures);
console.log(JSON.stringify(summary, null, 2));
