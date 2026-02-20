// src/app/page.tsx
import Link from "next/link";

export default function Home() {
    return (
        <main style={{ padding: 24, fontFamily: "system-ui" }}>
            <h1>Horse Race Simulation</h1>
            <p>Deployed successfully.</p>

            <ul>
                <li>
                    <Link href="/sim">Go to simulator</Link>
                </li>
            </ul>
        </main>
    );
}
