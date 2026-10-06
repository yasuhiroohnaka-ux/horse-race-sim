# 回顧切り離し — 2026-10-06

追記: 脚質GETの小さな追加修正を同じWorkerへ反映済み。最新versionとCPU比較は [STYLE-GET-RESULT.md](STYLE-GET-RESULT.md) を参照。本書の16.116msとversion 020ce14cは、その追加修正前の記録として残す。

ユーザー承認に従い、詳しい回顧 UI と公開時の重い診断・全件取得を外した。従来の7日分詳細表示維持より、この方針が優先する。予想精度や利益の改善を保証する変更ではなく、校正係数は変更していない。

## 変更内容

- `/archive` は HTTP 307 で `/#performance` へ転送する。query 付き旧リンク、RSC リンクも対象。ホーム・共通ナビ・シミュレーターのリンクは「成績」に変更。
- `/api/archive`、`/api/performance`、`/api/weekly-diagnostics`、`/api/note-payload`、`/api/note-draft`、`/api/review-repair` は HTTP 410 と軽い集計先を返す。Worker が重いアプリ本体を読み込む前に応答する。ローカル Next の各 handler も同じ終了応答。
- `/api/performance/summary` は従来の panel 用集計に投稿文用の分類別集計を追加。従来の `/api/performance` から取っていた分類別数値と完全一致。Worker の既定集計は **1,556 B**。公開版の query 付き集計は 400 とし、重い全履歴集計へ戻らない。
- `/api/prediction-snapshots` の POST は検証・正規化・同じ保存先を維持。GET は `?raceId=...` 必須で1レースだけ返す。レース番号のほか、旧来の4つのコース名 ID も保持。全件 GET は 400。
- 556件の保存予想をレース単位の資産へ変換。保存差分は同じ private R2 から読み、従来の優先順位に従って反映する。全履歴の JSON 合成・動的な診断更新・gzip 再圧縮は公開リクエストで行わない。
- ビルド入力に使った review-records / prediction-snapshots の**生成済み配布コピー**をパッケージから除外。元 `data/`、R2、Git の履歴・評価データは削除しない。
- ライブの脚質・オッズ・馬場 API が読む配布用 weekly JSON は、使っている `currentWeek` の全フィールドだけにした。**11,417,753 B → 137,666 B**。原本の全履歴は維持する。校正と集計の静的生成は、削減前の全履歴入力で行う。

## 残した経路

`reviewPipeline` の snapshot/settle、レース結果取得、校正スクリプトと係数、当日の snapshot 推奨取得、脚質の手動補正、軽い成績・校正レポート、元履歴・評価原データを維持。`review` という名前の処理を一括停止していない。回顧文・診断のオフライン helper も原データとともに残る。

月曜・祝日対応の既存ローカル差分、未コミット作業、最新 main を基にした作業ブランチを保全。本番 Actions/dispatcher と GitHub 連携の有効化は行っていない。

## 検証

- 限定テスト **50件成功**。旧リンクと終了 API、個別予想の保存・読取り、旧形式 ID、同期・重複保護、払戻判定、当日推奨、乱数 seed、校正値、月曜開催を確認。
- TypeScript、変更ファイル ESLint、`git diff --check`、vinext ビルド、Wrangler dry-run 成功。依存インストールなし。
- 成績 panel の範囲・確定日時・全数値、投稿文の分類別数値は変更前と完全一致。
- 556件の個別予想資産は、従来の優先順位で選ばれたオフライン記録と完全一致。
- 14個の保護対象ファイルの SHA-256 が作業開始時と一致。対象には予想ロジック、校正係数、reviewPipeline、元の予想／回顧／結果データ、月曜カレンダー、workflow、dispatcher 設定を含む。
- ローカル Worker は22リクエストで旧リンク、RSC、終了応答、軽い集計・校正レポート、脚質読込み、予想保存→読戻し→復元を確認。ブラウザー操作の確認とは区別する。

検証証拠はタスク直下の `evidence/oct6-detach-data-regression.json`、`oct6-detach-local-worker.json`、`oct6-review-detach-preserved.json`、`oct6-detach-build.log`、`oct6-detach-dry-run.log`。

## 公開状況と残件

並行 URL: https://horse-race-sim.svo-app.workers.dev 。既存 Vercel は維持。配布先は既存 Worker `horse-race-sim` と private R2 `horse-race-sim-data`。新規資格情報・課金プラン・DNS・DB移行・commit/push は行っていない。

最初の切り離し版 `94792a0e-f306-4584-aed3-6f6ceec3724a` では公開22リクエストが期待どおりに応答し、private R2 の canonical 19,706 B 完全一致も確認。残存していた脚質 API の全履歴読込みは **92.827 ms** だったため、配布用 currentWeek への削減を追加した。最終版は `020ce14c-0de2-4a51-b7ed-be4012ed97c2`。公開検証と CPU の結果は下に追記する。

実ブラウザーは未検証。指定された `<USER_HOME>\.codex\skills\codex-in-app-browser\SKILL.md` の “Stop and report that `mcp__node_repl__js` is not in the tool list. Do not build workarounds.” に従い、代替ドライバーを起動していない。

成績・校正レポートと基礎データはビルド時点の内容。GitHub 側の保存取り込みと継続再配布は未有効。本番の月曜・代替日程の自動実行も残件。外部オッズ／天気 API の全条件の CPU と、継続利用時の無料枠適合は今回の限定検証だけでは保証しない。Vercel Storage 警告の帰属は未確認。

## 最終公開検証

- version **020ce14c-0de2-4a51-b7ed-be4012ed97c2**、deployment **27c59ced-f92e-4a95-9f91-f35e87278a68**、配布日時 **2026-10-06T16:25:40.829215Z**。
- 22リクエスト（19 GET、保存2 POST、終了した repair 1 POST）がすべて期待した HTTP status・本文になった。旧リンクは307、終了 API は410、不正な全件取得は400、必要な画面・集計・保存は200。
- 保存前・一時変更後・復元後の1レース取得を照合。private R2 からも直接読戻し、canonical **19,706 B** が完全一致。今回の公開試験は2版で各39,473 B、合計 **78,946 B** の同一オブジェクト書込み。既存の1 MiB試験枠内で、オブジェクトの新規追加や削除はしていない。
- Worker gzip **1,953.21 KiB**、assets **1,098 files**。初期の回顧維持版の3,852 filesから縮小。startup 6 ms は呼出しCPUとは別指標。
- CPU は既存試験の秒別公式 GraphQL 集計を使用。単位 microseconds を ms に変換し、版・試験時間窓と照合した。新たな負荷試験はしていない。

| 経路 | 観測 CPU (ms) |
| --- | ---: |
| home / sim / monitor | 0.697 / 0.273 / 0.316 |
| 旧 archive リンク（通常 / RSC） | 0.166 / 0.153 |
| 終了した回顧・診断 API | 0.157〜0.325 |
| 校正レポート | 0.316 |
| 個別予想 GET（保存前 / 変更後 / 復元後） | 1.323 / 1.846 / 1.035 |
| 予想 POST（一時保存） | 2.338 |
| 脚質 GET | **16.116** |

脚質 GET は旧11.4 MB配布データでの92.827 msから改善したが、依然として10 msを超える。今回の回顧切り離しとは別に、残るアプリ handler 初回読込みなどの切り分けが必要。未測定の外部 API や脚質 POST を含め、「全経路で無料枠内」とは報告しない。

CPU 証拠は `evidence/oct6-detach-cpu.json`、公開本文照合は `oct6-detach-live.json`、R2照合は `oct6-detach-r2-readback.log`。**16:32:59 UTC の再読取りでも22件中19件**が収載され、全件 status success・errors 0。summary2件と復元POSTのCPUは未収載で、理由は未特定（反映遅延・adaptive集計等の可能性）。これらを0 msとして補完せず、CPU判定を保留する。HTTP本文一致・保存復元の確認とは区別する。
