# HANDOVER

更新日: 2026-03-08

## 1. プロダクトの現在地

- アプリ名は `KEIBA GAP LAB`。
- 目的は「能力と人気の乖離を見抜く」こと。
- いまの軸は次の4つ。
  - 試走勝率
  - フェアオッズ
  - 公式オッズ
  - 俺プロ由来のガチ勢オッズ
- 対象レースは「今週の重賞のみ」。週次生成データから表示している。

## 2. いま本番で動いているもの

### レースデータ生成

- `scripts/refresh-weekly-races.mjs` が今週重賞の出馬表、俺プロ本命人数、近走情報、公式オッズ系の初期データを生成する。
- 生成結果は `data/weekly-races.json` に入り、最終的に `lib/generatedRaceSchedule.ts` に同期される。

### /sim のライブ更新

- `app/sim/page.tsx` で初回表示時にライブ更新をかける。
- 土日だけは10分ごとに再取得する。
- 取得先は2本。
  - `/api/netkeiba-odds`: 公式オッズ、俺プロ本命人数、騎手、近走情報
  - `/api/live-race-conditions`: 天気、馬場、風向、風速

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

- `c94d4c9 Fix mojibake in X post labels`
  - X投稿ボタン文言と投稿文の文字化けを修正。
- `163acae Add X post button for recommended pair`
  - 的中率向け1頭と回収率向け1頭を同時に投稿するボタンを追加。
- `0203575 Sync live weather and wind conditions`
  - 天気、馬場、風向、風速のライブ反映を追加。
- `eee8169 Flatten simulation win-rate bias`
  - 試走勝率が1頭に寄りすぎる問題を緩和。
- `e287809 Fill recent form data and hide empty training`
  - 近走を自動投入し、追切が全頭空のときは列を非表示化。
- `0067794 Fix live odds refresh and weekend polling`
  - ライブオッズ更新と土日ポーリングを安定化。
- `uncommitted Separate ability from market signals`
  - 能力初期値を市場データ依存から切り離し、近走ベースで生成するよう変更。
  - ガチ勢シグナルから近走スコアを外し、能力評価と市場評価の表示文言を分離。

## 4. 重要ファイル

- `app/sim/page.tsx`
  - /sim 画面本体、ライブ更新、X投稿文生成。
- `components/SimulationResults.tsx`
  - 試走結果テーブル、推奨カード、X投稿ボタン。
- `components/CourseConfig.tsx`
  - 条件設定UI。ライブ反映の要約表示あり。
- `components/HorseInput.tsx`
  - 馬データ入力。近走は表示、追切は全空なら隠す。
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
- 2026-03-07 時点で作業ツリーは clean。
- 文字列の修正後は、古い Vercel deployment URL を見続けると古い表示が残ることがある。必ず Current / Production を確認すること。

## 6. 確認コマンド

- `cmd /c npx tsc --noEmit --incremental false`
- `cmd /c npm run build`
- 週次データを更新したいときは `node scripts/refresh-weekly-races.mjs`

## 7. 未解決・注意点

- PowerShell 上では一部の日本語が文字化けして見えることがある。ブラウザ表示と build 成功を優先して確認すること。
- X 投稿は composer 起動のみ。完全自動投稿は別系統の workflow / webhook 管理。
- 公式オッズとガチ勢オッズの差が肝なので、土日の更新頻度をさらに上げる余地はある。
- 追切は現在「安定取得できない週は隠す」方針。再導入するなら取得精度の担保が先。

## 8. 次に触るなら候補

- 土日のライブ更新間隔を 10分 -> 5分 にするか検討。
- X投稿文にレース名の略称ではなく正式名を揃える。
- 自動投稿 workflow と画面の X 投稿文を共通化する。
- 血統の算出を推定値ベースではなく実データ連携へ寄せる。
