/** Scatter props, collectibles, study stations, gates. Each returns a canvas with base point at (w/2, h - 6). */
import type { Kit } from '../world/kits';
import { ball, box, canvas, cone, cyl, ellipse, glow, INK, line, poly, rrect, shade, star, stroke, hgrad, type Ctx } from './paint';

export interface Art { c: HTMLCanvasElement; w: number; h: number; sway?: number; glow?: string }

function make(w: number, h: number, draw: (g: Ctx, bx: number, by: number) => void, extra: Partial<Art> = {}): Art {
  const { c, g } = canvas(w, h);
  draw(g, w / 2, h - 6);
  return { c, w, h, ...extra };
}

const LEAF = ['#4caf50', '#5cc25a', '#3e9a4e'];

export function drawProp(key: string, kit: Kit, variant = 0): Art {
  const v = variant;
  switch (key) {
    case 'tree-round': {
      const leaf = kit.id === 'math' ? ['#62c35a', '#7fd06a', '#4fae52'][v % 3] : LEAF[v % 3];
      return make(80, 118, (g, x, y) => {
        // trunk
        poly(g, [x - 5, y - 2, x - 4, y - 38, x + 4, y - 38, x + 6, y - 2], hgrad(g, x - 6, x + 6, '#8a5a36'));
        ellipse(g, x, y - 1, 7, 3, '#6a4428');
        ball(g, x - 14, y - 50, 18, 16, shade(leaf, -0.08));
        ball(g, x + 14, y - 52, 18, 16, shade(leaf, -0.15));
        ball(g, x, y - 70, 24, 22, leaf);
        // little highlight leaves
        ellipse(g, x - 9, y - 80, 6, 3.5, 'rgba(255,255,255,0.35)', false, -0.5);
        if (v % 2) for (let i = 0; i < 4; i++) ball(g, x - 14 + i * 9, y - 58 + (i % 2) * 12, 3, 3, '#ff7a7a');
      }, { sway: 1 });
    }
    case 'tree-pine':
      return make(70, 124, (g, x, y) => {
        poly(g, [x - 4, y - 2, x - 4, y - 22, x + 4, y - 22, x + 4, y - 2], '#7a4a2c');
        const c = ['#2f8a5a', '#3a9a62', '#2a7d55'][v % 3];
        cone(g, x, y - 18, 26, 40, shade(c, -0.1));
        cone(g, x, y - 42, 21, 38, c);
        cone(g, x, y - 66, 15, 36, shade(c, 0.1));
        ellipse(g, x - 6, y - 74, 3, 6, 'rgba(255,255,255,0.25)', false, 0.4);
      }, { sway: 0.7 });
    case 'palm':
      return make(90, 120, (g, x, y) => {
        g.beginPath(); g.moveTo(x - 4, y); g.quadraticCurveTo(x - 10, y - 40, x + 4, y - 78); g.lineTo(x + 10, y - 76); g.quadraticCurveTo(x - 2, y - 40, x + 5, y);
        g.closePath(); g.fillStyle = hgrad(g, x - 8, x + 8, '#b88a50'); g.fill(); stroke(g);
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i - 2.5) * 0.55;
          const ex = x + 6 + Math.cos(a) * 34, ey = y - 78 + Math.sin(a) * 18 + 14;
          g.beginPath(); g.moveTo(x + 6, y - 80); g.quadraticCurveTo((x + 6 + ex) / 2, ey - 22, ex, ey);
          g.quadraticCurveTo((x + 6 + ex) / 2, ey - 8, x + 6, y - 76); g.fillStyle = i % 2 ? '#4fb55a' : '#3e9a4e'; g.fill(); stroke(g, 1.3);
        }
        ball(g, x + 4, y - 74, 4, 4, '#8a5a30'); ball(g, x + 10, y - 72, 4, 4, '#8a5a30');
      }, { sway: 1.2 });
    case 'bush':
      return make(56, 46, (g, x, y) => {
        const c = kit.id === 'egypt' ? '#7fb050' : ['#4fb35a', '#5cc06a', '#46a457'][v % 3];
        ball(g, x - 10, y - 12, 12, 10, shade(c, -0.1)); ball(g, x + 10, y - 12, 12, 10, shade(c, -0.18)); ball(g, x, y - 20, 14, 12, c);
        if (v % 3 === 0) for (let i = 0; i < 3; i++) ball(g, x - 8 + i * 8, y - 18 - (i % 2) * 6, 2.6, 2.6, '#ffe27a');
      }, { sway: 0.6 });
    case 'flowers':
      return make(40, 30, (g, x, y) => {
        const cols = ['#ff7aa8', '#ffe27a', '#ffffff', '#b38cff', '#ff9f5a'];
        for (let i = 0; i < 5; i++) {
          const fx = x - 12 + ((i * 7) % 24), fy = y - 2 - ((i * 5) % 9);
          line(g, [fx, fy, fx, fy - 7], '#3e9a4e', 1.4);
          const c = cols[(i + v) % cols.length];
          for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; ellipse(g, fx + Math.cos(a) * 2.6, fy - 8 + Math.sin(a) * 2.6, 2.2, 2.2, c); }
          ellipse(g, fx, fy - 8, 1.6, 1.6, '#ffb627');
        }
      }, { sway: 1.5 });
    case 'fern':
      return make(44, 34, (g, x, y) => {
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i - 2) * 0.45;
          const ex = x + Math.cos(a) * 18, ey = y - 2 + Math.sin(a) * 20;
          g.beginPath(); g.moveTo(x, y - 2); g.quadraticCurveTo((x + ex) / 2 + 4, (y + ey) / 2, ex, ey); g.quadraticCurveTo((x + ex) / 2 - 4, (y + ey) / 2, x, y - 2);
          g.fillStyle = i % 2 ? '#3e9a4e' : '#5cc25a'; g.fill(); stroke(g, 1.1);
        }
      }, { sway: 1.6 });
    case 'mushroom':
      return make(40, 42, (g, x, y) => {
        cyl(g, x, y - 2, 5, 12, '#fff1d6');
        g.beginPath(); g.ellipse(x, y - 16, 14, 10, 0, Math.PI, 0); g.closePath(); g.fillStyle = hgrad(g, x - 14, x + 14, v % 2 ? '#ff5d6c' : '#b36bff'); g.fill(); stroke(g);
        ellipse(g, x - 5, y - 21, 2.5, 2, '#ffffff'); ellipse(g, x + 5, y - 19, 2, 1.6, '#ffffff'); ellipse(g, x + 1, y - 24, 1.6, 1.3, '#ffffff');
      });
    case 'rock':
      return make(50, 40, (g, x, y) => {
        const c = kit.id === 'space' ? '#8a80c8' : kit.id === 'egypt' ? '#d0a868' : kit.id === 'ocean' ? '#8aa0a8' : '#a8a8b8';
        poly(g, [x - 16, y - 2, x - 18, y - 12, x - 8, y - 24, x + 8, y - 22, x + 18, y - 10, x + 14, y - 1], hgrad(g, x - 18, x + 18, c, 0.25));
        poly(g, [x - 8, y - 24, x + 8, y - 22, x + 4, y - 16, x - 10, y - 16], shade(c, 0.3), false);
        if (kit.id === 'forest') ellipse(g, x - 4, y - 20, 7, 3, '#6cc04a');
      });
    case 'stump':
      return make(44, 36, (g, x, y) => { cyl(g, x, y - 2, 12, 12, '#9a6a40', '#e8c890'); g.strokeStyle = '#b08850'; g.lineWidth = 1; g.beginPath(); g.ellipse(x, y - 14, 6, 3, 0, 0, 7); g.stroke(); });
    case 'crystal':
      return make(48, 60, (g, x, y) => {
        const c = [kit.accent, kit.accent2, '#b6a8ff'][v % 3];
        glow(g, x, y - 20, 24, c, 0.35);
        poly(g, [x - 6, y - 2, x - 10, y - 26, x - 3, y - 44, x + 4, y - 26, x + 2, y - 2], hgrad(g, x - 10, x + 4, c, 0.35));
        poly(g, [x + 2, y - 2, x + 6, y - 20, x + 12, y - 30, x + 14, y - 16, x + 10, y - 2], hgrad(g, x + 2, x + 14, shade(c, -0.1), 0.35));
        line(g, [x - 3, y - 40, x - 3, y - 8], 'rgba(255,255,255,0.6)', 1.2);
      }, { glow: kit.accent });
    case 'moonplant':
      return make(40, 44, (g, x, y) => {
        for (let i = 0; i < 3; i++) { const fx = x - 8 + i * 8; line(g, [fx, y - 2, fx + (i - 1) * 3, y - 18 - i * 4], '#9fe7c8', 2); ball(g, fx + (i - 1) * 3, y - 20 - i * 4, 4, 4, i % 2 ? kit.accent2 : kit.accent); }
      }, { sway: 1.4, glow: kit.accent });
    case 'antenna':
      return make(40, 80, (g, x, y) => {
        box(g, x, y - 2, 10, 8, '#8e95c0');
        line(g, [x, y - 14, x, y - 60], INK, 3.4); line(g, [x, y - 14, x, y - 60], '#c8cde8', 2);
        line(g, [x - 10, y - 46, x + 10, y - 40], INK, 2); ball(g, x, y - 62, 4, 4, '#ff5d8f');
      }, { glow: '#ff5d8f' });
    case 'dish':
      return make(64, 64, (g, x, y) => {
        box(g, x, y - 2, 12, 10, '#8e95c0'); line(g, [x, y - 14, x, y - 28], INK, 4); line(g, [x, y - 14, x, y - 28], '#c8cde8', 2.2);
        g.beginPath(); g.ellipse(x - 2, y - 36, 22, 12, -0.5, 0, Math.PI * 2); g.fillStyle = hgrad(g, x - 24, x + 20, '#e6ebff'); g.fill(); stroke(g);
        ellipse(g, x - 2, y - 36, 12, 6, '#c8cde8', true, -0.5); line(g, [x - 2, y - 36, x + 10, y - 52], INK, 1.5); ball(g, x + 10, y - 52, 3, 3, kit.accent);
      });
    case 'lamp':
      return make(30, 70, (g, x, y) => {
        const post = kit.id === 'space' || kit.id === 'lab' ? '#8e95c0' : '#5a4a6a';
        ellipse(g, x, y - 2, 7, 3.5, shade(post, -0.2), true);
        poly(g, [x - 2, y - 2, x - 2, y - 46, x + 2, y - 46, x + 2, y - 2], post);
        glow(g, x, y - 52, 20, kit.glow, 0.6);
        ball(g, x, y - 52, 7, 7, kit.glow);
        poly(g, [x - 8, y - 58, x + 8, y - 58, x + 5, y - 63, x - 5, y - 63], post);
      }, { glow: kit.glow });
    case 'crate':
      return make(44, 44, (g, x, y) => {
        const c = kit.id === 'space' || kit.id === 'lab' ? '#a8b4cc' : '#c08a50';
        box(g, x, y - 2, 15, 16, c);
        line(g, [x - 15, y - 25, x, y - 18], 'rgba(31,22,51,0.35)', 1.2); line(g, [x, y - 18, x + 15, y - 25], 'rgba(31,22,51,0.35)', 1.2);
        if (kit.id === 'space' || kit.id === 'lab') ball(g, x + 7, y - 13, 2.2, 2.2, kit.accent, false);
      });
    case 'blocks':
      return make(50, 52, (g, x, y) => {
        const cols = ['#ff5d8f', '#4cc9f0', '#ffc93c', '#3ddc97'];
        box(g, x - 7, y - 2, 9, 10, cols[v % 4]); box(g, x + 8, y - 4, 9, 10, cols[(v + 1) % 4]); box(g, x, y - 16, 9, 10, cols[(v + 2) % 4]);
        g.fillStyle = INK; g.font = 'bold 8px sans-serif'; g.textAlign = 'center'; g.fillText(String((v % 9) + 1), x, y - 24);
      });
    case 'banner':
      return make(36, 80, (g, x, y) => {
        line(g, [x - 8, y - 2, x - 8, y - 66], INK, 3.4); line(g, [x - 8, y - 2, x - 8, y - 66], '#c8a060', 2);
        poly(g, [x - 7, y - 64, x + 14, y - 60, x + 10, y - 50, x + 14, y - 40, x - 7, y - 44], kit.accent2);
        star(g, x + 3, y - 52, 4, kit.accent, 5, 0.5, false);
        ball(g, x - 8, y - 68, 3, 3, kit.accent);
      }, { sway: 1 });
    case 'pot':
      return make(36, 40, (g, x, y) => {
        g.beginPath(); g.moveTo(x - 6, y - 2); g.quadraticCurveTo(x - 16, y - 14, x - 7, y - 24); g.lineTo(x + 7, y - 24); g.quadraticCurveTo(x + 16, y - 14, x + 6, y - 2); g.closePath();
        g.fillStyle = hgrad(g, x - 14, x + 14, '#d07a48'); g.fill(); stroke(g);
        line(g, [x - 11, y - 14, x + 11, y - 14], '#2ec4b6', 2); ellipse(g, x, y - 24, 7, 2.5, '#6a3a20', true);
      });
    case 'reeds':
      return make(36, 44, (g, x, y) => { for (let i = 0; i < 5; i++) { const fx = x - 8 + i * 4; line(g, [fx, y - 2, fx + (i - 2) * 2, y - 26 - (i % 2) * 6], '#5a9a3a', 1.8); ellipse(g, fx + (i - 2) * 2, y - 26 - (i % 2) * 6, 1.6, 4, '#8a5a30'); } }, { sway: 1.8 });
    case 'column':
      return make(40, 80, (g, x, y) => { box(g, x, y - 2, 13, 6, kit.stone2); cyl(g, x, y - 8, 8, 44 - (v % 2) * 16, kit.stone); box(g, x, y - 52 + (v % 2) * 16, 12, 5, kit.stone2); });
    case 'kelp':
      return make(40, 96, (g, x, y) => {
        for (let k = 0; k < 2; k++) {
          const bx = x - 5 + k * 10, hgt = 60 + ((v + k) % 3) * 12;
          g.beginPath(); g.moveTo(bx, y - 2);
          for (let i = 1; i <= 6; i++) g.quadraticCurveTo(bx + (i % 2 ? 8 : -8), y - 2 - (i - 0.5) * hgt / 6, bx, y - 2 - (i * hgt) / 6);
          g.strokeStyle = INK; g.lineWidth = 6; g.stroke(); g.strokeStyle = k ? '#3fae6a' : '#2f9a5a'; g.lineWidth = 3.6; g.stroke();
          for (let i = 1; i < 5; i++) ellipse(g, bx + (i % 2 ? 6 : -6), y - 4 - (i * hgt) / 5, 5, 2.5, '#5cc27a', true, i % 2 ? 0.5 : -0.5);
        }
      }, { sway: 2.2 });
    case 'coral':
      return make(56, 60, (g, x, y) => {
        const c = ['#ff7a8a', '#ffb24c', '#c86bfa', '#ff8fd0'][v % 4];
        const branch = (bx: number, by: number, a: number, len: number, d: number) => {
          const ex = bx + Math.cos(a) * len, ey = by + Math.sin(a) * len;
          line(g, [bx, by, ex, ey], INK, d + 3); line(g, [bx, by, ex, ey], c, d);
          if (len > 8) { branch(ex, ey, a - 0.5, len * 0.7, d * 0.75); branch(ex, ey, a + 0.45, len * 0.65, d * 0.75); }
          else ball(g, ex, ey, d * 0.7 + 1, d * 0.7 + 1, shade(c, 0.2), false);
        };
        branch(x, y - 2, -Math.PI / 2, 18, 6);
      }, { sway: 0.5 });
    case 'anemone':
      return make(40, 36, (g, x, y) => { ellipse(g, x, y - 4, 10, 5, '#c86bfa', true); for (let i = 0; i < 9; i++) { const a = Math.PI + (i / 8) * Math.PI; line(g, [x + Math.cos(a) * 7, y - 6, x + Math.cos(a) * 12, y - 18 + Math.abs(i - 4)], '#ff9fd8', 2.4); } }, { sway: 2 });
    case 'shell':
      return make(30, 22, (g, x, y) => { g.beginPath(); g.moveTo(x - 8, y - 3); g.quadraticCurveTo(x, y - 18, x + 8, y - 3); g.closePath(); g.fillStyle = hgrad(g, x - 8, x + 8, '#ffd0c0'); g.fill(); stroke(g); for (let i = -1; i <= 1; i++) line(g, [x, y - 3, x + i * 5, y - 12], 'rgba(31,22,51,0.4)', 1); });
    case 'beaker':
      return make(46, 50, (g, x, y) => {
        box(g, x, y - 2, 16, 10, '#a8b4cc', '#e8eef8');
        const c = [kit.accent, kit.accent2, '#ffc93c'][v % 3];
        g.beginPath(); g.moveTo(x - 6, y - 32); g.lineTo(x - 6, y - 24); g.lineTo(x - 11, y - 14); g.lineTo(x + 1, y - 14); g.lineTo(x - 4, y - 24); g.lineTo(x - 4, y - 32); g.closePath();
        g.fillStyle = 'rgba(230,255,255,0.7)'; g.fill(); stroke(g, 1.3);
        poly(g, [x - 10, y - 16, x, y - 16, x - 2, y - 20, x - 8, y - 20], c, false);
        cyl(g, x + 7, y - 14, 4, 12, 'rgba(230,255,255,0.8)'); poly(g, [x + 3, y - 14, x + 11, y - 14, x + 11, y - 20, x + 3, y - 20], kit.accent2, false);
      }, { glow: kit.accent });
    case 'pottedplant':
      return make(36, 50, (g, x, y) => { cyl(g, x, y - 2, 8, 10, '#ff8a65'); ball(g, x - 5, y - 20, 7, 7, '#4caf50'); ball(g, x + 5, y - 22, 7, 7, '#3e9a4e'); ball(g, x, y - 28, 8, 8, '#5cc25a'); }, { sway: 0.6 });
    case 'coil':
      return make(40, 80, (g, x, y) => { box(g, x, y - 2, 12, 8, '#6e7ca0'); cyl(g, x, y - 12, 4, 34, '#c8a060'); for (let i = 0; i < 6; i++) ellipse(g, x, y - 16 - i * 5, 7, 3, '#e0a040', true); ball(g, x, y - 52, 8, 8, '#d8e0f0'); glow(g, x, y - 52, 16, kit.accent, 0.5); }, { glow: kit.accent });
    case 'pipe':
      return make(56, 50, (g, x, y) => { line(g, [x - 20, y - 6, x - 20, y - 26, x + 18, y - 34, x + 18, y - 12], INK, 9); line(g, [x - 20, y - 6, x - 20, y - 26, x + 18, y - 34, x + 18, y - 12], '#a8b4cc', 6); ball(g, x - 1, y - 30, 5, 5, kit.accent2); });
    default:
      return make(40, 40, (g, x, y) => ball(g, x, y - 10, 10, 9, '#9ad35e'));
  }
}

export function drawCollectible(icon: string, kit: Kit): Art {
  return make(34, 40, (g, x, y) => {
    const cy = y - 18;
    glow(g, x, cy, 16, kit.glow, 0.7);
    switch (icon) {
      case 'drop':
        g.beginPath(); g.moveTo(x, cy - 12); g.quadraticCurveTo(x + 10, cy, x + 7, cy + 5); g.arc(x, cy + 4, 7.4, 0.1, Math.PI - 0.1); g.quadraticCurveTo(x - 10, cy, x, cy - 12);
        g.fillStyle = hgrad(g, x - 8, x + 8, '#4cc9f0', 0.35); g.fill(); stroke(g); ellipse(g, x - 3, cy + 1, 1.8, 3, 'rgba(255,255,255,0.8)'); break;
      case 'seed': ball(g, x, cy, 7, 9, '#c88a40'); line(g, [x, cy - 9, x + 3, cy - 14], '#4caf50', 2); break;
      case 'star': star(g, x, cy, 10, '#ffc93c'); break;
      case 'leaf': g.beginPath(); g.ellipse(x, cy, 6, 11, 0.5, 0, 7); g.fillStyle = '#5cc25a'; g.fill(); stroke(g); break;
      default: poly(g, [x, cy - 11, x + 9, cy - 2, x, cy + 10, x - 9, cy - 2], hgrad(g, x - 9, x + 9, kit.accent, 0.35)); line(g, [x - 9, cy - 2, x + 9, cy - 2], 'rgba(255,255,255,0.6)', 1);
    }
  });
}

export function drawSparkle(kit: Kit): Art {
  return make(34, 40, (g, x, y) => { glow(g, x, y - 16, 16, kit.glow, 0.9); star(g, x, y - 16, 9, '#ffffff', 4, 0.32, false); star(g, x + 8, y - 26, 4, '#ffffff', 4, 0.3, false); });
}

/** Study station: lectern / holo-panel / scroll stand / shell / lab panel. */
export function drawStation(kit: Kit, open = false): Art {
  return make(56, 76, (g, x, y) => {
    glow(g, x, y - 40, 28, kit.glow, open ? 0.25 : 0.55);
    switch (kit.station) {
      case 'holo':
      case 'panel': {
        box(g, x, y - 2, 13, 10, '#6e7ca0');
        poly(g, [x - 3, y - 14, x + 3, y - 14, x + 3, y - 30, x - 3, y - 30], '#8e95c0');
        poly(g, [x - 20, y - 56, x + 20, y - 46, x + 20, y - 26, x - 20, y - 36], 'rgba(120,240,255,0.55)', true, 1.4);
        for (let i = 0; i < 3; i++) line(g, [x - 14, y - 46 + i * 5 + i, x + 12, y - 40 + i * 5 + i], 'rgba(255,255,255,0.8)', 1.4);
        break;
      }
      case 'shell': {
        g.beginPath(); g.moveTo(x - 18, y - 4); g.quadraticCurveTo(x, y - 46, x + 18, y - 4); g.closePath();
        g.fillStyle = hgrad(g, x - 18, x + 18, '#ffd6e0'); g.fill(); stroke(g);
        for (let i = -2; i <= 2; i++) line(g, [x, y - 4, x + i * 7, y - 28 + Math.abs(i) * 4], 'rgba(31,22,51,0.35)', 1.2);
        ball(g, x, y - 12, 6, 5, '#ffffff');
        break;
      }
      default: {
        // lectern with open book
        const wood = kit.station === 'scroll' ? kit.stone2 : '#9a6a40';
        poly(g, [x - 6, y - 2, x - 5, y - 30, x + 5, y - 30, x + 6, y - 2], hgrad(g, x - 6, x + 6, wood));
        ellipse(g, x, y - 2, 12, 5, shade(wood, -0.2), true);
        poly(g, [x - 18, y - 36, x + 18, y - 28, x + 18, y - 22, x - 18, y - 30], shade(wood, -0.1));
        poly(g, [x - 17, y - 40, x, y - 36, x, y - 30, x - 17, y - 34], '#fff7e8', true, 1.3);
        poly(g, [x, y - 36, x + 17, y - 32, x + 17, y - 26, x, y - 30], '#ffe9c7', true, 1.3);
        for (let i = 0; i < 2; i++) { line(g, [x - 14, y - 37 + i * 2.5, x - 3, y - 34 + i * 2.5], 'rgba(31,22,51,0.4)', 0.9); line(g, [x + 3, y - 33 + i * 2.5, x + 14, y - 30 + i * 2.5], 'rgba(31,22,51,0.4)', 0.9); }
        line(g, [x - 2, y - 36, x - 2, y - 52], INK, 1.2); poly(g, [x - 2, y - 52, x + 8, y - 49, x - 2, y - 46], kit.accent2, true, 1.1);
      }
    }
  });
}

export function drawBarrier(kit: Kit): Art {
  return make(80, 96, (g, x, y) => {
    if (kit.gate === 'vines') {
      for (let k = 0; k < 5; k++) {
        const bx = x - 22 + k * 11;
        g.beginPath(); g.moveTo(bx, y - 2);
        for (let i = 1; i <= 5; i++) g.quadraticCurveTo(bx + (i % 2 ? 7 : -7), y - (i - 0.5) * 14, bx, y - i * 14);
        g.strokeStyle = INK; g.lineWidth = 6; g.stroke(); g.strokeStyle = k % 2 ? '#3e7a3a' : '#2f6a33'; g.lineWidth = 3.5; g.stroke();
        for (let i = 1; i < 5; i++) poly(g, [bx, y - i * 14, bx + 4, y - i * 14 - 3, bx + 1, y - i * 14 + 2], '#6a4428', false);
        if (k % 2 === 0) ball(g, bx + 4, y - 50 - k * 3, 3, 3, '#ff7aa8');
      }
    } else if (kit.gate === 'field') {
      const gr = g.createLinearGradient(0, y - 80, 0, y);
      gr.addColorStop(0, 'rgba(120,240,255,0.1)'); gr.addColorStop(1, 'rgba(120,240,255,0.55)');
      poly(g, [x - 30, y - 16, x + 30, y + 0, x + 30, y - 72, x - 30, y - 88], gr, false);
      for (let i = 0; i < 6; i++) line(g, [x - 30, y - 24 - i * 12, x + 30, y - 8 - i * 12], 'rgba(200,255,255,0.6)', 1);
      cyl(g, x - 30, y - 12, 5, 14, '#8e95c0'); cyl(g, x + 30, y + 4, 5, 14, '#8e95c0');
      ball(g, x - 30, y - 30, 4, 4, kit.accent); ball(g, x + 30, y - 14, 4, 4, kit.accent);
    } else {
      cyl(g, x - 26, y - 14, 6, 50, kit.stone2); cyl(g, x + 26, y + 2, 6, 50, kit.stone2);
      for (let i = 0; i < 5; i++) { const fx = x - 20 + i * 10; line(g, [fx, y - 12 + i * 3, fx, y - 60 + i * 3], INK, 4.4); line(g, [fx, y - 12 + i * 3, fx, y - 60 + i * 3], '#c8a060', 2.6); }
      line(g, [x - 26, y - 56, x + 26, y - 40], INK, 5); line(g, [x - 26, y - 56, x + 26, y - 40], kit.accent, 3);
    }
  });
}

export function drawShadow(): Art {
  return make(64, 28, (g, x, y) => {
    const gr = g.createRadialGradient(x, y - 8, 0, x, y - 8, 28);
    gr.addColorStop(0, 'rgba(20,10,40,0.38)'); gr.addColorStop(1, 'rgba(20,10,40,0)');
    g.save(); g.translate(x, y - 8); g.scale(1, 0.48); g.beginPath(); g.arc(0, 0, 28, 0, Math.PI * 2); g.restore(); g.fillStyle = gr; g.fill();
  });
}

export function drawDot(color: string, r = 4): Art {
  const { c, g } = canvas(r * 2 + 2, r * 2 + 2);
  glow(g, r + 1, r + 1, r, color, 1);
  return { c, w: r * 2 + 2, h: r * 2 + 2 };
}
export function drawPetal(color: string): Art {
  const { c, g } = canvas(12, 10);
  g.beginPath(); g.ellipse(6, 5, 5, 3, 0.4, 0, 7); g.fillStyle = color; g.fill(); g.lineWidth = 1; g.strokeStyle = 'rgba(31,22,51,0.6)'; g.stroke();
  return { c, w: 12, h: 10 };
}
export { rrect };
