// src/app/page.tsx
import Link from "next/link";

export default function Home() {
    return (
        <main style={{ padding: 24, fontFamily: "system-ui" }}>
            <h1>競馬シミュレーター</h1>
            <p>デプロイ完了しました。</p>

            <ul>
                <li>
                    <Link href="/sim">シミュレーターを開始する</Link>
                </li>
            </ul>
        </main>
    );
}
