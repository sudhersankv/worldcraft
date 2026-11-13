/** Isometric 2:1 projection. Grid coords (gx, gy) are continuous; cell (x,y) spans [x,x+1)x[y,y+1). */
export const TW = 64;   // ground diamond width
export const TH = 32;   // ground diamond height
export const LH = 18;   // pixels per height level
/** Supersampling factor for procedurally drawn textures (drawn at ART, displayed at 1/ART). */
export const ART = 2;

export function isoX(gx: number, gy: number): number { return (gx - gy) * (TW / 2); }
export function isoY(gx: number, gy: number, h = 0): number { return (gx + gy) * (TH / 2) - h * LH; }
/** Inverse projection on the h=0 plane. */
export function screenToGrid(sx: number, sy: number): { gx: number; gy: number } {
  const a = sx / (TW / 2), b = sy / (TH / 2);
  return { gx: (a + b) / 2, gy: (b - a) / 2 };
}
/** Depth key for anything standing on the ground at (gx, gy). */
export function depthOf(gx: number, gy: number): number { return (gx + gy) * 16; }
