import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { syncCloudflareSnapshots, type SnapshotStore } from "../scripts/sync-cloudflare-snapshots";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const key = (id: string) => `snapshots/${id}.json`;
const snapshot = (id: string) => ({
  snapshotId: id, raceId: "202605040209", courseId: "tokyo-turf-1800-202605040209",
  capturedAt: "2026-10-04T00:00:00.000Z", modelFamily: "test", modelVersion: "test-v1",
  scoringConfigHash: "test", simulationCount: 1000, rankedRows: [],
  condition: {}, signalReasons: [], marketMeta: {},
});

async function withFile(run: (targetPath: string, original: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "keiba-r2-sync-"));
  const targetPath = path.join(root, "prediction-snapshots.jsonl");
  const original = JSON.stringify(snapshot(firstId)) + "\n";
  try {
    await fs.writeFile(targetPath, original);
    await run(targetPath, original);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  }
}

function storeFor(objects: Record<string, string>): SnapshotStore {
  return {
    async list() { return { keys: Object.keys(objects), truncated: false }; },
    async get(objectKey) { return objects[objectKey]; },
  };
}

test("imports paginated manual saves before review and is idempotent, preserving historical rows", async () => {
  await withFile(async (targetPath, original) => {
    // Historical correction rows can have the same ID. Keep both exactly as recorded.
    const baseline = original + JSON.stringify({ ...snapshot(firstId), modelVersion: "historical correction" }) + "\n";
    await fs.writeFile(targetPath, baseline);
    const cursors: Array<string | undefined> = [];
    const store: SnapshotStore = {
      async list(cursor) {
        cursors.push(cursor);
        return cursor ? { keys: [key(secondId)], truncated: false } :
          { keys: [key(firstId)], truncated: true, cursor: "page2" };
      },
      async get(objectKey) {
        return JSON.stringify(snapshot(objectKey === key(firstId) ? firstId : secondId));
      },
    };
    assert.deepEqual(await syncCloudflareSnapshots({ store, targetPath }), { fetched: 2, imported: 1 });
    assert.deepEqual(cursors, [undefined, "page2"]);
    const saved = await fs.readFile(targetPath, "utf8");
    assert.equal(saved, baseline + JSON.stringify(snapshot(secondId)) + "\n");
    // This is the JSONL file consumed by reviewPipeline.readSnapshots on Actions.
    assert.equal(saved.trim().split("\n").map((line) => JSON.parse(line).snapshotId).at(-1), secondId);
    assert.deepEqual(await syncCloudflareSnapshots({ store, targetPath }), { fetched: 2, imported: 0 });
    assert.equal(await fs.readFile(targetPath, "utf8"), saved);
  });
});

test("failed R2 authentication leaves local snapshots intact", async () => {
  await withFile(async (targetPath, original) => {
    const store = storeFor({});
    store.list = async () => { throw new Error("AccessDenied"); };
    await assert.rejects(syncCloudflareSnapshots({ store, targetPath }), /AccessDenied/);
    assert.equal(await fs.readFile(targetPath, "utf8"), original);
  });
});

test("a missing object after a successful download does not import a partial batch", async () => {
  await withFile(async (targetPath, original) => {
    const store = storeFor({ [key(firstId)]: JSON.stringify(snapshot(firstId)), [key(secondId)]: "" });
    store.get = async (objectKey) => {
      if (objectKey === key(secondId)) throw new Error("NoSuchKey");
      return JSON.stringify(snapshot(firstId));
    };
    await assert.rejects(syncCloudflareSnapshots({ store, targetPath }), /NoSuchKey/);
    assert.equal(await fs.readFile(targetPath, "utf8"), original);
  });
});

test("rejects malformed JSON, mismatched IDs, missing fields, and unrelated object paths", async () => {
  await withFile(async (targetPath, original) => {
    for (const objects of [
      { [key(secondId)]: "{broken" },
      { [key(secondId)]: JSON.stringify(snapshot(firstId)) },
      { [key(secondId)]: JSON.stringify({ snapshotId: secondId }) },
      { "data/private.json": JSON.stringify(snapshot(secondId)) },
    ]) {
      await assert.rejects(syncCloudflareSnapshots({ store: storeFor(objects), targetPath }));
      assert.equal(await fs.readFile(targetPath, "utf8"), original);
    }
  });
});

test("conflicting data under an existing snapshot ID fails without overwriting history", async () => {
  await withFile(async (targetPath, original) => {
    const store = storeFor({ [key(firstId)]: JSON.stringify({ ...snapshot(firstId), simulationCount: 2000 }) });
    await assert.rejects(syncCloudflareSnapshots({ store, targetPath }), /Conflicting Cloudflare snapshot ID/);
    assert.equal(await fs.readFile(targetPath, "utf8"), original);
  });
});

test("rejects truncated pagination with missing or repeated cursors", async () => {
  await withFile(async (targetPath, original) => {
    for (const cursor of [undefined, "repeat"]) {
      const store = storeFor({});
      store.list = async () => ({ keys: [], truncated: true, cursor });
      await assert.rejects(syncCloudflareSnapshots({ store, targetPath }), /Invalid Cloudflare snapshot pagination/);
      assert.equal(await fs.readFile(targetPath, "utf8"), original);
    }
  });
});

test("preserves another local writer's change during import", async () => {
  await withFile(async (targetPath, original) => {
    const concurrent = original + JSON.stringify(snapshot(secondId)) + "\n";
    const store = storeFor({ [key(secondId)]: JSON.stringify(snapshot(secondId)) });
    store.get = async () => {
      await fs.writeFile(targetPath, concurrent);
      return JSON.stringify(snapshot(secondId));
    };
    await assert.rejects(syncCloudflareSnapshots({ store, targetPath }), /Local snapshots changed/);
    assert.equal(await fs.readFile(targetPath, "utf8"), concurrent);
  });
});

test("Cloudflare sync is explicitly enabled and runs before the workflow's snapshot/review steps", async () => {
  const workflow = await fs.readFile(new URL("../.github/workflows/weekly-keiba-update.yml", import.meta.url), "utf8");
  const block = workflow.match(/- name: Import Cloudflare saved snapshots([\s\S]*?)(?=\r?\n      - name:)/)?.[1];
  assert.ok(block);
  assert.match(block, /if: vars\.CLOUDFLARE_SNAPSHOT_SYNC_ENABLED == 'true'/);
  assert.match(block, /secrets\.CLOUDFLARE_R2_SECRET_ACCESS_KEY/);
  assert.doesNotMatch(block, /continue-on-error/);
  assert.ok(workflow.indexOf("Import Cloudflare saved snapshots") < workflow.indexOf("Capture Saturday live pre-race snapshots"));
  assert.ok(workflow.indexOf("Import Cloudflare saved snapshots") < workflow.indexOf("Run review self-heal"));
});
