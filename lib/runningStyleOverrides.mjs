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

function createStorageError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) {
    error.cause = cause;
  }
  return error;
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
    available: true,
    reason: null,
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
  const hasToken = Boolean(String(process.env.BLOB_READ_WRITE_TOKEN ?? "").trim());
  return {
    kind: "vercel_blob",
    available: hasToken,
    reason: hasToken ? null : "missing_blob_token",
    async read() {
      if (!hasToken) {
        return {};
      }
      try {
        const result = await getBlob(RUNNING_STYLE_OVERRIDES_BLOB_PATH, { access: "private" });
        if (!result?.stream) return {};
        const raw = await new Response(result.stream).text();
        return normalizeOverrideStore(JSON.parse(raw.replace(/^\uFEFF/, "")));
      } catch (error) {
        if (error instanceof BlobNotFoundError) {
          return {};
        }
        return {};
      }
    },
    async write(data) {
      if (!hasToken) {
        throw createStorageError(
          "missing_blob_token",
          "BLOB_READ_WRITE_TOKEN is not configured for running style override storage."
        );
      }
      try {
        await putBlob(RUNNING_STYLE_OVERRIDES_BLOB_PATH, JSON.stringify(data, null, 2) + "\n", {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/json"
        });
      } catch (error) {
        throw createStorageError("blob_write_failed", "Failed to write running style overrides to Vercel Blob.", error);
      }
    }
  };
}

let cachedAdapter = null;

export function getRunningStyleOverrideStorageAdapter() {
  if (cachedAdapter) return cachedAdapter;
  cachedAdapter = resolveStoreKind() === "vercel_blob" ? createVercelBlobAdapter() : createFileAdapter();
  return cachedAdapter;
}

export function getRunningStyleOverrideStorageStatus() {
  const adapter = getRunningStyleOverrideStorageAdapter();
  return {
    kind: adapter.kind,
    available: adapter.available !== false,
    reason: adapter.reason ?? null
  };
}

export async function readRunningStyleOverridesStore() {
  return getRunningStyleOverrideStorageAdapter().read();
}

export async function writeRunningStyleOverridesStore(data) {
  const normalized = normalizeOverrideStore(data);
  await getRunningStyleOverrideStorageAdapter().write(normalized);
}
