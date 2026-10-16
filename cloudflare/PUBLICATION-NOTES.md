# Cloudflare移行差分の保存

このbranchは既存の並行Workerで検証した移行コードをレビュー用に保存する。Vercelからの本切替や本番自動運用の完成を示すものではない。

- 正本: `yasuhiroohnaka-ux/horse-race-sim`。branch: `prepare/cloudflare-2026-10-06`。基点main: `13428b5ccfe6403c307cf18aa8acb1d9058c5688`。
- Worker/Assetsとprivate R2の配布・保存・同期準備、重い回顧UI/APIの切り離し、軽い成績と個別予想読取り、脚質GETの軽量化、月曜開催を含むローカル日付処理を含む。
- 予想・結果確定のパイプライン、校正係数、元の履歴データを保持。生成済みビルド、node_modules、秘密情報、ローカル操作ログ、大きなrawデータは今回の差分に含めない。
- 2026-10-06の公開応答・CPU比較とデータ保全の選定証跡は [evidence/2026-10-06-verification.json](evidence/2026-10-06-verification.json)。元の最終patchのSHA-256も記録している。GitHub公開準備では資料の個人PCパスを匿名化し、この資料と選定証跡を加えた。実装コードは同patchと同じ。
- [STYLE-GET-RESULT.md](STYLE-GET-RESULT.md) が最新の並行Worker結果。[REVIEW-DETACH-RESULT.md](REVIEW-DETACH-RESULT.md) とそれ以前の資料は各時点の履歴であり、「未commit」「未push」等も記録時点を表す。

## GitHub / Vercelへの影響

VercelのHobbyチームで正本GitHub repoとの連携を読み取り確認し、他のfeature branchで自動Previewが作成された実績も確認した。今回もPreview buildが起動する可能性がある。取得できたAPI応答にPreview停止フラグはなく、CLIには既存認証がないため、現在の停止設定は断定していない。認証を追加せず、連携設定も変更していない。

既存の2つのActions workflowはschedule/workflow_dispatchだけで、push/pull_requestを起動条件に持たない。今回の保存で本番cronの変更や手動起動は行わない。weekly workflowの差分は明示フラグで無効のままにできるR2取込みステップ、dispatcher設定の差分は既存account_idの明記のみ。

## 残件

実UI操作、外部APIを含む全動的経路のCPU、長期・負荷時の動作は未検収。GitHubへのR2取込み用読取り認証、同Workerへの継続配布用認証、連携の有効化は未実施。実開催日に連動した本番スケジュールは未実装であり、月曜10時の週切替をそのまま有効化してはならない。

具体案は [GITHUB-AND-SCHEDULE-APPROVAL.md](GITHUB-AND-SCHEDULE-APPROVAL.md) を参照。mainへの反映、新規資格情報、課金変更、DNS変更、Vercel停止・削除は今回の保存承認に含まれない。
