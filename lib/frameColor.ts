export type FrameColor = {
  bg: string;
  text: string;
  border: string;
};

// 色の実体は app/globals.css の --waku-1〜8 に一本化してある。
// 枠色はこのアプリの識別色そのものなので、値を二重に持たない。
export const FRAME_COLORS: Record<number, FrameColor> = {
  1: { bg: "var(--waku-1)", text: "#191919", border: "var(--line)" }, // 白
  2: { bg: "var(--waku-2)", text: "#ffffff", border: "var(--waku-2)" }, // 黒
  3: { bg: "var(--waku-3)", text: "#ffffff", border: "var(--waku-3)" }, // 赤
  4: { bg: "var(--waku-4)", text: "#ffffff", border: "var(--waku-4)" }, // 青
  5: { bg: "var(--waku-5)", text: "#2a2200", border: "var(--waku-5)" }, // 黄
  6: { bg: "var(--waku-6)", text: "#ffffff", border: "var(--waku-6)" }, // 緑
  7: { bg: "var(--waku-7)", text: "#ffffff", border: "var(--waku-7)" }, // 橙
  8: { bg: "var(--waku-8)", text: "#46101f", border: "var(--waku-8)" }, // 桃
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

