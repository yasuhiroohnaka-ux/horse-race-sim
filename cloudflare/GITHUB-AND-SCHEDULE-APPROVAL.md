# GitHub反映・自動運用で次に確認する内容

この文書は本番設定を変更しない。今回承認済みの並行 Worker 更新と、未承認の GitHub 書込み・持続認証・定時運用を分ける。

## 1. GitHubに保存する準備済み差分

- 正本: `https://github.com/yasuhiroohnaka-ux/horse-race-sim.git`
- 作業 branch: `prepare/cloudflare-2026-10-06`、base: `13428b5ccfe6403c307cf18aa8acb1d9058c5688`。
- 2026-10-06 の今回の読取りでも remote main は同じ SHA。作業 checkout の `origin` は未設定。remote は追加・変更していない。
- 完成したコード差分: Cloudflare の配布・R2予想保存/取込み準備、月曜を含む日付処理、回顧 UI/重い API の切り離し、個別予想読込み、軽い成績、脚質 GET の読取り経路。元の履歴・校正係数を変更しない。
- 次の承認対象: 差分を commit し、正本 repo の新規 feature branch へ push、draft PR を作成すること。**mainへの直接push・merge・本番スケジュール変更は含めない**。pushに連動する既存Vercel/GitHubビルド設定は反映前に読み取り確認する。

現在の workflow 差分は、下記9行の取込みステップだけ。既存 cron と stage は変更していない。フラグを有効化しなければ取込みは実行されない。

```yaml
- name: Import Cloudflare saved snapshots
  if: vars.CLOUDFLARE_SNAPSHOT_SYNC_ENABLED == 'true'
  env:
    CLOUDFLARE_R2_ENDPOINT: ${{ vars.CLOUDFLARE_R2_ENDPOINT }}
    CLOUDFLARE_R2_BUCKET: ${{ vars.CLOUDFLARE_R2_BUCKET }}
    CLOUDFLARE_R2_ACCESS_KEY_ID: ${{ secrets.CLOUDFLARE_R2_ACCESS_KEY_ID }}
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: ${{ secrets.CLOUDFLARE_R2_SECRET_ACCESS_KEY }}
  run: npm run sync:cloudflare-snapshots
```

dispatcher の準備済み設定差分は既存 account_id の明記だけ。cron・実行コードは変更していない。

## 2. 保存取り込みとサイト更新の有効化

取込みの設定先はこの repo の Actions variables/secrets。対象 bucket は `horse-race-sim-data`。必要なのは同 bucket の **Object Read only** の認証で、Worker の予想保存権限を GitHub に渡す必要はない。

- variables: `CLOUDFLARE_R2_ENDPOINT`、`CLOUDFLARE_R2_BUCKET=horse-race-sim-data`、`CLOUDFLARE_SNAPSHOT_SYNC_ENABLED=true`。
- secrets: `CLOUDFLARE_R2_ACCESS_KEY_ID`、`CLOUDFLARE_R2_SECRET_ACCESS_KEY`。
- 承認対象: 認証の新規作成または既存認証の再利用、GitHubへの登録、フラグ有効化。今回はいずれも実施していない。
- 受入条件: 同じ手動保存の取込みが冪等、失敗時にローカル履歴を部分更新しない、後日の結果確定・校正評価へつながる。既存テストは通っているが、本番連携自体は未接続。

サイトの成績/校正/現在週データはビルド更新で反映する。自動再配布には別の明示的な有効化が必要。提案する具体的な workflow 変更は、データを commit/push できた後に限り `npm run build:vinext` → `npm run deploy:vinext` を実行するステップを追加すること。`CLOUDFLARE_SITE_DEPLOY_ENABLED` のフラグと、データ保存ステップの `changed=true` 出力でガードする。GitHub の bot push による別 workflow 起動には依存しない。

この自動配布ステップは**まだ実装・有効化していない**。対象は同じ Worker と R2 に限定し、GitHubに保存するデプロイ認証の権限・管理方法を先に決める。現在のPCのDPAPIトークンを無断でGitHubへコピーしない。有料プラン追加は提案しない。GitHub/Cloudflareの既存利用枠と自動ビルド回数は有効化前に確認する。

## 3. 本番スケジュールに必要な具体的な変更

単純に月曜cronを追加すると危険な理由は、現行 `scripts/keiba-routine.mjs` の `mon_09` が日曜の回顧 (`:1026`)、`mon_10` が週切替 (`:502`)、`sun_18` が日曜だけの結果確定 (`:838`) だから。10/12の月曜開催前に週を切り替える処理を避ける必要がある。

次の差分案は**実装前の仕様**であり、そのまま本番へ適用できるパッチではない。コード差分・日付境界テストを揃えてから、本番適用の承認を求める。

| 対象 | 現行 | 変更する内容 |
| --- | --- | --- |
| workflow の朝・午後 | 土日09:00/15:00 JST、固定 stage | `raceDate` がJST当日の実開催日に限り、09:00の予想保存と15:00の更新を行う。曜日から開催有無を推測しない。 |
| signal捕捉 | 土日の12:17、13:17/47、14:17、15:47、16:17 JST | 時刻は維持し、日付で開催日を絞る。対象外日は依存インストール/外部取得より前に終了。 |
| 結果確定 | 日曜18:00と月曜の再確認 | 開催日の18:00以降、各レースの完了待機時間を過ぎた結果を確定。欠損払戻は翌日も再試行。 |
| 週切替 | 月曜10:00 JST、Sat/Sunだけ補完 | 現在の開催期間の最終レースと待機時間が終わるまで切替禁止。月曜開催なら火曜以降、火曜代替なら水曜以降に繰越。結果補完も実際の開催曜日・日付を列挙。 |
| routine 関数 | Sat/Sun固定フィルター・投稿表記 | `handleDailyVerdict` / `handleRecommendation` / `handleSundaySettle` / `handleMonday10` の対象選択を実日付へ変更。既存の保存前後判定・公式払戻・投稿重複防止を維持。 |
| dispatcher | Sat/Sun のみを `stageForScheduledTime` が返す | 変更する場合は GitHub側と同じ汎用 stage を渡し、GitHubの実開催日判定で処理を限定。既存 queue と重複防止を維持。 |

具体的な起動時刻案（UTC）は下記。これを採用する場合も、**日付ガードと新しい stage 実装が先**。現行の平日調教/枠順作業は別に残す。

```text
0 0 * * *          -> 当日09:00 JST の開催判定・朝処理
0 6 * * *          -> 当日15:00 JST の開催判定・更新
17 3,4,5,7 * * *   -> 開催日の捕捉4回
47 4,6 * * *       -> 開催日の捕捉2回
0 9 * * *          -> 当日18:00 JST の結果確定判定
0 1 * * *          -> 当日10:00 JST の切替可否判定
```

必要な受入テスト: 通常土日、2026-10-10/11/12の3日間、火曜代替、最終レース前の切替拒否、翌日の確定再試行、重複起動時の投稿/保存重複防止、月境界、カレンダー欠損時の安全停止。今回のローカル日付修正は保持したが、この本番 orchestration までは実装していない。

承認には「Actionsの起動日変更」「既存の予想投稿を含む開催日の自動実行」「必要ならdispatcherのcron変更とGitHub dispatch認証」を含める。秘密情報作成・登録は別に対象と権限を明示する。DNS変更、Vercel停止/削除、課金プラン追加は今回の候補に含めない。
