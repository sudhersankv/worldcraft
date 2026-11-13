/**
 * Live toy-diorama renderer for the site (Three.js).
 * Procedural, glossy painted-toy islands for all six world templates. When the shared 3D asset
 * manifest (web/src/shared/assets3d.ts) exists, its GLB kit pieces are layered on top (see kits.ts).
 */
import * as THREE from 'three';
import type { TemplateId } from '../shared/contracts';
import { decorateWithKit } from './kits';

export const TEMPLATES: TemplateId[] = ['forest', 'space', 'math', 'egypt', 'ocean', 'lab'];

// ------------------------------------------------------------------ helpers
const rngFrom = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const matCache = new Map<string, THREE.Material>();
function paint(color: number, o: { flat?: boolean; rough?: number; emissive?: number; opacity?: number } = {}): THREE.Material {
  const key = `${color}-${o.flat}-${o.rough}-${o.emissive}-${o.opacity}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, flatShading: !!o.flat, roughness: o.rough ?? 0.42, metalness: 0,
      emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emissive ? 0.9 : 0,
      transparent: o.opacity !== undefined, opacity: o.opacity ?? 1,
    });
    matCache.set(key, m);
  }
  return m;
}
function mesh(g: THREE.BufferGeometry, m: THREE.Material, shadow = true) {
  const x = new THREE.Mesh(g, m); x.castShadow = shadow; x.receiveShadow = true; return x;
}
function jitter(g: THREE.BufferGeometry, amt: number, rnd: () => number, keepTop = false) {
  const p = g.attributes.position as THREE.BufferAttribute;
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let d = seen.get(k);
    if (!d) { d = [(rnd() - .5) * amt, keepTop && p.getY(i) > 0 ? 0 : (rnd() - .5) * amt, (rnd() - .5) * amt]; seen.set(k, d); }
    p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  g.computeVertexNormals();
  return g;
}

interface Pal { top: number; top2: number; cliff: number; under: number; rock: number; accent: number }
const PAL: Record<TemplateId, Pal> = {
  forest: { top: 0x74cc4f, top2: 0x95dd62, cliff: 0xc08a58, under: 0x86603f, rock: 0xa3a9b4, accent: 0xff6f91 },
  space: { top: 0xa898ff, top2: 0xc2b6ff, cliff: 0x5d4fc0, under: 0x3c3190, rock: 0x8c86b8, accent: 0x52e3ff },
  math: { top: 0x7fd65e, top2: 0x9fe27a, cliff: 0x6f8fe0, under: 0x4b63b5, rock: 0xb4bccc, accent: 0xffc233 },
  egypt: { top: 0xf4d58f, top2: 0xf9e3ad, cliff: 0xdc9c56, under: 0xae7039, rock: 0xd8c39a, accent: 0x2ec4b6 },
  ocean: { top: 0xf7e2a8, top2: 0xfbecc4, cliff: 0x9aa0a8, under: 0x707784, rock: 0x9097a2, accent: 0x2fd2d8 },
  lab: { top: 0xd8c2ff, top2: 0xe7d9ff, cliff: 0x8b6ccc, under: 0x6247a0, rock: 0xb6aacd, accent: 0x5df2a5 },
};

// ------------------------------------------------------------------ props
const P = {
  roundTree(rnd: () => number, s = 1) {
    const g = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(.11, .16, .7, 7), paint(0x9b6a43)); trunk.position.y = .35; g.add(trunk);
    const greens = [0x53b94a, 0x67c94f, 0x3fa44a, 0x7bd35a];
    const c = greens[Math.floor(rnd() * greens.length)];
    const blobs: [number, number, number, number][] = [[0, 1.05, 0, .62], [.32, .88, .1, .42], [-.28, .9, -.12, .45], [0, 1.4, .05, .38]];
    for (const [x, y, z, r] of blobs) { const b = mesh(new THREE.IcosahedronGeometry(r, 2), paint(c, { rough: .55 })); b.position.set(x, y, z); g.add(b); }
    g.scale.setScalar(s); return g;
  },
  pine(rnd: () => number, s = 1) {
    const g = new THREE.Group();
    const t = mesh(new THREE.CylinderGeometry(.08, .1, .4, 6), paint(0x8a5a37)); t.position.y = .2; g.add(t);
    const c = rnd() > .5 ? 0x2f9e5a : 0x3aac63;
    [[.55, .7, .55], [.42, .6, .95], [.28, .5, 1.3]].forEach(([r, h, y]) => { const k = mesh(new THREE.ConeGeometry(r, h, 8), paint(c, { rough: .55 })); k.position.y = y; g.add(k); });
    g.scale.setScalar(s); return g;
  },
  rock(rnd: () => number, s = 1, color = 0xa3a9b4) {
    const r = mesh(jitter(new THREE.DodecahedronGeometry(.35, 0), .12, rnd), paint(color, { flat: true, rough: .8 }));
    r.scale.set(s * (1 + rnd() * .5), s * (.6 + rnd() * .4), s); r.rotation.y = rnd() * 6; r.position.y = .1 * s; return r;
  },
  flowers(rnd: () => number, n = 6) {
    const g = new THREE.Group();
    const cols = [0xff6f91, 0xffd23f, 0xffffff, 0x9b7bff];
    for (let i = 0; i < n; i++) {
      const f = mesh(new THREE.SphereGeometry(.07, 8, 6), paint(cols[i % cols.length]), false);
      f.position.set((rnd() - .5) * 1.2, .06, (rnd() - .5) * 1.2); g.add(f);
    }
    return g;
  },
  pond(r = 1) {
    const g = new THREE.Group();
    const w = mesh(new THREE.CylinderGeometry(r, r, .06, 20), paint(0x4fd0f0, { rough: .08, opacity: .9 }), false); w.position.y = .02; g.add(w);
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; const s = mesh(new THREE.DodecahedronGeometry(.16, 0), paint(0xb9bec8, { flat: true, rough: .8 })); s.position.set(Math.cos(a) * (r + .05), .06, Math.sin(a) * (r + .05)); s.scale.y = .6; g.add(s); }
    return g;
  },
  tower(accent: number) {
    const g = new THREE.Group();
    const b = mesh(new THREE.CylinderGeometry(.42, .5, 2, 10), paint(0xfff4e0)); b.position.y = 1; g.add(b);
    const band = mesh(new THREE.CylinderGeometry(.47, .47, .12, 10), paint(accent)); band.position.y = 1.4; g.add(band);
    const roof = mesh(new THREE.ConeGeometry(.66, .9, 10), paint(0xff6f61)); roof.position.y = 2.45; g.add(roof);
    const orb = mesh(new THREE.SphereGeometry(.17, 16, 12), paint(0xffd23f, { emissive: 0xffc233 }), false); orb.position.y = 3.05; orb.userData.spin = 1; g.add(orb);
    const win = mesh(new THREE.SphereGeometry(.12, 10, 8), paint(0x4cc9f0, { emissive: 0x2aa6d8 }), false); win.position.set(0, 1.0, .46); win.scale.z = .3; g.add(win);
    return g;
  },
  hut(color: number) {
    const g = new THREE.Group();
    const s = mesh(new THREE.CylinderGeometry(.3, .36, .5, 10), paint(0xfff1dc)); s.position.y = .25; g.add(s);
    const cap = mesh(new THREE.SphereGeometry(.55, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), paint(color)); cap.position.y = .48; cap.scale.y = .8; g.add(cap);
    for (let i = 0; i < 4; i++) { const d = mesh(new THREE.SphereGeometry(.07, 8, 6), paint(0xffffff), false); const a = i * 1.6; d.position.set(Math.cos(a) * .35, .78, Math.sin(a) * .35); g.add(d); }
    return g;
  },
  buddy(color: number, hat?: number) {
    const g = new THREE.Group();
    const body = mesh(new THREE.CapsuleGeometry(.17, .22, 6, 12), paint(color)); body.position.y = .3; g.add(body);
    const head = mesh(new THREE.SphereGeometry(.21, 16, 12), paint(0xffe0c2)); head.position.y = .68; g.add(head);
    [-.07, .07].forEach((x) => { const e = mesh(new THREE.SphereGeometry(.03, 8, 6), paint(0x1f1633), false); e.position.set(x, .7, .19); g.add(e); });
    if (hat) { const h = mesh(new THREE.ConeGeometry(.2, .3, 10), paint(hat)); h.position.y = .92; g.add(h); }
    g.userData.bob = Math.random() * 6; return g;
  },
  fox() {
    const g = new THREE.Group();
    const o = paint(0xff8a3d);
    const body = mesh(new THREE.CapsuleGeometry(.12, .3, 4, 10), o); body.rotation.z = Math.PI / 2; body.position.y = .2; g.add(body);
    const head = mesh(new THREE.SphereGeometry(.13, 12, 10), o); head.position.set(.24, .3, 0); g.add(head);
    [-.06, .06].forEach((z) => { const e = mesh(new THREE.ConeGeometry(.05, .12, 6), o); e.position.set(.24, .45, z); g.add(e); });
    const tail = mesh(new THREE.SphereGeometry(.1, 10, 8), paint(0xfff4e6)); tail.position.set(-.3, .26, 0); tail.scale.set(1.6, .8, .8); g.add(tail);
    g.userData.bob = 2; return g;
  },
  deer() {
    const g = new THREE.Group(); const c = paint(0xc98a55);
    const body = mesh(new THREE.CapsuleGeometry(.13, .32, 4, 10), c); body.rotation.z = Math.PI / 2; body.position.y = .42; g.add(body);
    [[-.15, -.07], [-.15, .07], [.15, -.07], [.15, .07]].forEach(([x, z]) => { const l = mesh(new THREE.CylinderGeometry(.03, .03, .32, 6), c); l.position.set(x, .16, z); g.add(l); });
    const neck = mesh(new THREE.CylinderGeometry(.05, .07, .3, 6), c); neck.position.set(.25, .62, 0); neck.rotation.z = -.5; g.add(neck);
    const head = mesh(new THREE.SphereGeometry(.1, 12, 10), c); head.position.set(.33, .78, 0); g.add(head);
    return g;
  },
  palm(rnd: () => number) {
    const g = new THREE.Group();
    let y = 0, x = 0; const bend = .08 + rnd() * .06;
    for (let i = 0; i < 6; i++) { const s = mesh(new THREE.CylinderGeometry(.08, .1, .3, 7), paint(i % 2 ? 0xa0703f : 0x8d6034)); s.position.set(x, y + .15, 0); s.rotation.z = -bend * i * .6; g.add(s); y += .28; x += bend * i * .18; }
    for (let i = 0; i < 6; i++) {
      const leaf = mesh(new THREE.ConeGeometry(.16, 1.0, 4), paint(0x3fbf5f, { rough: .5 }));
      leaf.scale.set(1, 1, .25); leaf.position.set(x, y + .05, 0);
      leaf.rotation.set(0, i / 6 * Math.PI * 2, 1.9); leaf.translateY(.45); g.add(leaf);
    }
    const nut = mesh(new THREE.SphereGeometry(.08, 8, 6), paint(0x7a5230)); nut.position.set(x, y - .05, .08); g.add(nut);
    return g;
  },
  pyramid() {
    const g = new THREE.Group();
    const p = mesh(new THREE.ConeGeometry(1.25, 1.5, 4), paint(0xf2c56b, { flat: true, rough: .6 })); p.position.y = .75; p.rotation.y = Math.PI / 4; g.add(p);
    const cap = mesh(new THREE.ConeGeometry(.22, .27, 4), paint(0xffd23f, { emissive: 0xc99a10 })); cap.position.y = 1.37; cap.rotation.y = Math.PI / 4; g.add(cap);
    return g;
  },
  obelisk() { const o = mesh(new THREE.CylinderGeometry(.12, .2, 1.3, 4), paint(0xe8c88a, { flat: true })); o.position.y = .65; o.rotation.y = Math.PI / 4; return o; },
  rocket(accent: number) {
    const g = new THREE.Group();
    const b = mesh(new THREE.CylinderGeometry(.3, .32, 1.4, 14), paint(0xfdfbff)); b.position.y = .9; g.add(b);
    const n = mesh(new THREE.ConeGeometry(.3, .6, 14), paint(0xff5d8f)); n.position.y = 1.9; g.add(n);
    const w = mesh(new THREE.SphereGeometry(.12, 12, 10), paint(accent, { emissive: 0x2ab8d8 }), false); w.position.set(0, 1.2, .29); w.scale.z = .3; g.add(w);
    for (let i = 0; i < 3; i++) { const f = mesh(new THREE.BoxGeometry(.06, .45, .35), paint(0xff5d8f)); const a = i / 3 * Math.PI * 2; f.position.set(Math.cos(a) * .32, .35, Math.sin(a) * .32); f.rotation.y = -a; g.add(f); }
    return g;
  },
  dome(accent: number) {
    const g = new THREE.Group();
    const d = mesh(new THREE.SphereGeometry(.85, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), paint(accent, { rough: .1, opacity: .65 })); g.add(d);
    const base = mesh(new THREE.CylinderGeometry(.9, .9, .12, 24), paint(0xe9e6ff)); base.position.y = .05; g.add(base);
    return g;
  },
  planet() {
    const g = new THREE.Group();
    const p = mesh(new THREE.SphereGeometry(.4, 20, 16), paint(0xffc233), false); g.add(p);
    const r = mesh(new THREE.TorusGeometry(.66, .05, 8, 40), paint(0xff8a65), false); r.rotation.x = 1.2; g.add(r);
    g.userData.spin = .4; g.userData.float = 1; return g;
  },
  crystal(c: number) { const x = mesh(new THREE.OctahedronGeometry(.25, 0), paint(c, { flat: true, emissive: c, rough: .2 })); x.scale.y = 1.8; x.position.y = .42; return x; },
  castle(accent: number) {
    const g = new THREE.Group();
    const wall = mesh(new THREE.BoxGeometry(1.6, .9, .9), paint(0xfdf3e3)); wall.position.y = .45; g.add(wall);
    [[-.8, -.45], [.8, -.45], [-.8, .45], [.8, .45]].forEach(([x, z]) => {
      const t = mesh(new THREE.CylinderGeometry(.24, .26, 1.4, 12), paint(0xfdf3e3)); t.position.set(x, .7, z); g.add(t);
      const r = mesh(new THREE.ConeGeometry(.32, .55, 12), paint(0x4f7df0)); r.position.set(x, 1.68, z); g.add(r);
    });
    const keep = mesh(new THREE.CylinderGeometry(.34, .38, 1.9, 12), paint(0xfdf3e3)); keep.position.y = .95; g.add(keep);
    const kr = mesh(new THREE.ConeGeometry(.45, .7, 12), paint(0xff5d8f)); kr.position.y = 2.25; g.add(kr);
    const flag = mesh(new THREE.BoxGeometry(.3, .18, .02), paint(accent)); flag.position.set(.17, 2.75, 0); g.add(flag);
    const door = mesh(new THREE.BoxGeometry(.3, .4, .05), paint(0x6b4a2f)); door.position.set(0, .2, .46); g.add(door);
    return g;
  },
  blocks() {
    const g = new THREE.Group(); const cs = [0x4cc9f0, 0xff5d8f, 0xffc233, 0x5df2a5];
    [[0, .2, 0], [.42, .2, 0], [.2, .6, 0], [-.1, .2, .42]].forEach(([x, y, z], i) => { const b = mesh(new THREE.BoxGeometry(.4, .4, .4), paint(cs[i])); b.position.set(x, y, z); b.rotation.y = i * .2; g.add(b); });
    return g;
  },
  coral(c: number) {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) { const b = mesh(new THREE.CapsuleGeometry(.07, .35 + i * .05, 4, 8), paint(c)); b.position.set((i - 2) * .08, .25, (i % 2) * .08); b.rotation.z = (i - 2) * .35; g.add(b); }
    return g;
  },
  flask(c: number) {
    const g = new THREE.Group();
    const glass = mesh(new THREE.SphereGeometry(.32, 16, 12), paint(0xf0f6ff, { rough: .05, opacity: .55 })); glass.position.y = .32; g.add(glass);
    const liquid = mesh(new THREE.SphereGeometry(.25, 16, 12, 0, Math.PI * 2, Math.PI / 2.6, Math.PI), paint(c, { emissive: c }), false); liquid.position.y = .32; g.add(liquid);
    const neck = mesh(new THREE.CylinderGeometry(.08, .1, .35, 10), paint(0xf0f6ff, { rough: .05, opacity: .6 })); neck.position.y = .75; g.add(neck);
    const bub = mesh(new THREE.SphereGeometry(.06, 8, 6), paint(c, { emissive: c }), false); bub.position.y = 1.0; bub.userData.fizz = Math.random() * 3; g.add(bub);
    return g;
  },
  machine() {
    const g = new THREE.Group();
    const b = mesh(new THREE.BoxGeometry(1, 1, .8), paint(0x4a3f8f)); b.position.y = .5; g.add(b);
    [[-.25, 0x5df2a5], [0, 0xffc233], [.25, 0xff5d8f]].forEach(([x, c]) => { const l = mesh(new THREE.SphereGeometry(.08, 10, 8), paint(c, { emissive: c }), false); l.position.set(x, .7, .41); g.add(l); });
    const coil = mesh(new THREE.TorusGeometry(.18, .06, 8, 20), paint(0xffc233)); coil.position.y = 1.25; coil.rotation.x = Math.PI / 2; coil.userData.spin = 1.5; g.add(coil);
    const pole = mesh(new THREE.CylinderGeometry(.05, .05, .4, 8), paint(0xd8d8e8)); pole.position.y = 1.1; g.add(pole);
    return g;
  },
};

export function cloud(rnd: () => number, s = 1) {
  const g = new THREE.Group();
  const n = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const r = .5 + rnd() * .5;
    const b = mesh(new THREE.IcosahedronGeometry(r, 2), paint(i % 3 ? 0xffffff : 0xfff1f6, { rough: .9 }), false);
    b.position.set((i - n / 2) * .6, rnd() * .3, (rnd() - .5) * .5); g.add(b);
  }
  g.scale.setScalar(s); return g;
}

// ------------------------------------------------------------------ island
export function buildIsland(t: TemplateId, seed = 7): THREE.Group {
  const rnd = rngFrom(seed + TEMPLATES.indexOf(t) * 101);
  const pal = PAL[t];
  const g = new THREE.Group(); g.name = `island-${t}`;
  const R = 4;
  const top = mesh(jitter(new THREE.CylinderGeometry(R, R * .97, .55, 11, 1), .18, rnd, true), paint(pal.top, { rough: .6 })); top.position.y = -.27; g.add(top);
  const cliff = mesh(jitter(new THREE.CylinderGeometry(R * .97, R * .82, 1.5, 11, 2), .28, rnd), paint(pal.cliff, { flat: true, rough: .75 })); cliff.position.y = -1.3; g.add(cliff);
  const under = mesh(jitter(new THREE.ConeGeometry(R * .82, 3.6, 11, 3), .4, rnd), paint(pal.under, { flat: true, rough: .8 })); under.rotation.x = Math.PI; under.position.y = -3.85; g.add(under);
  // raised grass terrace (layered cliffs)
  const terr = mesh(jitter(new THREE.CylinderGeometry(1.5, 1.6, .7, 9), .12, rnd, true), paint(pal.top2, { rough: .6 })); terr.position.set(-1.6, .35, -1.3); g.add(terr);
  const terrSide = mesh(jitter(new THREE.CylinderGeometry(1.58, 1.62, .55, 9), .1, rnd), paint(pal.cliff, { flat: true, rough: .75 })); terrSide.position.set(-1.6, .12, -1.3); g.add(terrSide);
  for (let i = 0; i < 5; i++) { const r = P.rock(rnd, .9, pal.under); const a = rnd() * Math.PI * 2; r.position.set(Math.cos(a) * 2.2, -3 - rnd() * 1.5, Math.sin(a) * 2.2); g.add(r); }

  const put = (o: THREE.Object3D, x: number, z: number, y = 0, ry = rnd() * 6) => { o.position.set(x, y + o.position.y, z); o.rotation.y = ry; g.add(o); return o; };
  const onTerr = .7;
  const ring = (n: number, r0: number, r1: number, f: () => THREE.Object3D) => {
    for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, r = r0 + rnd() * (r1 - r0); const x = Math.cos(a) * r, z = Math.sin(a) * r; if (Math.hypot(x + 1.6, z + 1.3) < 1.7) continue; put(f(), x, z); }
  };

  switch (t) {
    case 'forest':
      put(P.tower(pal.accent), -1.6, -1.3, onTerr, .4);
      put(P.pond(.95), 1.3, .9, 0);
      put(P.hut(0xff5d6c), 1.9, -1.2);
      put(P.roundTree(rnd, 1.1), -2.6, 1.2); put(P.roundTree(rnd, .9), -1.4, 2.6); put(P.roundTree(rnd, 1.2), .2, -2.9);
      put(P.pine(rnd, 1), 2.9, .1); put(P.pine(rnd, .8), -3.1, -.1); put(P.pine(rnd, 1.1), -.6, -1.4, onTerr);
      put(P.deer(), -.4, .9, 0, 2.2); put(P.fox(), 2.4, 2.2, 0, -.8);
      put(P.buddy(0x4cc9f0, 0x3fae5a), .3, .2, 0, .6); put(P.buddy(0xff6f91), -.9, 1.5, 0, .3);
      ring(5, 1.2, 3.4, () => P.flowers(rnd, 5)); ring(3, 2.6, 3.5, () => P.rock(rnd, 1));
      break;
    case 'space':
      put(P.rocket(pal.accent), -1.6, -1.3, onTerr, 0);
      put(P.dome(pal.accent), 1.3, .5, 0);
      const pl = P.planet(); pl.position.set(1.8, 3.2, -1.5); g.add(pl);
      ring(6, 1.5, 3.5, () => P.crystal([0x52e3ff, 0xff5d8f, 0xffc233][Math.floor(rnd() * 3)]));
      ring(4, 2, 3.5, () => P.rock(rnd, 1, pal.rock));
      put(P.buddy(0xfdfbff, 0x52e3ff), 0, 1.8, 0, .4);
      break;
    case 'math':
      put(P.castle(pal.accent), .6, -.9, 0, 0);
      put(P.blocks(), -1.6, -1.3, onTerr);
      put(P.blocks(), 2.0, 1.8);
      ring(6, 2.4, 3.5, () => P.pine(rnd, .8 + rnd() * .3));
      put(P.buddy(0xff5d8f, 0x4f7df0), -.6, 1.6, 0, .4);
      break;
    case 'egypt':
      put(P.pyramid(), .7, -.8, 0, 0);
      put(P.obelisk(), -1.6, -1.3, onTerr);
      put(P.pond(.7), -1.1, 1.6);
      put(P.palm(rnd), -2.1, 2.2); put(P.palm(rnd), -.1, 2.4); put(P.palm(rnd), 2.4, 1.6);
      ring(4, 2.6, 3.5, () => P.rock(rnd, .9, pal.rock));
      put(P.buddy(0x2ec4b6, 0xffd23f), 1.4, 1.0, 0, -.4);
      break;
    case 'ocean': {
      const lagoon = mesh(new THREE.CylinderGeometry(1.9, 1.9, .07, 24), paint(0x2fd2d8, { rough: .06, opacity: .9 }), false); lagoon.position.set(.8, .02, .6); g.add(lagoon);
      put(P.coral(0xff6f91), .5, .4, .02); put(P.coral(0xffb03b), 1.4, 1.0, .02); put(P.coral(0x9b7bff), 1.2, -.1, .02);
      put(P.palm(rnd), -1.6, -1.3, onTerr); put(P.palm(rnd), -2.6, 1.0); put(P.palm(rnd), 2.8, -1.4);
      for (let i = 0; i < 5; i++) put(P.rock(rnd, 1.4, pal.rock), -3 + i * .5, 2.2 - i * .3);
      put(P.buddy(0x4fd18b, 0x2fa4ff), -1.2, 1.8, 0, .4);
      break;
    }
    case 'lab':
      put(P.machine(), .8, -1.1, 0, -.3);
      put(P.flask(0x5df2a5), -1.6, -1.3, onTerr); put(P.flask(0xff5d8f), 1.9, 1.2); put(P.flask(0x52e3ff), -.4, 2.1);
      ring(4, 2.4, 3.5, () => P.crystal(0xc86bfa));
      ring(3, 2.6, 3.5, () => P.roundTree(rnd, .7));
      put(P.buddy(0xffffff, 0xc86bfa), .3, 1.0, 0, .3);
      break;
  }
  return g;
}

// ------------------------------------------------------------------ scenes
export function webglOK(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

function makeRenderer(canvas: HTMLCanvasElement, maxDpr: number) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(devicePixelRatio, maxDpr));
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  return r;
}
function lights(scene: THREE.Scene, span = 12) {
  scene.add(new THREE.HemisphereLight(0xdff3ff, 0xf2d6b0, 1.4));
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
  sun.position.set(8, 14, 6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 50 });
  sun.shadow.bias = -0.0008; sun.shadow.radius = 4;
  scene.add(sun); scene.add(sun.target);
  return sun;
}
function animate(root: THREE.Object3D, t: number) {
  root.traverse((o) => {
    const u = o.userData;
    if (u.bob !== undefined) o.position.y = Math.abs(Math.sin(t * 3 + u.bob)) * .12;
    if (u.spin) o.rotation.y = t * u.spin;
    if (u.float) o.position.y = 3.2 + Math.sin(t * .8) * .25;
    if (u.fizz !== undefined) { const k = (t * .8 + u.fizz) % 1; o.position.y = 1 + k * .6; o.scale.setScalar(1 - k); }
    if (u.drift) { o.position.x += u.drift; if (o.position.x > 26) o.position.x = -26; }
    if (u.mixer) u.mixer.update(1 / 60);
  });
}

export interface Diorama { setSoft(soft: boolean): void; dispose(): void }

/** The persistent full-screen world behind every page. */
export function mountWorld(canvas: HTMLCanvasElement): Diorama | null {
  if (!webglOK()) return null;
  let r: THREE.WebGLRenderer;
  try { r = makeRenderer(canvas, 1.75); } catch { return null; }
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe9ff, 26, 60);
  lights(scene, 9);
  const island = buildIsland('forest', 11);
  scene.add(island);
  decorateWithKit(island, 'forest').catch(() => { /* manifest not ready: procedural only */ });
  const rnd = rngFrom(99);
  // distant islands
  const far: [TemplateId, number, number, number, number][] = [['space', -16, 4, -14, .45], ['ocean', 17, -3, -12, .5], ['egypt', -11, -6, -22, .35], ['lab', 14, 6, -26, .35]];
  far.forEach(([t, x, y, z, s]) => { const i = buildIsland(t, 3); i.scale.setScalar(s); i.position.set(x, y, z); i.userData.baseY = y; scene.add(i); });
  const clouds = new THREE.Group(); clouds.userData.spin = .012; scene.add(clouds);
  for (let i = 0; i < 12; i++) {
    const c = cloud(rnd, .9 + rnd() * 1.2); const a = i / 12 * Math.PI * 2 + rnd() * .4;
    const below = i % 3 === 0; const rr = below ? 8 + rnd() * 5 : 25 + rnd() * 7;
    c.position.set(Math.cos(a) * rr, below ? -6.5 - rnd() * 2 : -1 + rnd() * 8, Math.sin(a) * rr); clouds.add(c);
  }

  const cam = new THREE.PerspectiveCamera(32, 1, .1, 120);
  let soft = false, w = 0, h = 0, px = 0, py = 0, raf = 0, last = 0, angle = .6;
  const resize = () => {
    w = canvas.clientWidth; h = canvas.clientHeight; r.setSize(w, h, false); cam.aspect = w / h;
    // push the island right of the menu on wide screens
    if (w > 900 && !soft) cam.setViewOffset(w, h, -w * .16, 0, w, h); else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  };
  const onMove = (e: PointerEvent) => { px = e.clientX / innerWidth - .5; py = e.clientY / innerHeight - .5; };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (document.hidden) return;
    if (soft && now - last < 66) return; // ~15fps when blurred behind content
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    if (!reduced) angle += dt * .06;
    const dist = w < 700 ? 31 : 19;
    cam.position.set(Math.sin(angle + px * .25) * dist, 6.5 - py * 2 + (w < 700 ? 3 : 0), Math.cos(angle + px * .25) * dist);
    cam.lookAt(0, w < 700 ? -5.5 : .2, 0);
    if (!reduced) {
      animate(scene, t);
      island.position.y = Math.sin(t * .6) * .25;
      scene.children.forEach((o) => { if (o.userData.baseY !== undefined) o.position.y = o.userData.baseY + Math.sin(t * .5 + o.position.x) * .4; });
    }
    r.render(scene, cam);
  };
  resize(); addEventListener('resize', resize); addEventListener('pointermove', onMove);
  raf = requestAnimationFrame(tick);
  return {
    setSoft(s) { soft = s; resize(); },
    dispose() { cancelAnimationFrame(raf); removeEventListener('resize', resize); removeEventListener('pointermove', onMove); r.dispose(); },
  };
}

/** Six islands in a row; the camera glides between them. */
export function mountCarousel(canvas: HTMLCanvasElement): { go(i: number): void; dispose(): void } | null {
  if (!webglOK()) return null;
  let r: THREE.WebGLRenderer;
  try { r = makeRenderer(canvas, 1.5); } catch { return null; }
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x1b2347, 22, 44);
  const sun = lights(scene, 12);
  const GAP = 13;
  const isles = TEMPLATES.map((t, i) => { const g = buildIsland(t, 5); g.position.x = i * GAP; scene.add(g); decorateWithKit(g, t).catch(() => {}); return g; });
  const rnd = rngFrom(5);
  for (let i = 0; i < 10; i++) { const c = cloud(rnd, .7 + rnd()); c.position.set(-6 + rnd() * 80, -7 + rnd() * 3, -14 + rnd() * 5); scene.add(c); }
  const cam = new THREE.PerspectiveCamera(30, 1, .1, 100);
  let target = 0, cur = 0, raf = 0, visible = true;
  const resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
  io.observe(canvas);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (!visible || document.hidden) return;
    const t = now / 1000;
    cur += (target - cur) * (reduced ? 1 : .07);
    const x = cur * GAP;
    const far = canvas.clientWidth < 600 ? 21 : 17;
    cam.position.set(x + 2, 6, far); cam.lookAt(x, -.6, 0);
    sun.position.set(x + 8, 14, 6); sun.target.position.set(x, 0, 0);
    isles.forEach((g, i) => { if (!reduced) { g.rotation.y = t * .15 + i; g.position.y = Math.sin(t * .7 + i) * .3; } g.scale.setScalar(Math.abs(i - cur) < .5 ? 1 : .82); });
    if (!reduced) animate(scene, t);
    r.render(scene, cam);
  };
  resize(); addEventListener('resize', resize);
  raf = requestAnimationFrame(tick);
  return { go(i) { target = i; }, dispose() { cancelAnimationFrame(raf); io.disconnect(); removeEventListener('resize', resize); r.dispose(); } };
}

/** Render a still portrait of each template island (for cards). Cached as PNG data URLs. */
let thumbs: Promise<Record<TemplateId, string>> | null = null;
export function islandThumbs(): Promise<Record<TemplateId, string>> {
  if (thumbs) return thumbs;
  thumbs = (async () => {
    if (!webglOK()) throw new Error('no webgl');
    const canvas = document.createElement('canvas'); canvas.width = 420; canvas.height = 360;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(420, 360, false);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
    const out = {} as Record<TemplateId, string>;
    for (const t of TEMPLATES) {
      const scene = new THREE.Scene(); lights(scene, 7);
      const g = buildIsland(t, 5); g.rotation.y = .5; scene.add(g);
      const cam = new THREE.PerspectiveCamera(30, 420 / 360, .1, 100); cam.position.set(12, 8.5, 14); cam.lookAt(0, -1.2, 0);
      r.render(scene, cam);
      out[t] = canvas.toDataURL('image/png');
    }
    r.dispose(); r.forceContextLoss();
    return out;
  })();
  return thumbs;
}
