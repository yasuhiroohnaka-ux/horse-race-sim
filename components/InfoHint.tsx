"use client";

import { CircleHelp } from "lucide-react";

interface InfoHintProps {
  content: string;
  label?: string;
  className?: string;
}

export function InfoHint({
  content,
  label = "指標の説明",
  className = "",
}: InfoHintProps) {
  return (
    <button
      type="button"
      title={content}
      aria-label={`${label}: ${content}`}
      className={`inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-300 bg-white text-slate-400 transition hover:border-slate-400 hover:text-slate-600 ${className}`}
    >
      <CircleHelp size={11} />
    </button>
  );
}
