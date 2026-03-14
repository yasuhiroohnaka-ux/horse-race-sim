# HANDOVER

更新日: 2026-03-14

## 現在の状態

- アプリ名: `KEIBA GAP LAB`
- 目的: 能力値・適性・馬場条件と、市場オッズのズレを比較してレースを読む
- 主な画面
  - `/`: 今週の対象レース一覧
  - `/sim`: レース選択、馬データ調整、シミュレーション結果
  - `/archive`: 過去レース一覧

## 最近の反映

- `df8a5b6 Improve live odds refresh visibility`
  - `/sim` に一般オッズの最終取得時刻を表示
  - 一般オッズの取得失敗時に警告を表示
  - 手動の「一般オッズを更新」ボタンを追加
  - 一般オッズの自動更新を `週末5分ごと` に短縮
  - レース当日午後のメインレース帯は `2分ごと` に短縮
  - ライブ馬場情報は週末 `10分ごと` のまま
- `2c54d1a docs: refresh handover after dedupe fix`
  - 重複馬対応後の引き継ぎ更新
- `19a45be Add dedupe to initial horse list`
  - 初期馬データ、ライブ更新、手編集の各経路で dedupe を追加
  - `Horse.id` と `馬名 + 馬番` の両方で重複検知
- `fdfeff1 Refine race card labels and notes`
  - レースカード表示を `レース名（競馬場 芝/ダート 距離） 出馬表` に統一
  - レースごとの短評を追加
- `a24490f Add race grade filters to course selection`
  - G1/G2/G3/L/OP の絞り込み UI をトップと `/sim` に追加

## オッズ更新まわり

- 一般オッズ API: `app/api/netkeiba-odds/route.ts`
  - `fetchedAt` を返す
  - `cache: "no-store"` で最新取得
- `/sim` 画面: `app/sim/page.tsx`
  - 初回表示時に一般オッズを取得
  - 自動更新
    - 平日: 自動更新なし
    - 週末: 5分ごと
    - 当日午後のメインレース帯: 2分ごと
  - 失敗時は古い値のまま残しつつ、警告メッセージを表示
  - 手動更新ボタンあり
- ライブ馬場情報 API: `app/api/live-race-conditions/route.ts`
  - 週末 10分ごとに自動更新

## 重複馬対応

- 重複検知/除去: `lib/horseIntegrity.ts`
- 初期馬生成: `lib/defaultHorses.ts`
- `/sim` 初期化とライブ更新: `app/sim/page.tsx`
- 手編集時: `components/HorseInput.tsx`
- 2026-03-14 時点で `ACTIVE_COURSES + ARCHIVED_COURSES` 全14コースを確認し、repo 内初期データの重複は未再現

## レース一覧と表示名

- 一覧 UI: `components/WeeklyRaceBrowser.tsx`
- グレード絞り込み: `components/GradeFilterChips.tsx`, `lib/courseGrades.ts`
- レース表示名と短評: `lib/raceCardContent.ts`
- コース定義: `lib/courses.ts`

## 主要ファイル

- `app/page.tsx`
  - トップ画面
- `app/sim/page.tsx`
  - シミュレーター画面本体
- `components/CourseConfig.tsx`
  - レース条件設定、一般オッズ更新表示
- `components/HorseInput.tsx`
  - 馬データ編集
- `components/SimulationResults.tsx`
  - 結果表示と X 投稿
- `app/api/netkeiba-odds/route.ts`
  - 一般オッズ、人気度、騎手、近走情報の取得
- `app/api/live-race-conditions/route.ts`
  - 天気、馬場、風向・風速の取得
- `lib/defaultHorses.ts`
  - 初期馬データ生成
- `lib/horseIntegrity.ts`
  - 重複検知と dedupe
- `lib/simulation.ts`
  - Monte Carlo シミュレーション本体
- `scripts/refresh-weekly-races.mjs`
  - 週次レースデータ更新

## 確認コマンド

- `cmd /c npx tsc --noEmit --incremental false`
- `cmd /c npm run build`
- `node scripts/refresh-weekly-races.mjs`

## 補足

- `main` に push すると Vercel がデプロイされる運用
- PowerShell で日本語が崩れて見えることがあるので、UI 文言変更時は build とブラウザ確認を優先
- `eslint` はローカル依存の都合で未整備のまま
