# Cloudflare 定時実行ディスパッチャー

WP-F1 の土日 09:00 / 15:00 JST と発走前シグナル収集を、Cloudflare Cron Triggers から既存の GitHub Actions に依頼する Worker。実際の収集、snapshot、投稿、コミットは `weekly-keiba-update.yml` が行う。GitHub の `schedule` はバックアップとして残す。

## 時刻

Cron は UTC。土日の各 00:00 / 06:00 UTC に `sat_09` / `sun_09` と `sat_15` / `sun_15` を送る。03:17、04:17、04:47、05:17、06:47、07:17 UTC には `capture_only` を送る。`wrangler.jsonc` の 3 個の Cron Trigger は合計 16 回/週末を発火させる。時刻と stage の対応は `src/index.mjs` で確定する。

## 導入

1. このディレクトリで `npm ci` を実行する。
2. `npx wrangler login` で、配置先の Cloudflare アカウントにログインする。
3. GitHub で `yasuhiroohnaka-ux/horse-race-sim` のみを対象にした fine-grained PAT を作り、Repository permissions の **Actions: Read and write** を与える。
4. トークンを Git 管理外の `.env.production` に `GITHUB_DISPATCH_TOKEN=...` として保存する。このファイルをチャットやログに貼らない。
5. `npx wrangler deploy --secrets-file .env.production` を実行する。Worker に HTTP の公開 URL は設けていない。
6. `npx wrangler secret list` で secret 名だけを確認する。ローカルの `.env.production` は展開後に安全な保管場所へ移すか削除する。

`GITHUB_DISPATCH_TOKEN` がない場合、該当時刻の Worker はエラーで終了する。GitHub API が 2xx 以外を返した場合もエラーとし、HTTP ステータスを Worker ログに残す。トークンそのものはログに出さない。

## 確認と受け入れ

- `npm test` と `npx tsc --noEmit --incremental false` で時刻対応と API 呼び出しを確認する。
- このディレクトリで `npx wrangler deploy --dry-run` を実行し、Worker のバンドルを確認する。
- Cloudflare の Cron 実行ログと GitHub Actions の `workflow_dispatch` 実行を照合する。GitHub 側の `schedule` と重なっても、既存の `keiba-data-writer` キューと投稿 state で処理する。
- 2 週末連続で 09 時・15 時・収集 stage の実行開始遅延が 10 分未満かを確認し、実測を `50_logs` に残す。Cloudflare の Cron Trigger も遅延し得るため、配置だけでは WP-F1 の受け入れ完了としない。

この Worker はウェブサイトや Vercel Blob の移行を行わない。Vercel プロジェクト削除の前に、サイトと保存データを別途移行・検証する必要がある。

参考: [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)、[Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[GitHub workflow dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)。
