# HANDOVER

更新日: 2026-03-14

## 1. プロダクトの現在地

- アプリ名は `KEIBA GAP LAB`。
- 目的は「能力と人気の乖離を見抜く」こと。
- 主な判断軸は次の4つ。
  - 試走勝率
  - フェアオッズ
  - 公式オッズ
  - 俺プロ由来のガチ勢オッズ
- 今週の対象レースは `G1-G3 / リステッド / オープン`。
- トップの一覧カードは、グレード絞り込みあり。
- カード文言は `レース名（競馬場 芝/ダート 距離） 出馬表` の形式に統一済み。

## 2. いま動いているもの

### 週次データ生成

- `scripts/refresh-weekly-races.mjs` が今週対象レースの出馬表、人気、近走、オッズ系の初期データを生成する。
- 生成結果は `data/weekly-races.json` に入り、最終的に `lib/generatedRaceSchedule.ts` に同期される。

### トップのレース一覧

- `components/WeeklyRaceBrowser.tsx` がトップのカード一覧を描画する。
- グレードチップは `すべて / G1 / G2 / G3 / L / OP`。
- カード表示名と短評は `lib/courses.ts` で `Course` に付与している。
- 短評の文言マップは `lib/raceCardContent.ts` に置いている。
  - 既知レースは個別コメント。
  - 未登録レースは汎用コメントにフォールバック。

### /sim のライブ更新

- `app/sim/page.tsx` で初回表示時にライブ更新をかける。
- 土日だけ10分ごとに再取得する。
- 取得先は次の2本。
  - `/api/netkeiba-odds`: 公式オッズ、俺プロ本命人数、騎手、近走情報
  - `/api/live-race-conditions`: 天気、馬場、風向、風速
- `/sim?course=...` でトップから渡したレースIDを初期選択できる。

### 条件データ

- 馬場は netkeiba の出馬表ページから取得。
- 風と天気は Open-Meteo を使って開催場の現在値を取得。
- 風向は開催場ごとの直線方位に対して `Headwind / Tailwind / Crosswind` に変換している。

### X 投稿

- `components/SimulationResults.tsx` に X 投稿ボタンがある。
  - 分析全体を投稿
  - 的中率おすすめ1頭 + 回収率おすすめ1頭を同時投稿
- 投稿文生成は `app/sim/page.tsx` 側で行う。
- composer を開く方式で、自動投稿ではない。

## 3. 直近の重要な変更

- `19a45be Add dedupe to initial horse list`
  - `/sim` の馬一覧で同一馬が二重に混ざる事故に備えて、初期化・ライブ更新・手編集の3箇所で重複除去を追加。
  - `Horse.id` と `馬名+馬番` の両方で重複検知する。
  - 重複発見時は console に warning を出す。
  - 2026-03-14 時点の repo データでは、全14コースを検査して重複は再現しなかった。
- `fdfeff1 Refine race card labels and notes`
  - トップのカード文言を `レース名（競馬場 芝/ダート 距離） 出馬表` に変更。
  - レースごとの短評を追加。
  - `/sim` のレース選択プルダウンも同じ表示名に統一。
- `a24490f Add race grade filters to course selection`
  - トップ一覧にグレード絞り込みUIを追加。
  - `/sim` のレース選択にも同じグレード絞り込みを追加。
  - `/sim?course=...` が効くように修正。
- `fb6d551 feat: expand weekly coverage to listed and open races`
  - 今週の対象を重賞だけでなく `L / OP` まで拡張。

## 4. 重複馬の調査メモ

- ユーザー報告: `/sim` で `ホワイトオーキッド` が二重表示された。
- repo 上の検査では再現せず。
  - `getDefaultHorses(courseId)`
  - `calculateOdds(getDefaultHorses(courseId))`
  - 対象: `ACTIVE_COURSES + ARCHIVED_COURSES` の全14コース
  - 結果: `id` 重複、`馬名+馬番` 重複ともに `0件`
- そのため、原因候補は次のどちらか。
  - ライブ更新時の一時的な混入
  - クライアント側状態の崩れ
- 恒久対策として `lib/horseIntegrity.ts` を追加し、描画前に重複を落とすガードを入れている。

## 5. 重要ファイル

- `app/page.tsx`
  - トップページ本体。今週レース一覧は `WeeklyRaceBrowser` を使用。
- `components/WeeklyRaceBrowser.tsx`
  - 今週の対象レース一覧とグレード絞り込みUI。
- `components/GradeFilterChips.tsx`
  - グレードチップの共通UI。
- `components/CourseConfig.tsx`
  - 条件設定UI。/sim 側のレース絞り込みもここにある。
- `components/HorseInput.tsx`
  - 馬データ入力。手編集時の重複検知と dedupe をここでかける。
- `components/SimulationResults.tsx`
  - 試走結果テーブル、推奨カード、X投稿ボタン。
- `app/sim/page.tsx`
  - /sim 画面本体、ライブ更新、X投稿文生成、`course` / `archive` クエリ解釈。
  - 初期馬データ生成とライブ更新後の dedupe を実施。
- `lib/defaultHorses.ts`
  - 初期馬データの組み立て。返却前に dedupe を実施。
- `lib/horseIntegrity.ts`
  - 重複検知と重複除去の共通ロジック。
- `lib/courses.ts`
  - `Course` の組み立て。表示名と短評もここで付与。
- `lib/courseGrades.ts`
  - グレード判定、絞り込み、件数集計。
- `lib/raceCardContent.ts`
  - レースカードの表示名と短評の生成。
- `app/api/netkeiba-odds/route.ts`
  - 公式オッズ、俺プロ人数、騎手、近走データの取得。
- `app/api/live-race-conditions/route.ts`
  - 天候、馬場、風向、風速の取得。
- `scripts/refresh-weekly-races.mjs`
  - 週次データ再生成の中心。
- `lib/raceAnalysis.ts`
  - 試走勝率、フェア、公式差、ガチ勢差の算出。
- `lib/simulation.ts`
  - Monte Carlo 試走本体。

## 6. 運用メモ

- `main` へ push すると Vercel が再デプロイする想定。
- 2026-03-14 時点の最新反映コミットは `19a45be`。
- 古い Vercel deployment URL を見続けると古い表示が残ることがある。必ず Current / Production を確認すること。
- PowerShell 上では一部の日本語が文字化けして見えることがある。ブラウザ表示と build 成功を優先して確認すること。

## 7. 確認コマンド

- `cmd /c npx tsc --noEmit --incremental false`
- `cmd /c npm run build`
- `node scripts/refresh-weekly-races.mjs`

## 8. 未解決・注意点

- `lib/raceCardContent.ts` の短評は手書きマップなので、対象レースが入れ替わった週は見直しが必要。
- 重複馬の現象は repo 上では未再現。再発時はブラウザ console の warning と network payload を合わせて確認したい。
- X 投稿は composer 起動のみ。完全自動投稿は別系統の workflow / webhook 管理。
- 公式オッズとガチ勢オッズの差が肝なので、土日の更新頻度をさらに上げる余地はある。
- `eslint` はローカル依存として入っていないので、`npx eslint ...` は環境によって外部取得に失敗することがある。

## 9. 次に触るなら候補

- 重複馬が再発したら、`/api/netkeiba-odds` のレスポンスを保存して原因箇所を切り分ける。
- 短評を data 側へ寄せるか、週次生成スクリプトから自動付与するか検討。
- 土日のライブ更新間隔を `10分 -> 5分` にするか検討。
- X投稿文に略称ではなくカード表示名を揃える。
- 自動投稿 workflow と画面の X 投稿文を共通化する。
