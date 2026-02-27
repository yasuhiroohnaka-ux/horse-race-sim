export type FrameColor = {
  bg: string;
  text: string;
  border: string;
};

export const FRAME_COLORS: Record<number, FrameColor> = {
  1: { bg: "#ffffff", text: "#111827", border: "#cbd5e1" }, // white
  2: { bg: "#111827", text: "#ffffff", border: "#111827" }, // black
  3: { bg: "#ef4444", text: "#ffffff", border: "#ef4444" }, // red
  4: { bg: "#3b82f6", text: "#ffffff", border: "#3b82f6" }, // blue
  5: { bg: "#eab308", text: "#111827", border: "#ca8a04" }, // yellow
  6: { bg: "#22c55e", text: "#ffffff", border: "#16a34a" }, // green
  7: { bg: "#f97316", text: "#ffffff", border: "#ea580c" }, // orange
  8: { bg: "#f472b6", text: "#ffffff", border: "#ec4899" }, // pink
};

export function getFrameNumber(gateNumber: number | undefined, fieldSize: number): number {
  const n = Math.max(1, Number(fieldSize) || 1);
  const g = Math.max(1, Number(gateNumber) || 1);
  const frames = Math.min(8, n);
  const basePerFrame = Math.floor(n / frames);
  const extraFrames = n % frames;

  let covered = 0;
  for (let frame = 1; frame <= frames; frame++) {
    const frameSize = basePerFrame + (frame <= extraFrames ? 1 : 0);
    covered += frameSize;
    if (g <= covered) return frame;
  }
  return frames;
}

export function getFrameColor(frameNumber: number): FrameColor {
  return FRAME_COLORS[frameNumber] ?? FRAME_COLORS[1];
}

