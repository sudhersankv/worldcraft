/**
 * Procedural, seeded island assembly. Same seed -> same map. Always solvable:
 * a BFS check from spawn verifies every interactable is reachable (gate open) and carves if not.
 */
import type { WorldSpec, Zone } from '../../shared/contracts';
import { Rng, fbm, hash2 } from '../core/rng';
import type { Kit } from './kits';

export const N = 46;

export interface Cell {
  island: boolean; h: number; water: boolean; path: boolean; bridge: boolean; gate: boolean; stairs: boolean;
  mat: number;            // -1 = kit ground, -2 = path, >=0 zoneMats index
  zone: string | null; blocked: boolean; occupied: boolean; edge: boolean; drop: number;
}

export interface ZonePlace {
  zone: Zone; cx: number; cy: number; mat: number; r: number;
  landmark: { x: number; y: number }; npc?: { x: number; y: number; id: string }; station?: { x: number; y: number };
}

export interface Placed { kind: 'prop' | 'collectible' | 'discovery'; key: string; x: number; y: number; id?: string; zoneId?: string; text?: string; blocks?: boolean }

export interface Layout {
  cells: Cell[][];
  zones: ZonePlace[];
  placed: Placed[];
  spawn: { x: number; y: number };
  gateCells: { x: number; y: number }[];
  goalId: string | null;
}

const NONBLOCK = new Set(['flowers', 'fern', 'shell', 'reeds', 'moonplant', 'anemone']);

export function inside(x: number, y: number) { return x >= 0 && y >= 0 && x < N && y < N; }

/** Generic A* on the grid (8-dir, no corner cutting). cost(fromX,fromY,x,y) -> number | Infinity */
export function astar(sx: number, sy: number, gx: number, gy: number, cost: (fx: number, fy: number, x: number, y: number) => number, diag = true): { x: number; y: number }[] | null {
  const idx = (x: number, y: number) => y * N + x;
  const g = new Float64Array(N * N).fill(Infinity);
  const came = new Int32Array(N * N).fill(-1);
  const closed = new Uint8Array(N * N);
  const heap: [number, number][] = [];
  const push = (f: number, i: number) => { heap.push([f, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0]; const last = heap.pop()!; if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  const hfn = (x: number, y: number) => Math.hypot(x - gx, y - gy);
  g[idx(sx, sy)] = 0; push(hfn(sx, sy), idx(sx, sy));
  const dirs = diag ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let guard = 0;
  while (heap.length && guard++ < 40000) {
    const [, i] = pop();
    if (closed[i]) continue; closed[i] = 1;
    const x = i % N, y = (i / N) | 0;
    if (x === gx && y === gy) {
      const out: { x: number; y: number }[] = []; let c = i;
      while (c !== -1) { out.push({ x: c % N, y: (c / N) | 0 }); c = came[c]; }
      return out.reverse();
    }
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (!inside(nx, ny)) continue;
      let c = cost(x, y, nx, ny);
      if (!isFinite(c)) continue;
      if (dx && dy) {
        if (!isFinite(cost(x, y, x + dx, y)) || !isFinite(cost(x, y, x, y + dy))) continue;
        c *= 1.414;
      }
      const ng = g[i] + c, ni = idx(nx, ny);
      if (ng < g[ni]) { g[ni] = ng; came[ni] = i; push(ng + hfn(nx, ny), ni); }
    }
  }
  return null;
}

export function walkable(L: Layout, x: number, y: number, gateOpen: boolean): boolean {
  if (!inside(x, y)) return false;
  const c = L.cells[y][x];
  if (!c.island || c.blocked || c.occupied) return false;
  if (c.gate && !gateOpen) return false;
  return true;
}
export function canStep(L: Layout, fx: number, fy: number, x: number, y: number, gateOpen: boolean): boolean {
  if (!walkable(L, x, y, gateOpen)) return false;
  if (!inside(fx, fy)) return true;
  return Math.abs(L.cells[y][x].h - L.cells[fy][fx].h) <= 0.51;
}

export function buildLayout(world: WorldSpec, kit: Kit): Layout {
  const rng = new Rng(world.seed);
  const seed = world.seed % 100000;
  const C = Math.floor(N / 2);
  const cells: Cell[][] = [];
  for (let y = 0; y < N; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - C, dy = y + 0.5 - C;
      const a = Math.atan2(dy, dx);
      const r = 19.2 + (fbm(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + 5, seed) - 0.5) * 6;
      row.push({ island: Math.hypot(dx, dy) < r, h: 0, water: false, path: false, bridge: false, gate: false, stairs: false, mat: -1, zone: null, blocked: false, occupied: false, edge: false, drop: 0 });
    }
    cells.push(row);
  }
  const cell = (x: number, y: number) => cells[y][x];

  // ---- zones
  const zones: ZonePlace[] = [];
  const hub = world.zones.find((z) => z.kind === 'hub') ?? { id: 'hub', name: 'Clearing', kind: 'hub', landmark: 'fountain', description: '' } as Zone;
  const landmarks = world.zones.filter((z) => z.kind === 'landmark');
  const goal = world.zones.find((z) => z.kind === 'goal') ?? null;
  const wilds = world.zones.filter((z) => z.kind === 'wild');
  const base = rng.range(0, Math.PI * 2);
  const ring: (Zone | null)[] = [...landmarks.slice(0, 3)];
  while (ring.length < 3) ring.push(null);
  ring.push(goal);
  const slots = Math.max(4, landmarks.length + (goal ? 1 : 0));
  zones.push({ zone: hub, cx: C, cy: C, mat: 0, r: 4, landmark: { x: C - 1, y: C - 1 } });
  const extra = landmarks.slice(3);
  const all = [...ring, ...extra];
  all.forEach((z, i) => {
    if (!z) return;
    const isGoal = z.kind === 'goal';
    const a = base + (i * Math.PI * 2) / slots + rng.range(-0.18, 0.18);
    const rad = isGoal ? 13.2 : rng.range(11, 12.5);
    const cx = Math.round(C + Math.cos(a) * rad), cy = Math.round(C + Math.sin(a) * rad);
    zones.push({ zone: z, cx, cy, mat: (i % (kit.zoneMats.length - 1)) + 1, r: isGoal ? 3.6 : 4.2, landmark: { x: cx - 1, y: cy - 1 } });
  });
  wilds.forEach((z, i) => {
    const a = base + ((i + 0.5) * Math.PI * 2) / slots + rng.range(-0.1, 0.1);
    const rad = 14.5;
    const cx = Math.round(C + Math.cos(a) * rad), cy = Math.round(C + Math.sin(a) * rad);
    zones.push({ zone: z, cx, cy, mat: 1 + ((i + 2) % (kit.zoneMats.length - 1)), r: 2.8, landmark: { x: cx, y: cy - 1 } });
  });
  // make sure zones sit on island
  for (const zp of zones) for (let y = zp.cy - 5; y <= zp.cy + 5; y++) for (let x = zp.cx - 5; x <= zp.cx + 5; x++) {
    if (inside(x, y) && Math.hypot(x - zp.cx, y - zp.cy) < zp.r + 1.6 && x > 1 && y > 1 && x < N - 2 && y < N - 2) cell(x, y).island = true;
  }

  // ---- heights: one landmark zone on a plateau + a few hills
  const plateauZone = zones.filter((z) => z.zone.kind === 'landmark')[rng.int(0, Math.max(0, landmarks.length - 1))];
  const raise = (cx: number, cy: number, r: number) => {
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
      if (!inside(x, y) || !cell(x, y).island) continue;
      const d = Math.hypot(x - cx, y - cy) + (hash2(x, y, seed) - 0.5) * 1.2;
      if (d < r) cell(x, y).h = 1;
    }
  };
  if (plateauZone) raise(plateauZone.cx, plateauZone.cy, 5.4);
  for (let i = 0; i < 4; i++) {
    const a = rng.range(0, Math.PI * 2), rad = rng.range(7, 16);
    const hx = C + Math.cos(a) * rad, hy = C + Math.sin(a) * rad;
    if (zones.some((z) => Math.hypot(z.cx - hx, z.cy - hy) < z.r + 4)) continue;
    raise(hx, hy, rng.range(2, 3.4));
  }
  // ---- water: a pond + goal moat
  for (let i = 0; i < 2; i++) {
    const a = rng.range(0, Math.PI * 2), rad = rng.range(6, 14);
    const px = C + Math.cos(a) * rad, py = C + Math.sin(a) * rad;
    if (zones.some((z) => Math.hypot(z.cx - px, z.cy - py) < z.r + 3.5)) continue;
    const pr = rng.range(1.8, 2.8);
    for (let y = Math.floor(py - 4); y <= py + 4; y++) for (let x = Math.floor(px - 4); x <= px + 4; x++) {
      if (!inside(x, y) || !cell(x, y).island) continue;
      if (Math.hypot(x - px, (y - py) * 1.2) + (hash2(x, y, seed + 3) - 0.5) < pr) { cell(x, y).water = true; cell(x, y).h = 0; }
    }
  }
  const goalPlace = zones.find((z) => z.zone.kind === 'goal');
  if (goalPlace) {
    for (let y = goalPlace.cy - 8; y <= goalPlace.cy + 8; y++) for (let x = goalPlace.cx - 8; x <= goalPlace.cx + 8; x++) {
      if (!inside(x, y) || !cell(x, y).island) continue;
      const d = Math.hypot(x - goalPlace.cx, y - goalPlace.cy);
      if (d >= 4.6 && d < 6.4) { cell(x, y).water = true; cell(x, y).h = 0; }
      if (d < 4.6) cell(x, y).h = 0;
    }
  }
  // flatten zone plazas to a single height
  for (const zp of zones) {
    const zh = cell(zp.cx, zp.cy).water ? 0 : cell(zp.cx, zp.cy).h;
    for (let y = zp.cy - 4; y <= zp.cy + 4; y++) for (let x = zp.cx - 4; x <= zp.cx + 4; x++) {
      if (!inside(x, y)) continue;
      if (Math.hypot(x - zp.cx, y - zp.cy) < Math.min(zp.r, 3.6)) { const c = cell(x, y); c.h = zh; c.water = false; c.zone = zp.zone.id; }
    }
  }

  // ---- edges
  const markEdges = () => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const c = cell(x, y); if (!c.island) continue;
      c.edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inside(nx, ny) || !cell(nx, ny).island) c.edge = true;
      }
    }
  };
  markEdges();

  // ---- paths (hub -> every zone)
  const hubP = zones[0];
  const gateCells: { x: number; y: number }[] = [];
  for (const zp of zones.slice(1)) {
    const tx = zp.cx + 1, ty = zp.cy + 1;
    const route = astar(hubP.cx + 1, hubP.cy + 1, tx, ty, (fx, fy, x, y) => {
      const c = cell(x, y), f = cell(fx, fy);
      if (!c.island || c.edge) return Infinity;
      let k = 1 + fbm(x * 0.35, y * 0.35, seed + 11) * 3.2;
      if (c.water) k += zp.zone.kind === 'goal' ? 6 : 40;
      if (c.zone && c.zone !== zp.zone.id && c.zone !== hubP.zone.id) k += 30;
      if (Math.abs(c.h - f.h) > 0) k += 5;
      if (c.path) k *= 0.45;
      return k;
    }, false);
    if (!route) continue;
    let prevH = cell(route[0].x, route[0].y).h;
    route.forEach((p, i) => {
      const c = cell(p.x, p.y);
      c.path = true; c.mat = -2;
      if (c.water) { c.water = false; c.bridge = true; c.h = 0; if (zp.zone.kind === 'goal') { c.gate = true; gateCells.push(p); } }
      if (i > 0 && Math.abs(c.h - prevH) >= 1) {
        // put stairs on the higher cell
        const hi = c.h > prevH ? c : cell(route[i - 1].x, route[i - 1].y);
        hi.stairs = true; hi.h = 0.5;
      }
      prevH = c.h === 0.5 ? (prevH > c.h ? 0 : 1) : c.h;
      // widen
      const wx = p.x + 1, wy = p.y;
      if (inside(wx, wy)) { const w = cell(wx, wy); if (w.island && !w.edge && !w.water && w.h === c.h && !c.stairs && !c.bridge) { w.path = true; w.mat = -2; } }
    });
  }
  // fix stairs sanity: any stair must have both a high and low neighbour, else snap
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const c = cell(x, y); if (!c.stairs) continue;
    let hi = false, lo = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!inside(nx, ny)) continue; const n = cell(nx, ny); if (n.h === 1) hi = true; if (n.h === 0 && !n.water) lo = true; }
    if (!hi || !lo) { c.stairs = false; c.h = hi ? 1 : 0; }
  }

  // zone materials
  for (const zp of zones) for (let y = zp.cy - 6; y <= zp.cy + 6; y++) for (let x = zp.cx - 6; x <= zp.cx + 6; x++) {
    if (!inside(x, y)) continue; const c = cell(x, y);
    if (c.path || c.water || !c.island) continue;
    if (Math.hypot(x - zp.cx, y - zp.cy) + (hash2(x, y, seed + 5) - 0.5) * 1.6 < zp.r + 0.8) c.mat = zp.mat;
  }

  // ---- drops for island underside
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) cell(x, y).drop = 2.6 + fbm(x * 0.3, y * 0.3, seed + 21) * 3.2;

  // ---- blocking
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const c = cell(x, y);
    c.blocked = !c.island || c.edge || (c.water && !c.bridge);
    // cells hidden behind a taller cliff in front of them (avoids impossible-looking overlap)
    if (!c.blocked && !c.path) for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (inside(nx, ny) && cell(nx, ny).island && cell(nx, ny).h - c.h >= 1) c.blocked = true;
    }
  }

  // ---- landmark footprints, NPCs, stations
  const npcByZone = new Map(world.npcs.map((n) => [n.zoneId, n]));
  const hasStudy = new Set((world.study ?? []).map((s) => s.zoneId));
  for (const zp of zones) {
    const lx = zp.landmark.x, ly = zp.landmark.y;
    const fp = zp.zone.kind === 'wild' ? 0 : 1;
    for (let y = ly - fp; y <= ly + fp; y++) for (let x = lx - fp; x <= lx + fp; x++) if (inside(x, y)) cell(x, y).occupied = true;
    const npc = npcByZone.get(zp.zone.id);
    if (npc) { zp.npc = { x: zp.cx + 2, y: zp.cy - 1, id: npc.id }; cell(zp.npc.x, zp.npc.y).occupied = true; }
    if (hasStudy.has(zp.zone.id)) { zp.station = { x: zp.cx - 1, y: zp.cy + 2 }; cell(zp.station.x, zp.station.y).occupied = true; }
    // ensure plaza cells free
    for (let y = zp.cy - 1; y <= zp.cy + 3; y++) for (let x = zp.cx - 1; x <= zp.cx + 3; x++) {
      if (!inside(x, y)) continue; const c = cell(x, y);
      if (c.occupied) continue;
      if (c.island && !c.edge && !c.water) c.blocked = false;
    }
  }

  // ---- props
  const placed: Placed[] = [];
  const totalW = kit.props.reduce((s, p) => s + p.w, 0);
  const pickProp = (r: number) => { let t = r * totalW; for (const p of kit.props) { t -= p.w; if (t <= 0) return p.key; } return kit.props[0].key; };
  const nearZone = (x: number, y: number, extra: number) => zones.some((z) => Math.hypot(x - z.cx, y - z.cy) < Math.min(z.r, 3.4) + extra);
  const nearPath = (x: number, y: number) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (inside(nx, ny) && (cell(nx, ny).path || cell(nx, ny).bridge)) return true; } return false; };
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const c = cell(x, y);
    if (!c.island || c.water || c.path || c.occupied || c.stairs || c.bridge) continue;
    if (nearZone(x, y, 0.6) || nearPath(x, y)) continue;
    const dens = fbm(x * 0.18, y * 0.18, seed + 31);
    const r = hash2(x, y, seed + 41);
    if (r < (dens > 0.55 ? 0.5 : 0.13)) {
      const key = pickProp(hash2(x, y, seed + 51));
      const blocks = !NONBLOCK.has(key);
      placed.push({ kind: 'prop', key, x: x + 0.5 + (hash2(x, y, 9) - 0.5) * 0.3, y: y + 0.5 + (hash2(x, y, 10) - 0.5) * 0.3, blocks });
      if (blocks) c.occupied = true;
    }
  }
  // plaza dressing
  for (const zp of zones) {
    for (let i = 0; i < 5; i++) {
      const a = rng.range(0, Math.PI * 2), rr = rng.range(3.2, 4.6);
      const x = Math.round(zp.cx + Math.cos(a) * rr), y = Math.round(zp.cy + Math.sin(a) * rr);
      if (!inside(x, y)) continue; const c = cell(x, y);
      if (!c.island || c.water || c.path || c.occupied || c.edge || c.bridge || c.stairs) continue;
      const key = rng.pick(kit.plaza);
      const blocks = !NONBLOCK.has(key);
      placed.push({ kind: 'prop', key, x: x + 0.5, y: y + 0.5, blocks });
      if (blocks) c.occupied = true;
    }
  }

  const L: Layout = { cells, zones, placed, spawn: { x: hubP.cx + 2, y: hubP.cy + 2 }, gateCells, goalId: goal?.id ?? null };

  // ---- collectibles + discoveries
  const freeNear = (cx: number, cy: number, rmin: number, rmax: number): { x: number; y: number } | null => {
    for (let t = 0; t < 80; t++) {
      const a = rng.range(0, Math.PI * 2), rr = rng.range(rmin, rmax);
      const x = Math.round(cx + Math.cos(a) * rr), y = Math.round(cy + Math.sin(a) * rr);
      if (walkable(L, x, y, true) && !cell(x, y).bridge && !placed.some((p) => Math.floor(p.x) === x && Math.floor(p.y) === y)) return { x, y };
    }
    return null;
  };
  for (const col of world.collectibles ?? []) {
    const zp = zones.find((z) => z.zone.id === col.zoneId) ?? zones[0];
    for (let i = 0; i < Math.max(1, Math.min(6, col.count)); i++) {
      const p = freeNear(zp.cx, zp.cy, 3, 7);
      if (p) placed.push({ kind: 'collectible', key: col.icon || 'gem', x: p.x + 0.5, y: p.y + 0.5, id: col.id, zoneId: zp.zone.id });
    }
  }
  const facts: string[] = [];
  for (const g of world.glossary ?? []) facts.push(`${cap(g.term)}: ${g.meaning}`);
  for (const n of world.npcs) for (const k of n.knowledge ?? []) facts.push(k);
  const nookSpots: { x: number; y: number }[] = [];
  for (const zp of zones.filter((z) => z.zone.kind === 'wild')) nookSpots.push({ x: zp.cx + 1, y: zp.cy + 1 });
  for (let i = 0; i < 3; i++) {
    const a = base + ((i + 0.5) * Math.PI * 2) / 3 + 0.7;
    const p = freeNear(C + Math.cos(a) * 15, C + Math.sin(a) * 15, 0, 3.5);
    if (p) nookSpots.push(p);
  }
  nookSpots.forEach((p, i) => { if (facts.length) placed.push({ kind: 'discovery', key: 'sparkle', x: p.x + 0.5, y: p.y + 0.5, id: `disc-${i}`, text: facts[(i * 3 + 1) % facts.length] }); });

  ensureReachable(L, rng);
  return L;
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

/** Everything interactable must be reachable from spawn (with the gate open). Carve paths if not. */
export function reachMap(L: Layout, gateOpen: boolean): Uint8Array {
  const seen = new Uint8Array(N * N);
  const q: number[] = [L.spawn.y * N + L.spawn.x];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.shift()!; const x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inside(nx, ny) || seen[ny * N + nx]) continue;
      if (!canStep(L, x, y, nx, ny, gateOpen)) continue;
      seen[ny * N + nx] = 1; q.push(ny * N + nx);
    }
  }
  return seen;
}

function ensureReachable(L: Layout, _rng: Rng) {
  const c = (x: number, y: number) => L.cells[y][x];
  const sp = c(L.spawn.x, L.spawn.y); sp.blocked = false; sp.occupied = false;
  const targets: { x: number; y: number }[] = [];
  for (const z of L.zones) {
    targets.push({ x: z.cx + 1, y: z.cy + 1 });
    if (z.npc) targets.push({ x: z.npc.x, y: z.npc.y + 1 });
    if (z.station) targets.push({ x: z.station.x + 1, y: z.station.y });
  }
  for (const p of L.placed) if (p.kind !== 'prop') targets.push({ x: Math.floor(p.x), y: Math.floor(p.y) });
  for (let pass = 0; pass < 3; pass++) {
    const seen = reachMap(L, true);
    let fixed = false;
    for (const t of targets) {
      if (seen[t.y * N + t.x]) continue;
      const tc = c(t.x, t.y); tc.blocked = false; tc.occupied = false; tc.water = false;
      const route = astar(L.spawn.x, L.spawn.y, t.x, t.y, (_fx, _fy, x, y) => (c(x, y).island && !c(x, y).edge ? (seen[y * N + x] ? 1 : 4) : Infinity), false);
      if (!route) continue;
      let prev = c(route[0].x, route[0].y);
      for (const p of route) {
        const cc = c(p.x, p.y);
        if (cc.water) { cc.water = false; cc.bridge = true; cc.h = 0; }
        cc.blocked = false;
        if (cc.occupied) { cc.occupied = false; L.placed = L.placed.filter((q) => !(q.kind === 'prop' && Math.floor(q.x) === p.x && Math.floor(q.y) === p.y)); }
        if (Math.abs(cc.h - prev.h) > 0.51) { cc.h = prev.h; cc.stairs = false; }
        prev = cc;
      }
      fixed = true;
    }
    if (!fixed) break;
  }
}
