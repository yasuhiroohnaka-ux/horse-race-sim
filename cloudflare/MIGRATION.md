# Vercel から Cloudflare への移行

> Current approved scope and deployment: [REVIEW-DETACH-RESULT.md](REVIEW-DETACH-RESULT.md). Detailed public reviews and full-history APIs have been retired; raw evaluation data and prediction/settlement pipelines remain. Do not cut over Vercel until the remaining dynamic routes and continuous data updates are verified.

対象は `horse-race-sim` のウェブサイト、脚質補正の private Vercel Blob、土日の定時実行。リポジトリの `data/` は GitHub Actions が更新し、Cloudflare のサイトビルドが追随する。

## 実装済みの経路

- サイト: `npm run build:vinext` が公開リポジトリで追跡されている7個の表示用データファイルを一時的に静的資産へコピーし、ビルド後に作業コピーを削除する。Cloudflare 実行時は `lib/dataFile.worker.mjs` が資産を読み取る。
- 保存: `APP_DATA` R2 bucket の `data/running-style-overrides.json` が脚質補正の保存先。診断の保存と、スナップショットの個別追記も R2 を使う。
- 手動保存の評価: `npm run sync:cloudflare-snapshots` が R2 の `snapshots/<UUID>.json` を `data/prediction-snapshots.jsonl` に取り込む。週次 workflow では予測保存・review 処理の前に実行する。既存 ID の同一データは再追記せず、内容不一致・不正データ・取得失敗では停止する。取り込み完了までローカルファイルを書き換えず、R2 オブジェクトを削除しない。
- 定時実行: `keiba-dispatcher` Worker が GitHub Actions の `workflow_dispatch` を呼ぶ。GitHub の schedule はバックアップとして残す。
- 従来の Next.js ビルドは移行期間中も利用できる。Vercel Blob の読み書きは Cloudflare へ切り替えるまで維持する。

`deploy:vinext` は Wrangler で、直前の `build:vinext` が作った Vite 成果物を直接配置する。`vinext-cloudflare deploy` の既定の再ビルドでは、一時配置した公開データ7種が既に片付けられているため資産に含まれなくなる。また adapter beta.10 の ISR 検出は `revalidate = 0` まで検出して永続キャッシュを要求するが、本アプリの該当3 API はすべて `force-dynamic` で ISR を使わない。KVを追加せず、Vite pluginの生成済みconfigをWranglerへ渡す。配置前には必ず `build:vinext` を完了し、`dist/client/__data/` の7ファイルと生成された Wrangler 設定の対象を確認する。

## 配置の順序

1. `npx wrangler whoami` が対象アカウントを表示することを確認する。アカウント、Workers/R2 契約と費用、実際の `workers.dev` サブドメイン、既存リソースを確定してから配置する。Site Worker 名は `horse-race-sim`、dispatcher は `horse-race-sim-dispatcher`。R2 bucket が存在しなければ、承認されたアカウントで `npx wrangler r2 bucket create horse-race-sim-data` を実行する。
2. `npm ci && npm run build:vinext && npm run deploy:vinext` でサイトを配置する。`*.workers.dev` の4画面と主要 API を実際に確認する。
3. Cloudflare Workers Builds で GitHub の `main` をサイト Worker に接続する。Root directory はリポジトリ直下、Build command は `npm run build:vinext`、Deploy command は `npm run deploy:vinext`。`data/` の定期コミットでも再配置されることを確認する。
4. Vercel CLI にログインして接続済み Blob store とオブジェクトを一覧する。コードが使う private Blob は `horse-race-sim/running-style-overrides.json`。実在する場合は `vercel blob get ... --access private --output <backup>` でローカル退避し、R2 の `data/running-style-overrides.json` にアップロードする。R2 から再ダウンロードし、退避ファイルとの SHA-256 一致を確認する。追加の Blob があれば用途を調べ、個別に退避する。秘密の内容とトークンは Git に含めない。
   手動保存の取り込み用には、`horse-race-sim-data` に限定した R2 **Object Read only** の S3 資格情報を使う。権限の作成と GitHub への秘密情報の登録は事前に確認する。以下を設定し、手動保存 → workflow 取り込み → 後日の review 評価を確認してから URL を切り替える。
   - GitHub Actions variables: `CLOUDFLARE_R2_ENDPOINT`（`https://<account-id>.r2.cloudflarestorage.com`、jurisdiction がある場合は対応する endpoint）、`CLOUDFLARE_R2_BUCKET=horse-race-sim-data`、`CLOUDFLARE_SNAPSHOT_SYNC_ENABLED=true`。
   - GitHub Actions secrets: `CLOUDFLARE_R2_ACCESS_KEY_ID`、`CLOUDFLARE_R2_SECRET_ACCESS_KEY`。Web Worker には不要。
   - 同期フラグは資格情報の登録・読み取り確認後に有効にする。有効時に資格情報がない、または R2 が取得できない場合は workflow を失敗させる。移行前の Vercel 運用ではフラグを未設定のままにする。
5. `cloudflare/keiba-dispatcher/README.md` の手順で定時実行 Worker に GitHub Actions 書き込み権限の secret を設定して配置し、Cloudflare ログと Actions 実行を照合する。
6. サイトの表示、主要 API、脚質補正の読み書き、データ更新後の再配置、定時実行を確認してから利用 URL を切り替える。`*.vercel.app` の URL は Cloudflare に移せないため、新しい URL を利用者へ案内する。
7. Vercel プロジェクト、Blob、従来の Next.js 経路を保持する。Cloudflare の検証後も削除は別途明示的な承認を得て行う。復旧時には、Git 内の予測保存データと R2 の未取り込みデータを保全し、URL を旧サイトへ戻す。

## 確認する API

`/api/performance/summary`、`/api/calibration-report`、`/api/weekly-diagnostics`、`/api/prediction-snapshots`、`/api/horse-running-style?courseId=<current-course>`。`POST /api/review-repair` は Cloudflare では停止し、review の更新は既存の GitHub Actions パイプラインで行う。

Cloudflare では手動 review 修復 API が `503` を返す点は従来の Vercel と異なる。移行後は定期 Actions または承認された手動 workflow 実行を使う。手動予測保存は引き続き使えるが、Actions への取り込みと review 完了は非同期になる。

## 無料枠と配置前の確認

Workers Free は 1 日 100,000 requests、リクエストあたり CPU 10 ms。静的資産配信は無料で、個別資産は 25 MiB 以下に収める。4画面と主要 API について、実環境で CPU とメモリ、保存・再読み取りを測って無料枠内で動くことを確認する。Workers Paid の最小料金は月額 $5 で、切り替えには別途確認が必要。

R2 Standard には月 10 GB、Class A 1,000,000 操作、Class B 10,000,000 操作の無料枠があるが、契約が必要で超過分は課金される。無料枠は請求額の上限ではない。取り込みは R2 を読み取り専用で使い、各 routine 実行時に既存のスナップショットも照合するため、保存件数の増加に応じて操作数を確認する。

参考: [Cloudflare の Next.js 移行](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)、[Workers Builds の設定](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[R2 CLI](https://developers.cloudflare.com/r2/get-started/cli/)、[R2 の認証と権限](https://developers.cloudflare.com/r2/api/tokens/)、[Workers 料金](https://developers.cloudflare.com/workers/platform/pricing/)、[R2 料金](https://developers.cloudflare.com/r2/pricing/)、[Vercel Blob CLI](https://vercel.com/docs/cli/blob)。
