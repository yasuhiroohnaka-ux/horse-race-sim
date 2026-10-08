# 脚質GETの追加軽量化 — 2026-10-06

既存の並行Workerへ小さなGET専用の読取り経路を反映した。同条件の通常・Cookie付きGET各1件は変更前と応答が完全一致し、CPUはいずれも10ms未満だった。今回の公開試験は変更前2GET、変更後2GETの計4件で終了。追加のリモート保存は **0バイト**。

## 変更と対象

- 正本: `https://github.com/yasuhiroohnaka-ux/horse-race-sim.git`。元チェックアウト `<USER_HOME>\.gemini\antigravity\scratch\horse-race-sim` は変更していない。
- 作業先: `<USER_HOME>\Documents\Codex\2026-10-06\task-5\horse-race-sim`、branch `prepare/cloudflare-2026-10-06`、base `13428b5ccfe6403c307cf18aa8acb1d9058c5688`。今回の読取り時点でもremote mainは同じSHA。未commit、未push。
- `cloudflare/running-style-response.mjs` が脚質GET/HEADだけを処理し、汎用アプリ本体の動的importを避ける。POSTは既存アプリへ渡す。
- `lib/runningStyleData.mjs` に従来の正規化と応答組立てを移し、元APIとWorkerで共有する。保存済み補正 > Cookie > レース入力の優先順位を維持し、Cookieには既存Nextと同じパーサーを使用する。
- 同じ137,666バイトのcurrentWeek入力と同じ読取り順序を維持。比較対象ではコード上、weekly R2→weekly ASSETS→補正R2の3回の読取りになる。Cloudflare統計のsubrequestsは各リクエスト1であり、このコード上の回数とは別の指標。
- 脚質POST関数本体のSHA-256は変更前と一致。予想保存、原データ、校正係数、予想ロジックは変更していない。

## 比較結果

URL: https://horse-race-sim.svo-app.workers.dev

対象: `/api/horse-running-style?courseId=tokyo-turf-2400-202605040309`。Cookie付きでは同じ補正Cookieを前後に送信。全4件がHTTP 200、CPU統計もsuccess・errors 0、各行requests 1。

| 条件 | 変更前CPU | 変更後CPU | 応答 |
| --- | ---: | ---: | --- |
| 通常GET | 6.477ms | 4.534ms | 完全一致 |
| Cookie付きGET | 6.364ms | 2.998ms | 完全一致 |

変更前窓は16:41:38〜40 UTC、変更後窓は16:58:01〜04 UTC。統計最終読取りは17:04:04 UTC。変更前versionは `020ce14c-0de2-4a51-b7ed-be4012ed97c2`、変更後versionは **`fab9a365-23f3-436c-ba77-755b5944272f`**。deploymentは `ec4465f1-25cc-4178-b2d1-fce98aa2ddc4`、作成時刻は16:54:44.821737 UTC。

前段試験の16.116msは、その試験における最初の汎用アプリ経由の応答だった。初期化処理の寄与が疑われるが、集計CPUだけでは関数ごとの内訳やcold startを断定できない。今回の比較は入力と読取りを維持した同条件の各1件であり、全経路・全負荷で10ms未満になる保証ではない。新しいサービスや全体構成の変更は追加していない。

## 検証と証拠

- 今回の限定回帰11件、TypeScript、変更ファイルESLint、vinextビルド、差分チェックに成功。依存インストールなし。
- ローカルWorkerで通常応答、空のローカルR2に対するCookie補正、元POSTの入力検証、成績summaryを確認。
- 成績panel・投稿用分類集計・556件の予想資産が従来入力と一致。保護対象14ファイルのハッシュ、元履歴、校正が不変。
- 公開前後の比較スクリプト: `scripts/verify-cloudflare-style.mjs`。証拠はタスク直下 `evidence/` の `oct6-style-cpu-comparison.json`、`oct6-style-deployment.json`、`oct6-style-local.json`、`oct6-style-post-contract.json`、`oct6-style-build.log`、`oct6-detach-data-regression.json`。公開前後JSONは同ディレクトリのstyle比較証跡を参照。
- 今回はリモート書込みなし。前段の回顧切り離し2試行の書込み計78,946バイトは変更なし。保存試験累計1MiB上限を超える追加試験は行っていない。

## 残件と承認

実ブラウザー操作は未検証。指定skill `<USER_HOME>\.codex\skills\codex-in-app-browser\SKILL.md` は “Stop and report that `mcp__node_repl__js` is not in the tool list. Do not build workarounds.” と要求しており、該当toolがないため代替ブラウザーを使っていない。HTTP検証とUI確認は区別する。

外部API経由のCPUや高負荷は未検証。今回POSTのCPUを新たに測定していない。Vercelの容量警告の原因がこのプロジェクトかは未確定。既存Vercelは維持している。

次の具体的な承認対象は [GitHub反映・本番定期実行の確認資料](GITHUB-AND-SCHEDULE-APPROVAL.md)。準備済みコードのfeature branchへのcommit/pushとdraft PR、本番向け認証・同期・デプロイ連携、開催日連動スケジュールを分けて記載した。**本番スケジュールの新しい案は未実装・未反映**。新規資格情報、課金、DNS変更、Vercel停止、GitHub書込み、本番Actions/dispatcher変更は今回行っていない。

前段の移行・回顧切り離しの結果は [REVIEW-DETACH-RESULT.md](REVIEW-DETACH-RESULT.md) に保存している。
