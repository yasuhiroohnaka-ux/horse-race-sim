import type { Metadata } from "next";
import { Archivo, Chivo_Mono, Zen_Kaku_Gothic_New } from "next/font/google";
import "./globals.css";

// 見出し: 幅可変の Archivo。掲示板の看板文字として幅を広げて使う。
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

// 数値: オッズ・確率・回収率の桁を揃える等幅。
const chivoMono = Chivo_Mono({
  variable: "--font-chivo-mono",
  subsets: ["latin"],
  display: "swap",
});

// 和文: 幾何学的で計器向き。日本語は重いので preload しない。
const zenKaku = Zen_Kaku_Gothic_New({
  variable: "--font-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "単勝ラボ",
  description: "物理シミュレーションと市場オッズを突き合わせ、単勝で勝負できるレースだけを選び出します",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${archivo.variable} ${chivoMono.variable} ${zenKaku.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
