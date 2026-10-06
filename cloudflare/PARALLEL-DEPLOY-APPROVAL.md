# 最初の並行配置に必要な承認範囲

> Historical pre-deployment record. Superseded by [PARALLEL-DEPLOY-RESULT.md](PARALLEL-DEPLOY-RESULT.md). The parallel Worker and R2 are now deployed; full migration remains blocked by heavy API CPU use.

2026-10-06。まだ配置・アップロード・R2作成・pushは実施していない。

## 本人による設定の確認

`token.dpapi`（652 bytes、2026-10-06 12:37:08.4702488 UTC）と `scope.json`（683 bytes、12:37:08.7074495 UTC）の存在を確認した。scopeの非秘密情報は、対象account `e3ca9adb0cdca33a34e39a640db7d45f`、`Workers Scripts Write` / `Workers R2 Storage Write`、`Windows DPAPI CurrentUser` と一致。token本体は未読・未復号・未送信。scopeはユーザーが選択した実権限を検証するものではないため、有効性は承認後の通常認証で確認する。

## 一度目の承認対象

| 対象 | 操作・影響 |
|---|---|
| Cloudflare account | `e3ca9adb0cdca33a34e39a640db7d45f` のみ |
| Site Worker | `horse-race-sim` を新規作成し、4画面とAPIを公開する |
| 公開URL | `https://horse-race-sim.svo-app.workers.dev`。URLを知る人はアクセス可能。既存Vercelと並行した検証用公開 |
| ストレージ | 非公開 R2 **Standard** bucket `horse-race-sim-data` を新規作成、binding `APP_DATA`。public bucket/r2.dev/custom domainは設定しない |
| 配置コード | 最新確認済main `13428b5` + 既存移行差分 `90a1f18` + 対象account設定 + 下記deploy再ビルド防止修正。配置直前にmain更新を読取確認し、変更があれば内容を照合する |
| 公開初期データ | 既に公開Gitで管理されている7種、合計41,131,701 bytes（39.23 MiB）。レース一覧11,417,753、review記録19,758,711、予測JSONL9,419,189、診断207,660、生成review81,288、校正report16,966、backtest230,134 bytes。Workers Assetsの`/__data/`へアプリJS/CSS/SVG/favicon/fontsとともに送る。最大個別ファイル18.84 MiBで25 MiB以内 |
| 非公開初期データ | R2は空（0 B）で開始。Vercel private Blob、token、環境ファイルはアップロードしない。機能試験を承認する場合、脚質補正JSON・テスト予測・診断保存を少量（合計1 MiB以内を確認）だけ行い、再読取する。R2自体は非公開だが、保存データの一部はサイトの公開APIから読める現仕様 |
| 認証利用 | 本人ユーザー文脈で既存DPAPIをメモリ内復号し、短命なWrangler子プロセスの環境変数へ渡す。通常認証の送信先はCloudflare API。token値をコマンド引数・ログ・ソース・公開bundle・Worker secret・GitHubへ出さない。新規OAuth/権限拡張なし |
| 検証 | ローカルbuild、成果物と7資産確認、Wrangler dry-run後に配置。4画面/API、CPU/メモリ、保存とCookieなし再取得を少数回確認。診断GETには保存副作用があるため、保存検証の承認範囲として扱う |
| Git / 既存環境 | 手動配置にcommit/pushは不要。この段階では行わない。既存Vercel・DNS・svo-appを維持する |

## 費用と無料運用の限界

Workers Freeを維持し、R2は既に有効化されているStandard無料枠を利用する。新しい有料プラン契約・アップグレードは行わない。今回の空bucketと少数回の試験保存はR2無料枠（月10 GB-month、Class A 100万、Class B 1000万）に十分小さい見込み。39.23 MiBの初期公開データはWorkers Assetsであり、R2容量としては使わない。

Workers Freeは日10万リクエスト、CPU10 ms/invocation。静的配信は無料。重いJSON解析APIの実環境CPU/メモリは未計測なので、アプリが無料枠内で正常動作することは未保証。超過・エラーが出た場合は有料化せず、結果と最適化案を報告する。R2無料枠は請求上限ではなく、公開後の多数アクセスや保存で超えれば従量課金され得る。

## 後段へ分ける事項

- `horse-race-sim-dispatcher` 作成、Cron、GitHub Actions Write PATは今回不要。
- Workers BuildsのGitHub App連携、GitHubへのcommit/pushも今回不要。既存GitHub ActionsはVercel向けにそのまま継続する。
- 今回のCloudflare表示データは配置時点の固定コピー。GitHub更新を自動反映する接続は後段。以後は手動再配置または承認済の連携が必要。
- Cloudflareで新たに保存した予測をActionsで評価するには、後段でbucket限定R2 Object Read only S3資格情報を設定する。今回の配置tokenをGitHubへ渡さない。
- Vercelのprivate Blob脚質補正はまだ継承しない。旧サイトは保持し、本切替前に実在・退避・コピー・hash一致を確認する。
- 本番URL切替、Vercel停止/削除、dispatcherと2週末の検収は別段階。

## 配置コマンドの修正

既存 `deploy:vinext` は `vinext-cloudflare deploy` の既定動作で再ビルドする。`build:vinext` はビルド後に一時的な `public/__data` を片付けるため、その後の再ビルドでは7資産が失われる。実インストール済みadapterの実装を確認し、`deploy:vinext` に `--skip-build` を追加した。

承認後の順序は `npm run build:vinext` → 生成した`dist/client/__data`の7資産・対象account・bindingを検証 → Wrangler dry-run → `npm run deploy:vinext`。CLIの`--dry-run`はbuild/uploadをしない設定点検だけであり、実bundle検証や本番成功とは区別する。

## 親からユーザーへ提示する承認文案

「設定を確認できました。保存済みトークンをCloudflareへの通常認証に使い、無料プランのまま競馬サイトと専用の非公開R2を作り、`horse-race-sim.svo-app.workers.dev` に並行公開して動作・少量の保存を確認してよいですか。既存Vercelは維持し、追加のGitHub権限・push・DNS変更は行いません。R2は無料枠内に収まる小規模試験ですが、将来の超過課金を止める上限ではありません。Cloudflare側の自動データ更新と旧保存データの移行は、その確認後に進めます。」

根拠: [Workers料金](https://developers.cloudflare.com/workers/platform/pricing/)、[R2料金](https://developers.cloudflare.com/r2/pricing/)、[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)。
