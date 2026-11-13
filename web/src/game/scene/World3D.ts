/** Three.js toybox-diorama renderer + movement/interaction. Same contract the Director used with the 2D scene. */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { WorldSpec } from '../../shared/contracts';
import type { Input } from '../core/input';
import type { GameState } from '../core/state';
import { hash2 } from '../core/rng';
import type { Kit } from '../world/kits';
import { astar, buildLayout, canStep, inside, N, walkable, type Layout } from '../world/layout';
import { addProp, barrier, Batch, collectibleModel, landmark, LEVEL, mat, station, toyMaterial, windUniform, G, mesh } from './models';
import { animateRig, spawnCharacter, type Rig } from './chars';

export type Target =
  | { kind: 'npc'; id: string; x: number; y: number }
  | { kind: 'station'; zoneId: string; x: number; y: number }
  | { kind: 'landmark'; zoneId: string; x: number; y: number }
  | { kind: 'discovery'; id: string; text: string; x: number; y: number }
  | { kind: 'gate'; x: number; y: number };

export interface SceneHooks {
  onInteract(t: Target): void;
  labelFor(t: Target): string | null;
  onZoneEnter(z: Layout['zones'][number]): void;
  onCollect(id: string, instance: string): void;
  isModal(): boolean;
  onAction(a: string): void;
  onFrame(dt: number): void;
}

export interface Actor { rig: Rig; gx: number; gy: number; yaw: number; moving: boolean; lift: number; squash: number }

const WATER_Y = -0.22;

// ------------------------------------------------------------------ post shaders
const TiltShift = (horizontal: boolean) => ({
  uniforms: { tDiffuse: { value: null }, amount: { value: 1 / 512 }, focus: { value: 0.52 }, band: { value: 0.16 }, strength: { value: 1.0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float amount; uniform float focus; uniform float band; uniform float strength; varying vec2 vUv;
  void main(){
    float d = smoothstep(band, band + 0.32, abs(vUv.y - focus)) * strength;
    vec2 dir = ${horizontal ? 'vec2(amount * 1.0, 0.0)' : 'vec2(0.0, amount * 1.6)'} * d * 3.0;
    vec4 s = texture2D(tDiffuse, vUv) * 0.2270270270;
    s += texture2D(tDiffuse, vUv + dir * 1.3846153846) * 0.3162162162;
    s += texture2D(tDiffuse, vUv - dir * 1.3846153846) * 0.3162162162;
    s += texture2D(tDiffuse, vUv + dir * 3.2307692308) * 0.0702702703;
    s += texture2D(tDiffuse, vUv - dir * 3.2307692308) * 0.0702702703;
    gl_FragColor = s;
  }`,
});
const Grade = {
  uniforms: { tDiffuse: { value: null }, saturation: { value: 1 }, vignette: { value: 0.35 }, lift: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float saturation; uniform float vignette; uniform float lift; varying vec2 vUv;
  void main(){
    vec4 c = texture2D(tDiffuse, vUv);
    float l = dot(c.rgb, vec3(0.299,0.587,0.114));
    c.rgb = mix(vec3(l) * vec3(0.98,0.97,1.02), c.rgb, saturation);
    c.rgb += lift;
    vec2 p = vUv - 0.5; c.rgb *= 1.0 - vignette * smoothstep(0.35, 0.85, length(p * vec2(1.0, 1.15)));
    gl_FragColor = c;
  }`,
};

function waterMaterial(kit: Kit) {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uTime: windUniform, deep: { value: new THREE.Color(kit.water.deep) }, shallow: { value: new THREE.Color(kit.water.shallow) }, foam: { value: new THREE.Color(kit.water.foam) } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uTime; uniform vec3 deep; uniform vec3 shallow; uniform vec3 foam; varying vec3 vW;
    void main(){
      float w = sin(vW.x*2.3 + uTime*1.1) * sin(vW.z*2.1 - uTime*0.9);
      float w2 = sin((vW.x+vW.z)*5.0 + uTime*2.0);
      vec3 c = mix(deep, shallow, 0.45 + 0.25*w);
      float sp = smoothstep(0.92, 1.0, w2 * w);
      c = mix(c, foam, sp*0.7);
      gl_FragColor = vec4(c, 0.86);
    }`,
  });
}

function softDisc(color = 'rgba(20,10,40,0.42)'): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class World3D {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  grade: ShaderPass; tiltH: ShaderPass; tiltV: ShaderPass;
  L!: Layout;
  player!: Actor; companion!: Actor; goat: Actor | null = null;
  npcs = new Map<string, Actor>();
  stations = new Map<string, { x: number; y: number; obj: THREE.Object3D }>();
  landmarks = new Map<string, { x: number; y: number; obj: THREE.Group; orb: THREE.Mesh | null; height: number }>();
  collectibles: { obj: THREE.Object3D; id: string; inst: string; gx: number; gy: number }[] = [];
  discoveries: { obj: THREE.Object3D; id: string; text: string; gx: number; gy: number; found: boolean }[] = [];
  markers = new Map<string, THREE.Sprite>();
  barrierObj: THREE.Group | null = null;
  gateOpen = false;
  nearTarget: Target | null = null;
  saturation = 0;
  reducedMotion = false;
  paused = false;
  titleMode = false;
  private path: { x: number; y: number }[] = [];
  private pathTarget: Target | null = null;
  private trail: { x: number; y: number }[] = [];
  private zoom = 1;
  private zoomTarget = 1;
  private camTarget = new THREE.Vector3();
  private lead = new THREE.Vector3();
  private sun!: THREE.DirectionalLight;
  private terrain!: THREE.Mesh;
  private currentZone: string | null = null;
  private clock = new THREE.Clock();
  private particles: { pts: THREE.Points; vel: Float32Array; life: Float32Array; max: number; kind: 'burst' | 'ambient' }[] = [];
  private tweens: { t: number; d: number; fn: (k: number) => void; done?: () => void }[] = [];
  private discTex = softDisc();
  private glowTex = softDisc('rgba(255,255,230,1)');
  private ring!: THREE.Mesh;
  private pan: { x: number; z: number; until: number } | null = null;
  private held: THREE.Object3D | null = null;
  private satFrom = 0; private satTo = 0; private satT = 1;

  constructor(public host: HTMLElement, public world: WorldSpec, public kit: Kit, public state: GameState, public input: Input, public hooks: SceneHooks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.5, 200);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.45, 0.5, 0.86);
    this.composer.addPass(bloom);
    this.tiltH = new ShaderPass(TiltShift(true)); this.tiltV = new ShaderPass(TiltShift(false));
    this.composer.addPass(this.tiltH); this.composer.addPass(this.tiltV);
    this.grade = new ShaderPass(Grade); this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    addEventListener('resize', () => this.resize());
    this.build();
    this.resize();
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    (this.tiltH.uniforms.amount as { value: number }).value = 1 / innerWidth;
    (this.tiltV.uniforms.amount as { value: number }).value = 1 / innerHeight;
  }

  cellTop(x: number, y: number): number {
    if (!inside(x, y)) return 0;
    const c = this.L.cells[y][x];
    if (c.water && !c.bridge) return WATER_Y;
    return c.h * LEVEL;
  }
  groundY(gx: number, gy: number) { const c = this.cellTop(Math.floor(gx), Math.floor(gy)); return c === WATER_Y ? 0 : c; }

  // ================================================================== build
  private build() {
    const k = this.kit;
    this.L = buildLayout(this.world, k);
    // sky + fog
    const sky = document.createElement('canvas'); sky.width = 4; sky.height = 256;
    const sg = sky.getContext('2d')!; const gr = sg.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, k.sky[0]); gr.addColorStop(0.55, k.sky[1]); gr.addColorStop(1, k.sky[2]); sg.fillStyle = gr; sg.fillRect(0, 0, 4, 256);
    const st = new THREE.CanvasTexture(sky); st.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = st;
    this.scene.fog = new THREE.Fog(new THREE.Color(k.sky[2]), 34, 70);
    // lights
    const hemi = new THREE.HemisphereLight(new THREE.Color(k.sky[1]), new THREE.Color(k.cliff.left), k.id === 'space' ? 1.1 : 1.35);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(k.id === 'space' ? 0xd8d0ff : 0xfff0d8, k.id === 'space' ? 2.0 : 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 60;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.03; this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target);
    this.buildTerrain();
    this.buildObjects();
    this.buildAmbient();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.38, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.visible = false; this.ring = ring; this.scene.add(ring);
    const p = this.player;
    this.camTarget.set(p.gx, 0, p.gy);
  }

  private buildTerrain() {
    const k = this.kit, L = this.L;
    const pos: number[] = [], nor: number[] = [], col: number[] = [];
    const c = new THREE.Color();
    const quad = (a: number[], b: number[], cc: number[], d: number[], n: number[], color: THREE.Color) => {
      for (const v of [a, b, cc, a, cc, d]) { pos.push(v[0], v[1], v[2]); nor.push(n[0], n[1], n[2]); col.push(color.r, color.g, color.b); }
    };
    const matCol = (m: number) => (m === -2 ? k.path : m >= 0 ? k.zoneMats[m % k.zoneMats.length] : k.ground);
    const isl = (x: number, y: number) => inside(x, y) && L.cells[y][x].island;
    const seed = this.world.seed % 1000;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const cell = L.cells[y][x]; if (!cell.island) continue;
      const water = cell.water || cell.bridge;
      const top = water ? -0.42 : cell.h * LEVEL;
      const m = matCol(cell.mat);
      const v = hash2(x, y, seed);
      if (water) c.set(k.id === 'space' ? '#2a2a6a' : '#d8c890'); else c.set(v < 0.5 ? m.top : m.top2);
      c.offsetHSL(0, 0, (hash2(x, y, seed + 9) - 0.5) * 0.04);
      quad([x, top, y], [x, top, y + 1], [x + 1, top, y + 1], [x + 1, top, y], [0, 1, 0], c.clone());
      const bottom = -(cell.drop * 0.42 + 0.4);
      const grassC = new THREE.Color(water ? '#d8c890' : m.top).offsetHSL(0, 0.05, -0.08);
      const sides: [number, number, number[], number[], number[]][] = [
        [x, y + 1, [x, 0, y + 1], [x + 1, 0, y + 1], [0, 0, 1]],
        [x + 1, y, [x + 1, 0, y + 1], [x + 1, 0, y], [1, 0, 0]],
        [x, y - 1, [x + 1, 0, y], [x, 0, y], [0, 0, -1]],
        [x - 1, y, [x, 0, y], [x, 0, y + 1], [-1, 0, 0]],
      ];
      for (const [nx, ny, p1, p2, n] of sides) {
        const nTop = isl(nx, ny) ? (L.cells[ny][nx].water || L.cells[ny][nx].bridge ? -0.42 : L.cells[ny][nx].h * LEVEL) : bottom;
        if (nTop >= top - 0.001) continue;
        const under = !isl(nx, ny);
        // grass lip
        const lip = Math.min(0.12, top - nTop);
        quad([p1[0], top, p1[2]], [p2[0], top, p2[2]], [p2[0], top - lip, p2[2]], [p1[0], top - lip, p1[2]], n, grassC);
        let yy = top - lip; let band = 0;
        while (yy > nTop + 0.001) {
          const ny2 = Math.max(nTop, yy - (under ? 0.28 + hash2(x + band, y, seed) * 0.2 : 0.3));
          const strata = under ? k.cliff.strata[band % k.cliff.strata.length] : band % 2 ? k.cliff.right : k.cliff.left;
          const sc = new THREE.Color(strata);
          if (under) sc.lerp(new THREE.Color(k.cliff.under), Math.min(0.8, (top - ny2) / 3));
          quad([p1[0], yy, p1[2]], [p2[0], yy, p2[2]], [p2[0], ny2, p2[2]], [p1[0], ny2, p1[2]], n, sc);
          yy = ny2; band++;
        }
      }
      if (!isl(x, y) || true) { /* bottom cap for underside */ }
      if (!isl(x + 1, y) || !isl(x, y + 1) || !isl(x - 1, y) || !isl(x, y - 1)) quad([x, bottom, y], [x + 1, bottom, y], [x + 1, bottom, y + 1], [x, bottom, y + 1], [0, -1, 0], new THREE.Color(k.cliff.under));
      else quad([x, bottom, y], [x + 1, bottom, y], [x + 1, bottom, y + 1], [x, bottom, y + 1], [0, -1, 0], new THREE.Color(k.cliff.under));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const tm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
    const terrain = new THREE.Mesh(geo, tm);
    terrain.receiveShadow = true; terrain.castShadow = true;
    this.scene.add(terrain); this.terrain = terrain;
    // water surfaces
    const wpos: number[] = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const cell = L.cells[y][x]; if (cell.island && (cell.water || cell.bridge)) wpos.push(x, WATER_Y, y, x, WATER_Y, y + 1, x + 1, WATER_Y, y + 1, x, WATER_Y, y, x + 1, WATER_Y, y + 1, x + 1, WATER_Y, y); }
    if (wpos.length) { const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3)); const wm = new THREE.Mesh(wg, waterMaterial(k)); wm.receiveShadow = false; this.scene.add(wm); }
    // bridges
    const wood = mat(k.bridge, { rough: 0.7 });
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const cell = L.cells[y][x]; if (!cell.bridge) continue;
      for (let i = 0; i < 4; i++) this.scene.add(mesh(G.rbox, wood, x + 0.5, -0.04, y + 0.125 + i * 0.25, 1.0, 0.08, 0.22));
      this.scene.add(mesh(G.cyl, wood, x + 0.05, 0.05, y + 0.5, 0.05, 0.4, 0.05), mesh(G.cyl, wood, x + 0.95, 0.05, y + 0.5, 0.05, 0.4, 0.05));
    }
  }

  private buildObjects() {
    const k = this.kit, L = this.L;
    const batch = new Batch(), glow = new Batch();
    for (const p of L.placed) {
      if (p.kind !== 'prop') continue;
      addProp(batch, glow, p.key, k, p.x, this.groundY(p.x, p.y), p.y, hash2(Math.floor(p.x * 10), Math.floor(p.y * 10), 3));
    }
    const pm = batch.build(toyMaterial({ wind: true })); if (pm) this.scene.add(pm);
    const gm = glow.build(toyMaterial({ emissive: true })); if (gm) { gm.castShadow = false; this.scene.add(gm); }
    // landmarks + stations
    for (const z of L.zones) {
      const lx = z.landmark.x + 0.5, ly = z.landmark.y + 0.5;
      const lm = landmark(z.zone.landmark, k);
      lm.group.position.set(lx, this.groundY(lx, ly), ly);
      if (z.zone.kind === 'wild') lm.group.scale.setScalar(0.6);
      this.scene.add(lm.group);
      this.landmarks.set(z.zone.id, { x: lx, y: ly, obj: lm.group, orb: lm.orb, height: lm.height * (z.zone.kind === 'wild' ? 0.6 : 1) });
      if (z.station) {
        const s = station(k); const sx = z.station.x + 0.5, sy = z.station.y + 0.5;
        s.position.set(sx, this.groundY(sx, sy), sy); s.rotation.y = Math.PI / 4;
        this.scene.add(s); this.stations.set(z.zone.id, { x: sx, y: sy, obj: s });
      }
    }
    if (L.gateCells.length) {
      const g = L.gateCells[Math.floor(L.gateCells.length / 2)];
      const b = barrier(k); b.position.set(g.x + 0.5, 0, g.y + 0.5);
      const prev = L.gateCells[0], last = L.gateCells[L.gateCells.length - 1];
      b.rotation.y = Math.abs(last.x - prev.x) > Math.abs(last.y - prev.y) ? Math.PI / 2 : 0;
      this.scene.add(b); this.barrierObj = b;
    }
    for (const p of L.placed) {
      if (p.kind === 'collectible') {
        const o = collectibleModel(p.key, k); o.position.set(p.x, this.groundY(p.x, p.y) + 0.35, p.y); this.scene.add(o);
        o.add(this.blob(0.5, -0.33));
        this.collectibles.push({ obj: o, id: p.id!, inst: `${p.id}@${p.x},${p.y}`, gx: p.x, gy: p.y });
      } else if (p.kind === 'discovery') {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: new THREE.Color(k.glow), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        s.scale.setScalar(0.7); s.position.set(p.x, this.groundY(p.x, p.y) + 0.5, p.y);
        const star = mesh(G.oct, mat('#ffffff', { emissive: 1 }), 0, 0, 0, 0.12, 0.18, 0.12); star.castShadow = false;
        const grp = new THREE.Group(); grp.add(s, star); grp.position.copy(s.position); s.position.set(0, 0, 0);
        this.scene.add(grp);
        this.discoveries.push({ obj: grp, id: p.id!, text: p.text ?? '', gx: p.x, gy: p.y, found: false });
      }
    }
    // characters
    this.player = this.actor(this.kit.id === 'space' ? 'astronaut' : 'kid', L.spawn.x + 0.5, L.spawn.y + 0.5, 1);
    this.companion = this.actor(k.companion, L.spawn.x - 0.5, L.spawn.y + 0.5, 1);
    this.companion.lift = 0.75;
    for (const z of L.zones) {
      if (!z.npc) continue;
      const spec = this.world.npcs.find((n) => n.id === z.npc!.id)!;
      const a = this.actor(spec.archetype, z.npc.x + 0.5, z.npc.y + 0.5, 1.15);
      a.yaw = Math.PI / 4;
      this.npcs.set(spec.id, a);
    }
  }

  private blob(size: number, y = 0.01): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: this.discTex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = 1;
    return m;
  }
  private actor(arch: string, gx: number, gy: number, scale: number): Actor {
    const rig = spawnCharacter(arch);
    rig.root.scale.setScalar(scale * 0.95);
    rig.root.add(this.blob(0.75));
    this.scene.add(rig.root);
    const a: Actor = { rig, gx, gy, yaw: 0, moving: false, lift: 0, squash: 0 };
    this.place(a);
    return a;
  }
  private place(a: Actor) {
    a.rig.root.position.set(a.gx, this.groundY(a.gx, a.gy) + a.lift, a.gy);
    const cur = a.rig.root.rotation.y;
    let d = a.yaw - cur; d = Math.atan2(Math.sin(d), Math.cos(d));
    a.rig.root.rotation.y = cur + d * 0.25;
  }

  private buildAmbient() {
    const k = this.kit;
    const n = 90;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { p[i * 3] = Math.random() * N; p[i * 3 + 1] = Math.random() * 3; p[i * 3 + 2] = Math.random() * N; }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const color = k.particles === 'bubbles' ? '#e8fbff' : k.particles === 'pollen' || k.particles === 'dust' ? '#fff3c4' : k.glow;
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: k.particles === 'bubbles' ? 0.14 : 0.12, map: this.glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
    this.scene.add(pts);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { vel[i * 3] = (Math.random() - 0.5) * 0.3; vel[i * 3 + 1] = k.particles === 'bubbles' ? 0.3 + Math.random() * 0.3 : (Math.random() - 0.5) * 0.15; vel[i * 3 + 2] = (Math.random() - 0.5) * 0.3; }
    this.particles.push({ pts, vel, life: new Float32Array(n), max: 0, kind: 'ambient' });
    // clouds (pastel puffs drifting around and below the island)
    const cm = new THREE.MeshStandardMaterial({ color: k.id === 'space' ? '#5a4a9a' : '#ffffff', roughness: 1, transparent: true, opacity: k.id === 'space' ? 0.5 : 0.92, emissive: new THREE.Color(k.id === 'space' ? '#3a2a7a' : '#fff4f0'), emissiveIntensity: 0.35 });
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Group();
      for (let j = 0; j < 4; j++) c.add(mesh(G.sphere, cm, j * 0.9 - 1.3, Math.sin(j * 2) * 0.25, Math.cos(j) * 0.3, 0.9 - Math.abs(j - 1.5) * 0.2));
      const a = (i / 9) * Math.PI * 2;
      c.position.set(N / 2 + Math.cos(a) * (N * 0.62), -3 - (i % 3) * 1.5, N / 2 + Math.sin(a) * (N * 0.62));
      c.userData.speed = 0.15 + (i % 3) * 0.05;
      c.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
      c.name = 'cloud'; this.scene.add(c);
    }
    if (k.id === 'space') {
      const sg = new THREE.BufferGeometry(); const sp = new Float32Array(600 * 3);
      for (let i = 0; i < 600; i++) { const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.6; const r = 80; sp[i * 3] = N / 2 + Math.cos(th) * Math.sin(ph) * r; sp[i * 3 + 1] = Math.cos(ph) * r * 0.6 - 10; sp[i * 3 + 2] = N / 2 + Math.sin(th) * Math.sin(ph) * r; }
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      this.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.5, color: '#ffffff', fog: false })));
      const planet = mesh(G.sphere, mat('#ff8fd0', { emissive: 0.3 }), N / 2 - 30, 4, N / 2 - 34, 5); planet.castShadow = false; this.scene.add(planet);
      const ring = mesh(G.torus, mat('#ffe27a', { emissive: 0.4 }), N / 2 - 30, 4, N / 2 - 34, 8, 8, 2, 0, 1.2); this.scene.add(ring);
    }
  }

  // ================================================================== public API used by the Director
  toScreen(gx: number, gy: number, lift = 0): { x: number; y: number } {
    const v = new THREE.Vector3(gx, this.groundY(gx, gy) + lift, gy).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  }
  teleport(gx: number, gy: number) { this.player.gx = gx; this.player.gy = gy; this.companion.gx = gx - 0.8; this.companion.gy = gy; this.trail = []; this.camTarget.set(gx, 0, gy); }
  zoneCenter(id: string) { const z = this.L.zones.find((q) => q.zone.id === id); return z ? { x: z.cx + 0.5, y: z.cy + 0.5 } : null; }

  private markerTex = new Map<string, THREE.Texture>();
  private markerTexture(kind: string): THREE.Texture {
    let t = this.markerTex.get(kind); if (t) return t;
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
    const col = { main: '#ffd23c', side: '#5cd2ff', study: '#5ef0a8', recall: '#ff7aa8' }[kind] ?? '#fff';
    g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
    g.fillStyle = 'rgba(16,22,48,0.85)'; g.beginPath(); g.arc(64, 58, 40, 0, 7); g.fill();
    g.shadowBlur = 0; g.shadowOffsetY = 0;
    g.strokeStyle = col; g.lineWidth = 6; g.beginPath(); g.arc(64, 58, 40, 0, 7); g.stroke();
    g.fillStyle = 'rgba(16,22,48,0.85)'; g.beginPath(); g.moveTo(52, 94); g.lineTo(64, 116); g.lineTo(76, 94); g.fill();
    g.fillStyle = col; g.font = 'bold 54px "Atkinson Hyperlegible", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(kind === 'main' ? '!' : kind === 'side' ? '★' : kind === 'study' ? '✎' : '?', 64, 60);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; this.markerTex.set(kind, t); return t;
  }
  setMarker(id: string, kind: 'main' | 'side' | 'study' | 'recall' | null, gx: number, gy: number, lift: number) {
    let m = this.markers.get(id);
    if (!kind) { if (m) { this.scene.remove(m); this.markers.delete(id); } return; }
    if (!m) { m = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false })); m.renderOrder = 10; m.scale.setScalar(0.62); this.scene.add(m); this.markers.set(id, m); }
    (m.material as THREE.SpriteMaterial).map = this.markerTexture(kind); (m.material as THREE.SpriteMaterial).needsUpdate = true;
    m.userData.base = new THREE.Vector3(gx, this.groundY(gx, gy) + lift, gy);
  }

  tween(d: number, fn: (k: number) => void, done?: () => void) { this.tweens.push({ t: 0, d, fn, done }); }

  setSaturation(v: number, animate = true) {
    if (!animate) { this.saturation = v; this.satT = 1; this.satTo = v; return; }
    this.satFrom = this.saturation; this.satTo = v; this.satT = 0;
  }

  burstAt(x: number, y: number, z: number, color: string, n = 24, spread = 2.2, petals = false) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3), vel = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const pal = petals ? ['#ff7aa8', '#ffe27a', '#ffffff', '#ff9fc4'] : [color];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2, s = (0.4 + Math.random()) * spread;
      vel[i * 3] = Math.cos(a) * s; vel[i * 3 + 1] = 1.5 + Math.random() * spread * 1.2; vel[i * 3 + 2] = Math.sin(a) * s;
      c.set(pal[i % pal.length]); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: petals ? 0.18 : 0.16, map: this.glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: petals ? THREE.NormalBlending : THREE.AdditiveBlending }));
    this.scene.add(pts);
    this.particles.push({ pts, vel, life: new Float32Array(1), max: petals ? 2.6 : 1.3, kind: 'burst' });
  }
  cheer(color = '#5ef0a8') { const p = this.player; this.burstAt(p.gx, this.groundY(p.gx, p.gy) + 1.1, p.gy, color, 18, 1.4); p.squash = 1; }

  /** Treasure-moment: hold up a glowing item, camera nudges in. */
  fanfare(color: string) {
    const p = this.player;
    if (this.held) this.scene.remove(this.held);
    const item = new THREE.Group();
    item.add(mesh(G.oct, mat(color, { emissive: 0.9 }), 0, 0, 0, 0.18, 0.26, 0.18));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: new THREE.Color(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(1.6); item.add(halo);
    this.held = item; this.scene.add(item);
    p.yaw = Math.PI / 4; p.squash = 1;
    p.rig.arms.forEach((a) => (a.rotation.x = -2.6));
    const z0 = this.zoomTarget; this.zoomTarget = Math.max(0.7, z0 - 0.25);
    this.tween(2.4, (k) => { item.position.set(p.gx, this.groundY(p.gx, p.gy) + 1.35 + Math.sin(k * 6) * 0.04 + k * 0.1, p.gy); item.rotation.y = k * 8; }, () => { this.scene.remove(item); this.held = null; this.zoomTarget = z0; });
    this.burstAt(p.gx, this.groundY(p.gx, p.gy) + 1.4, p.gy, color, 40, 1.6);
  }

  reward(kind: string, zoneId: string, saturationTo: number) {
    const lm = this.landmarks.get(zoneId);
    this.setSaturation(saturationTo);
    if (!lm) return;
    const y = this.groundY(lm.x, lm.y);
    this.burstAt(lm.x, y + lm.height * 0.8, lm.y, this.kit.glow, 50, 2.5);
    if (kind === 'bloom' || kind === 'restore') this.burstAt(lm.x, y + lm.height, lm.y, '#ff7aa8', 80, 2.8, true);
    if (lm.orb) { const m = lm.orb.material as THREE.MeshStandardMaterial; m.emissiveIntensity = 2.4; const s0 = lm.orb.scale.clone(); this.tween(1.2, (k) => lm.orb!.scale.copy(s0).multiplyScalar(1 + Math.sin(k * Math.PI) * 0.6)); }
    const light = new THREE.PointLight(new THREE.Color(this.kit.glow), 0, 9, 1.5);
    light.position.set(lm.x, y + lm.height * 0.8, lm.y); this.scene.add(light);
    this.tween(1.5, (k) => (light.intensity = Math.sin(Math.min(1, k * 1.4) * Math.PI / 2) * 6), () => (light.intensity = 3));
    const o = lm.obj; const sy = o.scale.y;
    this.tween(0.5, (k) => o.scale.set(o.scale.x, sy * (1 + Math.sin(k * Math.PI * 2) * 0.06), o.scale.z));
    if (kind === 'bloom') o.traverse((c) => { if (c.name === 'petal') { const m = c as THREE.Mesh; const rx0 = m.rotation.x; const px = m.position.x, pz = m.position.z; (m.material as THREE.MeshStandardMaterial).color.set('#ff7aa8'); this.tween(1.6, (k) => { m.rotation.x = rx0 + (0.25 - rx0) * k; m.position.x = px * (1 + k * 2); m.position.z = pz * (1 + k * 2); m.position.y = 2.3 - k * 0.3; }); } });
    if (kind === 'bridge') this.openGate();
  }
  openGate() {
    if (this.gateOpen) return;
    this.gateOpen = true;
    const b = this.barrierObj; if (!b) return;
    this.burstAt(b.position.x, 0.8, b.position.z, this.kit.accent, 40, 2);
    this.tween(1.0, (k) => { b.scale.y = Math.max(0.01, 1 - k); b.position.y = -k * 0.5; }, () => { this.scene.remove(b); });
    this.barrierObj = null;
  }
  panTo(gx: number, gy: number, ms = 1600) { this.pan = { x: gx, z: gy, until: this.clock.elapsedTime + ms / 1000 }; }

  goatIn() {
    const p = this.player;
    if (!this.goat) this.goat = this.actor('goat', p.gx + 6, p.gy - 6, 1);
    const g = this.goat; g.rig.root.visible = true;
    const from = { x: p.gx + 5, y: p.gy - 5 }, to = { x: p.gx + 1.1, y: p.gy - 0.9 };
    g.gx = from.x; g.gy = from.y; g.yaw = Math.atan2(to.x - from.x, to.y - from.y); g.moving = true;
    this.tween(1.1, (k) => { g.gx = from.x + (to.x - from.x) * k; g.gy = from.y + (to.y - from.y) * k; }, () => { g.moving = false; g.yaw = Math.atan2(p.gx - g.gx, p.gy - g.gy); });
    return to;
  }
  goatOut() {
    const g = this.goat; if (!g) return;
    const from = { x: g.gx, y: g.gy }; g.yaw = Math.atan2(5, -5); g.moving = true;
    this.tween(1.2, (k) => { g.gx = from.x + 6 * k; g.gy = from.y - 6 * k; }, () => { g.moving = false; g.rig.root.visible = false; });
  }
  removeDiscovery(id: string) {
    const d = this.discoveries.find((q) => q.id === id); if (!d) return;
    d.found = true; this.burstAt(d.gx, this.groundY(d.gx, d.gy) + 0.5, d.gy, '#ffffff', 24, 1.5);
    this.tween(0.4, (k) => d.obj.scale.setScalar(1 - k), () => this.scene.remove(d.obj));
  }

  targets(): Target[] {
    const out: Target[] = [];
    for (const z of this.L.zones) {
      if (z.npc) out.push({ kind: 'npc', id: z.npc.id, x: z.npc.x + 0.5, y: z.npc.y + 0.5 });
      if (z.station) out.push({ kind: 'station', zoneId: z.zone.id, x: z.station.x + 0.5, y: z.station.y + 0.5 });
      out.push({ kind: 'landmark', zoneId: z.zone.id, x: z.landmark.x + 0.5, y: z.landmark.y + 0.5 });
    }
    for (const d of this.discoveries) if (!d.found) out.push({ kind: 'discovery', id: d.id, text: d.text, x: d.gx, y: d.gy });
    if (this.barrierObj && !this.gateOpen && this.L.gateCells.length) { const g = this.L.gateCells[0]; out.push({ kind: 'gate', x: g.x + 0.5, y: g.y + 0.5 }); }
    return out;
  }

  // ================================================================== input: click to walk
  private ray = new THREE.Raycaster();
  click(clientX: number, clientY: number) {
    if (this.hooks.isModal() || this.titleMode) return;
    const v = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    // interactables first (screen distance)
    let best: Target | null = null, bd = 46;
    for (const t of this.targets()) {
      if (t.kind === 'gate') continue;
      const lift = t.kind === 'landmark' ? 1.2 : 0.5;
      const s = this.toScreen(t.x, t.y, lift);
      const d = Math.hypot(s.x - clientX, s.y - clientY);
      if (d < bd) { bd = d; best = t; }
    }
    const hit = this.ray.intersectObject(this.terrain, false)[0];
    if (best) { this.walkTo(Math.floor(best.x), Math.floor(best.y), best); return; }
    if (!hit) return;
    this.walkTo(Math.floor(hit.point.x + (hit.face && hit.face.normal.y < 0.5 ? -hit.face.normal.x * 0.1 : 0)), Math.floor(hit.point.z + (hit.face && hit.face.normal.y < 0.5 ? -hit.face.normal.z * 0.1 : 0)), null);
  }
  walkTo(tx: number, ty: number, target: Target | null) {
    const px = Math.floor(this.player.gx), py = Math.floor(this.player.gy);
    let goal = { x: tx, y: ty };
    if (!walkable(this.L, tx, ty, this.gateOpen)) {
      let bestD = 1e9;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = tx + dx, ny = ty + dy;
        if (!walkable(this.L, nx, ny, this.gateOpen)) continue;
        const d = Math.hypot(dx, dy) + Math.hypot(nx - px, ny - py) * 0.01;
        if (d < bestD) { bestD = d; goal = { x: nx, y: ny }; }
      }
      if (bestD > 100) return;
    }
    const route = astar(px, py, goal.x, goal.y, (fx, fy, x, y) => (canStep(this.L, fx, fy, x, y, this.gateOpen) ? 1 : Infinity));
    if (!route) return;
    this.path = route.slice(1).map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }));
    this.pathTarget = target;
    this.ring.position.set(goal.x + 0.5, this.groundY(goal.x + 0.5, goal.y + 0.5) + 0.03, goal.y + 0.5); this.ring.visible = true;
    if (!this.path.length && target) this.hooks.onInteract(target);
  }

  private tryMove(a: Actor, dx: number, dy: number): boolean {
    const free = (gx: number, gy: number) => {
      const r = 0.22; const fx = Math.floor(a.gx), fy = Math.floor(a.gy);
      for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
        const x = Math.floor(gx + ox), y = Math.floor(gy + oy);
        if (x === fx && y === fy) continue;
        if (!canStep(this.L, fx, fy, x, y, this.gateOpen)) return false;
      }
      return true;
    };
    if (free(a.gx + dx, a.gy + dy)) { a.gx += dx; a.gy += dy; return true; }
    if (dx && free(a.gx + dx, a.gy)) { a.gx += dx; return true; }
    if (dy && free(a.gx, a.gy + dy)) { a.gy += dy; return true; }
    return false;
  }

  // ================================================================== loop
  start() {
    const loop = () => { requestAnimationFrame(loop); this.frame(); };
    this.renderer.domElement.addEventListener('pointerdown', (e) => { if (e.button === 0) this.click(e.clientX, e.clientY); });
    this.renderer.domElement.addEventListener('wheel', (e) => { this.zoomTarget = Math.min(1.5, Math.max(0.65, this.zoomTarget + e.deltaY * 0.0008)); }, { passive: true });
    loop();
  }

  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    windUniform.value = this.reducedMotion ? 0 : t;
    this.input.poll();
    const actions = this.input.take();
    const modal = this.hooks.isModal() || this.titleMode;
    for (const a of actions) {
      if (a === 'zoomIn') this.zoomTarget = Math.max(0.65, this.zoomTarget - 0.12);
      else if (a === 'zoomOut') this.zoomTarget = Math.min(1.5, this.zoomTarget + 0.12);
      if (!modal && a === 'interact' && this.nearTarget) { this.player.squash = 1; this.hooks.onInteract(this.nearTarget); continue; }
      this.hooks.onAction(a);
    }
    for (const r of this.input.takeReleased()) if (r === 'voice') this.hooks.onAction('voiceUp');

    // ---- player
    const p = this.player;
    let vx = 0, vy = 0;
    if (!modal) {
      const m = this.input.move();
      if (m.x || m.y) { this.path = []; this.pathTarget = null; this.ring.visible = false; }
      if (m.x || m.y) { vx = (m.x + m.y) / Math.SQRT2; vy = (m.y - m.x) / Math.SQRT2; }
      else if (this.path.length) {
        const q = this.path[0]; const dx = q.x - p.gx, dy = q.y - p.gy, d = Math.hypot(dx, dy);
        if (d < 0.12) { this.path.shift(); if (!this.path.length) { this.ring.visible = false; const tg = this.pathTarget; this.pathTarget = null; if (tg && Math.hypot(tg.x - p.gx, tg.y - p.gy) < 2.6) { p.yaw = Math.atan2(tg.x - p.gx, tg.y - p.gy); this.hooks.onInteract(tg); } } }
        else { vx = dx / d; vy = dy / d; }
      }
      const speed = 3.4;
      if (vx || vy) {
        const moved = this.tryMove(p, vx * speed * dt, vy * speed * dt);
        if (!moved && this.path.length) { this.path = []; this.ring.visible = false; }
        p.yaw = Math.atan2(vx, vy);
        if (Math.random() < dt * 3.5) this.hooks.onAction('step');
      }
    }
    p.moving = !!(vx || vy);
    // ---- companion trail
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - p.gx, last.y - p.gy) > 0.15) { this.trail.push({ x: p.gx, y: p.gy }); if (this.trail.length > 12) this.trail.shift(); }
    const goal = this.trail[0] ?? { x: p.gx, y: p.gy };
    const c = this.companion;
    const far = Math.hypot(p.gx - c.gx, p.gy - c.gy);
    if (far > 1.0) { c.gx += (goal.x - c.gx) * Math.min(1, dt * 3); c.gy += (goal.y - c.gy) * Math.min(1, dt * 3); c.yaw = Math.atan2(goal.x - c.gx, goal.y - c.gy); }
    else c.yaw = Math.atan2(p.gx - c.gx, p.gy - c.gy);
    if (far > 9) { c.gx = p.gx - 0.6; c.gy = p.gy; }
    // ---- NPCs look at player when near
    for (const [, a] of this.npcs) { if (Math.hypot(a.gx - p.gx, a.gy - p.gy) < 4) a.yaw = Math.atan2(p.gx - a.gx, p.gy - a.gy); }
    const all = [p, c, ...this.npcs.values(), ...(this.goat ? [this.goat] : [])];
    all.forEach((a, i) => {
      this.place(a);
      if (a !== p || !this.held) animateRig(a.rig, t, a.moving || (a === c && far > 1.2), i * 0.7);
      if (a.squash > 0) { a.squash = Math.max(0, a.squash - dt * 4); const s = Math.sin(a.squash * Math.PI) * 0.18; a.rig.bob.scale.set(1 + s * 0.6, 1 - s, 1 + s * 0.6); }
    });
    // ---- collectibles / discoveries spin
    for (let i = this.collectibles.length - 1; i >= 0; i--) {
      const col = this.collectibles[i];
      col.obj.rotation.y = t * 2; col.obj.position.y = this.groundY(col.gx, col.gy) + 0.38 + Math.sin(t * 3 + i) * 0.06;
      if (!modal && Math.hypot(col.gx - p.gx, col.gy - p.gy) < 0.6) {
        this.collectibles.splice(i, 1);
        const o = col.obj; const y0 = o.position.y;
        this.tween(0.45, (k) => { o.position.y = y0 + k * 1.0; o.scale.setScalar(1 - k * 0.8); }, () => this.scene.remove(o));
        this.burstAt(col.gx, y0, col.gy, this.kit.glow, 16, 1.2);
        this.hooks.onCollect(col.id, col.inst);
      }
    }
    for (const d of this.discoveries) if (!d.found) { d.obj.rotation.y = t; d.obj.position.y = this.groundY(d.gx, d.gy) + 0.5 + Math.sin(t * 2) * 0.08; }
    // ---- markers bob
    for (const [, m] of this.markers) { const b = m.userData.base as THREE.Vector3; m.position.set(b.x, b.y + Math.sin(t * 3) * 0.08, b.z); }
    // ---- nearest interactable
    let best: Target | null = null, bd = 1e9;
    if (!modal) for (const tg of this.targets()) {
      const d = Math.hypot(tg.x - p.gx, tg.y - p.gy);
      const range = tg.kind === 'landmark' ? 2.5 : tg.kind === 'gate' ? 2.2 : 1.7;
      if (d < range && d < bd && this.hooks.labelFor(tg)) { bd = d; best = tg; }
    }
    this.nearTarget = best;
    // ---- zone enter
    const cx = Math.floor(p.gx), cy = Math.floor(p.gy);
    const zc = inside(cx, cy) ? this.L.cells[cy][cx].zone : null;
    if (zc !== this.currentZone) { this.currentZone = zc; if (zc && !this.titleMode) { const z = this.L.zones.find((q) => q.zone.id === zc); if (z) this.hooks.onZoneEnter(z); } }
    // ---- particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const ps = this.particles[i]; const pos = ps.pts.geometry.attributes.position as THREE.BufferAttribute; const arr = pos.array as Float32Array;
      if (ps.kind === 'ambient') {
        for (let j = 0; j < arr.length / 3; j++) {
          arr[j * 3] += (ps.vel[j * 3] + Math.sin(t + j) * 0.1) * dt; arr[j * 3 + 1] += ps.vel[j * 3 + 1] * dt; arr[j * 3 + 2] += (ps.vel[j * 3 + 2] + Math.cos(t * 0.7 + j) * 0.1) * dt;
          if (Math.abs(arr[j * 3] - p.gx) > 9 || Math.abs(arr[j * 3 + 2] - p.gy) > 9 || arr[j * 3 + 1] > 3.5 || arr[j * 3 + 1] < 0) { arr[j * 3] = p.gx + (Math.random() - 0.5) * 16; arr[j * 3 + 2] = p.gy + (Math.random() - 0.5) * 16; arr[j * 3 + 1] = this.kit.particles === 'bubbles' ? 0 : Math.random() * 2.5 + 0.2; }
        }
        (ps.pts.material as THREE.PointsMaterial).opacity = 0.6 + Math.sin(t * 3) * 0.3;
      } else {
        ps.life[0] += dt;
        for (let j = 0; j < arr.length / 3; j++) { ps.vel[j * 3 + 1] -= 4.5 * dt; arr[j * 3] += ps.vel[j * 3] * dt; arr[j * 3 + 1] += ps.vel[j * 3 + 1] * dt; arr[j * 3 + 2] += ps.vel[j * 3 + 2] * dt; if (ps.max > 2) { ps.vel[j * 3] *= 0.98; ps.vel[j * 3 + 2] *= 0.98; ps.vel[j * 3 + 1] = Math.max(ps.vel[j * 3 + 1], -0.8); } }
        (ps.pts.material as THREE.PointsMaterial).opacity = 1 - ps.life[0] / ps.max;
        if (ps.life[0] > ps.max) { this.scene.remove(ps.pts); ps.pts.geometry.dispose(); this.particles.splice(i, 1); }
      }
      pos.needsUpdate = true;
    }
    // ---- clouds
    this.scene.children.forEach((o) => { if (o.name === 'cloud') { const a = Math.atan2(o.position.z - N / 2, o.position.x - N / 2) + dt * 0.01 * (o.userData.speed as number); const r = N * 0.62; o.position.x = N / 2 + Math.cos(a) * r; o.position.z = N / 2 + Math.sin(a) * r; } });
    // ---- tweens
    for (let i = this.tweens.length - 1; i >= 0; i--) { const tw = this.tweens[i]; tw.t += dt; const k = Math.min(1, tw.t / tw.d); tw.fn(k); if (k >= 1) { this.tweens.splice(i, 1); tw.done?.(); } }
    if (this.satT < 1) { this.satT = Math.min(1, this.satT + dt / 2.2); const k = this.satT * this.satT * (3 - 2 * this.satT); this.saturation = this.satFrom + (this.satTo - this.satFrom) * k; }
    (this.grade.uniforms.saturation as { value: number }).value = 1 + this.saturation;
    // ---- camera: high three-quarter, tight, slight lead
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 5);
    let fx = p.gx, fz = p.gy;
    if (this.titleMode) { fx = N / 2 + Math.cos(t * 0.05) * 3; fz = N / 2 + Math.sin(t * 0.05) * 3; }
    if (this.pan && t < this.pan.until) { fx = this.pan.x; fz = this.pan.z; } else this.pan = null;
    this.lead.lerp(new THREE.Vector3(vx * 0.9, 0, vy * 0.9), Math.min(1, dt * 2));
    const goalT = new THREE.Vector3(fx + this.lead.x, this.groundY(p.gx, p.gy) * 0.6, fz + this.lead.z);
    this.camTarget.lerp(goalT, Math.min(1, dt * (this.pan ? 2 : 4)));
    const dist = (this.titleMode ? 30 : 19) * this.zoom;
    const dir = new THREE.Vector3(1, 1.45, 1).normalize();
    this.camera.position.copy(this.camTarget).addScaledVector(dir, dist);
    this.camera.lookAt(this.camTarget);
    this.sun.position.set(this.camTarget.x - 8, this.camTarget.y + 16, this.camTarget.z + 4);
    this.sun.target.position.copy(this.camTarget);
    (this.tiltH.uniforms.strength as { value: number }).value = this.reducedMotion ? 0.5 : 1;
    (this.tiltV.uniforms.strength as { value: number }).value = this.reducedMotion ? 0.5 : 1;
    if (this.ring.visible) (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(t * 6) * 0.3;
    if (!this.paused) this.hooks.onFrame(dt);
    this.composer.render();
  }
}
