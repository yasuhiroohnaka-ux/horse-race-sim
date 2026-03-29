"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ARCHIVED_COURSES } from "@/lib/courses";
import {
  GENERATED_ARCHIVED_RACES,
  GENERATED_COMPLETED_RACES,
  type GeneratedReviewRace,
} from "@/lib/generatedRaceSchedule";
import { ARCHIVED_RACES as LEGACY_ARCHIVED_RACES } from "@/lib/raceData";
import type { PredictionSnapshot } from "@/lib/types";

type LegacyArchiveCard = {
  courseId: string;
  label: string;
  date: string;
  resultText?: string;
  reviewSummary?: string;
  reviewPostText?: string;
  horses: { id: string; name: string; predictionCount: number }[];
  surfaceLabel: string;
  distance: number;
};

type ReviewCard = GeneratedReviewRace & { archived?: boolean };

type SnapshotLookupResponse = {
  ok: boolean;
  snapshotsByRaceId: Record<string, PredictionSnapshot>;
};

type SettlementStatus = "pending_result" | "pending_payouts" | "settled";
type BetOutcome = "not_settled" | "hit" | "miss" | "hit_missing_payout";
type PayoutSource = "official" | "missing";

type RecommendationSettlement = {
  horseId: string;
  horseName: string;
  postedAt: string | null;
  settlementStatus: SettlementStatus;
  tanOutcome: BetOutcome;
  fukuOutcome: BetOutcome;
  tanPayout: number;
  fukuPayout: number;
  tanPayoutSource: PayoutSource;
  fukuPayoutSource: PayoutSource;
};

type RecommendationSettlementBundle = {
  win: RecommendationSettlement | null;
  value: RecommendationSettlement | null;
};

type PopularityBandSummary = {
  raceCount: number;
  placeCount: number;
  placeRate: number;
  fukuRoi: number;
};

type SnapshotRankSummary = {
  rank: number;
  raceCount: number;
  placeCount: number;
  placeRate: number;
};

type AggregateSummary = {
  snapshotHonmei: {
    raceCount: number;
    firstCount: number;
    placeCount: number;
    winRate: number;
    placeRate: number;
  };
  routineHonmei: {
    raceCount: number;
    tanHitCount: number;
    fukuHitCount: number;
    tanHitRate: number;
    fukuHitRate: number;
    tanRoi: number;
    fukuRoi: number;
    pendingCount: number;
  };
  valueCandidate: {
    raceCount: number;
    placeCount: number;
    placeRate: number;
    fukuRoi: number;
    pendingCount: number;
  };
  agreement: {
    raceCount: number;
    samePickCount: number;
    samePickRate: number;
    samePickPlaceCount: number;
    samePickPlaceRate: number;
    differentPickCount: number;
    snapshotPlaceRateWhenDifferent: number;
    routinePlaceRateWhenDifferent: number;
  };
  popularityBands: {
    routineHonmei: Record<"fav_1_3" | "fav_4_6" | "fav_7_plus", PopularityBandSummary>;
    valueCandidate: Record<"fav_1_3" | "fav_4_6" | "fav_7_plus", PopularityBandSummary>;
  };
  snapshotRanks: SnapshotRankSummary[];
  disagreementDetail: {
    raceCount: number;
    snapshotPlaceRate: number;
    routinePlaceRate: number;
    valuePlaceCount: number;
    snapshotMissRoutinePlaceCount: number;
    routineMissSnapshotPlaceCount: number;
  };
};

type PerformanceLookupResponse = {
  settlementsByCourseId: Record<string, RecommendationSettlementBundle>;
  settlementsByRaceId: Record<string, RecommendationSettlementBundle>;
  summary: AggregateSummary | null;
};

function formatSurface(surface: "Turf" | "Dirt") {
  return surface === "Dirt" ? "ダート" : "芝";
}

function formatRate(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatTimestamp(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

function formatSettlementStatus(status: SettlementStatus) {
  if (status === "settled") return "精算済み";
  if (status === "pending_payouts") return "払戻待ち";
  return "結果待ち";
}

function formatOutcome(outcome: BetOutcome, kind: "tan" | "fuku") {
  if (outcome === "hit") return kind === "tan" ? "単勝的中" : "複勝的中";
  if (outcome === "miss") return kind === "tan" ? "単勝不的中" : "複勝圏外";
  if (outcome === "hit_missing_payout") {
    return kind === "tan" ? "単勝的中(払戻未取得)" : "複勝的中(払戻未取得)";
  }
  return "未精算";
}

function formatPayout(value: number) {
  return value > 0 ? `${Math.round(value)}円` : "-";
}

function formatPayoutSource(source: PayoutSource) {
  return source === "official" ? "公式払戻" : "払戻未取得";
}

function openReviewPost(text: string) {
  if (!text) return;
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
}

function getRaceKey(race: ReviewCard): { raceId: string | null; courseId: string } {
  const raceId = String(race.raceId ?? "").trim();
  if (raceId) return { raceId, courseId: String(race.courseId ?? "") };
  const courseId = String(race.courseId ?? "");
  const match = courseId.match(/(\d{12})$/);
  return { raceId: match?.[1] ?? null, courseId };
}

function getHorseNameFromSnapshot(snapshot: PredictionSnapshot | undefined, horseId?: string | null) {
  if (!snapshot || !horseId) return "";
  return snapshot.rankedRows.find((row) => row.horseId === horseId)?.horseName ?? "";
}

function getSnapshotHorseDisplay(snapshot: PredictionSnapshot | undefined, horseId?: string | null) {
  if (!horseId) return "-";
  const name = getHorseNameFromSnapshot(snapshot, horseId);
  return name ? `${name} (${horseId})` : String(horseId);
}

function getSnapshotFinishLabel(race: ReviewCard, horseId?: string | null) {
  if (!horseId) return "対象なし";
  const winnerHorseId = String(race.result?.winnerHorseId ?? "");
  const top3 = race.result?.top3HorseIds?.map((id) => String(id)) ?? [];
  if (!winnerHorseId && top3.length === 0) return "結果待ち";
  if (winnerHorseId === horseId) return "1着";
  if (top3.includes(horseId)) return "3着内";
  return "圏外";
}

function getRecommendationFinishLabel(rec: RecommendationSettlement | null) {
  if (!rec) return "データなし";
  if (rec.tanOutcome === "hit" || rec.tanOutcome === "hit_missing_payout") return "単勝的中";
  if (rec.fukuOutcome === "hit" || rec.fukuOutcome === "hit_missing_payout") return "複勝的中";
  if (rec.fukuOutcome === "miss") return "複勝圏外";
  return formatSettlementStatus(rec.settlementStatus);
}

function buildLegacyCards(): LegacyArchiveCard[] {
  return LEGACY_ARCHIVED_RACES.map((race) => {
    const course = ARCHIVED_COURSES.find((entry) => entry.id === race.courseId);
    const top3Names = (race.result?.top3HorseIds ?? [])
      .map((horseId) => race.horses.find((horse) => horse.id === horseId)?.name ?? "")
      .filter(Boolean);
    return {
      courseId: race.courseId,
      label: race.label,
      date: race.date,
      resultText:
        top3Names.length >= 3
          ? `1着 ${top3Names[0]} / 2着 ${top3Names[1]} / 3着 ${top3Names[2]}`
          : top3Names.length === 2
            ? `1着 ${top3Names[0]} / 2着 ${top3Names[1]}`
            : top3Names.length === 1
              ? `1着 ${top3Names[0]}`
              : "",
      reviewSummary: race.review?.summary,
      reviewPostText: race.review?.xPostText,
      horses: race.horses.map((horse) => ({
        id: horse.id,
        name: horse.name,
        predictionCount: horse.predictionCount,
      })),
      surfaceLabel: course?.surface === "Dirt" ? "ダート" : "芝",
      distance: course?.distance ?? 0,
    };
  });
}

function resultText(race: ReviewCard) {
  const top3 = race.result?.top3HorseNames ?? [];
  if (top3.length >= 3) return `1着 ${top3[0]} / 2着 ${top3[1]} / 3着 ${top3[2]}`;
  if (top3.length === 2) return `1着 ${top3[0]} / 2着 ${top3[1]}`;
  if (top3.length === 1) return `1着 ${top3[0]}`;
  return "";
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function SummaryCard({
  title,
  tone,
  children,
}: {
  title: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border px-4 py-4 ${tone}`}>
      <p className="text-sm font-bold">{title}</p>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function PopularityBandSection({
  title,
  data,
}: {
  title: string;
  data: Record<"fav_1_3" | "fav_4_6" | "fav_7_plus", PopularityBandSummary>;
}) {
  const labels: Array<[keyof typeof data, string]> = [
    ["fav_1_3", "1〜3番人気"],
    ["fav_4_6", "4〜6番人気"],
    ["fav_7_plus", "7番人気以下"],
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
      <p className="text-sm font-bold text-slate-800">{title}</p>
      <div className="mt-3 space-y-3">
        {labels.map(([key, label]) => (
          <div key={key} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-3">
            <p className="text-xs font-semibold text-slate-700">{label}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <SummaryMetric label="対象" value={`${data[key].raceCount}R`} />
              <SummaryMetric label="複勝的中" value={`${data[key].placeCount}`} />
              <SummaryMetric label="複勝率" value={formatRate(data[key].placeRate)} />
              <SummaryMetric label="複回収率" value={formatRate(data[key].fukuRoi)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderAggregateSummary(summary: AggregateSummary | null) {
  if (!summary) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">単複派向けサマリー</h2>
        <p className="mt-1 text-sm text-slate-500">
          確定済みベースで、どの出力が単複向きかを横断で見られるようにしています。
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryCard title="Snapshot本命" tone="border-sky-200 bg-sky-50 text-sky-800">
          <SummaryMetric label="対象レース数" value={`${summary.snapshotHonmei.raceCount}R`} />
          <SummaryMetric label="1着数" value={`${summary.snapshotHonmei.firstCount}`} />
          <SummaryMetric label="3着内数" value={`${summary.snapshotHonmei.placeCount}`} />
          <SummaryMetric label="単勝率" value={formatRate(summary.snapshotHonmei.winRate)} />
          <SummaryMetric label="複勝率" value={formatRate(summary.snapshotHonmei.placeRate)} />
        </SummaryCard>

        <SummaryCard title="単複本命" tone="border-amber-200 bg-amber-50 text-amber-800">
          <SummaryMetric label="対象レース数" value={`${summary.routineHonmei.raceCount}R`} />
          <SummaryMetric label="単勝的中数" value={`${summary.routineHonmei.tanHitCount}`} />
          <SummaryMetric label="複勝的中数" value={`${summary.routineHonmei.fukuHitCount}`} />
          <SummaryMetric label="単勝率" value={formatRate(summary.routineHonmei.tanHitRate)} />
          <SummaryMetric label="複勝率" value={formatRate(summary.routineHonmei.fukuHitRate)} />
          <SummaryMetric label="単回収率" value={formatRate(summary.routineHonmei.tanRoi)} />
          <SummaryMetric label="複回収率" value={formatRate(summary.routineHonmei.fukuRoi)} />
          <SummaryMetric label="未精算除外" value={`${summary.routineHonmei.pendingCount}R`} />
        </SummaryCard>

        <SummaryCard title="妙味候補" tone="border-emerald-200 bg-emerald-50 text-emerald-800">
          <SummaryMetric label="対象レース数" value={`${summary.valueCandidate.raceCount}R`} />
          <SummaryMetric label="3着内数" value={`${summary.valueCandidate.placeCount}`} />
          <SummaryMetric label="複勝率" value={formatRate(summary.valueCandidate.placeRate)} />
          <SummaryMetric label="複回収率" value={formatRate(summary.valueCandidate.fukuRoi)} />
          <SummaryMetric label="未精算除外" value={`${summary.valueCandidate.pendingCount}R`} />
        </SummaryCard>

        <SummaryCard title="一致 / 不一致" tone="border-violet-200 bg-violet-50 text-violet-800">
          <SummaryMetric label="比較対象レース" value={`${summary.agreement.raceCount}R`} />
          <SummaryMetric label="本命一致数" value={`${summary.agreement.samePickCount}`} />
          <SummaryMetric label="一致率" value={formatRate(summary.agreement.samePickRate)} />
          <SummaryMetric label="一致時の複勝率" value={formatRate(summary.agreement.samePickPlaceRate)} />
          <SummaryMetric
            label="不一致時 Snapshot複勝率"
            value={formatRate(summary.agreement.snapshotPlaceRateWhenDifferent)}
          />
          <SummaryMetric
            label="不一致時 単複本命複勝率"
            value={formatRate(summary.agreement.routinePlaceRateWhenDifferent)}
          />
        </SummaryCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <PopularityBandSection title="人気帯別の複勝成績: 単複本命" data={summary.popularityBands.routineHonmei} />
        <PopularityBandSection title="人気帯別の複勝成績: 妙味候補" data={summary.popularityBands.valueCandidate} />

        <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
          <p className="text-sm font-bold text-slate-800">Snapshot順位別の複勝率</p>
          <div className="mt-3 space-y-3">
            {summary.snapshotRanks.map((item) => (
              <div key={item.rank} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-3">
                <p className="text-xs font-semibold text-slate-700">{item.rank}番手</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <SummaryMetric label="対象" value={`${item.raceCount}R`} />
                  <SummaryMetric label="3着内数" value={`${item.placeCount}`} />
                  <SummaryMetric label="複勝率" value={formatRate(item.placeRate)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-4">
        <p className="text-sm font-bold text-rose-800">不一致レース診断</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryMetric label="不一致レース数" value={`${summary.disagreementDetail.raceCount}R`} />
          <SummaryMetric label="Snapshot本命複勝率" value={formatRate(summary.disagreementDetail.snapshotPlaceRate)} />
          <SummaryMetric label="単複本命複勝率" value={formatRate(summary.disagreementDetail.routinePlaceRate)} />
          <SummaryMetric label="妙味候補が3着内" value={`${summary.disagreementDetail.valuePlaceCount}`} />
          <SummaryMetric
            label="Snapshot圏外 / 単複本命複勝"
            value={`${summary.disagreementDetail.snapshotMissRoutinePlaceCount}`}
          />
          <SummaryMetric
            label="単複本命圏外 / Snapshot3着内"
            value={`${summary.disagreementDetail.routineMissSnapshotPlaceCount}`}
          />
        </div>
      </div>
    </section>
  );
}

function renderHonmeiComparison(
  race: ReviewCard,
  snapshot?: PredictionSnapshot,
  settlement?: RecommendationSettlementBundle | null
) {
  const snapshotHorseId = snapshot?.honmeiHorseId ?? null;
  const routineHorseId = settlement?.win?.horseId ?? null;
  if (!snapshotHorseId && !routineHorseId) return null;

  const agreement =
    snapshotHorseId && routineHorseId
      ? snapshotHorseId === routineHorseId
        ? "一致"
        : "不一致"
      : "片方のみ";

  const detailItems =
    snapshotHorseId && routineHorseId
      ? [
          agreement === "一致" ? "両モデルの本命は一致" : "両モデルの本命は不一致",
          `Snapshot本命は${getSnapshotFinishLabel(race, snapshotHorseId)}、単複本命は${getRecommendationFinishLabel(
            settlement?.win ?? null
          )}`,
        ]
      : [
          snapshotHorseId
            ? `Snapshot本命のみ取得: ${getSnapshotFinishLabel(race, snapshotHorseId)}`
            : `単複本命のみ取得: ${getRecommendationFinishLabel(settlement?.win ?? null)}`,
        ];

  return (
    <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
      <p className="text-sm font-bold text-violet-800">本命の定義</p>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-violet-700">
        <span className="rounded-full bg-white px-3 py-1">
          Snapshot本命 {getSnapshotHorseDisplay(snapshot, snapshotHorseId)}
        </span>
        <span className="rounded-full bg-white px-3 py-1">
          単複本命 {settlement?.win ? `${settlement.win.horseName} (${settlement.win.horseId})` : "-"}
        </span>
        <span className="rounded-full bg-white px-3 py-1">判定 {agreement}</span>
      </div>
      <ul className="mt-3 space-y-1 text-xs text-slate-700">
        {detailItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function renderSnapshotComparison(race: ReviewCard, snapshot?: PredictionSnapshot) {
  if (!snapshot) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm font-semibold text-slate-700">Snapshot予想 vs 実結果</p>
        <p className="mt-2 text-sm text-slate-500">
          このレースに対応する prediction snapshot は見つかりませんでした。
        </p>
      </div>
    );
  }

  const topRows = snapshot.rankedRows
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3);
  const finishers = race.result?.finishers?.slice(0, 3) ?? [];

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-sm font-semibold text-slate-800">Snapshot予想 vs 実結果</p>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
        <span className="rounded-full bg-slate-100 px-3 py-1">取得 {formatTimestamp(snapshot.capturedAt)}</span>
        <span className="rounded-full bg-slate-100 px-3 py-1">family {snapshot.modelFamily}</span>
        <span className="rounded-full bg-slate-100 px-3 py-1">version {snapshot.modelVersion}</span>
        <span className="rounded-full bg-sky-100 px-3 py-1">
          Snapshot本命 {getSnapshotHorseDisplay(snapshot, snapshot.honmeiHorseId)}
        </span>
        <span className="rounded-full bg-emerald-100 px-3 py-1">
          妙味候補 {getSnapshotHorseDisplay(snapshot, snapshot.valueHorseId)}
        </span>
        <span className="rounded-full bg-amber-100 px-3 py-1">
          市場注目 {getSnapshotHorseDisplay(snapshot, snapshot.watchHorseId)}
        </span>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-3">
          <p className="text-xs font-semibold text-slate-700">Snapshot上位3頭</p>
          <div className="mt-2 space-y-3">
            {topRows.map((row) => (
              <div key={`${row.rank}-${row.horseId}`} className="rounded-md border border-white bg-white px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {row.rank}位 {row.horseName}
                    </p>
                    <p className="text-xs text-slate-500">
                      win {row.winProb.toFixed(1)}% / fair {row.fairOdds?.toFixed(1) ?? "-"} / real{" "}
                      {row.realOdds?.toFixed(1) ?? "-"} / edge {row.edge.toFixed(1)}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                    {row.runningStyle}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
                  {row.majorContributors.map((contributor) => (
                    <span key={contributor.key} className="rounded-full bg-slate-100 px-2 py-1">
                      {contributor.label} {contributor.value.toFixed(1)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-3">
          <p className="text-xs font-semibold text-slate-700">実結果</p>
          <div className="mt-2 space-y-3">
            {finishers.length > 0 ? (
              finishers.map((finisher) => (
                <div
                  key={`${finisher.position}-${finisher.horseNumber}`}
                  className="rounded-md border border-white bg-white px-3 py-3 text-sm text-slate-700"
                >
                  <p className="font-semibold text-slate-800">
                    {finisher.position}着 {finisher.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    horseId {finisher.horseId ?? "-"} / 馬番 {finisher.horseNumber} / 人気 {finisher.popularity} / odds{" "}
                    {Number(finisher.odds).toFixed(1)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">実結果はまだありません。</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-3 text-xs text-slate-700">
        <p>Snapshot本命: {getSnapshotFinishLabel(race, snapshot.honmeiHorseId)}</p>
        <p>妙味候補: {getSnapshotFinishLabel(race, snapshot.valueHorseId)}</p>
        <p>市場注目: {getSnapshotFinishLabel(race, snapshot.watchHorseId)}</p>
      </div>
    </div>
  );
}

function renderSettlementComparison(settlement?: RecommendationSettlementBundle | null) {
  if (!settlement?.win && !settlement?.value) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm font-semibold text-slate-700">単複の検証</p>
        <p className="mt-2 text-sm text-slate-500">このレースの単複推奨データはありません。</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-sm font-semibold text-slate-800">単複の検証</p>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-amber-100 bg-amber-50 px-3 py-3">
          <p className="text-xs font-semibold text-amber-800">単複本命</p>
          {settlement?.win ? (
            <div className="mt-2 space-y-2 text-sm text-slate-700">
              <p className="font-semibold text-slate-800">
                {settlement.win.horseName} ({settlement.win.horseId})
              </p>
              <SummaryMetric label="精算状態" value={formatSettlementStatus(settlement.win.settlementStatus)} />
              <SummaryMetric label="単勝" value={formatOutcome(settlement.win.tanOutcome, "tan")} />
              <SummaryMetric label="複勝" value={formatOutcome(settlement.win.fukuOutcome, "fuku")} />
              <SummaryMetric label="単勝払戻" value={formatPayout(settlement.win.tanPayout)} />
              <SummaryMetric label="複勝払戻" value={formatPayout(settlement.win.fukuPayout)} />
              <SummaryMetric label="単勝払戻元" value={formatPayoutSource(settlement.win.tanPayoutSource)} />
              <SummaryMetric label="複勝払戻元" value={formatPayoutSource(settlement.win.fukuPayoutSource)} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">単複本命はありません。</p>
          )}
        </div>

        <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-3">
          <p className="text-xs font-semibold text-emerald-800">妙味候補</p>
          {settlement?.value ? (
            <div className="mt-2 space-y-2 text-sm text-slate-700">
              <p className="font-semibold text-slate-800">
                {settlement.value.horseName} ({settlement.value.horseId})
              </p>
              <SummaryMetric label="精算状態" value={formatSettlementStatus(settlement.value.settlementStatus)} />
              <SummaryMetric label="複勝" value={formatOutcome(settlement.value.fukuOutcome, "fuku")} />
              <SummaryMetric label="複勝払戻" value={formatPayout(settlement.value.fukuPayout)} />
              <SummaryMetric label="複勝払戻元" value={formatPayoutSource(settlement.value.fukuPayoutSource)} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">妙味候補はありません。</p>
          )}
        </div>
      </div>
    </div>
  );
}

function renderReviewCard(
  race: ReviewCard,
  snapshot: PredictionSnapshot | undefined,
  settlement: RecommendationSettlementBundle | null
) {
  const summaryText = race.review?.summary ?? "回顧テキストはまだありません。";
  const reasons = race.review?.reasons ?? [];

  return (
    <article key={`${race.courseId}-${race.date}`} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {race.date} / {formatSurface(race.surface)} {race.distance}m / {race.grade}
          </p>
          <h3 className="mt-1 text-xl font-bold text-slate-900">{race.label}</h3>
          {resultText(race) ? <p className="mt-2 text-sm text-slate-600">結果: {resultText(race)}</p> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {race.review?.xPostText ? (
            <button
              type="button"
              onClick={() => openReviewPost(race.review?.xPostText ?? "")}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Xに投稿
            </button>
          ) : null}
          <Link
            href={`/sim?course=${encodeURIComponent(race.courseId)}`}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
          >
            Replay
          </Link>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
        <p className="text-sm leading-7 text-slate-700">{summaryText}</p>
        {reasons.length > 0 ? (
          <ul className="mt-3 space-y-1 text-xs text-slate-600">
            {reasons.map((reason) => (
              <li key={reason}>・{reason}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-4">
        {renderHonmeiComparison(race, snapshot, settlement)}
        <div className="grid gap-4">
          {renderSnapshotComparison(race, snapshot)}
          {renderSettlementComparison(settlement)}
        </div>
      </div>
    </article>
  );
}

function renderLegacyCard(card: LegacyArchiveCard) {
  return (
    <article key={`${card.courseId}-${card.date}`} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {card.date} / {card.surfaceLabel} {card.distance}m
      </p>
      <h3 className="mt-1 text-xl font-bold text-slate-900">{card.label}</h3>
      {card.resultText ? <p className="mt-2 text-sm text-slate-600">結果: {card.resultText}</p> : null}
      {card.reviewSummary ? (
        <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-sm leading-7 text-slate-700">{card.reviewSummary}</p>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {card.reviewPostText ? (
          <button
            type="button"
            onClick={() => openReviewPost(card.reviewPostText ?? "")}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Xに投稿
          </button>
        ) : null}
        <Link
          href={`/sim?course=${encodeURIComponent(card.courseId)}`}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
        >
          Replay
        </Link>
      </div>
    </article>
  );
}

export default function ArchivePage() {
  const [snapshotsByRaceId, setSnapshotsByRaceId] = useState<Record<string, PredictionSnapshot>>({});
  const [settlementsByRaceId, setSettlementsByRaceId] = useState<Record<string, RecommendationSettlementBundle>>({});
  const [settlementsByCourseId, setSettlementsByCourseId] = useState<Record<string, RecommendationSettlementBundle>>({});
  const [aggregateSummary, setAggregateSummary] = useState<AggregateSummary | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [snapshotRes, performanceRes] = await Promise.all([
          fetch("/api/prediction-snapshots", { cache: "no-store" }),
          fetch("/api/performance", { cache: "no-store" }),
        ]);

        const snapshotJson = (await snapshotRes.json()) as SnapshotLookupResponse;
        const performanceJson = (await performanceRes.json()) as PerformanceLookupResponse;

        if (!isMounted) return;
        setSnapshotsByRaceId(snapshotJson.snapshotsByRaceId ?? {});
        setSettlementsByRaceId(performanceJson.settlementsByRaceId ?? {});
        setSettlementsByCourseId(performanceJson.settlementsByCourseId ?? {});
        setAggregateSummary(performanceJson.summary ?? null);
      } catch (error) {
        console.warn("failed to load archive comparison data", error);
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  const generatedCards = useMemo<ReviewCard[]>(
    () => [
      ...GENERATED_COMPLETED_RACES.map((race) => ({ ...race, archived: false })),
      ...GENERATED_ARCHIVED_RACES.map((race) => ({ ...race, archived: true })),
    ],
    []
  );
  const legacyCards = useMemo(() => buildLegacyCards(), []);

  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">回顧アーカイブ</h1>
          <p className="mt-2 text-sm text-slate-500">
            snapshot、実結果、単複精算を同じ画面で見比べて、どの出力が単複向きかを確認できます。
          </p>
        </div>

        {renderAggregateSummary(aggregateSummary)}

        <section className="mt-10 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">生成回顧</h2>
            <p className="mt-1 text-sm text-slate-500">
              予想 snapshot と実結果、単複の検証をまとめて確認できます。
            </p>
          </div>
          <div className="space-y-6">
            {generatedCards.map((race) => {
              const { raceId, courseId } = getRaceKey(race);
              const snapshot = raceId ? snapshotsByRaceId[raceId] : undefined;
              const settlement =
                (raceId ? settlementsByRaceId[raceId] : null) ??
                settlementsByCourseId[courseId] ??
                null;
              return renderReviewCard(race, snapshot, settlement);
            })}
          </div>
        </section>

        {legacyCards.length > 0 ? (
          <section className="mt-10 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">旧アーカイブ</h2>
              <p className="mt-1 text-sm text-slate-500">旧データ形式の回顧です。比較サマリー対象外です。</p>
            </div>
            <div className="space-y-6">{legacyCards.map((card) => renderLegacyCard(card))}</div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
