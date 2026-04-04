import Link from "next/link";
import { PerformancePanel } from "@/components/PerformancePanel";
import { WeeklyRaceBrowser } from "@/components/WeeklyRaceBrowser";
import { ACTIVE_COURSES } from "@/lib/courses";
import { MONTE_CARLO_RUNS_LABEL } from "@/lib/simulationConfig";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-[32px] bg-slate-900 text-white shadow-2xl">
          <div className="grid gap-8 px-6 py-8 md:grid-cols-[1.2fr_0.8fr] md:px-10 md:py-12">
            <div>
              <h1 className="text-4xl font-black tracking-[0.12em] text-white md:text-6xl">
                KEIBA GAP LAB
              </h1>
              <p className="mt-3 text-sm font-semibold tracking-[0.2em] text-slate-300 md:text-base">
                能力と人気の乖離を見抜く
              </p>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
                このアプリがやることは単純です。血統、コース、馬場、天候、風、展開を条件として固定し、
                各馬を{MONTE_CARLO_RUNS_LABEL}試走させた勝ちやすさを出す。その結果を、公式オッズと俺プロ由来のガチ勢オッズ、
                さらに評判指数と並べて、人気先行と市場の盲点を見ます。
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/sim"
                  className="rounded-full bg-blue-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-400"
                >
                  今週の対象レースを分析する
                </Link>
                <Link
                  href="/archive"
                  className="rounded-full border border-slate-600 px-6 py-3 text-sm font-bold text-slate-100 transition hover:bg-slate-800"
                >
                  レース回顧を見る
                </Link>
              </div>
            </div>

            <div className="grid gap-3 self-end sm:grid-cols-3 md:grid-cols-1">
              <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-[11px] font-semibold tracking-[0.2em] text-slate-300">STEP 1</p>
                <p className="mt-2 text-lg font-bold">能力を分解</p>
                <p className="mt-1 text-sm text-slate-300">能力4値に加えて、血統・コース・距離・馬場・展開適性を別管理。</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-[11px] font-semibold tracking-[0.2em] text-slate-300">STEP 2</p>
                <p className="mt-2 text-lg font-bold">{MONTE_CARLO_RUNS_LABEL}試走</p>
                <p className="mt-1 text-sm text-slate-300">馬場、天候、風向き、風速、展開を固定して勝率とフェアオッズを算出。</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-[11px] font-semibold tracking-[0.2em] text-slate-300">STEP 3</p>
                <p className="mt-2 text-lg font-bold">市場と比較</p>
                <p className="mt-1 text-sm text-slate-300">公式オッズとガチ勢オッズとの差を見て、市場注目馬と妙味候補を切り分け。</p>
              </div>
            </div>
          </div>
        </section>

        <WeeklyRaceBrowser courses={ACTIVE_COURSES} />

        <PerformancePanel />

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <p className="text-xs font-semibold tracking-[0.2em] text-slate-400">WHAT YOU CAN SEE</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">見るべき指標</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-900">能力と人気のズレ</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  試走勝率と公式オッズの期待値差から、人気先行の馬と過小評価の馬を同じ表で確認します。
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-900">一般市場 vs ガチ勢</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  俺プロ本命人数をベースにしたガチ勢オッズを並べ、一般人気との温度差を可視化します。
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-900">展開を変えた再試走</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  スロー / 平均 / ハイ、向かい風 / 追い風などを変えながら、勝ち筋のある馬を見直せます。
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-900">X投稿まで一気通貫</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  市場注目馬、妙味候補、公式とガチ勢の乖離が大きい馬を、そのまま要約して投稿できます。
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold tracking-[0.2em] text-slate-400">FLOW</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">使い方</h2>
            <ol className="mt-4 space-y-4 text-sm text-slate-600">
              <li>
                <span className="font-bold text-slate-900">1.</span> 今週の対象レースを選ぶ
              </li>
              <li>
                <span className="font-bold text-slate-900">2.</span> 馬場、天気、風、展開を設定する
              </li>
              <li>
                <span className="font-bold text-slate-900">3.</span> 公式オッズとガチ勢オッズのズレを見る
              </li>
              <li>
                <span className="font-bold text-slate-900">4.</span> {MONTE_CARLO_RUNS_LABEL}試走して市場注目馬と妙味候補を確認する
              </li>
            </ol>
          </div>
        </section>

        <footer className="pb-4 text-center text-xs text-slate-400">
          Powered by Next.js
        </footer>
      </div>
    </div>
  );
}
