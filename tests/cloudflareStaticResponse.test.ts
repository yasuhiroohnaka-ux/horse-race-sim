import assert from "node:assert/strict";
import { test } from "node:test";
import { staticResponseKey, serveStaticResponse } from "../cloudflare/static-response.mjs";

test("saved data, conditional requests and mutations retain the original application", () => {
  for (const path of ["/api/prediction-snapshots", "/api/performance", "/api/weekly-diagnostics", "/sim?course=example", "/monitor?_rsc=123"]) {
    assert.equal(staticResponseKey(new Request(`https://example.com${path}`)), null);
  }
  for (const headers of [new Headers({ "X-Vinext-Rsc-Render-Mode": "prefetch-loading-shell" }), new Headers({ "Next-Action": "id" })]) {
    assert.equal(staticResponseKey(new Request("https://example.com/", { headers })), null);
  }
  assert.equal(staticResponseKey(new Request("https://example.com/", { method: "POST" })), null);
  assert.equal(staticResponseKey(new Request("https://example.com/monitor?_rsc=123", { headers: { RSC: "1" } })), "monitor-rsc");
  assert.equal(staticResponseKey(new Request("https://example.com/sim?course=x&_rsc=123", { headers: { RSC: "1" } })), null);
  assert.equal(staticResponseKey(new Request("https://example.com/monitor", { headers: { cookie: "horse_running_style_overrides=x" } })), "monitor");
});

test("precomputed response streams exact content with original content type", async () => {
  const manifest = { monitor: { asset: "/__cloudflare-static/monitor.body", headers: { "content-type": "text/html; charset=utf-8" } } };
  const env = { ASSETS: { fetch: async (r: Request) => {
    assert.equal(new URL(r.url).pathname, manifest.monitor.asset);
    return new Response("<html>monitor</html>");
  } } };
  const response = await serveStaticResponse(new Request("https://example.com/monitor"), env, manifest);
  assert.ok(response);
  assert.equal(response.headers.get("X-Horse-Response"), "build-asset");
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(await response.text(), "<html>monitor</html>");
  const head = await serveStaticResponse(new Request("https://example.com/monitor", { method: "HEAD" }), env, manifest);
  assert.ok(head);
  assert.equal(await head.text(), "");
});

test("missing static asset fails visibly instead of silently running expensive SSR", async () => {
  await assert.rejects(serveStaticResponse(new Request("https://example.com/"),
    { ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } },
    { home: { asset: "/missing", headers: {} } }), /Missing precomputed response/);
});
