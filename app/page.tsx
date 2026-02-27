import Link from "next/link";
import { PerformancePanel } from "@/components/PerformancePanel";

export default function Home() {
    return (
        <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
            <div className="max-w-2xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">🏇 AI競馬シミュレーター</h1>
                    <p className="text-slate-500 mt-2">集合知 × 物理エンジンで市場の歪みを発見</p>
                </header>

                {/* 今週のレース */}
                <div className="bg-white rounded-lg shadow-md border border-slate-200 p-6 mb-4">
                    <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        今週のレース (3/1)
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                            <p className="text-sm font-bold text-slate-800">中山記念</p>
                            <p className="text-xs text-slate-500">中山 芝 1800m GII</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                            <p className="text-sm font-bold text-slate-800">オーシャンS</p>
                            <p className="text-xs text-slate-500">中山 芝 1200m GIII</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                            <p className="text-sm font-bold text-slate-800">チューリップ賞</p>
                            <p className="text-xs text-slate-500">阪神 芝 1600m GII</p>
                        </div>
                    </div>
                </div>

                <PerformancePanel />

                <div className="bg-white rounded-lg shadow-md border border-slate-200 p-8">
                    <p className="text-slate-700 leading-relaxed mb-2">
                        Xや掲示板の「みんなの予想」をオッズ化し、市場との差＝世論の偏りを発見。
                    </p>
                    <p className="text-slate-700 leading-relaxed mb-6">
                        バイアスや戦績を加味して100回試走し、結果をそのままXに投稿できます。
                    </p>

                    <ul className="space-y-2 mb-8 text-sm text-slate-600">
                        <li className="flex items-center gap-2">
                            <span className="text-green-500">✅</span>
                            集合知スコア入力（◎×6・〇×4・▲×3・△×2・☆×1 の合計）
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="text-green-500">✅</span>
                            物理エンジン 100回試走（能力値・脚質・馬場バイアス）
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="text-green-500">✅</span>
                            物理% × 集合知% の差分で「狙い目」を即可視化
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="text-green-500">✅</span>
                            シミュ結果・X人気ランキングをそのままXへ投稿
                        </li>
                    </ul>

                    <Link
                        href="/sim"
                        className="block w-full text-center px-6 py-4 bg-blue-600 text-white text-lg font-bold rounded-full shadow-lg hover:bg-blue-700 hover:shadow-xl transition"
                    >
                        シミュレーターを開始する →
                    </Link>
                    <p className="text-center text-xs text-slate-400 mt-3">
                        馬パラメータ入力・100回試走・X投稿まで完結します。
                    </p>
                </div>

                {/* アーカイブセクション */}
                <div className="mt-4 bg-white rounded-lg shadow-sm border border-slate-200 p-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-slate-400">📦</span>
                            <h3 className="text-sm font-bold text-slate-600">過去のレース</h3>
                        </div>
                        <Link
                            href="/archive"
                            className="text-sm text-blue-600 hover:underline"
                        >
                            一覧を見る →
                        </Link>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                        <Link
                            href="/sim?archive=tokyo-dirt-1600"
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-100 transition"
                        >
                            <span className="text-xs text-amber-600 font-bold">2/22</span>
                            フェブラリーS
                        </Link>
                    </div>
                </div>

                <footer className="mt-8 text-center text-xs text-slate-400">
                    Powered by Next.js &amp; Tailwind CSS
                </footer>
            </div>
        </div>
    );
}
