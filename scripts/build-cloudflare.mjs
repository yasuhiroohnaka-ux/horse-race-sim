import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const files = [
  "data/weekly-races.json",
  "data/review-records.json",
  "data/prediction-snapshots.jsonl",
  "data/weekly-diagnostics.json",
  "data/generated-reviews.json",
  "data/analysis/calibration-report.json",
  "data/analysis/backtest-selection.json",
];
const assetsRoot = path.resolve("public", "__data");
const copied = [];
const workspace = await fs.realpath(process.cwd());
const publicRoot = await fs.realpath("public");
if (!publicRoot.startsWith(workspace + path.sep)) {
  throw new Error("The public directory is outside the workspace");
}

async function runCli(cli, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (exitCode) => resolve(exitCode ?? 1));
  });
}

let buildAttempted = false;

try {
  for (const file of files) {
    const target = path.join(assetsRoot, file);
    if (await fs.stat(target).then(() => true, (error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    })) {
      throw new Error(`Generated asset path already exists: ${target}`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    const resolvedDirectory = await fs.realpath(path.dirname(target));
    if (!resolvedDirectory.startsWith(publicRoot + path.sep)) {
      throw new Error(`Generated asset directory is outside public: ${resolvedDirectory}`);
    }
    await fs.copyFile(file, target);
    copied.push(target);
  }
  console.log(`Prepared ${files.length} tracked data files for Cloudflare assets.`);

  const cli = fileURLToPath(new URL("../node_modules/vinext/dist/cli.js", import.meta.url));
  buildAttempted = true;
  const code = await runCli(cli, ["build"]);
  if (code !== 0) process.exitCode = code;
} finally {
  for (const target of copied) await fs.rm(target, { force: true });
  for (const directory of [
    path.join(assetsRoot, "data", "analysis"),
    path.join(assetsRoot, "data"),
    assetsRoot,
  ]) {
    await fs.rmdir(directory).catch((error) => {
      if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error;
    });
  }
  if (buildAttempted) {
    // vinext and Next.js generate different declarations at .next/types/routes.d.ts.
    // Restore Next.js declarations for the existing Next build and standalone tsc.
    const nextCli = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
    const code = await runCli(nextCli, ["typegen"]);
    if (code !== 0) process.exitCode = code;
  }
}
