"use client";

import Link from "next/link";
import { ARCHIVED_COURSES } from "@/lib/courses";
import { ARCHIVED_RACES as LEGACY_ARCHIVED_RACES } from "@/lib/raceData";
import {
  GENERATED_ARCHIVED_RACES,
  GENERATED_COMPLETED_RACES,
  type GeneratedReviewRace,
} from "@/lib/generatedRaceSchedule";

type LegacyArchiveCard = {
  courseId: string;
  label: string;
  date: string;
  hashtag: string;
  horses: { id: string; name: string; predictionCount: number }[];
  surfaceLabel: string;
  distance: number;
  archived: true;
};

type ReviewCard = GeneratedReviewRace & { archived?: boolean };

function formatSurface(surface: "Turf" | "Dirt") {
  return surface === "Dirt" ? "ダート" : "芝";
}

function openReviewPost(text: string) {
  if (!text) return;
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
}

function buildLegacyCards(): LegacyArchiveCard[] {
  return LEGACY_ARCHIVED_RACES.map((race) => {
    const course = ARCHIVED_COURSES.find((entry) => entry.id === race.courseId);
    return {
      courseId: race.courseId,
      label: race.label,
      date: race.date,
      hashtag: race.hashtag,
      horses: race.horses.map((horse) => ({
        id: horse.id,
        name: horse.name,
        predictionCount: horse.predictionCount,
      })),
      surfaceLabel: course?.surface === "Dirt" ? "ダート" : "芝",
      distance: course?.distance ?? 0,
      archived: true,
    };
  });
}

function resultText(race: ReviewCard) {
  const top3 = race.result?.top3HorseNames ?? [];
  if (top3.length >= 3) {
    return `1着 ${top3[0]} / 2着 ${top3[1]} / 3着 ${top3[2]}`;
  }
  if (top3.length === 2) {
    return `1着 ${top3[0]} / 2着 ${top3[1]}`;
  }
  if (top3.length === 1) {
    return `1着 ${top3[0]}`;
  }
  return "";
}

function renderReviewCard(race: ReviewCard, badge: string, showReplayLink: boolean) {
  const topHorses = [...race.horses]
    .sort((a, b) => (b.predictionCount ?? 0) - (a.predictionCount ?? 0))
    .slice(0, 3);
  const reviewPostText = race.review?.xPostText ?? "";

  return (
    <div key={`${badge}-${race.courseId}`} className="bg-white rounded-lg shadow-md border border-slate-200 p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{race.label}</h2>
          <p className="text-sm text-slate-500 mt-1">
            {race.venue} | {race.date} | {formatSurface(race.surface)} {race.distance}m
          </p>
        </div>
        <span className="px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-amber-700 text-xs font-medium">
          {badge}
        </span>
      </div>

      {resultText(race) ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-bold text-emerald-800">結果</p>
          <p className="text-sm text-emerald-900 mt-1">{resultText(race)}</p>
        </div>
      ) : null}

      {race.review?.summary ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-bold text-slate-700">回顧</p>
          <p className="text-sm text-slate-700 mt-1 leading-6">{race.review.summary}</p>
        </div>
      ) : null}

      <div className="mb-4">
        <h3 className="text-sm font-medium text-slate-600 mb-2">事前人気上位</h3>
        <div className="flex flex-wrap gap-3">
          {topHorses.map((horse, index) => (
            <div key={horse.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
              <span className="text-xs font-bold text-slate-400">#{index + 1}</span>
              <span className="text-sm font-medium text-slate-800">{horse.name}</span>
              <span className="text-xs text-purple-600 font-bold">{horse.predictionCount}pt</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">{race.horses.length}頭</p>
        <div className="flex items-center gap-2">
          {reviewPostText ? (
            <button
              type="button"
              onClick={() => openReviewPost(reviewPostText)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              回顧をX送信
            </button>
          ) : null}
          {showReplayLink ? (
            <Link
              href={`/sim?archive=${race.courseId}`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition shadow hover:shadow-md"
            >
              この条件でシミュレーション
            </Link>
          ) : (
            <span className="text-xs text-slate-400">翌日反映の回顧カード</span>
          )}
        </div>
      </div>
    </div>
  );
}

function renderLegacyCard(race: LegacyArchiveCard) {
  const topHorses = [...race.horses].sort((a, b) => b.predictionCount - a.predictionCount).slice(0, 3);

  return (
    <div key={`legacy-${race.courseId}`} className="bg-white rounded-lg shadow-md border border-slate-200 p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{race.label}</h2>
          <p className="text-sm text-slate-500 mt-1">
            {race.date} | {race.surfaceLabel} {race.distance}m
          </p>
        </div>
        <span className="px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-amber-700 text-xs font-medium">
          アーカイブ
        </span>
      </div>

      <div className="mb-4">
        <h3 className="text-sm font-medium text-slate-600 mb-2">事前人気上位</h3>
        <div className="flex flex-wrap gap-3">
          {topHorses.map((horse, index) => (
            <div key={horse.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
              <span className="text-xs font-bold text-slate-400">#{index + 1}</span>
              <span className="text-sm font-medium text-slate-800">{horse.name}</span>
              <span className="text-xs text-purple-600 font-bold">{horse.predictionCount}pt</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">{race.horses.length}頭</p>
        <Link
          href={`/sim?archive=${race.courseId}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition shadow hover:shadow-md"
        >
          この条件でシミュレーション
        </Link>
      </div>
    </div>
  );
}

export default function ArchivePage() {
  const currentReviewRaces = [...GENERATED_COMPLETED_RACES].sort((a, b) => b.date.localeCompare(a.date));
  const archivedReviewRaces = [...GENERATED_ARCHIVED_RACES].sort((a, b) => b.date.localeCompare(a.date));
  const legacyCards = buildLegacyCards();

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">レース回顧アーカイブ</h1>
          <p className="text-slate-500 mt-2">翌日更新の回顧と、レース回顧のシミュレーション入口をまとめています。</p>
        </header>

        <div className="space-y-10">
          {currentReviewRaces.length > 0 ? (
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">今週の回顧</h2>
                <p className="text-sm text-slate-500 mt-1">レース翌朝に結果と勝ち馬回顧を自動反映します。</p>
              </div>
              {currentReviewRaces.map((race) => renderReviewCard(race, "今週の回顧", false))}
            </section>
          ) : null}

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">レース回顧</h2>
              <p className="text-sm text-slate-500 mt-1">週替わり後にアーカイブ化された重賞と、固定のレース回顧を並べています。</p>
            </div>
            {[...archivedReviewRaces, ...legacyCards].length > 0 ? (
              <>
                {archivedReviewRaces.map((race) => renderReviewCard(race, "アーカイブ", true))}
                {legacyCards.map((race) => renderLegacyCard(race))}
              </>
            ) : (
              <div className="text-center py-16 text-slate-400 bg-white rounded-lg border border-slate-200">
                <p className="text-lg">回顧アーカイブはまだありません</p>
              </div>
            )}
          </section>
        </div>

        <footer className="mt-12 text-center text-xs text-slate-400">
          <Link href="/" className="hover:text-slate-600 transition">
            トップへ
          </Link>
          <span className="mx-2">|</span>
          <Link href="/sim" className="hover:text-slate-600 transition">
            シミュレーターへ
          </Link>
          <span className="mx-2">|</span>
          Powered by Next.js & Tailwind CSS
        </footer>
      </div>
    </div>
  );
}
