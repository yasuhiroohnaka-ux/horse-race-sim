"use client";

import { Plus, Trash2 } from "lucide-react";
import { Course, Horse, RaceCondition } from "@/lib/types";
import { calculateOdds } from "@/lib/simulation";
import { applyNetkeibaRatings } from "@/lib/netkeibaRatings";
import { getFrameColor, getFrameNumber } from "@/lib/frameColor";
import { dedupeHorses, findHorseDuplicates } from "@/lib/horseIntegrity";
import { calculateOfficialImpliedProbability, getScenarioProfile, round1 } from "@/lib/raceAnalysis";

interface HorseInputProps {
  horses: Horse[];
  course: Course;
  condition: RaceCondition;
  onHorsesChange: (horses: Horse[]) => void;
  onRunningStyleChange?: () => void;
  hashtag?: string;
}

type TraitFieldKey = "pedigreeScore" | "courseFitScore" | "distanceFitScore" | "groundFitScore" | "paceFitScore";

// 脚質ソースの可視化。推測(guessed_fallback)は展開補正の符号が反転しうるため注意喚起する
const RUNNING_STYLE_SOURCE_BADGES: Record<string, { label: string; className: string; help: string }> = {
  netkeiba_gate: {
    label: "確定",
    className: "bg-hit-wash text-hit",
    help: "netkeiba 出馬表の脚質欄から取得した値です。",
  },
  saved_manual_override: {
    label: "手動",
    className: "bg-info-wash text-info",
    help: "手動で修正済みの脚質です。次回のデータ更新でも保持されます。",
  },
  carried_forward_previous_value: {
    label: "引継",
    className: "bg-paper text-ink-2",
    help: "前回データから引き継いだ値です。",
  },
  guessed_fallback: {
    label: "推測",
    className: "bg-note-wash text-note",
    help: "取得できず推測で埋めた脚質です。誤っていると展開補正が逆向きに働くため、分かる場合は修正してください。",
  },
  unknown: {
    label: "出所不明",
    className: "bg-note-wash text-note",
    help: "脚質の出所が記録されていません。推測値の可能性があります。",
  },
};

const TRAIT_FIELDS: Array<{ key: TraitFieldKey; label: string; title: string; tone: string }> = [
  { key: "pedigreeScore", label: "血統", title: "血統適性", tone: "text-miss" },
  { key: "courseFitScore", label: "コース", title: "競馬場・コース形状適性", tone: "text-info" },
  { key: "distanceFitScore", label: "距離", title: "距離適性", tone: "text-violet-600" },
  { key: "groundFitScore", label: "馬場", title: "馬場適性", tone: "text-note" },
  { key: "paceFitScore", label: "展開", title: "展開適性", tone: "text-hit" },
];

export function HorseInput({ horses, course, condition, onHorsesChange, onRunningStyleChange, hashtag = "#競馬" }: HorseInputProps) {
  const showTrainingColumn = horses.some(
    (horse) => Math.abs(horse.trainingScore ?? 0) > 0.01 || Boolean((horse.trainingNote ?? "").trim())
  );

  const updateHorses = (nextHorses: Horse[]) => {
    const duplicates = findHorseDuplicates(nextHorses);
    if (duplicates.length > 0) {
      console.warn("[HorseInput] duplicate horses detected before update", duplicates, nextHorses);
    }
    const sorted = [...dedupeHorses(nextHorses)].sort((a, b) => (a.gateNumber ?? 999) - (b.gateNumber ?? 999));
    onHorsesChange(calculateOdds(sorted));
  };

  const addHorse = () => {
    const baseHorse: Horse = {
      id: Math.random().toString(36).slice(2, 11),
      name: `Horse ${horses.length + 1}`,
      gateNumber: horses.length + 1,
      jockey: "未定",
      trainer: "",
      speed: 72,
      stamina: 72,
      power: 72,
      guts: 72,
      runningStyle: "Senko",
      favoriteCount: 0,
      xBuzzScore: 0,
      predictionCount: 0,
      realOdds: 0,
      sex: "M",
      weight: 57,
      condition: 5,
      trainingScore: 0,
      recentFormScore: 0,
      recentAverageFinish: 0,
      recentTimeIndex: 0,
      lastRaceGradeScore: 2,
      lastRaceGradeLabel: "OP",
    };

    updateHorses([...horses, applyNetkeibaRatings(baseHorse)]);
  };

  const removeHorse = (id: string) => {
    updateHorses(horses.filter((horse) => horse.id !== id));
  };

  const updateHorse = <K extends keyof Horse>(id: string, field: K, value: Horse[K]) => {
    const updated = horses.map((horse) => {
      if (horse.id !== id) return horse;
      const nextHorse = { ...horse, [field]: value } as Horse;
      if (field === "jockey" || field === "trainer" || field === "realOdds") {
        return applyNetkeibaRatings({ ...nextHorse, jockeyPower: undefined, stablePower: undefined });
      }
      return nextHorse;
    });
    updateHorses(updated);
  };

  const handlePostSharpRanking = () => {
    const ranking = [...horses]
      .sort((a, b) => (b.favoriteCount ?? 0) - (a.favoriteCount ?? 0) || (a.expertOdds ?? 999) - (b.expertOdds ?? 999))
      .slice(0, 5)
      .filter((horse) => (horse.favoriteCount ?? 0) > 0 || (horse.expertOdds ?? 999) < 999);

    if (ranking.length === 0) {
      window.alert("投稿できるガチ勢データがありません。");
      return;
    }

    const body = ranking
      .map((horse, index) => {
        const official = horse.realOdds && horse.realOdds > 0 ? `${horse.realOdds.toFixed(1)}倍` : "-";
        const expert = horse.expertOdds && horse.expertOdds > 0 ? `${horse.expertOdds.toFixed(1)}倍` : "-";
        return `#${index + 1} ${horse.name} 俺プロ${horse.favoriteCount ?? 0}人 / 公式${official} / ガチ勢${expert}`;
      })
      .join("\n");

    const text = [`${course.name} ガチ勢ランキング`, body, hashtag].join("\n\n");
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
  };

  const profiles = horses.map((horse) => ({
    horse,
    profile: getScenarioProfile(horse, course, condition),
  }));

  const abilityLeader = [...profiles].sort((a, b) => b.profile.abilityScore - a.profile.abilityScore)[0];
  const marketFavorite = [...horses].filter((horse) => (horse.realOdds ?? 0) > 0).sort((a, b) => (a.realOdds ?? 999) - (b.realOdds ?? 999))[0];
  const sharpFavorite = [...horses]
    .filter((horse) => (horse.favoriteCount ?? 0) > 0 || (horse.expertOdds ?? 999) < 999)
    .sort((a, b) => (a.expertOdds ?? 999) - (b.expertOdds ?? 999))[0];
  const divergenceLeader = [...horses]
    .filter((horse) => (horse.realOdds ?? 0) > 0 && (horse.expertOdds ?? 0) > 0)
    .sort(
      (a, b) =>
        Math.abs(calculateOfficialImpliedProbability(b.realOdds) - calculateOfficialImpliedProbability(b.expertOdds)) -
        Math.abs(calculateOfficialImpliedProbability(a.realOdds) - calculateOfficialImpliedProbability(a.expertOdds))
    )[0];

  return (
    <div className="rounded-[var(--r-md)] border border-line bg-card p-5 ">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="t-label">HORSE INPUT</p>
          <h2 className="text-lg font-bold text-ink">馬データ</h2>
          <p className="mt-1 text-xs text-ink-2">
            能力4値と適性5値を並べて、能力評価と市場評価のズレをその場で確認します。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handlePostSharpRanking}
            className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-2 text-xs font-medium text-ink-2 transition hover:bg-paper-sunk"
          >
            Xにガチ勢ランキング投稿
          </button>
          <button
            onClick={addHorse}
            className="inline-flex items-center gap-2 rounded-full bg-go px-3 py-2 text-xs font-semibold text-white transition hover:bg-go"
          >
            <Plus size={14} /> 馬を追加
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[var(--r-md)] bg-paper-sunk p-3">
          <p className="text-[11px] font-semibold tracking-wide text-ink-3">能力トップ</p>
          <p className="mt-1 text-sm font-bold text-ink">{abilityLeader?.horse.name ?? "-"}</p>
          <p className="mt-1 text-xs text-ink-2">能力指数 {abilityLeader?.profile.displayAbilityScore?.toFixed(1) ?? "-"}</p>
        </div>
        <div className="rounded-[var(--r-md)] bg-paper-sunk p-3">
          <p className="text-[11px] font-semibold tracking-wide text-ink-3">一般市場先頭</p>
          <p className="mt-1 text-sm font-bold text-ink">{marketFavorite?.name ?? "-"}</p>
          <p className="mt-1 text-xs text-ink-2">公式オッズ {marketFavorite?.realOdds?.toFixed(1) ?? "-"}倍</p>
        </div>
        <div className="rounded-[var(--r-md)] bg-paper-sunk p-3">
          <p className="text-[11px] font-semibold tracking-wide text-ink-3">ガチ勢市場先頭</p>
          <p className="mt-1 text-sm font-bold text-ink">{sharpFavorite?.name ?? "-"}</p>
          <p className="mt-1 text-xs text-ink-2">俺プロ {sharpFavorite?.favoriteCount ?? 0}人 / {sharpFavorite?.expertOdds?.toFixed(1) ?? "-"}倍</p>
        </div>
        <div className="rounded-[var(--r-md)] bg-paper-sunk p-3">
          <p className="text-[11px] font-semibold tracking-wide text-ink-3">市場乖離最大</p>
          <p className="mt-1 text-sm font-bold text-ink">{divergenceLeader?.name ?? "-"}</p>
          <p className="mt-1 text-xs text-ink-2">
            公式 {divergenceLeader?.realOdds?.toFixed(1) ?? "-"}倍 / ガチ勢 {divergenceLeader?.expertOdds?.toFixed(1) ?? "-"}倍
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1480px] w-full border-collapse text-xs">
          <thead>
            <tr className="border-y border-line bg-paper-sunk text-ink-2">
              <th className="px-2 py-2 text-center">馬番</th>
              <th className="px-2 py-2 text-left">馬名</th>
              <th className="px-2 py-2 text-left">騎手</th>
              <th className="px-2 py-2 text-center">脚質</th>
              <th className="px-2 py-2 text-center">SP</th>
              <th className="px-2 py-2 text-center">ST</th>
              <th className="px-2 py-2 text-center">PW</th>
              <th className="px-2 py-2 text-center">GU</th>
              {TRAIT_FIELDS.map((field) => (
                <th key={field.key} className="px-2 py-2 text-center" title={field.title}>
                  {field.label}
                </th>
              ))}
              {showTrainingColumn ? <th className="px-2 py-2 text-center">追切</th> : null}
              <th className="px-2 py-2 text-center">近走</th>
              <th className="px-2 py-2 text-right">能力指数</th>
              <th className="px-2 py-2 text-right">ガチ勢支持</th>
              <th className="px-2 py-2 text-right">一般支持</th>
              <th className="px-2 py-2 text-right">一般市場</th>
              <th className="px-2 py-2 text-right">ガチ勢市場</th>
              <th className="px-2 py-2 text-center">削除</th>
            </tr>
          </thead>
          <tbody>
            {horses.map((horse) => {
              const profile = getScenarioProfile(horse, course, condition);
              const frameNo = getFrameNumber(horse.gateNumber, horses.length);
              const frameColor = getFrameColor(frameNo);
              const officialImplied = calculateOfficialImpliedProbability(horse.realOdds);

              return (
                <tr key={horse.id} className="border-b border-line-soft align-top hover:bg-paper-sunk/70">
                  <td className="px-2 py-2 text-center">
                    <input
                      type="number"
                      min="1"
                      value={horse.gateNumber}
                      onChange={(event) => updateHorse(horse.id, "gateNumber", Number(event.target.value) || 1)}
                      className="w-10 rounded border px-1 py-1 text-center text-xs font-bold"
                      style={{
                        backgroundColor: frameColor.bg,
                        color: frameColor.text,
                        borderColor: frameColor.border,
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={horse.name}
                      onChange={(event) => updateHorse(horse.id, "name", event.target.value)}
                      className="w-full min-w-[120px] border-b border-transparent bg-transparent px-1 py-1 font-semibold text-ink outline-none focus:border-go"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={horse.jockey}
                      onChange={(event) => updateHorse(horse.id, "jockey", event.target.value)}
                      className="w-full min-w-[72px] border-b border-transparent bg-transparent px-1 py-1 text-ink-2 outline-none focus:border-go"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <select
                      value={horse.runningStyle}
                      onChange={(event) => {
                        const nextStyle = event.target.value as Horse["runningStyle"];
                        onRunningStyleChange?.();
                        updateHorses(
                          horses.map((current) =>
                            current.id === horse.id
                              ? { ...current, runningStyle: nextStyle, runningStyleSource: "saved_manual_override" }
                              : current
                          )
                        );
                        if (course?.id && !course.archived) {
                          void fetch("/api/horse-running-style", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ courseId: course.id, horseId: horse.id, runningStyle: nextStyle }),
                          })
                            .then(async (res) => {
                              const text = await res.text().catch(() => "");
                              if (!res.ok) {
                                console.warn("[HorseInput] failed to persist runningStyle", res.status, text);
                              }
                            })
                            .catch((err) => console.warn("[HorseInput] failed to persist runningStyle", err));
                        }
                      }}
                      className="rounded border border-line bg-card px-2 py-1"
                    >
                      <option value="Nige">逃げ</option>
                      <option value="Senko">先行</option>
                      <option value="Sashi">差し</option>
                      <option value="Oikomi">追込</option>
                    </select>
                    {(() => {
                      const badge =
                        RUNNING_STYLE_SOURCE_BADGES[horse.runningStyleSource ?? "unknown"] ??
                        RUNNING_STYLE_SOURCE_BADGES.unknown;
                      return (
                        <span
                          title={badge.help}
                          className={`mt-1 block cursor-help rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      );
                    })()}
                  </td>
                  {(["speed", "stamina", "power", "guts"] as const).map((field) => (
                    <td key={field} className="px-2 py-2 text-center">
                      <input
                        type="number"
                        value={horse[field]}
                        onChange={(event) => updateHorse(horse.id, field, Number(event.target.value) || 0)}
                        className="w-12 rounded border border-line px-1 py-1 text-center font-medium"
                      />
                    </td>
                  ))}
                  {TRAIT_FIELDS.map((field) => {
                    const value = profile.traitScores[
                      field.key === "pedigreeScore"
                        ? "pedigree"
                        : field.key === "courseFitScore"
                          ? "courseFit"
                          : field.key === "distanceFitScore"
                            ? "distanceFit"
                            : field.key === "groundFitScore"
                              ? "groundFit"
                              : "paceFit"
                    ];

                    return (
                      <td key={field.key} className="px-2 py-2 text-center">
                        <input
                          type="number"
                          min="40"
                          max="99"
                          value={value}
                          onChange={(event) => updateHorse(horse.id, field.key, Number(event.target.value) || 0)}
                          className={`w-12 rounded border border-line px-1 py-1 text-center font-semibold ${field.tone}`}
                          title={`${field.title}。未入力時は能力とコースから自動推定します。`}
                        />
                      </td>
                    );
                  })}
                  {showTrainingColumn ? (
                    <td className="px-2 py-2 text-center">
                      <input
                        type="number"
                        min="-5"
                        max="5"
                        step="0.5"
                        value={horse.trainingScore ?? 0}
                        onChange={(event) => updateHorse(horse.id, "trainingScore", Number(event.target.value) || 0)}
                        className="w-12 rounded border border-line px-1 py-1 text-center font-medium text-hit"
                      />
                    </td>
                  ) : null}
                  <td className="px-2 py-2 text-center">
                    <input
                      type="number"
                      min="-5"
                      max="5"
                      step="0.5"
                      value={horse.recentFormScore ?? 0}
                      onChange={(event) => updateHorse(horse.id, "recentFormScore", Number(event.target.value) || 0)}
                      className="w-12 rounded border border-line px-1 py-1 text-center font-medium text-info"
                    />
                  </td>
                  <td className="px-2 py-2 text-right font-semibold text-ink">{profile.displayAbilityScore.toFixed(1)}</td>
                  <td className="px-2 py-2 text-right">
                    <input
                      type="number"
                      min="0"
                      value={horse.favoriteCount ?? 0}
                      onChange={(event) => updateHorse(horse.id, "favoriteCount", Number(event.target.value) || 0)}
                      className="w-16 rounded border border-line px-1 py-1 text-right font-semibold text-ink"
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <input
                      type="number"
                      min="0"
                      value={horse.predictionCount}
                      onChange={(event) => updateHorse(horse.id, "predictionCount", Number(event.target.value) || 0)}
                      className="w-16 rounded border border-line bg-info-wash px-1 py-1 text-right font-semibold text-info"
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <div className="space-y-1">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={horse.realOdds ?? 0}
                        onChange={(event) => updateHorse(horse.id, "realOdds", Number(event.target.value) || 0)}
                        className="w-16 rounded border border-line px-1 py-1 text-right font-medium"
                      />
                      <p className="text-[10px] text-ink-3">{officialImplied > 0 ? `${round1(officialImplied)}%` : "-"}</p>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <div className="rounded-[var(--r-md)] bg-note-wash px-2 py-1 text-right text-note">
                      <p className="font-semibold">{horse.expertOdds?.toFixed(1) ?? "-"}</p>
                      <p className="text-[10px] text-note">俺プロ {(horse.favoriteCount ?? 0)}人</p>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => removeHorse(horse.id)}
                      className="rounded-full p-2 text-turf-ink-2 transition hover:bg-miss-wash hover:text-miss"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
