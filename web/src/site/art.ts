/* Original SVG art for the CuriosityCraft site: isometric floating islands, props, characters, Exa the goat, icons. */
import type { TemplateId } from '../shared/contracts';

const INK = '#2a2346';
const S = `stroke="${INK}" stroke-opacity=".6" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"`;

// ---------------------------------------------------------------- iso helpers
const CX = 200, CY = 130, HW = 150, HH = 75, DEPTH = 30;
/** grid x,y in [-1,1] -> pixel on island top */
export const iso = (x: number, y: number): [number, number] => [CX + (x - y) * (HW / 2), CY + (x + y) * (HH / 2)];

// ---------------------------------------------------------------- props
const shadow = (px: number, py: number, r = 22) => `<ellipse cx="${px}" cy="${py + 2}" rx="${r}" ry="${r / 2.4}" fill="${INK}" opacity=".18"/>`;

function blob(circles: [number, number, number][], fill: string): string {
  const outer = circles.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${S}/>`).join('');
  const inner = circles.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r - 1.5}" fill="${fill}"/>`).join('');
  return outer + inner;
}

export const P = {
  tree: (px: number, py: number, c = '#3fb950') =>
    shadow(px, py, 20) +
    `<rect x="${px - 5}" y="${py - 30}" width="10" height="30" rx="3" fill="#a0673f" ${S}/>` +
    blob([[px, py - 52, 22], [px - 15, py - 38, 14], [px + 15, py - 40, 15]], c) +
    `<circle cx="${px - 7}" cy="${py - 60}" r="5" fill="#fff" opacity=".45"/>`,
  pine: (px: number, py: number, c = '#2f9e5a') =>
    shadow(px, py, 16) +
    `<rect x="${px - 4}" y="${py - 16}" width="8" height="16" fill="#a0673f" ${S}/>` +
    `<path d="M${px - 18} ${py - 14} L${px} ${py - 62} L${px + 18} ${py - 14} Z" fill="${c}" ${S}/>`,
  tower: (px: number, py: number) =>
    shadow(px, py, 22) +
    `<rect x="${px - 15}" y="${py - 74}" width="30" height="74" rx="4" fill="var(--paper)" ${S}/>` +
    `<rect x="${px - 6}" y="${py - 54}" width="12" height="16" rx="6" fill="var(--sky)" ${S}/>` +
    `<path d="M${px - 22} ${py - 72} L${px} ${py - 106} L${px + 22} ${py - 72} Z" fill="var(--berry)" ${S}/>` +
    `<circle class="glow" cx="${px}" cy="${py - 116}" r="9" fill="var(--sun)" ${S}/>`,
  well: (px: number, py: number) =>
    shadow(px, py, 22) +
    `<path d="M${px - 18} ${py - 22} v16 a18 7 0 0 0 36 0 v-16" fill="#9aa4b8" ${S}/>` +
    `<ellipse cx="${px}" cy="${py - 22}" rx="18" ry="7" fill="var(--sky)" ${S}/>` +
    `<path d="M${px - 16} ${py - 22} V${py - 44} M${px + 16} ${py - 22} V${py - 44}" ${S} fill="none"/>` +
    `<path d="M${px - 24} ${py - 40} L${px} ${py - 56} L${px + 24} ${py - 40} Z" fill="var(--coral)" ${S}/>`,
  mushroom: (px: number, py: number) =>
    shadow(px, py, 18) +
    `<rect x="${px - 10}" y="${py - 24}" width="20" height="24" rx="5" fill="var(--paper)" ${S}/>` +
    `<rect x="${px - 4}" y="${py - 14}" width="8" height="14" rx="4" fill="#a0673f" ${S}/>` +
    `<path d="M${px - 26} ${py - 22} Q${px} ${py - 64} ${px + 26} ${py - 22} Z" fill="var(--berry)" ${S}/>` +
    `<circle cx="${px - 9}" cy="${py - 36}" r="4" fill="#fff"/><circle cx="${px + 8}" cy="${py - 31}" r="3" fill="#fff"/>`,
  rocket: (px: number, py: number) =>
    shadow(px, py, 20) +
    `<path d="M${px - 22} ${py - 6} L${px - 12} ${py - 30} L${px - 12} ${py - 6} Z M${px + 22} ${py - 6} L${px + 12} ${py - 30} L${px + 12} ${py - 6} Z" fill="var(--berry)" ${S}/>` +
    `<path d="M${px - 13} ${py - 6} V${py - 60} Q${px} ${py - 96} ${px + 13} ${py - 60} V${py - 6} Z" fill="var(--paper)" ${S}/>` +
    `<circle cx="${px}" cy="${py - 52}" r="7" fill="var(--sky)" ${S}/>`,
  planet: (px: number, py: number) =>
    `<g class="spin-slow"><circle cx="${px}" cy="${py - 70}" r="16" fill="var(--sun)" ${S}/>` +
    `<ellipse cx="${px}" cy="${py - 70}" rx="28" ry="7" fill="none" ${S}/></g>`,
  dome: (px: number, py: number) =>
    shadow(px, py, 26) +
    `<path d="M${px - 26} ${py} A26 26 0 0 1 ${px + 26} ${py} Z" fill="var(--sky)" ${S}/>` +
    `<path d="M${px - 14} ${py - 14} A14 14 0 0 1 ${px - 2} ${py - 22}" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  castle: (px: number, py: number) =>
    shadow(px, py, 26) +
    `<path d="M${px - 26} ${py} V${py - 52} h8 v-8 h8 v8 h4 v-8 h4 v8 h4 v-8 h4 v8 h4 v-8 h8 v8 h4 V${py} Z" fill="var(--paper)" ${S}/>` +
    `<path d="M${px - 7} ${py} V${py - 16} a7 7 0 0 1 14 0 V${py} Z" fill="var(--ink)"/>` +
    `<path d="M${px} ${py - 60} V${py - 86}" ${S}/><path d="M${px} ${py - 86} L${px + 18} ${py - 80} L${px} ${py - 74} Z" fill="var(--berry)" ${S}/>`,
  blocks: (px: number, py: number) =>
    shadow(px, py, 18) +
    `<rect x="${px - 18}" y="${py - 18}" width="18" height="18" fill="var(--sky)" ${S}/>` +
    `<rect x="${px}" y="${py - 18}" width="18" height="18" fill="var(--berry)" ${S}/>` +
    `<rect x="${px - 9}" y="${py - 36}" width="18" height="18" fill="var(--sun)" ${S}/>` +
    `<text x="${px}" y="${py - 22}" text-anchor="middle" font-family="Jersey 10" font-size="16" fill="var(--ink)">½</text>`,
  pyramid: (px: number, py: number) =>
    shadow(px, py, 34) +
    `<path d="M${px - 44} ${py - 4} L${px} ${py - 70} L${px} ${py + 14} Z" fill="#f4cf7a" ${S}/>` +
    `<path d="M${px} ${py + 14} L${px} ${py - 70} L${px + 44} ${py - 4} Z" fill="#d9a548" ${S}/>`,
  palm: (px: number, py: number) =>
    shadow(px, py, 16) +
    `<path d="M${px} ${py} Q${px - 4} ${py - 30} ${px + 4} ${py - 54}" stroke="#a0673f" stroke-width="9" fill="none" stroke-linecap="round"/>` +
    `<path d="M${px} ${py} Q${px - 4} ${py - 30} ${px + 4} ${py - 54}" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".0"/>` +
    `<path d="M${px + 4} ${py - 54} q-22 -6 -30 10 M${px + 4} ${py - 54} q22 -6 30 10 M${px + 4} ${py - 54} q-12 -20 -26 -18 M${px + 4} ${py - 54} q12 -20 26 -18" stroke="#2fa35a" stroke-width="7" fill="none" stroke-linecap="round"/>`,
  coral: (px: number, py: number) =>
    shadow(px, py, 18) +
    `<path d="M${px} ${py} V${py - 30} M${px} ${py - 18} q-14 -4 -14 -20 M${px} ${py - 22} q14 -2 14 -22 M${px} ${py - 30} q-4 -10 2 -18" stroke="var(--berry)" stroke-width="8" fill="none" stroke-linecap="round"/>`,
  shell: (px: number, py: number) =>
    shadow(px, py, 14) +
    `<path d="M${px - 14} ${py - 2} Q${px} ${py - 30} ${px + 14} ${py - 2} Z" fill="var(--paper-2)" ${S}/>` +
    `<path d="M${px} ${py - 2} V${py - 20} M${px - 7} ${py - 3} L${px - 3} ${py - 18} M${px + 7} ${py - 3} L${px + 3} ${py - 18}" stroke="${INK}" stroke-width="2"/>`,
  flask: (px: number, py: number) =>
    shadow(px, py, 18) +
    `<path d="M${px - 6} ${py - 50} V${py - 36} L${px - 20} ${py - 6} Q${px - 22} ${py} ${px - 14} ${py} H${px + 14} Q${px + 22} ${py} ${px + 20} ${py - 6} L${px + 6} ${py - 36} V${py - 50} Z" fill="var(--paper)" ${S}/>` +
    `<path d="M${px - 14} ${py - 18} H${px + 14} L${px + 18} ${py - 6} Q${px + 18} ${py - 2} ${px + 12} ${py - 2} H${px - 12} Q${px - 18} ${py - 2} ${px - 18} ${py - 6} Z" fill="var(--mint)"/>` +
    `<circle class="fizz" cx="${px + 2}" cy="${py - 58}" r="4" fill="var(--mint)" ${S}/>`,
  machine: (px: number, py: number) =>
    shadow(px, py, 24) +
    `<rect x="${px - 22}" y="${py - 44}" width="44" height="44" rx="6" fill="var(--dusk-2)" ${S}/>` +
    `<circle cx="${px - 8}" cy="${py - 30}" r="5" fill="var(--sun)"/><circle cx="${px + 8}" cy="${py - 30}" r="5" fill="var(--mint)"/>` +
    `<rect x="${px - 12}" y="${py - 16}" width="24" height="6" rx="3" fill="var(--sky)"/>`,
  sunflower: (px: number, py: number) =>
    `<g class="bob">` + shadow(px, py, 12) +
    `<path d="M${px} ${py} V${py - 30}" stroke="#2f9e5a" stroke-width="5" stroke-linecap="round"/>` +
    [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<ellipse cx="${px}" cy="${py - 58}" rx="6" ry="11" transform="rotate(${a} ${px} ${py - 44})" fill="var(--sun)" ${S}/>`).join('') +
    `<circle cx="${px}" cy="${py - 44}" r="10" fill="#a0673f" ${S}/>` +
    `<circle cx="${px - 3.5}" cy="${py - 46}" r="1.8" fill="${INK}"/><circle cx="${px + 3.5}" cy="${py - 46}" r="1.8" fill="${INK}"/>` +
    `<path d="M${px - 4} ${py - 41} q4 4 8 0" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/></g>`,
  /** a bean-shaped little character */
  buddy: (px: number, py: number, c: string, delay = 0) =>
    `<g class="bob" style="animation-delay:${delay}s">` + shadow(px, py, 11) +
    `<rect x="${px - 11}" y="${py - 30}" width="22" height="30" rx="11" fill="${c}" ${S}/>` +
    `<circle cx="${px - 4}" cy="${py - 19}" r="2.2" fill="${INK}"/><circle cx="${px + 4}" cy="${py - 19}" r="2.2" fill="${INK}"/>` +
    `<path d="M${px - 3} ${py - 13} q3 3 6 0" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/></g>`,
  rock: (px: number, py: number) =>
    `<path d="M${px - 12} ${py} q-2 -12 8 -14 q10 -4 14 6 q4 8 -4 8 Z" fill="#b8b2c9" ${S}/>`,
  sparkle: (px: number, py: number, c = 'var(--sun)') =>
    `<path class="twinkle" d="M${px} ${py - 8} L${px + 2.5} ${py - 2.5} L${px + 8} ${py} L${px + 2.5} ${py + 2.5} L${px} ${py + 8} L${px - 2.5} ${py + 2.5} L${px - 8} ${py} L${px - 2.5} ${py - 2.5} Z" fill="${c}" ${S} stroke-width="2"/>`,
};

// ---------------------------------------------------------------- islands
interface IslandLook { top: string; topHi: string; left: string; right: string; under: string }
const LOOKS: Record<TemplateId, IslandLook> = {
  forest: { top: '#7ed957', topHi: '#a6ec7c', left: '#b07a4f', right: '#8d5c38', under: '#6e4a33' },
  space: { top: '#a99cff', topHi: '#c8bfff', left: '#5b4fb8', right: '#463c95', under: '#33296e' },
  math: { top: '#ffd166', topHi: '#ffe39a', left: '#5f7ad8', right: '#4a62b8', under: '#3a4d93' },
  egypt: { top: '#f6d58e', topHi: '#fbe6b4', left: '#d69b55', right: '#b97f3e', under: '#99662f' },
  ocean: { top: '#5fd0ff', topHi: '#9be2ff', left: '#f2cf8a', right: '#d9b06a', under: '#b98d4e' },
  lab: { top: '#d7b8ff', topHi: '#e8d6ff', left: '#7a5bb0', right: '#634696', under: '#4c3578' },
};

type Placed = [number, number, (px: number, py: number) => string];
const sortPlaced = (items: Placed[]) => [...items].sort((a, b) => a[0] + a[1] - (b[0] + b[1]));

export const WORLD_PROPS: Record<TemplateId, Placed[]> = {
  forest: [[-0.6, -0.5, (x, y) => P.tree(x, y)], [0.3, -0.7, (x, y) => P.tower(x, y)], [-0.7, 0.3, (x, y) => P.mushroom(x, y)], [0.55, 0.15, (x, y) => P.well(x, y)], [0, 0.1, (x, y) => P.sunflower(x, y)], [0.1, 0.65, (x, y) => P.pine(x, y)]],
  space: [[-0.4, -0.5, (x, y) => P.rocket(x, y)], [0.4, -0.3, (x, y) => P.dome(x, y)], [0.4, -0.3, (x, y) => P.planet(x, y)], [-0.5, 0.4, (x, y) => P.rock(x, y)], [0.2, 0.4, (x, y) => P.buddy(x, y, 'var(--paper)', 0.4)]],
  math: [[-0.2, -0.6, (x, y) => P.castle(x, y)], [0.5, 0.0, (x, y) => P.blocks(x, y)], [-0.6, 0.3, (x, y) => P.pine(x, y, '#3fb950')], [0.0, 0.5, (x, y) => P.buddy(x, y, 'var(--berry)', 0.2)]],
  egypt: [[-0.2, -0.4, (x, y) => P.pyramid(x, y)], [0.6, 0.0, (x, y) => P.palm(x, y)], [-0.6, 0.5, (x, y) => P.rock(x, y)], [0.2, 0.5, (x, y) => P.buddy(x, y, 'var(--w-egypt)', 0.6)]],
  ocean: [[-0.45, -0.4, (x, y) => P.coral(x, y)], [0.4, -0.3, (x, y) => P.shell(x, y)], [-0.1, 0.4, (x, y) => P.coral(x, y)], [0.5, 0.4, (x, y) => P.buddy(x, y, '#4fd18b', 0.3)]],
  lab: [[-0.3, -0.5, (x, y) => P.machine(x, y)], [0.45, -0.1, (x, y) => P.flask(x, y)], [-0.5, 0.4, (x, y) => P.flask(x, y)], [0.15, 0.45, (x, y) => P.buddy(x, y, 'var(--sky)', 0.1)]],
};

function islandBody(look: IslandLook, waterTop = false): string {
  const [l, t, r, b] = [iso(-1, 1), iso(-1, -1), iso(1, -1), iso(1, 1)];
  const d = DEPTH;
  const top = `${l[0]},${l[1]} ${t[0]},${t[1]} ${r[0]},${r[1]} ${b[0]},${b[1]}`;
  const lf = `${l[0]},${l[1]} ${b[0]},${b[1]} ${b[0]},${b[1] + d} ${l[0]},${l[1] + d}`;
  const rf = `${b[0]},${b[1]} ${r[0]},${r[1]} ${r[0]},${r[1] + d} ${b[0]},${b[1] + d}`;
  const under = `${l[0]},${l[1] + d} ${b[0]},${b[1] + d} ${r[0]},${r[1] + d} ${r[0] - 40},${r[1] + d + 46} ${b[0] + 30},${b[1] + d + 60} ${b[0]},${b[1] + d + 92} ${b[0] - 26},${b[1] + d + 54} ${l[0] + 52},${l[1] + d + 50}`;
  // inner highlight diamond on top
  const k = 0.72;
  const hi = [iso(-k, k), iso(-k, -k), iso(k, -k), iso(k, k)].map((p) => p.join(',')).join(' ');
  return `<polygon points="${under}" fill="${look.under}" ${S}/>` +
    `<path d="M${b[0] - 10} ${b[1] + d + 20} l14 22 M${b[0] + 40} ${b[1] + d + 10} l-8 18 M${l[0] + 60} ${l[1] + d + 18} l12 10" stroke="${INK}" stroke-width="2.5" stroke-linecap="round" opacity=".5"/>` +
    `<polygon points="${lf}" fill="${look.left}" ${S}/>` +
    `<polygon points="${rf}" fill="${look.right}" ${S}/>` +
    `<path d="M${l[0] + 8} ${l[1] + 14} L${b[0] - 8} ${b[1] + 14} M${b[0] + 8} ${b[1] + 18} L${r[0] - 8} ${r[1] + 18}" stroke="${INK}" stroke-width="2" stroke-dasharray="2 9" stroke-linecap="round" opacity=".45"/>` +
    `<polygon points="${top}" fill="${look.top}" ${S}/>` +
    `<polygon points="${hi}" fill="${look.topHi}" opacity="${waterTop ? 0.8 : 0.55}"/>`;
}

/** A complete floating island for a world template. */
export function islandSVG(id: TemplateId, opts: { title?: string; extra?: Placed[]; bare?: boolean } = {}): string {
  const look = LOOKS[id];
  const props = opts.bare ? [] : sortPlaced([...(WORLD_PROPS[id] ?? []), ...(opts.extra ?? [])]);
  return `<svg class="island-svg" viewBox="0 -40 400 380" role="img" aria-label="${opts.title ?? id + ' island'}">` +
    islandBody(look, id === 'ocean') +
    props.map(([x, y, f]) => { const [px, py] = iso(x, y); return f(px, py); }).join('') +
    `</svg>`;
}

/** The big hero island: forest with the three demo characters (each on its own parallax layer via data-depth groups) */
export function heroIslandSVG(): string {
  const look = LOOKS.forest;
  const back = sortPlaced([[-0.75, -0.7, (x, y) => P.tree(x, y)], [0.2, -0.75, (x, y) => P.tower(x, y)], [-0.15, -0.85, (x, y) => P.pine(x, y)], [0.75, -0.55, (x, y) => P.pine(x, y, '#46b86a')]]);
  const mid = sortPlaced([[-0.75, 0.15, (x, y) => P.mushroom(x, y)], [0.6, 0.0, (x, y) => P.well(x, y)], [-0.1, -0.2, (x, y) => P.sunflower(x, y)], [0.25, 0.3, (x, y) => P.buddy(x, y, 'var(--sky)', 0.5)], [-0.35, 0.55, (x, y) => P.buddy(x, y, 'var(--berry)', 0.9)], [0.7, 0.65, (x, y) => P.rock(x, y)]]);
  const draw = (arr: Placed[]) => arr.map(([x, y, f]) => { const [px, py] = iso(x, y); return f(px, py); }).join('');
  const path = [iso(-0.9, 0.9), iso(-0.3, 0.4), iso(0.1, 0.1), iso(0.6, -0.3)].map((p) => p.join(' ')).join(' L');
  return `<svg class="hero-island" viewBox="0 -60 400 400" role="img" aria-label="A floating forest island with a tower, a well and three friendly characters">` +
    islandBody(look) +
    `<path d="M${path}" stroke="#f6e3b0" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>` +
    `<g class="layer-back">${draw(back)}</g><g class="layer-mid">${draw(mid)}</g>` +
    `${P.sparkle(330, 40)}${P.sparkle(70, 70, 'var(--berry)')}${P.sparkle(250, -20, 'var(--paper)')}` +
    `</svg>`;
}

export const cloudSVG = (w = 160) =>
  `<svg class="cloud-svg" width="${w}" viewBox="0 0 160 70" aria-hidden="true"><path d="M20 60 Q2 60 6 46 Q10 32 28 36 Q30 14 54 16 Q70 0 92 14 Q118 6 124 30 Q150 28 154 46 Q156 60 140 60 Z" fill="#fff" ${S}/></svg>`;

// ---------------------------------------------------------------- Exa the goat
export function goatSVG(cls = ''): string {
  return `<svg class="goat ${cls}" viewBox="0 0 120 130" role="img" aria-label="Exa the goat">
  <g ${S}>
    <path d="M38 34 Q22 6 44 4 Q38 18 50 30 Z" fill="#d8c7a6"/>
    <path d="M82 34 Q98 6 76 4 Q82 18 70 30 Z" fill="#d8c7a6"/>
    <ellipse cx="22" cy="54" rx="18" ry="8" transform="rotate(-18 22 54)" fill="#fff"/>
    <ellipse cx="98" cy="54" rx="18" ry="8" transform="rotate(18 98 54)" fill="#fff"/>
    <path d="M30 108 Q26 128 60 128 Q94 128 90 108 Z" fill="var(--sun)"/>
    <path d="M60 26 C86 26 92 48 88 70 C86 86 78 98 60 98 C42 98 34 86 32 70 C28 48 34 26 60 26 Z" fill="#fff"/>
    <ellipse cx="60" cy="82" rx="18" ry="13" fill="#ffd9e2"/>
    <path d="M52 96 L60 116 L68 96 Z" fill="#fff"/>
  </g>
  <ellipse cx="22" cy="55" rx="9" ry="3.5" transform="rotate(-18 22 55)" fill="#ffd9e2"/>
  <ellipse cx="98" cy="55" rx="9" ry="3.5" transform="rotate(18 98 55)" fill="#ffd9e2"/>
  <g class="goat-eyes"><ellipse cx="47" cy="60" rx="4.5" ry="6" fill="${INK}"/><ellipse cx="73" cy="60" rx="4.5" ry="6" fill="${INK}"/>
  <circle cx="48.5" cy="57.5" r="1.6" fill="#fff"/><circle cx="74.5" cy="57.5" r="1.6" fill="#fff"/></g>
  <circle cx="54" cy="80" r="2" fill="${INK}"/><circle cx="66" cy="80" r="2" fill="${INK}"/>
  <path d="M54 88 Q60 93 66 88" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M50 38 q10 -8 20 0" stroke="#e9dcc3" stroke-width="5" fill="none" stroke-linecap="round"/>
  <circle cx="60" cy="116" r="5" fill="var(--sky)" stroke="${INK}" stroke-width="2.5"/>
</svg>`;
}

// ---------------------------------------------------------------- icons (24 grid, 2.5 stroke, round)
const ic = (d: string, extra = '') => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${d}${extra}</svg>`;
export const I = {
  upload: ic('<path d="M12 15V4M7 9l5-5 5 5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
  file: ic('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
  text: ic('<path d="M4 6h16M4 11h16M4 16h10"/>'),
  play: ic('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  mic: ic('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  check: ic('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  x: ic('<path d="M6 6l12 12M18 6L6 18"/>'),
  dash: ic('<path d="M7 12h10"/>'),
  link: ic('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  map: ic('<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  chat: ic('<path d="M4 5h16v11H9l-5 4z"/>'),
  eye: ic('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  pencil: ic('<path d="M4 20l4-1 11-11-3-3L5 16z"/>'),
  download: ic('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  arrow: ic('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  back: ic('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  hint: ic('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>'),
  pin: ic('<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>'),
  refresh: ic('<path d="M20 11a8 8 0 0 0-14.7-4M4 4v4h4M4 13a8 8 0 0 0 14.7 4M20 20v-4h-4"/>'),
  print: ic('<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z"/>'),
  book: ic('<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3"/><path d="M20 4v14h-7"/>'),
  save: ic('<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7M8 21v-7h8v7"/>'),
};
