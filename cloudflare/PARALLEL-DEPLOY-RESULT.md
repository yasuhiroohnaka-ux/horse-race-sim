# Cloudflare移行：今回の実装と検証

> 後続のユーザー承認で回顧 UI・重い公開診断を切り離した。現行仕様・公開版・検証は [REVIEW-DETACH-RESULT.md](REVIEW-DETACH-RESULT.md) を参照。以下の7日詳細表示と全件 API 維持は過去の検証記録。

更新日: 2026-10-06 UTC。並行検証URLは https://horse-race-sim.svo-app.workers.dev 。Vercel本番を維持しており、本切替の完了報告ではない。

## 正本と作業場所

- 正本remote: https://github.com/yasuhiroohnaka-ux/horse-race-sim.git
- AI-Knowledge/Codexに登録された元checkout: `<USER_HOME>/.gemini/antigravity/scratch/horse-race-sim`。ユーザーの未コミット作業は変更していない。
- 前回移行checkout: `<USER_HOME>/Documents/Codex/2026-10-02/task-4/horse-race-sim`。変更していない。
- 今回: `<USER_HOME>/Documents/Codex/2026-10-06/task-5/horse-race-sim`、branch `prepare/cloudflare-2026-10-06`、base `13428b5ccfe6403c307cf18aa8acb1d9058c5688`。
- 既存依存のjunction/shared cloneを使い、追加インストールなし。持ち出しは親フォルダの差分patchを使う。commit/pushは未実施。

## 構成と無料枠

画面と履歴だけなら静的配信できるが、予想・脚質保存、外部オッズ/天気、保存内容を反映したAPIにはサーバー処理が必要。Monte Carlo本体はブラウザー実行。最小構成はWorkers Free + Workers Assets + private R2 `horse-race-sim-data`。SQL DB、利用者ログインDB、専用画像サービスの移行は不要。

Workers FreeはCPU 10 ms/呼出し、100,000 requests/日。静的Assetsのリクエストは無料。R2 Standardの無料範囲は10 GB-month、Class A 100万回/月、Class B 1000万回/月であり、無制限無料という意味ではない。今回は新規課金プランを追加していない。

Vercel Function Storage 10 GBの警告がこのプロジェクト由来かは未確認。Cloudflare並行公開だけではVercel使用量は減らない。

## 実装した変更

- 4画面の通常HTML/RSCと既存の固定レポートをビルド時生成。保存が関係するAPIは別の軽量Worker処理へ振り分ける。
- `/api/archive`を追加。全565件の索引を保持し、**最新の確定レース日を終端とする7日間**の詳細だけを初期取得。現在は9/28–10/4、16詳細。未確定の10/11を基準にしない。旧日付を選ぶと`?raceId`で1レース詳細だけを取得する。
- Archive画面は巨大な全履歴モジュール・予想全件・performance全件の初回同時取得をやめ、新APIを利用する。全期間の検索・絞り込み・集計は維持。
- `/api/performance`のall/saved_only/live_pre_race_only全JSON契約と全期間集計を維持。固定履歴と診断の基礎カウンターをビルド時生成し、保存差分のあるレースだけを更新する。代表レースの選定、同点順序、source優先順位も既存計算と照合。
- R2保存に優先順位・source集計・ハッシュのmetadataを付け、内容が同じ保存から全診断を再計算しない。metadataのない既存オブジェクトは読取時のみ補完し、勝手に書き換えない。
- snapshot POSTは元の検証・正規化・ID形式・R2保存契約を保った軽量処理へ移した。
- 大きなJSONは生成時に分割し、固定部分を事前gzip圧縮。HTTP gzipを受け入れるクライアントにはgzip memberをつなぎ、全履歴を毎回再圧縮しない。変更した予想の箇所だけ小さなpartを処理する。非圧縮経路も保持。

Archive HTMLは1,427,714 Bから461,032 Bへ。初期APIは2,362,827 B（565索引＋16詳細）、従来の予想8,630,623 B＋performance15,765,538 Bを初回に読まない。全履歴そのものは削除していない。

## 月曜・祝日・代替開催

月次開催カレンダーの実日付から取得対象を決め、従来の土日のみの探索と土日への日付補正を除去。翌月曜/火曜までの探索、カレンダー障害時の全候補日探索、同じrace IDが延期先日付にもある場合の後の日付優先、曜日・結果取得・review日付の全曜日対応を追加した。

JRA公式の10/10・11・12三日間開催を回帰テスト化。実際の公開カレンダーの読取でも10/12が選択対象に含まれることを確認済み。ただし出走表の公開前に10/12の全データが取得済みという意味ではない。JRA案内では月曜分の非重賞馬番つき出馬表は日曜10時以降に公開される。

**本番の月曜自動取得は未完成。** Actions/dispatcherは現在の本番設定を維持した。日曜10時以降の再取得、月曜レース前の予想/オッズ取得、最終開催後の結果・review、週次繰越を実開催日に追従させる変更が別途必要。月曜午前の既存review/繰越をそのまま動かすと月曜開催前に週が切り替わる問題が残る。送信を伴う実運用pipelineは実行していない。

## 検証

- vinext全体build、生成Workerのdry-run成功。その後の配信処理改良はdata/runtimeのみ再生成。
- 18件の対象テスト成功。加えてrace identity/weekly merge関連20件成功（calendar3件は重複）。TypeScript、対象ESLint、git diff --check成功。ESLintの既存unused警告3件のみ。
- 変更前に確保した診断goldenを3scopeで照合。performance全項目、予想API全項目、保存後の診断差分を照合。
- gzip/非圧縮の全3scope、保存差分、予想追加、archive更新の展開後JSON一致を確認。
- 生成したローカルWorkerで12 GET、POST保存→詳細GETを検証。
- `37e1cbe9`では公開14 GETが200、保存→最新読込→canonical復元が成功。private R2の直接読取も19,706 B完全一致。
- `21bd49f3`の非圧縮native配信試験ではsaved_onlyの途中切れが見つかったため、完成扱いにしなかった。後続のgzip版で再検証する。
- 最終公開版・CPU・復元確認は末尾の「最終公開検証」に追記する。

ブラウザーの実画面検証は再接続後のツール欠落で未完了。`<USER_HOME>/.codex/skills/codex-in-app-browser/SKILL.md`は「If the tool is missing: Stop and report that `mcp__node_repl__js` is not in the tool list. Do not build workarounds.」と明記している。この制約に従い、別ドライバーを立てずAPI/Worker検証を継続した。

## 計測の解釈と残る承認

Cloudflare GraphQLの公式スキーマ定義でcpuTimeP50/P90/P99は**microseconds**と確認済み。raw値を1000で割るとms。Wranglerのstartup時間、HTTPの転送経過時間とは異なる。versionごとのデプロイ時刻以降だけを計測し、途中の旧versionを合算しない。短い窓のadaptive集計は実試験件数より少ない場合があり、HTTP成功だけで10 ms以内や無料安定を主張しない。

クエリ付きSSR、未対応RSCモード、weekly-diagnostics、脚質/外部取得等の元handler経路には重い処理が残る。今回の成功経路を全機能の無料安定へ一般化しない。

残る承認・作業は、差分のcommit/push、Cloudflareへの継続再配布とGitHub保存予想取込の連携、必要なread-only認証の登録、月曜/代替日程に合わせた本番Actions/dispatcher、Vercel private Blobの既存内容の移行範囲、実画面確認、全動的経路のCPU対策。本切替/DNS変更/Vercel停止・削除はこれらの確認後に別途判断する。今回、DB移行・既存Blobコピー・本番運用設定・DNS・Vercelは変更していない。

現在Cloudflareの履歴は配布時点のコピー。R2の試験保存をGitHubに自動で戻す連携はまだ有効化していない。固定レポートはビルドで更新するため、今後review-recordsをR2で直接変更する設計へ移る場合は更新・無効化処理も必要。

主な証跡は親の`evidence/`配下: `oct6-data-regression.json`, `oct6-live-archive.json`, `oct6-new-deployment-metrics.json`, `oct6-cpu-metric-definitions.json`, `oct6-live-race-calendar.json`, `oct6-native-targeted-tests.log`, `oct6-native-types.log`, `oct6-native-lint.log`。

公式資料: [Workers料金](https://developers.cloudflare.com/workers/platform/pricing/)、[Workers制限](https://developers.cloudflare.com/workers/platform/limits/)、[R2料金](https://developers.cloudflare.com/r2/pricing/)、[JRA三日間開催](https://www.jra.go.jp/news/202610/100402.html)。

## 最終公開検証（2026-10-06 15:34 UTC）

- 現version: `3ff347c0-5687-4d46-b9e7-87c5729fc240`、deployment `c12401c4-6e9f-4115-a471-b957e9f5a6eb`、公開時刻 `15:30:46.207484Z`。
- 3852 assets、圧縮Worker 2141.21 KiB。startup 35 msは起動指標であり、以下の呼出しCPUと別。
- 公開14 GETすべてHTTP 200・完全な本文。all/saved_only/live_pre_race_onlyの全JSON一致、archiveの全565索引＋16初期詳細、旧1レース、保存差分の取得を確認。2 POST（一時タグ付与→canonical復元）も200。14.23秒を要した予想全件の転送があり、全経路の応答時間改善を保証しない。
- 復元後にprivate R2から直接読戻し、canonical snapshot `7ccd1827-d1a3-45e0-8d0d-e018dd9e02ca` の19,706 B完全一致。過去試験の脚質179 Bも含む既存2オブジェクトを維持し、今回の追加保存は同一snapshotへの約40 KB。初期の1 MiB試験書込枠内。
- CPU計測窓は **15:30:46.207484Z–15:33:34.214Z**。このversionのみ。GraphQL raw P50=2649 / P90=41403 / P99=54622 microseconds、すなわち **2.649 / 41.403 / 54.622 ms**。集計14呼出し、status success、errors 0。`exceededCpu`行は観測されなかったが、10 ms超は残る。
- baseline GET窓（15:32:36.089–15:32:48.431Z）は予定9/集計9、P50 2.502 / P90・P99 41.403 ms。保存差分GET窓（15:32:51.582–15:33:08.830Z）は予定4/集計3、P50 36.939 / P90・P99 54.622 ms。全試験は14 GET＋2 POSTで、GraphQL計測件数とは一致していない。反映遅延・adaptive集計・短い境界の影響を切り分けておらず、未計測分も成功CPUだったとは推定しない。
- 最新TypeScript/Lintはexit 0。先の18対象テスト、元診断golden3scope、gzip/非gzip等価検証、生成Worker検証が成功。最終変更は配信処理と検証・資料であり、追加の全体vinext再buildは行っていない。

**今回の結論:** 初期7日表示・旧詳細・全期間集計・保存後の再読込はコードと限定公開試験で確認できた。月曜本番自動取得、ブラウザー実画面検証、残る動的経路/保存差分の10 ms対策、GitHub継続連携は未達。短時間・少数試験で長期/高負荷の安定動作は保証しない。無料安定・本移行完了とはせず、Vercelを維持する。
