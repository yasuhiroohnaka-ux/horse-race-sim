import type { RaceTrendHeuristicHint, RaceTrendNote, RaceTrendRow } from "@/lib/types";

interface RaceTrendNotesPanelProps {
  notes: RaceTrendNote[];
  heuristicHints?: RaceTrendHeuristicHint[];
}

const CATEGORY_LABELS: Record<RaceTrendNote["category"], string> = {
  previousRace: "前走レース",
  cornerPosition: "前走4角",
  classicRelation: "クラシック連動",
  longshot: "人気薄",
};

function getExtraKeys(rows: RaceTrendRow[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row.extra ?? {})) {
      keys.add(key);
    }
  }
  return [...keys];
}

function TrendRowsTable({ rows }: { rows: RaceTrendRow[] }) {
  const hasRecordStats = rows.some((row) => row.record || row.winRate || row.quinellaRate || row.showRate);
  const extraKeys = getExtraKeys(rows);

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-[760px] w-full border-collapse text-xs">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">項目</th>
            {hasRecordStats && (
              <>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">着別度数</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">勝率</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">連対率</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">複勝率</th>
              </>
            )}
            {extraKeys.map((key) => (
              <th key={key} className="whitespace-nowrap px-3 py-2 text-left font-semibold">
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-slate-100 align-top">
              <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-800">{row.label}</td>
              {hasRecordStats && (
                <>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{row.record ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">{row.winRate ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">{row.quinellaRate ?? "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">{row.showRate ?? "-"}</td>
                </>
              )}
              {extraKeys.map((key) => (
                <td key={key} className="max-w-[320px] px-3 py-2 leading-5 text-slate-700">
                  {row.extra?.[key] ?? "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RaceTrendNotesPanel({ notes, heuristicHints = [] }: RaceTrendNotesPanelProps) {
  if (notes.length === 0) return null;

  return (
    <details className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4" open>
      <summary className="cursor-pointer select-none text-sm font-bold text-emerald-950">
        オークス傾向メモ
      </summary>

      <p className="mt-2 text-xs leading-5 text-emerald-900">
        スクショ由来の根拠メモです。印や買い目へ直接反映せず、前走・位置取り・距離延長の確認材料として表示します。
      </p>

      {heuristicHints.length > 0 && (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {heuristicHints.map((hint) => (
            <div key={hint.id} className="rounded-md border border-emerald-200 bg-white px-3 py-2">
              <p className="text-[11px] font-bold text-emerald-700">{hint.label}</p>
              <p className="mt-1 text-xs leading-5 text-slate-700">{hint.description}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3">
        {notes.map((note) => (
          <article key={note.id} className="rounded-lg border border-emerald-100 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">
                {CATEGORY_LABELS[note.category]}
              </span>
              {note.sourceLabel ? (
                <span className="text-[11px] font-medium text-slate-400">{note.sourceLabel}</span>
              ) : null}
            </div>
            <h3 className="mt-2 text-base font-bold text-slate-950">{note.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">{note.summary}</p>
            <div className="mt-3 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-950">
              <span className="font-bold">ポイント:</span> {note.point}
            </div>

            {note.rows?.length ? <TrendRowsTable rows={note.rows} /> : null}

            {note.cautions?.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-600">
                {note.cautions.map((caution) => (
                  <li key={caution}>{caution}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </details>
  );
}
