import fs from "node:fs/promises";
import path from "node:path";
import { BlobNotFoundError, get as getBlob, put as putBlob } from "@vercel/blob";

const ROOT = process.cwd();
export const RUNNING_STYLE_OVERRIDES_PATH = path.join(ROOT, "data", "running-style-overrides.json");
const RUNNING_STYLE_OVERRIDES_BLOB_PATH =
  process.env.RUNNING_STYLE_OVERRIDES_BLOB_PATH || "horse-race-sim/running-style-overrides.json";

const VALID_STYLES = new Set(["Nige", "Senko", "Sashi", "Oikomi"]);
const VALID_STORE_KINDS = new Set(["auto", "file", "vercel_blob"]);

function normalizeOverrideEntry(entry) {
  if (!entry || typeof entry !== "object") return null;

  const runningStyle = String(entry.runningStyle ?? "").trim();
  const source = String(entry.source ?? "").trim();
  const updatedAt = String(entry.updatedAt ?? "").trim();

  if (!VALID_STYLES.has(runningStyle)) return null;

  return {
    runningStyle,
    source: source || "saved_manual_override",
    updatedAt: updatedAt || null
  };
}

function normalizeOverrideStore(parsed) {
  if (!parsed || typeof parsed !== "object") return {};

  const normalized = {};
  for (const [courseId, horseMap] of Object.entries(parsed)) {
    if (!horseMap || typeof horseMap !== "object") continue;

    const normalizedHorseMap = {};
    for (const [horseId, entry] of Object.entries(horseMap)) {
      const normalizedEntry = normalizeOverrideEntry(entry);
      if (!normalizedEntry) continue;
      normalizedHorseMap[String(horseId)] = normalizedEntry;
    }

    if (Object.keys(normalizedHorseMap).length > 0) {
      normalized[String(courseId)] = normalizedHorseMap;
    }
  }

  return normalized;
}

function resolveStoreKind() {
  const configured = String(process.env.RUNNING_STYLE_OVERRIDE_STORE ?? "auto").trim().toLowerCase();
  const storeKind = VALID_STORE_KINDS.has(configured) ? configured : "auto";
  if (storeKind === "file" || storeKind === "vercel_blob") {
    return storeKind;
  }
  if (process.env.VERCEL_ENV === "production" || process.env.BLOB_READ_WRITE_TOKEN) {
    return "vercel_blob";
  }
  return "file";
}

function createFileAdapter() {
  return {
    kind: "file",
    async read() {
      try {
        const raw = await fs.readFile(RUNNING_STYLE_OVERRIDES_PATH, "utf8");
        return normalizeOverrideStore(JSON.parse(raw.replace(/^\uFEFF/, "")));
      } catch {
        return {};
      }
    },
    async write(data) {
      await fs.writeFile(RUNNING_STYLE_OVERRIDES_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
    }
  };
}

function createVercelBlobAdapter() {
  return {
    kind: "vercel_blob",
    async read() {
      try {
        const result = await getBlob(RUNNING_STYLE_OVERRIDES_BLOB_PATH, { access: "private" });
        if (!result?.stream) return {};
        const raw = await new Response(result.stream).text();
        return normalizeOverrideStore(JSON.parse(raw.replace(/^\uFEFF/, "")));
      } catch (error) {
        if (error instanceof BlobNotFoundError) {
          return {};
        }
        throw error;
      }
    },
    async write(data) {
      await putBlob(RUNNING_STYLE_OVERRIDES_BLOB_PATH, JSON.stringify(data, null, 2) + "\n", {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json"
      });
    }
  };
}

let cachedAdapter = null;

export function getRunningStyleOverrideStorageAdapter() {
  if (cachedAdapter) return cachedAdapter;
  cachedAdapter = resolveStoreKind() === "vercel_blob" ? createVercelBlobAdapter() : createFileAdapter();
  return cachedAdapter;
}

export async function readRunningStyleOverridesStore() {
  return getRunningStyleOverrideStorageAdapter().read();
}

export async function writeRunningStyleOverridesStore(data) {
  const normalized = normalizeOverrideStore(data);
  await getRunningStyleOverrideStorageAdapter().write(normalized);
}
