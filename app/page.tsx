// src/app/page.tsx
import Link from "next/link";

export default function Home() {
    return (
        <main style={{ padding: 24, fontFamily: "system-ui" }}>
            <h1>競馬シミュレーター</h1>
            <p>Xや掲示板の「みんなの予想」をオッズ化し、市場との差＝世論の偏りを発見。</p>
            <p>バイアスや戦績を加味して100回試走し、結果をそのままXに投稿できます。</p>

            <ul>
                <li>
                    <Link href="/sim">シミュレーターを開始する</Link>
                    <p style={{ fontSize: "0.85em", color: "#666", marginTop: 4 }}>
                        馬パラメータ入力・100回試走・X投稿まで完結します。
                    </p>
                </li>
            </ul>
        </main>
    );
}
