# HANDOVER

更新日: 2026-03-09

## 1. プロダクトの現在地

- アプリ名は `KEIBA GAP LAB`。
- 目的は「能力と人気の乖離を見抜く」こと。
- いまの軸は次の4つ。
  - 試走勝率
  - フェアオッズ
  - 公式オッズ
  - 俺プロ由来のガチ勢オッズ
- 対象レースは「今週の G1-G3 / リステッド / オープン」。
- トップのレース一覧にはグレード絞り込みがあり、カード文言は
  `レース名（競馬場 芝/ダート 距離） 出馬表`
  の形式にしている。

## 2. いま本番で動いているもの

### レースデータ生成

- `scripts/refresh-weekly-races.mjs` が今週対象レースの出馬表、俺プロ本命人数、近走情報、公式オッズ系の初期データを生成する。
- 生成結果は `data/weekly-races.json` に入り、最終的に `lib/generatedRaceSchedule.ts` に同期される。

### トップのレース一覧

- `components/WeeklyRaceBrowser.tsx` がトップのカード一覧を描画する。
- グレードチップは `G1 / G2 / G3 / L / OP / すべて`。
- カードの表示名と短評は `lib/courses.ts` で `Course` に埋めている。
- 短評の文言マップは `lib/raceCardContent.ts`。
  - 既知レースは個別コメント。
  - 未登録レースは汎用コメントへフォールバック。

### /sim のライブ更新

- `app/sim/page.tsx` で初回表示時にライブ更新をかける。
- 土日だけは10分ごとに再取得する。
- 取得先は2本。
  - `/api/netkeiba-odds`: 公式オッズ、俺プロ本命人数、騎手、近走情報
  - `/api/live-race-conditions`: 天気、馬場、風向、風速
- `/sim?course=...` でトップから渡したレースIDを初期選択できる。

### 条件データ

- 馬場は netkeiba の出馬表ページから取得。
- 風と天気は Open-Meteo を使って開催場の現在値を取得。
- 風向は開催場ごとの直線方位に対して `Headwind / Tailwind / Crosswind` に変換している。

### X 投稿

- `components/SimulationResults.tsx` に X 投稿ボタンが2つある。
  - 分析全体を投稿
  - 的中率おすすめ1頭 + 回収率おすすめ1頭を同時投稿
- 投稿文生成は `app/sim/page.tsx` 側で行う。
- これは X の composer を開く方式で、自動投稿ではない。

## 3. 直近で入った重要な変更

- `fdfeff1 Refine race card labels and notes`
  - トップのカード文言を `レース名（競馬場 芝/ダート 距離） 出馬表` に変更。
  - レースごとの短評を追加。
  - `/sim` のレース選択プルダウンも同じ表示名に統一。
- `a24490f Add race grade filters to course selection`
  - トップ一覧にグレード絞り込みUIを追加。
  - `/sim` のレース選択にも同じグレード絞り込みを追加。
  - `/sim?course=...` が効くように修正。
- `fb6d551 feat: expand weekly coverage to listed and open races`
  - 今週の対象を重賞だけでなく L / OP まで拡張。
- `8b0d455 feat: split market focus signals`
  - 能力評価と市場注目シグナルの見せ方を整理。
- `c94d4c9 Fix mojibake in X post labels`
  - X投稿ボタン文言と投稿文の文字化けを修正。
- `163acae Add X post button for recommended pair`
  - 的中率向け1頭と回収率向け1頭を同時投稿するボタンを追加。
- `0203575 Sync live weather and wind conditions`
  - 天気、馬場、風向、風速のライブ反映を追加。
- `eee8169 Flatten simulation win-rate bias`
  - 試走勝率が1頭に寄りすぎる問題を緩和。
- `e287809 Fill recent form data and hide empty training`
  - 近走を自動投入し、追切が全頭空のときは列を非表示化。
- `0067794 Fix live odds refresh and weekend polling`
  - ライブオッズ更新と土日ポーリングを安定化。

## 4. 重要ファイル

- `app/page.tsx`
  - トップページ本体。今週レース一覧は `WeeklyRaceBrowser` を使用。
- `components/WeeklyRaceBrowser.tsx`
  - 今週の対象レース一覧とグレード絞り込みUI。
- `components/GradeFilterChips.tsx`
  - グレードチップの共通UI。
- `components/CourseConfig.tsx`
  - 条件設定UI。/sim 側のレース絞り込みもここにある。
- `components/SimulationResults.tsx`
  - 試走結果テーブル、推奨カード、X投稿ボタン。
- `components/HorseInput.tsx`
  - 馬データ入力。近走は表示、追切は全空なら隠す。
- `app/sim/page.tsx`
  - /sim 画面本体、ライブ更新、X投稿文生成、`course` / `archive` クエリ解釈。
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

## 5. 現在の運用メモ

- GitHub の `main` へ push すると Vercel が再デプロイする想定。
- 2026-03-09 時点で、本番反映済みの最新 push は `fdfeff1`。
- 文字列の修正後は、古い Vercel deployment URL を見続けると古い表示が残ることがある。必ず Current / Production を確認すること。
- PowerShell 上では一部の日本語が文字化けして見えることがある。ブラウザ表示と build 成功を優先して確認すること。

## 6. 確認コマンド

- `cmd /c npx tsc --noEmit --incremental false`
- `cmd /c npm run build`
- 週次データを更新したいときは `node scripts/refresh-weekly-races.mjs`

## 7. 未解決・注意点

- `lib/raceCardContent.ts` の短評は手書きマップなので、対象レースが入れ替わった週は見直しが必要。
- X 投稿は composer 起動のみ。完全自動投稿は別系統の workflow / webhook 管理。
- 公式オッズとガチ勢オッズの差が肝なので、土日の更新頻度をさらに上げる余地はある。
- 追切は現在「安定取得できない週は隠す」方針。再導入するなら取得精度の担保が先。
- `eslint` はローカル依存として入っていないので、`npx eslint ...` は環境によって外部取得に失敗することがある。

## 8. 次に触るなら候補

- 短評を data 側へ寄せるか、週次生成スクリプトから自動付与するか検討。
- 短評にトライアル優先出走権などの定型情報を入れる場合は、出典つきで管理するか決める。
- 土日のライブ更新間隔を 10分 -> 5分 にするか検討。
- X投稿文にレース名の略称ではなく表示名を揃える。
- 自動投稿 workflow と画面の X 投稿文を共通化する。
- 血統の算出を推定値ベースではなく実データ連携へ寄せる。
