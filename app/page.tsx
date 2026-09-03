import Link from "next/link";

import { PerformancePanel } from "@/components/PerformancePanel";
import { SiteRail } from "@/components/SiteRail";
import { WeeklyRaceBrowser } from "@/components/WeeklyRaceBrowser";
import { ACTIVE_COURSES } from "@/lib/courses";
import { readEngineScorecard } from "@/lib/engineScorecard";
import { MONTE_CARLO_RUNS_LABEL } from "@/lib/simulationConfig";

const VERDICT_STYLE = {
  win: { chip: "verdict verdict-go", bar: "var(--go)" },
  place: { chip: "verdict verdict-hold", bar: "var(--turf-ink-2)" },
  skip: { chip: "verdict verdict-pass", bar: "var(--turf-line)" },
} as const;

const GATES = [
  {
    step: "両面弱",
    rule: "校正複勝率 < 52% かつ 校正単ROI < 85",
    outcome: "見送り",
  },
  {
    step: "混戦",
    rule: "本命オッズ ≥ 4.0倍",
    outcome: "見送り",
  },
  {
    step: "本命級",
    rule: "校正勝率 ≥ 35% かつ 校正単ROI ≥ 95",
    outcome: "単勝勝負",
  },
  {
    step: "堅軸",
    rule: "校正勝率 ≥ 30% かつ オッズ < 4.0倍",
    outcome: "単勝勝負",
  },
  {
    step: "3着内",
    rule: "校正複勝率 ≥ 60%",
    outcome: "抑え",
  },
];

export default function Home() {
  const scorecard = readEngineScorecard();

  return (
    <div className="min-h-screen bg-paper">
      <SiteRail />

      <main className="mx-auto max-w-[1180px] space-y-5 px-4 py-5 md:px-6 md:py-7">
        {/* ---- 掲示板: 何を主張する道具なのかを、実測値ごと出す ---- */}
        <section className="board overflow-hidden">
          <div className="grid gap-8 p-6 md:p-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <div className="flex flex-col justify-between gap-7">
              <div>
                <p className="t-label" style={{ color: "var(--turf-ink-2)" }}>
                  単勝ラボ / Tansho Lab
                </p>
                <h1 className="t-display mt-4 text-[40px] text-turf-ink md:text-[56px]">
                  混戦は
                  <br />
                  買いません
                </h1>
                <p className="mt-5 max-w-md text-[14px] leading-7 text-turf-ink-2">
                  条件を固定して各馬を{MONTE_CARLO_RUNS_LABEL}走らせ、その勝率を確定レースの実績で校正し、
                  市場オッズと突き合わせます。単勝で勝負できるレースだけに「単勝勝負」が出ます。
                  本命が4倍以上に沈むレースには手を出しません。
                </p>
              </div>

              <div className="flex flex-wrap gap-2.5">
                <Link href="/sim" className="btn btn-go">
                  今週のレースを分析する
                </Link>
                <Link href="/archive" className="btn btn-quiet">
                  回顧を見る
                </Link>
              </div>
            </div>

            {/* ---- 署名要素: 判定の内訳ボード ---- */}
            {scorecard ? (
              <div className="rounded-[var(--r-lg)] border border-turf-line bg-turf-raised p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="t-label" style={{ color: "var(--turf-ink-2)" }}>
                    確定 {scorecard.totalRaces} レースでの実測
                  </p>
                  <p className="t-num text-[11px] text-turf-ink-2">{scorecard.version}</p>
                </div>

                {/* レース全体をどう振り分けているか */}
                <div className="mt-4 flex h-2 overflow-hidden rounded-full">
                  {scorecard.verdicts.map((v) => (
                    <span
                      key={v.key}
                      style={{ width: `${v.share}%`, background: VERDICT_STYLE[v.key].bar }}
                      title={`${v.label} ${v.share.toFixed(0)}%`}
                    />
                  ))}
                </div>

                <dl className="mt-5 space-y-3.5">
                  {scorecard.verdicts.map((v) => (
                    <div
                      key={v.key}
                      className="border-t border-turf-line pt-3.5 first:border-0 first:pt-0"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                        <div className="flex items-center gap-2.5">
                          <dt className={VERDICT_STYLE[v.key].chip}>{v.label}</dt>
                          <dd className="t-num whitespace-nowrap text-[11px] text-turf-ink-2">
                            {v.races}R / {v.share.toFixed(0)}%
                          </dd>
                        </div>
                        <dd className="flex items-baseline gap-4">
                          <span className="whitespace-nowrap">
                            <span className="t-num text-[22px] font-bold text-turf-ink">
                              {v.hitRate.toFixed(1)}
                            </span>
                            <span className="ml-0.5 text-[11px] text-turf-ink-2">% 的中</span>
                          </span>
                          <span className="whitespace-nowrap">
                            <span className="t-num text-[22px] font-bold text-turf-ink">
                              {v.roi.toFixed(0)}
                            </span>
                            <span className="ml-0.5 text-[11px] text-turf-ink-2">% 回収</span>
                          </span>
                        </dd>
                      </div>
                      <dd className="mt-1.5 text-[12px] leading-5 text-turf-ink-2">{v.blurb}</dd>
                    </div>
                  ))}
                </dl>

                <p className="mt-5 border-t border-turf-line pt-3 text-[11px] leading-5 text-turf-ink-2">
                  全レースの本命をそのまま買うと 的中 {scorecard.overallHitRate.toFixed(1)}% /
                  回収 {scorecard.overallRoi.toFixed(0)}%。単勝勝負だけに絞ると的中率が上がります。
                  回収率は控除率20%を超えていないので、勝てる保証ではありません。
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <WeeklyRaceBrowser courses={ACTIVE_COURSES} />

        <PerformancePanel />

        {/* ---- 判定の流れ。上から順に評価して、最初に当たった行で決まる ---- */}
        <section className="card p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="t-title text-[19px]">判定の流れ</h2>
            <p className="text-[12px] text-ink-3">
              上から順に見て、最初に当てはまった行で決まります
            </p>
          </div>

          <ol className="mt-5 overflow-hidden rounded-[var(--r-md)] border border-line">
            {GATES.map((gate, index) => (
              <li
                key={gate.step}
                className="grid grid-cols-[2.25rem_minmax(6rem,auto)_1fr_auto] items-center gap-3 border-b border-line-soft bg-card px-3 py-3 last:border-b-0 md:gap-4 md:px-4"
              >
                <span className="t-num text-[12px] text-ink-3">{index + 1}</span>
                <span className="text-[13px] font-bold text-ink">{gate.step}</span>
                <span className="t-num text-[12px] text-ink-2">{gate.rule}</span>
                <span
                  className={
                    gate.outcome === "単勝勝負"
                      ? "verdict verdict-go"
                      : gate.outcome === "抑え"
                        ? "verdict verdict-hold"
                        : "verdict verdict-pass"
                  }
                >
                  {gate.outcome}
                </span>
              </li>
            ))}
          </ol>

          <p className="mt-4 text-[12px] leading-6 text-ink-2">
            どれにも当てはまらない中間帯は「抑え」に落とします。閾値は前半のレースだけで決めて、
            後半で検証したものです。判定に使うのは校正勝率とオッズの2つだけで、
            期待値や頭数は前後半で挙動が反転したため使っていません。
          </p>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-2 pb-6 pt-2 text-[11px] text-ink-3">
          <span>単勝ラボ</span>
          <span className="t-num">
            {scorecard?.generatedAt
              ? `成績更新 ${scorecard.generatedAt.slice(0, 10)}`
              : "成績データ未生成"}
          </span>
        </footer>
      </main>
    </div>
  );
}
