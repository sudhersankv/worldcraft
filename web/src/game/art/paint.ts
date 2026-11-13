/** Canvas painting toolkit: one cohesive "toy diorama" style. Light from top-left; ink outlines; flat-ish shading. */
import { ART } from '../core/iso';

export const INK = '#1f1633';
export const INK_W = 1.7;

export type Ctx = CanvasRenderingContext2D;

export function canvas(w: number, h: number, scale = ART): { c: HTMLCanvasElement; g: Ctx } {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * scale); c.height = Math.ceil(h * scale);
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  g.lineJoin = 'round'; g.lineCap = 'round';
  return { c, g };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}
export function rgba(hex: string, a: number): string { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
export function hexNum(hex: string): number { const [r, g, b] = hexToRgb(hex); return (r << 16) | (g << 8) | b; }

export function stroke(g: Ctx, w = INK_W, color = INK) { g.lineWidth = w; g.strokeStyle = color; g.stroke(); }

/** Shaded ellipse "ball" (foliage, heads, bodies). */
export function ball(g: Ctx, x: number, y: number, rx: number, ry: number, color: string, outline = true) {
  const grad = g.createRadialGradient(x - rx * 0.4, y - ry * 0.45, Math.min(rx, ry) * 0.1, x, y, Math.max(rx, ry) * 1.1);
  grad.addColorStop(0, shade(color, 0.32));
  grad.addColorStop(0.55, color);
  grad.addColorStop(1, shade(color, -0.28));
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fillStyle = grad; g.fill();
  if (outline) stroke(g);
}
export function ellipse(g: Ctx, x: number, y: number, rx: number, ry: number, fill: string, outline = false, rot = 0) {
  g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); if (outline) stroke(g);
}
export function poly(g: Ctx, pts: number[], fill: string | CanvasGradient, outline = true, w = INK_W) {
  g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath(); g.fillStyle = fill; g.fill(); if (outline) stroke(g, w);
}
export function rrect(g: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient, outline = true) {
  g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); if (outline) stroke(g);
}
export function hgrad(g: Ctx, x0: number, x1: number, color: string, k = 0.22) {
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  gr.addColorStop(0, shade(color, k)); gr.addColorStop(0.5, color); gr.addColorStop(1, shade(color, -k)); return gr;
}

/** Iso prism standing on base point (cx, by) — footprint half-width hw (screen), height h. */
export function box(g: Ctx, cx: number, by: number, hw: number, h: number, color: string, top?: string) {
  const hh = hw / 2;
  // left face
  poly(g, [cx - hw, by - hh - h, cx, by - h, cx, by, cx - hw, by - hh], shade(color, 0.02));
  // right face
  poly(g, [cx, by - h, cx + hw, by - hh - h, cx + hw, by - hh, cx, by], shade(color, -0.25));
  // top
  poly(g, [cx, by - h - hw, cx + hw, by - hh - h, cx, by - h, cx - hw, by - hh - h], top ?? shade(color, 0.25));
}
/** Upright cylinder on base point. */
export function cyl(g: Ctx, cx: number, by: number, rx: number, h: number, color: string, top?: string) {
  const ry = rx * 0.5;
  g.beginPath();
  g.moveTo(cx - rx, by - h); g.lineTo(cx - rx, by); g.ellipse(cx, by, rx, ry, 0, Math.PI, 0, true); g.lineTo(cx + rx, by - h); g.closePath();
  g.fillStyle = hgrad(g, cx - rx, cx + rx, color, 0.25); g.fill(); stroke(g);
  ellipse(g, cx, by - h, rx, ry, top ?? shade(color, 0.3), true);
}
export function cone(g: Ctx, cx: number, by: number, rx: number, h: number, color: string) {
  const ry = rx * 0.5;
  g.beginPath(); g.moveTo(cx, by - h); g.lineTo(cx + rx, by); g.ellipse(cx, by, rx, ry, 0, 0, Math.PI); g.closePath();
  g.fillStyle = hgrad(g, cx - rx, cx + rx, color, 0.28); g.fill(); stroke(g);
}
export function line(g: Ctx, pts: number[], color = INK, w = INK_W) {
  g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.strokeStyle = color; g.lineWidth = w; g.stroke();
}
export function glow(g: Ctx, x: number, y: number, r: number, color: string, a = 0.7) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(color, a)); gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
export function star(g: Ctx, x: number, y: number, r: number, fill: string, points = 5, inner = 0.5, outline = true) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points, rr = i % 2 ? r * inner : r;
    i ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath(); g.fillStyle = fill; g.fill(); if (outline) stroke(g, 1.2);
}
