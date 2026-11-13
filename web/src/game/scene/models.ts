/**
 * Procedural toy-diorama models (glossy painted-vinyl look). Everything goes through spawnModel/addProp so
 * swapping in curated CC0 GLB models later is a one-function change.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Kit } from '../world/kits';

export const LEVEL = 0.55; // world units per height level

// ------------------------------------------------------------------ batch builder (one draw call for all static props)
export class Batch {
  private parts: THREE.BufferGeometry[] = [];
  add(geo: THREE.BufferGeometry, color: string | THREE.Color, sway = 0, m?: THREE.Matrix4) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    const c = new THREE.Color(color);
    const cols = new Float32Array(n * 3), sw = new Float32Array(n);
    // vertical gradient: slightly darker at the bottom of each part = baked AO
    g.computeBoundingBox();
    const bb = g.boundingBox!; const hgt = Math.max(0.001, bb.max.y - bb.min.y);
    const pos = g.attributes.position;
    for (let i = 0; i < n; i++) {
      const t = (pos.getY(i) - bb.min.y) / hgt;
      const k = 0.82 + 0.18 * t;
      cols[i * 3] = c.r * k; cols[i * 3 + 1] = c.g * k; cols[i * 3 + 2] = c.b * k;
      sw[i] = sway * t;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.setAttribute('sway', new THREE.BufferAttribute(sw, 1));
    this.parts.push(g);
  }
  build(mat: THREE.Material): THREE.Mesh | null {
    if (!this.parts.length) return null;
    const geo = mergeGeometries(this.parts, false)!;
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }
}

export const windUniform = { value: 0 };
export function toyMaterial(opts: { wind?: boolean; emissive?: boolean; flat?: boolean } = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, flatShading: !!opts.flat });
  if (opts.emissive) { m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = 0.0; }
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniform;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${opts.wind ? 'float wv = sin(uTime*1.7 + position.x*0.8 + position.z*0.6) * sway; transformed.x += wv*0.07; transformed.z += wv*0.05;' : ''}`);
    if (opts.emissive) sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = diffuseColor.rgb * 0.9;');
    // never-black shadows: lift
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight = max(outgoingLight, diffuseColor.rgb * 0.16);\n#include <opaque_fragment>');
  };
  return m;
}

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
export function at(x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) {
  E.set(rx, ry, rz); Q.setFromEuler(E);
  return M.clone().compose(new THREE.Vector3(x, y, z), Q, new THREE.Vector3(sx, sy, sz));
}
const G = {
  sphere: new THREE.IcosahedronGeometry(1, 3),
  lowSphere: new THREE.IcosahedronGeometry(1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  trunk: new THREE.CylinderGeometry(0.7, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 10),
  cone8: new THREE.ConeGeometry(1, 1, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
  rbox: roundedBox(),
  rock: new THREE.DodecahedronGeometry(1, 0),
  oct: new THREE.OctahedronGeometry(1, 0),
  torus: new THREE.TorusGeometry(1, 0.18, 8, 24),
  capsule: new THREE.CapsuleGeometry(1, 1, 6, 12),
};
function roundedBox() {
  const g = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  const p = g.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const s = v.clone().normalize().multiplyScalar(0.5 * 1.28); v.lerp(s, 0.35); v.clampScalar(-0.5, 0.5); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); return g;
}

// ------------------------------------------------------------------ props
const LEAFS = ['#58c24a', '#6fd35a', '#46ad48'];
/** Adds a prop at (x, y, z) into the batch. r = deterministic variant 0..1 */
export function addProp(b: Batch, glow: Batch, key: string, kit: Kit, x: number, y: number, z: number, r: number) {
  const s = 0.85 + r * 0.35;
  const v = Math.floor(r * 3);
  switch (key) {
    case 'tree-round': {
      b.add(G.trunk, '#8a5a36', 0.1, at(x, y + 0.35 * s, z, 0.09 * s, 0.7 * s, 0.09 * s));
      const c = kit.id === 'math' ? ['#62c35a', '#8fd65a', '#4fae52'][v] : LEAFS[v];
      b.add(G.sphere, c, 0.8, at(x, y + 0.95 * s, z, 0.48 * s));
      b.add(G.sphere, new THREE.Color(c).offsetHSL(0, 0, -0.06), 0.8, at(x - 0.22 * s, y + 0.78 * s, z + 0.18 * s, 0.32 * s));
      b.add(G.sphere, new THREE.Color(c).offsetHSL(0, 0, 0.04), 0.8, at(x + 0.24 * s, y + 0.82 * s, z - 0.1 * s, 0.3 * s));
      b.add(G.sphere, new THREE.Color(c).offsetHSL(0.02, 0, 0.06), 1, at(x + 0.05 * s, y + 1.3 * s, z - 0.05 * s, 0.26 * s));
      if (v === 1) for (let i = 0; i < 4; i++) b.add(G.sphere, '#ff6b6b', 0.8, at(x + Math.cos(i * 1.7) * 0.42 * s, y + (0.85 + (i % 2) * 0.25) * s, z + Math.sin(i * 1.7) * 0.42 * s, 0.06));
      break;
    }
    case 'tree-pine': {
      b.add(G.trunk, '#7a4a2c', 0.1, at(x, y + 0.2 * s, z, 0.08 * s, 0.4 * s, 0.08 * s));
      const c = ['#2f8a5a', '#3a9a62', '#2a7d55'][v];
      b.add(G.cone8, c, 0.5, at(x, y + 0.65 * s, z, 0.42 * s, 0.7 * s, 0.42 * s));
      b.add(G.cone8, new THREE.Color(c).offsetHSL(0, 0, 0.04), 0.8, at(x, y + 1.05 * s, z, 0.33 * s, 0.6 * s, 0.33 * s));
      b.add(G.cone8, new THREE.Color(c).offsetHSL(0, 0, 0.08), 1, at(x, y + 1.42 * s, z, 0.22 * s, 0.5 * s, 0.22 * s));
      break;
    }
    case 'palm': {
      for (let i = 0; i < 5; i++) b.add(G.cyl, '#b88a50', 0.2 * i, at(x + i * 0.04, y + 0.12 + i * 0.22, z, 0.07 - i * 0.004, 0.24, 0.07 - i * 0.004, 0, 0, -0.12));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + r; b.add(G.sphere, i % 2 ? '#4fb55a' : '#3e9a4e', 1, at(x + 0.2 + Math.cos(a) * 0.32, y + 1.1, z + Math.sin(a) * 0.32, 0.36, 0.05, 0.12, -a, 0, 0.35)); }
      b.add(G.sphere, '#7a5028', 0.5, at(x + 0.2, y + 1.08, z, 0.08));
      break;
    }
    case 'bush': {
      const c = kit.id === 'egypt' ? '#8ab850' : LEAFS[v];
      b.add(G.sphere, c, 0.4, at(x - 0.14, y + 0.16, z, 0.22 * s));
      b.add(G.sphere, new THREE.Color(c).offsetHSL(0, 0, -0.05), 0.4, at(x + 0.16, y + 0.15, z + 0.06, 0.2 * s));
      b.add(G.sphere, new THREE.Color(c).offsetHSL(0, 0, 0.05), 0.6, at(x, y + 0.3, z - 0.04, 0.22 * s));
      if (v === 0) for (let i = 0; i < 3; i++) b.add(G.sphere, '#ffe27a', 0.5, at(x - 0.12 + i * 0.12, y + 0.42 - (i % 2) * 0.08, z + 0.16, 0.04));
      break;
    }
    case 'flowers': {
      const cols = ['#ff7aa8', '#ffe27a', '#ffffff', '#b38cff', '#ff9f5a'];
      for (let i = 0; i < 5; i++) {
        const fx = x + Math.cos(i * 2.4 + r * 6) * 0.25, fz = z + Math.sin(i * 2.4 + r * 6) * 0.25;
        b.add(G.cyl, '#3e9a4e', 0.5, at(fx, y + 0.08, fz, 0.012, 0.16, 0.012));
        b.add(G.sphere, cols[(i + v) % 5], 1, at(fx, y + 0.18, fz, 0.06, 0.035, 0.06));
        b.add(G.sphere, '#ffb627', 1, at(fx, y + 0.2, fz, 0.025));
      }
      break;
    }
    case 'fern': case 'reeds': {
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + r; b.add(G.sphere, key === 'reeds' ? '#6a9a3a' : i % 2 ? '#3e9a4e' : '#5cc25a', 1, at(x + Math.cos(a) * 0.12, y + 0.18, z + Math.sin(a) * 0.12, 0.05, 0.22, 0.03, -a, 0, Math.cos(a) * 0.5)); }
      break;
    }
    case 'mushroom': {
      b.add(G.cyl, '#fff1d6', 0.1, at(x, y + 0.1, z, 0.06, 0.2, 0.06));
      b.add(G.sphere, v % 2 ? '#ff5d6c' : '#b36bff', 0.2, at(x, y + 0.22, z, 0.17, 0.11, 0.17));
      for (let i = 0; i < 3; i++) b.add(G.sphere, '#ffffff', 0.2, at(x + Math.cos(i * 2.1) * 0.1, y + 0.29, z + Math.sin(i * 2.1) * 0.1, 0.03, 0.015, 0.03));
      break;
    }
    case 'rock': {
      const c = kit.id === 'space' ? '#9a90d0' : kit.id === 'egypt' ? '#d8b070' : kit.id === 'ocean' ? '#8aa8b0' : '#a9adb8';
      b.add(G.rock, c, 0, at(x, y + 0.12, z, 0.3 * s, 0.22 * s, 0.26 * s, r * 6));
      b.add(G.rock, new THREE.Color(c).offsetHSL(0, 0, 0.05), 0, at(x + 0.22, y + 0.06, z + 0.12, 0.14 * s, 0.1, 0.12, r * 3));
      if (kit.id === 'forest') b.add(G.sphere, '#6cc04a', 0, at(x - 0.05, y + 0.27 * s, z, 0.16, 0.04, 0.14));
      break;
    }
    case 'stump': b.add(G.cyl, '#9a6a40', 0, at(x, y + 0.1, z, 0.2, 0.2, 0.2)); b.add(G.cyl, '#e8c890', 0, at(x, y + 0.205, z, 0.18, 0.01, 0.18)); break;
    case 'crystal': {
      const c = [kit.accent, kit.accent2, '#b6a8ff'][v];
      glow.add(G.oct, c, 0, at(x, y + 0.35, z, 0.12, 0.38, 0.12, r));
      glow.add(G.oct, c, 0, at(x + 0.14, y + 0.2, z + 0.08, 0.08, 0.22, 0.08, r * 2, 0, 0.4));
      b.add(G.rock, '#6d64b8', 0, at(x, y + 0.04, z, 0.2, 0.08, 0.2));
      break;
    }
    case 'moonplant': for (let i = 0; i < 3; i++) { b.add(G.cyl, '#9fe7c8', 0.6, at(x - 0.1 + i * 0.1, y + 0.15, z, 0.015, 0.3, 0.015)); glow.add(G.sphere, i % 2 ? kit.accent2 : kit.accent, 0, at(x - 0.1 + i * 0.1, y + 0.32 + i * 0.04, z, 0.06)); } break;
    case 'antenna': b.add(G.rbox, '#8e95c0', 0, at(x, y + 0.1, z, 0.25, 0.2, 0.25)); b.add(G.cyl, '#c8cde8', 0, at(x, y + 0.6, z, 0.025, 0.9, 0.025)); glow.add(G.sphere, '#ff5d8f', 0, at(x, y + 1.08, z, 0.06)); break;
    case 'dish': b.add(G.cyl, '#8e95c0', 0, at(x, y + 0.2, z, 0.06, 0.4, 0.06)); b.add(G.sphere, '#e6ebff', 0, at(x, y + 0.5, z, 0.35, 0.1, 0.35, 0, 0.5)); glow.add(G.sphere, kit.accent, 0, at(x, y + 0.62, z + 0.1, 0.04)); break;
    case 'lamp': {
      const post = kit.id === 'space' || kit.id === 'lab' ? '#8e95c0' : '#5a4a6a';
      b.add(G.cyl, post, 0, at(x, y + 0.04, z, 0.1, 0.08, 0.1));
      b.add(G.cyl, post, 0, at(x, y + 0.45, z, 0.03, 0.85, 0.03));
      glow.add(G.sphere, kit.glow, 0, at(x, y + 0.92, z, 0.11));
      b.add(G.cone, post, 0, at(x, y + 1.06, z, 0.13, 0.1, 0.13));
      break;
    }
    case 'crate': b.add(G.rbox, kit.id === 'space' || kit.id === 'lab' ? '#a8b4cc' : '#c08a50', 0, at(x, y + 0.17, z, 0.34, 0.34, 0.34, r)); break;
    case 'blocks': { const cols = ['#ff5d8f', '#4cc9f0', '#ffc93c', '#3ddc97']; b.add(G.rbox, cols[v], 0, at(x - 0.12, y + 0.11, z, 0.22, 0.22, 0.22, r)); b.add(G.rbox, cols[(v + 1) % 4], 0, at(x + 0.13, y + 0.11, z + 0.05, 0.22, 0.22, 0.22, -r)); b.add(G.rbox, cols[(v + 2) % 4], 0, at(x, y + 0.33, z + 0.02, 0.22, 0.22, 0.22, r * 2)); break; }
    case 'banner': b.add(G.cyl, '#c8a060', 0, at(x, y + 0.6, z, 0.025, 1.2, 0.025)); b.add(G.box, kit.accent2, 0.8, at(x + 0.16, y + 0.95, z, 0.3, 0.4, 0.02)); glow.add(G.sphere, kit.accent, 0, at(x, y + 1.22, z, 0.05)); break;
    case 'pot': b.add(G.sphere, '#d07a48', 0, at(x, y + 0.18, z, 0.17, 0.2, 0.17)); b.add(G.cyl, '#2ec4b6', 0, at(x, y + 0.2, z, 0.175, 0.03, 0.175)); break;
    case 'column': b.add(G.cyl, kit.stone, 0, at(x, y + 0.45 - v * 0.12, z, 0.14, 0.9 - v * 0.25, 0.14)); b.add(G.rbox, kit.stone2, 0, at(x, y + 0.04, z, 0.38, 0.08, 0.38)); break;
    case 'kelp': for (let i = 0; i < 4; i++) b.add(G.sphere, i % 2 ? '#3fae6a' : '#2f9a5a', 0.3 + i * 0.25, at(x + Math.sin(i) * 0.05, y + 0.2 + i * 0.28, z, 0.06, 0.18, 0.06)); break;
    case 'coral': { const c = ['#ff7a8a', '#ffb24c', '#c86bfa', '#ff8fd0'][v]; for (let i = 0; i < 5; i++) { const a = i * 1.3 + r; b.add(G.capsule, c, 0.3, at(x + Math.cos(a) * 0.1, y + 0.2 + (i % 2) * 0.1, z + Math.sin(a) * 0.1, 0.04, 0.12 + (i % 3) * 0.05, 0.04, 0, Math.sin(a) * 0.5, Math.cos(a) * 0.5)); } break; }
    case 'anemone': b.add(G.sphere, '#c86bfa', 0, at(x, y + 0.06, z, 0.14, 0.07, 0.14)); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.add(G.capsule, '#ff9fd8', 0.9, at(x + Math.cos(a) * 0.08, y + 0.16, z + Math.sin(a) * 0.08, 0.02, 0.07, 0.02, 0, Math.sin(a) * 0.4, -Math.cos(a) * 0.4)); } break;
    case 'shell': b.add(G.sphere, '#ffd0c0', 0, at(x, y + 0.04, z, 0.14, 0.06, 0.12)); break;
    case 'beaker': b.add(G.rbox, '#a8b4cc', 0, at(x, y + 0.2, z, 0.5, 0.4, 0.3)); glow.add(G.cyl, [kit.accent, kit.accent2, '#ffc93c'][v], 0, at(x - 0.1, y + 0.5, z, 0.06, 0.22, 0.06)); glow.add(G.sphere, kit.accent2, 0, at(x + 0.12, y + 0.47, z, 0.08)); break;
    case 'pottedplant': b.add(G.cyl, '#ff8a65', 0, at(x, y + 0.1, z, 0.12, 0.2, 0.12)); b.add(G.sphere, '#4caf50', 0.6, at(x, y + 0.34, z, 0.18)); break;
    case 'coil': b.add(G.cyl, '#6e7ca0', 0, at(x, y + 0.08, z, 0.18, 0.16, 0.18)); for (let i = 0; i < 5; i++) b.add(G.torus, '#e0a040', 0, at(x, y + 0.22 + i * 0.1, z, 0.1, 0.1, 0.1, 0, Math.PI / 2)); glow.add(G.sphere, kit.accent, 0, at(x, y + 0.82, z, 0.12)); break;
    case 'pipe': b.add(G.cyl, '#a8b4cc', 0, at(x - 0.2, y + 0.3, z, 0.06, 0.6, 0.06)); b.add(G.cyl, '#a8b4cc', 0, at(x, y + 0.6, z, 0.06, 0.45, 0.06, 0, 0, Math.PI / 2)); glow.add(G.sphere, kit.accent2, 0, at(x + 0.2, y + 0.6, z, 0.08)); break;
    default: b.add(G.sphere, '#9ad35e', 0.4, at(x, y + 0.2, z, 0.2));
  }
}

// ------------------------------------------------------------------ meshes for individual objects
export function mat(color: string, opts: { emissive?: number; rough?: number; transparent?: number } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.48, metalness: 0 });
  if (opts.emissive) { m.emissive = new THREE.Color(color); m.emissiveIntensity = opts.emissive; }
  if (opts.transparent !== undefined) { m.transparent = true; m.opacity = opts.transparent; }
  return m;
}
export function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, ry, rz);
  o.castShadow = true; o.receiveShadow = true;
  return o;
}
export { G };

/** Landmark centrepiece. Returns group + an "orb" mesh that lights up on reward. Footprint ~3x3 tiles, origin at centre on the ground. */
export function landmark(key: string, kit: Kit, open = false): { group: THREE.Group; orb: THREE.Mesh | null; height: number } {
  const g = new THREE.Group();
  const stone = mat(kit.stone), stone2 = mat(kit.stone2);
  const tech = kit.id === 'space' || kit.id === 'lab';
  let orb: THREE.Mesh | null = null; let height = 2;
  const base = () => g.add(mesh(G.rbox, stone2, 0, 0.08, 0, 2.4, 0.16, 2.4));
  switch (key) {
    case 'tower': {
      base();
      const body = mat(tech ? '#b8bfdc' : kit.stone);
      g.add(mesh(G.cyl, body, 0, 1.2, 0, 0.62, 2.2, 0.62));
      for (let i = 0; i < 3; i++) g.add(mesh(G.cyl, stone2, 0, 0.5 + i * 0.7, 0, 0.66, 0.08, 0.66));
      g.add(mesh(G.rbox, mat('#5a3a28'), 0, 0.42, 0.6, 0.36, 0.6, 0.1));
      g.add(mesh(G.cyl, stone2, 0, 2.38, 0, 0.82, 0.18, 0.82));
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(mesh(G.rbox, stone, Math.cos(a) * 0.72, 2.56, Math.sin(a) * 0.72, 0.2, 0.2, 0.2, -a)); }
      g.add(mesh(G.cone, mat(tech ? '#8e95c0' : '#e8664a'), 0, 3.0, 0, 0.6, 0.8, 0.6));
      orb = mesh(G.sphere, mat(kit.accent, { emissive: 0.4 }), 0, 3.62, 0, 0.26);
      g.add(orb); height = 3.9;
      break;
    }
    case 'well': {
      base();
      g.add(mesh(G.cyl, stone, 0, 0.42, 0, 0.75, 0.6, 0.75));
      g.add(mesh(G.cyl, mat(kit.water.deep, { emissive: 0.15 }), 0, 0.7, 0, 0.6, 0.05, 0.6));
      orb = mesh(G.cyl, mat(kit.water.shallow, { emissive: 0.1 }), 0, 0.74, 0, 0.5, 0.02, 0.5); g.add(orb);
      const wood = mat('#8a5a36');
      g.add(mesh(G.rbox, wood, -0.7, 1.05, 0, 0.12, 1.3, 0.12)); g.add(mesh(G.rbox, wood, 0.7, 1.05, 0, 0.12, 1.3, 0.12));
      g.add(mesh(G.cyl, mat('#c8a070'), 0, 1.45, 0, 0.06, 1.5, 0.06, 0, 0, Math.PI / 2));
      g.add(mesh(G.rbox, mat('#a8743e'), 0, 1.05, 0, 0.18, 0.2, 0.18));
      const roof = mat(tech ? '#8e95c0' : '#d0604a');
      g.add(mesh(G.rbox, roof, 0, 1.85, -0.3, 1.9, 0.08, 0.8, 0, 0.6)); g.add(mesh(G.rbox, roof, 0, 1.85, 0.3, 1.9, 0.08, 0.8, 0, -0.6));
      height = 2.3; break;
    }
    case 'tree': {
      const bark = mat('#8a5a36');
      g.add(mesh(G.trunk, bark, 0, 1.0, 0, 0.42, 2.0, 0.42));
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.add(mesh(G.capsule, bark, Math.cos(a) * 0.5, 0.12, Math.sin(a) * 0.5, 0.12, 0.3, 0.12, 0, Math.sin(a) * 1.2, -Math.cos(a) * 1.2)); }
      const leaf = kit.id === 'ocean' ? '#3fae8a' : '#3e9a4e';
      const lm = mat(leaf, { rough: 0.6 });
      g.add(mesh(G.sphere, lm, 0, 2.6, 0, 1.25));
      g.add(mesh(G.sphere, mat(new THREE.Color(leaf).offsetHSL(0, 0, -0.05).getStyle(), { rough: 0.6 }), -0.9, 2.2, 0.4, 0.8));
      g.add(mesh(G.sphere, mat(new THREE.Color(leaf).offsetHSL(0, 0, 0.05).getStyle(), { rough: 0.6 }), 0.85, 2.3, -0.3, 0.85));
      g.add(mesh(G.sphere, mat(new THREE.Color(leaf).offsetHSL(0, 0, 0.08).getStyle(), { rough: 0.6 }), 0.1, 3.5, 0.1, 0.7));
      orb = mesh(G.sphere, mat(kit.accent, { emissive: 0.3 }), 0.5, 3.0, 1.0, 0.14); g.add(orb);
      for (let i = 0; i < 6; i++) g.add(mesh(G.sphere, mat(kit.accent2, { emissive: 0.2 }), Math.cos(i) * 1.1, 2.2 + (i % 3) * 0.45, Math.sin(i) * 1.1, 0.09));
      height = 4.2; break;
    }
    case 'fountain': {
      g.add(mesh(G.cyl, stone, 0, 0.2, 0, 1.15, 0.4, 1.15));
      g.add(mesh(G.cyl, mat(kit.water.shallow, { emissive: 0.15, rough: 0.2 }), 0, 0.38, 0, 1.0, 0.06, 1.0));
      g.add(mesh(G.cyl, stone2, 0, 0.8, 0, 0.16, 0.9, 0.16));
      g.add(mesh(G.cyl, stone, 0, 1.25, 0, 0.5, 0.12, 0.5));
      orb = mesh(G.sphere, mat(kit.accent, { emissive: 0.3 }), 0, 1.5, 0, 0.16); g.add(orb);
      height = 1.8; break;
    }
    case 'console': {
      base();
      g.add(mesh(G.rbox, mat('#6e7ca0'), 0, 0.5, 0, 1.4, 0.8, 0.9));
      g.add(mesh(G.rbox, mat('#2a3048'), 0, 1.25, -0.15, 1.5, 0.8, 0.12, 0, -0.3));
      g.add(mesh(G.box, mat(kit.accent, { emissive: 0.6 }), 0, 1.25, -0.07, 1.3, 0.62, 0.02, 0, -0.3));
      orb = mesh(G.sphere, mat(kit.accent2, { emissive: 0.5 }), 0, 2.4, 0, 0.36); g.add(orb);
      g.add(mesh(G.torus, mat(kit.accent, { emissive: 0.5 }), 0, 2.4, 0, 0.6, 0.6, 0.6, 0, 1.2));
      height = 3; break;
    }
    case 'gate': {
      base();
      g.add(mesh(G.rbox, stone, -0.8, 1.2, 0, 0.4, 2.4, 0.4)); g.add(mesh(G.rbox, stone, 0.8, 1.2, 0, 0.4, 2.4, 0.4));
      g.add(mesh(G.rbox, stone2, 0, 2.5, 0, 2.2, 0.3, 0.5));
      orb = mesh(G.oct, mat(kit.accent, { emissive: 0.5 }), 0, 1.4, 0, 0.3); g.add(orb);
      height = 2.8; break;
    }
    case 'statue': {
      base();
      g.add(mesh(G.rbox, stone2, 0, 0.45, 0, 0.7, 0.6, 0.7));
      g.add(mesh(G.capsule, stone, 0, 1.15, 0, 0.3, 0.4, 0.3));
      g.add(mesh(G.sphere, stone, 0, 1.75, 0, 0.3));
      orb = mesh(G.oct, mat(kit.accent, { emissive: 0.4 }), 0, 2.2, 0, 0.14); g.add(orb);
      height = 2.4; break;
    }
    case 'obelisk': {
      base();
      g.add(mesh(G.cyl, stone, 0, 1.5, 0, 0.3, 2.8, 0.42, Math.PI / 4).rotateY(0));
      (g.children[g.children.length - 1] as THREE.Mesh).geometry = new THREE.CylinderGeometry(0.7, 1, 1, 4);
      orb = mesh(G.cone8, mat(kit.accent2, { emissive: 0.4 }), 0, 3.1, 0, 0.32, 0.4, 0.32, Math.PI / 4); g.add(orb);
      height = 3.4; break;
    }
    case 'reef': {
      const cols = ['#ff7a8a', '#ffb24c', '#c86bfa', '#ff8fd0', '#4cc9f0'];
      g.add(mesh(G.sphere, mat(kit.ground.top), 0, 0, 0, 1.2, 0.3, 1.0));
      for (let i = 0; i < 9; i++) { const a = i * 0.9; g.add(mesh(G.capsule, mat(cols[i % 5]), Math.cos(a) * 0.6, 0.6 + (i % 3) * 0.2, Math.sin(a) * 0.5, 0.1, 0.4 + (i % 2) * 0.3, 0.1, 0, Math.sin(a) * 0.4, Math.cos(a) * 0.4)); }
      orb = mesh(G.sphere, mat('#ffffff', { emissive: 0.4 }), 0, 1.4, 0, 0.18); g.add(orb);
      height = 2; break;
    }
    case 'bloom': {
      base();
      const stem = mat('#4caf50');
      g.add(mesh(G.cyl, stem, 0, 0.9, 0, 0.1, 1.8, 0.1));
      g.add(mesh(G.sphere, mat('#5cc25a'), -0.5, 0.6, 0, 0.6, 0.08, 0.25, 0, 0, 0.4)); g.add(mesh(G.sphere, mat('#3e9a4e'), 0.5, 0.8, 0, 0.6, 0.08, 0.25, 0, 0, -0.4));
      const petal = mat(open ? '#ff7aa8' : '#b8a0b0');
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const p = mesh(G.sphere, petal, Math.cos(a) * (open ? 0.55 : 0.18), 2.0 + (open ? 0 : 0.3), Math.sin(a) * (open ? 0.55 : 0.18), 0.32, 0.08, 0.6, -a + Math.PI / 2, open ? 0.25 : 1.3);
        p.name = 'petal'; g.add(p);
      }
      orb = mesh(G.sphere, mat('#ffc93c', { emissive: open ? 0.4 : 0 }), 0, 2.05, 0, 0.3, 0.2, 0.3); g.add(orb);
      height = 2.6; break;
    }
    default: {
      base();
      g.add(mesh(G.rbox, stone, 0, 0.6, 0, 1.3, 1.0, 1.3));
      g.add(mesh(G.cone8, mat(tech ? '#8e95c0' : '#c8604a'), 0, 1.5, 0, 1.1, 0.8, 1.1, Math.PI / 8));
      g.add(mesh(G.rbox, mat('#3a2a30'), 0, 0.45, 0.62, 0.4, 0.6, 0.05));
      orb = mesh(G.oct, mat(kit.accent, { emissive: 0.5 }), 0, 2.2, 0, 0.16); g.add(orb);
      height = 2.4;
    }
  }
  return { group: g, orb, height };
}

/** Study station: lectern with open book / holo panel / scroll stand / shell. */
export function station(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  if (kit.station === 'holo' || kit.station === 'panel') {
    g.add(mesh(G.rbox, mat('#6e7ca0'), 0, 0.12, 0, 0.4, 0.24, 0.4));
    g.add(mesh(G.cyl, mat('#8e95c0'), 0, 0.45, 0, 0.05, 0.5, 0.05));
    g.add(mesh(G.box, mat('#78f0ff', { emissive: 0.8, transparent: 0.7 }), 0, 0.85, 0, 0.7, 0.45, 0.02, 0, -0.4));
  } else if (kit.station === 'shell') {
    g.add(mesh(G.sphere, mat('#ffd6e0'), 0, 0.3, 0, 0.4, 0.35, 0.2));
    g.add(mesh(G.sphere, mat('#ffffff', { emissive: 0.4 }), 0, 0.25, 0.15, 0.1));
  } else {
    const wood = mat(kit.station === 'scroll' ? kit.stone2 : '#9a6a40');
    g.add(mesh(G.cyl, wood, 0, 0.04, 0, 0.22, 0.08, 0.22));
    g.add(mesh(G.cyl, wood, 0, 0.35, 0, 0.06, 0.6, 0.06));
    g.add(mesh(G.rbox, wood, 0, 0.68, 0, 0.6, 0.06, 0.42, 0, -0.45));
    const page = mat('#fff7e8', { emissive: 0.15 });
    g.add(mesh(G.box, page, -0.13, 0.73, 0, 0.25, 0.02, 0.34, 0, -0.45, 0.12));
    g.add(mesh(G.box, page, 0.13, 0.73, 0, 0.25, 0.02, 0.34, 0, -0.45, -0.12));
    g.add(mesh(G.box, mat(kit.accent2), 0.02, 0.82, -0.12, 0.03, 0.16, 0.01));
  }
  return g;
}

export function collectibleModel(icon: string, kit: Kit): THREE.Group {
  const g = new THREE.Group();
  if (icon === 'drop') { g.add(mesh(G.sphere, mat('#4cc9f0', { emissive: 0.35, rough: 0.15 }), 0, 0, 0, 0.14)); g.add(mesh(G.cone, mat('#4cc9f0', { emissive: 0.35, rough: 0.15 }), 0, 0.15, 0, 0.1, 0.2, 0.1)); }
  else if (icon === 'seed') g.add(mesh(G.sphere, mat('#c88a40', { emissive: 0.2 }), 0, 0, 0, 0.12, 0.16, 0.12));
  else g.add(mesh(G.oct, mat(kit.accent, { emissive: 0.5 }), 0, 0, 0, 0.15, 0.22, 0.15));
  return g;
}

export function barrier(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  if (kit.gate === 'vines') {
    const vine = mat('#2f6a33');
    for (let i = 0; i < 6; i++) { g.add(mesh(G.capsule, vine, -0.5 + i * 0.2, 0.7, 0, 0.06, 1.2, 0.06, 0, 0, Math.sin(i) * 0.25)); }
    for (let i = 0; i < 5; i++) g.add(mesh(G.sphere, mat('#3e7a3a'), -0.4 + i * 0.2, 0.3 + (i % 3) * 0.4, 0.05, 0.16));
    for (let i = 0; i < 3; i++) g.add(mesh(G.sphere, mat('#ff7aa8', { emissive: 0.2 }), -0.3 + i * 0.3, 1.1 - i * 0.2, 0.1, 0.07));
  } else if (kit.gate === 'field') {
    g.add(mesh(G.box, mat('#78f0ff', { emissive: 0.9, transparent: 0.45 }), 0, 0.8, 0, 1.4, 1.6, 0.03));
    g.add(mesh(G.cyl, mat('#8e95c0'), -0.72, 0.5, 0, 0.08, 1, 0.08)); g.add(mesh(G.cyl, mat('#8e95c0'), 0.72, 0.5, 0, 0.08, 1, 0.08));
  } else {
    for (let i = 0; i < 6; i++) g.add(mesh(G.cyl, mat('#c8a060'), -0.5 + i * 0.2, 0.7, 0, 0.04, 1.4, 0.04));
    g.add(mesh(G.rbox, mat(kit.accent), 0, 1.3, 0, 1.3, 0.1, 0.1));
  }
  return g;
}
