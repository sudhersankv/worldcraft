/**
 * Curiosity Craft voxel beach: third-person camera with spring arm, occluder fading + player silhouette,
 * one InstancedMesh per block type for terrain, per-structure meshes (fadeable), instanced decoration,
 * blocky characters matching the key art, shader sea with foam, adaptive quality.
 */
import * as THREE from 'three';
import type { Input } from '../core/input';
import { fbm, hash2 } from '../core/rng';

export type Block = 'grass' | 'dirt' | 'sand' | 'sand2' | 'stone' | 'wood' | 'leaves' | 'leaves2' | 'plank' | 'roofA' | 'roofB' | 'teal' | 'white' | 'red' | 'coconut' | 'basalt' | 'obsidian' | 'pumice' | 'snow' | 'ice' | 'moss' | 'jleaf' | 'path';
const COLORS: Record<Block, { top: string; side: string; bottom?: string }> = {
  grass: { top: '#5fd23c', side: '#b07a3e', bottom: '#8a5a32' },
  dirt: { top: '#b07a3e', side: '#9a6838' },
  sand: { top: '#ffd877', side: '#f2c463' },
  sand2: { top: '#f7c85e', side: '#e8b450' },
  stone: { top: '#a9adb8', side: '#8f95a2' },
  wood: { top: '#c79a5a', side: '#8d5a30' },
  leaves: { top: '#5ccf3a', side: '#3fae2e' },
  leaves2: { top: '#8fe04a', side: '#6cc23a' },
  plank: { top: '#e0a868', side: '#c88a4c' },
  roofA: { top: '#2ec4b6', side: '#22a89c' },
  roofB: { top: '#ff8a3c', side: '#e8742a' },
  teal: { top: '#2ec4b6', side: '#22a89c' },
  white: { top: '#ffffff', side: '#eef2f8' },
  red: { top: '#ff4d4d', side: '#e03c3c' },
  coconut: { top: '#7a4a24', side: '#6a3e1c' },
  basalt: { top: '#4a4550', side: '#3a3540' },
  obsidian: { top: '#2a1f3a', side: '#1e1530' },
  pumice: { top: '#c8b8a8', side: '#b0a090' },
  snow: { top: '#ffffff', side: '#dfeeff' },
  ice: { top: '#bfeaff', side: '#8fd0f0' },
  moss: { top: '#2fae4a', side: '#8a5a32', bottom: '#6a4528' },
  jleaf: { top: '#1f9a3a', side: '#178a32' },
  path: { top: '#e8c890', side: '#c8a060' },
};

export const W = 96, D = 96;
export type Biome = 'beach' | 'volcano' | 'ice' | 'jungle';
export const BIOMES: Record<Biome, { name: string; npc: string; cx: number; cz: number; emoji: string }> = {
  beach: { name: 'Sunny Surf Beach', npc: 'sam', cx: 24, cz: 26, emoji: '🏄' },
  volcano: { name: 'Ember Peak', npc: 'rocky', cx: 76, cz: 28, emoji: '🌋' },
  ice: { name: 'Frostbite Cave', npc: 'penny', cx: 76, cz: 76, emoji: '🐧' },
  jungle: { name: 'Whispering Jungle', npc: 'fern', cx: 36, cz: 78, emoji: '🐸' },
};
export function biomeAt(x: number, z: number): Biome {
  if (Math.hypot(x - 76, z - 28) < 22) return 'volcano';
  if (x > 56 && z > 56) return 'ice';
  if (z > 60 && x <= 56) return 'jungle';
  return 'beach';
}
export const NPC_SPOTS: Record<string, { x: number; z: number; biome: Biome }> = {
  rocky: { x: 62.5, z: 36.5, biome: 'volcano' },
  penny: { x: 70.5, z: 68.5, biome: 'ice' },
  fern: { x: 42.5, z: 70.5, biome: 'jungle' },
};
/** Surfboard Lab dock (fixed spot by the shack, over the water). */
export const LAB_DOCK = { x: 17.5, z: 16.5 };
/** Wonder Board easel by Sam's shack. */
export const BOARD = { x: 21.5, z: 26.5 };
/** Investigation places (concept -> spot to look at). */
export const PLACES: Record<string, { x: number; z: number; name: string }> = {
  pier: { x: 2.5, z: 27, name: 'the end of the pier' },
  dock: { x: LAB_DOCK.x, z: LAB_DOCK.z, name: 'the Lab dock' },
  castle: { x: 28, z: 20.5, name: 'the sandcastle' },
  tower: { x: 20.5, z: 31.5, name: 'the lifeguard tower' },
  pool: { x: 13, z: 52.5, name: 'the tide pool' },
  crater: { x: 70.5, z: 30.5, name: 'the crater rim' },
  obsidian: { x: 64.5, z: 22.5, name: 'the obsidian rocks' },
  vent: { x: 84.5, z: 38.5, name: 'the steam vent' },
  cave: { x: 82.5, z: 82.5, name: 'the ice cave' },
  pond: { x: 66.5, z: 84.5, name: 'the frozen pond' },
  snowspot: { x: 86.5, z: 66.5, name: 'the snowflake spot' },
  waterfall: { x: 26.5, z: 88.5, name: 'the waterfall' },
  bigleaf: { x: 44.5, z: 84.5, name: 'the giant leaf' },
  flower: { x: 30.5, z: 72.5, name: 'the big flower' },
};
export const BIOME_PLACES: Record<Biome, string[]> = { beach: ['pier', 'tower', 'castle', 'pool', 'dock'], volcano: ['crater', 'obsidian', 'vent'], ice: ['cave', 'pond', 'snowspot'], jungle: ['waterfall', 'bigleaf', 'flower'] };
export const WATER_Y = 1.45;
export const shoreAt = (z: number) => 15 + Math.sin(z * 0.35) * 1.8 + (fbm(z * 0.15, 3) - 0.5) * 3;

export type Quality = 'auto' | 'high' | 'medium' | 'low';
const LEVELS = { high: { pr: 1.5, shadow: 1024 }, medium: { pr: 1, shadow: 0 }, low: { pr: 0.7, shadow: 0 } } as const;

function noiseTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const v = 222 + Math.floor(hash2(x, y, 7) * 33); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 1, 1); }
  g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(0, 15, 16, 1); g.fillRect(15, 0, 1, 16);
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 0, 1, 16);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Box with per-face shading baked in (top brightest, sides darker, bottom edge of sides darker = cheap AO). */
function blockGeometry(b: Block): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1, 1, b === 'grass' ? 4 : 1, 1);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const cTop = new THREE.Color(COLORS[b].top), cSide = new THREE.Color(COLORS[b].side), cBot = new THREE.Color(COLORS[b].bottom ?? COLORS[b].side);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const nx = nor.getX(i), ny = nor.getY(i), y = pos.getY(i);
    if (ny > 0.5) c.copy(cTop);
    else if (ny < -0.5) c.copy(cBot).multiplyScalar(0.6);
    else { c.copy(b === 'grass' && y > 0.24 ? cTop : cSide); c.multiplyScalar((Math.abs(nx) > 0.5 ? 0.86 : 0.76) * (y < 0 ? 0.88 : 1)); }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ------------------------------------------------------------------ blocky characters (big heads, poster look)
export interface Blocky { root: THREE.Group; body: THREE.Group; head: THREE.Group; armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group; prop?: THREE.Object3D }
export interface Look { skin: string; shirt: string; shirtDots?: string; pants: string; pantsCamo?: string; hair: string; hairStyle: 'spiky' | 'curly' | 'short'; shades?: boolean; backpack?: boolean; shoes?: string; necklace?: boolean; board?: string; scale?: number }

function pixelTex(draw: (g: CanvasRenderingContext2D) => void): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d')!; draw(g);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const lam = (color: string, map?: THREE.Texture) => new THREE.MeshLambertMaterial({ color, map });

export function makeBlocky(look: Look): Blocky {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const box = (w: number, h: number, d: number, m: THREE.Material | THREE.Material[]) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.castShadow = true; return o; };
  const shirtTex = pixelTex((g) => { g.fillStyle = look.shirt; g.fillRect(0, 0, 16, 16); if (look.shirtDots) { g.fillStyle = look.shirtDots; for (const [x, y] of [[2, 2], [10, 4], [5, 9], [12, 11], [1, 13], [8, 14]]) { g.fillRect(x, y, 3, 3); g.fillStyle = '#ffffff'; g.fillRect(x + 1, y + 1, 1, 1); g.fillStyle = look.shirtDots; } } });
  const pantsTex = pixelTex((g) => { g.fillStyle = look.pants; g.fillRect(0, 0, 16, 16); if (look.pantsCamo) { g.fillStyle = look.pantsCamo; for (let i = 0; i < 9; i++) g.fillRect(Math.floor(hash2(i, 1, 4) * 13), Math.floor(hash2(i, 2, 4) * 13), 3, 2); } });
  const skin = lam(look.skin), shirt = lam('#ffffff', shirtTex), pants = lam('#ffffff', pantsTex), hair = lam(look.hair);
  const limb = (x: number, y: number, w: number, h: number, m: THREE.Material, end?: THREE.Material, endH = 0.12) => {
    const g = new THREE.Group(); g.position.set(x, y, 0);
    const mm = box(w, h, w, m); mm.position.y = -h / 2; g.add(mm);
    if (end) { const e = box(w * 1.06, endH, w * 1.12, end); e.position.set(0, -h + endH / 2, 0.01); g.add(e); }
    body.add(g); return g;
  };
  const shoes = look.shoes ? lam(look.shoes) : skin;
  const legL = limb(-0.1, 0.5, 0.18, 0.5, pants, shoes), legR = limb(0.1, 0.5, 0.18, 0.5, pants, shoes);
  if (!look.shoes) { legL.children[0].scale.y = 0.62; legL.children[0].position.y = -0.155; legR.children[0].scale.y = 0.62; legR.children[0].position.y = -0.155; const sk1 = box(0.17, 0.2, 0.17, skin); sk1.position.y = -0.38; legL.add(sk1); const sk2 = sk1.clone(); legR.add(sk2); }
  const torso = box(0.42, 0.48, 0.24, [shirt, shirt, shirt, shirt, shirt, shirt]); torso.position.y = 0.74; body.add(torso);
  const armL = limb(-0.29, 0.96, 0.15, 0.46, shirt, skin, 0.16), armR = limb(0.29, 0.96, 0.15, 0.46, shirt, skin, 0.16);
  const face = lam('#ffffff', pixelTex((g) => {
    g.fillStyle = look.skin; g.fillRect(0, 0, 16, 16);
    if (look.shades) { g.fillStyle = '#16b8b0'; g.fillRect(1, 6, 6, 4); g.fillRect(9, 6, 6, 4); g.fillRect(7, 7, 2, 1); g.fillStyle = '#9ffff4'; g.fillRect(2, 6, 2, 1); g.fillRect(10, 6, 2, 1); }
    else { g.fillStyle = '#ffffff'; g.fillRect(3, 6, 4, 4); g.fillRect(9, 6, 4, 4); g.fillStyle = '#3a6ad8'; g.fillRect(4, 7, 3, 3); g.fillRect(10, 7, 3, 3); g.fillStyle = '#1b1035'; g.fillRect(5, 8, 2, 2); g.fillRect(11, 8, 2, 2); g.fillStyle = '#fff'; g.fillRect(5, 7, 1, 1); g.fillRect(11, 7, 1, 1); }
    g.fillStyle = '#ff9fa0'; g.fillRect(1, 11, 2, 1); g.fillRect(13, 11, 2, 1);
    g.fillStyle = '#7a2030'; g.fillRect(5, 12, 6, 2); g.fillStyle = '#ffffff'; g.fillRect(6, 12, 4, 1);
  }));
  const head = new THREE.Group(); head.position.y = 1.27; body.add(head);
  const hb = box(0.62, 0.58, 0.58, [skin, skin, hair, skin, face, skin]); head.add(hb);
  // hair
  const hbx = (x: number, y: number, z: number, s: number, h = s) => { const m = box(s, h, s, hair); m.position.set(x, y, z); head.add(m); return m; };
  if (look.hairStyle === 'spiky') {
    for (let i = 0; i < 9; i++) { const sp = hbx(-0.22 + (i % 3) * 0.22, 0.36 + (i % 2) * 0.05, -0.2 + Math.floor(i / 3) * 0.2, 0.17, 0.26); sp.rotation.set((Math.floor(i / 3) - 1) * -0.4, 0, ((i % 3) - 1) * -0.45); }
    hbx(0, 0.2, -0.3, 0.6, 0.3);
  } else if (look.hairStyle === 'curly') {
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; hbx(Math.cos(a) * 0.27, 0.27 + (i % 3) * 0.04, Math.sin(a) * 0.27 - 0.03, 0.17); }
    for (let i = 0; i < 5; i++) hbx(-0.16 + (i % 3) * 0.16, 0.36, -0.1 + Math.floor(i / 3) * 0.18, 0.18);
    hbx(0, 0.0, -0.31, 0.6, 0.5);
  } else hbx(0, 0.3, -0.04, 0.64, 0.12);
  if (look.necklace) for (let i = 0; i < 5; i++) { const sh = box(0.06, 0.06, 0.04, lam(i % 2 ? '#fff4e0' : '#ffb0a0')); sh.position.set(-0.12 + i * 0.06, 0.96 - Math.abs(i - 2) * 0.025, 0.13); body.add(sh); }
  if (look.backpack) { const bp = box(0.42, 0.46, 0.2, lam('#e8742a')); bp.position.set(0, 0.78, -0.22); body.add(bp); const pk = box(0.28, 0.16, 0.06, lam('#2ec4b6')); pk.position.set(0, -0.08, -0.12); bp.add(pk); const bk = box(0.08, 0.08, 0.02, lam('#ffd23c')); bk.position.set(0, -0.06, -0.16); bp.add(bk); }
  const b: Blocky = { root, body, head, armL, armR, legL, legR };
  if (look.board) { const bd = box(0.4, 1.5, 0.08, lam(look.board)); bd.position.set(0.5, 0.78, -0.16); bd.rotation.z = -0.12; const stripe = box(0.08, 1.45, 0.09, lam('#ff5d8f')); bd.add(stripe); body.add(bd); b.prop = bd; }
  root.scale.setScalar(look.scale ?? 0.8);
  const sh = new THREE.Mesh(new THREE.CircleGeometry(0.4, 18), new THREE.MeshBasicMaterial({ color: 0x1b1035, transparent: true, opacity: 0.25, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; root.add(sh);
  return b;
}
export function animateBlocky(b: Blocky, t: number, moving: boolean, talk = false, wave = false) {
  const s = moving ? Math.sin(t * 11) : 0;
  b.legL.rotation.x = s * 0.75; b.legR.rotation.x = -s * 0.75;
  b.armL.rotation.x = -s * 0.65; b.armR.rotation.x = s * 0.65;
  b.body.position.y = moving ? Math.abs(Math.cos(t * 11)) * 0.06 : Math.sin(t * 2.2) * 0.02;
  b.head.rotation.z = moving ? 0 : Math.sin(t * 1.3) * 0.04;
  if (wave) { b.armR.rotation.z = 2.6 + Math.sin(t * 9) * 0.3; b.armR.rotation.x = 0; }
  else if (talk && !moving) { b.armR.rotation.z = 0; b.armR.rotation.x = -0.7 + Math.sin(t * 6) * 0.35; b.head.rotation.x = Math.sin(t * 8) * 0.06; }
  else { b.armR.rotation.z = 0; b.head.rotation.x = 0; }
}

// ------------------------------------------------------------------ world
export interface Actor { b: Blocky; x: number; z: number; y: number; yaw: number; moving: boolean; talk: boolean; wave?: boolean }
export interface Egg { id: string; x: number; y: number; z: number; found: boolean; obj: THREE.Object3D }
interface Deco { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string; glow?: boolean; ry?: number }
interface Struct { group: THREE.Group; box: THREE.Box3; mats: THREE.Material[]; fade: number }

export class Voxel {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  heights: number[][] = [];
  solid = new Map<string, Block>();
  player!: Actor; sam!: Actor; surfers: Actor[] = []; kids: Actor[] = [];
  eggs: Egg[] = [];
  quality: Quality = 'auto'; level: keyof typeof LEVELS = 'high';
  frozen = false;
  onInteract: (what: string) => void = () => undefined;
  onTick: (dt: number) => void = () => undefined;
  near: string | null = null;
  shack = new THREE.Vector3();
  lab = new THREE.Vector3();
  private sun: THREE.DirectionalLight;
  private waterU = { uTime: { value: 0 }, uAmp: { value: 0.12 } };
  private clock = new THREE.Clock();
  private target = new THREE.Vector3();
  private camGoal: THREE.Vector3 | null = null;
  private yaw = Math.PI / 2 + 0.3; private pitch = 0.62; private curPitch = 0.62; private dist = 8.5; private curDist = 8.5;
  private path: THREE.Vector3 | null = null; private pendingTarget: string | null = null;
  private clouds: THREE.Object3D[] = []; private qCloud!: THREE.Group;
  private tex = noiseTexture();
  private meshes: THREE.InstancedMesh[] = [];
  private structs: Struct[] = [];
  private deco: Deco[] = [];
  private canopies: Deco[] = [];
  private canopyMesh: THREE.InstancedMesh | null = null;
  private anim: { obj: THREE.Object3D; fn: (t: number, o: THREE.Object3D) => void }[] = [];
  private fpsT = 0; private fpsN = 0; fps = 60; private settle = 0; private lastNow = 0;
  private samRide: { t: number } | null = null;
  private v = new THREE.Vector3(); private v2 = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private silMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthTest: false, depthWrite: false });
  private owned = new Set<string>();
  private occluded = false;
  private dragging = false;
  silhouette = false;
  private marker!: THREE.Mesh;
  private beacon!: THREE.Group;
  boardGlow = false;
  labNear = false;
  onFrame: (dt: number) => void = () => undefined;
  private boardHalo!: THREE.Sprite;
  private home = new THREE.Vector3();

  constructor(host: HTMLElement, public input: Input) {
    try { const q = localStorage.getItem('cc-quality') as Quality | null; if (q) this.quality = q; } catch { /* */ }
    if (this.quality !== 'auto') this.level = this.quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = false;
    host.append(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.2, 260);
    const c = document.createElement('canvas'); c.width = 2; c.height = 256; const g = c.getContext('2d')!; const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#1466e0'); gr.addColorStop(0.45, '#3f9cf2'); gr.addColorStop(0.75, '#9fd8ff'); gr.addColorStop(1, '#e8f8ff'); g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
    const st = new THREE.CanvasTexture(c); st.colorSpace = THREE.SRGBColorSpace; this.scene.background = st;
    this.scene.fog = new THREE.Fog('#bfe6ff', 70, 190);
    this.scene.add(new THREE.HemisphereLight('#e8f6ff', '#d8b878', 1.55));
    this.sun = new THREE.DirectionalLight('#fff0cc', 2.4);
    const sc = this.sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.far = 70;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);
    this.build();
    this.applyLevel();
    addEventListener('resize', () => this.resize());
    this.bindPointer();
  }

  setQuality(q: Quality) { this.quality = q; try { localStorage.setItem('cc-quality', q); } catch { /* */ } this.level = q === 'auto' ? 'high' : q; this.applyLevel(); }
  private applyLevel() {
    const L = LEVELS[this.level];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, L.pr));
    this.sun.castShadow = L.shadow > 0; this.renderer.shadowMap.enabled = L.shadow > 0;
    if (L.shadow) this.sun.shadow.mapSize.set(L.shadow, L.shadow);
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true)); });
    this.resize();
  }
  resize() { this.renderer.setSize(innerWidth, innerHeight); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }

  // ================================================================== generation
  private key(x: number, y: number, z: number) { return `${x},${y},${z}`; }
  private set(x: number, y: number, z: number, b: Block, into?: Map<Block, THREE.Vector3[]>) {
    this.solid.set(this.key(x, y, z), b);
    if (into) { let a = into.get(b); if (!a) { a = []; into.set(b, a); } a.push(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5)); }
  }
  top(x: number, z: number) { const xi = Math.floor(x), zi = Math.floor(z); if (xi < 0 || zi < 0 || xi >= W || zi >= D) return 0; return this.heights[xi][zi]; }
  groundY(x: number, z: number) { const h = this.top(x, z); return h >= 50 ? 0 : Math.max(h, 0); }
  private block(x: number, z: number) { if (x >= 0 && z >= 0 && x < W && z < D) this.heights[x][z] = 99; }

  private build() {
    for (let x = 0; x < W; x++) {
      this.heights.push([]);
      for (let z = 0; z < D; z++) {
        const shore = shoreAt(z);
        const bio = biomeAt(x, z);
        let h: number;
        if (x < shore - 3) h = 0;
        else if (x < shore) h = 1;
        else if (x < shore + 6) h = 2;
        else if (x < shore + 10) h = 3; // dune terrace
        else h = 3 + Math.floor(fbm(x * 0.1, z * 0.1, 5) * 2.2);
        const rocky = z > 50 && z < 60 && x < shore + 4 && x > shore - 6;
        if (rocky) h = Math.max(h, 2 + Math.floor((z - 50) * 0.6)); // rocky headland
        const dv = Math.hypot(x - 76, z - 28);
        if (bio === 'volcano') h = Math.max(h, Math.min(15, Math.round(17 - dv * 0.95 + (fbm(x * 0.3, z * 0.3, 9) - 0.5) * 1.5)));
        if (bio === 'volcano' && dv < 3.6) h = 12; // crater floor (lava)
        if (bio === 'ice') h = Math.max(h, 3 + Math.floor(fbm(x * 0.09, z * 0.09, 11) * 4));
        if (bio === 'ice' && Math.hypot(x - 66, z - 84) < 4.5) h = 3; // frozen pond
        if (bio === 'jungle' && x < 30 && z > 84) h = Math.max(h, 7); // waterfall cliff
        this.heights[x].push(h);
        for (let y = Math.max(-1, h - 4); y < h; y++) {
          let b: Block = 'dirt';
          const isTop = y === h - 1;
          if (rocky) b = 'stone';
          else if (x < shore + 10 && bio !== 'volcano') b = hash2(x, z, y) < 0.35 ? 'sand2' : 'sand';
          else if (bio === 'volcano') b = dv < 6 ? 'obsidian' : hash2(x, z, y) < 0.15 ? 'pumice' : 'basalt';
          else if (bio === 'ice') b = isTop ? (Math.hypot(x - 66, z - 84) < 4.5 ? 'ice' : 'snow') : hash2(x, z, y) < 0.4 ? 'ice' : 'stone';
          else if (bio === 'jungle') b = isTop ? 'moss' : y < h - 2 ? 'stone' : 'dirt';
          else if (isTop) b = 'grass';
          else if (y < h - 2) b = 'stone';
          this.set(x, y, z, b);
        }
        if (h === 0) this.set(x, -1, z, hash2(x, z, 3) < 0.4 ? 'sand2' : 'sand');
      }
    }
    // ---- landmarks (each a fadeable structure)
    const sx = 20, sz = 19;
    this.shack.set(sx + 2, this.heights[sx][sz], sz - 1.2);
    this.structure((s) => this.buildShack(sx, sz, s));
    this.lab.set(sx - 2, 0, sz + 9);
    this.structure((s) => this.buildLifeguard(19, 33, s));
    this.structure((s) => this.buildPier(10, 26, s));
    // Wonder Board easel (chalkboard on legs)
    { const by = this.heights[Math.floor(BOARD.x)][Math.floor(BOARD.z)];
      this.deco.push({ x: BOARD.x - 0.6, y: by + 0.9, z: BOARD.z, sx: 0.1, sy: 1.8, sz: 0.1, c: '#8d5a30' }, { x: BOARD.x + 0.6, y: by + 0.9, z: BOARD.z, sx: 0.1, sy: 1.8, sz: 0.1, c: '#8d5a30' }, { x: BOARD.x, y: by + 1.45, z: BOARD.z + 0.05, sx: 1.6, sy: 1.1, sz: 0.1, c: '#2a5a3a' }, { x: BOARD.x, y: by + 1.45, z: BOARD.z + 0.02, sx: 1.75, sy: 1.25, sz: 0.06, c: '#c88a4c' }, { x: BOARD.x - 0.3, y: by + 1.6, z: BOARD.z + 0.11, sx: 0.5, sy: 0.06, sz: 0.02, c: '#ffffff' }, { x: BOARD.x + 0.2, y: by + 1.35, z: BOARD.z + 0.11, sx: 0.35, sy: 0.35, sz: 0.02, c: '#ffd23c' });
      this.heights[Math.floor(BOARD.x)][Math.floor(BOARD.z)] = 99; }
    this.structure((s) => this.buildLighthouse(-14, 6, s));
    // palms in varied sizes
    const palms: [number, number][] = [];
    for (let i = 0; i < 120 && palms.length < 18; i++) {
      const x = Math.floor(hash2(i, 1, 9) * W), z = Math.floor(hash2(i, 2, 9) * D);
      const h = this.heights[x]?.[z] ?? 0;
      if (h < 2 || h > 50 || x > shoreAt(z) + 14 || biomeAt(x, z) !== 'beach' || z > 50) continue;
      if (palms.some(([px, pz]) => Math.abs(px - x) + Math.abs(pz - z) < 5)) continue;
      if (Math.abs(x - 21) < 6 && Math.abs(z - 22) < 8) continue; // plaza
      if (Math.abs(x - 19) < 4 && Math.abs(z - 33) < 4) continue; // tower
      if (z > D - 10) continue;
      palms.push([x, z]);
      this.structure((s) => this.buildPalm(x, z, h, 4 + Math.floor(hash2(i, 4, 9) * 3), hash2(i, 3, 9) < 0.5 ? 1 : -1, s));
    }
    // inland: bushes, flowers in clusters, grass tufts
    for (let i = 0; i < 160; i++) {
      const x = Math.floor(hash2(i, 5, 3) * W), z = Math.floor(hash2(i, 6, 3) * D);
      const h = this.heights[x]?.[z] ?? 0;
      if (h < 3 || h > 50 || this.solid.get(this.key(x, h - 1, z)) !== 'grass' || biomeAt(x, z) !== 'beach') continue;
      const r = hash2(i, 7, 3);
      if (r < 0.25) { this.set(x, h, z, hash2(i, 8, 3) < 0.5 ? 'leaves' : 'leaves2'); this.block(x, z); }
      else for (let k = 0; k < 4; k++) this.deco.push({ x: x + 0.2 + hash2(i, k, 1) * 0.6, y: h + 0.12, z: z + 0.2 + hash2(k, i, 1) * 0.6, sx: 0.16, sy: 0.24, sz: 0.16, c: r < 0.55 ? ['#ff5d8f', '#ffd23c', '#ffffff', '#c86bfa'][k] : '#4fc03a' });
    }
    // umbrellas, towels, sandcastle, volleyball net, campfire, starfish, shells, bottle, chest, kite, sunscreen, footprints
    const umb = [[27, 35, '#ff4d4d'], [28, 23, '#ffd23c'], [26, 31, '#2ec4b6'], [30, 28, '#ff8a3c']] as const;
    for (const [x, z, c] of umb) { const y = this.heights[x][z]; this.deco.push({ x: x + 0.5, y: y + 1.1, z: z + 0.5, sx: 0.08, sy: 2.2, sz: 0.08, c: '#ffffff' }); this.canopies.push({ x: x + 0.5, y: y + 2.2, z: z + 0.5, sx: 1.5, sy: 0.18, sz: 1.5, c }, { x: x + 0.5, y: y + 2.36, z: z + 0.5, sx: 0.8, sy: 0.16, sz: 0.8, c: '#ffffff' }); this.deco.push({ x: x + 1.6, y: y + 0.04, z: z + 0.5, sx: 0.9, sy: 0.06, sz: 1.8, c: c === '#ffd23c' ? '#2ec4b6' : '#ffd23c' }); }
    const castle = { x: 27, z: 19 }; const cy = this.heights[castle.x][castle.z];
    for (const [dx, dz, hh] of [[0, 0, 2], [1, 0, 1], [2, 0, 2], [0, 1, 1], [2, 1, 1], [0, 2, 2], [1, 2, 1], [2, 2, 2], [1, 1, 3]]) for (let k = 0; k < hh; k++) this.deco.push({ x: castle.x + dx * 0.5 + 0.25, y: cy + k * 0.5 + 0.25, z: castle.z + dz * 0.5 + 0.25, sx: 0.48, sy: 0.48, sz: 0.48, c: k === hh - 1 ? '#f2c463' : '#e8b450' });
    this.deco.push({ x: castle.x + 0.75, y: cy + 1.8, z: castle.z + 0.75, sx: 0.04, sy: 0.6, sz: 0.04, c: '#ffffff' }, { x: castle.x + 0.9, y: cy + 2.0, z: castle.z + 0.75, sx: 0.3, sy: 0.18, sz: 0.02, c: '#ff4d4d' });
    const net = { x: 31, z: 25 }; const ny = this.heights[net.x][net.z];
    for (const dz of [0, 4]) this.deco.push({ x: net.x + 0.5, y: ny + 1, z: net.z + dz + 0.5, sx: 0.12, sy: 2, sz: 0.12, c: '#ffffff' });
    this.deco.push({ x: net.x + 0.5, y: ny + 1.7, z: net.z + 2.5, sx: 0.04, sy: 0.6, sz: 4, c: '#f0f0f0' });
    this.deco.push({ x: net.x + 2.5, y: ny + 0.3, z: net.z + 1.5, sx: 0.4, sy: 0.4, sz: 0.4, c: '#ffffff' });
    const fire = { x: 30, z: 33 }; const fy = this.heights[fire.x][fire.z];
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; this.deco.push({ x: fire.x + 0.5 + Math.cos(a) * 0.8, y: fy + 0.15, z: fire.z + 0.5 + Math.sin(a) * 0.8, sx: 0.32, sy: 0.3, sz: 0.32, c: '#8f95a2' }); }
    this.deco.push({ x: fire.x + 0.5, y: fy + 0.25, z: fire.z + 0.5, sx: 0.5, sy: 0.3, sz: 0.5, c: '#ff8a3c', glow: true }, { x: fire.x + 0.5, y: fy + 0.55, z: fire.z + 0.5, sx: 0.25, sy: 0.35, sz: 0.25, c: '#ffd23c', glow: true });
    for (let i = 0; i < 14; i++) { const z = 3 + Math.floor(hash2(i, 1, 21) * (D - 14)); const x = Math.floor(shoreAt(z) + 1 + hash2(i, 2, 21) * 4); const y = this.heights[x]?.[z]; if (!y || y > 50) continue; this.deco.push({ x: x + 0.5, y: y + 0.04, z: z + 0.5, sx: 0.36, sy: 0.06, sz: 0.36, c: i % 3 ? '#ff7a5a' : '#ffd0c0', ry: i }); }
    // footprints leading to the buried chest
    for (let i = 0; i < 7; i++) { const x = 32 + i, z = 37 + (i % 2) * 0.6; const y = this.heights[Math.floor(x)][Math.floor(z)]; if (y < 50) this.deco.push({ x: x + 0.3, y: y + 0.03, z: z + 0.4, sx: 0.22, sy: 0.04, sz: 0.34, c: '#d8a448' }); }
    // tide pools on the headland
    for (const [px, pz] of [[12, 53], [15, 55]]) { const y = this.heights[px][pz]; this.deco.push({ x: px + 0.5, y: y + 0.03, z: pz + 0.5, sx: 1.6, sy: 0.06, sz: 1.6, c: '#4fe0e8' }); this.deco.push({ x: px + 0.2, y: y + 0.08, z: pz + 0.8, sx: 0.3, sy: 0.05, sz: 0.3, c: '#ff8a3c' }, { x: px + 0.9, y: y + 0.12, z: pz + 0.2, sx: 0.2, sy: 0.2, sz: 0.2, c: '#c86bfa' }); }
    // ---- wonder sparkles (Easter eggs)
    const eggAt: [string, number, number, number][] = [
      ['under-pier', 9.5, 0.4, 26.5], ['tide-pool', 12.5, 0, 53.5], ['behind-tower', 21.5, 0, 35.5], ['bottle', 15.2, 0, 41.5], ['giant-shell', 17.5, 0, 12.5], ['crab', 18.5, 0, 29.5],
      ['sandcastle', 28.6, 0, 20.6], ['treasure', 39.5, 0, 37.5], ['dolphin-spot', 4.5, 0, 26.5], ['kite', 34.5, 0, 14.5], ['sunscreen', 25.5, 0, 28.6], ['sun', 30.5, 0, 9.5],
      ['lava-rock', 66.5, 0, 24.5], ['steam', 84.5, 0, 36.5], ['crystal', 60.5, 0, 30.5], ['icicle', 80.5, 0, 80.5], ['snowflake', 86.5, 0, 68.5], ['frozen-fish', 66.5, 0, 82.5], ['waterfall', 28.5, 0, 85.5], ['butterfly', 40.5, 0, 76.5], ['giant-leaf', 46.5, 0, 82.5],
    ];
    for (const [id, x, yy, z] of eggAt) {
      const y = yy > 0 ? 2.25 : this.groundY(x, z);
      const g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: '#fffbe0' }));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow('#ffe27a'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(1.1); g.add(core, halo);
      g.position.set(x, y + 0.7, z); this.scene.add(g);
      this.eggs.push({ id, x, y, z, found: false, obj: g });
    }
    // egg props
    this.deco.push({ x: 15.2, y: this.groundY(15.2, 41.5) + 0.15, z: 41.5, sx: 0.18, sy: 0.18, sz: 0.5, c: '#6fe0a0', ry: 0.6 }, { x: 15.2, y: this.groundY(15.2, 41.5) + 0.2, z: 41.75, sx: 0.08, sy: 0.08, sz: 0.12, c: '#c88a4c', ry: 0.6 });
    this.deco.push({ x: 17.5, y: this.groundY(17.5, 12.5) + 0.25, z: 12.5, sx: 0.7, sy: 0.5, sz: 0.6, c: '#ffd0c0' }, { x: 17.7, y: this.groundY(17.5, 12.5) + 0.25, z: 12.8, sx: 0.4, sy: 0.3, sz: 0.1, c: '#ff9fb0' });
    this.deco.push({ x: 39.5, y: this.groundY(39.5, 37.5) + 0.1, z: 37.5, sx: 0.7, sy: 0.3, sz: 0.5, c: '#8d5a30' }, { x: 39.5, y: this.groundY(39.5, 37.5) + 0.27, z: 37.5, sx: 0.72, sy: 0.06, sz: 0.52, c: '#ffd23c' });
    this.deco.push({ x: 25.5, y: this.groundY(25.5, 28.6) + 0.2, z: 28.6, sx: 0.16, sy: 0.4, sz: 0.1, c: '#ff8a3c' }, { x: 25.5, y: this.groundY(25.5, 28.6) + 0.45, z: 28.6, sx: 0.08, sy: 0.1, sz: 0.08, c: '#ffffff' });
    // ---- sky: chunky clouds (+ a "?" cloud), sun glow
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group(); const m = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.45 });
      const n = 4 + Math.floor(hash2(i, 14, 1) * 4);
      for (let k = 0; k < n; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(2 + hash2(i, k, 2) * 2.5, 1.2 + (k % 2) * 0.8, 2 + hash2(k, i, 2) * 2), m); b.position.set(k * 1.4 - n * 0.7, (k % 3 === 1 ? 0.8 : 0), hash2(k, i, 4) * 2 - 1); g.add(b); }
      g.position.set(-30 + hash2(i, 11, 1) * 100, 26 + hash2(i, 13, 1) * 10, -20 + hash2(i, 12, 1) * 90); this.scene.add(g); this.clouds.push(g);
    }
    this.qCloud = new THREE.Group();
    const qm = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.5, transparent: true, opacity: 0 });
    const Q = ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'];
    Q.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') { const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), qm); b.position.set(0, (6 - r) * 1.6, c * 1.6); this.qCloud.add(b); } }));
    this.qCloud.position.set(-25, 24, 14); this.qCloud.userData.mat = qm; this.scene.add(this.qCloud);
    const sunS = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow('#fff4b0'), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    sunS.scale.setScalar(40); sunS.position.set(-60, 70, -50); this.scene.add(sunS);
    const sunB = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), new THREE.MeshBasicMaterial({ color: '#fff7c0', fog: false })); sunB.position.copy(sunS.position); this.scene.add(sunB);
    this.buildBiomes();
    this.buildMeshes();
    this.buildCanopies();
    this.buildWater();
    this.buildLife();
    this.buildActors();
  }

  npcs: Record<string, Actor> = {};
  private particlesFx: { pts: THREE.Points; vel: number[]; kind: 'smoke' | 'snow' | 'fly' }[] = [];
  currentBiome: Biome = 'beach';
  onBiome: (b: Biome) => void = () => undefined;

  private carvePath(x0: number, z0: number, x1: number, z1: number) {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) * 1.5);
    for (let i = 0; i <= n; i++) {
      const k = i / n; const x = Math.round(x0 + (x1 - x0) * k + Math.sin(k * 9) * 1.5), z = Math.round(z0 + (z1 - z0) * k + Math.cos(k * 7) * 1.5);
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1]]) {
        const xi = x + dx, zi = z + dz; if (xi < 0 || zi < 0 || xi >= W || zi >= D) continue;
        const h = this.heights[xi][zi]; if (h >= 50 || h < 2) continue;
        const k2 = this.key(xi, h - 1, zi); const b = this.solid.get(k2);
        if (b && b !== 'sand' && b !== 'sand2' && b !== 'obsidian') this.solid.set(k2, 'path');
      }
    }
  }
  private sign(text: string, x: number, z: number, color = '#ffcf5a') {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(30,18,60,0.92)'; g.beginPath(); g.roundRect(4, 4, 504, 120, 18); g.fill(); g.lineWidth = 8; g.strokeStyle = color; g.stroke();
    g.fillStyle = '#ffffff'; g.font = 'bold 60px "Jersey 10", "Atkinson Hyperlegible", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 68);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    sp.scale.set(5, 1.25, 1); sp.position.set(x, this.groundY(x, z) + 4.2, z); this.scene.add(sp);
    this.deco.push({ x, y: this.groundY(x, z) + 1.6, z, sx: 0.15, sy: 3.2, sz: 0.15, c: '#8d5a30' });
  }
  private buildBiomes() {
    // paths from the beach plaza to each biome
    this.carvePath(26, 28, 62, 36); this.carvePath(26, 30, 70, 68); this.carvePath(24, 32, 42, 70); this.carvePath(62, 36, 70, 68);
    this.sign('🌋 Ember Peak', 58, 38, '#ff8a3c'); this.sign('❄ Frostbite Cave', 64, 64, '#7fd8ff'); this.sign('🌿 Whispering Jungle', 38, 64, '#5fd23c');
    // volcano: lava pool, glow, steam vent, obsidian spikes
    const lava = new THREE.Mesh(new THREE.CircleGeometry(3.3, 24), new THREE.MeshBasicMaterial({ color: '#ff7a1a' }));
    lava.rotation.x = -Math.PI / 2; lava.position.set(76.5, 12.15, 28.5); this.scene.add(lava);
    this.anim.push({ obj: lava, fn: (t, o) => { ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHSL(0.06 + Math.sin(t * 2) * 0.015, 1, 0.55 + Math.sin(t * 3) * 0.05); } });
    for (const ang of [2.3, 3.6, 5.2]) for (let r = 3.4; r < 15; r += 0.5) { const x = 76.5 + Math.cos(ang + Math.sin(r * 0.4) * 0.15) * r, z = 28.5 + Math.sin(ang + Math.sin(r * 0.4) * 0.15) * r; this.deco.push({ x, y: this.groundY(x, z) + 0.04, z, sx: 0.7, sy: 0.08, sz: 0.7, c: r < 8 ? '#ffb03a' : '#ff6a1a', glow: true }); }
    const lglow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow('#ff8a3c'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); lglow.scale.setScalar(12); lglow.position.set(76.5, 13.5, 28.5); this.scene.add(lglow);
    for (let i = 0; i < 6; i++) { const a = i * 1.1; this.deco.push({ x: 64.5 + Math.cos(a) * 1.5, y: this.groundY(64.5, 22.5) + 0.7, z: 22.5 + Math.sin(a) * 1.5, sx: 0.5, sy: 1.4 + (i % 3) * 0.5, sz: 0.5, c: '#2a1f3a', ry: a }); }
    for (let i = 0; i < 4; i++) this.deco.push({ x: 84.5 + (i % 2) * 0.4, y: this.groundY(84.5, 38.5) + 0.2, z: 38.5 + (i > 1 ? 0.4 : 0), sx: 0.4, sy: 0.4, sz: 0.4, c: '#8f95a2' });
    // ice: cave arch, icicles
    { const cx = 82, cz = 82, h = this.heights[cx][cz];
      this.structure((st) => {
        for (let dx = -3; dx <= 3; dx++) for (let y = 0; y < 5; y++) { if (Math.abs(dx) < 2 && y < 3) continue; for (const dz of [0, 1, 2]) this.set(cx + dx, h + y, cz + dz, y > 3 ? 'snow' : 'ice', st); }
        for (let dx = -3; dx <= 3; dx++) for (const dz of [0, 1, 2]) if (Math.abs(dx) >= 2) this.block(cx + dx, cz + dz);
      });
      for (let i = 0; i < 5; i++) this.deco.push({ x: cx - 1 + i * 0.5, y: h + 2.65, z: cz - 0.05, sx: 0.12, sy: 0.6, sz: 0.12, c: '#dff6ff' }); }
    // jungle: tall trees with big canopies, waterfall, giant leaf, big flower
    let n = 0;
    for (let i = 0; i < 200 && n < 16; i++) {
      const x = 4 + Math.floor(hash2(i, 31, 5) * 52), z = 62 + Math.floor(hash2(i, 32, 5) * 30);
      if (biomeAt(x, z) !== 'jungle' || x < shoreAt(z) + 8) continue;
      const h = this.heights[x]?.[z]; if (!h || h > 50) continue;
      if (Math.hypot(x - 42.5, z - 70.5) < 4 || Math.hypot(x - 26.5, z - 88.5) < 4 || Math.hypot(x - 44.5, z - 84.5) < 3 || Math.hypot(x - 30.5, z - 72.5) < 3) continue;
      n++;
      this.structure((st) => {
        const th = 6 + Math.floor(hash2(i, 33, 5) * 4);
        for (let y = 0; y < th; y++) this.set(x, h + y, z, 'wood', st);
        this.block(x, z);
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy < 2; dy++) if (Math.abs(dx) + Math.abs(dz) < 4 - dy) this.set(x + dx, h + th + dy, z + dz, (dx + dz + dy) % 2 ? 'jleaf' : 'leaves', st);
      });
    }
    for (let y = 0; y < 6; y++) this.deco.push({ x: 26.5, y: 2 + y * 0.9, z: 86.7, sx: 2.2, sy: 0.95, sz: 0.25, c: y % 2 ? '#7fd8ff' : '#bfefff' });
    this.deco.push({ x: 26.5, y: 2.1, z: 85.6, sx: 3.2, sy: 0.2, sz: 1.6, c: '#ffffff' });
    this.deco.push({ x: 44.5, y: this.groundY(44.5, 84.5) + 1.4, z: 84.5, sx: 2.6, sy: 0.12, sz: 1.4, c: '#2fae4a', ry: 0.5 }, { x: 44.5, y: this.groundY(44.5, 84.5) + 0.7, z: 84.5, sx: 0.12, sy: 1.4, sz: 0.12, c: '#1f7a32' });
    { const fy = this.groundY(30.5, 72.5); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; this.deco.push({ x: 30.5 + Math.cos(a) * 0.55, y: fy + 1.3, z: 72.5 + Math.sin(a) * 0.55, sx: 0.6, sy: 0.12, sz: 0.6, c: '#ff5d8f', ry: a }); } this.deco.push({ x: 30.5, y: fy + 1.36, z: 72.5, sx: 0.45, sy: 0.18, sz: 0.45, c: '#ffd23c' }, { x: 30.5, y: fy + 0.65, z: 72.5, sx: 0.12, sy: 1.3, sz: 0.12, c: '#2fae4a' }); }
    // particles: volcano smoke, snowfall, butterflies
    const mk = (n2: number, color: string, size: number, kind: 'smoke' | 'snow' | 'fly', cx: number, cy: number, cz: number, r: number) => {
      const g = new THREE.BufferGeometry(); const pos = new Float32Array(n2 * 3); const vel: number[] = [];
      for (let i = 0; i < n2; i++) { pos[i * 3] = cx + (Math.random() - 0.5) * r; pos[i * 3 + 1] = cy + Math.random() * 8; pos[i * 3 + 2] = cz + (Math.random() - 0.5) * r; vel.push(cx, cy, cz, r); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size, map: this.glow('#ffffff'), transparent: true, depthWrite: false, opacity: kind === 'smoke' ? 0.55 : 0.95 }));
      pts.frustumCulled = false; this.scene.add(pts); this.particlesFx.push({ pts, vel, kind });
    };
    mk(40, '#9a8f98', 1.6, 'smoke', 76.5, 13, 28.5, 4);
    mk(60, '#ffffff', 0.25, 'snow', 76, 6, 76, 34);
    mk(14, '#ff8fd0', 0.35, 'fly', 36, 5, 78, 22);
    // NPCs
    this.npcs.rocky = this.actorAt(this.golem(), NPC_SPOTS.rocky.x, NPC_SPOTS.rocky.z);
    this.npcs.penny = this.actorAt(this.penguin(), NPC_SPOTS.penny.x, NPC_SPOTS.penny.z);
    this.npcs.fern = this.actorAt(this.frog(), NPC_SPOTS.fern.x, NPC_SPOTS.fern.z);
  }
  private actorAt(b: Blocky, x: number, z: number): Actor { this.scene.add(b.root); return { b, x, z, y: this.groundY(x, z), yaw: -Math.PI / 2, moving: false, talk: false }; }
  private rigFrom(parts: { body: THREE.Object3D[]; head: THREE.Object3D[]; armL: THREE.Object3D[]; armR: THREE.Object3D[]; legL: THREE.Object3D[]; legR: THREE.Object3D[] }, headY: number, armY: number, armX: number, legY: number, legX: number, scale: number): Blocky {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const grp = (items: THREE.Object3D[], x: number, y: number) => { const g = new THREE.Group(); g.position.set(x, y, 0); items.forEach((m) => g.add(m)); body.add(g); return g; };
    parts.body.forEach((m) => body.add(m));
    const head = grp(parts.head, 0, headY), armL = grp(parts.armL, -armX, armY), armR = grp(parts.armR, armX, armY), legL = grp(parts.legL, -legX, legY), legR = grp(parts.legR, legX, legY);
    root.scale.setScalar(scale);
    root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.55, 18), new THREE.MeshBasicMaterial({ color: 0x1b1035, transparent: true, opacity: 0.25, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; root.add(sh);
    return { root, body, head, armL, armR, legL, legR };
  }
  private bx(w: number, h: number, d: number, c: string, x = 0, y = 0, z = 0, emissive = false) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), emissive ? new THREE.MeshBasicMaterial({ color: c }) : new THREE.MeshLambertMaterial({ color: c })); m.position.set(x, y, z); return m; }
  private eyesOn(arr: THREE.Object3D[], y: number, z: number, sp: number, s = 0.12) { for (const sx of [-1, 1]) { arr.push(this.bx(s, s, 0.04, '#ffffff', sx * sp, y, z), this.bx(s * 0.55, s * 0.55, 0.05, '#1b1035', sx * sp, y - 0.01, z + 0.01)); } }
  private golem(): Blocky {
    const head: THREE.Object3D[] = [this.bx(0.7, 0.55, 0.6, '#5a5560')]; this.eyesOn(head, 0.05, 0.31, 0.16, 0.14); head.push(this.bx(0.5, 0.06, 0.04, '#ff8a3c', 0, -0.13, 0.31, true));
    const body = [this.bx(0.95, 0.85, 0.6, '#4a4550', 0, 0.95, 0), this.bx(0.08, 0.6, 0.04, '#ff8a3c', -0.2, 1.0, 0.31, true), this.bx(0.3, 0.06, 0.04, '#ff8a3c', 0.1, 1.15, 0.31, true), this.bx(0.06, 0.3, 0.04, '#ffd23c', 0.25, 0.8, 0.31, true)];
    const arm = () => [this.bx(0.3, 0.7, 0.3, '#5a5560', 0, -0.35, 0), this.bx(0.34, 0.25, 0.34, '#3a3540', 0, -0.75, 0)];
    const leg = () => [this.bx(0.32, 0.55, 0.32, '#3a3540', 0, -0.27, 0)];
    return this.rigFrom({ body, head, armL: arm(), armR: arm(), legL: leg(), legR: leg() }, 1.7, 1.3, 0.65, 0.55, 0.22, 0.95);
  }
  private penguin(): Blocky {
    const head: THREE.Object3D[] = [this.bx(0.5, 0.45, 0.45, '#1b1b2a')]; head.push(this.bx(0.36, 0.28, 0.04, '#ffffff', 0, -0.02, 0.23)); this.eyesOn(head, 0.04, 0.26, 0.1, 0.09); head.push(this.bx(0.14, 0.08, 0.16, '#ff9a2a', 0, -0.08, 0.3)); head.push(this.bx(0.56, 0.08, 0.2, '#ff4d6a', 0, -0.2, 0.05));
    const body = [this.bx(0.6, 0.7, 0.5, '#1b1b2a', 0, 0.55, 0), this.bx(0.42, 0.55, 0.04, '#ffffff', 0, 0.52, 0.26)];
    const arm = () => [this.bx(0.08, 0.5, 0.3, '#1b1b2a', 0, -0.25, 0)];
    const leg = () => [this.bx(0.18, 0.12, 0.3, '#ff9a2a', 0, -0.06, 0.06)];
    return this.rigFrom({ body, head, armL: arm(), armR: arm(), legL: leg(), legR: leg() }, 1.12, 0.85, 0.34, 0.14, 0.12, 0.95);
  }
  private frog(): Blocky {
    const head: THREE.Object3D[] = [this.bx(0.7, 0.4, 0.55, '#3fd25a')]; for (const sx of [-1, 1]) { head.push(this.bx(0.22, 0.22, 0.22, '#3fd25a', sx * 0.22, 0.25, 0.1), this.bx(0.16, 0.16, 0.04, '#ffffff', sx * 0.22, 0.27, 0.22), this.bx(0.08, 0.1, 0.05, '#1b1035', sx * 0.22, 0.26, 0.24)); } head.push(this.bx(0.4, 0.05, 0.04, '#c8304a', 0, -0.08, 0.28));
    const body = [this.bx(0.6, 0.5, 0.45, '#2fbf4a', 0, 0.5, 0), this.bx(0.4, 0.35, 0.04, '#d8ffb0', 0, 0.48, 0.23)];
    const arm = () => [this.bx(0.12, 0.4, 0.12, '#2fbf4a', 0, -0.2, 0), this.bx(0.18, 0.06, 0.18, '#ff8a3c', 0, -0.42, 0)];
    const leg = () => [this.bx(0.18, 0.3, 0.3, '#2fbf4a', 0, -0.15, 0.05)];
    return this.rigFrom({ body, head, armL: arm(), armR: arm(), legL: leg(), legR: leg() }, 0.95, 0.7, 0.36, 0.3, 0.17, 0.95);
  }

  private glowCache = new Map<string, THREE.Texture>();
  private glow(color: string) {
    let t = this.glowCache.get(color); if (t) return t;
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, color); gr.addColorStop(0.35, color + 'aa'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; this.glowCache.set(color, t); return t;
  }

  /** Collects blocks for a fadeable structure, then builds its own instanced meshes. */
  private structure(fill: (m: Map<Block, THREE.Vector3[]>) => void) {
    const m = new Map<Block, THREE.Vector3[]>();
    fill(m);
    const group = new THREE.Group(); const mats: THREE.Material[] = []; const box = new THREE.Box3();
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    for (const [b, arr] of m) {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: this.tex, transparent: true, opacity: 1 });
      const im = new THREE.InstancedMesh(blockGeometry(b), mat, arr.length);
      arr.forEach((p, i) => { im.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)); const j = 0.96 + hash2(p.x * 3, p.z * 5 + p.y, 1) * 0.08; im.setColorAt(i, col.setRGB(j, j, j)); box.expandByPoint(this.v.copy(p).addScalar(0.5)); box.expandByPoint(this.v.copy(p).addScalar(-0.5)); });
      im.castShadow = true; im.receiveShadow = true; im.matrixAutoUpdate = false; im.computeBoundingSphere();
      group.add(im); mats.push(mat); this.meshes.push(im);
    }
    this.scene.add(group);
    this.structs.push({ group, box, mats, fade: 1 });
  }
  private buildPalm(x: number, z: number, h: number, height: number, lean: number, s: Map<Block, THREE.Vector3[]>) {
    for (let y = 0; y < height; y++) this.set(x + (y > height - 2 ? lean : 0), h + y, z, 'wood', s);
    this.block(x, z);
    const tx = x + lean, ty = h + height;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) this.set(tx + dx, ty, z + dz, 'leaves', s);
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1], [1, -1], [-1, 1]]) this.set(tx + dx, ty - (Math.abs(dx) + Math.abs(dz) === 2 && dx * dz === 0 ? 1 : 0), z + dz, dx * dz === 0 ? 'leaves2' : 'leaves', s);
    for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) this.set(tx + dx, ty - 2, z + dz, 'leaves', s);
    this.set(tx, ty + 1, z, 'leaves2', s);
    this.set(tx + 1, ty - 1, z, 'coconut', s); this.set(tx, ty - 1, z + 1, 'coconut', s);
  }
  private buildShack(sx: number, sz: number, s: Map<Block, THREE.Vector3[]>) {
    const sh = this.heights[sx][sz];
    for (let x = sx; x < sx + 5; x++) for (let z = sz; z < sz + 4; z++) {
      const wall = x === sx || x === sx + 4 || z === sz + 3;
      for (let y = sh; y < sh + 3; y++) if (wall && !(z === sz + 3 && x > sx && x < sx + 4 && y < sh + 2)) this.set(x, y, z, 'plank', s);
      if (z === sz && (x === sx || x === sx + 4)) for (let y = sh; y < sh + 3; y++) this.set(x, y, z, 'wood', s);
      this.block(x, z);
    }
    for (let x = sx - 1; x < sx + 6; x++) for (let z = sz - 1; z < sz + 5; z++) this.set(x, sh + 3, z, (x + z) % 2 ? 'roofA' : 'roofB', s);
    for (let x = sx; x < sx + 5; x++) for (let z = sz; z < sz + 4; z++) this.set(x, sh + 4, z, 'roofA', s);
    // counter + board rack
    for (let x = sx + 1; x < sx + 4; x++) this.set(x, sh, sz - 1, 'plank', s);
    const boards = ['#ff5d8f', '#ffd23c', '#2ec4b6', '#ff8a3c', '#9be07a'];
    boards.forEach((c, i) => this.deco.push({ x: sx + 5.4, y: sh + 1.2, z: sz + 0.4 + i * 0.7, sx: 0.12, sy: 2.2, sz: 0.5, c }));
    // hanging string lights
    for (let i = 0; i < 10; i++) this.deco.push({ x: sx - 0.6 + i * 0.68, y: sh + 2.7 - Math.sin((i / 9) * Math.PI) * 0.25, z: sz - 1.05, sx: 0.14, sy: 0.18, sz: 0.14, c: ['#ff5d8f', '#ffd23c', '#5fd0ff', '#9be07a'][i % 4], glow: true });
    // smoothie stand
    const mx = sx + 7, mz = sz + 1, my = this.heights[mx][mz];
    for (let x = mx; x < mx + 2; x++) { this.set(x, my, mz, 'teal', s); this.block(x, mz); }
    for (const [x, c] of [[mx + 0.3, '#ff5d8f'], [mx + 0.9, '#ffd23c'], [mx + 1.5, '#9be07a']] as const) this.deco.push({ x, y: my + 1.2, z: mz + 0.5, sx: 0.2, sy: 0.35, sz: 0.2, c });
    for (const dx of [0, 1.95]) this.deco.push({ x: mx + dx + 0.03, y: my + 1.8, z: mz + 0.5, sx: 0.08, sy: 1.6, sz: 0.08, c: '#ffffff' });
    this.deco.push({ x: mx + 1, y: my + 2.6, z: mz + 0.5, sx: 2.4, sy: 0.15, sz: 1.4, c: '#ff8a3c' });
  }
  private buildLifeguard(x: number, z: number, s: Map<Block, THREE.Vector3[]>) {
    const h = this.heights[x][z];
    for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) { for (let y = 0; y < 3; y++) this.set(x + dx, h + y, z + dz, 'white', s); this.block(x + dx, z + dz); }
    for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 3; dz++) { this.set(x + dx, h + 3, z + dz, 'plank', s); this.block(x + dx, z + dz); }
    for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 3; dz++) if (dx !== 1 || dz !== 0) this.set(x + dx, h + 4, z + dz, dx === 1 && dz === 1 ? 'plank' : 'red', s);
    for (let dx = -1; dx < 4; dx++) for (let dz = -1; dz < 4; dz++) this.set(x + dx, h + 6, z + dz, (dx + dz) % 2 ? 'red' : 'white', s);
    for (const [dx, dz] of [[-1, -1], [3, -1], [-1, 3], [3, 3]]) this.set(x + dx, h + 5, z + dz, 'white', s);
    this.deco.push({ x: x + 1.5, y: h + 8, z: z + 1.5, sx: 0.08, sy: 2.4, sz: 0.08, c: '#ffffff' }, { x: x + 1.5, y: h + 8.8, z: z + 2.0, sx: 0.04, sy: 0.5, sz: 0.9, c: '#ff4d4d' }, { x: x + 1.5, y: h + 8.3, z: z + 2.0, sx: 0.04, sy: 0.5, sz: 0.9, c: '#ffd23c' });
    for (let y = 0; y < 3; y++) this.deco.push({ x: x + 1.5, y: h + 0.5 + y, z: z - 0.3 - y * 0.3, sx: 0.9, sy: 0.12, sz: 0.3, c: '#e0a868' });
  }
  private buildPier(x0: number, z: number, s: Map<Block, THREE.Vector3[]>) {
    for (let x = x0 - 9; x <= x0 + 3; x++) {
      for (const dz of [0, 1]) { this.set(x, 1, z + dz, 'plank', s); if (x >= 0 && x < W) this.heights[x][z + dz] = 2; }
      if ((x - x0) % 3 === 0) for (const dz of [0, 1]) for (let y = -1; y < 1; y++) this.set(x, y, z + dz, 'wood', s);
      if ((x - x0) % 4 === 0) for (const dz of [-0.45, 2.45]) { this.deco.push({ x: x + 0.5, y: 2.6, z: z + dz + 0.05, sx: 0.1, sy: 1.2, sz: 0.1, c: '#5a3a28' }, { x: x + 0.5, y: 3.3, z: z + dz + 0.05, sx: 0.26, sy: 0.3, sz: 0.26, c: '#ffd23c', glow: true }); }
    }
    this.lab.set(x0 - 8, 2, z + 1);
    // lab test tank at the pier end
    for (let dx = 0; dx < 3; dx++) for (const dz of [-1, 2]) this.set(x0 - 10 + dx, 2, z + dz, 'teal', s);
  }
  private buildLighthouse(x: number, z: number, s: Map<Block, THREE.Vector3[]>) {
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.abs(dx) + Math.abs(dz) < 4) for (let y = -1; y < 2; y++) this.set(x + dx, y, z + dz, 'stone', s);
    for (let y = 2; y < 12; y++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) this.set(x + dx, y, z + dz, Math.floor(y / 2) % 2 ? 'red' : 'white', s);
    this.deco.push({ x: x + 1, y: 12.6, z: z + 1, sx: 1.4, sy: 1.2, sz: 1.4, c: '#fff7a0', glow: true });
    for (const [dx, dz] of [[-1, -1], [3, -1], [-1, 3], [3, 3]]) this.set(x + Math.sign(dx) * 0 + (dx > 0 ? 2 : -1), 13, z + (dz > 0 ? 2 : -1), 'red', s);
  }

  private buildMeshes() {
    const byType = new Map<Block, THREE.Vector3[]>();
    const structBlocks = new Set<string>();
    for (const st of this.structs) st.group.traverse(() => undefined);
    const exposed = (x: number, y: number, z: number) => {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (!this.solid.has(this.key(x + dx, y + dy, z + dz))) return true;
      return false;
    };
    // terrain = everything not owned by a structure: structures registered their blocks via set(..., s); identify by mesh membership
    const owned = this.owned;
    for (const im of this.meshes) { const m = new THREE.Matrix4(); for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); const p = new THREE.Vector3().setFromMatrixPosition(m); owned.add(this.key(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))); } }
    void structBlocks;
    for (const [k, b] of this.solid) {
      if (owned.has(k)) continue;
      const [x, y, z] = k.split(',').map(Number);
      if (y < -1 || !exposed(x, y, z)) continue;
      let arr = byType.get(b); if (!arr) { arr = []; byType.set(b, arr); }
      arr.push(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5));
    }
    const m4 = new THREE.Matrix4(); const col = new THREE.Color();
    for (const [b, arr] of byType) {
      const im = new THREE.InstancedMesh(blockGeometry(b), new THREE.MeshLambertMaterial({ vertexColors: true, map: this.tex }), arr.length);
      arr.forEach((p, i) => { im.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)); const j = 0.96 + hash2(p.x * 3, p.z * 5 + p.y, 1) * 0.08; im.setColorAt(i, col.setRGB(j, j, j)); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = b === 'leaves' || b === 'leaves2'; im.receiveShadow = true; im.matrixAutoUpdate = false; im.computeBoundingSphere();
      this.scene.add(im); this.meshes.push(im);
    }
    // instanced decoration (flowers, towels, lights, ...)
    for (const glow of [false, true]) {
      const list = this.deco.filter((d) => !!d.glow === glow); if (!list.length) continue;
      const mat = glow ? new THREE.MeshBasicMaterial({ color: '#ffffff' }) : new THREE.MeshLambertMaterial({ color: '#ffffff' });
      const fm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, list.length);
      const q = new THREE.Quaternion(), e = new THREE.Euler();
      list.forEach((d, i) => { e.set(0, d.ry ?? 0, 0); q.setFromEuler(e); fm.setMatrixAt(i, m4.compose(this.v.set(d.x, d.y, d.z), q, this.v2.set(d.sx, d.sy, d.sz))); fm.setColorAt(i, col.set(d.c)); });
      fm.castShadow = !glow; fm.receiveShadow = !glow; fm.matrixAutoUpdate = false; fm.computeBoundingSphere();
      this.scene.add(fm);
    }
  }
  private buildCanopies() {
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 1 });
    const fm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, this.canopies.length);
    this.canopies.forEach((d, i) => { fm.setMatrixAt(i, m4.compose(this.v.set(d.x, d.y, d.z), new THREE.Quaternion(), this.v2.set(d.sx, d.sy, d.sz))); fm.setColorAt(i, col.set(d.c)); });
    fm.castShadow = true; fm.matrixAutoUpdate = false; fm.computeBoundingSphere(); this.scene.add(fm); this.canopyMesh = fm;
  }
  private buildWater() {
    const geo = new THREE.PlaneGeometry(320, 320, 120, 120); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true, fog: false,
      uniforms: { ...this.waterU, deep: { value: new THREE.Color('#0a6fd8') }, mid: { value: new THREE.Color('#12b8e8') }, shallow: { value: new THREE.Color('#5ff2e0') } },
      vertexShader: `uniform float uTime; uniform float uAmp; varying vec3 vW; varying float vH;
        void main(){ vec4 w = modelMatrix * vec4(position,1.0);
          float h = sin(w.x*0.55 + uTime*1.6) * uAmp + sin(w.z*0.4 - uTime*1.1) * uAmp * 0.6;
          w.y += h; vH = h; vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 deep; uniform vec3 mid; uniform vec3 shallow; uniform float uTime; varying vec3 vW; varying float vH;
        void main(){
          float shore = 15.0 + sin(vW.z*0.35)*1.8;
          float d = vW.x - shore;              // <0 = out at sea
          vec3 c = d < -10.0 ? mix(deep, mid, clamp((d + 40.0) / 30.0, 0.0, 1.0)) : mix(mid, shallow, clamp((d + 10.0) / 9.0, 0.0, 1.0));
          vec2 cell = floor(vW.xz * 2.0);
          float n = fract(sin(dot(cell, vec2(12.9898,78.233))) * 43758.5453);
          c *= 0.95 + n * 0.08;
          float foamLine = smoothstep(0.85, 1.0, sin(d * 1.6 + uTime * 2.2)) * smoothstep(-6.0, -0.5, d);
          float crest = smoothstep(0.1, 0.17, vH);
          c = mix(c, vec3(1.0), clamp(foamLine * 0.85 + crest * 0.45 + smoothstep(-0.8, 0.2, d) * 0.6, 0.0, 1.0));
          gl_FragColor = vec4(c, d > -1.0 ? 0.9 : 0.88); }`,
    });
    const water = new THREE.Mesh(geo, mat); water.position.set(W / 2, WATER_Y, D / 2); water.renderOrder = 2; this.scene.add(water);
  }
  setWave(v: number) { this.waterU.uAmp.value = 0.05 + v * 0.35; }
  waveY(x: number, z: number, t: number) { const a = this.waterU.uAmp.value; return WATER_Y + Math.sin(x * 0.55 + t * 1.6) * a + Math.sin(z * 0.4 - t * 1.1) * a * 0.6; }

  // ------------------------------------------------------------------ life: dolphins, gulls, crabs, sailboat
  private buildLife() {
    const bx = (w: number, h: number, d: number, c: string) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c })); m.castShadow = false; return m; };
    for (let i = 0; i < 2; i++) {
      const d = new THREE.Group(); const body = bx(0.5, 0.45, 1.6, '#6a9fd0'); d.add(body); const belly = bx(0.42, 0.18, 1.2, '#dfeefa'); belly.position.y = -0.18; d.add(belly);
      const fin = bx(0.1, 0.4, 0.4, '#5a8fc0'); fin.position.set(0, 0.35, -0.1); d.add(fin); const tail = bx(0.9, 0.1, 0.3, '#5a8fc0'); tail.position.z = -0.9; d.add(tail); const nose = bx(0.2, 0.18, 0.4, '#6a9fd0'); nose.position.z = 0.95; d.add(nose);
      this.scene.add(d);
      this.anim.push({ obj: d, fn: (t, o) => { const k = (t * 0.35 + i * 0.5) % 1; o.position.set(-6 - i * 3 + k * 2, WATER_Y - 0.8 + Math.sin(k * Math.PI) * 2.6, 8 + i * 16 + k * 10); o.rotation.x = -Math.cos(k * Math.PI) * 0.9; o.visible = Math.sin(k * Math.PI) > 0.05; } });
    }
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group(); const w1 = bx(0.6, 0.06, 0.18, '#ffffff'); w1.position.x = -0.3; w1.rotation.z = 0.3; const w2 = w1.clone(); w2.position.x = 0.3; w2.rotation.z = -0.3; g.add(w1, w2, bx(0.16, 0.14, 0.4, '#f0f0f0'));
      this.scene.add(g);
      this.anim.push({ obj: g, fn: (t, o) => { const a = t * (0.25 + i * 0.03) + i * 1.3; o.position.set(12 + Math.cos(a) * (6 + i), 9 + i * 0.7 + Math.sin(t * 2 + i) * 0.3, 24 + Math.sin(a) * (8 + i)); o.rotation.y = -a; (o.children[0] as THREE.Mesh).rotation.z = 0.3 + Math.sin(t * 8 + i) * 0.3; (o.children[1] as THREE.Mesh).rotation.z = -0.3 - Math.sin(t * 8 + i) * 0.3; } });
    }
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Group(); c.add(bx(0.4, 0.2, 0.3, '#ff4d3c')); for (const s of [-1, 1]) { const cl = bx(0.12, 0.12, 0.12, '#ff6a50'); cl.position.set(s * 0.3, 0.12, 0.12); c.add(cl); const eye = bx(0.06, 0.12, 0.06, '#ffffff'); eye.position.set(s * 0.08, 0.18, 0.1); c.add(eye); }
      const bxz = [[18.5, 29.5], [16.5, 38], [20, 14]][i]; this.scene.add(c);
      this.anim.push({ obj: c, fn: (t, o) => { o.position.set(bxz[0] + Math.sin(t * 0.8 + i) * 1.2, this.groundY(bxz[0], bxz[1]) + 0.12, bxz[1]); o.rotation.y = Math.PI / 2; o.children[1].position.y = 0.12 + Math.abs(Math.sin(t * 6)) * 0.08; } });
    }
    // kite on a string near the kite sparkle
    { const kite = new THREE.Group(); const k1 = bx(0.9, 0.9, 0.06, '#ff5d8f'); k1.rotation.z = Math.PI / 4; kite.add(k1); const k2 = bx(0.5, 0.5, 0.07, '#ffd23c'); k2.rotation.z = Math.PI / 4; kite.add(k2); const tail = bx(0.06, 1.4, 0.06, '#5fd0ff'); tail.position.y = -1; kite.add(tail);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#ffffff' })); this.scene.add(kite, line);
      this.anim.push({ obj: kite, fn: (t, o) => { o.position.set(34.5 + Math.sin(t * 0.7) * 1.5, 12 + Math.sin(t * 1.3) * 0.8, 14.5 + Math.cos(t * 0.5)); o.rotation.z = Math.sin(t * 2) * 0.3; const pos = line.geometry.attributes.position as THREE.BufferAttribute; pos.setXYZ(0, 34.5, this.groundY(34.5, 14.5) + 0.5, 14.5); pos.setXYZ(1, o.position.x, o.position.y - 0.4, o.position.z); pos.needsUpdate = true; } }); }
    const boat = new THREE.Group(); boat.add(bx(3, 0.6, 1.2, '#ffffff')); const mast = bx(0.12, 3.5, 0.12, '#8d5a30'); mast.position.y = 1.9; boat.add(mast); const sail = bx(0.05, 2.6, 1.6, '#ff8a3c'); sail.position.set(0.1, 2.2, -0.2); boat.add(sail);
    this.scene.add(boat);
    this.anim.push({ obj: boat, fn: (t, o) => { o.position.set(-30, WATER_Y + Math.sin(t) * 0.15 + 0.2, (t * 0.6) % 90 - 20); o.rotation.z = Math.sin(t * 0.8) * 0.05; o.rotation.y = Math.PI / 2; } });
  }

  private actor(look: Look, x: number, z: number): Actor {
    const b = makeBlocky(look); this.scene.add(b.root);
    return { b, x, z, y: this.groundY(x, z), yaw: 0, moving: false, talk: false };
  }
  private buildActors() {
    this.player = this.actor({ skin: '#f2b88a', shirt: '#22b8b0', pants: '#e8462a', hair: '#8a4a22', hairStyle: 'curly', backpack: true, shoes: '#2ec4b6' }, 23.5, 27.5);
    this.player.b.root.traverse((o) => o.layers.enable(1));
    this.home.set(this.shack.x - 3.5, 0, this.shack.z + 5.7);
    this.sam = this.actor({ skin: '#e8955a', shirt: '#ff4a2c', shirtDots: '#ffd23c', pants: '#3a8ad8', pantsCamo: '#2a6ab8', hair: '#ffe066', hairStyle: 'spiky', shades: true, necklace: true, board: '#ffd23c', scale: 0.86 }, this.home.x, this.home.z);
    this.sam.yaw = Math.PI / 4;
    const boards = ['#ff5d8f', '#7fd8ff', '#9be07a'];
    for (let i = 0; i < 3; i++) {
      const s = this.actor({ skin: ['#f2c19a', '#a8754a', '#e8b088'][i], shirt: ['#7fe06a', '#ffd23c', '#c86bfa'][i], pants: '#1b5a8a', hair: ['#5a3a20', '#1a1010', '#ff8a3c'][i], hairStyle: 'short' }, 5 + i * 3, 10 + i * 9);
      const bd = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 1.7), lam(boards[i])); bd.scale.setScalar(1 / 0.8); s.b.root.add(bd);
      s.b.legL.rotation.x = 0.3; s.b.legR.rotation.x = -0.3; s.b.armL.rotation.z = -1.0; s.b.armR.rotation.z = 1.0;
      this.surfers.push(s);
    }
    // sunbathers on towels
    for (const [x, z, sh] of [[29.6, 28.5, '#ff8a3c'], [27.6, 35.5, '#9be07a']] as const) { const g = this.actor({ skin: '#e8b088', shirt: sh, pants: '#3a8ad8', hair: '#5a3a20', hairStyle: 'short', shades: true, scale: 0.7 }, x, z); g.b.root.rotation.x = -Math.PI / 2; g.b.root.position.set(x, this.groundY(x, z) + 0.15, z - 0.6); g.b.armL.rotation.z = -2.6; g.b.armR.rotation.z = 2.6; }
    for (let i = 0; i < 2; i++) { const k = this.actor({ skin: ['#c8885a', '#f2c8a0'][i], shirt: ['#ff8a3c', '#5fd0ff'][i], pants: '#ffffff', hair: ['#1a1010', '#ffcf5a'][i], hairStyle: 'short', scale: 0.62 }, 27.2 + i * 1.6, 21.6 + i * 0.4); k.yaw = -0.6 + i * 1.6; this.kids.push(k); }
    // marker above the player's head
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.26, 4), new THREE.MeshBasicMaterial({ color: '#ffd23c', depthTest: false, transparent: true }));
    this.marker.rotation.x = Math.PI; this.marker.renderOrder = 20; this.scene.add(this.marker);
    this.target.set(this.player.x, this.player.y + 1.1, this.player.z);
    this.beacon = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 14, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.position.y = 7; this.beacon.add(beam);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: '#ffd23c' })); gem.position.y = 3; gem.name = 'gem'; this.beacon.add(gem);
    this.beacon.visible = false; this.scene.add(this.beacon);
    this.boardHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow('#ffe27a'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.boardHalo.scale.setScalar(3.4); this.boardHalo.position.set(BOARD.x, this.groundY(BOARD.x, BOARD.z + 1) + 1.5, BOARD.z + 0.2); this.boardHalo.visible = false; this.scene.add(this.boardHalo);
  }

  private walkable(x: number, z: number, fromY: number) {
    if (x < 0.5 || z < 0.5 || x > W - 0.5 || z > D - 0.5) return false;
    const h = this.top(x, z);
    if (h >= 50 || h < WATER_Y - 0.6) return false;
    return h - fromY <= 1.01;
  }

  // ================================================================== input: orbit drag, click-to-walk
  private bindPointer() {
    const el = this.renderer.domElement;
    let down: { x: number; y: number; id: number; drag: boolean; btn: number } | null = null;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, id: e.pointerId, drag: false, btn: e.button }; });
    el.addEventListener('pointermove', (e) => {
      if (!down || down.id !== e.pointerId) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!down.drag && Math.hypot(dx, dy) > 6) down.drag = true;
      if (down.drag) { this.dragging = true; this.yaw -= e.movementX * 0.006; this.pitch = Math.min(1.25, Math.max(0.12, this.pitch + e.movementY * 0.004)); }
    });
    el.addEventListener('pointerup', (e) => { if (down && !down.drag && down.btn === 0) this.click(e); down = null; this.dragging = false; });
    el.addEventListener('wheel', (e) => { this.dist = Math.min(12, Math.max(4, this.dist + e.deltaY * 0.006)); }, { passive: true });
  }
  private click(e: PointerEvent) {
    if (this.frozen) return;
    for (const [id, a] of [['sam', this.sam]] as const) { const s = this.screen(a.x, a.y + 1.3, a.z); if (Math.hypot(s.x - e.clientX, s.y - e.clientY) < 70) { this.path = new THREE.Vector3(a.x - 0.9, 0, a.z + 0.9); this.pendingTarget = id; return; } }
    for (const g of this.eggs) { if (g.found) continue; const s = this.screen(g.x, g.y + 0.7, g.z); if (Math.hypot(s.x - e.clientX, s.y - e.clientY) < 50) { this.path = new THREE.Vector3(g.x, 0, g.z + 0.6); this.pendingTarget = `egg:${g.id}`; return; } }
    this.ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), this.camera);
    const hit = this.ray.intersectObjects(this.meshes, false)[0];
    if (hit) { this.path = hit.point.clone(); this.pendingTarget = null; }
  }
  screen(x: number, y: number, z: number) { const p = this.v.set(x, y, z).project(this.camera); return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight, behind: p.z > 1 }; }

  flyTo(x: number, z: number) { this.camGoal = new THREE.Vector3(x, this.groundY(x, z), z); }
  followPlayer() { this.camGoal = null; }
  teleportNear(a: Actor) { this.player.x = a.x - 1.1; this.player.z = a.z + 1.3; this.player.y = this.groundY(this.player.x, this.player.z); this.player.yaw = Math.atan2(a.x - this.player.x, a.z - this.player.z); this.yaw = Math.atan2(this.player.x - a.x, this.player.z - a.z) + 0.6; }
  samSurf(on: boolean) { this.samRide = on ? { t: 0 } : null; if (!on) { this.sam.x = this.home.x; this.sam.z = this.home.z; } }
  private portraits = new Map<string, string>();
  /** Big 3D portrait snapshot of an NPC (rendered once with the main renderer into a render target). */
  portraitURL(id: string): string | null {
    const hit = this.portraits.get(id); if (hit) return hit;
    const a = id === 'sam' ? this.sam : this.npcs[id]; if (!a) return null;
    try {
      const S = 256, rt = new THREE.WebGLRenderTarget(S, S); rt.texture.colorSpace = THREE.SRGBColorSpace;
      const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight('#ffffff', '#c8b080', 2.2)); const dl = new THREE.DirectionalLight('#fff0d8', 2.2); dl.position.set(-2, 3, 4); sc.add(dl);
      const clone = a.b.root.clone(true); clone.position.set(0, 0, 0); clone.rotation.set(0, -0.35, 0); clone.traverse((o) => { if ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).geometry as THREE.BufferGeometry).type === 'CircleGeometry') o.visible = false; }); sc.add(clone);
      const box = new THREE.Box3().setFromObject(clone); const hgt = box.max.y - box.min.y;
      const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50); const fy = box.min.y + hgt * 0.62; cam.position.set(0, fy + 0.1, hgt * 1.9 + 0.5); cam.lookAt(0, fy, 0);
      const prevT = this.renderer.getRenderTarget(); const prevC = new THREE.Color(); this.renderer.getClearColor(prevC); const prevA = this.renderer.getClearAlpha();
      this.renderer.setRenderTarget(rt); this.renderer.setClearColor('#000000', 0); this.renderer.clear(); this.renderer.render(sc, cam);
      const px = new Uint8Array(S * S * 4); this.renderer.readRenderTargetPixels(rt, 0, 0, S, S, px);
      this.renderer.setRenderTarget(prevT); this.renderer.setClearColor(prevC, prevA); rt.dispose();
      const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')!; const img = g.createImageData(S, S);
      for (let y = 0; y < S; y++) img.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
      g.putImageData(img, 0, 0);
      const url = c.toDataURL('image/png'); this.portraits.set(id, url); return url;
    } catch { return null; }
  }
  setBeacon(x: number | null, z = 0) { if (x === null) { this.beacon.visible = false; return; } this.beacon.visible = true; this.beacon.position.set(x, this.groundY(x, z), z); }
  teleport(x: number, z: number) { this.player.x = x; this.player.z = z; this.player.y = this.groundY(x, z); this.target.set(x, this.player.y + 1.1, z); }
  dist2(x: number, z: number) { return Math.hypot(this.player.x - x, this.player.z - z); }
  markEgg(id: string) { const g = this.eggs.find((e) => e.id === id); if (!g) return; g.found = true; g.obj.visible = false; }

  // ================================================================== loop
  start() { const loop = () => { requestAnimationFrame(loop); try { this.frame(); } catch (err) { console.error(err); } }; loop(); }
  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta()), t = this.clock.elapsedTime;
    const now = performance.now(); this.fpsT += (now - (this.lastNow || now)) / 1000; this.lastNow = now; this.fpsN++;
    if (this.fpsT > 2) { this.fps = this.fpsN / this.fpsT; this.fpsT = 0; this.fpsN = 0; this.settle += 2; if (this.quality === 'auto' && this.settle >= 4 && this.fps < 45 && this.level !== 'low') { this.level = this.level === 'high' ? 'medium' : 'low'; console.info('[curiosity-craft] fps', this.fps.toFixed(0), '->', this.level); this.applyLevel(); this.settle = 0; } }
    this.waterU.uTime.value = t;
    // gamepad right stick orbit + triggers zoom
    try { const pad = [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected); if (pad) { const rx = pad.axes[2] ?? 0, ry = pad.axes[3] ?? 0; if (Math.abs(rx) > 0.2) this.yaw -= rx * dt * 2.4; if (Math.abs(ry) > 0.2) this.pitch = Math.min(1.25, Math.max(0.12, this.pitch + ry * dt * 1.5)); const lt = pad.buttons[6]?.value ?? 0, rt = pad.buttons[7]?.value ?? 0; this.dist = Math.min(12, Math.max(4, this.dist + (lt - rt) * dt * 6)); } } catch { /* */ }
    const p = this.player;
    let vx = 0, vz = 0;
    if (!this.frozen) {
      const m = this.input.move();
      if (m.x || m.y) {
        this.path = null;
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
        vx = fx * -m.y + rx * m.x; vz = fz * -m.y + rz * m.x;
        const l = Math.hypot(vx, vz); if (l > 1) { vx /= l; vz /= l; }
      } else if (this.path) {
        const dx = this.path.x - p.x, dz = this.path.z - p.z, d = Math.hypot(dx, dz);
        if (d < 0.3) { this.path = null; const tg = this.pendingTarget; this.pendingTarget = null; if (tg) this.onInteract(tg); }
        else { vx = dx / d; vz = dz / d; }
      }
      if (vx || vz) {
        const sp = 4.6 * dt, nx = p.x + vx * sp, nz = p.z + vz * sp;
        if (this.walkable(nx, nz, p.y)) { p.x = nx; p.z = nz; }
        else if (this.walkable(nx, p.z, p.y)) p.x = nx;
        else if (this.walkable(p.x, nz, p.y)) p.z = nz;
        else this.path = null;
        p.yaw = Math.atan2(vx, vz);
        const m2 = this.input.move();
        if (!this.dragging && !this.camGoal && ((m2.y < 0 && Math.abs(m2.x) < 0.3) || !(m2.x || m2.y))) { const goal = p.yaw + Math.PI; const d = Math.atan2(Math.sin(goal - this.yaw), Math.cos(goal - this.yaw)); this.yaw += d * Math.min(1, dt * 1.1); }
      }
    }
    p.moving = !!(vx || vz);
    p.y += (this.groundY(p.x, p.z) - p.y) * Math.min(1, dt * 14);
    // Sam
    const s = this.sam;
    if (this.samRide) {
      this.samRide.t += dt; const k = this.samRide.t;
      s.x = 4 + (k * 1.6) % 12; s.z = 22 + Math.sin(k * 0.8) * 3; s.y = this.waveY(s.x, s.z, t) - 0.02; s.yaw = Math.PI / 2;
      s.b.armL.rotation.z = -1.1; s.b.armR.rotation.z = 1.1; s.b.legL.rotation.x = 0.35; s.b.legR.rotation.x = -0.35;
      if (s.b.prop) { s.b.prop.rotation.set(Math.PI / 2, 0, 0); s.b.prop.position.set(0, 0.05, 0); }
    } else {
      s.y = this.groundY(s.x, s.z);
      if (s.b.prop) { s.b.prop.rotation.set(0, 0, -0.12); s.b.prop.position.set(0.5, 0.78, -0.16); }
      s.b.armL.rotation.z = 0;
      const dSam = Math.hypot(p.x - s.x, p.z - s.z);
      if (dSam < 6) s.yaw = Math.atan2(p.x - s.x, p.z - s.z);
      animateBlocky(s.b, t, false, s.talk, (dSam > 2.5 && dSam < 8 && !s.talk) || !!s.wave);
    }
    // nearest interactable
    this.near = null;
    if (Math.hypot(p.x - s.x, p.z - s.z) < 2.3 && !this.samRide) this.near = 'sam';
    else { for (const [id, a] of Object.entries(this.npcs)) if (Math.hypot(p.x - a.x, p.z - a.z) < 2.4) { this.near = `npc:${id}`; break; } }
    if (this.near?.startsWith('npc:')) { /* keep */ }
    else if (this.labNear) this.near = 'lab';
    else if (Math.hypot(p.x - BOARD.x, p.z - BOARD.z) < 2.2) this.near = 'board';
    else for (const g of this.eggs) if (!g.found && Math.hypot(p.x - g.x, p.z - g.z) < 1.6) { this.near = `egg:${g.id}`; break; }
    for (const a of [p, s, ...this.kids]) { a.b.root.position.set(a.x, a.y, a.z); const d = Math.atan2(Math.sin(a.yaw - a.b.root.rotation.y), Math.cos(a.yaw - a.b.root.rotation.y)); a.b.root.rotation.y += d * 0.25; }
    animateBlocky(p.b, t, p.moving);
    for (const a of Object.values(this.npcs)) { a.y = this.groundY(a.x, a.z); const dd = Math.hypot(p.x - a.x, p.z - a.z); if (dd < 7) a.yaw = Math.atan2(p.x - a.x, p.z - a.z); a.b.root.position.set(a.x, a.y, a.z); const d2 = Math.atan2(Math.sin(a.yaw - a.b.root.rotation.y), Math.cos(a.yaw - a.b.root.rotation.y)); a.b.root.rotation.y += d2 * 0.2; animateBlocky(a.b, t + a.x, false, a.talk, !!a.wave || (dd > 2.6 && dd < 9 && !a.talk)); }
    for (const fx of this.particlesFx) {
      const arr = fx.pts.geometry.attributes.position.array as Float32Array; const [cx, cy, cz, r] = fx.vel;
      for (let i = 0; i < arr.length; i += 3) {
        if (fx.kind === 'smoke') { arr[i + 1] += dt * 1.6; arr[i] += Math.sin(t + i) * dt * 0.4; if (arr[i + 1] > cy + 10) { arr[i] = cx + (Math.random() - 0.5) * r; arr[i + 1] = cy; arr[i + 2] = cz + (Math.random() - 0.5) * r; } }
        else if (fx.kind === 'snow') { arr[i + 1] -= dt * 1.2; arr[i] += Math.sin(t + i) * dt * 0.3; if (arr[i + 1] < 2) { arr[i] = cx + (Math.random() - 0.5) * r; arr[i + 1] = cy + 8; arr[i + 2] = cz + (Math.random() - 0.5) * r; } }
        else { arr[i] = cx + Math.sin(t * 0.4 + i) * r * 0.45; arr[i + 1] = this.groundY(arr[i], arr[i + 2]) + 1.2 + Math.abs(Math.sin(t * 6 + i)) * 0.5; arr[i + 2] = cz + Math.cos(t * 0.33 + i * 1.7) * r * 0.4; }
      }
      fx.pts.geometry.attributes.position.needsUpdate = true;
    }
    { const b = biomeAt(p.x, p.z); if (b !== this.currentBiome) { this.currentBiome = b; this.onBiome(b); } }
    this.kids.forEach((k, i) => { animateBlocky(k.b, t + i, false, true); k.y = this.groundY(k.x, k.z); });
    this.surfers.forEach((su, i) => {
      su.x = 3 + ((t * 0.9 + i * 4) % 11); su.z = 8 + i * 11 + Math.sin(t * 0.5 + i) * 2; su.y = this.waveY(su.x, su.z, t) + 0.02;
      su.b.root.position.set(su.x, su.y, su.z); su.b.root.rotation.set(Math.sin(t * 2 + i) * 0.08, Math.PI / 2, Math.cos(t * 1.7 + i) * 0.06);
    });
    for (const a of this.anim) a.fn(t, a.obj);
    for (const g of this.eggs) if (!g.found) { g.obj.rotation.y = t * 1.5; g.obj.position.y = g.y + 0.7 + Math.sin(t * 2.5 + g.x) * 0.1; }
    for (const c of this.clouds) { c.position.x += dt * 0.5; if (c.position.x > W + 45) c.position.x = -45; }
    const qa = (t % 40) / 40; (this.qCloud.userData.mat as THREE.MeshLambertMaterial).opacity = qa > 0.6 && qa < 0.95 ? Math.min(1, (qa - 0.6) * 10, (0.95 - qa) * 10) * 0.9 : 0;
    // ---- third-person camera with spring arm
    const focus = this.camGoal ?? this.v2.set(p.x, p.y + 1.1, p.z);
    this.target.lerp(focus, Math.min(1, dt * (this.camGoal ? 2 : 8)));
    let want = this.camGoal ? Math.max(this.dist, 9) : this.dist;
    const blockedAt = (pitch: number, dist: number) => {
      const cx = Math.sin(this.yaw) * Math.cos(pitch), cy = Math.sin(pitch), cz = Math.cos(this.yaw) * Math.cos(pitch);
      for (let k = 3; k <= 16; k++) { const d = (k / 16) * dist; const b = this.solid.get(this.key(Math.floor(this.target.x + cx * d), Math.floor(this.target.y + cy * d), Math.floor(this.target.z + cz * d))); if (b && b !== 'leaves' && b !== 'leaves2' && !this.owned.has(this.key(Math.floor(this.target.x + cx * d), Math.floor(this.target.y + cy * d), Math.floor(this.target.z + cz * d)))) return d; }
      return -1;
    };
    let pitchGoal = this.pitch;
    if (!this.camGoal) {
      let pp = this.pitch, hit = blockedAt(pp, want);
      while (hit >= 0 && pp < 1.3) { pp += 0.12; hit = blockedAt(pp, want); }
      pitchGoal = pp;
      if (hit >= 0) want = Math.max(1.8, hit - 0.6);
    }
    this.curPitch += (pitchGoal - this.curPitch) * Math.min(1, dt * 5);
    const dir = this.v.set(Math.sin(this.yaw) * Math.cos(this.curPitch), Math.sin(this.curPitch), Math.cos(this.yaw) * Math.cos(this.curPitch));
    this.curDist += (want - this.curDist) * Math.min(1, dt * (want < this.curDist ? 14 : 5));
    this.camera.position.copy(this.target).addScaledVector(dir, this.curDist);
    if (this.camera.position.y < WATER_Y + 0.4) this.camera.position.y = WATER_Y + 0.4;
    this.camera.lookAt(this.target);
    // ---- fade structures between camera and player; silhouette when occluded
    this.ray.set(this.camera.position, this.v2.set(p.x, p.y + 0.9, p.z).sub(this.camera.position).normalize());
    const pd = this.camera.position.distanceTo(this.v.set(p.x, p.y + 0.9, p.z));
    this.occluded = false;
    for (const st of this.structs) {
      const hit = this.ray.ray.intersectBox(st.box, this.v);
      const block = !!hit && this.camera.position.distanceTo(hit) < pd - 0.4;
      if (block) this.occluded = true;
      const goal = block ? 0.25 : 1;
      if (Math.abs(st.fade - goal) > 0.01) { st.fade += (goal - st.fade) * Math.min(1, dt * 10); for (const m of st.mats) { (m as THREE.MeshLambertMaterial).opacity = st.fade; m.depthWrite = st.fade > 0.95; } }
    }
    if (this.canopyMesh) { const nearU = this.canopies.some((c) => Math.abs(c.x - p.x) < 1.6 && Math.abs(c.z - p.z) < 1.6); const m = this.canopyMesh.material as THREE.MeshLambertMaterial; const goal = nearU ? 0.3 : 1; m.opacity += (goal - m.opacity) * Math.min(1, dt * 8); m.depthWrite = m.opacity > 0.95; }
    if (this.beacon.visible) { this.beacon.children[1].rotation.y = t * 2; this.beacon.children[1].position.y = 3 + Math.sin(t * 3) * 0.2; }
    this.boardHalo.visible = this.boardGlow; if (this.boardGlow) this.boardHalo.material.opacity = 0.6 + Math.sin(t * 4) * 0.3;
    this.marker.position.set(p.x, p.y + 2.05 + Math.sin(t * 4) * 0.06, p.z); this.marker.rotation.y = t * 2;
    this.sun.position.set(this.target.x - 12, this.target.y + 22, this.target.z - 6); this.sun.target.position.copy(this.target);
    this.onFrame(dt);
    this.onTick(dt);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.occluded && this.silhouette) { const prev = this.scene.overrideMaterial; this.scene.overrideMaterial = this.silMat; this.camera.layers.set(1); const bg = this.scene.background; this.scene.background = null; this.renderer.render(this.scene, this.camera); this.scene.background = bg; this.camera.layers.set(0); this.scene.overrideMaterial = prev; }
  }
}
