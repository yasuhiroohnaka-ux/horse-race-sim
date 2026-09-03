import Link from "next/link";

import { TANPUKU_SCORING_VERSION } from "@/lib/tanpukuSelection.mjs";

const NAV = [
  { href: "/sim", label: "レースを分析" },
  { href: "/archive", label: "回顧" },
  { href: "/monitor", label: "モデル監視" },
];

/**
 * 全ページ共通の細い上部レール。計器なので、常に稼働中のエンジン版数を出す。
 */
export function SiteRail({ current }: { current?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-5 px-4 md:px-6">
        <Link href="/" className="flex items-baseline gap-2.5">
          <span className="t-title text-[17px] tracking-tight text-ink">単勝ラボ</span>
          <span className="t-label hidden sm:block">Tansho Lab</span>
        </Link>

        <nav className="ml-auto flex items-center gap-1">
          {NAV.map((item) => {
            const active = current === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-[var(--r-md)] px-3 py-1.5 text-[13px] font-bold transition-colors ${
                  active ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-sunk hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <span
          className="t-num hidden shrink-0 rounded-[var(--r-sm)] border border-line px-2 py-1 text-[11px] text-ink-3 lg:block"
          title="稼働中の選定エンジン版数"
        >
          {TANPUKU_SCORING_VERSION}
        </span>
      </div>
    </header>
  );
}
