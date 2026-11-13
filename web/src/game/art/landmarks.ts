/** Landmark centrepieces (3x3 footprint). Base point = footprint centre at (w/2, h-24). */
import type { Kit } from '../world/kits';
import { ball, box, canvas, cone, cyl, ellipse, glow, hgrad, INK, line, poly, shade, star, stroke, type Ctx } from './paint';
import type { Art } from './props';

const W = 170, H = 230;

function make(draw: (g: Ctx, x: number, y: number) => void): Art {
  const { c, g } = canvas(W, H);
  draw(g, W / 2, H - 24);
  return { c, w: W, h: H };
}

export const LANDMARK_KEYS = ['tower', 'well', 'tree', 'shrine', 'console', 'gate', 'statue', 'fountain', 'obelisk', 'reef', 'bloom'];

function stoneBase(g: Ctx, x: number, y: number, kit: Kit, hw = 46, h = 10) {
  box(g, x, y + 4, hw, h, kit.stone2, shade(kit.stone, 0.05));
}

export function drawLandmark(key: string, kit: Kit, state: 'idle' | 'open' = 'idle'): Art {
  const k = LANDMARK_KEYS.includes(key) ? key : 'shrine';
  const tech = kit.id === 'space' || kit.id === 'lab';
  return make((g, x, y) => {
    switch (k) {
      case 'tower': {
        stoneBase(g, x, y, kit, 40, 8);
        const body = tech ? '#b8bfdc' : kit.stone;
        cyl(g, x, y - 4, 24, 96, body);
        // stone courses
        for (let i = 1; i < 6; i++) { g.strokeStyle = 'rgba(31,22,51,0.18)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(x, y - 4 - i * 16, 24, 12, 0, 0.1, Math.PI - 0.1); g.stroke(); }
        // window + door
        poly(g, [x - 6, y + 4, x - 6, y - 18, x + 6, y - 18, x + 6, y + 6], shade(kit.cliff.under, 0.1));
        ball(g, x - 8, y - 60, 5, 7, kit.glow);
        cyl(g, x, y - 100, 30, 8, shade(body, -0.15));
        // crystal/sun lamp at top
        glow(g, x, y - 140, 40, kit.glow, 0.55);
        if (tech) { poly(g, [x, y - 170, x + 14, y - 140, x, y - 112, x - 14, y - 140], hgrad(g, x - 14, x + 14, kit.accent, 0.4)); }
        else { cone(g, x, y - 108, 28, 30, kit.accent2 === '#ff7aa8' ? '#e8664a' : kit.accent2); ball(g, x, y - 150, 14, 14, kit.accent); star(g, x, y - 150, 9, '#fff7c8', 8, 0.55, false); }
        break;
      }
      case 'well': {
        stoneBase(g, x, y, kit, 40, 6);
        cyl(g, x, y - 2, 30, 26, kit.stone);
        ellipse(g, x, y - 28, 22, 11, kit.water.deep, true);
        ellipse(g, x - 4, y - 30, 10, 4, kit.water.shallow);
        // posts + roof
        poly(g, [x - 30, y - 24, x - 26, y - 24, x - 26, y - 80, x - 30, y - 80], '#8a5a36');
        poly(g, [x + 26, y - 24, x + 30, y - 24, x + 30, y - 80, x + 26, y - 80], '#6a4428');
        line(g, [x - 26, y - 64, x + 26, y - 64], INK, 3.4); line(g, [x - 26, y - 64, x + 26, y - 64], '#c8a070', 2);
        line(g, [x, y - 64, x, y - 44], '#6a4428', 1.4); box(g, x, y - 38, 6, 8, '#a8743e');
        poly(g, [x - 44, y - 74, x, y - 110, x + 44, y - 74, x + 36, y - 70, x, y - 98, x - 36, y - 70], tech ? '#8e95c0' : '#d0604a');
        poly(g, [x - 36, y - 70, x, y - 98, x + 36, y - 70, x, y - 86], shade(tech ? '#8e95c0' : '#d0604a', -0.25));
        break;
      }
      case 'tree': {
        // giant ancient tree with face-less bark, roots
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * 10, y - 20); g.quadraticCurveTo(x + s * 30, y - 6, x + s * 44, y + 4); g.lineTo(x + s * 30, y + 4); g.quadraticCurveTo(x + s * 18, y - 4, x + s * 6, y - 8); g.closePath(); g.fillStyle = '#7a4a2c'; g.fill(); stroke(g); }
        poly(g, [x - 20, y + 2, x - 16, y - 80, x - 8, y - 96, x + 10, y - 96, x + 18, y - 80, x + 22, y + 2], hgrad(g, x - 22, x + 22, '#8a5a36', 0.3));
        line(g, [x - 6, y - 10, x - 3, y - 60], 'rgba(31,22,51,0.3)', 1.5); line(g, [x + 8, y - 20, x + 6, y - 70], 'rgba(31,22,51,0.3)', 1.5);
        const leaf = kit.id === 'ocean' ? '#3fae8a' : '#3e9a4e';
        ball(g, x - 40, y - 110, 34, 28, shade(leaf, -0.1));
        ball(g, x + 40, y - 112, 34, 28, shade(leaf, -0.18));
        ball(g, x, y - 150, 46, 38, leaf);
        ball(g, x - 22, y - 128, 26, 20, shade(leaf, 0.08));
        ellipse(g, x - 16, y - 172, 14, 6, 'rgba(255,255,255,0.3)', false, -0.4);
        for (let i = 0; i < 6; i++) ball(g, x - 40 + i * 16, y - 120 - (i % 3) * 16, 3.2, 3.2, kit.accent);
        break;
      }
      case 'fountain': {
        stoneBase(g, x, y, kit, 50, 4);
        cyl(g, x, y - 2, 42, 14, kit.stone);
        ellipse(g, x, y - 16, 36, 18, kit.water.shallow, true);
        ellipse(g, x - 8, y - 18, 14, 5, kit.water.foam);
        cyl(g, x, y - 16, 8, 34, kit.stone2);
        cyl(g, x, y - 50, 20, 6, kit.stone);
        ellipse(g, x, y - 56, 15, 7, kit.water.shallow, true);
        g.strokeStyle = kit.water.foam; g.lineWidth = 3;
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x, y - 70); g.quadraticCurveTo(x + s * 18, y - 84, x + s * 26, y - 22); g.stroke(); }
        ball(g, x, y - 72, 6, 6, kit.accent);
        break;
      }
      case 'console': {
        stoneBase(g, x, y, kit, 44, 6);
        box(g, x, y - 4, 34, 30, '#6e7ca0', '#8e95c0');
        poly(g, [x - 30, y - 58, x, y - 44, x + 30, y - 58, x + 30, y - 90, x, y - 76, x - 30, y - 90], '#2a3048');
        poly(g, [x - 26, y - 62, x - 2, y - 50, x - 2, y - 74, x - 26, y - 86], 'rgba(94,242,255,0.75)', false);
        poly(g, [x + 2, y - 50, x + 26, y - 62, x + 26, y - 86, x + 2, y - 74], 'rgba(255,107,214,0.6)', false);
        glow(g, x, y - 120, 34, kit.accent, 0.5);
        ball(g, x, y - 122, 18, 18, kit.accent2); ellipse(g, x, y - 122, 30, 7, 'rgba(255,255,255,0)', true, -0.2);
        g.strokeStyle = kit.accent; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y - 122, 30, 8, -0.2, 0, 7); g.stroke();
        for (let i = 0; i < 4; i++) ball(g, x - 18 + i * 12, y - 36 + (i % 2) * 3, 2.6, 2.6, ['#ff5d8f', '#ffc93c', '#3ddc97', '#4cc9f0'][i], false);
        break;
      }
      case 'gate': {
        stoneBase(g, x, y, kit, 50, 6);
        box(g, x - 34, y - 6 - 17, 12, 80, kit.stone); box(g, x + 34, y - 6 + 17, 12, 80, kit.stone);
        poly(g, [x - 48, y - 116, x + 48, y - 70, x + 48, y - 82, x - 48, y - 128], kit.stone2);
        poly(g, [x - 48, y - 128, x + 48, y - 82, x + 36, y - 88, x - 36, y - 132], shade(kit.stone, 0.15));
        glow(g, x, y - 60, 30, kit.accent, 0.5);
        star(g, x, y - 106, 8, kit.accent, 5, 0.5);
        break;
      }
      case 'statue': {
        stoneBase(g, x, y, kit, 32, 6);
        box(g, x, y - 4, 20, 26, kit.stone2);
        ball(g, x, y - 50, 14, 18, kit.stone);
        ball(g, x, y - 78, 12, 12, kit.stone);
        ellipse(g, x - 14, y - 46, 5, 12, kit.stone, true, 0.4);
        poly(g, [x - 10, y - 88, x - 6, y - 100, x, y - 92, x + 6, y - 100, x + 10, y - 88], kit.accent);
        if (kit.id === 'forest') { ellipse(g, x + 6, y - 40, 8, 4, '#6cc04a'); ellipse(g, x - 4, y - 70, 5, 2.5, '#6cc04a'); }
        break;
      }
      case 'obelisk': {
        stoneBase(g, x, y, kit, 36, 8);
        poly(g, [x - 16, y - 4, x - 10, y - 130, x, y - 146, x, y - 4 + 8], shade(kit.stone, 0.05));
        poly(g, [x, y + 4, x, y - 146, x + 10, y - 130, x + 16, y - 4], shade(kit.stone, -0.25));
        for (let i = 0; i < 5; i++) line(g, [x - 8, y - 30 - i * 20, x - 4, y - 28 - i * 20], 'rgba(31,22,51,0.5)', 1.6);
        poly(g, [x - 10, y - 130, x, y - 146, x + 10, y - 130, x, y - 122], kit.accent2);
        glow(g, x, y - 140, 24, kit.glow, 0.45);
        break;
      }
      case 'reef': {
        ellipse(g, x, y, 54, 24, shade(kit.ground.top, -0.1), true);
        const cols = ['#ff7a8a', '#ffb24c', '#c86bfa', '#ff8fd0', '#4cc9f0'];
        const br = (bx: number, by: number, a: number, len: number, d: number, c: string) => {
          const ex = bx + Math.cos(a) * len, ey = by + Math.sin(a) * len;
          line(g, [bx, by, ex, ey], INK, d + 3); line(g, [bx, by, ex, ey], c, d);
          if (len > 10) { br(ex, ey, a - 0.5, len * 0.72, d * 0.78, c); br(ex, ey, a + 0.45, len * 0.68, d * 0.78, c); } else ball(g, ex, ey, d * 0.7 + 1, d * 0.7 + 1, shade(c, 0.25), false);
        };
        br(x - 26, y - 4, -Math.PI / 2 - 0.2, 34, 9, cols[0]); br(x + 22, y - 2, -Math.PI / 2 + 0.2, 30, 8, cols[2]); br(x, y - 8, -Math.PI / 2, 46, 10, cols[3]);
        ball(g, x - 40, y - 6, 14, 10, cols[1]); ball(g, x + 40, y - 4, 12, 9, cols[4]);
        break;
      }
      case 'bloom': {
        stoneBase(g, x, y, kit, 46, 6);
        // stem + leaves
        g.beginPath(); g.moveTo(x - 5, y); g.quadraticCurveTo(x - 12, y - 40, x - 2, y - 76); g.lineTo(x + 6, y - 76); g.quadraticCurveTo(x - 4, y - 40, x + 5, y); g.closePath();
        g.fillStyle = hgrad(g, x - 10, x + 8, '#4caf50'); g.fill(); stroke(g);
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x, y - 24 - (s + 1) * 8); g.quadraticCurveTo(x + s * 40, y - 54, x + s * 50, y - 26); g.quadraticCurveTo(x + s * 24, y - 22, x, y - 24 - (s + 1) * 8); g.fillStyle = s < 0 ? '#5cc25a' : '#3e9a4e'; g.fill(); stroke(g); }
        const cy = y - 100;
        if (state === 'open') {
          glow(g, x, cy, 70, kit.glow, 0.6);
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            g.save(); g.translate(x + Math.cos(a) * 22, cy + Math.sin(a) * 12); g.rotate(a + Math.PI / 2);
            g.beginPath(); g.ellipse(0, 0, 13, 28, 0, 0, Math.PI * 2); g.fillStyle = hgrad(g, -13, 13, i % 2 ? '#ff7aa8' : '#ff9fc4', 0.3); g.fill(); stroke(g); g.restore();
          }
          ball(g, x, cy, 20, 13, '#ffc93c');
          for (let i = 0; i < 8; i++) ball(g, x - 10 + (i % 4) * 7, cy - 4 + Math.floor(i / 4) * 7, 2, 2, '#c88a20', false);
        } else {
          for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.32; g.save(); g.translate(x + 1, cy + 14); g.rotate(a + Math.PI / 2); g.beginPath(); g.ellipse(0, -24, 12, 28, 0, 0, Math.PI * 2); g.fillStyle = hgrad(g, -12, 12, i % 2 ? '#b8a0b0' : '#a890a0', 0.3); g.fill(); stroke(g); g.restore(); }
        }
        break;
      }
      default: { // shrine
        stoneBase(g, x, y, kit, 46, 8);
        box(g, x, y - 6, 34, 40, kit.stone);
        poly(g, [x - 12, y - 6, x - 12, y - 34, x + 2, y - 30, x + 2, y + 1], shade(kit.cliff.under, 0.15));
        poly(g, [x - 44, y - 46, x, y - 100, x + 44, y - 46, x, y - 22], tech ? '#8e95c0' : kit.accent2 === '#ff7aa8' ? '#c8604a' : kit.accent2);
        poly(g, [x - 44, y - 46, x, y - 22, x, y - 16, x - 44, y - 40], shade(kit.stone2, -0.1));
        poly(g, [x, y - 22, x + 44, y - 46, x + 44, y - 40, x, y - 16], shade(kit.stone2, -0.35));
        glow(g, x + 10, y - 48, 16, kit.glow, 0.7);
        star(g, x, y - 72, 7, kit.accent, 5, 0.5);
      }
    }
  });
}

export function landmarkAnchorY(): number { return 24; }
export { cone, cyl };
