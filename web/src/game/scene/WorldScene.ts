/** The isometric diorama: terrain, props, characters, camera, movement, interaction detection and world FX. */
import Phaser from 'phaser';
import type { WorldSpec } from '../../shared/contracts';
import { ART, depthOf, isoX, isoY, LH, screenToGrid } from '../core/iso';
import type { Input } from '../core/input';
import type { GameState } from '../core/state';
import { drawLandmark } from '../art/landmarks';
import { drawBarrier, drawCollectible, drawDot, drawPetal, drawProp, drawShadow, drawSparkle, drawStation, type Art } from '../art/props';
import { drawSheet, FH, FRAMES, FW } from '../art/characters';
import { paintTerrain, TERRAIN_SCALE, WATER_H } from '../art/terrain';
import { canvas, glow, hexNum, star } from '../art/paint';
import type { Kit } from '../world/kits';
import { astar, buildLayout, canStep, inside, N, walkable, type Layout, type ZonePlace } from '../world/layout';

export type Target =
  | { kind: 'npc'; id: string; x: number; y: number }
  | { kind: 'station'; zoneId: string; x: number; y: number }
  | { kind: 'landmark'; zoneId: string; x: number; y: number }
  | { kind: 'discovery'; id: string; text: string; x: number; y: number }
  | { kind: 'gate'; x: number; y: number };

interface Actor { sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Image; gx: number; gy: number; face: 'front' | 'back'; flip: boolean; moving: boolean; key: string }
interface PropObj { img: Phaser.GameObjects.Image; sway: number; phase: number; tall: boolean; gx: number; gy: number; zone: string | null; glow?: boolean }

export interface SceneHooks {
  onInteract(t: Target): void;
  labelFor(t: Target): string | null;
  onZoneEnter(z: ZonePlace): void;
  onCollect(id: string, instance: string): void;
  isModal(): boolean;
  onAction(a: string): void;
  onFrame(dt: number): void;
}

export class WorldScene extends Phaser.Scene {
  world!: WorldSpec; kit!: Kit; state!: GameState; input2!: Input; hooks!: SceneHooks;
  L!: Layout;
  player!: Actor; companion!: Actor; goat: Actor | null = null;
  npcs = new Map<string, Actor>();
  props: PropObj[] = [];
  landmarks = new Map<string, Phaser.GameObjects.Image>();
  stations = new Map<string, Phaser.GameObjects.Image>();
  markers = new Map<string, Phaser.GameObjects.Image>();
  collectibles: { img: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image; id: string; inst: string; gx: number; gy: number }[] = [];
  discoveries: { img: Phaser.GameObjects.Image; id: string; text: string; gx: number; gy: number; found: boolean }[] = [];
  barrier: Phaser.GameObjects.Image | null = null;
  gateOpen = false;
  path: { x: number; y: number }[] = [];
  pathTarget: Target | null = null;
  targetRing!: Phaser.GameObjects.Image;
  colorFx: Phaser.FX.ColorMatrix | null = null;
  saturation = 0;
  currentZone: string | null = null;
  nearTarget: Target | null = null;
  reducedMotion = false;
  private trail: { x: number; y: number }[] = [];
  private zoomTarget = 1.35;

  constructor() { super('world'); }

  init(data: { world: WorldSpec; kit: Kit; state: GameState; input: Input; hooks: SceneHooks }) {
    Object.assign(this, { world: data.world, kit: data.kit, state: data.state, input2: data.input, hooks: data.hooks });
  }

  // ------------------------------------------------------------ textures
  private tex(key: string, art: Art) {
    if (!this.textures.exists(key)) this.textures.addCanvas(key, art.c);
    return art;
  }
  private sheet(key: string, archetype: string) {
    if (this.textures.exists(key)) return;
    const t = this.textures.addCanvas(key, drawSheet(archetype))!;
    for (let f = 0; f < FRAMES; f++) t.add(f, 0, f * FW * ART, 0, FW * ART, FH * ART);
    const mk = (name: string, frames: number[], rate: number) => this.anims.create({ key: `${key}-${name}`, frames: frames.map((f) => ({ key, frame: f })), frameRate: rate, repeat: -1 });
    mk('idle-front', [0, 0, 0, 1], 3); mk('walk-front', [2, 3, 4, 5], 9); mk('idle-back', [6, 6, 6, 7], 3); mk('walk-back', [8, 9, 10, 11], 9);
  }

  cellH(gx: number, gy: number): number {
    const x = Math.floor(gx), y = Math.floor(gy);
    if (!inside(x, y)) return 0;
    const c = this.L.cells[y][x];
    return c.water && !c.bridge ? WATER_H : c.h;
  }
  sx(gx: number, gy: number) { return isoX(gx, gy); }
  sy(gx: number, gy: number, h?: number) { return isoY(gx, gy, h ?? this.cellH(gx, gy)); }

  create() {
    this.L = buildLayout(this.world, this.kit);
    const T = paintTerrain(this.L, this.kit, this.world.seed);
    this.textures.addCanvas('terrain', T.canvas);
    this.add.image(-T.ox, -T.oy, 'terrain').setOrigin(0, 0).setScale(1 / TERRAIN_SCALE).setDepth(-100000);

    this.tex('shadow', drawShadow());
    this.tex('dot-glow', drawDot(this.kit.glow, 5));
    this.tex('dot-white', drawDot('#ffffff', 4));
    this.tex('petal-a', drawPetal('#ff7aa8')); this.tex('petal-b', drawPetal('#ffe27a')); this.tex('petal-c', drawPetal('#ffffff'));
    this.tex('sparkle', drawSparkle(this.kit));
    this.makeMarkerTextures();

    // props
    let vi = 0;
    for (const p of this.L.placed) {
      if (p.kind !== 'prop') continue;
      const variant = (vi++ * 7 + Math.floor(p.x * 3 + p.y)) % 3;
      const key = `prop:${p.key}:${variant}`;
      const art = this.tex(key, drawProp(p.key, this.kit, variant));
      const h = this.cellH(p.x, p.y);
      const img = this.add.image(this.sx(p.x, p.y), this.sy(p.x, p.y, h) + 6, key).setOrigin(0.5, 1).setScale(1 / ART);
      img.setDepth(depthOf(p.x, p.y));
      const tall = art.h > 60;
      if (tall) this.add.image(img.x, img.y - 6, 'shadow').setScale(art.w / 64 * 0.9 / ART * 2, 1 / ART * 1.6).setDepth(-50000).setAlpha(0.8);
      const cell = this.L.cells[Math.floor(p.y)][Math.floor(p.x)];
      this.props.push({ img, sway: art.sway ?? 0, phase: Math.random() * 6, tall, gx: p.x, gy: p.y, zone: cell.zone, glow: !!art.glow });
    }
    // landmarks
    for (const z of this.L.zones) {
      const lx = z.landmark.x + 0.5, ly = z.landmark.y + 0.5;
      const key = `lm:${z.zone.landmark}`;
      const art = this.tex(key, drawLandmark(z.zone.landmark, this.kit, 'idle'));
      if (z.zone.landmark === 'bloom') this.tex('lm:bloom:open', drawLandmark('bloom', this.kit, 'open'));
      const img = this.add.image(this.sx(lx, ly), this.sy(lx, ly) + 24, key).setOrigin(0.5, 1).setScale(1 / ART);
      img.setDepth(depthOf(lx, ly) + 8);
      this.add.image(img.x, img.y - 22, 'shadow').setScale(2.6 / ART * 2, 1.6 / ART * 2).setDepth(-50000).setAlpha(0.7);
      this.landmarks.set(z.zone.id, img);
      this.props.push({ img, sway: 0, phase: 0, tall: art.h > 60, gx: lx, gy: ly, zone: z.zone.id });
      if (z.station) {
        const sk = 'station';
        this.tex(sk, drawStation(this.kit));
        const sx = z.station.x + 0.5, sy = z.station.y + 0.5;
        const st = this.add.image(this.sx(sx, sy), this.sy(sx, sy) + 6, sk).setOrigin(0.5, 1).setScale(1 / ART).setDepth(depthOf(sx, sy));
        this.add.image(st.x, st.y - 6, 'shadow').setScale(0.9 / ART * 2, 0.6 / ART * 2).setDepth(-50000);
        this.stations.set(z.zone.id, st);
      }
    }
    // gate barrier
    if (this.L.gateCells.length) {
      const g = this.L.gateCells[Math.floor(this.L.gateCells.length / 2)];
      this.tex('barrier', drawBarrier(this.kit));
      this.barrier = this.add.image(this.sx(g.x + 0.5, g.y + 0.5), this.sy(g.x + 0.5, g.y + 0.5, 0) + 6, 'barrier').setOrigin(0.5, 1).setScale(1 / ART).setDepth(depthOf(g.x + 0.5, g.y + 0.5));
    }
    // collectibles + discoveries
    for (const p of this.L.placed) {
      if (p.kind === 'collectible') {
        const key = `col:${p.key}`; this.tex(key, drawCollectible(p.key, this.kit));
        const inst = `${p.id}@${p.x},${p.y}`;
        const img = this.add.image(this.sx(p.x, p.y), this.sy(p.x, p.y) + 6, key).setOrigin(0.5, 1).setScale(1 / ART).setDepth(depthOf(p.x, p.y));
        const sh = this.add.image(img.x, img.y - 6, 'shadow').setScale(0.5 / ART * 2, 0.4 / ART * 2).setDepth(-50000);
        this.tweens.add({ targets: img, y: img.y - 6, yoyo: true, repeat: -1, duration: 900 + Math.random() * 300, ease: 'Sine.inOut' });
        this.collectibles.push({ img, shadow: sh, id: p.id!, inst, gx: p.x, gy: p.y });
      } else if (p.kind === 'discovery') {
        const img = this.add.image(this.sx(p.x, p.y), this.sy(p.x, p.y) + 6, 'sparkle').setOrigin(0.5, 1).setScale(1 / ART).setDepth(depthOf(p.x, p.y));
        this.tweens.add({ targets: img, alpha: 0.45, scale: 0.42, yoyo: true, repeat: -1, duration: 800 });
        this.discoveries.push({ img, id: p.id!, text: p.text ?? '', gx: p.x, gy: p.y, found: false });
      }
    }

    // characters
    const playerArch = this.kit.id === 'space' ? 'astronaut' : 'kid';
    this.sheet('ch:player', playerArch);
    this.player = this.makeActor('ch:player', this.L.spawn.x + 0.5, this.L.spawn.y + 0.5);
    this.sheet('ch:companion', this.kit.companion);
    this.companion = this.makeActor('ch:companion', this.L.spawn.x - 0.5, this.L.spawn.y + 0.5, 0.85);
    this.companion.shadow.setScale(0.5 / ART * 2, 0.35 / ART * 2);
    for (const z of this.L.zones) {
      if (!z.npc) continue;
      const spec = this.world.npcs.find((n) => n.id === z.npc!.id)!;
      const key = `ch:npc:${spec.archetype}`;
      this.sheet(key, spec.archetype);
      const a = this.makeActor(key, z.npc.x + 0.5, z.npc.y + 0.5, 1.12);
      this.npcs.set(spec.id, a);
    }

    // ring for click-to-walk
    const ring = canvas(40, 20); ring.g.strokeStyle = '#ffffff'; ring.g.lineWidth = 2.5; ring.g.beginPath(); ring.g.ellipse(20, 10, 16, 7, 0, 0, 7); ring.g.stroke();
    this.textures.addCanvas('ring', ring.c);
    this.targetRing = this.add.image(0, 0, 'ring').setScale(1 / ART).setDepth(-40000).setVisible(false);

    // camera
    const cam = this.cameras.main;
    cam.setZoom(this.zoomTarget);
    cam.startFollow(this.player.sprite, true, 0.09, 0.09, 0, 20);
    cam.roundPixels = false;
    try { this.colorFx = cam.postFX.addColorMatrix(); } catch { this.colorFx = null; }
    this.setSaturation(this.kit.startSaturation, false);

    this.ambient();
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => { this.zoomTarget = Phaser.Math.Clamp(this.zoomTarget - dy * 0.0012, 0.8, 2.2); });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (!this.hooks.isModal() && p.leftButtonDown()) this.clickTo(p.worldX, p.worldY); });
    this.scale.on('resize', () => cam.setZoom(this.zoomTarget));
  }

  private makeActor(key: string, gx: number, gy: number, scale = 1): Actor {
    const shadow = this.add.image(0, 0, 'shadow').setScale(0.75 / ART * 2 * scale, 0.5 / ART * 2 * scale).setDepth(-50000);
    const sprite = this.add.sprite(0, 0, key, 0).setOrigin(0.5, 1).setScale(scale / ART);
    sprite.play(`${key}-idle-front`);
    const a: Actor = { sprite, shadow, gx, gy, face: 'front', flip: false, moving: false, key };
    this.placeActor(a);
    return a;
  }
  placeActor(a: Actor, lift = 0) {
    const h = this.cellH(a.gx, a.gy);
    const x = this.sx(a.gx, a.gy), y = this.sy(a.gx, a.gy, Math.max(h, 0)) + 4;
    a.sprite.setPosition(x, y - lift); a.shadow.setPosition(x, y - 4);
    a.sprite.setDepth(depthOf(a.gx, a.gy) + 4);
  }
  animate(a: Actor, moving: boolean, vx: number, vy: number) {
    if (moving) { a.face = vy > 0.05 || (Math.abs(vy) <= 0.05 && a.face === 'front') ? 'front' : 'back'; if (Math.abs(vx) > 0.05) a.flip = vx < 0; }
    a.sprite.setFlipX(a.flip);
    const anim = `${a.key}-${moving ? 'walk' : 'idle'}-${a.face}`;
    if (a.sprite.anims.currentAnim?.key !== anim) a.sprite.play(anim, true);
  }

  private makeMarkerTextures() {
    const mk = (key: string, color: string, glyph: 'excl' | 'star' | 'book' | 'brain') => {
      const { c, g } = canvas(30, 36);
      glow(g, 15, 15, 15, color, 0.5);
      g.beginPath(); g.roundRect(4, 3, 22, 22, 8); g.fillStyle = color; g.fill(); g.lineWidth = 2; g.strokeStyle = '#1f1633'; g.stroke();
      g.beginPath(); g.moveTo(11, 24); g.lineTo(15, 31); g.lineTo(19, 24); g.closePath(); g.fillStyle = color; g.fill(); g.stroke();
      g.fillStyle = '#1f1633';
      if (glyph === 'excl') { g.fillRect(13.5, 7, 3, 10); g.fillRect(13.5, 19, 3, 3); }
      if (glyph === 'star') star(g, 15, 14, 7, '#1f1633', 5, 0.5, false);
      if (glyph === 'book') { g.fillRect(9, 9, 5.5, 10); g.fillRect(15.5, 9, 5.5, 10); g.fillStyle = color; g.fillRect(10, 10, 3.5, 1.4); g.fillRect(16.5, 10, 3.5, 1.4); }
      if (glyph === 'brain') { g.beginPath(); g.arc(15, 14, 6, 0, 7); g.fill(); g.fillStyle = color; g.fillRect(14.3, 9, 1.4, 10); }
      this.textures.addCanvas(key, c);
    };
    mk('mk:main', '#ffc93c', 'excl'); mk('mk:side', '#4cc9f0', 'star'); mk('mk:study', '#3ddc97', 'book'); mk('mk:recall', '#ff5d8f', 'brain');
  }
  /** Show/hide a bouncing marker above an anchor. */
  setMarker(id: string, kind: 'main' | 'side' | 'study' | 'recall' | null, x: number, y: number) {
    let m = this.markers.get(id);
    if (!kind) { if (m) { m.destroy(); this.markers.delete(id); } return; }
    if (!m) {
      m = this.add.image(x, y, `mk:${kind}`).setOrigin(0.5, 1).setScale(1 / ART).setDepth(900000);
      this.tweens.add({ targets: m, y: y - 6, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.inOut' });
      this.markers.set(id, m);
    }
    m.setTexture(`mk:${kind}`); m.x = x;
  }

  // ------------------------------------------------------------ ambience
  private ambient() {
    const k = this.kit;
    const cx = 0, cy = isoY(N / 2, N / 2, 0);
    const zone = new Phaser.Geom.Rectangle(cx - N * 30, cy - N * 15, N * 60, N * 30);
    const cfg: Record<string, Phaser.Types.GameObjects.Particles.ParticleEmitterConfig> = {
      fireflies: { lifespan: 5000, speed: { min: 4, max: 14 }, scale: { start: 0.6, end: 0.2 }, alpha: { values: [0, 1, 0.3, 1, 0] }, quantity: 1, frequency: 140, blendMode: 'ADD' },
      pollen: { lifespan: 6000, speedX: { min: 4, max: 12 }, speedY: { min: -4, max: 4 }, scale: 0.35, alpha: { values: [0, 0.8, 0] }, frequency: 120 },
      stars: { lifespan: 2500, speed: 2, scale: { start: 0.5, end: 0 }, alpha: { values: [0, 1, 0] }, frequency: 90, blendMode: 'ADD' },
      bubbles: { lifespan: 5000, speedY: { min: -30, max: -14 }, speedX: { min: -4, max: 4 }, scale: { start: 0.35, end: 0.6 }, alpha: { values: [0, 0.8, 0] }, frequency: 120 },
      sparks: { lifespan: 3000, speedY: { min: -16, max: -6 }, scale: { start: 0.5, end: 0 }, alpha: { values: [0, 1, 0] }, frequency: 130, blendMode: 'ADD' },
      dust: { lifespan: 6000, speedX: { min: 6, max: 18 }, speedY: { min: -3, max: 3 }, scale: 0.3, alpha: { values: [0, 0.6, 0] }, frequency: 110 },
    };
    const tex = k.particles === 'bubbles' ? 'dot-white' : 'dot-glow';
    const em = this.add.particles(0, 0, tex, { ...cfg[k.particles], emitZone: { type: 'random', source: zone as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource } as Phaser.Types.GameObjects.Particles.EmitZoneData });
    em.setDepth(800000);
    // water shimmer
    let n = 0;
    for (let y = 0; y < N && n < 70; y++) for (let x = 0; x < N && n < 70; x++) {
      const c = this.L.cells[y][x];
      if (!c.water || (x * 13 + y * 7) % 5) continue;
      n++;
      const s = this.add.image(this.sx(x + 0.5, y + 0.5), this.sy(x + 0.5, y + 0.5, WATER_H), 'dot-white').setScale(0.25, 0.12).setDepth(-60000).setAlpha(0).setBlendMode('ADD');
      this.tweens.add({ targets: s, alpha: 0.9, scaleX: 0.7, yoyo: true, repeat: -1, duration: 900 + ((x * y) % 7) * 150, delay: (x * 97 + y * 31) % 2000 });
    }
    // glow on lamp-like props
    for (const p of this.props) if (p.glow) {
      const gl = this.add.image(p.img.x, p.img.y - 30, 'dot-glow').setScale(3).setAlpha(0.25).setBlendMode('ADD').setDepth(p.img.depth + 1);
      this.tweens.add({ targets: gl, alpha: 0.45, yoyo: true, repeat: -1, duration: 1400 + Math.random() * 600 });
    }
  }

  setSaturation(v: number, animate = true) {
    if (!this.colorFx) return;
    const apply = (s: number) => { this.saturation = s; this.colorFx!.reset(); this.colorFx!.saturate(s); if (s < -0.05) this.colorFx!.brightness(1 + s * 0.08, true); };
    if (!animate) { apply(v); return; }
    const o = { s: this.saturation };
    this.tweens.add({ targets: o, s: v, duration: 2200, ease: 'Sine.inOut', onUpdate: () => apply(o.s) });
  }

  // ------------------------------------------------------------ movement
  private clickTo(wx: number, wy: number) {
    let best: { x: number; y: number } | null = null;
    for (const h of [1, 0.5, 0]) {
      const g = screenToGrid(wx, wy + h * LH);
      const x = Math.floor(g.gx), y = Math.floor(g.gy);
      if (inside(x, y) && Math.abs(this.L.cells[y][x].h - h) < 0.01 && this.L.cells[y][x].island) { best = { x, y }; break; }
    }
    if (!best) return;
    // clicked an interactable? walk next to it and interact
    const t = this.targets().find((tt) => Math.floor(tt.x) === best!.x && Math.floor(tt.y) === best!.y) ?? this.targets().find((tt) => Math.hypot(tt.x - best!.x - 0.5, tt.y - best!.y - 0.5) < 1.2 && tt.kind !== 'gate');
    this.walkTo(best.x, best.y, t ?? null);
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
    this.targetRing.setPosition(this.sx(goal.x + 0.5, goal.y + 0.5), this.sy(goal.x + 0.5, goal.y + 0.5)).setVisible(true).setAlpha(1);
  }

  private tryMove(a: Actor, dx: number, dy: number): boolean {
    const free = (gx: number, gy: number) => {
      const r = 0.22;
      const fx = Math.floor(a.gx), fy = Math.floor(a.gy);
      for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
        const x = Math.floor(gx + ox), y = Math.floor(gy + oy);
        if (x === fx && y === fy) continue;
        if (!canStep(this.L, fx, fy, x, y, this.gateOpen)) return false;
      }
      return true;
    };
    const nx = a.gx + dx, ny = a.gy + dy;
    if (free(nx, ny)) { a.gx = nx; a.gy = ny; return true; }
    if (dx && free(a.gx + dx, a.gy)) { a.gx += dx; return true; }
    if (dy && free(a.gx, a.gy + dy)) { a.gy += dy; return true; }
    return false;
  }

  targets(): Target[] {
    const out: Target[] = [];
    for (const z of this.L.zones) {
      if (z.npc) out.push({ kind: 'npc', id: z.npc.id, x: z.npc.x + 0.5, y: z.npc.y + 0.5 });
      if (z.station) out.push({ kind: 'station', zoneId: z.zone.id, x: z.station.x + 0.5, y: z.station.y + 0.5 });
      out.push({ kind: 'landmark', zoneId: z.zone.id, x: z.landmark.x + 0.5, y: z.landmark.y + 0.5 });
    }
    for (const d of this.discoveries) if (!d.found) out.push({ kind: 'discovery', id: d.id, text: d.text, x: d.gx, y: d.gy });
    if (this.barrier && !this.gateOpen && this.L.gateCells.length) { const g = this.L.gateCells[0]; out.push({ kind: 'gate', x: g.x + 0.5, y: g.y + 0.5 }); }
    return out;
  }

  update(_t: number, dms: number) {
    const dt = Math.min(dms, 50) / 1000;
    this.input2.poll();
    const actions = this.input2.take();
    const modal = this.hooks.isModal();
    for (const a of actions) {
      if (a === 'zoomIn') this.zoomTarget = Math.min(2.2, this.zoomTarget + 0.15);
      else if (a === 'zoomOut') this.zoomTarget = Math.max(0.8, this.zoomTarget - 0.15);
      if (!modal && a === 'interact' && this.nearTarget) { this.hooks.onInteract(this.nearTarget); continue; }
      this.hooks.onAction(a);
    }
    for (const r of this.input2.takeReleased()) if (r === 'voice') this.hooks.onAction('voiceUp');
    const cam = this.cameras.main;
    cam.setZoom(cam.zoom + (this.zoomTarget - cam.zoom) * Math.min(1, dt * 8));

    // player movement
    let mvx = 0, mvy = 0;
    if (!modal) {
      const m = this.input2.move();
      if (m.x || m.y) { this.path = []; this.pathTarget = null; this.targetRing.setVisible(false); }
      let gx = 0, gy = 0;
      if (m.x || m.y) {
        gx = (m.x / 32 + m.y / 16) / 2; gy = (m.y / 16 - m.x / 32) / 2;
        const len = Math.hypot(gx, gy) || 1;
        const mag = Math.min(1, Math.hypot(m.x, m.y));
        gx = (gx / len) * mag; gy = (gy / len) * mag;
      } else if (this.path.length) {
        const p = this.path[0];
        const dx = p.x - this.player.gx, dy = p.y - this.player.gy, d = Math.hypot(dx, dy);
        if (d < 0.12) { this.path.shift(); if (!this.path.length) { this.targetRing.setVisible(false); const t = this.pathTarget; this.pathTarget = null; if (t && Math.hypot(t.x - this.player.gx, t.y - this.player.gy) < 2.2) this.hooks.onInteract(t); } }
        else { gx = dx / d; gy = dy / d; }
      }
      const speed = 3.6;
      if (gx || gy) {
        const moved = this.tryMove(this.player, gx * speed * dt, gy * speed * dt);
        if (!moved && this.path.length) { this.path = []; this.targetRing.setVisible(false); }
        mvx = (gx - gy); mvy = (gx + gy);
      }
    }
    const moving = Math.abs(mvx) + Math.abs(mvy) > 0.01;
    this.animate(this.player, moving, mvx, mvy);
    this.placeActor(this.player);
    if (moving && Math.random() < dt * 4) this.hooks.onAction('step');

    // companion follows trail
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - this.player.gx, last.y - this.player.gy) > 0.15) { this.trail.push({ x: this.player.gx, y: this.player.gy }); if (this.trail.length > 14) this.trail.shift(); }
    const goal = this.trail[0] ?? { x: this.player.gx, y: this.player.gy };
    const c = this.companion;
    const cdx = goal.x - c.gx, cdy = goal.y - c.gy;
    const far = Math.hypot(this.player.gx - c.gx, this.player.gy - c.gy);
    if (far > 1.0) { c.gx += cdx * Math.min(1, dt * 3.2); c.gy += cdy * Math.min(1, dt * 3.2); }
    this.animate(c, far > 1.2, cdx - cdy, cdx + cdy);
    this.placeActor(c, 14 + Math.sin(this.time.now / 400) * 3);
    c.sprite.setDepth(depthOf(c.gx, c.gy) + 5);

    // goat
    if (this.goat) this.placeActor(this.goat);

    // NPCs face player when near
    for (const [, a] of this.npcs) {
      const d = Math.hypot(a.gx - this.player.gx, a.gy - this.player.gy);
      if (d < 4) { const vx = (this.player.gx - a.gx) - (this.player.gy - a.gy), vy = (this.player.gx - a.gx) + (this.player.gy - a.gy); a.face = vy >= 0 ? 'front' : 'back'; a.flip = vx < 0; }
      this.animate(a, false, 0, 0);
    }

    // sway + occlusion fade
    const t = this.time.now / 1000;
    const ps = this.player.sprite;
    const pd = ps.depth;
    for (const p of this.props) {
      if (p.sway && !this.reducedMotion) p.img.setAngle(Math.sin(t * 1.3 + p.phase) * p.sway);
      if (p.tall) {
        const behind = p.img.depth > pd && Math.abs(p.img.x - ps.x) < p.img.displayWidth * 0.42 && ps.y < p.img.y && ps.y > p.img.y - p.img.displayHeight + 10;
        const goalA = behind ? 0.42 : 1;
        p.img.alpha += (goalA - p.img.alpha) * Math.min(1, dt * 10);
      }
    }

    // collectibles
    for (let i = this.collectibles.length - 1; i >= 0; i--) {
      const col = this.collectibles[i];
      if (Math.hypot(col.gx - this.player.gx, col.gy - this.player.gy) < 0.6) {
        this.collectibles.splice(i, 1);
        this.tweens.killTweensOf(col.img);
        this.tweens.add({ targets: col.img, y: col.img.y - 30, alpha: 0, scale: 0.8, duration: 400, onComplete: () => col.img.destroy() });
        col.shadow.destroy();
        this.burst(col.img.x, col.img.y - 10, 10, this.kit.glow);
        this.hooks.onCollect(col.id, col.inst);
      }
    }

    // nearest interactable
    let best: Target | null = null, bd = 1e9;
    if (!modal) for (const tg of this.targets()) {
      const d = Math.hypot(tg.x - this.player.gx, tg.y - this.player.gy);
      const range = tg.kind === 'landmark' ? 2.4 : tg.kind === 'gate' ? 2.2 : 1.7;
      if (d < range && d < bd && this.hooks.labelFor(tg)) { bd = d; best = tg; }
    }
    this.nearTarget = best;

    // zone enter
    const cx = Math.floor(this.player.gx), cy = Math.floor(this.player.gy);
    const zc = inside(cx, cy) ? this.L.cells[cy][cx].zone : null;
    if (zc !== this.currentZone) {
      this.currentZone = zc;
      if (zc) { const z = this.L.zones.find((q) => q.zone.id === zc); if (z) this.hooks.onZoneEnter(z); }
    }
    if (this.targetRing.visible) this.targetRing.setAlpha(0.6 + Math.sin(t * 6) * 0.3);
    this.hooks.onFrame(dt);
  }

  // ------------------------------------------------------------ helpers for UI / director
  toScreen(gx: number, gy: number, lift = 0): { x: number; y: number } {
    const cam = this.cameras.main;
    const wx = this.sx(gx, gy), wy = this.sy(gx, gy, Math.max(0, this.cellH(gx, gy))) - lift;
    const p = cam.getWorldPoint(0, 0);
    return { x: (wx - p.x) * cam.zoom, y: (wy - p.y) * cam.zoom };
  }
  teleport(gx: number, gy: number) {
    this.player.gx = gx; this.player.gy = gy; this.trail = []; this.companion.gx = gx - 0.8; this.companion.gy = gy;
    this.placeActor(this.player); this.cameras.main.centerOn(this.player.sprite.x, this.player.sprite.y);
  }
  zoneCenter(id: string): { x: number; y: number } | null { const z = this.L.zones.find((q) => q.zone.id === id); return z ? { x: z.cx + 0.5, y: z.cy + 0.5 } : null; }

  burst(x: number, y: number, n: number, color: string, tex = 'dot-glow') {
    const em = this.add.particles(x, y, tex, { speed: { min: 40, max: 140 }, angle: { min: 200, max: 340 }, gravityY: 160, lifespan: 900, scale: { start: 0.8, end: 0 }, tint: hexNum(color), quantity: n, emitting: false, blendMode: 'ADD' });
    em.setDepth(900001); em.explode(n); this.time.delayedCall(1200, () => em.destroy());
  }
  petals(x: number, y: number, n = 40) {
    for (const tex of ['petal-a', 'petal-b', 'petal-c']) {
      const em = this.add.particles(x, y, tex, { speed: { min: 60, max: 220 }, angle: { min: 180, max: 360 }, gravityY: 70, lifespan: 2600, rotate: { min: 0, max: 360 }, scale: { start: 0.9, end: 0.4 }, alpha: { start: 1, end: 0 }, quantity: Math.ceil(n / 3), emitting: false });
      em.setDepth(900001); em.explode(Math.ceil(n / 3)); this.time.delayedCall(3000, () => em.destroy());
    }
  }

  /** Visible world change for a reward effect. */
  reward(kind: string, zoneId: string, saturationTo: number) {
    const lm = this.landmarks.get(zoneId);
    const z = this.L.zones.find((q) => q.zone.id === zoneId);
    const x = lm?.x ?? 0, y = (lm?.y ?? 0) - 60;
    const cam = this.cameras.main;
    if (!this.reducedMotion) cam.flash(350, 255, 250, 220, false);
    this.setSaturation(saturationTo);
    const halo = this.add.image(x, y - 20, 'dot-glow').setScale(2).setAlpha(0).setBlendMode('ADD').setDepth((lm?.depth ?? 0) + 2);
    this.tweens.add({ targets: halo, alpha: 0.85, scale: kind === 'light' || kind === 'power' ? 14 : 9, duration: 900, yoyo: true, hold: 600, onComplete: () => halo.setAlpha(0.35).setScale(6) });
    if (lm) this.tweens.add({ targets: lm, scaleY: lm.scaleY * 1.06, scaleX: lm.scaleX * 0.97, yoyo: true, duration: 180, repeat: 1 });
    this.burst(x, y, 30, this.kit.glow);
    if (kind === 'bloom' || kind === 'restore') this.petals(x, y - 30, kind === 'bloom' ? 90 : 40);
    if (kind === 'bloom' && lm && this.textures.exists('lm:bloom:open')) {
      this.tweens.add({ targets: lm, scaleY: 0, duration: 250, yoyo: false, onComplete: () => { lm.setTexture('lm:bloom:open'); this.tweens.add({ targets: lm, scaleY: 1 / ART, duration: 600, ease: 'Back.out' }); } });
    }
    if (kind === 'bridge') this.openGate();
    // zone lights up: zone props pop
    if (z) for (const p of this.props) if (p.zone === zoneId && p.img !== lm) this.tweens.add({ targets: p.img, y: p.img.y - 6, yoyo: true, duration: 220, delay: Math.random() * 400 });
  }
  openGate() {
    if (this.gateOpen) return;
    this.gateOpen = true;
    if (this.barrier) {
      const b = this.barrier;
      this.burst(b.x, b.y - 30, 30, this.kit.accent);
      this.tweens.add({ targets: b, alpha: 0, scaleY: 0.01, y: b.y + 10, duration: 900, ease: 'Back.in', onComplete: () => b.destroy() });
      this.barrier = null;
    }
  }
  panTo(gx: number, gy: number, ms = 1600) {
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.pan(this.sx(gx, gy), this.sy(gx, gy), ms * 0.4, 'Sine.inOut');
    this.time.delayedCall(ms, () => cam.startFollow(this.player.sprite, true, 0.09, 0.09, 0, 20));
  }

  goatIn(): { x: number; y: number } {
    this.sheet('ch:goat', 'goat');
    const gx = this.player.gx + 1.2, gy = this.player.gy - 1.2;
    if (!this.goat) this.goat = this.makeActor('ch:goat', gx + 6, gy - 6, 1.05);
    const g = this.goat;
    g.gx = gx + 6; g.gy = gy - 6; g.sprite.setAlpha(1); g.shadow.setAlpha(1);
    const o = { gx: g.gx, gy: g.gy };
    this.animate(g, true, -1, 1);
    this.tweens.add({ targets: o, gx, gy, duration: 1100, ease: 'Sine.out', onUpdate: () => { g.gx = o.gx; g.gy = o.gy; }, onComplete: () => this.animate(g, false, 0, 0) });
    return { x: gx, y: gy };
  }
  goatOut() {
    const g = this.goat; if (!g) return;
    const o = { gx: g.gx, gy: g.gy };
    this.animate(g, true, 1, -1);
    this.tweens.add({ targets: o, gx: g.gx + 7, gy: g.gy - 7, duration: 1200, ease: 'Sine.in', onUpdate: () => { g.gx = o.gx; g.gy = o.gy; }, onComplete: () => { g.sprite.setAlpha(0); g.shadow.setAlpha(0); } });
  }
  removeDiscovery(id: string) {
    const d = this.discoveries.find((q) => q.id === id); if (!d) return;
    d.found = true; this.burst(d.img.x, d.img.y - 14, 16, '#ffffff');
    this.tweens.killTweensOf(d.img); this.tweens.add({ targets: d.img, alpha: 0, duration: 400, onComplete: () => d.img.destroy() });
  }
}
