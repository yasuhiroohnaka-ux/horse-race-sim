# 市場残差評価

発走前 snapshot の全出走馬オッズから市場確率を構成。420 レースを時系列分割し、前半 252 件で係数を学習、後半 168 件 (2026-07-12〜) で評価。archive の事後更新リスクがある特徴量は除外。

- この既定60/40分割を主判定とする。別分割は感度分析として扱う。
- 市場のみ test NLL: 2.1307 (市場そのまま 2.1301)
- 候補 14 個。係数と ΔNLL は各候補で同じレース集合の市場のみと比較。95% CI はレース単位ブートストラップ 10000 回。採用判定には Bonferroni 補正 CI を使用。
- 採用条件: test ΔNLL ≤ −0.005 かつ補正 CI 上限 < 0。今回通過: 0 個。

| 特徴量 | train / test n | 係数 c | 市場NLL | モデルNLL | ΔNLL | 95% CI | 補正CI | 判定 |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| snapshot.winProb | 252 / 168 | 0.0568 | 2.1307 | 2.1317 | 0.0011 | -0.0084〜0.0102 | -0.0132〜0.0145 | 未通過 |
| snapshot.simTop3Rate | 110 / 168 | 0.1042 | 2.1260 | 2.1228 | -0.0032 | -0.0178〜0.0111 | -0.0247〜0.0174 | 未通過 |
| snapshot.score | 252 / 168 | 0.0782 | 2.1307 | 2.1307 | 0.0001 | -0.0078〜0.0079 | -0.0115〜0.0127 | 未通過 |
| snapshot.edge | 252 / 168 | 0.0443 | 2.1307 | 2.1321 | 0.0014 | -0.0064〜0.0090 | -0.0100〜0.0123 | 未通過 |
| snapshot.gateNumber | 252 / 168 | -0.0098 | 2.1307 | 2.1311 | 0.0004 | -0.0010〜0.0018 | -0.0018〜0.0026 | 未通過 |
| snapshot.previousFinish | 0 / 0 | - | - | - | - | - | - | 件数不足 |
| snapshot.majorContributors.abilityScore掲載 | 252 / 168 | - | - | - | - | - | - | レース内変動なし |
| snapshot.majorContributors.marketEdge掲載 | 252 / 168 | -0.0273 | 2.1307 | 2.1314 | 0.0008 | -0.0020〜0.0038 | -0.0034〜0.0054 | 未通過 |
| snapshot.majorContributors.courseFit掲載 | 252 / 168 | 0.0251 | 2.1307 | 2.1305 | -0.0002 | -0.0039〜0.0034 | -0.0059〜0.0050 | 未通過 |
| snapshot.majorContributors.distanceFit掲載 | 252 / 168 | 0.0653 | 2.1307 | 2.1157 | -0.0150 | -0.0260〜-0.0040 | -0.0315〜0.0010 | 未通過 |
| snapshot.majorContributors.groundFit掲載 | 252 / 168 | 0.0509 | 2.1307 | 2.1434 | 0.0128 | 0.0055〜0.0197 | 0.0024〜0.0228 | 未通過 |
| snapshot.majorContributors.paceFit掲載 | 252 / 168 | -0.0719 | 2.1307 | 2.1294 | -0.0012 | -0.0128〜0.0099 | -0.0181〜0.0160 | 未通過 |
| snapshot.runningStyle=Nige | 252 / 168 | 0.0805 | 2.1307 | 2.1300 | -0.0006 | -0.0142〜0.0122 | -0.0212〜0.0181 | 未通過 |
| snapshot.runningStyle=Senko | 252 / 168 | -0.0315 | 2.1307 | 2.1351 | 0.0045 | 0.0002〜0.0091 | -0.0020〜0.0107 | 未通過 |
| snapshot.runningStyle=Sashi | 252 / 168 | -0.0141 | 2.1307 | 2.1283 | -0.0024 | -0.0043〜-0.0004 | -0.0052〜0.0005 | 未通過 |
| snapshot.runningStyle=Oikomi | 252 / 168 | -6.7762 | 2.1307 | 2.2526 | 0.1219 | -0.0301〜0.4179 | -0.0353〜0.7049 | 未通過 |

## リーク監査

review-records の更新時刻が snapshot より後の horse 行は 5723。archive horse の updatedAt がある行は 0/5723、archive と snapshot のオッズ差 2465 行、枠差 0 行、脚質差 6 行。archive 側には各特徴量が snapshot 時点で固定されていた証拠がないため、以下は全て学習・評価から除外。枠・脚質は snapshot の保存値のみ使用。

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

- not_eligible_live_complete_review: 116
- roster_count_missing_or_mismatch: 1
