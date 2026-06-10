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

## 2026-05-11 current state

### 方針

- `runMonteCarlo` / `runRace` は変更しない
- trend hints は薄い補正・タグ・説明・参考順位に限定
- G1高回収率は少サンプル警告つきの参考値として表現
- NHKマイルC は荒れ要素あり、人気固定ではなく条件適性で見る
- X投稿は単複回収率重視のエンジンとして表現

### 重要コミット

- `b524801 feat: add race trend hints to analysis`
  - 新規: `lib/raceTrendHints.ts`, `data/raceTrends.ts`, `data/runnerPreviousRaceOverrides.ts`, `tests/raceTrendHints.test.ts`
  - 拡張: `lib/types.ts`, `lib/raceAnalysis.ts`, `components/SimulationResults.tsx`, `app/archive/page.tsx`, `lib/defaultHorses.ts`, `lib/predictionSnapshots.ts`
  - `applyRaceTrendHints` がベーススコアに薄い補正を加える。`adjustmentMode: "explanationOnly"` なら補正値 0 でタグと説明だけ付与
  - サンプルサイズ `√(n/16)` で重みづけし、小サンプルの過大評価を抑制
  - `RaceTrendAdjustmentPolicy` で正負の補正幅をプロファイル単位で制限
  - `buildRaceAnalysisRows` でのみ `findRaceTrendProfile` + `applyRaceTrendHintsToResults` を呼ぶ。シミュレーション本体には影響しない
  - 馬名のゆらぎ吸収用に `PREVIOUS_RACE_ALIAS_GROUPS`（NZT、アーリントンC↔チャーチルダウンズC など）を持つ
- `803cfc3 feat: improve tanpuku X post copy`
  - 新規: `lib/tanpukuXPost.ts`, `tests/tanpukuXPost.test.ts`
  - 改修: `app/sim/page.tsx`
  - `buildTanpukuPreRacePostText` が 280 文字制限内で full → short → noStats にフォールバック
  - G1 サンプル数で警告フレーズ切替: `<10` → 「参考値ながら」 / `<30` → 「検証中データで」 / それ以上 → 「集計で」
  - `TanpukuPostHorse` に `mark` / `markNote` を追加し、◎○▲の注釈表示に対応
  - 「単複回収率重視のエンジンです。」を共通フッターとして固定

### 次に触ってよい軽作業

- `lib/predictionSnapshots.ts` の unused warning 解消
- 未追跡の分析メモ・分析スクリプトは本体機能と混ぜない
- `.claude/*` は基本 commit しない

### Vault 連携

- 想定 vault パス: `C:\Users\kouyu\OneDrive\デスクトップ\markdowns\HorseRaceSim`
- 2026-05-11 時点、Linux サンドボックスの Claude セッションからは `/mnt/c/...` 経由で到達不可（OneDrive はマウントされていない）
- 2026-06-10 時点、Windows ネイティブの Claude セッションからは直接読み書き可能
- vault 側に `horse-race-sim/decision-log` または `horse-race-sim/current-state` ノートを作る場合は、上記「方針」「重要コミット」「次に触ってよい軽作業」だけ転記すれば十分
- セッション側からの読み書きが必要なときは、必要部分をリポジトリ内のファイルに反映するか、本ファイル末尾に追記する運用とする

## 2026-06-10 current state

### tanpuku-place-v2.4: 確率校正と分類ゲート再構築

- 確定済み229レースの実績分析で、v2.3 の winProb (score/220) が約2倍過大、classificationHint が全件 "win" 化していたことが判明
- 校正後のエンジンは市場単体を上回る (winProb logLoss 0.583 vs 市場 0.600)。選定順位 (placeScore/valueScore) は変更していない
- 変更ファイル:
  - `lib/generatedCalibration.mjs` (新規・自動生成): ロジスティック再校正係数
  - `scripts/calibration-report.mjs` (新規): 校正レポート常設。`--write-coefficients` で係数再生成、`--vault` で vault 50_logs に複製
  - `lib/tanpukuSelection.mjs`: v2.4。calWinProb/calPlaceProb/calTanRoi/calFukuRoi/fieldSize を scored entry に追加。classifyHonmeiPick を校正ゲートに書き換え (skip: <10頭 or calPlace<0.52∧calTanRoi<85 / win: calWin≥0.35∧calTanRoi≥95 / place: それ以外)
  - `lib/predictionSnapshots.ts`: DEFAULT_SCORING_VERSION → v2.4
  - `tests/tanpukuSelection.test.ts` (新規)
- バックテスト (n=223): skip 34件 単ROI52.6%/複71.8% (out-of-sample 再現確認済)、win 27件 単ROI121.9% (少数・暫定)、place 162件 複ROI94.4%/ワイドROI120%
- 詳細な根拠と見直し条件: vault `50_logs/2026-06-10-tanpuku-v24-calibration.md` と `data/analysis/calibration-report.md`
- 次の改善候補: ワイド主力化 (place分類×ワイドROI120%)、MC top3分布の取得 (要方針判断)、複勝オッズ実値取得
- 運用: レコード50件増ごとに `node scripts/calibration-report.mjs` で劣化確認 → 問題なければ `--write-coefficients` で係数更新
