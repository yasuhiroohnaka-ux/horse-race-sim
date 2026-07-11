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
- 運用: レコード50件増ごとに `node scripts/calibration-report.mjs` で劣化確認 → 問題なければ `--write-coefficients` で係数更新

### tanpuku-place-v2.5: ワイド推奨・複勝オッズ実値近似・MC top3 取得 (2026-06-11)

- `wideRecommendation`: place 分類 (ワイドROI 116%, n=167) のとき本命×相手ワイドを推奨として `pickTanpukuPair` が返す
- `overbetLabel` を校正値化: officialImplied − 校正勝率 ≥0.05/0.15。市場15pt以上過熱は単ROI 33% (n=23)
- `placeOdds` を実払戻OLSに置換: `max(1.0, odds×0.1649+0.8981)` (`PLACE_ODDS_MODEL`、自動生成)。旧近似は1.4-1.6倍過大だった
- `runMonteCarlo` が `top3Count` (3着内率%) を返すようになった。動力学は不変、出力統計の追加のみ。「runMonteCarlo は変更しない」方針は「動力学を変えない」に読み替え
- snapshot rankedRows に `simTop3Rate` を蓄積開始 (v2.5以降)
- `scripts/validate-mc-top3.ts` の検証 (237レース): MC top3 は現行 placeProb 式に判別力で劣る (logLoss 0.484 vs 0.469) → **置換見送り**。ライブ snapshot が50レース超でブレンド再検証
- 詳細: vault `50_logs/2026-06-11-tanpuku-v25-wide-placeodds-top3.md`、`data/analysis/mc-top3-validation.md`

## 2026-07-11 current state

### live OOS 監視・タイミングゲート・ワイド推奨シャドー化 (Codex 作業を Claude が引き継ぎ完了)

- commit `56ab22e` (branch `codex/model-pipeline-recovery`)。実装は Codex、検証とコミット・文書化は Claude
- **ワイド推奨は停止 (shadowOnly)**: 配備係数の事後 live holdout 96件で place ワイドROI 60.0% (バックテスト116%と乖離)。UI・X投稿のワイド行は `recommended=false` で自動非表示。ペア決済のシャドー監視は継続し、復活判断は live 実測で行う
- calibration-report を live/retro 分離に刷新: `livePreRaceEligible` な live_pre_race (238件) を成績評価の正とし、retrospective/backfill (89件) はフィット補助に限定。配備係数の事後 holdout と係数更新ゲート (直近50件取り置き) を常設。**現時点の更新ゲートは未通過** (win 候補が市場に勝てない) → 係数は 2026-06-07 学習のまま据え置き
- keiba-routine: 発走5分前リード / 確定30分バッファのタイミングゲート、推奨レコードの live 系譜判定 (`lineageInvalidReason`)、performance の eligible-only 再構築。決済ステージを sun_16 → sun_18 に移動 (sun_16 は後方互換で残置)
- refresh-weekly-races: 部分取得時に既存レース・確定結果を保全する `scripts/weekly-race-merge.mjs` を導入 (取得欠けでデータが消える事故の防止)
- `lib/raceTiming.mjs` (新規): 発走時刻ゲートと live_pre_race / retrospective 判定の共通実装
- MC top3 ライブ検証 (96レース): ライブ simTop3Rate は OOS 判別力で線形式に勝つ (logLoss 0.5164 vs 0.5189) が、ブレンド改善 0.003 < 採用基準 0.005 で**見送り**。snapshot 増加後の再検証は roadmap 側の判断による
- 検証: tsc / npm test 100本 / build 全てグリーン
- 補足: ローカル clone が古いと routine が止まって見えるが、GitHub Actions は稼働継続していた (origin/main に routine コミットあり)。作業前に `git fetch` を推奨

### P3 UI改善 + P4 X投稿最適化 (2026-07-11, commits 9f01917 / 9a2c3c6)

- **P3-2**: `/sim` 結果テーブルに校正勝率・校正複勝・市場評価バッジ列 (`SimulationResults.tsx`、データは `pickTanpukuPair().scored` を horseId 紐付け)
- **P3-3**: 馬テーブル脚質セルにソースバッジ (確定/手動/引継/推測/出所不明)。手動修正で `saved_manual_override` に更新 (`HorseInput.tsx`)
- **P3-4**: `/archive` 詳細ドロワーに「予測 vs 結果」(予測上位5 + 圏外好走馬の突き合わせ、majorContributors 寄与内訳)
- **P4-A**: `lib/xPostPayload.mjs` の旧・生値 DECISION_THRESHOLDS 複製を撤去し `recommendedBetDecisionCore.mjs` に統一。**routine の pre_race 投稿は決定計算前に payload を作っており旧フォールバックが毎回実行されていた**バグを修正 (決定を先に計算して winPick に添付)
- **P4-B**: 分類ドリブン文面 (win=単勝勝負型/place=複勝軸型/skip=見送り宣言、校正値併記) — `lib/tanpukuXPost.ts`
- **P4-C**: `lib/xTagSanitize.mjs` 新設。括弧付きレース名の壊れタグを全経路サニタイズ + 優先度付きタグ末尾行 (字数超過は下位から削除、skip はタグ最小)
- **P4-D**: 回顧投稿に「分類→結果」行とサニタイズ済みタグ、週次サマリに分類内訳行
- 検証: npm test 113本 / tsc / build / next start 本番ビルドでのブラウザ確認
- 注意: ブラウザで /sim のシミュを回すと `data/prediction-snapshots.jsonl` に副産物が出る (コミット前に `git checkout --` で除外、既知)

### /monitor モデル監視ダッシュボード (2026-07-11, commit b72087c)

- `app/monitor/page.tsx` (新規): calibration-report.json の画面化。警告バナー (校正劣化 / ワイド劣化)、係数更新ゲートのチェックリスト、live holdout、分類バックテスト (全期間 + 直近50件)、データ構成 (live/遡及)、市場ギャップ、校正バケット、係数情報
- `app/api/calibration-report/route.ts` (新規): レポート JSON の提供 + live_pre_race 限定の週次ROI推移 (単勝/複勝/ワイド、pair 決済ベース) を review-records から集計
- トップページのヒーローに「モデル監視」ボタンを追加
- 表示のみの変更でエンジンには不干渉。レポートは週次ルーチンが自動再生成するため、ダッシュボードは常に最新の監視値を映す
