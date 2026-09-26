# Vercel から Cloudflare への移行

対象は `horse-race-sim` のウェブサイト、脚質補正の private Vercel Blob、土日の定時実行。リポジトリの `data/` は GitHub Actions が更新し、Cloudflare のサイトビルドが追随する。

## 実装済みの経路

- サイト: `npm run build:vinext` が公開リポジトリで追跡されている7個の表示用データファイルを一時的に静的資産へコピーし、ビルド後に作業コピーを削除する。Cloudflare 実行時は `lib/dataFile.worker.mjs` が資産を読み取る。
- 保存: `APP_DATA` R2 bucket の `data/running-style-overrides.json` が脚質補正の保存先。診断の保存と、スナップショットの個別追記も R2 を使う。
- 定時実行: `keiba-dispatcher` Worker が GitHub Actions の `workflow_dispatch` を呼ぶ。GitHub の schedule はバックアップとして残す。
- 従来の Next.js ビルドは移行期間中も利用できる。Vercel Blob の読み書きは Cloudflare へ切り替えるまで維持する。

## 配置の順序

1. `npx wrangler whoami` が対象アカウントを表示することを確認する。`horse-race-sim-data` R2 bucket を作成する: `npx wrangler r2 bucket create horse-race-sim-data`。
2. `npm ci && npm run build:vinext && npm run deploy:vinext` でサイトを配置する。`*.workers.dev` の4画面と主要 API を実際に確認する。
3. Cloudflare Workers Builds で GitHub の `main` をサイト Worker に接続する。Root directory はリポジトリ直下、Build command は `npm run build:vinext`、Deploy command は `npm run deploy:vinext`。`data/` の定期コミットでも再配置されることを確認する。
4. Vercel CLI にログインして接続済み Blob store とオブジェクトを一覧する。コードが使う private Blob は `horse-race-sim/running-style-overrides.json`。実在する場合は `vercel blob get ... --access private --output <backup>` でローカル退避し、R2 の `data/running-style-overrides.json` にアップロードする。R2 から再ダウンロードし、退避ファイルとの SHA-256 一致を確認する。追加の Blob があれば用途を調べ、個別に退避する。秘密の内容とトークンは Git に含めない。
5. `cloudflare/keiba-dispatcher/README.md` の手順で定時実行 Worker に GitHub Actions 書き込み権限の secret を設定して配置し、Cloudflare ログと Actions 実行を照合する。
6. サイトの表示、主要 API、脚質補正の読み書き、データ更新後の再配置、定時実行を確認してから利用 URL を切り替える。`*.vercel.app` の URL は Cloudflare に移せないため、新しい URL を利用者へ案内する。
7. Vercel の全 Blob の退避と Cloudflare の動作確認が終わった後、`@vercel/blob` と Vercel 専用コードを削除し、Vercel プロジェクト `horse-race-sim` を削除する。削除前に新サイト・R2・退避ファイルから復元できることを確認する。

## 確認する API

`/api/performance/summary`、`/api/calibration-report`、`/api/weekly-diagnostics`、`/api/prediction-snapshots`、`/api/horse-running-style?courseId=<current-course>`。`POST /api/review-repair` は Cloudflare では停止し、review の更新は既存の GitHub Actions パイプラインで行う。

参考: [Cloudflare の Next.js 移行](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)、[Workers Builds の設定](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[R2 CLI](https://developers.cloudflare.com/r2/get-started/cli/)、[Vercel Blob CLI](https://vercel.com/docs/cli/blob)。
