import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import { unstable_dev } from "wrangler";
import { createCanonicalRscRequestUrl, createCanonicalRscRequestHeaders } from "vinext/internal/server/app-rsc-cache-busting";

// Run after the regular vinext build. The short-lived local Worker uses local,
// in-memory R2 only. It never reads credentials or contacts production storage.
const root = process.cwd();
const server = path.join(root, "dist/server");
const configPath = path.join(server, "wrangler.json");
const config = JSON.parse(await fs.readFile(configPath, "utf8"));
if (config.name !== "horse-race-sim" || config.main !== "index.js") {
  throw new Error("Run the regular vinext build first; expected the original generated entry");
}
const routes = {
  home: "/", sim: "/sim", monitor: "/monitor",
  calibration: "/api/calibration-report", summary: "/api/performance/summary",
};
const manifest = {};
const worker = await unstable_dev(path.join(server, "index.js"), {
  config: configPath, local: true, persist: false, port: 0, inspectorPort: 0,
  logLevel: "error", experimental: { disableExperimentalWarning: true,
    disableDevRegistry: true, watch: false, enableContainers: false },
});
try {
  const requests = Object.entries(routes).map(([key, route]) => ({ key, route, rsc: false }));
  requests.push(...Object.entries(routes).filter(([, route]) => !route.startsWith("/api/"))
    .map(([key, route]) => ({ key: `${key}-rsc`, route, rsc: true })));
  for (const { key, route, rsc } of requests) {
    const response = await worker.fetch(rsc ? createCanonicalRscRequestUrl(route) : route,
      rsc ? { headers: createCanonicalRscRequestHeaders(), redirect: "manual" } : undefined);
    if (response.status !== 200) throw new Error(`${route}: HTTP ${response.status}`);
    const body = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith(rsc ? "text/x-component" : route.startsWith("/api/") ? "application/json" : "text/html")) {
      throw new Error(`Unexpected content type for ${route}: ${contentType}`);
    }
    if (body.length >= 25 * 1024 * 1024) throw new Error(`${route} exceeds the asset size limit`);
    if (response.headers.has("set-cookie")) throw new Error(`Cannot snapshot a response setting cookies: ${route}`);
    const asset = `/__cloudflare-static/${key}.body`;
    const target = path.join(root, "dist/client", asset);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    const headers = Object.fromEntries([...response.headers].filter(([name]) =>
      !["content-length", "content-encoding", "transfer-encoding", "date", "server", "connection", "keep-alive", "etag"].includes(name)));
    manifest[key] = { asset, headers, bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") };
    console.log(`${route}${rsc ? ' (RSC)' : ''}: ${body.length} bytes precomputed`);
  }
} finally {
  await worker.stop();
}
await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/prepare-cloudflare-data.ts'],{stdio:'inherit',windowsHide:true});
  child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Data preparation failed: ${code}`)));
});
// These files are build inputs only. Exclude their generated deployment copies;
// the canonical data/ files and saved R2 objects are retained unchanged.
for (const name of ['review-records.json', 'prediction-snapshots.jsonl']) {
  const target = path.resolve(root, 'dist/client/__data/data', name);
  if (!target.startsWith(path.resolve(root, 'dist/client') + path.sep)) throw new Error('Unexpected generated asset path');
  await fs.unlink(target);
}
await build({entryPoints:['cloudflare/data-response.mjs'],outfile:path.join(server,'data-response.mjs'),bundle:true,format:'esm',platform:'neutral',packages:'bundle',external:['node:*','cloudflare:*'],target:'es2022',minify:true});
await fs.copyFile("cloudflare/static-response.mjs", path.join(server, "static-response.mjs"));
await fs.writeFile(path.join(server, "static-manifest.mjs"), `export default ${JSON.stringify(manifest)};\n`);
await fs.writeFile(path.join(server, "static-entry.mjs"), `import { serveStaticResponse } from './static-response.mjs';
import { serveDataResponse } from './data-response.mjs';
import dataManifest from './data-manifest.mjs';
import manifest from './static-manifest.mjs';
export default { async fetch(request, env, ctx) {
  const data = await serveDataResponse(request, env, dataManifest);
  if (data) return data;
  const response = await serveStaticResponse(request, env, manifest);
  if (response) return response;
  const { default: app } = await import('./index.js');
  return app.fetch(request, env, ctx);
} };\n`);
await fs.writeFile(configPath, JSON.stringify({ ...config, main: "static-entry.mjs" }));
await fs.writeFile(path.join(server, "static-response-evidence.json"), JSON.stringify(manifest, null, 2));
console.log("Prepared static entry; original application remains the fallback.");
