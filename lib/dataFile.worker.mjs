import { env } from "cloudflare:workers";

function keyForPath(filePath) {
  const normalized = String(filePath).replaceAll("\\", "/");
  const index = normalized.lastIndexOf("/data/");
  if (index < 0) throw new Error(`Unsupported data path: ${normalized}`);
  const key = normalized.slice(index + 1);
  if (key.includes("..")) throw new Error(`Unsafe data path: ${normalized}`);
  return key;
}

function missingFile(key) {
  const error = new Error(`Data file is unavailable: ${key}`);
  error.code = "ENOENT";
  return error;
}

export async function readDataFile(filePath) {
  const key = keyForPath(filePath);
  const stored = await env.APP_DATA.get(key);
  let text;
  if (stored) {
    text = await stored.text();
  } else {
    const response = await env.ASSETS.fetch(new Request(`https://assets.invalid/__data/${key}`));
    if (!response.ok) throw missingFile(key);
    text = await response.text();
  }
  if (key === "data/prediction-snapshots.jsonl") {
    const appended = [];
    let cursor;
    do {
      const page = await env.APP_DATA.list({ prefix: "snapshots/", cursor });
      for (const object of page.objects) {
        const item = await env.APP_DATA.get(object.key);
        if (item) appended.push(await item.text());
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    if (appended.length) text += `\n${appended.join("\n")}`;
  }
  return text;
}

export async function writeDataFile(filePath, data) {
  await env.APP_DATA.put(keyForPath(filePath), data);
}

export async function appendDataFile(filePath, data) {
  if (keyForPath(filePath) !== "data/prediction-snapshots.jsonl") {
    throw new Error("Append is only supported for prediction snapshots");
  }
  const snapshot = JSON.parse(String(data).trim());
  const id = String(snapshot.snapshotId ?? "");
  if (!/^[a-fA-F0-9-]{36}$/.test(id)) throw new Error("Invalid snapshot ID");
  await env.APP_DATA.put(`snapshots/${id}.json`, JSON.stringify(snapshot));
}

export const dataStorageKind = "cloudflare_r2";
