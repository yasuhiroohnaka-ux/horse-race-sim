const GITHUB_DISPATCH_URL =
  "https://api.github.com/repos/yasuhiroohnaka-ux/horse-race-sim/actions/workflows/weekly-keiba-update.yml/dispatches";

const CAPTURE_UTC_TIMES = new Set(["03:17", "04:17", "04:47", "05:17", "06:47", "07:17"]);

export function stageForScheduledTime(scheduledTime) {
  const date = new Date(scheduledTime);
  if (!Number.isFinite(date.getTime())) throw new TypeError("Invalid scheduled time");
  const day = date.getUTCDay();
  if (day !== 6 && day !== 0) return null;
  const time = `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
  if (time === "00:00") return day === 6 ? "sat_09" : "sun_09";
  if (time === "06:00") return day === 6 ? "sat_15" : "sun_15";
  if (CAPTURE_UTC_TIMES.has(time)) return "capture_only";
  return null;
}

export async function dispatchScheduled(scheduledTime, env, fetchImpl = fetch) {
  const stage = stageForScheduledTime(scheduledTime);
  if (!stage) return { dispatched: false, stage: null };
  if (!env?.GITHUB_DISPATCH_TOKEN) throw new Error("GITHUB_DISPATCH_TOKEN is missing");
  const response = await fetchImpl(GITHUB_DISPATCH_URL, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2026-03-10",
    },
    body: JSON.stringify({ ref: "main", inputs: { stage } }),
  });
  if (!response.ok) throw new Error(`GitHub workflow dispatch failed: HTTP ${response.status}`);
  return { dispatched: true, stage, status: response.status };
}

export default {
  async scheduled(controller, env) {
    const result = await dispatchScheduled(controller.scheduledTime, env);
    if (result.dispatched) {
      console.log(JSON.stringify({ ...result,
        scheduledAt: new Date(controller.scheduledTime).toISOString(),
        dispatchedAt: new Date().toISOString(),
      }));
    }
  },
};
