# MC top3 検証 (placeProb 置換判断)

- 生成日時: 2026-07-11T11:39:11.060Z
- source: snapshots
- 入力: data\prediction-snapshots.jsonl, data\review-records.json
- 対象: 96 レース / 1247 馬
- MC: 保存済みライブ snapshot の simTop3Rate（runMonteCarlo 再実行なし）
- 対象条件:
  - predictionOrigin === saved_live
  - livePreRaceEligible === true
  - rankedRows に有限の simTop3Rate が1件以上あり、有限値の行だけを馬サンプルに使用
  - review-records の actualTop3HorseIds がちょうど3件
  - raceId ごとに preferred/latest snapshot へ dedupe
  - raceDate 昇順、次に capturedAt 昇順

## logLoss 比較 (小さいほど良い)

| 予測子 | raw | 再校正後(全体) | out-of-sample(時系列後半) |
| --- | --- | --- | --- |
| MC top3 頻度 | 0.5181 | 0.5016 | 0.5164 |
| 現行 placeProb 式 | 0.5033 | 0.4998 | 0.5189 |

## placeProb ブレンド shadow 判定

- 式: `sigmoid(w0 + w1*logit(formulaPlace) + w2*logit(mcTop3))`
- train 係数: w0=0.0187, w1=0.9567, w2=0.2035
- test OOS logLoss: 0.5159
- formula 単独比 improvement: 0.003（formula OOS − blend OOS）
- 採用基準: improvement >= 0.005
- 判定: **見送り**

## OOS 分割

- 方針: 時系列前半で再校正し、後半を評価（分割点はレース境界のみ）
- 学習: 48 レース / 653 馬（末尾: {"raceId":"202609030612","raceDate":"2026-06-21","capturedAt":"2026-06-21T05:01:04.090Z"}）
- 評価: 48 レース / 594 馬（先頭: {"raceId":"202602010509","raceDate":"2026-06-27","capturedAt":"2026-06-27T02:04:10.747Z"}）

## 判定

MC top3 頻度のほうが out-of-sample 判別力が高い

## 注意

- MC top3 は予測時に保存された `simTop3Rate / 100`。現在の馬データや乱数による再計算はしていない。
- 実3着内は `review-records.json` の `actualTop3HorseIds` と照合した。
- placeProb 式は市場 implied を含むため「市場のエコー」が混ざる。MC top3 は市場から独立した情報。
- 置換ではなくブレンド (placeProb と MC top3 の logit 結合) が有望なら次フェーズで検証する。
