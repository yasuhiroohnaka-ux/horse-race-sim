"use client";

import { useEffect, useState } from "react";
import { SiteRail } from "@/components/SiteRail";
import Link from "next/link";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// 分類別・帯別の成績 (calibration-report.json 内の値は "79.6%" 形式の文字列)
type ClassStat = {
  n: number;
  tanHit: string;
  fukuHit: string;
  wideHit: string;
  tanRoi: string;
  fukuRoi: string;
  wideRoi: string;
};

type ClassMap = Partial<Record<"place" | "win" | "skip", ClassStat>>;

type LogLossRow = {
  rawModel?: number;
  rawMarket?: number;
  deployed?: number;
  candidate?: number;
};

type CalibrationReport = {
  generatedAt?: string;
  sampleSize?: number;
  dateRange?: { from?: string; to?: string };
  winCalibration?: {
    coef?: { a: number; b: number };
    deployedCoef?: { a: number; b: number };
    deployedMeta?: {
      fittedAt?: string;
      sampleSize?: number;
      dateRange?: { from?: string; to?: string };
    };
  };
  placeCalibration?: {
    coef?: { a: number; b: number };
    deployedCoef?: { a: number; b: number };
  };
  placeOddsModel?: { slope: number; intercept: number; sampleSize: number };
  marketGapBands?: Array<{ band: string } & ClassStat>;
  winBuckets?: Array<{ band: string; n: number; avgRaw: string; avgCalibrated: string; actual: string }>;
  placeBuckets?: Array<{ band: string; n: number; avgRaw: string; avgCalibrated: string; actual: string }>;
  overall?: ClassStat;
  classificationBacktest?: ClassMap;
  recentClassificationBacktest?: ClassMap;
  monitoring?: {
    recordComposition?: {
      livePreRace?: { n: number; overall: ClassStat; classification: ClassMap };
      retrospective?: { n: number; overall: ClassStat; classification: ClassMap };
    };
    postCalibrationHoldout?: {
      cutoffDate?: string;
      n?: number;
      dateRange?: { from?: string; to?: string };
      win?: LogLossRow;
      place?: LogLossRow;
      deployedClassification?: ClassMap;
    };
    rollingRefitValidation?: {
      test?: { n?: number; dateRange?: { from?: string; to?: string }; win?: LogLossRow; place?: LogLossRow };
      adoptionGate?: {
        candidateWinBeatsMarket?: boolean;
        candidateWinNoWorseThanDeployed?: boolean;
        candidatePlaceNoWorseThanDeployed?: boolean;
        shouldWriteCoefficients?: boolean;
      };
    };
  };
};

type WeeklyTrendPoint = {
  weekOf: string;
  bets: number;
  tanRoi: number;
  fukuRoi: number;
  wideBets: number;
  wideRoi: number | null;
};

type MonitorPayload = {
  report: CalibrationReport | null;
  weeklyTrend: WeeklyTrendPoint[];
  updatedAt: string | null;
  error?: string;
};

// 系列色は dataviz 検証済みパレット (単勝/複勝/ワイドの識別)
const SERIES_COLORS = { tan: "#2a78d6", fuku: "#1baf7a", wide: "#eda100" } as const;

const CLASS_LABELS: Record<"place" | "win" | "skip", string> = {
  place: "place (複勝軸)",
  win: "win (単勝勝負)",
  skip: "skip (見送り)",
};

function parsePct(value: string | undefined): number | null {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function roiCellClass(value: string | undefined): string {
  const roi = parsePct(value);
  if (roi === null) return "text-ink-3";
  if (roi >= 100) return "font-bold text-hit";
  if (roi < 70) return "text-miss";
  return "text-ink";
}

function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" });
}

function formatWeekLabel(weekOf: string): string {
  const [, month, day] = weekOf.split("-");
  return month && day ? `${Number(month)}/${Number(day)}` : weekOf;
}

function formatLogLoss(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(4) : "-";
}

function SectionCard({
  label,
  title,
  description,
  children,
}: {
  label: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--r-lg)] border border-line bg-card p-6 ">
      <p className="t-label">{label}</p>
      <h2 className="mt-2 text-xl font-bold text-ink">{title}</h2>
      {description && <p className="mt-1 text-xs leading-5 text-ink-2">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ClassStatTable({ data, caption }: { data: ClassMap | undefined; caption?: string }) {
  const order: Array<"place" | "win" | "skip"> = ["place", "win", "skip"];
  return (
    <div className="overflow-x-auto">
      {caption && <p className="mb-2 text-xs font-semibold text-ink-2">{caption}</p>}
      <table className="w-full min-w-[480px] text-xs">
        <thead>
          <tr className="border-b border-line text-ink-2">
            <th className="px-2 py-2 text-left">分類</th>
            <th className="px-2 py-2 text-right">n</th>
            <th className="px-2 py-2 text-right">単的中</th>
            <th className="px-2 py-2 text-right">複的中</th>
            <th className="px-2 py-2 text-right">単ROI</th>
            <th className="px-2 py-2 text-right">複ROI</th>
            <th className="px-2 py-2 text-right">ワイドROI</th>
          </tr>
        </thead>
        <tbody>
          {order.map((key) => {
            const stat = data?.[key];
            if (!stat) return null;
            return (
              <tr key={key} className="border-b border-line-soft">
                <td className="px-2 py-2 font-semibold text-ink">{CLASS_LABELS[key]}</td>
                <td className="px-2 py-2 text-right text-ink-2">{stat.n}</td>
                <td className="px-2 py-2 text-right text-ink-2">{stat.tanHit}</td>
                <td className="px-2 py-2 text-right text-ink-2">{stat.fukuHit}</td>
                <td className={`px-2 py-2 text-right ${roiCellClass(stat.tanRoi)}`}>{stat.tanRoi}</td>
                <td className={`px-2 py-2 text-right ${roiCellClass(stat.fukuRoi)}`}>{stat.fukuRoi}</td>
                <td className={`px-2 py-2 text-right ${roiCellClass(stat.wideRoi)}`}>{stat.wideRoi}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LogLossTable({ win, place }: { win: LogLossRow | undefined; place: LogLossRow | undefined }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-xs">
        <thead>
          <tr className="border-b border-line text-ink-2">
            <th className="px-2 py-2 text-left">logLoss (小さいほど良い)</th>
            <th className="px-2 py-2 text-right">生モデル</th>
            <th className="px-2 py-2 text-right">市場単体</th>
            <th className="px-2 py-2 text-right">配備係数</th>
            <th className="px-2 py-2 text-right">候補係数</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-line-soft">
            <td className="px-2 py-2 font-semibold text-ink">winProb</td>
            <td className="px-2 py-2 text-right text-ink-2">{formatLogLoss(win?.rawModel)}</td>
            <td className="px-2 py-2 text-right text-ink-2">{formatLogLoss(win?.rawMarket)}</td>
            <td className="px-2 py-2 text-right font-semibold text-ink">{formatLogLoss(win?.deployed)}</td>
            <td className="px-2 py-2 text-right text-ink-2">{formatLogLoss(win?.candidate)}</td>
          </tr>
          <tr className="border-b border-line-soft">
            <td className="px-2 py-2 font-semibold text-ink">placeProb</td>
            <td className="px-2 py-2 text-right text-ink-2">{formatLogLoss(place?.rawModel)}</td>
            <td className="px-2 py-2 text-right text-ink-3">-</td>
            <td className="px-2 py-2 text-right font-semibold text-ink">{formatLogLoss(place?.deployed)}</td>
            <td className="px-2 py-2 text-right text-ink-2">{formatLogLoss(place?.candidate)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function AlertBanner({ tone, title, body }: { tone: "critical" | "warning" | "ok" | "info"; title: string; body: string }) {
  const styles: Record<string, string> = {
    critical: "border-miss bg-miss-wash text-miss",
    warning: "border-note bg-note-wash text-note",
    ok: "border-hit bg-hit-wash text-hit",
    info: "border-line bg-card text-ink-2",
  };
  const icons: Record<string, string> = { critical: "⛔", warning: "⚠", ok: "✓", info: "ℹ" };
  return (
    <div className={`rounded-[var(--r-md)] border px-4 py-3 text-sm ${styles[tone]}`}>
      <p className="font-bold">
        <span className="mr-2" aria-hidden>{icons[tone]}</span>
        {title}
      </p>
      <p className="mt-1 text-xs leading-5">{body}</p>
    </div>
  );
}

export default function MonitorPage() {
  const [data, setData] = useState<MonitorPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/calibration-report", { cache: "no-store" });
        const json = (await res.json()) as MonitorPayload;
        if (!cancelled) {
          setData(json);
          setFailed(!res.ok || !json.report);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const report = data?.report ?? null;
  const trend = data?.weeklyTrend ?? [];

  const holdout = report?.monitoring?.postCalibrationHoldout;
  const refit = report?.monitoring?.rollingRefitValidation;
  const gate = refit?.adoptionGate;
  const composition = report?.monitoring?.recordComposition;
  const recentPlace = report?.recentClassificationBacktest?.place;

  const calibrationDegraded =
    Number(holdout?.n ?? 0) >= 50 &&
    typeof holdout?.win?.deployed === "number" &&
    typeof holdout?.win?.rawMarket === "number" &&
    holdout.win.deployed > holdout.win.rawMarket;

  const recentPlaceWideRoi = parsePct(recentPlace?.wideRoi);
  const wideDegraded =
    Number(recentPlace?.n ?? 0) >= 30 && recentPlaceWideRoi !== null && recentPlaceWideRoi < 100;

  const holdoutPlaceWideRoi = parsePct(holdout?.deployedClassification?.place?.wideRoi);

  return (
    <div className="min-h-screen bg-paper">
      <SiteRail current="/monitor" />
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 md:px-6 md:py-7">
        <header className="flex flex-col gap-3 border-b border-line pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="t-label">Model monitor</p>
            <h1 className="t-title mt-1.5 text-[26px]">モデル監視</h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-ink-2">
              校正レポートをそのまま画面にしたものです。成績は発走前のライブ予測 (live_pre_race) を正とし、
              遡及分はフィット補助に限定しています。
            </p>
          </div>
          <p className="t-num shrink-0 text-[11px] leading-5 text-ink-3 lg:text-right">
            生成 {formatDateTime(report?.generatedAt)}
            <br />
            確定本命 {report?.sampleSize ?? "-"} 件 ({report?.dateRange?.from ?? "-"} 〜 {report?.dateRange?.to ?? "-"})
          </p>
        </header>

        {failed && (
          <AlertBanner
            tone="critical"
            title="校正レポートを読み込めませんでした"
            body="data/analysis/calibration-report.json が存在するか、node scripts/calibration-report.mjs を実行済みか確認してください。"
          />
        )}

        {report && (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {calibrationDegraded ? (
                <AlertBanner
                  tone="critical"
                  title="校正劣化警告"
                  body={`配備係数が事後 live holdout (n=${holdout?.n}) で市場単体を下回っています (deployed ${formatLogLoss(holdout?.win?.deployed)} > market ${formatLogLoss(holdout?.win?.rawMarket)})。係数の時系列再フィット検証を確認してください。`}
                />
              ) : (
                <AlertBanner
                  tone="ok"
                  title="校正は市場単体に対して健全"
                  body={`事後 live holdout (n=${holdout?.n ?? "-"}) で配備係数 logLoss ${formatLogLoss(holdout?.win?.deployed)} < 市場単体 ${formatLogLoss(holdout?.win?.rawMarket)}。市場超過のシグナルを維持しています。`}
                />
              )}
              {wideDegraded ? (
                <AlertBanner
                  tone="warning"
                  title="ワイド劣化 (推奨は停止中)"
                  body={`直近50件の place 分類でワイドROI ${recentPlace?.wideRoi} (n=${recentPlace?.n})。live holdout でも ${holdoutPlaceWideRoi !== null ? `${holdoutPlaceWideRoi.toFixed(1)}%` : "-"} のため、2026-07-11 からワイド推奨は shadowOnly (表示停止・決済監視のみ) に切り替えています。`}
                />
              ) : (
                <AlertBanner
                  tone="info"
                  title="ワイド推奨は停止中 (シャドー監視)"
                  body={`live holdout の place ワイドROI ${holdoutPlaceWideRoi !== null ? `${holdoutPlaceWideRoi.toFixed(1)}%` : "-"}。直近50件が100%超を安定して回復したら推奨復活を再検討します。`}
                />
              )}
            </div>

            <SectionCard
              label="COEFFICIENT GATE"
              title="係数更新ゲート"
              description="直近50件を取り置いた再フィット検証。全条件を満たした場合のみ --write-coefficients で係数を更新します。"
            >
              <div className="grid gap-2 text-xs md:grid-cols-2">
                <div className={`rounded-[var(--r-md)] px-3 py-2 ${gate?.candidateWinBeatsMarket ? "bg-hit-wash text-hit" : "bg-paper-sunk text-ink-2"}`}>
                  {gate?.candidateWinBeatsMarket ? "✓" : "✗"} win 候補係数が市場単体に勝つ
                </div>
                <div className={`rounded-[var(--r-md)] px-3 py-2 ${gate?.candidateWinNoWorseThanDeployed ? "bg-hit-wash text-hit" : "bg-paper-sunk text-ink-2"}`}>
                  {gate?.candidateWinNoWorseThanDeployed ? "✓" : "✗"} win 候補係数が配備係数以上
                </div>
                <div className={`rounded-[var(--r-md)] px-3 py-2 ${gate?.candidatePlaceNoWorseThanDeployed ? "bg-hit-wash text-hit" : "bg-paper-sunk text-ink-2"}`}>
                  {gate?.candidatePlaceNoWorseThanDeployed ? "✓" : "✗"} place 候補係数が配備係数以上
                </div>
                <div className={`rounded-[var(--r-md)] px-3 py-2 font-bold ${gate?.shouldWriteCoefficients ? "bg-hit-wash text-hit" : "bg-note-wash text-note"}`}>
                  {gate?.shouldWriteCoefficients ? "→ ゲート通過: 係数更新を実行してよい" : "→ ゲート未通過: 係数は据え置き"}
                </div>
              </div>
              <p className="mt-3 text-xs text-ink-2">
                配備係数の学習: {report.winCalibration?.deployedMeta?.sampleSize ?? "-"} 件 (
                {report.winCalibration?.deployedMeta?.dateRange?.from ?? "-"} 〜{" "}
                {report.winCalibration?.deployedMeta?.dateRange?.to ?? "-"}) / 検証窓:{" "}
                {refit?.test?.n ?? "-"} 件 ({refit?.test?.dateRange?.from ?? "-"} 〜 {refit?.test?.dateRange?.to ?? "-"})
              </p>
              <div className="mt-3">
                <LogLossTable win={refit?.test?.win} place={refit?.test?.place} />
              </div>
            </SectionCard>

            <SectionCard
              label="LIVE HOLDOUT"
              title={`配備係数の事後 live holdout (n=${holdout?.n ?? "-"})`}
              description={`配備係数の最終学習日 ${holdout?.cutoffDate ?? "-"} より後の live_pre_race のみで評価 (${holdout?.dateRange?.from ?? "-"} 〜 ${holdout?.dateRange?.to ?? "-"})。ここが実運用に一番近い成績です。`}
            >
              <LogLossTable win={holdout?.win} place={holdout?.place} />
              <div className="mt-4">
                <ClassStatTable data={holdout?.deployedClassification} caption="holdout 期間の分類別成績" />
              </div>
            </SectionCard>

            <SectionCard
              label="WEEKLY TREND"
              title="週次ROI推移 (live_pre_race のみ)"
              description="週ごとの確定済み本命の回収率。ワイドは pair 決済があるレースのみ。100% が損益分岐です。"
            >
              {trend.length > 0 ? (
                <>
                  <div style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="weekOf" tickFormatter={formatWeekLabel} tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} unit="%" width={48} />
                        <Tooltip
                          formatter={(value, name) => [
                            typeof value === "number" ? `${value.toFixed(1)}%` : "-",
                            String(name),
                          ]}
                          labelFormatter={(label) => {
                            const point = trend.find((p) => p.weekOf === String(label));
                            return `${String(label)} 週 (本命 ${point?.bets ?? "-"} 件 / ワイド ${point?.wideBets ?? "-"} 件)`;
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="tanRoi" name="単勝ROI" stroke={SERIES_COLORS.tan} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 5 }} />
                        <Line type="monotone" dataKey="fukuRoi" name="複勝ROI" stroke={SERIES_COLORS.fuku} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 5 }} />
                        <Line type="monotone" dataKey="wideRoi" name="ワイドROI" stroke={SERIES_COLORS.wide} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 5 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-ink-2">週次の数値テーブルを開く</summary>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full min-w-[480px] text-xs">
                        <thead>
                          <tr className="border-b border-line text-ink-2">
                            <th className="px-2 py-2 text-left">週 (月曜起点)</th>
                            <th className="px-2 py-2 text-right">本命数</th>
                            <th className="px-2 py-2 text-right">単勝ROI</th>
                            <th className="px-2 py-2 text-right">複勝ROI</th>
                            <th className="px-2 py-2 text-right">ワイドROI</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trend.map((point) => (
                            <tr key={point.weekOf} className="border-b border-line-soft">
                              <td className="px-2 py-2 text-ink">{point.weekOf}</td>
                              <td className="px-2 py-2 text-right text-ink-2">{point.bets}</td>
                              <td className={`px-2 py-2 text-right ${roiCellClass(`${point.tanRoi}%`)}`}>{point.tanRoi.toFixed(1)}%</td>
                              <td className={`px-2 py-2 text-right ${roiCellClass(`${point.fukuRoi}%`)}`}>{point.fukuRoi.toFixed(1)}%</td>
                              <td className={`px-2 py-2 text-right ${point.wideRoi === null ? "text-ink-3" : roiCellClass(`${point.wideRoi}%`)}`}>
                                {point.wideRoi === null ? "-" : `${point.wideRoi.toFixed(1)}%`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </>
              ) : (
                <p className="text-sm text-ink-2">live_pre_race の確定データがまだありません。</p>
              )}
            </SectionCard>

            <div className="grid gap-6 lg:grid-cols-2">
              <SectionCard
                label="CLASSIFICATION"
                title="分類バックテスト (全期間)"
                description={`確定済み ${report.sampleSize ?? "-"} 件を現行ゲート・配備係数で再分類した成績。skip 行の ROI は「見送りによる機会損失」(低いほど見送りが正解)。`}
              >
                <ClassStatTable data={report.classificationBacktest} />
              </SectionCard>
              <SectionCard
                label="FRESHNESS"
                title="直近50件の分類別成績"
                description="鮮度監視用の移動窓。place のワイドROI 100%割れが続く場合はワイド推奨を見直します (現在停止中)。"
              >
                <ClassStatTable data={report.recentClassificationBacktest} />
              </SectionCard>
            </div>

            <SectionCard
              label="DATA COMPOSITION"
              title="データ構成 (live / 遡及)"
              description="成績評価は live_pre_race を正とします。遡及 (retrospective/backfill) は校正フィットの補助のみで、採用判断には使いません。"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-xs">
                  <thead>
                    <tr className="border-b border-line text-ink-2">
                      <th className="px-2 py-2 text-left">区分</th>
                      <th className="px-2 py-2 text-right">n</th>
                      <th className="px-2 py-2 text-right">単的中</th>
                      <th className="px-2 py-2 text-right">複的中</th>
                      <th className="px-2 py-2 text-right">単ROI</th>
                      <th className="px-2 py-2 text-right">複ROI</th>
                      <th className="px-2 py-2 text-right">ワイドROI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["live_pre_race (評価対象)", composition?.livePreRace],
                        ["retrospective / backfill", composition?.retrospective],
                      ] as const
                    ).map(([label, bucket]) =>
                      bucket ? (
                        <tr key={label} className="border-b border-line-soft">
                          <td className="px-2 py-2 font-semibold text-ink">{label}</td>
                          <td className="px-2 py-2 text-right text-ink-2">{bucket.overall.n}</td>
                          <td className="px-2 py-2 text-right text-ink-2">{bucket.overall.tanHit}</td>
                          <td className="px-2 py-2 text-right text-ink-2">{bucket.overall.fukuHit}</td>
                          <td className={`px-2 py-2 text-right ${roiCellClass(bucket.overall.tanRoi)}`}>{bucket.overall.tanRoi}</td>
                          <td className={`px-2 py-2 text-right ${roiCellClass(bucket.overall.fukuRoi)}`}>{bucket.overall.fukuRoi}</td>
                          <td className={`px-2 py-2 text-right ${roiCellClass(bucket.overall.wideRoi)}`}>{bucket.overall.wideRoi}</td>
                        </tr>
                      ) : null
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard
              label="MARKET GAP"
              title="市場ギャップ別成績"
              description="市場 implied と校正勝率の差 (officialImplied − calWinProb) 別の成績。overbetLabel の閾値根拠です。"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-xs">
                  <thead>
                    <tr className="border-b border-line text-ink-2">
                      <th className="px-2 py-2 text-left">帯</th>
                      <th className="px-2 py-2 text-right">n</th>
                      <th className="px-2 py-2 text-right">単ROI</th>
                      <th className="px-2 py-2 text-right">複ROI</th>
                      <th className="px-2 py-2 text-right">ワイドROI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report.marketGapBands ?? []).map((band) => (
                      <tr key={band.band} className="border-b border-line-soft">
                        <td className="px-2 py-2 text-ink">{band.band}</td>
                        <td className="px-2 py-2 text-right text-ink-2">{band.n}</td>
                        <td className={`px-2 py-2 text-right ${roiCellClass(band.tanRoi)}`}>{band.tanRoi}</td>
                        <td className={`px-2 py-2 text-right ${roiCellClass(band.fukuRoi)}`}>{band.fukuRoi}</td>
                        <td className={`px-2 py-2 text-right ${roiCellClass(band.wideRoi)}`}>{band.wideRoi}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <div className="grid gap-6 lg:grid-cols-2">
              {(
                [
                  ["winProb 校正バケット", report.winBuckets],
                  ["placeProb 校正バケット", report.placeBuckets],
                ] as const
              ).map(([title, buckets]) => (
                <SectionCard
                  key={title}
                  label="CALIBRATION"
                  title={title}
                  description="生値 → 校正値 → 実績の帯別対応。校正値が実績と揃っているほど健全です。"
                >
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[360px] text-xs">
                      <thead>
                        <tr className="border-b border-line text-ink-2">
                          <th className="px-2 py-2 text-left">帯</th>
                          <th className="px-2 py-2 text-right">n</th>
                          <th className="px-2 py-2 text-right">生値平均</th>
                          <th className="px-2 py-2 text-right">校正後</th>
                          <th className="px-2 py-2 text-right">実績</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(buckets ?? []).map((bucket) => (
                          <tr key={bucket.band} className="border-b border-line-soft">
                            <td className="px-2 py-2 text-ink">{bucket.band}</td>
                            <td className="px-2 py-2 text-right text-ink-2">{bucket.n}</td>
                            <td className="px-2 py-2 text-right text-ink-2">{bucket.avgRaw}</td>
                            <td className="px-2 py-2 text-right font-semibold text-ink">{bucket.avgCalibrated}</td>
                            <td className="px-2 py-2 text-right text-ink-2">{bucket.actual}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              ))}
            </div>

            <SectionCard label="MODEL INFO" title="係数・補助モデル情報">
              <div className="grid gap-3 text-xs text-ink-2 md:grid-cols-3">
                <div className="rounded-[var(--r-md)] bg-paper-sunk p-4">
                  <p className="font-bold text-ink">配備係数 (win / place)</p>
                  <p className="mt-2">
                    win: a={report.winCalibration?.deployedCoef?.a ?? "-"}, b={report.winCalibration?.deployedCoef?.b ?? "-"}
                  </p>
                  <p>
                    place: a={report.placeCalibration?.deployedCoef?.a ?? "-"}, b={report.placeCalibration?.deployedCoef?.b ?? "-"}
                  </p>
                  <p className="mt-2 text-ink-3">学習: {formatDateTime(report.winCalibration?.deployedMeta?.fittedAt)}</p>
                </div>
                <div className="rounded-[var(--r-md)] bg-paper-sunk p-4">
                  <p className="font-bold text-ink">全件再フィット候補 (参考)</p>
                  <p className="mt-2">
                    win: a={report.winCalibration?.coef?.a ?? "-"}, b={report.winCalibration?.coef?.b ?? "-"}
                  </p>
                  <p>
                    place: a={report.placeCalibration?.coef?.a ?? "-"}, b={report.placeCalibration?.coef?.b ?? "-"}
                  </p>
                  <p className="mt-2 text-ink-3">更新ゲート通過時のみ採用</p>
                </div>
                <div className="rounded-[var(--r-md)] bg-paper-sunk p-4">
                  <p className="font-bold text-ink">複勝オッズ近似 (実払戻OLS)</p>
                  <p className="mt-2">
                    placeOdds ≈ 単勝オッズ × {report.placeOddsModel?.slope ?? "-"} + {report.placeOddsModel?.intercept ?? "-"}
                  </p>
                  <p className="mt-2 text-ink-3">n={report.placeOddsModel?.sampleSize ?? "-"} (的中サンプルのみ)</p>
                </div>
              </div>
            </SectionCard>

            <footer className="pb-4 text-center text-xs text-ink-3">
              データ更新: 週次ルーチンの回顧ステージ後に自動再生成 / 手動更新は node scripts/calibration-report.mjs
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
