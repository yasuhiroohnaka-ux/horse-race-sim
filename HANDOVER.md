# 引き継ぎ録

更新日: 2026-03-03

## 概要

直近は `AI競馬シミュレーター` の出馬表更新、netkeiba連携、能力値計算、結果表示の調整を進めた。
直近の基準コミットは `27726e9 feat: add past-performance factors and stabilize simulation output`。

## コミット済みの変更

### 6311ab6 `chore: sort entries by gate and remove training adjustment`

- 出馬表の並びを馬番順に調整
- 追切補正を撤廃
- デフォルトの馬場設定を `良` に調整

主な対象:

- [app/sim/page.tsx](/c:/Users/kouyu/.gemini/antigravity/scratch/horse-race-sim/app/sim/page.tsx)
- [components/HorseInput.tsx](/c:/Users/kouyu/.gemini/antigravity/scratch/horse-race-sim/components/HorseInput.tsx)
- [lib/defaultHorses.ts](/c:/Users/kouyu/.gemini/antigravity/scratch/horse-race-sim/lib/defaultHorses.ts)
- [lib/simulation.ts](/c:/Users/kouyu/.gemini/antigravity/scratch/horse-race-sim/lib/simulation.ts)
- [data/weekly-races.json](/c:/Users/kouyu/.gemini/antigravity/scratch/horse-race-sim/data/weekly-races.json)

### 9ce1f17 `tune simulation balance to reduce extreme bias`

- 能力値差が勝率に直結しすぎる問題を緩和
- シミュレーションの偏りを抑える方向で係数を調整

主な対象:

- [lib/simulation.ts](/c:/Users/kouyu/.gemini/antigravity/scratch/horse-race-sim/lib/simulation.ts)

### 27726e9 `feat: add past-performance factors and stabilize simulation output`

- netkeiba から `shutuba_past` を取得し、近5走ベースの情報を追加
- `近5走 / 走破タイム / 着順 / 前走レース格` を能力値補正に利用
- オッズ更新時に世論値 (`xPopularityByGate`) も更新
- 結果表示の数値を小数第1位中心に整理
- 結果テーブルの枠色表示を追加

主な対象:

- [app/api/netkeiba-odds/route.ts](/c:/Users/kouyu/.gemini/antigravity/scratch/horse-race-sim/app/api/netkeiba-odds/route.ts)
- [app/sim/page.tsx](/c:/Users/kouyu/.gemini/antigravity/scratch/horse-race-sim/app/sim/page.tsx)
- [components/HorseInput.tsx](/c:/Users/kouyu/.gemini/antigravity/scratch/horse-race-sim/components/HorseInput.tsx)
- [components/SimulationResults.tsx](/c:/Users/kouyu/.gemini/antigravity/scratch/horse-race-sim/components/SimulationResults.tsx)
- [lib/defaultHorses.ts](/c:/Users/kouyu/.gemini/antigravity/scratch/horse-race-sim/lib/defaultHorses.ts)
- [lib/raceData.ts](/c:/Users/kouyu/.gemini/antigravity/scratch/horse-race-sim/lib/raceData.ts)
- [lib/simulation.ts](/c:/Users/kouyu/.gemini/antigravity/scratch/horse-race-sim/lib/simulation.ts)
- [lib/types.ts](/c:/Users/kouyu/.gemini/antigravity/scratch/horse-race-sim/lib/types.ts)

## 現在の未コミット変更

### 目的

中山記念の `ニシノエージェント` と `スパークリシャール` の騎手が `未定` のままになる問題の修正。

### 状況

netkeiba の `shutuba.html` 側では騎手が古いか欠けるケースがあり、`shutuba_past.html` 側には正しい騎手が載っている。
そのため、`shutuba_past` の `Jockey` 列を取得して `jockeyByGate` を上書きする修正を入れている。

対象ファイル:

- [app/api/netkeiba-odds/route.ts](/c:/Users/kouyu/.gemini/antigravity/scratch/horse-race-sim/app/api/netkeiba-odds/route.ts)
- [app/sim/page.tsx](/c:/Users/kouyu/.gemini/antigravity/scratch/horse-race-sim/app/sim/page.tsx)

差分概要:

- `parseShutubaPastEntries(...)` で騎手名を抽出
- `GET` 内の `pastEntries` ループで `jockeyByGate[gate] = entry.jockey`
- 画面側で、取得した非空文字列の騎手名をそのまま反映

## 現在のワーキングツリー

`git status --short`

```text
 M app/api/netkeiba-odds/route.ts
 M app/sim/page.tsx
```

## 検証状況

- `cmd /c npx tsc --noEmit --incremental false` は通過済み
- ただし未コミットの騎手修正はブラウザ実画面で再確認が必要

確認対象:

- 中山記念
- `4` スパークリシャール
- `13` ニシノエージェント

## 次にやること

1. `/sim` を再読み込み
2. オッズ更新を実行
3. 上記2頭の騎手が埋まるか確認
4. 問題なければこの2ファイルをコミットしてプッシュ

## 注意点

- 日本語ファイルを PowerShell の `Set-Content` で直接書き換えると文字化けしやすい
- 以後の編集は `apply_patch` 優先
- ブラウザ表示が古い場合は API の取得結果ではなくクライアント状態保持が原因の可能性もあるため、完全リロードで再確認する
