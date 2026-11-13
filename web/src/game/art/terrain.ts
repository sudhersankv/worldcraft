/** Paints the whole floating island (tops, cliff faces, water, paths, stairs, bridges, underside) onto one canvas. */
import { hash2 } from '../core/rng';
import { LH, TH, TW } from '../core/iso';
import type { Kit, Material } from '../world/kits';
import { N, type Layout } from '../world/layout';
import { INK, mix, poly, rgba, shade } from './paint';

export const TERRAIN_SCALE = 1.5;
export const WATER_H = -0.38;

export interface TerrainArt { canvas: HTMLCanvasElement; ox: number; oy: number; w: number; h: number }

export function paintTerrain(L: Layout, kit: Kit, seed: number): TerrainArt {
  const ox = N * (TW / 2) + 8;
  const oy = 3 * LH + 8;
  const w = N * TW + 16;
  const h = N * TH + oy + 8 * LH + 20;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * TERRAIN_SCALE); c.height = Math.ceil(h * TERRAIN_SCALE);
  const g = c.getContext('2d')!;
  g.scale(TERRAIN_SCALE, TERRAIN_SCALE);
  g.lineJoin = 'round';
  const P = (gx: number, gy: number, hh: number): [number, number] => [ox + (gx - gy) * (TW / 2), oy + (gx + gy) * (TH / 2) - hh * LH];
  const cells = L.cells;
  const isl = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && cells[y][x].island;
  const topH = (x: number, y: number) => { const cc = cells[y][x]; return cc.water ? WATER_H : cc.h; };
  const matOf = (m: number): Material => (m === -2 ? kit.path : m >= 0 ? kit.zoneMats[m % kit.zoneMats.length] : kit.ground);

  // soft shadow of the island far below (gives "floating" read)
  g.save();
  g.fillStyle = 'rgba(20,10,40,0.10)';
  g.beginPath(); g.ellipse(ox, oy + N * TH * 0.5 + 9 * LH, N * TW * 0.42, N * TH * 0.36, 0, 0, Math.PI * 2); g.fill();
  g.restore();

  const face = (x0: number, y0: number, x1: number, y1: number, hTop: number, hBot: number, left: boolean, isUnder: boolean, cx: number, cy: number) => {
    const a = P(x0, y0, hTop), b = P(x1, y1, hTop), b2 = P(x1, y1, hBot), a2 = P(x0, y0, hBot);
    const base = isUnder ? kit.cliff.strata[0] : left ? kit.cliff.left : kit.cliff.right;
    const col = left ? base : shade(base, isUnder ? -0.22 : -0.04);
    poly(g, [a[0], a[1], b[0], b[1], b2[0], b2[1], a2[0], a2[1]], col, false);
    // strata bands
    const bands = isUnder ? kit.cliff.strata : [shade(base, -0.12)];
    let hh = Math.min(hTop, 0) - (isUnder ? 0.55 : 0);
    let k = 0;
    if (!isUnder && hTop - hBot >= 0.5) {
      // grass lip shadow line on cliffs
      const l1 = P(x0, y0, hTop - 0.18), l2 = P(x1, y1, hTop - 0.18);
      g.strokeStyle = rgba('#000000', 0.12); g.lineWidth = 2; g.beginPath(); g.moveTo(l1[0], l1[1]); g.lineTo(l2[0], l2[1]); g.stroke();
    }
    while (isUnder && hh > hBot) {
      const nh = Math.max(hBot, hh - (0.7 + hash2(cx + k, cy, seed) * 0.6));
      const p1 = P(x0, y0, hh), p2 = P(x1, y1, hh), p3 = P(x1, y1, nh), p4 = P(x0, y0, nh);
      const bc = bands[k % bands.length];
      poly(g, [p1[0], p1[1], p2[0], p2[1], p3[0], p3[1], p4[0], p4[1]], left ? bc : shade(bc, -0.25), false);
      hh = nh; k++;
    }
    if (isUnder) {
      // darken toward bottom
      const gr = g.createLinearGradient(0, a[1], 0, a2[1]);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, rgba(kit.cliff.under, 0.85));
      poly(g, [a[0], a[1], b[0], b[1], b2[0], b2[1], a2[0], a2[1]], gr, false);
      // pebbles
      if (hash2(cx, cy, seed + 77) < 0.5) { const m = P((x0 + x1) / 2, (y0 + y1) / 2, hTop - 1.2); g.fillStyle = shade(kit.cliff.strata[1], 0.15); g.beginPath(); g.ellipse(m[0], m[1], 3, 2, 0, 0, 7); g.fill(); }
    }
    // outline
    g.strokeStyle = INK; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(a2[0], a2[1]); g.lineTo(b2[0], b2[1]); g.stroke();
    g.lineWidth = 1.1; g.strokeStyle = rgba(INK, 0.55);
    g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(b2[0], b2[1]); g.stroke();
  };

  const order: [number, number][] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) order.push([x, y]);
  order.sort((p, q) => p[0] + p[1] - (q[0] + q[1]) || p[0] - q[0]);

  for (const [x, y] of order) {
    const cc = cells[y][x];
    if (!cc.island) continue;
    const ht = topH(x, y);
    // faces: left (towards +y) and right (towards +x)
    const nL = isl(x, y + 1) ? topH(x, y + 1) : -cc.drop;
    const nR = isl(x + 1, y) ? topH(x + 1, y) : -cc.drop;
    const under = (n: boolean) => !n;
    if (nL < ht) face(x, y + 1, x + 1, y + 1, ht, nL, true, under(isl(x, y + 1)), x, y);
    if (nR < ht) face(x + 1, y + 1, x + 1, y, ht, nR, false, under(isl(x + 1, y)), x, y);
    if (!isl(x, y + 1) || !isl(x + 1, y)) {
      // drip roots / stalactite for underside
      if (hash2(x, y, seed + 99) < 0.3) {
        const m = !isl(x, y + 1) ? P(x + 0.5, y + 1, -cc.drop) : P(x + 1, y + 0.5, -cc.drop);
        const len = 6 + hash2(x, y, seed + 98) * 14;
        poly(g, [m[0] - 5, m[1] - 1, m[0] + 5, m[1] - 1, m[0], m[1] + len], shade(kit.cliff.under, 0.1), true, 1.2);
      }
    }
    // top
    const t = P(x, y, ht), r = P(x + 1, y, ht), b = P(x + 1, y + 1, ht), l = P(x, y + 1, ht);
    const pts = [t[0], t[1], r[0], r[1], b[0], b[1], l[0], l[1]];
    if (cc.water || cc.bridge) {
      const wt = P(x, y, WATER_H), wr = P(x + 1, y, WATER_H), wb = P(x + 1, y + 1, WATER_H), wl = P(x, y + 1, WATER_H);
      const shoreN = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isl(x + dx, y + dy) && !cells[y + dy][x + dx].water && !cells[y + dy][x + dx].bridge);
      const wc = shoreN ? mix(kit.water.shallow, kit.water.deep, 0.25) : mix(kit.water.deep, kit.water.shallow, hash2(x, y, seed) * 0.25);
      poly(g, [wt[0], wt[1], wr[0], wr[1], wb[0], wb[1], wl[0], wl[1]], wc, false);
      if (hash2(x, y, seed + 7) < 0.35) {
        const m = P(x + 0.5, y + 0.5, WATER_H);
        g.strokeStyle = rgba(kit.water.foam, 0.55); g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(m[0] - 7, m[1]); g.quadraticCurveTo(m[0] - 2, m[1] - 3, m[0] + 4, m[1]); g.stroke();
      }
      // foam where water meets land behind
      for (const [dx, dy, a1, a2] of [[-1, 0, 0, 3], [0, -1, 0, 1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (isl(nx, ny) && !cells[ny][nx].water && !cells[ny][nx].bridge) {
          const ptsW = [wt, wr, wb, wl];
          const p1 = ptsW[a1], p2 = ptsW[a2];
          g.strokeStyle = rgba(kit.water.foam, 0.8); g.lineWidth = 2;
          g.beginPath(); g.moveTo(p1[0], p1[1] + 1); g.lineTo(p2[0], p2[1] + 1); g.stroke();
        }
      }
      if (cc.bridge) {
        // plank deck at h=0
        poly(g, pts, cc.gate ? shade(kit.bridge, -0.1) : kit.bridge, false);
        g.strokeStyle = rgba(INK, 0.35); g.lineWidth = 1;
        const along = isl(x + 1, y) && (cells[y][x + 1].bridge || cells[y][x + 1].path) && isl(x - 1, y) && (cells[y][x - 1].bridge || cells[y][x - 1].path);
        for (let i = 1; i < 5; i++) {
          const f = i / 5;
          const p1 = along ? P(x + f, y, 0) : P(x, y + f, 0), p2 = along ? P(x + f, y + 1, 0) : P(x + 1, y + f, 0);
          g.beginPath(); g.moveTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.stroke();
        }
        // deck side
        const d1 = P(x, y + 1, 0), d2 = P(x + 1, y + 1, 0), d3 = P(x + 1, y, 0);
        poly(g, [d1[0], d1[1], d2[0], d2[1], d2[0], d2[1] + 5, d1[0], d1[1] + 5], shade(kit.bridge, -0.2), true, 1.2);
        poly(g, [d2[0], d2[1], d3[0], d3[1], d3[0], d3[1] + 5, d2[0], d2[1] + 5], shade(kit.bridge, -0.35), true, 1.2);
      }
      continue;
    }
    const mat = matOf(cc.mat);
    const v = hash2(x, y, seed + 1);
    // checker-ish soft variation for readability of the grid without hard lines
    const base = v < 0.5 ? mat.top : mat.top2;
    const gr = g.createLinearGradient(t[0], t[1], b[0], b[1]);
    gr.addColorStop(0, shade(base, 0.06)); gr.addColorStop(1, shade(base, -0.04));
    poly(g, pts, gr, false);
    g.strokeStyle = rgba(INK, 0.04); g.lineWidth = 1; g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(t[0], t[1]); g.lineTo(r[0], r[1]); g.stroke();
    if (cc.stairs) {
      // steps
      g.strokeStyle = rgba(INK, 0.45); g.lineWidth = 1.3;
      for (let i = 1; i < 4; i++) {
        const f = i / 4; const p1 = P(x + f, y, ht), p2 = P(x + f, y + 1, ht);
        g.beginPath(); g.moveTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.stroke();
        const p3 = P(x, y + f, ht), p4 = P(x + 1, y + f, ht);
        g.strokeStyle = rgba(INK, 0.18); g.beginPath(); g.moveTo(p3[0], p3[1]); g.lineTo(p4[0], p4[1]); g.stroke(); g.strokeStyle = rgba(INK, 0.45);
      }
    }
    // ambient occlusion from taller cells behind
    for (const [dx, dy, edge] of [[-1, 0, 'l'], [0, -1, 'r']] as const) {
      const nx = x + dx, ny = y + dy;
      if (isl(nx, ny) && topH(nx, ny) > ht + 0.2) {
        const e1 = edge === 'l' ? l : r;
        const mid = P(x + 0.5, y + 0.5, ht);
        const ag = g.createLinearGradient(t[0], t[1], mid[0], mid[1]);
        ag.addColorStop(0, 'rgba(20,10,40,0.28)'); ag.addColorStop(1, 'rgba(20,10,40,0)');
        poly(g, [t[0], t[1], e1[0], e1[1], mid[0], mid[1]], ag, false);
      }
    }
    // specks / tufts / pebbles
    const n = cc.mat === -2 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const fx = 0.2 + hash2(x * 7 + i, y, seed + 2) * 0.6, fy = 0.2 + hash2(x, y * 7 + i, seed + 3) * 0.6;
      const m = P(x + fx, y + fy, ht);
      if (cc.mat === -2) {
        g.fillStyle = shade(mat.top, -0.12); g.beginPath(); g.ellipse(m[0], m[1], 2.6, 1.5, 0, 0, 7); g.fill();
        g.fillStyle = mat.speck; g.beginPath(); g.ellipse(m[0] - 0.6, m[1] - 0.6, 1.4, 0.8, 0, 0, 7); g.fill();
      } else if (hash2(x + i, y, seed + 4) < 0.55) {
        g.strokeStyle = shade(mat.top, -0.22); g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(m[0] - 2, m[1]); g.lineTo(m[0] - 1, m[1] - 3); g.moveTo(m[0] + 1, m[1]); g.lineTo(m[0] + 2, m[1] - 3.5); g.stroke();
      } else if (hash2(x + i, y, seed + 5) < 0.4) {
        g.fillStyle = mat.speck; g.beginPath(); g.arc(m[0], m[1], 1.3, 0, 7); g.fill();
      }
    }
    // path edge softening: dark rim where path meets grass
    // island top-edge lip highlight (light from top-left)
    if (!isl(x, y - 1)) { g.strokeStyle = rgba('#ffffff', 0.35); g.lineWidth = 1.5; g.beginPath(); g.moveTo(t[0], t[1]); g.lineTo(r[0], r[1]); g.stroke(); }
    if (!isl(x - 1, y)) { g.strokeStyle = rgba('#ffffff', 0.35); g.lineWidth = 1.5; g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(t[0], t[1]); g.stroke(); }
    // ink lip where the cell drops
    g.strokeStyle = INK; g.lineWidth = 1.6;
    if (nL < ht - 0.01) { g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    if (nR < ht - 0.01) { g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(r[0], r[1]); g.stroke(); }
    const nB = isl(x, y - 1) ? topH(x, y - 1) : -9, nA = isl(x - 1, y) ? topH(x - 1, y) : -9;
    if (nB < ht - 0.01) { g.lineWidth = nB < -5 ? 1.6 : 1.1; g.beginPath(); g.moveTo(t[0], t[1]); g.lineTo(r[0], r[1]); g.stroke(); }
    if (nA < ht - 0.01) { g.lineWidth = nA < -5 ? 1.6 : 1.1; g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(t[0], t[1]); g.stroke(); }
  }
  return { canvas: c, ox, oy, w, h };
}
