# 市場残差評価

発走前 snapshot の全出走馬オッズから市場確率を構成。366 レースを時系列分割し、前半 219 件で係数を学習、後半 147 件 (2026-08-02〜) で評価。archive の事後更新リスクがある特徴量は除外。

- この既定60/40分割を主判定とする。別分割は感度分析として扱う。
- 市場のみ test NLL: 2.1350 (市場そのまま 2.1419)
- 候補 2 個。係数と ΔNLL は各候補で同じレース集合の市場のみと比較。95% CI はレース単位ブートストラップ 10000 回。採用判定には Bonferroni 補正 CI を使用。
- 採用条件: test ΔNLL ≤ −0.005 かつ補正 CI 上限 < 0。今回通過: 0 個。

| 特徴量 | train / test n | 係数 c | 市場NLL | モデルNLL | ΔNLL | 95% CI | 補正CI | 判定 |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| ground-bias.gateBiasFit (枠×当日内外) | 178 / 113 | -0.0335 | 2.2053 | 2.2076 | 0.0023 | -0.0039〜0.0085 | -0.0046〜0.0092 | 未通過 |
| ground-bias.styleBiasFit (位置取り×当日前後) | 178 / 112 | 0.1217 | 2.2073 | 2.1978 | -0.0095 | -0.0301〜0.0113 | -0.0328〜0.0139 | 未通過 |
| ground-bias.wetFit (道悪実績×当日道悪) | 47 / 21 | - | - | - | - | - | - | 件数不足 |

## リーク監査

review-records の更新時刻が snapshot より後の horse 行は 4961。archive horse の updatedAt がある行は 0/4961、archive と snapshot のオッズ差 2448 行、枠差 0 行、脚質差 0 行。archive 側には各特徴量が snapshot 時点で固定されていた証拠がないため、以下は全て学習・評価から除外。枠・脚質は snapshot の保存値のみ使用。

| archive 候補 | 判定 | 理由 |
| --- | --- | --- |
| archive.horses.speed | 除外 | archive horse entries lack per-field pre-race timestamp; using snapshot-only values where available |
| archive.horses.stamina | 除外 | archive horse entries lack per-field pre-race timestamp; using snapshot-only values where available |
| archive.horses.power | 除外 | archive horse entries lack per-field pre-race timestamp; using snapshot-only values where available |
| archive.horses.guts | 除外 | archive horse entries lack per-field pre-race timestamp; using snapshot-only values where available |
| archive.horses.trainingScore | 除外 | archive horse entries lack per-field pre-race timestamp; using snapshot-only values where available |
| archive.horses.recentFormScore | 除外 | archive horse entries lack per-field pre-race timestamp; using snapshot-only values where available |
| archive.horses.recentAverageFinish | 除外 | archive horse entries lack per-field pre-race timestamp; using snapshot-only values where available |
| archive.horses.recentTimeIndex | 除外 | archive horse entries lack per-field pre-race timestamp; using snapshot-only values where available |
| archive.horses.lastRaceGradeScore | 除外 | archive horse entries lack per-field pre-race timestamp; using snapshot-only values where available |
| archive.horses.distanceChange | 除外 | archive horse entries lack per-field pre-race timestamp; using snapshot-only values where available |
| archive.horses.favoriteCount | 除外 | archive horse entries lack per-field pre-race timestamp; using snapshot-only values where available |
| archive.horses.xBuzzScore | 除外 | archive horse entries lack per-field pre-race timestamp; using snapshot-only values where available |
| archive.horses.predictionCount | 除外 | archive horse entries lack per-field pre-race timestamp; using snapshot-only values where available |
| archive.horses.weight | 除外 | archive horse entries lack per-field pre-race timestamp; using snapshot-only values where available |
| archive.horses.runningStyle | 除外 | archive horse entries lack per-field pre-race timestamp; using snapshot-only values where available |
| archive.horses.gateNumber | 除外 | archive horse entries lack per-field pre-race timestamp; using snapshot-only values where available |
| archive.horses.realOdds | 除外 | archive horse entries lack per-field pre-race timestamp; final odds can overwrite this field |

## 除外件数

- not_eligible_live_complete_review: 204
- roster_count_missing_or_mismatch: 87
