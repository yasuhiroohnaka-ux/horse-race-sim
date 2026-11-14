# KEIBA GAP LAB (horse-race-sim)

能力値・適性・馬場条件と市場オッズのズレを Monte Carlo シミュレーションで分析する競馬アプリ。画面は `/`(今週のレース一覧)、`/sim`(シミュレーター)、`/archive`(過去レース)。

## 現状把握はまず HANDOVER.md

`HANDOVER.md` がバージョン履歴・現行スコアリング方針・主要ファイルの引き継ぎ台帳。作業前に読み、意味のある変更をしたら追記して更新する運用。

## 絶対ルール

- **`data/weekly-races.json` を変更したら、コミット前に必ず `npm run sync:race-schedule` を実行する。** UI は JSON を動的 fetch せず、自動生成される `lib/generatedRaceSchedule.ts` を静的 import しているため、忘れると画面表示と内部参照データがズレる。
- **`runMonteCarlo` / `runRace` の動力学を変えない。** 出力統計の追加(v2.5 の `top3Count` 等)は可。補正・タグ付けはシミュ本体ではなく `lib/raceAnalysis.ts` 系の薄いレイヤーで行う。
- `main` への push で Vercel に即デプロイされる。レビューが要る変更は feature ブランチを切って PR。
- `.claude/*` はコミットしない。

## 検証コマンド

- `npx tsc --noEmit --incremental false`
- `npm run build`
- `npm run lint` は eslint 未整備のため失敗する(既知の状態。勝手に直そうとしない)

## スコアリングエンジン(単複回収率重視)

- 本体: `lib/tanpukuSelection.mjs`(v2.x)。校正係数は `lib/generatedCalibration.mjs`(自動生成ファイル。手編集しない)
- 確定レコードが 50 件増えるごとに `node scripts/calibration-report.mjs` で劣化確認 → 問題なければ `--write-coefficients` で係数を再生成
- 週次レースデータ更新: `node scripts/refresh-weekly-races.mjs`

## 主要ファイル

- `lib/simulation.ts` — Monte Carlo 本体
- `lib/defaultHorses.ts` / `lib/horseIntegrity.ts` — 初期馬データ生成と重複除去(dedupe)
- `app/api/netkeiba-odds/route.ts` / `app/api/live-race-conditions/route.ts` — 一般オッズ・ライブ馬場情報 API
- `components/SimulationResults.tsx` — 結果表示と X 投稿(`lib/tanpukuXPost.ts`)

## 補足

- 分析ログの vault: `C:\Users\kouyu\OneDrive\デスクトップ\markdowns\HorseRaceSim`(Windows ネイティブセッションから読み書き可)
- PowerShell 上で日本語が文字化けして見えることがある。UI 文言の変更時は build+ブラウザ確認を優先
