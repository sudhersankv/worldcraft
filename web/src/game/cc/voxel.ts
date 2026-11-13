/**
 * Curiosity Craft voxel world: original blocky look, one InstancedMesh per block type, cheap lighting,
 * blocky characters with limb swing, gentle shader water, adaptive quality.
 */
import * as THREE from 'three';
import type { Input } from '../core/input';
import { fbm, hash2 } from '../core/rng';

export type Block = 'grass' | 'dirt' | 'sand' | 'stone' | 'wood' | 'leaves' | 'plank' | 'roofA' | 'roofB' | 'coconut' | 'flowerR' | 'flowerY' | 'snow' | 'ice' | 'cloud';
const COLORS: Record<Block, { top: string; side: string; bottom?: string }> = {
  grass: { top: '#6fd14a', side: '#a5713f', bottom: '#8a5a32' },
  dirt: { top: '#a5713f', side: '#9a6838' },
  sand: { top: '#f7dc8f', side: '#efcf7c' },
  stone: { top: '#a3a7b0', side: '#9197a2' },
  wood: { top: '#c79a5a', side: '#8d5f34' },
  leaves: { top: '#3fbf4f', side: '#36ad46' },
  plank: { top: '#d9a865', side: '#c8954f' },
  roofA: { top: '#ff5d5d', side: '#e84848' },
  roofB: { top: '#fff4e0', side: '#f0e2c8' },
  coconut: { top: '#7a4a24', side: '#6a3e1c' },
  flowerR: { top: '#ff5d8f', side: '#ff5d8f' },
  flowerY: { top: '#ffd23c', side: '#ffd23c' },
  snow: { top: '#ffffff', side: '#e8f2ff' },
  ice: { top: '#bfe9ff', side: '#9fd8f5' },
  cloud: { top: '#ffffff', side: '#f4f7ff' },
};

export const W = 44, D = 44;
export const WATER_Y = 1.45;

export type Quality = 'auto' | 'high' | 'medium' | 'low';
const LEVELS = { high: { pr: 1.5, shadow: 1024 }, medium: { pr: 1, shadow: 0 }, low: { pr: 0.7, shadow: 0 } } as const;

function noiseTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = 214 + Math.floor(hash2(x, y, 7) * 41);
    g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 1, 1);
  }
  g.strokeStyle = 'rgba(0,0,0,0.10)'; g.strokeRect(0.5, 0.5, 15, 15);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function blockGeometry(b: Block): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1, 1, b === 'grass' ? 4 : 1, 1);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const cTop = new THREE.Color(COLORS[b].top), cSide = new THREE.Color(COLORS[b].side), cBot = new THREE.Color(COLORS[b].bottom ?? COLORS[b].side);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const ny = nor.getY(i), y = pos.getY(i);
    if (ny > 0.5) c.copy(cTop); else if (ny < -0.5) c.copy(cBot);
    else c.copy(b === 'grass' && y > 0.24 ? cTop : cSide);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ------------------------------------------------------------------ blocky characters
export interface Blocky { root: THREE.Group; body: THREE.Group; head: THREE.Mesh; armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group; prop?: THREE.Object3D }
export interface Look { skin: string; shirt: string; pants: string; hair: string; shades?: boolean; cap?: string; board?: string; scale?: number; spiky?: boolean; necklace?: boolean }

function faceTexture(look: Look): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d')!;
  g.fillStyle = look.skin; g.fillRect(0, 0, 16, 16);
  g.fillStyle = look.hair; g.fillRect(0, 0, 16, 4); g.fillRect(0, 4, 2, 3); g.fillRect(14, 4, 2, 3);
  if (look.shades) { g.fillStyle = '#12a8a0'; g.fillRect(2, 7, 12, 3); g.fillStyle = '#7ff0e8'; g.fillRect(3, 7, 3, 1); g.fillRect(10, 7, 3, 1); g.fillStyle = '#1b1035'; g.fillRect(7, 7, 2, 1); }
  else { g.fillStyle = '#ffffff'; g.fillRect(3, 7, 3, 3); g.fillRect(10, 7, 3, 3); g.fillStyle = '#2a3a8a'; g.fillRect(4, 8, 2, 2); g.fillRect(11, 8, 2, 2); }
  g.fillStyle = '#ff9fb0'; g.fillRect(2, 11, 2, 1); g.fillRect(12, 11, 2, 1);
  g.fillStyle = '#7a2a3a'; g.fillRect(6, 12, 4, 1); g.fillRect(5, 11, 1, 1); g.fillRect(10, 11, 1, 1);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const lam = (color: string, map?: THREE.Texture) => new THREE.MeshLambertMaterial({ color, map });

export function makeBlocky(look: Look): Blocky {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const box = (w: number, h: number, d: number, m: THREE.Material | THREE.Material[]) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.castShadow = true; return o; };
  const limb = (x: number, y: number, w: number, h: number, color: string, hand?: string) => {
    const g = new THREE.Group(); g.position.set(x, y, 0);
    const m = box(w, h, w, lam(color)); m.position.y = -h / 2; g.add(m);
    if (hand) { const hm = box(w * 0.98, w * 0.6, w * 0.98, lam(hand)); hm.position.y = -h + w * 0.3; g.add(hm); }
    body.add(g); return g;
  };
  const legL = limb(-0.11, 0.62, 0.2, 0.6, look.pants, look.spiky ? look.skin : undefined), legR = limb(0.11, 0.62, 0.2, 0.6, look.pants, look.spiky ? look.skin : undefined);
  const torso = box(0.46, 0.62, 0.26, lam(look.shirt)); torso.position.y = 0.93; body.add(torso);
  const armL = limb(-0.33, 1.2, 0.18, 0.56, look.shirt, look.skin), armR = limb(0.33, 1.2, 0.18, 0.56, look.shirt, look.skin);
  const skin = lam(look.skin), hair = lam(look.hair), face = lam('#ffffff', faceTexture(look));
  const head = box(0.5, 0.5, 0.5, [skin, skin, hair, skin, face, skin]); head.position.y = 1.5; body.add(head);
  if (look.cap) { const cap = box(0.54, 0.14, 0.54, lam(look.cap)); cap.position.y = 0.3; head.add(cap); const brim = box(0.5, 0.05, 0.25, lam(look.cap)); brim.position.set(0, 0.24, 0.35); head.add(brim); }
  if (look.spiky) for (let i = 0; i < 6; i++) { const sp = box(0.14, 0.18 + (i % 2) * 0.08, 0.14, hair); sp.position.set(-0.18 + (i % 3) * 0.18, 0.3, -0.12 + Math.floor(i / 3) * 0.2); sp.rotation.z = (i % 3 - 1) * 0.35; head.add(sp); }
  if (look.necklace) for (let i = 0; i < 5; i++) { const sh = box(0.06, 0.06, 0.04, lam(i % 2 ? '#fff4e0' : '#ffb0a0')); sh.position.set(-0.12 + i * 0.06, 1.19 - Math.abs(i - 2) * 0.025, 0.14); body.add(sh); }
  if (look.spiky) for (const [x, y] of [[-0.12, 1.05], [0.1, 0.85], [0.14, 1.12], [-0.1, 0.78]]) { const fl = box(0.1, 0.1, 0.02, lam('#ffd23c')); fl.position.set(x, y, 0.135); body.add(fl); }
  const b: Blocky = { root, body, head, armL, armR, legL, legR };
  if (look.board) { const bd = box(0.42, 1.5, 0.08, lam(look.board)); bd.position.set(0.55, 0.85, -0.12); bd.rotation.z = -0.12; const stripe = box(0.08, 1.45, 0.09, lam('#ffffff')); bd.add(stripe); body.add(bd); b.prop = bd; }
  root.scale.setScalar(look.scale ?? 0.62);
  // soft contact shadow
  const sh = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; root.add(sh);
  return b;
}
export function animateBlocky(b: Blocky, t: number, moving: boolean, talk = false) {
  const s = moving ? Math.sin(t * 10) : 0;
  b.legL.rotation.x = s * 0.7; b.legR.rotation.x = -s * 0.7;
  b.armL.rotation.x = -s * 0.7; b.armR.rotation.x = s * 0.7;
  b.body.position.y = moving ? Math.abs(Math.cos(t * 10)) * 0.06 : Math.sin(t * 2) * 0.015;
  if (talk && !moving) { b.armR.rotation.x = -0.6 + Math.sin(t * 6) * 0.35; b.head.rotation.x = Math.sin(t * 8) * 0.05; }
  else b.head.rotation.x = 0;
}

// ------------------------------------------------------------------ world
export interface Actor { b: Blocky; x: number; z: number; y: number; yaw: number; moving: boolean; talk: boolean }

export class Voxel {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  heights: number[][] = [];
  solid = new Map<string, Block>();
  player!: Actor; sam!: Actor; surfers: Actor[] = [];
  quality: Quality = 'auto'; level: keyof typeof LEVELS = 'high';
  frozen = false;
  onInteract: (what: 'sam') => void = () => undefined;
  onTick: (dt: number) => void = () => undefined;
  near: 'sam' | null = null;
  private sun: THREE.DirectionalLight;
  private water!: THREE.Mesh;
  private waterU = { uTime: { value: 0 }, uAmp: { value: 0.12 } };
  private clock = new THREE.Clock();
  private target = new THREE.Vector3();
  private camGoal: THREE.Vector3 | null = null;
  private dist = 24; private zoom = 1;
  private path: THREE.Vector3 | null = null;
  private clouds: THREE.Object3D[] = [];
  private tex = noiseTexture();
  private meshes: THREE.InstancedMesh[] = [];
  private fpsT = 0; private fpsN = 0; fps = 60; private settle = 0;
  private samRide: { t: number } | null = null;
  private v = new THREE.Vector3();
  private dir = new THREE.Vector3(1, 1.6, 1).normalize();

  constructor(host: HTMLElement, public input: Input, public tag: 'beach' | 'ice' | 'ocean' = 'beach') {
    try { const q = localStorage.getItem('cc-quality') as Quality | null; if (q) this.quality = q; } catch { /* */ }
    if (this.quality !== 'auto') this.level = this.quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    host.append(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.5, 220);
    const sky = tag === 'ice' ? ['#9fd4ff', '#e8f6ff'] : ['#4fb4ff', '#bfe8ff'];
    this.scene.background = new THREE.Color(sky[1]);
    const c = document.createElement('canvas'); c.width = 2; c.height = 128; const g = c.getContext('2d')!; const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, sky[0]); gr.addColorStop(1, '#fff6e0'); g.fillStyle = gr; g.fillRect(0, 0, 2, 128);
    const st = new THREE.CanvasTexture(c); st.colorSpace = THREE.SRGBColorSpace; this.scene.background = st;
    this.scene.fog = new THREE.Fog('#d8f0ff', 45, 110);
    this.scene.add(new THREE.HemisphereLight('#dff2ff', '#c8b080', 1.5));
    this.sun = new THREE.DirectionalLight('#fff3d8', 2.2);
    this.sun.shadow.camera.left = -14; this.sun.shadow.camera.right = 14; this.sun.shadow.camera.top = 14; this.sun.shadow.camera.bottom = -14; this.sun.shadow.camera.far = 60;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);
    this.build();
    this.applyLevel();
    addEventListener('resize', () => this.resize());
    this.renderer.domElement.addEventListener('pointerdown', (e) => this.click(e));
    this.renderer.domElement.addEventListener('wheel', (e) => { this.zoom = Math.min(1.6, Math.max(0.6, this.zoom + e.deltaY * 0.0008)); }, { passive: true });
  }

  setQuality(q: Quality) { this.quality = q; try { localStorage.setItem('cc-quality', q); } catch { /* */ } this.level = q === 'auto' ? 'high' : q; this.applyLevel(); }
  private applyLevel() {
    const L = LEVELS[this.level];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, L.pr));
    this.sun.castShadow = L.shadow > 0;
    if (L.shadow) this.sun.shadow.mapSize.set(L.shadow, L.shadow);
    this.renderer.shadowMap.enabled = L.shadow > 0;
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true)); });
    this.resize();
  }
  resize() { this.renderer.setSize(innerWidth, innerHeight); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }

  // ------------------------------------------------------------------ generation
  private key(x: number, y: number, z: number) { return `${x},${y},${z}`; }
  private set(x: number, y: number, z: number, b: Block) { this.solid.set(this.key(x, y, z), b); }
  top(x: number, z: number) { const xi = Math.floor(x), zi = Math.floor(z); if (xi < 0 || zi < 0 || xi >= W || zi >= D) return 0; return this.heights[xi][zi]; }

  private build() {
    const ice = this.tag === 'ice';
    for (let x = 0; x < W; x++) {
      this.heights.push([]);
      for (let z = 0; z < D; z++) {
        const shore = 15 + Math.sin(z * 0.35) * 1.8 + (fbm(z * 0.15, 3) - 0.5) * 3;
        let h: number;
        if (x < shore - 3) h = 0;
        else if (x < shore) h = 1;
        else if (x < shore + 7) h = 2;
        else h = 2 + Math.floor(fbm(x * 0.12, z * 0.12, 5) * 2.4);
        this.heights[x].push(h);
        for (let y = 0; y < h; y++) {
          let b: Block = 'dirt';
          const isTop = y === h - 1;
          if (x < shore + 7) b = 'sand';
          else if (isTop) b = ice ? 'snow' : 'grass';
          else if (y < h - 2) b = 'stone';
          if (ice && x < shore + 7 && isTop) b = 'ice';
          this.set(x, y, z, b);
        }
        if (h === 0) this.set(x, -1, z, 'sand');
      }
    }
    // palm trees on the sand + round trees inland, flowers
    const palms: [number, number][] = [];
    for (let i = 0; i < 70; i++) {
      const x = 4 + Math.floor(hash2(i, 1, 9) * (W - 6)), z = 2 + Math.floor(hash2(i, 2, 9) * (D - 4));
      const h = this.heights[x][z];
      if (h < 2 || palms.some(([px, pz]) => Math.abs(px - x) + Math.abs(pz - z) < 4)) continue;
      if (Math.abs(x - 22) < 6 && Math.abs(z - 22) < 7) continue; // shack plaza
      palms.push([x, z]);
      const sand = this.solid.get(this.key(x, h - 1, z)) === 'sand';
      if (sand || ice) {
        const lean = hash2(i, 3, 9) < 0.5 ? 1 : -1;
        for (let y = 0; y < 5; y++) this.set(x + (y > 3 ? lean : 0), h + y, z, 'wood');
        const tx = x + lean, ty = h + 5;
        for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) this.set(tx + dx, ty - (Math.abs(dx) + Math.abs(dz) === 2 ? 1 : 0), z + dz, 'leaves');
        this.set(tx + 1, ty - 1, z + 1, 'coconut'); this.set(tx - 1, ty - 1, z, 'coconut');
      } else {
        // low round bushes inland (keeps the view from the high camera clear)
        this.set(x, h, z, 'leaves');
        if (hash2(i, 8, 9) < 0.5) this.set(x + 1, h, z, 'leaves');
        this.decor.push([x, h + 1, z, hash2(i, 9, 9) < 0.5 ? 'flowerR' : 'flowerY']);
      }
      for (let y = h; y < h + 8; y++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (this.solid.has(this.key(x + dx, y, z + dz)) && x + dx >= 0 && z + dz >= 0 && x + dx < W && z + dz < D) this.heights[x + dx][z + dz] = Math.max(this.heights[x + dx][z + dz], dx === 0 && dz === 0 ? 99 : this.heights[x + dx][z + dz]);
    }
    for (let i = 0; i < 90; i++) {
      const x = Math.floor(hash2(i, 5, 3) * W), z = Math.floor(hash2(i, 6, 3) * D);
      const h = this.heights[x][z];
      if (h >= 3 && h < 50 && this.solid.get(this.key(x, h - 1, z)) === 'grass') this.decor.push([x, h, z, hash2(i, 7, 3) < 0.5 ? 'flowerR' : 'flowerY']);
    }
    // surf shack
    const sx = 20, sz = 19, sh = this.heights[sx][sz];
    for (let x = sx; x < sx + 4; x++) for (let z = sz; z < sz + 3; z++) {
      for (let y = sh; y < sh + 3; y++) if (x === sx || x === sx + 3 || z === sz + 2 || (z === sz && (x === sx || x === sx + 3))) this.set(x, y, z, 'plank');
      for (let y = sh; y < sh + 3; y++) this.heights[x][z] = 99;
    }
    for (let x = sx - 1; x < sx + 5; x++) for (let z = sz - 1; z < sz + 4; z++) this.set(x, sh + 3, z, (x + z) % 2 ? 'roofA' : 'roofB');
    this.shack = new THREE.Vector3(sx + 2, sh, sz - 1.2);
    // clouds
    for (let i = 0; i < 9; i++) {
      const cx = Math.floor(hash2(i, 11, 1) * (W + 30)) - 15, cz = Math.floor(hash2(i, 12, 1) * (D + 30)) - 15, cy = 30 + Math.floor(hash2(i, 13, 1) * 6);
      const g = new THREE.Group();
      const n = 3 + Math.floor(hash2(i, 14, 1) * 4);
      for (let k = 0; k < n; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(2 + hash2(i, k, 2) * 3, 1, 2 + hash2(k, i, 2) * 2), new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35 })); m.position.set(k * 1.6, 0, hash2(k, i, 4) * 2); g.add(m); }
      g.position.set(cx, cy, cz); this.scene.add(g); this.clouds.push(g);
    }
    const sunBox = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6), new THREE.MeshBasicMaterial({ color: '#fff3a0', fog: false }));
    sunBox.position.set(-40, 45, -60); this.scene.add(sunBox);
    this.buildMeshes();
    this.buildWater();
    this.buildActors();
  }
  private decor: [number, number, number, Block][] = [];
  shack = new THREE.Vector3();

  private buildMeshes() {
    const byType = new Map<Block, THREE.Vector3[]>();
    const exposed = (x: number, y: number, z: number) => {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (!this.solid.has(this.key(x + dx, y + dy, z + dz))) return true;
      return false;
    };
    for (const [k, b] of this.solid) {
      const [x, y, z] = k.split(',').map(Number);
      if (y < -1 || !exposed(x, y, z)) continue;
      let arr = byType.get(b); if (!arr) { arr = []; byType.set(b, arr); }
      arr.push(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5));
    }
    const m4 = new THREE.Matrix4(); const col = new THREE.Color();
    for (const [b, arr] of byType) {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: this.tex, transparent: b === 'leaves' ? false : false });
      const im = new THREE.InstancedMesh(blockGeometry(b), mat, arr.length);
      arr.forEach((p, i) => { im.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)); const j = 0.92 + hash2(p.x * 3, p.z * 5 + p.y, 1) * 0.12; im.setColorAt(i, col.setRGB(j, j, j)); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = b === 'wood' || b === 'leaves' || b === 'plank' || b === 'roofA' || b === 'roofB';
      im.receiveShadow = true; im.matrixAutoUpdate = false;
      im.computeBoundingSphere();
      this.scene.add(im); this.meshes.push(im);
    }
    if (this.decor.length) {
      const fm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.35, 0.25), new THREE.MeshLambertMaterial({ color: '#ffffff' }), this.decor.length);
      this.decor.forEach(([x, y, z, b], i) => { fm.setMatrixAt(i, m4.makeTranslation(x + 0.5, y + 0.18, z + 0.5)); fm.setColorAt(i, col.set(COLORS[b].top)); });
      fm.matrixAutoUpdate = false; this.scene.add(fm);
    }
  }
  private buildWater() {
    const geo = new THREE.PlaneGeometry(220, 220, 110, 110); geo.rotateX(-Math.PI / 2);
    const ice = this.tag === 'ice';
    const mat = new THREE.ShaderMaterial({
      transparent: true, fog: false,
      uniforms: { ...this.waterU, deep: { value: new THREE.Color(ice ? '#5aa8d8' : '#1e9fe0') }, shallow: { value: new THREE.Color(ice ? '#bfe9ff' : '#4fe0e8') } },
      vertexShader: `uniform float uTime; uniform float uAmp; varying vec3 vW; varying float vH;
        void main(){ vec3 p = position; vec4 w = modelMatrix * vec4(p,1.0);
          float h = sin(w.x*0.55 + uTime*1.6) * uAmp + sin(w.z*0.4 - uTime*1.1) * uAmp * 0.6;
          w.y += h; vH = h; vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 deep; uniform vec3 shallow; uniform float uTime; varying vec3 vW; varying float vH;
        void main(){ float d = clamp((vW.x - 4.0) / 12.0, 0.0, 1.0);
          vec3 c = mix(deep, shallow, d);
          c += vec3(0.9) * smoothstep(0.08, 0.16, vH) * 0.35;
          float sp = step(0.985, fract(sin(dot(floor(vW.xz*2.0), vec2(12.9898,78.233)) + floor(uTime*2.0)) * 43758.5453));
          c = mix(c, vec3(1.0), sp * 0.6);
          gl_FragColor = vec4(c, 0.82); }`,
    });
    this.water = new THREE.Mesh(geo, mat);
    this.water.position.set(W / 2, WATER_Y, D / 2);
    this.scene.add(this.water);
  }
  setWave(v: number) { this.waterU.uAmp.value = 0.05 + v * 0.35; }
  waveY(x: number, z: number, t: number) { const a = this.waterU.uAmp.value; return WATER_Y + Math.sin(x * 0.55 + t * 1.6) * a + Math.sin(z * 0.4 - t * 1.1) * a * 0.6; }

  private actor(look: Look, x: number, z: number): Actor {
    const b = makeBlocky(look);
    this.scene.add(b.root);
    const a: Actor = { b, x, z, y: this.groundY(x, z), yaw: 0, moving: false, talk: false };
    return a;
  }
  private buildActors() {
    this.player = this.actor({ skin: '#f2c19a', shirt: '#2fb6ff', pants: '#3a4a9a', hair: '#ffcf5a', cap: '#ff5d5d' }, 23.5, 24.5);
    this.sam = this.actor({ skin: '#e8955a', shirt: '#ff5a2c', pants: '#3a7ad8', hair: '#ffe08a', shades: true, board: '#ffd23c', scale: 0.7, spiky: true, necklace: true }, this.shack.x - 3.5, this.shack.z + 5.7);
    this.sam.yaw = Math.PI / 4;
    const boards = ['#ff5d8f', '#7fd8ff', '#9be07a'];
    for (let i = 0; i < 3; i++) {
      const s = this.actor({ skin: ['#f2c19a', '#a8754a', '#e8b088'][i], shirt: ['#ffffff', '#ffd23c', '#c86bfa'][i], pants: '#1b5a8a', hair: ['#3a2a20', '#1a1010', '#ff8a3c'][i] }, 5 + i * 3, 10 + i * 9);
      const bd = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 1.7), lam(boards[i])); bd.position.y = 0.0; s.b.root.add(bd); bd.scale.setScalar(1 / 0.62);
      s.b.legL.rotation.x = 0.3; s.b.legR.rotation.x = -0.3; s.b.armL.rotation.z = -1.0; s.b.armR.rotation.z = 1.0;
      s.yaw = Math.PI / 2;
      this.surfers.push(s);
    }
  }

  groundY(x: number, z: number) { const h = this.top(x, z); return h >= 50 ? 0 : Math.max(h, 0); }
  private walkable(x: number, z: number, fromY: number) {
    if (x < 0.5 || z < 0.5 || x > W - 0.5 || z > D - 0.5) return false;
    const h = this.top(x, z);
    if (h >= 50) return false;
    if (h < WATER_Y - 0.6) return false;
    return h - fromY <= 1.01;
  }

  // ------------------------------------------------------------------ input
  private ray = new THREE.Raycaster();
  private click(e: PointerEvent) {
    if (this.frozen || e.button !== 0) return;
    // tap on Sam?
    const s = this.screen(this.sam.x, this.sam.y + 1.1, this.sam.z);
    if (Math.hypot(s.x - e.clientX, s.y - e.clientY) < 60) { this.path = new THREE.Vector3(this.sam.x - 0.8, 0, this.sam.z + 0.8); this.pendingSam = true; return; }
    this.ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), this.camera);
    const hit = this.ray.intersectObjects(this.meshes, false)[0];
    if (hit) { this.path = hit.point.clone(); this.pendingSam = false; }
  }
  private pendingSam = false;
  screen(x: number, y: number, z: number) { const p = this.v.set(x, y, z).project(this.camera); return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight }; }

  flyTo(x: number, z: number) { this.camGoal = new THREE.Vector3(x, this.groundY(x, z), z); }
  followPlayer() { this.camGoal = null; }
  teleportNear(a: Actor) { this.player.x = a.x - 1.2; this.player.z = a.z + 1.2; this.player.y = this.groundY(this.player.x, this.player.z); this.player.yaw = Math.atan2(a.x - this.player.x, a.z - this.player.z); }
  samSurf(on: boolean) { this.samRide = on ? { t: 0 } : null; if (!on) { this.sam.x = this.shack.x - 3.5; this.sam.z = this.shack.z + 5.7; } }

  // ------------------------------------------------------------------ loop
  start() { const loop = () => { requestAnimationFrame(loop); try { this.frame(); } catch (err) { console.error(err); } }; loop(); }
  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta()), t = this.clock.elapsedTime;
    this.fpsT += dt; this.fpsN++;
    if (this.fpsT > 2) { this.fps = this.fpsN / this.fpsT; this.fpsT = 0; this.fpsN = 0; this.settle += 2; if (this.quality === 'auto' && this.settle > 4 && this.fps < 45 && this.level !== 'low') { this.level = this.level === 'high' ? 'medium' : 'low'; console.info('[curiosity-craft] fps', this.fps.toFixed(0), '->', this.level); this.applyLevel(); this.settle = 0; } }
    this.waterU.uTime.value = t;
    const p = this.player;
    let vx = 0, vz = 0;
    if (!this.frozen) {
      const m = this.input.move();
      if (m.x || m.y) { this.path = null; vx = (m.x + m.y) / Math.SQRT2; vz = (m.y - m.x) / Math.SQRT2; }
      else if (this.path) { const dx = this.path.x - p.x, dz = this.path.z - p.z, d = Math.hypot(dx, dz); if (d < 0.25) { this.path = null; if (this.pendingSam) { this.pendingSam = false; this.onInteract('sam'); } } else { vx = dx / d; vz = dz / d; } }
      if (vx || vz) {
        const sp = 4.2 * dt;
        const nx = p.x + vx * sp, nz = p.z + vz * sp;
        if (this.walkable(nx, nz, p.y)) { p.x = nx; p.z = nz; }
        else if (this.walkable(nx, p.z, p.y)) p.x = nx;
        else if (this.walkable(p.x, nz, p.y)) p.z = nz;
        else this.path = null;
        p.yaw = Math.atan2(vx, vz);
      }
    }
    p.moving = !!(vx || vz);
    const gy = this.groundY(p.x, p.z); p.y += (gy - p.y) * Math.min(1, dt * 14);
    // sam
    const s = this.sam;
    if (this.samRide) {
      this.samRide.t += dt;
      const k = this.samRide.t;
      s.x = 4 + (k * 1.6) % 12; s.z = 22 + Math.sin(k * 0.8) * 3; s.y = this.waveY(s.x, s.z, t) - 0.05; s.yaw = Math.PI / 2;
      s.b.armL.rotation.z = -1.1; s.b.armR.rotation.z = 1.1; s.b.legL.rotation.x = 0.35; s.b.legR.rotation.x = -0.35;
      if (s.b.prop) { s.b.prop.rotation.set(Math.PI / 2, 0, 0); s.b.prop.position.set(0, 0.05, 0); }
    } else {
      s.y = this.groundY(s.x, s.z);
      if (s.b.prop) { s.b.prop.rotation.set(0, 0, -0.12); s.b.prop.position.set(0.55, 0.85, -0.12); }
      s.b.armL.rotation.z = 0; s.b.armR.rotation.z = 0;
      const dSam = Math.hypot(p.x - s.x, p.z - s.z);
      if (dSam < 5) s.yaw = Math.atan2(p.x - s.x, p.z - s.z);
      animateBlocky(s.b, t, false, s.talk);
    }
    this.near = Math.hypot(p.x - s.x, p.z - s.z) < 2.2 && !this.samRide ? 'sam' : null;
    for (const a of [p, s]) { a.b.root.position.set(a.x, a.y, a.z); const d = Math.atan2(Math.sin(a.yaw - a.b.root.rotation.y), Math.cos(a.yaw - a.b.root.rotation.y)); a.b.root.rotation.y += d * 0.25; }
    animateBlocky(p.b, t, p.moving);
    this.surfers.forEach((su, i) => {
      su.x = 3 + ((t * 0.9 + i * 4) % 11); su.z = 8 + i * 11 + Math.sin(t * 0.5 + i) * 2;
      su.y = this.waveY(su.x, su.z, t) + 0.02;
      su.b.root.position.set(su.x, su.y, su.z); su.b.root.rotation.set(Math.sin(t * 2 + i) * 0.08, Math.PI / 2, Math.cos(t * 1.7 + i) * 0.06);
    });
    for (const c of this.clouds) { c.position.x += dt * 0.6; if (c.position.x > W + 25) c.position.x = -25; }
    // camera
    const goal = this.camGoal ?? this.v.set(p.x, p.y, p.z);
    this.target.lerp(goal, Math.min(1, dt * (this.camGoal ? 1.6 : 4)));
    this.camera.position.copy(this.target).addScaledVector(this.dir, this.dist * this.zoom);
    this.camera.lookAt(this.target.x, this.target.y + 0.8, this.target.z);
    this.sun.position.set(this.target.x - 10, this.target.y + 20, this.target.z + 6); this.sun.target.position.copy(this.target);
    this.onTick(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
