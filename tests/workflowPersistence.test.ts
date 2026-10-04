import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";

const workflowPath = new URL("../.github/workflows/weekly-keiba-update.yml", import.meta.url);

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

test("routine saves generated reviews and rebases all results onto a concurrent main update", async () => {
  const workflow = await fs.readFile(workflowPath, "utf8");
  const block = workflow.match(/- name: Commit and push changes\r?\n\s+run: \|\r?\n([\s\S]*?)(?=\r?\n      - name:)/)?.[1];
  assert.ok(block, "the actual workflow commit block must be available");
  const script = block.replace(/^          /gm, "").replaceAll("\r\n", "\n");
  const stagedPaths = script.match(/^git add (.+)$/m)?.[1].split(/\s+/) ?? [];
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "keiba-workflow-save-"));
  const remote = path.join(root, "remote.git");
  const seed = path.join(root, "seed");
  const writer = path.join(root, "writer");
  try {
    git(root, "init", "--bare", "--initial-branch=main", remote);
    git(root, "clone", remote, seed);
    git(seed, "config", "user.name", "test");
    git(seed, "config", "user.email", "test@example.invalid");
    for (const file of new Set([...stagedPaths, "data/generated-reviews.json", "unrelated.txt"])) {
      await fs.mkdir(path.dirname(path.join(seed, file)), { recursive: true });
      await fs.writeFile(path.join(seed, file), "baseline\n");
    }
    git(seed, "add", ".");
    git(seed, "commit", "-m", "baseline");
    git(seed, "push", "origin", "main");
    git(root, "clone", remote, writer);

    await fs.writeFile(path.join(seed, "unrelated.txt"), "concurrent user change\n");
    git(seed, "add", "unrelated.txt");
    git(seed, "commit", "-m", "concurrent main update");
    git(seed, "push", "origin", "main");
    const concurrentHead = git(seed, "rev-parse", "HEAD");

    await fs.writeFile(path.join(writer, "data", "weekly-races.json"), "updated race results\n");
    await fs.writeFile(path.join(writer, "data", "generated-reviews.json"), "updated generated reviews\n");
    const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
    const result = spawnSync(bash, ["-e", "-c", script], {
      cwd: writer, encoding: "utf8", timeout: 30000,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(git(writer, "status", "--porcelain"), "");
    assert.equal(git(writer, "rev-parse", "HEAD^"), concurrentHead);
    assert.equal(git(root, "--git-dir", remote, "show", "main:data/generated-reviews.json"), "updated generated reviews");
    assert.equal(git(root, "--git-dir", remote, "show", "main:data/weekly-races.json"), "updated race results");
    assert.equal(git(root, "--git-dir", remote, "show", "main:unrelated.txt"), "concurrent user change");
    assert.deepEqual(git(writer, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").split("\n").sort(),
      ["data/generated-reviews.json", "data/weekly-races.json"]);
  } finally {
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error("unsafe test cleanup path");
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("failed routine backup includes generated reviews along with the results that reference them", async () => {
  const workflow = await fs.readFile(workflowPath, "utf8");
  const backup = workflow.match(/- name: Preserve generated data after failure[\s\S]*?path: \|\r?\n([\s\S]*)$/)?.[1];
  assert.ok(backup);
  const paths = backup.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  assert.ok(paths.includes("data/generated-reviews.json"), "the failure artifact must preserve generated review data");
  assert.ok(paths.includes("data/weekly-races.json"));
});
