# Post-Feb Opponent Offline Comparison

- generatedAt: 2026-04-10T16:04:32.862Z
- comparedRaceCount: 39
- dataSources: data/analysis/post-feb-current-indicator-table.csv, data/analysis/post-feb-current-indicator-summary.json, data/analysis/post-feb-hypothesis-checks.json, data/weekly-races.json
- duplicateNameRaceIds: 202606020511, 202606020611, 202607010211, 202609010711

## Logic Definitions

- Current: Current opponent recorded in post-feb-current-indicator-table.csv
- Plan A: Priority: placeProb -> top3Stability -> placeScore -> simWinProb
- Plan B: Priority: placeScore -> placeProb -> top3Stability -> simWinProb
- Plan C: Composite rank score: 0.40*placeProb + 0.35*placeScore + 0.20*top3Stability + 0.05*simWinProb

## Main Comparison

| Logic | Place hit rate | Place ROI | Win hit rate | Win ROI | Honmei-opponent wide hit rate | Honmei-opponent wide ROI | Swap count vs current | Overlap avoided count | Avg popularity | Avg odds | Avg placeProb | Avg top3Stability |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Current | 43.6% | 67.4% | 10.3% | 43.8% | 35.9% | 106.7% | - | 0 | 2.38 | 5.22 | 0.669 | 0.612 |
| Plan A | 43.6% | 72.1% | 12.8% | 57.9% | 41.0% | 126.7% | 3 | 36 | 2.56 | 5.59 | 0.668 | 0.607 |
| Plan B | 43.6% | 68.7% | 12.8% | 57.9% | 38.5% | 113.6% | 1 | 39 | 2.41 | 5.28 | 0.667 | 0.609 |
| Plan C | 41.0% | 64.4% | 10.3% | 43.8% | 38.5% | 111.0% | 4 | 36 | 2.54 | 5.45 | 0.666 | 0.612 |

## Selection Profile

| Logic | Popularity median [Q1-Q3] | Odds median [Q1-Q3] | placeProb median [Q1-Q3] | placeScore median [Q1-Q3] | top3Stability median [Q1-Q3] | simWinProb median [Q1-Q3] |
| --- | --- | --- | --- | --- | --- | --- |
| Current | 2.00 [2.00-2.00] | 4.60 [3.50-6.00] | 0.663 [0.643-0.692] | 0.553 [0.528-0.597] | 0.617 [0.583-0.658] | 0.107 [0.047-0.218] |
| Plan A | 2.00 [2.00-3.00] | 4.90 [3.65-6.30] | 0.661 [0.643-0.690] | 0.549 [0.525-0.593] | 0.612 [0.569-0.653] | 0.121 [0.047-0.247] |
| Plan B | 2.00 [2.00-2.00] | 4.80 [3.55-6.00] | 0.660 [0.643-0.690] | 0.549 [0.528-0.593] | 0.614 [0.577-0.653] | 0.106 [0.047-0.218] |
| Plan C | 2.00 [2.00-3.00] | 4.80 [3.55-6.05] | 0.660 [0.642-0.690] | 0.549 [0.525-0.593] | 0.614 [0.583-0.653] | 0.121 [0.047-0.239] |

## Honmei Gap Profile

| Logic | honmei-placeProb gap | honmei-placeScore gap | honmei-top3Stability gap | honmei-simWinProb gap |
| --- | --- | --- | --- | --- |
| Current | 0.070 | 0.084 | 0.056 | 0.031 |
| Plan A | 0.072 | 0.088 | 0.061 | 0.015 |
| Plan B | 0.072 | 0.087 | 0.059 | 0.034 |
| Plan C | 0.073 | 0.088 | 0.056 | 0.023 |

## Selection Tendencies

- Plan A: often collides with honmei profile / looks more natural as a wide partner
- Plan B: often collides with honmei profile
- Plan C: often collides with honmei profile

## Notes

- bestPlaceRoi: Plan A (72.1%)
- bestWideRoi: Plan A (126.7%)
- overlapAvoidedCount counts races where the scheme's top horse was the honmei and the next horse had to be used as opponent.
- duplicate horse-name rows existed in 4 races; this compare-only script canonicalized same-name rows within each race before selecting opponents.
- No production logic, UI, or persisted selection format was changed.

