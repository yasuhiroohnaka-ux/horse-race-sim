import fs from "node:fs/promises";
import path from "node:path";
import type {
  PredictionSnapshot,
  RaceCommentaryActualHorse,
  RaceCommentaryPayload,
  RaceCommentaryPayouts,
  RaceCommentarySimHorse,
  WeeklyDiagnostics,
  WeeklyDiagnosticsComparisonSummary,
  WeeklyNotePayload,
  WeeklyNoteSummaryBlock,
} from "@/lib/types";
import { getRaceTargetFlags } from "@/lib/raceSegmentation.mjs";
import { buildWeeklyDiagnostics, loadWeeklyDiagnosticsContext } from "@/lib/weeklyDiagnostics";
import {
  buildWeeklyDiagnosticsComparison,
  ensureWeeklyDiagnosticsStored,
} from "@/lib/weeklyDiagnosticsStore";

const ROOT = process.cwd();
const WEEKLY_RACES_PATH = path.join(ROOT, "data", "weekly-races.json");

type WeeklyRaceRecord = {
  raceId?: string;
  courseId?: string;
  result?: {
    payouts?: {
      tansho?: { resultNumbers?: number[]; payouts?: number[] };
      fukusho?: { resultNumbers?: number[]; payouts?: number[] };
    };
  };
};

function normalizeString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function formatRate(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatReturnRate(value: number) {
  return `${value.toFixed(1)}%`;
}

async function loadRacePayoutsByRaceId(): Promise<Record<string, RaceCommentaryPayouts>> {
  try {
    const raw = await fs.readFile(WEEKLY_RACES_PATH, "utf8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
    if (!Array.isArray(parsed)) return {};

    const result: Record<string, RaceCommentaryPayouts> = {};
    for (const race of parsed as WeeklyRaceRecord[]) {
      const raceId =
        normalizeString(race.raceId) ??
        normalizeString(race.courseId)?.match(/(\d{12})$/)?.[1] ??
        null;
      if (!raceId) continue;

      const tanshoNums = Array.isArray(race.result?.payouts?.tansho?.resultNumbers)
        ? race.result?.payouts?.tansho?.resultNumbers ?? []
        : [];
      const tanshoPays = Array.isArray(race.result?.payouts?.tansho?.payouts)
        ? race.result?.payouts?.tansho?.payouts ?? []
        : [];
      const fukushoNums = Array.isArray(race.result?.payouts?.fukusho?.resultNumbers)
        ? race.result?.payouts?.fukusho?.resultNumbers ?? []
        : [];
      const fukushoPays = Array.isArray(race.result?.payouts?.fukusho?.payouts)
        ? race.result?.payouts?.fukusho?.payouts ?? []
        : [];

      result[raceId] = {
        tansho: tanshoNums.map((horseNumber, index) => ({
          horseNumber: Number(horseNumber),
          payout: Number(tanshoPays[index] ?? 0),
        })),
        fukusho: fukushoNums.map((horseNumber, index) => ({
          horseNumber: Number(horseNumber),
          payout: Number(fukushoPays[index] ?? 0),
        })),
      };
    }

    return result;
  } catch {
    return {};
  }
}

function getPrimaryResultPattern(params: {
  honmeiPlaced: boolean;
  honmeiWon: boolean;
  secondPlaced: boolean;
  thirdPlaced: boolean;
  anyTop3Placed: boolean;
  valuePlaced: boolean;
}) {
  const { honmeiPlaced, honmeiWon, secondPlaced, thirdPlaced, anyTop3Placed, valuePlaced } = params;
  if (honmeiWon) return "honmei_win";
  if (honmeiPlaced) return "honmei_place";
  if (!honmeiPlaced && (secondPlaced || thirdPlaced)) return "honmei_miss_but_other_top3_hit";
  if (!anyTop3Placed && valuePlaced) return "top3_miss_but_value_hit";
  if (!anyTop3Placed) return "top3_total_miss";
  return valuePlaced ? "value_hit" : "mixed";
}

function buildSummaryComment(params: {
  honmeiPlaced: boolean;
  honmeiWon: boolean;
  secondPlaced: boolean;
  thirdPlaced: boolean;
  anyTop3Placed: boolean;
  valuePlaced: boolean;
}) {
  const { honmeiPlaced, honmeiWon, secondPlaced, thirdPlaced, anyTop3Placed, valuePlaced } = params;
  const parts: string[] = [];

  if (honmeiWon) {
    parts.push("シミュレーション本命が1着。上位想定は概ね機能した。");
  } else if (honmeiPlaced) {
    parts.push("シミュレーション本命は馬券内を確保。勝ち切れなかったが方向性は悪くない。");
  } else if (secondPlaced || thirdPlaced) {
    parts.push("本命は崩れたが、シミュレーション上位の相手候補は機能した。順位付けに課題がある。");
  } else if (!anyTop3Placed) {
    parts.push("シミュレーション上位勢が総崩れ。条件評価か序列づけを見直したい。");
  } else {
    parts.push("上位想定は一部機能したが、本命の押し出し方には改善余地がある。");
  }

  if (valuePlaced) {
    parts.push("人気薄側の拾いは効いており、妙味の読み自体は悪くない。");
  }

  return parts.join(" ");
}

function buildMarketSignals(snapshotTop3: RaceCommentarySimHorse[], actualTop3Ids: string[]) {
  const overbetCandidate = snapshotTop3
    .filter((horse) => horse.realOdds !== null && horse.fairOdds !== null)
    .map((horse) => ({
      ...horse,
      overbetGap: Number((horse.fairOdds ?? 0) - (horse.realOdds ?? 0)),
      missed: !actualTop3Ids.includes(horse.horseId),
    }))
    .sort((a, b) => b.overbetGap - a.overbetGap)[0];

  if (overbetCandidate && overbetCandidate.overbetGap >= 2.5) {
    return {
      marketOverbetSignal: true,
      marketFadeCandidate: {
        horseId: overbetCandidate.horseId,
        reason: overbetCandidate.missed
          ? "実オッズがフェアオッズより低く、過剰人気のまま圏外に崩れた可能性がある。"
          : "実オッズがフェアオッズより低く、人気先行で買われていた可能性がある。",
      },
      marketGapComment: overbetCandidate.missed
        ? "市場が買いすぎた人気馬が崩れた形で、危険人気馬ラベルへ再定義しやすいケース。"
        : "市場の買いが先行していた人気馬が見られ、人気と期待値のズレを追う余地がある。",
    };
  }

  return {
    marketOverbetSignal: false,
    marketFadeCandidate: null,
    marketGapComment: null,
  };
}

function buildRaceCommentaryPayload(
  race: Awaited<ReturnType<typeof loadWeeklyDiagnosticsContext>>["races"][number],
  snapshot: PredictionSnapshot | undefined,
  payouts: RaceCommentaryPayouts | null,
  raceMiss: WeeklyDiagnostics["missDiagnostics"]["races"][number] | null
): RaceCommentaryPayload {
  const targetFlags = getRaceTargetFlags(race);
  const snapshotTop3: RaceCommentarySimHorse[] = (snapshot?.rankedRows ?? [])
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3)
    .map((row) => ({
      rank: row.rank,
      horseId: row.horseId,
      horseName: row.horseName,
      winProb: row.winProb,
      fairOdds: row.fairOdds,
      realOdds: row.realOdds,
    }));

  const actualTop3: RaceCommentaryActualHorse[] = (race.result?.finishers ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .slice(0, 3)
    .map((finisher) => ({
      position: finisher.position,
      horseId: normalizeString(finisher.horseId),
      horseName: finisher.name,
      popularity: Number.isFinite(Number(finisher.popularity)) ? Number(finisher.popularity) : null,
      odds: Number.isFinite(Number(finisher.odds)) ? Number(finisher.odds) : null,
    }));

  const actualTop3Ids = actualTop3.map((horse) => horse.horseId).filter((id): id is string => Boolean(id));
  const simHonmeiHorseId = snapshotTop3[0]?.horseId ?? null;
  const simSecondHorseId = snapshotTop3[1]?.horseId ?? null;
  const simThirdHorseId = snapshotTop3[2]?.horseId ?? null;
  const honmeiPlaced = simHonmeiHorseId ? actualTop3Ids.includes(simHonmeiHorseId) : false;
  const honmeiWon = simHonmeiHorseId ? normalizeString(race.result?.winnerHorseId) === simHonmeiHorseId : false;
  const secondPlaced = simSecondHorseId ? actualTop3Ids.includes(simSecondHorseId) : false;
  const thirdPlaced = simThirdHorseId ? actualTop3Ids.includes(simThirdHorseId) : false;
  const anyTop3Placed = snapshotTop3.some((horse) => actualTop3Ids.includes(horse.horseId));
  const valuePlaced = snapshot?.valueHorseId ? actualTop3Ids.includes(snapshot.valueHorseId) : false;
  const marketSignals = buildMarketSignals(snapshotTop3, actualTop3Ids);

  return {
    raceId: String(race.raceId ?? ""),
    courseId: race.courseId,
    raceLabel: race.label,
    raceNumber: targetFlags.raceNumber,
    isSpecialRace: targetFlags.isSpecialRace,
    isFinalRace: targetFlags.isFinalRace,
    isJumpRace: targetFlags.isJumpRace,
    raceSegment: targetFlags.raceSegment,
    simHonmeiHorseId,
    simSecondHorseId,
    simThirdHorseId,
    snapshotTop3,
    actualTop3,
    payouts,
    resultPattern: getPrimaryResultPattern({
      honmeiPlaced,
      honmeiWon,
      secondPlaced,
      thirdPlaced,
      anyTop3Placed,
      valuePlaced,
    }),
    primaryMissTag: raceMiss?.primaryMissTag ?? null,
    missTags: raceMiss?.missTags ?? [],
    missTagDetails: raceMiss?.missTagDetails ?? [],
    marketFadeCandidate: marketSignals.marketFadeCandidate,
    marketGapComment: marketSignals.marketGapComment,
    marketOverbetSignal: marketSignals.marketOverbetSignal,
    summaryComment: buildSummaryComment({
      honmeiPlaced,
      honmeiWon,
      secondPlaced,
      thirdPlaced,
      anyTop3Placed,
      valuePlaced,
    }),
  };
}

function buildSummaryBlocks(
  diagnostics: WeeklyDiagnostics,
  comparison: WeeklyDiagnosticsComparisonSummary | null
): WeeklyNoteSummaryBlock[] {
  const segmentPoints = ([
    ["special_only", diagnostics.segments.special_only],
    ["final12_only", diagnostics.segments.final12_only],
    ["all_expanded", diagnostics.segments.all_expanded],
  ] as const).map(([label, segment]) => {
    if (segment.settledRaceCount === 0) {
      return `${label}: 0 settled races`;
    }
    const primaryMiss = segment.missDiagnostics.primary.find((entry) => entry.raceCount > 0);
    return [
      `${label}: ${segment.settledRaceCount}R settled`,
      `routine ${formatRate(segment.placeCore.routineHonmei.placeRate)}`,
      `fukuROI ${formatReturnRate(segment.placeCore.routineHonmei.placeReturnRate)}`,
      `value ${formatRate(segment.valueCore.placeRate)}`,
      primaryMiss ? `miss ${primaryMiss.tag} ${formatRate(primaryMiss.rate)}` : "",
    ]
      .filter(Boolean)
      .join(" / ");
  });

  return [
    {
      key: "weekly_overview",
      title: "今週の総括",
      points: [
        `対象 ${diagnostics.meta.settledRaceCount}R / weekKey ${diagnostics.meta.weekKey}`,
        `Snapshot本命の複勝率 ${formatRate(diagnostics.placeCore.snapshotHonmei.placeRate)}`,
        `単複本命の複勝率 ${formatRate(diagnostics.placeCore.routineHonmei.placeRate)}`,
      ],
    },
    {
      key: "place_core",
      title: "複勝軸候補はどうだったか",
      points: [
        `Snapshot本命 複勝率 ${formatRate(diagnostics.placeCore.snapshotHonmei.placeRate)}`,
        `単複本命 複勝率 ${formatRate(diagnostics.placeCore.routineHonmei.placeRate)} / 複回収率 ${formatReturnRate(
          diagnostics.placeCore.routineHonmei.placeReturnRate
        )}`,
      ],
    },
    {
      key: "segments",
      title: "Segment Comparison",
      points: segmentPoints,
    },
    {
      key: "miss_tags",
      title: "外れタグ集計",
      points: [
        `負けレース ${diagnostics.missDiagnostics.missRaceCount}R`,
        ...diagnostics.missDiagnostics.primary
          .filter((item) => item.raceCount > 0)
          .map((item) => `primary ${item.tag}: ${item.raceCount}R (${formatRate(item.rate)})`),
        ...diagnostics.missDiagnostics.all
          .filter((item) => item.raceCount > 0)
          .slice(0, 4)
          .map((item) => `all ${item.tag}: ${item.raceCount}R (${formatRate(item.rate)})`),
      ],
    },
    {
      key: "value_core",
      title: "妙味複勝候補はどうだったか",
      points: [
        `妙味候補あり率 ${formatRate(diagnostics.valueCore.candidateRate)} (${diagnostics.valueCore.raceCount}R / skip ${diagnostics.valueCore.skippedCount}R)`,
        `妙味候補 複勝率 ${formatRate(diagnostics.valueCore.placeRate)}`,
        `妙味候補 複回収率 ${formatReturnRate(diagnostics.valueCore.placeReturnRate)}`,
        `人気薄帯 複回収率 ${formatReturnRate(diagnostics.valueCore.longshot.placeReturnRate)}`,
      ],
    },
    {
      key: "snapshot_ranks",
      title: "シミュレーション上位勢の傾向",
      points: diagnostics.placeCore.snapshotRanks.map(
        (rank) => `#${rank.rank} 複勝率 ${formatRate(rank.placeRate)} (${rank.raceCount}R)`
      ),
    },
    {
      key: "popularity_trends",
      title: "人気帯別の傾向",
      points: diagnostics.valueCore.popularityBands.map((band) => {
        const label = band.band === "top3" ? "1〜3番人気" : band.band === "mid" ? "4〜6番人気" : "7番人気以下";
        return `${label} 複勝率 ${formatRate(band.placeRate)} / 複回収率 ${formatReturnRate(band.placeReturnRate)}`;
      }),
    },
    {
      key: "market_heat",
      title: "市場過熱シグナル",
      points: (() => {
        const heat = diagnostics.evaluation.secondaryKpis.marketHeatCounts;
        if (!heat || heat.honmeiOverbetCount + heat.honmeiNonOverbetCount === 0) {
          return ["過熱データなし"];
        }
        const overbetRate = heat.honmeiOverbetCount > 0
          ? ((heat.honmeiOverbetPlaceHitCount / heat.honmeiOverbetCount) * 100).toFixed(1)
          : "-";
        const nonOverbetRate = heat.honmeiNonOverbetCount > 0
          ? ((heat.honmeiNonOverbetPlaceHitCount / heat.honmeiNonOverbetCount) * 100).toFixed(1)
          : "-";
        return [
          `過熱本命 ${heat.honmeiOverbetCount}R → 複勝率 ${overbetRate}%`,
          `非過熱本命 ${heat.honmeiNonOverbetCount}R → 複勝率 ${nonOverbetRate}%`,
        ];
      })(),
    },
    {
      key: "disagreement_review",
      title: "本命不一致レースの振り返り",
      points: [
        `不一致 ${diagnostics.disagreement.raceCount}R`,
        `Snapshot複勝率 ${formatRate(diagnostics.disagreement.snapshotPlaceRate)}`,
        `単複本命複勝率 ${formatRate(diagnostics.disagreement.routinePlaceRate)}`,
      ],
    },
    {
      key: "comparison",
      title: "前回比でどう変わったか",
      points: comparison
        ? [
            `Snapshot本命 複勝率差 ${comparison.deltas.snapshotHonmeiPlaceRateDelta?.toFixed(1) ?? "-"}pt`,
            `単複本命 複勝率差 ${comparison.deltas.routineHonmeiPlaceRateDelta?.toFixed(1) ?? "-"}pt`,
            `妙味候補 複回収率差 ${comparison.deltas.valuePlaceReturnRateDelta?.toFixed(1) ?? "-"}pt`,
          ]
        : ["比較対象となる前回データはまだありません。"],
    },
    {
      key: "best_hits",
      title: "当たりレース",
      points: diagnostics.representativeRaces.bestHits.map((race) => `${race.label} (${race.date})`),
    },
    {
      key: "worst_misses",
      title: "外したレース",
      points: diagnostics.representativeRaces.worstMisses.map((race) => `${race.label} (${race.date})`),
    },
    {
      key: "next_actions",
      title: "次に見直す点",
      points:
        diagnostics.recommendations.length > 0
          ? diagnostics.recommendations.map((recommendation) => recommendation.title)
          : ["今週は明確な改善候補ルールは発火していません。"],
    },
  ];
}

export async function getWeeklyNotePayload(): Promise<WeeklyNotePayload> {
  const context = await loadWeeklyDiagnosticsContext();
  const diagnostics = buildWeeklyDiagnostics(context);
  const { entry, store } = await ensureWeeklyDiagnosticsStored(diagnostics);
  const comparison = buildWeeklyDiagnosticsComparison(entry, store);
  const payoutsByRaceId = await loadRacePayoutsByRaceId();
  const missByRaceId = new Map(entry.diagnostics.missDiagnostics.races.map((item) => [item.raceId, item] as const));

  const commentaryByRaceId = new Map(
    context.races.map((race) => {
      const raceId = String(race.raceId ?? "");
      const commentary = buildRaceCommentaryPayload(
        race,
        context.snapshotsByRaceId[raceId],
        payoutsByRaceId[raceId] ?? null,
        missByRaceId.get(raceId) ?? null
      );
      return [raceId, commentary] as const;
    })
  );

  const representativeRaces = {
    bestHits: entry.diagnostics.representativeRaces.bestHits
      .map((item) => commentaryByRaceId.get(item.raceId))
      .filter((item): item is RaceCommentaryPayload => Boolean(item)),
    worstMisses: entry.diagnostics.representativeRaces.worstMisses
      .map((item) => commentaryByRaceId.get(item.raceId))
      .filter((item): item is RaceCommentaryPayload => Boolean(item)),
    disagreementCases: entry.diagnostics.representativeRaces.disagreementCases
      .map((item) => commentaryByRaceId.get(item.raceId))
      .filter((item): item is RaceCommentaryPayload => Boolean(item)),
    valueHits: entry.diagnostics.representativeRaces.valueHits
      .map((item) => commentaryByRaceId.get(item.raceId))
      .filter((item): item is RaceCommentaryPayload => Boolean(item)),
  };

  return {
    weekKey: entry.diagnostics.meta.weekKey,
    generatedAt: new Date().toISOString(),
    diagnostics: entry.diagnostics,
    recommendations: entry.diagnostics.recommendations,
    comparison,
    summaryBlocks: buildSummaryBlocks(entry.diagnostics, comparison),
    representativeRaces,
    raceCommentaries: context.races
      .map((race) => commentaryByRaceId.get(String(race.raceId ?? "")))
      .filter((item): item is RaceCommentaryPayload => Boolean(item)),
  };
}
