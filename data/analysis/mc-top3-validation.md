# MC top3 検証 (placeProb 置換判断)

- 生成日時: 2026-06-10T15:23:43.135Z
- 対象: 237 レース / 3335 馬 (iterations=500, 再実行MC)

## logLoss 比較 (小さいほど良い)

| 予測子 | raw | 再校正後(全体) | out-of-sample(後半) |
| --- | --- | --- | --- |
| MC top3 頻度 | 0.478 | 0.4711 | 0.4835 |
| 現行 placeProb 式 | 0.474 | 0.4628 | 0.4693 |

## 判定

現行 placeProb 式のほうが out-of-sample 判別力が高い

## 注意

- 再実行 MC は当時の snapshot と乱数・馬データの差があるため、本番予測時の成績そのものではない。
- placeProb 式は市場 implied を含むため「市場のエコー」が混ざる。MC top3 は市場から独立した情報。
- 置換ではなくブレンド (placeProb と MC top3 の logit 結合) が有望なら次フェーズで検証する。
