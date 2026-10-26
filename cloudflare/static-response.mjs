// Only responses independent of saved R2 snapshots are eligible here.
// Requests with application parameters, special RSC modes or actions keep the
// original handler. This deliberately avoids freezing live saved predictions.
export function staticResponseKey(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  url.pathname = decodeURI(url.pathname).replace(/\/+$/, '') || '/';
  if (url.pathname === '/api/calibration-report') return 'calibration';
  if (url.pathname === '/api/performance/summary') return url.search ? null : 'summary';
  const isRsc = request.headers.get("rsc") === "1";
  if (isRsc) url.searchParams.delete("_rsc");
  if (url.search || request.headers.has("next-action") || request.headers.has("x-vinext-rsc-render-mode") ||
      request.headers.has("x-vinext-interception-context") || request.headers.has("x-vinext-interception-id") ||
      request.headers.has("x-vinext-mounted-slots")) return null;
  const key = new Map([
    ["/", "home"], ["/sim", "sim"], ["/monitor", "monitor"],
    ["/api/calibration-report", "calibration"],
    ["/api/performance/summary", "summary"],
  ]).get(url.pathname) ?? null;
  if (isRsc && url.pathname.startsWith("/api/")) return null;
  return key && isRsc ? `${key}-rsc` : key;
}

export async function serveStaticResponse(request, env, manifest) {
  const key = staticResponseKey(request);
  const entry = key && manifest[key];
  if (!entry) return null;
  const asset = await env.ASSETS.fetch(new Request(`https://assets.invalid${entry.asset}`));
  if (!asset.ok) throw new Error(`Missing precomputed response: ${key}`);
  const headers = new Headers(entry.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Horse-Response", "build-asset");
  return new Response(request.method === "HEAD" ? null : asset.body, { status: 200, headers });
}
