import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

export type SnapshotStore = {
  list(cursor?: string): Promise<{ keys: string[]; truncated: boolean; cursor?: string }>;
  get(key: string): Promise<string>;
};

const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

class SnapshotSyncError extends Error {
  name = "SnapshotSyncError";
}

function parseSnapshot(raw: string, key: string): Record<string, unknown> {
  const value = JSON.parse(raw);
  const id = key.slice("snapshots/".length, -".json".length);
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    !UUID.test(id) || value.snapshotId !== id ||
    typeof value.raceId !== "string" || !/^\d{12}$/.test(value.raceId) ||
    typeof value.courseId !== "string" || !value.courseId ||
    typeof value.capturedAt !== "string" || !Number.isFinite(Date.parse(value.capturedAt)) ||
    typeof value.modelFamily !== "string" || typeof value.modelVersion !== "string" ||
    typeof value.scoringConfigHash !== "string" ||
    typeof value.simulationCount !== "number" || !Number.isFinite(value.simulationCount) ||
    !Array.isArray(value.rankedRows) || value.condition === undefined ||
    value.signalReasons === undefined || value.marketMeta === undefined) {
    throw new SnapshotSyncError(`Invalid Cloudflare snapshot: ${key}`);
  }
  return value;
}

export async function syncCloudflareSnapshots({ store, targetPath }: {
  store: SnapshotStore;
  targetPath: string;
}) {
  const original = await fs.readFile(targetPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const existing = new Map<string, unknown[]>();
  for (const line of original.split(/\r?\n/).filter((line) => line.trim())) {
    const snapshot = JSON.parse(line);
    if (typeof snapshot?.snapshotId !== "string") throw new SnapshotSyncError("Invalid local snapshot ID");
    existing.set(snapshot.snapshotId, [...(existing.get(snapshot.snapshotId) ?? []), snapshot]);
  }

  const keys = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await store.list(cursor);
    for (const key of page.keys) {
      if (!/^snapshots\/[^/]+\.json$/.test(key) || keys.has(key)) {
        throw new SnapshotSyncError(`Invalid or repeated Cloudflare snapshot key: ${key}`);
      }
      keys.add(key);
    }
    cursor = page.truncated ? page.cursor : undefined;
    if (page.truncated && (!cursor || cursors.has(cursor))) {
      throw new SnapshotSyncError("Invalid Cloudflare snapshot pagination");
    }
    if (cursor) cursors.add(cursor);
  } while (cursor);

  const additions: string[] = [];
  for (const key of [...keys].sort()) {
    const snapshot = parseSnapshot(await store.get(key), key);
    const prior = existing.get(String(snapshot.snapshotId));
    if (prior) {
      if (!prior.some((item) => isDeepStrictEqual(item, snapshot))) {
        throw new SnapshotSyncError(`Conflicting Cloudflare snapshot ID: ${snapshot.snapshotId}`);
      }
    } else {
      additions.push(JSON.stringify(snapshot));
    }
  }
  // Fetch and validate the whole batch before replacing the local file. Keep R2 objects intact.
  if (additions.length) {
    const current = await fs.readFile(targetPath, "utf8").catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    if (current !== original) throw new SnapshotSyncError("Local snapshots changed during Cloudflare import");
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const temporary = `${targetPath}.${randomUUID()}.tmp`;
    try {
      const separator = original && !original.endsWith("\n") ? "\n" : "";
      await fs.writeFile(temporary, original + separator + additions.join("\n") + "\n", "utf8");
      await fs.rename(temporary, targetPath);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
  return { fetched: keys.size, imported: additions.length };
}

async function main() {
  const required = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) throw new SnapshotSyncError(`Missing ${name}`);
    return value;
  };
  const endpoint = required("CLOUDFLARE_R2_ENDPOINT");
  if (!/^https:\/\/[a-f\d]{32}(?:\.(?:eu|us|fedramp))?\.r2\.cloudflarestorage\.com\/?$/i.test(endpoint)) {
    throw new SnapshotSyncError("Invalid CLOUDFLARE_R2_ENDPOINT");
  }
  const bucket = required("CLOUDFLARE_R2_BUCKET");
  const client = new S3Client({
    endpoint, region: "auto",
    credentials: {
      accessKeyId: required("CLOUDFLARE_R2_ACCESS_KEY_ID"),
      secretAccessKey: required("CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
    },
  });
  try {
    const store: SnapshotStore = {
      async list(cursor) {
        const page = await client.send(new ListObjectsV2Command({
          Bucket: bucket, Prefix: "snapshots/", ContinuationToken: cursor,
        }));
        return {
          keys: (page.Contents ?? []).map((object) => object.Key ?? ""),
          truncated: page.IsTruncated ?? false, cursor: page.NextContinuationToken,
        };
      },
      async get(key) {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if (!object.Body) throw new SnapshotSyncError(`Missing Cloudflare snapshot body: ${key}`);
        return object.Body.transformToString();
      },
    };
    const result = await syncCloudflareSnapshots({
      store, targetPath: path.join(process.cwd(), "data", "prediction-snapshots.jsonl"),
    });
    console.log(`[cloudflare-snapshot-sync] ${JSON.stringify(result)}`);
  } finally {
    client.destroy();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    // SDK errors may include request details. Never log credentials or signed headers.
    const reason = error instanceof SnapshotSyncError ? error.message :
      error instanceof Error ? error.name : "unknown error";
    console.error(`[cloudflare-snapshot-sync] failed: ${reason}`);
    process.exitCode = 1;
  });
}
