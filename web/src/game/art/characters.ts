/**
 * Chibi 3/4-view characters drawn in code: distinct silhouettes per archetype, volume shading, ink outline.
 * Sheet layout: 12 frames — [front: idle0 idle1 walk0..3][back: idle0 idle1 walk0..3]. Front faces SE, back faces NE; flipX for the other two.
 */
import { ball, canvas, ellipse, glow, hgrad, INK, line, poly, shade, star, stroke, type Ctx } from './paint';
import { ART } from '../core/iso';

export const FW = 64, FH = 88;
export const FRAMES = 12;

interface Human { skin: string; shirt: string; pants: string; hair: string; hat?: 'helmet' | 'wizard' | 'knight' | 'cap' | 'turban' | 'hard' | 'safari' | 'none' | 'goggles'; cape?: string; prop?: 'staff' | 'scroll' | 'bag' | 'wrench' | 'flask' | 'none' }

const HUMANS: Record<string, Human> = {
  kid: { skin: '#f6c7a0', shirt: '#ffc93c', pants: '#4c7dff', hair: '#5a3a28', hat: 'cap' },
  astronaut: { skin: '#f0c098', shirt: '#eef2ff', pants: '#c8cde8', hair: '#3a2a20', hat: 'helmet' },
  wizard: { skin: '#f6c7a0', shirt: '#6b5fd8', pants: '#4a3fa8', hair: '#e8e8f0', hat: 'wizard', prop: 'staff' },
  knight: { skin: '#f0c098', shirt: '#c8cde8', pants: '#8e95b8', hair: '#8a5a30', hat: 'knight', cape: '#e8434a' },
  merchant: { skin: '#d8a070', shirt: '#2ec4b6', pants: '#8a5a30', hair: '#2a1a10', hat: 'turban', prop: 'bag' },
  scribe: { skin: '#c88a5a', shirt: '#fff7e8', pants: '#e8d8b0', hair: '#1a1010', hat: 'none', prop: 'scroll' },
  builder: { skin: '#e0a878', shirt: '#ff8a3c', pants: '#4a6aa8', hair: '#3a2a20', hat: 'hard', prop: 'wrench' },
  explorer: { skin: '#e8b088', shirt: '#c8a868', pants: '#7a6040', hair: '#6a3a20', hat: 'safari', prop: 'bag' },
  scientist: { skin: '#f6c7a0', shirt: '#ffffff', pants: '#5a5a8a', hair: '#ff8a3c', hat: 'goggles', prop: 'flask' },
};

function face(g: Ctx, x: number, y: number, s = 1, blink = false, dark = INK) {
  if (blink) { line(g, [x - 7 * s, y, x - 3 * s, y], dark, 1.6); line(g, [x + 3 * s, y, x + 7 * s, y], dark, 1.6); }
  else {
    ellipse(g, x - 5 * s, y, 2.2 * s, 3 * s, dark); ellipse(g, x + 5 * s, y, 2.2 * s, 3 * s, dark);
    ellipse(g, x - 5.6 * s, y - 1 * s, 0.9 * s, 1 * s, '#ffffff'); ellipse(g, x + 4.4 * s, y - 1 * s, 0.9 * s, 1 * s, '#ffffff');
  }
  ellipse(g, x - 9 * s, y + 4 * s, 2.6 * s, 1.5 * s, 'rgba(255,110,140,0.45)'); ellipse(g, x + 9 * s, y + 4 * s, 2.6 * s, 1.5 * s, 'rgba(255,110,140,0.45)');
  g.beginPath(); g.arc(x, y + 4 * s, 2.4 * s, 0.15, Math.PI - 0.15); g.strokeStyle = dark; g.lineWidth = 1.3; g.stroke();
}

function legs(g: Ctx, x: number, y: number, phase: number, color: string, shoe = '#3a2a40') {
  const sw = [3, 0, -3, 0][phase] ?? 0;
  for (const s of [-1, 1]) {
    const off = s * sw;
    poly(g, [x + s * 5 - 3, y - 14, x + s * 5 + 3, y - 14, x + s * 5 + 3 + off * 0.3, y - 3 + Math.min(0, -off * 0.4), x + s * 5 - 3 + off * 0.3, y - 3 + Math.min(0, -off * 0.4)], color, true, 1.4);
    ellipse(g, x + s * 5 + off * 0.3, y - 2 + Math.min(0, -off * 0.4), 4.2, 2.6, shoe, true);
  }
}

function drawHuman(g: Ctx, x: number, y: number, h: Human, back: boolean, phase: number, idle: boolean, frameIdx: number) {
  const bob = idle ? (frameIdx % 2) * 1 : [0, -2, 0, -2][phase];
  legs(g, x, y, idle ? 1 : phase, h.pants);
  const by = y - 12 + bob;
  if (h.cape && !back) poly(g, [x - 12, by - 22, x + 12, by - 22, x + 15, by + 2, x - 15, by + 2], shade(h.cape, -0.2));
  // torso
  g.beginPath(); g.roundRect(x - 11, by - 24, 22, 24, 9); g.fillStyle = hgrad(g, x - 11, x + 11, h.shirt, 0.22); g.fill(); stroke(g);
  if (h.cape && back) poly(g, [x - 12, by - 24, x + 12, by - 24, x + 15, by + 1, x - 15, by + 1], h.cape);
  // arms swing
  const aw = idle ? 0 : [3, 0, -3, 0][phase];
  ball(g, x - 13, by - 12 + aw * 0.5, 4, 7, shade(h.shirt, -0.05));
  ball(g, x + 13, by - 12 - aw * 0.5, 4, 7, shade(h.shirt, -0.2));
  ball(g, x - 13, by - 6 + aw * 0.5, 3, 3, h.skin); ball(g, x + 13, by - 6 - aw * 0.5, 3, 3, shade(h.skin, -0.1));
  // props
  if (h.prop === 'staff') { line(g, [x + 16, by + 8, x + 18, by - 40], INK, 4); line(g, [x + 16, by + 8, x + 18, by - 40], '#a8743e', 2.2); ball(g, x + 18, by - 42, 4.5, 4.5, '#5ef2ff'); glow(g, x + 18, by - 42, 10, '#5ef2ff', 0.5); }
  if (h.prop === 'scroll' && !back) { poly(g, [x - 6, by - 14, x + 8, by - 16, x + 8, by - 6, x - 6, by - 4], '#fff1c8', true, 1.2); }
  if (h.prop === 'bag') ball(g, back ? x : x - 10, by - 8, 6, 6, '#a8743e');
  if (h.prop === 'wrench' && !back) { line(g, [x + 13, by - 4, x + 20, by - 16], INK, 4); line(g, [x + 13, by - 4, x + 20, by - 16], '#c8cde8', 2); }
  if (h.prop === 'flask' && !back) { poly(g, [x + 11, by - 10, x + 17, by - 10, x + 20, by - 2, x + 8, by - 2], 'rgba(61,220,151,0.85)', true, 1.2); }
  // head
  const hy = by - 36;
  if (h.hat === 'helmet') { ball(g, x, hy, 17, 16, '#eef2ff'); }
  ball(g, x, hy, 14, 13, h.skin);
  // hair
  if (h.hat !== 'helmet') {
    if (back) ball(g, x, hy - 1, 14.5, 13, h.hair);
    else { g.beginPath(); g.ellipse(x, hy - 4, 14.5, 10, 0, Math.PI * 1.02, Math.PI * 1.98); g.closePath(); g.fillStyle = h.hair; g.fill(); stroke(g, 1.2); }
  }
  if (!back) face(g, x + 2, hy + 1, 0.9, idle && frameIdx % 2 === 1 && false);
  switch (h.hat) {
    case 'helmet': g.beginPath(); g.ellipse(x + 2, hy + 1, 12, 10, 0, 0, Math.PI * 2); g.fillStyle = back ? '#d8dcf0' : 'rgba(120,200,255,0.35)'; g.fill(); stroke(g, 1.2); ellipse(g, x - 5, hy - 6, 3, 2, 'rgba(255,255,255,0.8)'); break;
    case 'wizard': poly(g, [x - 17, hy - 6, x + 17, hy - 6, x + 6, hy - 42, x - 2, hy - 36], h.shirt); star(g, x, hy - 18, 4, '#ffc93c', 5, 0.5, false); break;
    case 'knight': g.beginPath(); g.ellipse(x, hy - 3, 15, 12, 0, Math.PI, 0); g.closePath(); g.fillStyle = hgrad(g, x - 15, x + 15, '#c8cde8'); g.fill(); stroke(g); poly(g, [x - 2, hy - 15, x + 2, hy - 15, x + 6, hy - 26, x - 1, hy - 22], h.cape ?? '#e8434a'); break;
    case 'cap': g.beginPath(); g.ellipse(x, hy - 5, 14, 9, 0, Math.PI, 0); g.closePath(); g.fillStyle = '#ff5d8f'; g.fill(); stroke(g); if (!back) ellipse(g, x + 10, hy - 5, 8, 3, '#e04a7a', true); break;
    case 'turban': ball(g, x, hy - 8, 15, 9, '#ffc93c'); ball(g, x + 3, hy - 13, 4, 4, '#ff5d8f'); break;
    case 'hard': g.beginPath(); g.ellipse(x, hy - 5, 15, 10, 0, Math.PI, 0); g.closePath(); g.fillStyle = '#ffc93c'; g.fill(); stroke(g); line(g, [x - 16, hy - 5, x + 16, hy - 5], INK, 2); break;
    case 'safari': ellipse(g, x, hy - 6, 19, 5, '#c8a868', true); ball(g, x, hy - 10, 11, 7, '#d8b878'); break;
    case 'goggles': if (!back) { ellipse(g, x - 3, hy - 7, 4, 3.4, 'rgba(120,220,255,0.8)', true); ellipse(g, x + 7, hy - 7, 4, 3.4, 'rgba(120,220,255,0.8)', true); } break;
  }
}

type Drawer = (g: Ctx, x: number, y: number, back: boolean, phase: number, idle: boolean, fi: number) => void;

const floatBob = (fi: number) => Math.sin((fi / 6) * Math.PI * 2) * 2.5;

const SPECIAL: Record<string, Drawer> = {
  sunflower: (g, x, y, back, phase, idle, fi) => {
    const bob = idle ? fi % 2 : [0, -2, 0, -2][phase];
    // pot-feet
    legs(g, x, y, idle ? 1 : phase, '#3e9a4e', '#2f7a3a');
    g.beginPath(); g.moveTo(x - 4, y - 12); g.quadraticCurveTo(x - 8, y - 30 + bob, x - 1, y - 40 + bob); g.lineTo(x + 4, y - 40 + bob); g.quadraticCurveTo(x - 2, y - 28, x + 4, y - 12); g.closePath(); g.fillStyle = '#4caf50'; g.fill(); stroke(g);
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x, y - 26 + bob); g.quadraticCurveTo(x + s * 16, y - 36 + bob, x + s * 20, y - 22 + bob); g.quadraticCurveTo(x + s * 10, y - 20 + bob, x, y - 26 + bob); g.fillStyle = s < 0 ? '#5cc25a' : '#3e9a4e'; g.fill(); stroke(g, 1.3); }
    const hy = y - 58 + bob;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ellipse(g, x + Math.cos(a) * 17, hy + Math.sin(a) * 15, 7, 4.6, i % 2 ? '#ffc93c' : '#ffd84c', true, a); }
    ball(g, x, hy, 13, 12, back ? '#5a8a3a' : '#8a5a30');
    if (!back) face(g, x + 1, hy, 0.85, false, '#2a1408');
  },
  'water-spirit': (g, x, y, back, _p, _i, fi) => {
    const b = floatBob(fi);
    glow(g, x, y - 34 + b, 34, '#8ae6ff', 0.4);
    g.beginPath(); g.moveTo(x, y - 74 + b); g.bezierCurveTo(x + 26, y - 40 + b, x + 26, y - 8 + b, x, y - 8 + b); g.bezierCurveTo(x - 26, y - 8 + b, x - 26, y - 40 + b, x, y - 74 + b);
    const gr = g.createLinearGradient(x - 20, 0, x + 20, 0); gr.addColorStop(0, 'rgba(160,236,255,0.95)'); gr.addColorStop(1, 'rgba(47,143,216,0.95)'); g.fillStyle = gr; g.fill(); stroke(g);
    ellipse(g, x - 9, y - 44 + b, 4, 9, 'rgba(255,255,255,0.65)', false, 0.3);
    for (let i = 0; i < 3; i++) ball(g, x - 12 + i * 12, y - 4 + ((fi + i) % 3) * -2, 3, 3, 'rgba(160,236,255,0.9)');
    if (!back) face(g, x + 2, y - 32 + b, 0.9, false, '#123a6a');
  },
  tree: (g, x, y, back, phase, idle, fi) => {
    const bob = idle ? fi % 2 : [0, -2, 0, -2][phase];
    legs(g, x, y, idle ? 1 : phase, '#7a4a2c', '#5a3420');
    g.beginPath(); g.roundRect(x - 15, y - 48 + bob, 30, 38, 10); g.fillStyle = hgrad(g, x - 15, x + 15, '#8a5a36', 0.25); g.fill(); stroke(g);
    line(g, [x - 6, y - 40 + bob, x - 5, y - 14 + bob], 'rgba(31,22,51,0.3)', 1.3);
    ball(g, x - 14, y - 58 + bob, 13, 11, '#3e9a4e'); ball(g, x + 14, y - 58 + bob, 13, 11, '#2f8a44'); ball(g, x, y - 68 + bob, 17, 14, '#4caf50');
    ellipse(g, x - 8, y - 75 + bob, 5, 2.4, 'rgba(255,255,255,0.3)', false, -0.4);
    // beard of moss
    if (!back) { face(g, x + 1, y - 34 + bob, 0.85, false, '#2a1408'); poly(g, [x - 8, y - 24 + bob, x + 10, y - 24 + bob, x + 1, y - 12 + bob], '#8acf6a', true, 1.1); }
  },
  robot: (g, x, y, back, phase, idle, fi) => {
    const bob = idle ? fi % 2 : [0, -1, 0, -1][phase];
    legs(g, x, y, idle ? 1 : phase, '#8e95b8', '#4a4f6a');
    g.beginPath(); g.roundRect(x - 13, y - 38 + bob, 26, 26, 5); g.fillStyle = hgrad(g, x - 13, x + 13, '#c8cde8'); g.fill(); stroke(g);
    if (!back) { ball(g, x, y - 26 + bob, 4, 4, '#ff5d8f'); }
    g.beginPath(); g.roundRect(x - 15, y - 66 + bob, 30, 24, 7); g.fillStyle = hgrad(g, x - 15, x + 15, '#dfe4f8'); g.fill(); stroke(g);
    if (!back) { g.beginPath(); g.roundRect(x - 11, y - 61 + bob, 24, 14, 5); g.fillStyle = '#2a3048'; g.fill(); ellipse(g, x - 3, y - 54 + bob, 3, 3.6, '#5ef2ff'); ellipse(g, x + 7, y - 54 + bob, 3, 3.6, '#5ef2ff'); }
    line(g, [x, y - 66 + bob, x, y - 76 + bob], INK, 2); ball(g, x, y - 78 + bob, 3.4, 3.4, '#ffc93c');
    ball(g, x - 16, y - 28 + bob, 4, 6, '#a8b0d0'); ball(g, x + 16, y - 28 + bob, 4, 6, '#8e95b8');
  },
  alien: (g, x, y, back, phase, idle, fi) => {
    const bob = idle ? fi % 2 : [0, -2, 0, -2][phase];
    legs(g, x, y, idle ? 1 : phase, '#5ac86a', '#3a8a4a');
    ball(g, x, y - 24 + bob, 11, 13, '#6ad87a');
    ball(g, x, y - 52 + bob, 19, 16, '#7ae88a');
    for (const s of [-1, 1]) { line(g, [x + s * 6, y - 66 + bob, x + s * 12, y - 80 + bob], INK, 2); ball(g, x + s * 12, y - 81 + bob, 3.4, 3.4, '#ff6bd6'); }
    if (!back) { ellipse(g, x - 4, y - 52 + bob, 5, 7, INK); ellipse(g, x + 8, y - 52 + bob, 5, 7, INK); ellipse(g, x - 5, y - 55 + bob, 1.8, 2, '#fff'); ellipse(g, x + 7, y - 55 + bob, 1.8, 2, '#fff'); g.beginPath(); g.arc(x + 2, y - 44 + bob, 3, 0.2, Math.PI - 0.2); g.strokeStyle = INK; g.lineWidth = 1.3; g.stroke(); }
  },
  turtle: (g, x, y, back, phase, idle, fi) => {
    const bob = idle ? fi % 2 : [0, -1, 0, -1][phase];
    legs(g, x, y, idle ? 1 : phase, '#7acb8a', '#5aa86a');
    ball(g, x + (back ? -10 : 14), y - 34 + bob, 10, 9, '#8ad89a');
    if (!back) face(g, x + 16, y - 35 + bob, 0.6);
    g.beginPath(); g.ellipse(x - 2, y - 26 + bob, 22, 16, 0, Math.PI, 0); g.closePath(); g.fillStyle = hgrad(g, x - 24, x + 20, '#3fae6a', 0.25); g.fill(); stroke(g);
    for (let i = 0; i < 3; i++) poly(g, [x - 14 + i * 10, y - 28 + bob, x - 9 + i * 10, y - 36 + bob, x - 4 + i * 10, y - 28 + bob], '#2f8a54', true, 1.1);
    ellipse(g, x - 2, y - 26 + bob, 23, 4, '#c8b070', true);
  },
  fish: (g, x, y, back, _p, _i, fi) => {
    const b = floatBob(fi);
    const cy = y - 40 + b;
    poly(g, [x - 18, cy, x - 32, cy - 12, x - 30, cy + 12], '#ffb24c');
    ball(g, x, cy, 22, 16, '#ff8a3c');
    poly(g, [x - 4, cy - 14, x + 6, cy - 26, x + 10, cy - 13], '#ffb24c', true, 1.2);
    line(g, [x - 6, cy - 12, x - 6, cy + 12], 'rgba(255,255,255,0.6)', 3);
    if (!back) { ellipse(g, x + 10, cy - 3, 4, 5, INK); ellipse(g, x + 9, cy - 5, 1.4, 1.6, '#fff'); g.beginPath(); g.arc(x + 15, cy + 5, 2.5, 0.3, Math.PI); g.strokeStyle = INK; g.lineWidth = 1.3; g.stroke(); }
    for (let i = 0; i < 2; i++) ball(g, x + 24, cy - 14 - ((fi + i * 3) % 6) * 3, 2.2, 2.2, 'rgba(200,240,255,0.9)');
  },
  coral: (g, x, y, back, _p, _i, fi) => {
    const b = fi % 2;
    ellipse(g, x, y - 4, 16, 6, '#e8d9a2', true);
    g.beginPath(); g.roundRect(x - 13, y - 50 + b, 26, 46, 12); g.fillStyle = hgrad(g, x - 13, x + 13, '#ff7a8a', 0.25); g.fill(); stroke(g);
    for (const [ax, ay, l] of [[-12, -38, 14], [12, -42, 16], [-4, -50, 14], [6, -52, 12]]) { line(g, [x + ax, y + ay + b, x + ax * 1.6, y + ay - l + b], INK, 7); line(g, [x + ax, y + ay + b, x + ax * 1.6, y + ay - l + b], '#ff9fb0', 4.4); }
    if (!back) face(g, x + 1, y - 30 + b, 0.85);
  },
  // companions
  sprout: (g, x, y, back, _p, _i, fi) => {
    const b = floatBob(fi);
    ball(g, x, y - 20 + b, 11, 10, '#9be07a');
    line(g, [x, y - 30 + b, x, y - 38 + b], '#3e9a4e', 2.4);
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(x + s * 7, y - 41 + b, 8, 4, s * -0.5, 0, 7); g.fillStyle = s < 0 ? '#5cc25a' : '#3e9a4e'; g.fill(); stroke(g, 1.2); }
    if (!back) face(g, x + 1, y - 20 + b, 0.6);
  },
  beep: (g, x, y, back, _p, _i, fi) => {
    const b = floatBob(fi);
    glow(g, x, y - 6, 12, '#5ef2ff', 0.6);
    ball(g, x, y - 24 + b, 12, 11, '#dfe4f8');
    if (!back) { g.beginPath(); g.roundRect(x - 8, y - 29 + b, 16, 9, 4); g.fillStyle = '#2a3048'; g.fill(); ellipse(g, x - 3, y - 25 + b, 2, 2.4, '#5ef2ff'); ellipse(g, x + 4, y - 25 + b, 2, 2.4, '#5ef2ff'); }
    line(g, [x, y - 35 + b, x, y - 42 + b], INK, 1.6); ball(g, x, y - 43 + b, 2.6, 2.6, '#ff5d8f');
  },
  digit: (g, x, y, back, _p, _i, fi) => {
    const b = floatBob(fi);
    g.beginPath(); g.roundRect(x - 11, y - 36 + b, 22, 22, 6); g.fillStyle = hgrad(g, x - 11, x + 11, '#ffc93c'); g.fill(); stroke(g);
    if (!back) face(g, x + 1, y - 26 + b, 0.55); else { g.fillStyle = INK; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.fillText('7', x, y - 20 + b); }
  },
  scarab: (g, x, y, back, _p, _i, fi) => {
    const b = floatBob(fi);
    for (const s of [-1, 1]) ellipse(g, x + s * 12, y - 30 + b, 10, 5, 'rgba(200,240,255,0.6)', true, s * 0.4);
    ball(g, x, y - 24 + b, 11, 12, '#2ec4b6'); line(g, [x, y - 34 + b, x, y - 14 + b], INK, 1.2);
    ball(g, x, y - 37 + b, 6, 5, '#1f8a80'); if (!back) { ellipse(g, x - 2, y - 38 + b, 1.4, 1.6, '#fff'); ellipse(g, x + 3, y - 38 + b, 1.4, 1.6, '#fff'); }
  },
  bubble: (g, x, y, back, _p, _i, fi) => {
    const b = floatBob(fi);
    g.beginPath(); g.arc(x, y - 26 + b, 13, 0, 7); g.fillStyle = 'rgba(180,240,255,0.55)'; g.fill(); stroke(g, 1.4);
    ellipse(g, x - 5, y - 31 + b, 3, 4, 'rgba(255,255,255,0.9)', false, 0.4);
    if (!back) face(g, x + 1, y - 24 + b, 0.55);
  },
  sparky: (g, x, y, back, _p, _i, fi) => {
    const b = floatBob(fi);
    glow(g, x, y - 26 + b, 18, '#c86bfa', 0.6);
    for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(x, y - 26 + b, 15, 5, (i * Math.PI) / 3 + fi * 0.2, 0, 7); g.strokeStyle = '#c86bfa'; g.lineWidth = 1.6; g.stroke(); }
    ball(g, x, y - 26 + b, 8, 8, '#ffe27a'); if (!back) face(g, x + 1, y - 26 + b, 0.45);
  },
  goat: (g, x, y, back, phase, idle, fi) => {
    const bob = idle ? fi % 2 : [0, -2, 0, -2][phase];
    // four legs
    const sw = idle ? 0 : [3, 0, -3, 0][phase];
    for (const [lx, o] of [[-12, sw], [-5, -sw], [6, -sw], [13, sw]]) { line(g, [x + lx, y - 18, x + lx + o * 0.4, y - 3], INK, 4.6); line(g, [x + lx, y - 18, x + lx + o * 0.4, y - 3], '#e8e0d0', 2.6); ellipse(g, x + lx + o * 0.4, y - 2, 2.6, 1.6, '#3a2a40'); }
    ball(g, x, y - 26 + bob, 20, 12, '#fffaf0');
    for (let i = 0; i < 4; i++) ball(g, x - 12 + i * 8, y - 33 + bob, 5, 4, '#ffffff', false);
    ball(g, x - 20, y - 30 + bob, 3, 3, '#fffaf0');
    const hx = back ? x + 10 : x + 18, hy = y - 42 + bob;
    ball(g, hx, hy, 10, 9, '#fffaf0');
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(hx + s * 4, hy - 7); g.quadraticCurveTo(hx + s * 10 - 4, hy - 22, hx + s * 2 - 10, hy - 18); g.strokeStyle = INK; g.lineWidth = 4.4; g.stroke(); g.strokeStyle = '#c8a070'; g.lineWidth = 2.6; g.stroke(); }
    ellipse(g, hx - 10, hy - 2, 5, 2.4, '#f0e0d0', true, 0.4);
    if (!back) { ellipse(g, hx + 3, hy - 1, 2, 2.6, INK); ellipse(g, hx + 2.4, hy - 2, 0.8, 1, '#fff'); poly(g, [hx + 4, hy + 7, hx + 8, hy + 7, hx + 6, hy + 15], '#e8e0d0', true, 1.1); ellipse(g, hx + 9, hy + 2, 2, 1.4, '#ff9fb0'); }
    // scarf with brand colour
    poly(g, [hx - 8, hy + 6, hx + 6, hy + 8, hx + 5, hy + 12, hx - 9, hy + 10], '#ff5d8f', true, 1.2);
  },
};

export function hasArchetype(a: string) { return a in HUMANS || a in SPECIAL; }

export function drawSheet(archetype: string): HTMLCanvasElement {
  const key = hasArchetype(archetype) ? archetype : 'kid';
  const { c, g } = canvas(FW * FRAMES, FH);
  for (let f = 0; f < FRAMES; f++) {
    const back = f >= 6;
    const local = f % 6;
    const idle = local < 2;
    const phase = idle ? 0 : local - 2;
    g.save();
    g.beginPath(); g.rect(f * FW, 0, FW, FH); g.clip();
    const x = f * FW + FW / 2, y = FH - 4;
    if (key in HUMANS) drawHuman(g, x, y, HUMANS[key], back, phase, idle, local);
    else SPECIAL[key](g, x, y, back, phase, idle, local);
    g.restore();
  }
  return c;
}

export function portrait(archetype: string, size = 160): HTMLCanvasElement {
  const sheet = drawSheet(archetype);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d')!;
  const sw = FW * ART, sh = FH * ART;
  const scale = (size / sh) * 1.45;
  g.imageSmoothingQuality = 'high';
  g.drawImage(sheet, 0, 0, sw, sh, size / 2 - (sw * scale) / 2, size * 0.98 - sh * scale + size * 0.18, sw * scale, sh * scale);
  return c;
}
