import fs from "node:fs";
import path from "node:path";

import { TANPUKU_SCORING_VERSION } from "@/lib/tanpukuSelection.mjs";

/**
 * トップページに出す成績は `scripts/backtest-selection.mjs --write` が書いた
 * JSON をそのまま読む。数値を画面に直書きしないことで、ゲートを変えたのに
 * 表示だけ古いという状態を作らない。
 */

const REPORT_PATH = path.join(process.cwd(), "data", "analysis", "backtest-selection.json");

export type VerdictKey = "win" | "place" | "skip";

export type VerdictLine = {
  key: VerdictKey;
  label: string;
  blurb: string;
  races: number;
  share: number;
  hitRate: number;
  roi: number;
};

export type EngineScorecard = {
  version: string;
  generatedAt: string | null;
  totalRaces: number;
  overallHitRate: number;
  overallRoi: number;
  verdicts: VerdictLine[];
};

type Row = {
  classification: string;
  tanHit: boolean;
  tanPayout: number;
};

const COPY: Record<VerdictKey, { label: string; blurb: string }> = {
  win: { label: "単勝勝負", blurb: "校正勝率が立ち、市場も本命視している" },
  place: { label: "抑え", blurb: "単勝の根拠は薄いが3着内は堅い" },
  skip: { label: "見送り", blurb: "本命が4倍以上に沈む混戦、または両面が基準未満" },
};

function summarize(rows: Row[]) {
  const n = rows.length;
  if (n === 0) return { n: 0, hitRate: 0, roi: 0 };
  const hits = rows.filter((r) => r.tanHit).length;
  const paid = rows.reduce((acc, r) => acc + r.tanPayout, 0);
  return { n, hitRate: (hits / n) * 100, roi: (paid / (n * 100)) * 100 };
}

export function readEngineScorecard(): EngineScorecard | null {
  let parsed: { generatedAt?: string; rows?: Row[] };
  try {
    parsed = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
  } catch {
    return null;
  }
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  if (rows.length === 0) return null;

  const overall = summarize(rows);
  const verdicts = (["win", "place", "skip"] as const).map((key) => {
    const subset = summarize(rows.filter((r) => r.classification === key));
    return {
      key,
      label: COPY[key].label,
      blurb: COPY[key].blurb,
      races: subset.n,
      share: (subset.n / rows.length) * 100,
      hitRate: subset.hitRate,
      roi: subset.roi,
    };
  });

  return {
    version: TANPUKU_SCORING_VERSION,
    generatedAt: parsed.generatedAt ?? null,
    totalRaces: rows.length,
    overallHitRate: overall.hitRate,
    overallRoi: overall.roi,
    verdicts,
  };
}
