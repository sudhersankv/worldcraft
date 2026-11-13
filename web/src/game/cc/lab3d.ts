/**
 * Curiosity Craft: in-world, hands-on Surfboard Lab.
 * A wooden dock at the water's edge, a workbench with four voxel board blanks (stone, wood, foam, fiberglass+foam),
 * a long/short shape toggle, carry-over-head, throw off the dock end, and a tiny buoyancy sim
 * (gravity + buoyancy from submerged fraction vs density, damped bobbing, roll stability by length).
 * Failure is funny plus a hint, never a penalty. Boards respawn on the bench so the kid can try them all.
 *
 * Self-contained: only uses the public Voxel API (`top`, `groundY`, `player`) plus WATER_Y, host.scene and host.camera.
 */
import * as THREE from 'three';
import type { Voxel } from './voxel';
import { WATER_Y } from './voxel';
import { DENSITY, type Lang, type Material } from '../../shared/curiosity';
import { t } from '../../i18n';
import { muted } from './speech';

export interface Lab3DHost {
  scene: THREE.Scene; camera: THREE.Camera; vox: Voxel; player: () => { x: number; z: number }; lang: Lang;
  onAttempt(e: { challenge: 'surfboard-lab'; choice: string; result: 'floats' | 'sinks' | 'wobbles' }): void;
  onSpeak(text: string): void;
}
export interface Lab3D { update(dt: number): void; interact(): boolean; prompt(): string | null; dispose(): void }

type Shape = 'long' | 'short';
type Result = 'floats' | 'sinks' | 'wobbles';
type BoardState = 'bench' | 'carried' | 'flying' | 'water' | 'gone';

const MATS: Material[] = ['stone', 'wood', 'foam', 'fiberglass-foam'];
const BOARD_COL: Record<Material, { body: string; stripe: string }> = {
  stone: { body: '#9aa0ab', stripe: '#6f7580' },
  wood: { body: '#b0702f', stripe: '#7a4a1e' },
  foam: { body: '#fff4c2', stripe: '#ffd23c' },
  'fiberglass-foam': { body: '#2ed3c6', stripe: '#ffffff' },
};
const EN_NAME: Record<Material, string> = { stone: 'stone', wood: 'wood', foam: 'foam', 'fiberglass-foam': 'fiberglass' };
const FONT = "'Atkinson Hyperlegible', 'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Tamil', 'Noto Sans SC', system-ui, -apple-system, 'Segoe UI', sans-serif";

const G = 9.8;
const SLAB = 0.2;          // physics thickness of a board (m): draft = density * SLAB
const BOARD_H = 0.14;     // visual thickness
const SUB = 1 / 240;      // physics substep
const RESPAWN = 4;        // seconds after landing before the board returns to the bench
const SPEAK_DELAY = 1.3;  // seconds after splash before the verdict
const PICK_R = 1.35, TOGGLE_R = 1.2, DROP_R = 1.7;
const MAX_P = 72;         // particle pool

// ------------------------------------------------------------------ shared, per-face shaded geometry (matches voxel.ts look)
function shadedBox(): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const nx = nor.getX(i), ny = nor.getY(i), y = pos.getY(i);
    let v: number;
    if (ny > 0.5) v = 1; else if (ny < -0.5) v = 0.6; else v = (Math.abs(nx) > 0.5 ? 0.86 : 0.76) * (y < 0 ? 0.88 : 1);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; s: number; kind: 0 | 1 | 2 } // 0 splash, 1 confetti, 2 bubble
interface Board {
  mat: Material; idx: number; group: THREE.Group; body: THREE.Mesh; nose: THREE.Mesh; stripe: THREE.Mesh;
  home: THREE.Vector3; state: BoardState; pos: THREE.Vector3; vy: number; vx: number; vz: number;
  roll: number; rollV: number; pitch: number; timer: number; spoke: boolean; shape: Shape; result: Result;
  name: THREE.Sprite; meter: THREE.Sprite; meterCanvas: HTMLCanvasElement; meterTex: THREE.CanvasTexture; pop: number;
  from: THREE.Vector3; to: THREE.Vector3; flyT: number; bubbleT: number;
}

export function createLab3D(host: Lab3DHost, dock: { x: number; z: number }): Lab3D {
  const { scene, vox } = host;
  const root = new THREE.Group(); root.name = 'lab3d'; scene.add(root);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const box = shadedBox(); geos.push(box);
  const matCache = new Map<string, THREE.Material>();
  const lam = (c: string): THREE.Material => {
    let m = matCache.get(c);
    if (!m) { m = new THREE.MeshLambertMaterial({ color: c, vertexColors: true }); matCache.set(c, m); mats.push(m); }
    return m;
  };
  const glossy = new THREE.MeshPhongMaterial({ color: BOARD_COL['fiberglass-foam'].body, vertexColors: true, shininess: 90, specular: '#ffffff' }); mats.push(glossy);
  const cube = (parent: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, m: THREE.Material) => {
    const o = new THREE.Mesh(box, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  };

  // ---------------------------------------------------------------- orientation: which way is the sea from the dock point?
  let dir = new THREE.Vector2(-1, 0), best = -1;
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    let wet = 0;
    for (let i = 1; i <= 5; i++) if (vox.top(dock.x + dx * i, dock.z + dz * i) < WATER_Y) wet++;
    if (wet > best) { best = wet; dir = new THREE.Vector2(dx, dz); }
  }
  const perp = new THREE.Vector2(-dir.y, dir.x);
  const yaw = Math.atan2(dir.x, dir.y); // local +z of a group points out to sea
  const groundAt = (x: number, z: number) => { const h = vox.groundY(x, z); return h; };
  const deckY = Math.max(groundAt(dock.x, dock.z), WATER_Y + 0.35) + 0.12; // top surface of the deck
  const at = (along: number, side: number) => new THREE.Vector3(dock.x + dir.x * along + perp.x * side, 0, dock.z + dir.y * along + perp.y * side);

  // ---------------------------------------------------------------- dock / pier
  const DOCK_LEN = 5; // tiles: 1 on land + 4 over water
  const plankA = lam('#e0a868'), plankB = lam('#c88a4c'), post = lam('#8d5a30');
  const dockG = new THREE.Group(); dockG.position.set(dock.x, 0, dock.z); dockG.rotation.y = yaw; root.add(dockG);
  for (let i = 0; i < DOCK_LEN; i++) {
    for (let s = -1; s <= 1; s++) cube(dockG, s * 0.66, deckY - 0.08, i + 0.5, 0.62, 0.16, 0.96, (i + s) % 2 ? plankA : plankB);
    if (i % 2 === 1 || i === DOCK_LEN - 1) for (const s of [-1, 1]) {
      const p = at(i + 0.5, s * 0.95); const bed = Math.min(vox.top(p.x, p.z), WATER_Y - 0.3);
      const h = deckY + 0.5 - bed; cube(dockG, s * 0.95, bed + h / 2, i + 0.5, 0.22, h, 0.22, post);
    }
  }
  const endCenter = at(DOCK_LEN - 0.4, 0);
  const drop = at(DOCK_LEN + 1.1, 0); // where boards land
  const dockA = at(0, 0), dockB = at(DOCK_LEN, 0);

  // ---------------------------------------------------------------- sign
  const signG = new THREE.Group(); const sp = at(0.2, 1.9); signG.position.set(sp.x, groundAt(sp.x, sp.z), sp.z); signG.rotation.y = yaw; root.add(signG);
  cube(signG, 0, 0.9, 0, 0.16, 1.8, 0.16, post);
  cube(signG, 0, 1.85, 0, 2.3, 0.8, 0.14, lam('#c79a5a'));
  {
    const c = document.createElement('canvas'); c.width = 512; c.height = 160; const g = c.getContext('2d')!;
    g.fillStyle = '#2ec4b6'; g.fillRect(0, 0, 512, 160); g.fillStyle = '#ffd23c'; g.fillRect(0, 0, 512, 12); g.fillRect(0, 148, 512, 12);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const title = t('lab.title', 'Surfboard Lab').toLocaleUpperCase(host.lang);
    let fs = 64; g.font = `800 ${fs}px ${FONT}`; while (g.measureText(title).width > 470 && fs > 24) { fs -= 4; g.font = `800 ${fs}px ${FONT}`; }
    g.lineWidth = 8; g.strokeStyle = '#13706a'; g.strokeText(title, 256, 82); g.fillText(title, 256, 82);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; texs.push(tex);
    const m = new THREE.MeshBasicMaterial({ map: tex }); mats.push(m);
    const pg = new THREE.PlaneGeometry(2.2, 0.69); geos.push(pg);
    for (const side of [1, -1]) { const p = new THREE.Mesh(pg, m); p.position.set(0, 1.85, side * 0.075); if (side < 0) p.rotation.y = Math.PI; signG.add(p); }
  }

  // ---------------------------------------------------------------- workbench (on land, behind the dock, running sideways)
  const benchC = at(-2.4, 0); const benchGround = groundAt(benchC.x, benchC.z); const benchTop = benchGround + 0.85;
  const benchG = new THREE.Group(); benchG.position.set(benchC.x, 0, benchC.z); benchG.rotation.y = yaw; root.add(benchG);
  cube(benchG, 0, benchTop - 0.08, 0, 5.4, 0.16, 1.5, lam('#c79a5a'));
  for (const sx of [-2.5, 2.5]) for (const sz of [-0.6, 0.6]) cube(benchG, sx, benchGround + (benchTop - benchGround) / 2 - 0.08, sz, 0.18, benchTop - benchGround - 0.16, 0.18, post);
  // shape toggle: a chunky lever box on the bench end
  const toggleG = new THREE.Group(); benchG.add(toggleG); toggleG.position.set(3.25, benchTop, 0);
  cube(toggleG, 0, 0.25, 0, 0.6, 0.5, 0.6, lam('#ff8a3c'));
  const lever = new THREE.Group(); lever.position.set(0, 0.5, 0); toggleG.add(lever);
  cube(lever, 0, 0.3, 0, 0.1, 0.6, 0.1, lam('#ffffff')); cube(lever, 0, 0.62, 0, 0.22, 0.22, 0.22, lam('#ff4d4d'));
  const toggleWorld = at(-2.4, -3.25); // local +x of a yaw-rotated group is -perp

  // ---------------------------------------------------------------- label sprites (CanvasTexture, all 8 languages)
  function label(text: string, w = 384, h = 96, bg = 'rgba(16,40,64,0.82)', fg = '#ffffff'): { sprite: THREE.Sprite; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture } {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; texs.push(tex);
    drawPill(canvas, text, bg, fg); tex.needsUpdate = true;
    const m = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }); mats.push(m);
    const sprite = new THREE.Sprite(m); sprite.scale.set(w / 160, h / 160, 1); sprite.renderOrder = 5;
    return { sprite, canvas, tex };
  }
  function drawPill(c: HTMLCanvasElement, text: string, bg: string, fg: string) {
    const g = c.getContext('2d')!; g.clearRect(0, 0, c.width, c.height);
    const r = c.height / 2 - 4; g.fillStyle = bg; g.beginPath(); g.roundRect(4, 4, c.width - 8, c.height - 8, r); g.fill();
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = Math.floor(c.height * 0.46); g.font = `700 ${fs}px ${FONT}`;
    while (g.measureText(text).width > c.width - 36 && fs > 12) { fs -= 2; g.font = `700 ${fs}px ${FONT}`; }
    g.fillText(text, c.width / 2, c.height / 2 + 2);
  }
  function drawMeter(b: Board) {
    const c = b.meterCanvas, g = c.getContext('2d')!, d = DENSITY[b.mat];
    g.clearRect(0, 0, c.width, c.height);
    const sinks = d > 1;
    g.fillStyle = 'rgba(16,40,64,0.86)'; g.beginPath(); g.roundRect(4, 4, c.width - 8, c.height - 8, 26); g.fill();
    // bar: 0..3 scale, water line at 1.0
    const x0 = 28, x1 = c.width - 28, y0 = 86, bh = 26, sc = (v: number) => x0 + (x1 - x0) * Math.min(v, 3) / 3;
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x0, y0, x1 - x0, bh);
    g.fillStyle = sinks ? '#ff6b5a' : '#5fd23c'; g.fillRect(x0, y0, Math.max(6, sc(d) - x0), bh);
    g.fillStyle = '#4fc3ff'; g.fillRect(sc(1) - 3, y0 - 10, 6, bh + 20);
    const verdict = t(sinks ? 'lab.result.sinks' : 'lab.result.floats', sinks ? 'It sinks!' : 'It floats!');
    const text = `${d} vs 💧 1.0 → ${verdict}`;
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = 34; g.font = `700 ${fs}px ${FONT}`; while (g.measureText(text).width > c.width - 40 && fs > 12) { fs -= 2; g.font = `700 ${fs}px ${FONT}`; }
    g.fillText(text, c.width / 2, 46);
    b.meterTex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- boards
  const matName = (m: Material) => t(`lab.mat.${m}`, m === 'fiberglass-foam' ? 'Fiberglass + foam' : m[0].toUpperCase() + m.slice(1));
  let shape: Shape = 'long';
  const boards: Board[] = MATS.map((mat, idx) => {
    const group = new THREE.Group(); root.add(group);
    const col = BOARD_COL[mat];
    const bodyM = mat === 'fiberglass-foam' ? glossy : lam(col.body);
    const body = cube(group, 0, 0, 0, 0.55, BOARD_H, 1, bodyM);
    const nose = cube(group, 0, 0, 0, 0.34, BOARD_H * 0.9, 0.3, bodyM);
    const stripe = cube(group, 0, BOARD_H / 2 + 0.01, 0, 0.1, 0.03, 1, lam(col.stripe));
    if (mat === 'wood') cube(group, 0.15, BOARD_H / 2 + 0.005, 0, 0.04, 0.02, 0.8, lam('#8a5426')).userData.grain = true; // grain line
    const home = at(-2.4, -1.95 + idx * 1.3); home.y = benchTop + BOARD_H / 2 + 0.01;
    const nl = label(matName(mat), 320, 80, 'rgba(255,255,255,0.92)', '#16324a'); root.add(nl.sprite);
    const ml = label('', 448, 128); ml.sprite.scale.set(448 / 150, 128 / 150, 1); ml.sprite.visible = false; root.add(ml.sprite);
    const b: Board = {
      mat, idx, group, body, nose, stripe, home, state: 'bench', pos: home.clone(), vy: 0, vx: 0, vz: 0, roll: 0, rollV: 0, pitch: 0,
      timer: 0, spoke: false, shape, result: 'floats', name: nl.sprite, meter: ml.sprite, meterCanvas: ml.canvas, meterTex: ml.tex, pop: 1,
      from: new THREE.Vector3(), to: new THREE.Vector3(), flyT: 0, bubbleT: 0,
    };
    applyShape(b, shape); drawMeter(b);
    return b;
  });
  function applyShape(b: Board, s: Shape) {
    b.shape = s; const L = s === 'long' ? 1.55 : 1.0;
    b.body.scale.z = L; b.body.position.z = -0.08;
    b.nose.position.z = L / 2 + 0.06 - 0.08; b.nose.scale.z = 0.3;
    b.stripe.scale.z = L * 0.92; b.stripe.position.z = -0.08;
  }

  // ---------------------------------------------------------------- particles (one instanced mesh, fixed pool)
  const pGeo = new THREE.BoxGeometry(1, 1, 1); geos.push(pGeo);
  const pMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false }); mats.push(pMat);
  const pMesh = new THREE.InstancedMesh(pGeo, pMat, MAX_P); pMesh.frustumCulled = false; pMesh.renderOrder = 4; root.add(pMesh);
  const parts: Particle[] = []; for (let i = 0; i < MAX_P; i++) parts.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s: 0.1, kind: 0 });
  const CONF = ['#ff4d4d', '#ffd23c', '#2ec4b6', '#c86bfa', '#5fd23c', '#ff8a3c'].map((c) => new THREE.Color(c));
  const C_SPLASH = new THREE.Color('#dff6ff'), C_BUB = new THREE.Color('#bfefff');
  const mtx = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < MAX_P; i++) { pMesh.setMatrixAt(i, zero); pMesh.setColorAt(i, C_SPLASH); }
  let pNext = 0;
  function emit(kind: 0 | 1 | 2, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s: number) {
    const p = parts[pNext]; const i = pNext; pNext = (pNext + 1) % MAX_P;
    p.kind = kind; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.s = s;
    pMesh.setColorAt(i, kind === 1 ? CONF[i % CONF.length] : kind === 2 ? C_BUB : C_SPLASH);
    if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
  }
  function splash(x: number, z: number, n: number, confetti: boolean) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 1.6; emit(0, x, WATER_Y + 0.05, z, Math.cos(a) * r, 2.5 + Math.random() * 2.5, Math.sin(a) * r, 0.6 + Math.random() * 0.4, 0.09 + Math.random() * 0.07); }
    if (confetti) for (let i = 0; i < 22; i++) { const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 1.4; emit(1, x, WATER_Y + 0.3, z, Math.cos(a) * r, 4 + Math.random() * 2.5, Math.sin(a) * r, 1.6 + Math.random() * 0.6, 0.08); }
  }

  // ---------------------------------------------------------------- procedural audio (WebAudio, created on first interaction)
  let ac: AudioContext | null = null;
  function audio(): AudioContext | null {
    if (muted) return null;
    try {
      if (!ac) { const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!AC) return null; ac = new AC(); }
      if (ac.state === 'suspended') void ac.resume();
      return ac;
    } catch { return null; }
  }
  function sndSplash(big: boolean) {
    const a = audio(); if (!a) return;
    const n = Math.floor(a.sampleRate * 0.35); const buf = a.createBuffer(1, n, a.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = big ? 1400 : 2400;
    const gn = a.createGain(); gn.gain.value = big ? 0.35 : 0.22;
    src.connect(f).connect(gn).connect(a.destination); src.start();
  }
  function sndBloop() {
    const a = audio(); if (!a) return; const now = a.currentTime;
    for (let k = 0; k < 2; k++) {
      const o = a.createOscillator(); o.type = 'sine'; const gn = a.createGain(); const t0 = now + 0.12 + k * 0.22;
      o.frequency.setValueAtTime(520 - k * 140, t0); o.frequency.exponentialRampToValueAtTime(90, t0 + 0.28);
      gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
      o.connect(gn).connect(a.destination); o.start(t0); o.stop(t0 + 0.34);
    }
  }
  function sndChime() {
    const a = audio(); if (!a) return; const now = a.currentTime;
    [660, 880, 1320].forEach((fq, k) => {
      const o = a.createOscillator(); o.type = 'triangle'; o.frequency.value = fq; const gn = a.createGain(); const t0 = now + 0.15 + k * 0.09;
      gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      o.connect(gn).connect(a.destination); o.start(t0); o.stop(t0 + 0.42);
    });
  }
  function sndPick() {
    const a = audio(); if (!a) return; const now = a.currentTime;
    const o = a.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(330, now); o.frequency.exponentialRampToValueAtTime(660, now + 0.08);
    const gn = a.createGain(); gn.gain.setValueAtTime(0.06, now); gn.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    o.connect(gn).connect(a.destination); o.start(now); o.stop(now + 0.13);
  }

  // ---------------------------------------------------------------- camera nudge (zero-sum offset so it never drifts the rig)
  let shakeT = 0, shakeAmp = 0; const shakeOff = new THREE.Vector3(), shakeNew = new THREE.Vector3(), scl = new THREE.Vector3();

  // ---------------------------------------------------------------- state
  let carried: Board | null = null;
  let time = 0;
  const tried = new Set<Material>();
  let sawSink = false, sawFloat = false, ahaDone = false, failN = 0;
  const pl = new THREE.Vector3();

  const playerPos = () => { const p = host.player(); pl.set(p.x, 0, p.z); return pl; };
  const flatDist = (a: THREE.Vector3, x: number, z: number) => Math.hypot(a.x - x, a.z - z);
  /** distance from player to the dock centerline segment (so dropping works from anywhere on/at the dock). */
  function distToDock(p: THREE.Vector3) {
    const ax = dockA.x, az = dockA.z, bx = dockB.x, bz = dockB.z;
    const vx = bx - ax, vz = bz - az; const u = Math.max(0, Math.min(1, ((p.x - ax) * vx + (p.z - az) * vz) / (vx * vx + vz * vz)));
    return Math.hypot(p.x - (ax + vx * u), p.z - (az + vz * u));
  }
  function nearestBenchBoard(p: THREE.Vector3): Board | null {
    let bb: Board | null = null, bd = PICK_R;
    for (const b of boards) if (b.state === 'bench') { const d = flatDist(p, b.home.x, b.home.z); if (d < bd) { bd = d; bb = b; } }
    return bb;
  }
  const nearToggle = (p: THREE.Vector3) => flatDist(p, toggleWorld.x, toggleWorld.z) < TOGGLE_R + 0.4;
  const nearDrop = (p: THREE.Vector3) => distToDock(p) < DROP_R || flatDist(p, endCenter.x, endCenter.z) < DROP_R + 0.5;

  function outcome(b: Board): Result {
    const d = DENSITY[b.mat];
    if (d > 1) return 'sinks';
    if (b.shape === 'short' && d >= 0.4) return 'wobbles';
    return 'floats';
  }

  function verdictLine(b: Board): string {
    const en = host.lang === 'en'; const d = DENSITY[b.mat];
    if (b.result === 'sinks') {
      failN = failN % 3 + 1;
      return en ? `Bloop! Stone is ${d} times denser than water. ${t(`lab.fail.${failN}`)} What's lighter?`
        : `${t(`lab.fail.${failN}`)} ${t('lab.hint.dense', 'Hint: is it heavier than water for its size?')}`;
    }
    if (b.result === 'wobbles') {
      return en ? `Whoa, wibble-wobble! Wood floats low, about ${Math.round(d * 100)}% under water, and a short board tips easily. ${t('lab.hint.shape')}`
        : `${t('lab.result.wobbles', 'It wobbles!')} ${t('lab.hint.shape', 'Hint: longer boards are steadier.')}`;
    }
    if (b.mat === 'wood') {
      return en ? `It floats, but low and soggy! Wood is ${d} as dense as water. ${t('lab.hint.air')}`
        : `${t('lab.result.floats', 'It floats!')} ${t('lab.hint.air', 'Hint: things full of tiny air pockets float high.')}`;
    }
    const short = b.shape === 'short';
    return en ? `Gnarly! ${b.mat === 'foam' ? 'Foam' : 'Fiberglass foam'} is only ${d} as dense as water, so it rides up high!${short ? ' ' + t('lab.hint.shape') : ''}`
      : `${t('lab.success', 'Gnarly! You built a board that floats!')}${short ? ' ' + t('lab.hint.shape', '') : ''}`;
  }

  function startDrop(b: Board) {
    b.state = 'flying'; b.flyT = 0; b.from.copy(b.pos);
    b.to.set(drop.x + perp.x * (b.idx - 1.5) * 0.5, WATER_Y + 0.2, drop.z + perp.y * (b.idx - 1.5) * 0.5);
    b.result = outcome(b); b.spoke = false; b.timer = 0; b.name.visible = false;
    carried = null;
  }

  function land(b: Board) {
    b.state = 'water'; b.pos.copy(b.to); b.vy = -2.2; b.vx = 0; b.vz = 0; b.timer = 0;
    const long = b.shape === 'long'; const d = DENSITY[b.mat];
    b.rollV = (d > 0.3 ? 2.6 : 0.8) * (long ? 0.6 : 1.4) * (Math.random() < 0.5 ? -1 : 1); b.roll = 0;
    const sinks = d > 1;
    splash(b.pos.x, b.pos.z, sinks ? 18 : 12, b.result === 'floats' && d < 0.5);
    sndSplash(sinks);
    if (sinks) { sndBloop(); shakeT = 0.45; shakeAmp = 0.14; }
    else if (b.result === 'floats' && d < 0.5) sndChime();
    drawMeter(b);
  }

  function verdict(b: Board) {
    b.spoke = true;
    tried.add(b.mat);
    host.onAttempt({ challenge: 'surfboard-lab', choice: `${b.mat}-${b.shape}`, result: b.result });
    let line = verdictLine(b);
    if (b.result === 'sinks') sawSink = true; else sawFloat = true;
    if (sawSink && sawFloat && !ahaDone) {
      ahaDone = true;
      line += host.lang === 'en' ? ' Aha! Heavy for its size sinks; light for its size floats. That is density!' : ` ${t('lab.hint.air', '')}`;
    }
    if (tried.size === MATS.length && host.lang === 'en') line += ' You tried every board, scientist!';
    host.onSpeak(line.trim());
    b.meter.visible = true;
  }

  // ---------------------------------------------------------------- per-board physics
  function stepWater(b: Board, dt: number) {
    const d = DENSITY[b.mat]; const long = b.shape === 'long';
    const seabed = Math.min(vox.top(b.pos.x, b.pos.z), WATER_Y - 0.4);
    let steps = Math.min(40, Math.ceil(dt / SUB)); const h = dt / steps;
    while (steps-- > 0) {
      const surf = WATER_Y + Math.sin(b.pos.x * 0.55 + time * 1.6) * 0.06 + Math.sin(b.pos.z * 0.4 - time * 1.1) * 0.04;
      const bottom = b.pos.y - BOARD_H / 2;
      const f = Math.max(0, Math.min(1, (surf - bottom) / SLAB)); // submerged fraction of the physics slab
      const acc = G * (f / d - 1) - b.vy * (0.6 + 5 * f);          // gravity + buoyancy (water density 1.0) + water drag
      b.vy += acc * h; b.pos.y += b.vy * h;
      // roll: restoring torque grows with board length; damping in water
      const k = long ? 38 : 14, c = (long ? 3.2 : 1.2) * (d < 0.3 ? 2.2 : 1);
      b.rollV += (-k * b.roll - c * b.rollV) * h * (f > 0 && f < 1 ? 1 : 0.4); b.roll += b.rollV * h;
      if (b.pos.y - BOARD_H / 2 < seabed) { b.pos.y = seabed + BOARD_H / 2; b.vy = 0; b.rollV *= 0.5; b.roll *= 0.98; }
    }
    // a little wave carries floaters away along the shore
    if (d < 1) { const push = d < 0.3 ? 0.35 : 0.15; b.vx = perp.x * Math.sin(time * 0.7 + b.idx) * push + dir.x * push * 0.5; b.vz = perp.y * Math.sin(time * 0.7 + b.idx) * push + dir.y * push * 0.5; b.pos.x += b.vx * dt; b.pos.z += b.vz * dt; }
    else if (b.pos.y > seabed + BOARD_H) { b.bubbleT -= dt; if (b.bubbleT <= 0) { b.bubbleT = 0.06; emit(2, b.pos.x + (Math.random() - 0.5) * 0.4, b.pos.y, b.pos.z + (Math.random() - 0.5) * 0.4, 0, 1.2 + Math.random(), 0, 0.9, 0.07 + Math.random() * 0.05); } }
    else { b.bubbleT -= dt; if (b.bubbleT <= 0) { b.bubbleT = 0.5; emit(2, b.pos.x, b.pos.y + 0.1, b.pos.z, 0, 1, 0, 1.2, 0.06); } }
    b.pitch = Math.sin(time * 1.8 + b.idx) * (long ? 0.03 : 0.07) * (d < 1 ? 1 : 0);
  }

  const tmpQ = new THREE.Euler();
  function place(b: Board) {
    b.group.position.copy(b.pos);
    tmpQ.set(b.pitch, yaw + (b.state === 'bench' ? 0 : b.state === 'carried' ? Math.PI / 2 : 0.3 * (b.idx - 1.5)), b.roll, 'YXZ');
    if (b.state === 'bench') tmpQ.set(0, yaw, 0);
    b.group.rotation.copy(tmpQ);
    b.group.scale.setScalar(b.pop);
  }

  // ---------------------------------------------------------------- API
  function update(dtIn: number) {
    const dt = Math.min(Math.max(dtIn, 0), 0.1); time += dt;
    const p = playerPos();
    for (const b of boards) {
      switch (b.state) {
        case 'bench': {
          b.pop = Math.min(1, b.pop + dt * 3);
          b.pos.set(b.home.x, b.home.y + Math.sin(time * 2 + b.idx) * 0.015, b.home.z); b.roll = 0; b.pitch = 0;
          b.name.visible = true; b.name.position.set(b.home.x, b.home.y + 0.7 + Math.sin(time * 2.2 + b.idx) * 0.04, b.home.z);
          break;
        }
        case 'carried': {
          const py = vox.player?.y ?? groundAt(p.x, p.z);
          b.pos.set(p.x, py + 2.35 + Math.sin(time * 6) * 0.04, p.z); b.roll = Math.sin(time * 3) * 0.05; b.pitch = 0;
          break;
        }
        case 'flying': {
          b.flyT += dt / 0.55; const u = Math.min(1, b.flyT);
          b.pos.lerpVectors(b.from, b.to, u); b.pos.y += Math.sin(u * Math.PI) * 1.3; b.roll = u * 1.2; b.pitch = -0.3 * u;
          if (u >= 1) land(b);
          break;
        }
        case 'water': {
          stepWater(b, dt); b.timer += dt;
          if (!b.spoke && b.timer > SPEAK_DELAY) verdict(b);
          b.meter.position.set(b.pos.x, Math.max(b.pos.y, WATER_Y) + 1.1 + Math.sin(time * 2) * 0.05, b.pos.z);
          if (b.timer > SPEAK_DELAY + RESPAWN - 0.4) b.pop = Math.max(0, b.pop - dt * 2.5);
          if (b.timer > SPEAK_DELAY + RESPAWN) {
            if (!b.spoke) verdict(b);
            b.state = 'bench'; b.pop = 0; b.meter.visible = false; applyShape(b, shape); b.pos.copy(b.home);
          }
          break;
        }
        case 'gone': break;
      }
      place(b);
    }
    // toggle lever animates to its side
    lever.rotation.x += ((shape === 'long' ? -0.5 : 0.5) - lever.rotation.x) * Math.min(1, dt * 10);
    // particles
    let any = false;
    for (let i = 0; i < MAX_P; i++) {
      const q = parts[i]; if (q.life <= 0) continue; any = true;
      q.life -= dt;
      if (q.life <= 0) { pMesh.setMatrixAt(i, zero); continue; }
      if (q.kind === 2) { q.x += Math.sin(time * 9 + i) * 0.004; q.y += q.vy * dt; if (q.y > WATER_Y) q.life = 0; }
      else { q.vy -= (q.kind === 1 ? 5 : 9.8) * dt; if (q.kind === 1) { q.vx *= 0.98; q.vz *= 0.98; } q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; if (q.kind === 0 && q.y < WATER_Y - 0.1) q.life = 0; }
      const s = q.s * (q.kind === 0 ? q.life / q.max + 0.3 : 1);
      mtx.makeRotationY(q.kind === 1 ? time * 6 + i : 0); mtx.scale(scl.set(s, q.kind === 1 ? s * 0.25 : s, s)); mtx.setPosition(q.x, q.y, q.z);
      pMesh.setMatrixAt(i, q.life > 0 ? mtx : zero);
    }
    if (any) pMesh.instanceMatrix.needsUpdate = true;
    // camera nudge (apply the delta vs last frame's offset so the rig never accumulates drift)
    if (shakeT > 0 || shakeOff.lengthSq() > 0) {
      shakeT = Math.max(0, shakeT - dt); const a = shakeAmp * (shakeT / 0.45);
      shakeNew.set(Math.sin(time * 47) * a, -Math.abs(Math.sin(time * 31)) * a, Math.cos(time * 53) * a * 0.5);
      if (shakeT <= 0) shakeNew.set(0, 0, 0);
      host.camera.position.add(shakeNew).sub(shakeOff); shakeOff.copy(shakeNew);
    }
  }

  function interact(): boolean {
    const p = playerPos();
    if (carried) {
      if (nearDrop(p)) { startDrop(carried); return true; }
      return false;
    }
    const b = nearestBenchBoard(p);
    if (b) { carried = b; b.state = 'carried'; b.name.visible = false; b.meter.visible = false; sndPick(); return true; }
    if (nearToggle(p)) {
      shape = shape === 'long' ? 'short' : 'long'; sndPick();
      for (const bb of boards) if (bb.state === 'bench' || bb.state === 'carried') applyShape(bb, shape);
      host.onSpeak(t(shape === 'long' ? 'lab.shape.long' : 'lab.shape.short', shape === 'long' ? 'Longboard' : 'Shortboard'));
      return true;
    }
    return false;
  }

  function prompt(): string | null {
    const p = playerPos(); const en = host.lang === 'en';
    if (carried) {
      const dropTxt = t('lab.drop', 'Drop it in the water!');
      if (nearDrop(p)) return `E: ${dropTxt}`;
      return en ? 'Carry it to the end of the dock, then drop it in the water!' : `🏄 → ${dropTxt}`;
    }
    const b = nearestBenchBoard(p);
    if (b) {
      const shapeName = t(`lab.shape.${shape}`, shape === 'long' ? 'Longboard' : 'Shortboard');
      return en ? `E: pick up the ${EN_NAME[b.mat]} board (${shapeName.toLowerCase()})` : `E: ${matName(b.mat)} · ${shapeName} 🏄`;
    }
    if (nearToggle(p)) {
      const next = shape === 'long' ? 'short' : 'long';
      const nm = t(`lab.shape.${next}`, next === 'long' ? 'Longboard' : 'Shortboard');
      return en ? `E: switch to ${nm.toLowerCase()}` : `E: ⇄ ${nm}`;
    }
    return null;
  }

  function dispose() {
    if (shakeOff.lengthSq() > 0) { host.camera.position.sub(shakeOff); shakeOff.set(0, 0, 0); }
    scene.remove(root);
    root.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose(); });
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    for (const tx of texs) tx.dispose();
    root.clear();
    carried = null;
    if (ac) { void ac.close().catch(() => undefined); ac = null; }
  }

  return { update, interact, prompt, dispose };
}
