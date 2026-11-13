/* Original blocky (voxel) art drawn as isometric SVG cubes. One static SVG, animated with CSS only. */

const W = 26, H = 13, Z = 26; // half-width, half-height of a cube top, cube height (px)

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * k));
  const b = Math.min(255, Math.round((n & 255) * k));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

interface Vox { x: number; y: number; z: number; c: string; cls?: string; face?: boolean }

function cube(v: Vox, ox: number, oy: number): string {
  const px = ox + (v.x - v.y) * W, py = oy + (v.x + v.y) * H - v.z * Z;
  const top = `${px},${py - H} ${px + W},${py} ${px},${py + H} ${px - W},${py}`;
  const left = `${px - W},${py} ${px},${py + H} ${px},${py + H + Z} ${px - W},${py + Z}`;
  const right = `${px + W},${py} ${px},${py + H} ${px},${py + H + Z} ${px + W},${py + Z}`;
  const edge = 'stroke="rgba(0,0,0,.14)" stroke-width="1"';
  let s = `<polygon points="${top}" fill="${shade(v.c, 1.08)}" ${edge}/><polygon points="${left}" fill="${shade(v.c, .86)}" ${edge}/><polygon points="${right}" fill="${shade(v.c, .7)}" ${edge}/>`;
  if (v.face) { // a friendly face on the right face
    s += `<rect x="${px + 6}" y="${py + 9}" width="4" height="5" fill="#1d1a33"/><rect x="${px + 15}" y="${py + 5}" width="4" height="5" fill="#1d1a33"/><polygon points="${px + 7},${py + 19} ${px + 18},${py + 14} ${px + 18},${py + 16} ${px + 7},${py + 21}" fill="#1d1a33"/>`;
  }
  return v.cls ? `<g class="${v.cls}">${s}</g>` : s;
}

/** The demo beach: sand, sea with rolling wave blocks, a palm, Surfer Sam and a surfboard. */
export function beachSVG(): string {
  const v: Vox[] = [];
  const N = 8;
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
    const sea = x + y > 8;
    if (sea) {
      v.push({ x, y, z: 0, c: (x + y) % 2 ? '#2fb5ff' : '#3ec6ff', cls: `wv wv${(x + y) % 4}` });
      if (x + y === 11 && x % 2 === 0) v.push({ x, y, z: 1, c: '#e9fbff', cls: `wv wv${x % 4}` }); // foam crest
    } else {
      v.push({ x, y, z: 0, c: (x * 3 + y) % 5 === 0 ? '#ffd98a' : '#ffe6a6' });
      if (x + y === 8) v.push({ x, y, z: 0.0001, c: '#fff4cf' });
    }
  }
  // grass knoll + palm
  [[0, 0], [1, 0], [0, 1]].forEach(([x, y]) => v.push({ x, y, z: 1, c: '#5fd35a' }));
  for (let z = 1; z <= 4; z++) v.push({ x: 1, y: 1, z, c: '#b07a4f' });
  [[0, 1], [2, 1], [1, 0], [1, 2], [1, 1]].forEach(([x, y]) => v.push({ x, y, z: 5, c: '#3fc25a', cls: 'leaf' }));
  [[0, 0], [2, 2]].forEach(([x, y]) => v.push({ x, y, z: 4.6, c: '#2fa84c', cls: 'leaf' }));
  // Surfer Sam
  v.push({ x: 4, y: 2, z: 1, c: '#2a6cf0' }); v.push({ x: 4, y: 2, z: 2, c: '#ff7a59' }); v.push({ x: 4, y: 2, z: 3, c: '#f1b98c', face: true });
  v.push({ x: 4, y: 2, z: 3.85, c: '#ffcf3a' });
  // surfboard leaning
  v.push({ x: 5, y: 1, z: 1, c: '#ff4f9a' }); v.push({ x: 5, y: 1, z: 2, c: '#ff4f9a' }); v.push({ x: 5, y: 1, z: 3, c: '#ffffff' });
  // bucket + ball
  v.push({ x: 2, y: 4, z: 1, c: '#ff5d5d' });
  v.push({ x: 6, y: 0, z: 1, c: '#a77bff' });
  // floating "?" block
  v.push({ x: 2, y: 2, z: 7, c: '#ffcf3a', cls: 'qblock' });

  v.sort((a, b) => (a.x + a.y) - (b.x + b.y) || a.z - b.z);
  const ox = 300, oy = 150;
  const q = (() => { const px = ox, py = oy + 4 * H - 7 * Z; return `<text class="qmark" x="${px}" y="${py + 6}" text-anchor="middle">?</text>`; })();
  return `<svg class="beach" viewBox="84 -40 432 430" role="img" aria-label="A blocky beach with a palm tree, the sea, Surfer Sam and a surfboard">${v.map((b) => cube(b, ox, oy)).join('')}${q}</svg>`;
}

/** Small single-colour voxel icon (a cube with an emblem) for steps. */
export function blockIcon(color: string, glyph: string): string {
  return `<svg class="blockicon" viewBox="-30 -18 60 62" aria-hidden="true">${cube({ x: 0, y: 0, z: 0, c: color }, 0, 0)}<text x="-12" y="20" class="glyph">${glyph}</text></svg>`;
}

export type Area = 'beach' | 'volcano' | 'ice' | 'jungle';
/** A tiny voxel diorama for each area of Curiosity Island. */
export function areaSVG(kind: Area): string {
  const v: Vox[] = [];
  const pal: Record<Area, [string, string]> = { beach: ['#ffe3a3', '#3ec6ff'], volcano: ['#6b5a66', '#ff7a2f'], ice: ['#dff4ff', '#8fd8ff'], jungle: ['#4fc24c', '#2f9e5a'] };
  const [g, a] = pal[kind];
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) v.push({ x, y, z: 0, c: kind === 'beach' && x + y > 4 ? a : (x + y) % 2 ? g : shade(g, .94) });
  if (kind === 'beach') { for (let z = 1; z <= 2; z++) v.push({ x: 0, y: 0, z, c: '#b07a4f' }); v.push({ x: 0, y: 0, z: 3, c: '#3fc25a' }); v.push({ x: 1, y: 0, z: 3, c: '#3fc25a' }); v.push({ x: 0, y: 1, z: 3, c: '#3fc25a' }); v.push({ x: 2, y: 1, z: 1, c: '#ff4f9a' }); v.push({ x: 2, y: 1, z: 2, c: '#ffffff' }); }
  if (kind === 'volcano') { [[1, 1], [2, 1], [1, 2], [2, 2]].forEach(([x, y]) => { v.push({ x, y, z: 1, c: '#5a4a55' }); }); v.push({ x: 1, y: 1, z: 2, c: '#4a3b46' }); v.push({ x: 2, y: 1, z: 2, c: '#4a3b46' }); v.push({ x: 1, y: 2, z: 2, c: '#4a3b46' }); v.push({ x: 2, y: 2, z: 2, c: '#ff7a2f', cls: 'lava' }); v.push({ x: 3, y: 3, z: 1, c: '#ffb12f' }); }
  if (kind === 'ice') { [[0, 0], [1, 0], [0, 1]].forEach(([x, y]) => v.push({ x, y, z: 1, c: '#b8e6ff' })); v.push({ x: 0, y: 0, z: 2, c: '#cdeeff' }); v.push({ x: 2, y: 2, z: 1, c: '#1d1a3a' }); v.push({ x: 2, y: 2, z: 2, c: '#f4f4f4', face: true }); v.push({ x: 3, y: 1, z: 1, c: '#8fd8ff' }); }
  if (kind === 'jungle') { for (let z = 1; z <= 3; z++) v.push({ x: 0, y: 1, z, c: '#8a5a37' }); [[0, 0], [0, 1], [0, 2], [1, 1]].forEach(([x, y]) => v.push({ x, y, z: 4, c: '#2f9e5a' })); v.push({ x: 2, y: 2, z: 1, c: '#7fe05a', face: true }); v.push({ x: 3, y: 0, z: 1, c: '#ff5d8f' }); v.push({ x: 1, y: 3, z: 1, c: '#3ec6ff' }); }
  v.sort((p, q) => (p.x + p.y) - (q.x + q.y) || p.z - q.z);
  return `<svg class="area-svg" viewBox="-110 -110 220 200" aria-hidden="true">${v.map((b) => cube(b, -0, -10)).join('')}</svg>`;
}
