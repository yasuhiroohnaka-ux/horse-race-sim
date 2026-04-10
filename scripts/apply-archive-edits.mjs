/**
 * Script to apply pick visibility panel changes to the archive page.
 * This replaces renderHonmeiComparison with the richer renderPickVisibilityPanel
 * and adds pickExplanations integration.
 */
import { readFileSync, writeFileSync } from "fs";

const filePath = "app/archive/page.tsx";
let content = readFileSync(filePath, "utf8");

// 1. Add pickExplanations import after the types import
const typesImport = `import type { PredictionSnapshot, RaceCommentaryPayload } from "@/lib/types";`;
const newImport = `import type { PredictionSnapshot, RaceCommentaryPayload } from "@/lib/types";
import {
  buildPickExplanations,
  formatOverbetLabel,
  type AgreementStatus,
  type PickExplanationEntry,
} from "@/lib/pickExplanations";`;
content = content.replace(typesImport, newImport);

// 2. Extend RecommendationSettlement type with scoring fields
const oldSettlementType = `type RecommendationSettlement = {\r\n  horseId: string;\r\n  horseName: string;\r\n  postedAt: string | null;\r\n  settlementStatus: SettlementStatus;\r\n  tanOutcome: BetOutcome;\r\n  fukuOutcome: BetOutcome;\r\n  tanPayout: number;\r\n  fukuPayout: number;\r\n  tanPayoutSource: PayoutSource;\r\n  fukuPayoutSource: PayoutSource;\r\n};`;
const newSettlementType = `type RecommendationSettlement = {\r\n  horseId: string;\r\n  horseName: string;\r\n  postedAt: string | null;\r\n  settlementStatus: SettlementStatus;\r\n  tanOutcome: BetOutcome;\r\n  fukuOutcome: BetOutcome;\r\n  tanPayout: number;\r\n  fukuPayout: number;\r\n  tanPayoutSource: PayoutSource;\r\n  fukuPayoutSource: PayoutSource;\r\n  realOdds: number;\r\n  placeOdds: number;\r\n  winProb: number;\r\n  placeProb: number;\r\n  placeScore: number;\r\n  valueScore: number;\r\n  selectionReason: string | null;\r\n  scoreGap: number;\r\n  runnerUpHorseId: string | null;\r\n  runnerUpHorseName: string | null;\r\n  runnerUpPlaceScore: number;\r\n  runnerUpPlaceProb: number;\r\n  overbetLabel: string | null;\r\n};`;
content = content.replace(oldSettlementType, newSettlementType);

// 3. Replace renderHonmeiComparison with renderPickVisibilityPanel + helpers
const oldHonmeiStart = `function renderHonmeiComparison(`;
const oldHonmeiEnd = `function renderSnapshotComparison(`;
const startIdx = content.indexOf(oldHonmeiStart);
const endIdx = content.indexOf(oldHonmeiEnd);

if (startIdx >= 0 && endIdx >= 0) {
  const newBlock = `function formatScore(value) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "-";
}

function formatPercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return \`\${normalized.toFixed(0)}%\`;
}

function buildMetricChips(entry, kind = "win") {
  if (!entry) return [];
  const chips = [
    \`placeScore \${formatScore(entry.placeScore)}\`,
    \`valueScore \${formatScore(entry.valueScore)}\`,
    \`scoreGap \${formatScore(entry.scoreGap)}\`,
    \`placeProb \${formatPercent(entry.placeProb)}\`,
  ];
  const overbet = formatOverbetLabel(entry.overbetLabel);
  if (overbet) chips.push(overbet);
  return chips;
}

function buildArchiveSimEntry(snapshot, horseId) {
  if (!snapshot || !horseId) return null;
  const row = snapshot.rankedRows.find((r) => r.horseId === horseId);
  if (!row) return null;

  const winProb = row.winProb;
  const officialImplied = row.realOdds && row.realOdds > 0 ? Math.min(1 / row.realOdds, 0.7) : 0;
  const placeProb = Math.min(winProb * 0.95 + officialImplied * 0.35 + 0.15, 0.88);
  const top3Stability = Math.min(placeProb * 0.45 + (placeProb - winProb) * 0.75, 1);
  const marketSupport = Math.min(officialImplied * 2.25, 1);
  const overbetRisk = Math.max((officialImplied - winProb) * 2.4, 0);
  const placeScore = Math.max(0.55 * placeProb + 0.2 * top3Stability + 0.15 * marketSupport - 0.1 * overbetRisk, 0);

  return {
    horseId: row.horseId,
    horseName: row.horseName,
    winProb,
    placeProb,
    placeScore,
    top3Stability,
    marketSupport,
    overbetRisk,
    signalReason: snapshot.signalReasons?.[horseId]?.signalReason ?? null,
    majorContributors: row.majorContributors.map((c) => ({ label: c.label, value: c.value })),
  };
}

function buildArchiveRecommendationEntry(entry) {
  if (!entry) return null;
  return {
    horseId: entry.horseId,
    horseName: entry.horseName,
    winProb: entry.winProb,
    placeProb: entry.placeProb,
    placeScore: entry.placeScore,
    valueScore: entry.valueScore,
    scoreGap: entry.scoreGap,
    overbetLabel: entry.overbetLabel,
    selectionReason: entry.selectionReason,
  };
}

function renderPickVisibilityPanel(
  race: ReviewCard,
  snapshot?: PredictionSnapshot,
  settlement?: RecommendationSettlementBundle | null
) {
  const snapshotHorseId = snapshot?.honmeiHorseId ?? null;
  const routineHorseId = settlement?.win?.horseId ?? null;
  const valueHorse = settlement?.value ?? null;
  if (!snapshotHorseId && !routineHorseId && !valueHorse) return null;

  const agreementStatus: AgreementStatus =
    snapshotHorseId && routineHorseId
      ? snapshotHorseId === routineHorseId
        ? "agree"
        : "disagree"
      : "unknown";
  const agreementLabel =
    agreementStatus === "agree" ? "一致" : agreementStatus === "disagree" ? "不一致" : "片方のみ";
  const simEntry = buildArchiveSimEntry(snapshot, snapshotHorseId);
  const winEntry = buildArchiveRecommendationEntry(settlement?.win);
  const valueEntry = buildArchiveRecommendationEntry(valueHorse);
  const explanations = buildPickExplanations({ agreementStatus, simEntry, winEntry, valueEntry });

  return (
    <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
      <p className="text-sm font-bold text-violet-800">本命の可視化</p>
      <p className="mt-2 text-xs leading-5 text-violet-700">
        シミュ本命、単複本命、妙味候補を同じ場所に並べて、一致 / 不一致と選出理由を確認できます。
      </p>

      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-violet-700">
        <span className="rounded-full bg-sky-100 px-3 py-1">
          シミュ本命 {getSnapshotHorseDisplay(snapshot, snapshotHorseId)}
        </span>
        <span className="rounded-full bg-amber-100 px-3 py-1">
          単複本命 {settlement?.win ? \`\${settlement.win.horseName} (\${settlement.win.horseId})\` : "データなし"}
        </span>
        <span className="rounded-full bg-emerald-100 px-3 py-1">
          妙味候補 {valueHorse ? \`\${valueHorse.horseName} (\${valueHorse.horseId})\` : "該当なし"}
        </span>
        <span
          className={\`rounded-full px-3 py-1 \${
            agreementStatus === "agree"
              ? "bg-green-100 text-green-800"
              : agreementStatus === "disagree"
                ? "bg-red-100 text-red-800"
                : "bg-gray-100 text-gray-600"
          }\`}
        >
          一致判定 {agreementLabel}
        </span>
      </div>

      <p className="mt-2 text-xs leading-5 text-slate-600">{explanations.agreement}</p>
      {explanations.disagreement ? (
        <p className="mt-2 rounded-md border border-amber-200 bg-white/80 px-3 py-2 text-xs leading-5 text-amber-900">
          不一致理由: {explanations.disagreement}
        </p>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2">
          <p className="text-[11px] font-semibold text-sky-800">シミュ本命</p>
          <p className="mt-1 text-xs font-semibold text-slate-700">
            {snapshotHorseId ? getHorseNameFromSnapshot(snapshot, snapshotHorseId) || snapshotHorseId : "データなし"}
          </p>
          <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-slate-500">
            <span className="rounded-full bg-white/80 px-2 py-0.5">winProb {formatPercent(simEntry?.winProb)}</span>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-slate-600">{explanations.simHonmei}</p>
          <p className="mt-2 text-[11px] text-slate-500">結果: {getSnapshotFinishLabel(race, snapshotHorseId)}</p>
        </div>

        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-[11px] font-semibold text-amber-800">単複本命</p>
          <p className="mt-1 text-xs font-semibold text-slate-700">{settlement?.win?.horseName ?? "単複 recommendation なし"}</p>
          <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-slate-500">
            {buildMetricChips(settlement?.win ?? null).map((chip) => (
              <span key={chip} className="rounded-full bg-white/80 px-2 py-0.5">
                {chip}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-5 text-slate-600">{explanations.tanpukuHonmei}</p>
          <p className="mt-2 text-[11px] text-slate-500">結果: {getRecommendationFinishLabel(settlement?.win ?? null)}</p>
          {settlement?.win?.selectionReason ? (
            <p className="mt-1 text-[11px] text-slate-500">selectionReason: {settlement.win.selectionReason}</p>
          ) : null}
        </div>

        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="text-[11px] font-semibold text-emerald-800">妙味候補</p>
          <p className="mt-1 text-xs font-semibold text-slate-700">{valueHorse?.horseName ?? "該当なし"}</p>
          <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-slate-500">
            {valueHorse ? (
              buildMetricChips(valueHorse, "value").map((chip) => (
                <span key={chip} className="rounded-full bg-white/80 px-2 py-0.5">
                  {chip}
                </span>
              ))
            ) : (
              <span className="rounded-full bg-white/80 px-2 py-0.5">quality gate 未通過</span>
            )}
          </div>
          <p className="mt-2 text-[11px] leading-5 text-slate-600">{explanations.valueCandidate}</p>
          {valueHorse ? (
            <p className="mt-2 text-[11px] text-slate-500">結果: {getRecommendationFinishLabel(valueHorse)}</p>
          ) : null}
          {valueHorse?.selectionReason ? (
            <p className="mt-1 text-[11px] text-slate-500">selectionReason: {valueHorse.selectionReason}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

`;
  content = content.substring(0, startIdx) + newBlock + content.substring(endIdx);
}

// 4. Replace renderHonmeiComparison call with renderPickVisibilityPanel
content = content.replace(
  `{renderHonmeiComparison(race, snapshot, settlement)}`,
  `{renderPickVisibilityPanel(race, snapshot, settlement)}`
);

writeFileSync(filePath, content, "utf8");
console.log("OK: archive page updated successfully");
console.log("Lines:", content.split("\n").length);
