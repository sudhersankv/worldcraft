/** Chibi toy characters (big head, short body, bouncy walk). Front faces +Z. */
import * as THREE from 'three';
import { G, mat, mesh } from './models';

export interface Rig { root: THREE.Group; bob: THREE.Group; head: THREE.Object3D; feet: THREE.Object3D[]; arms: THREE.Object3D[]; floaty: boolean; height: number }

interface Human { skin: string; shirt: string; pants: string; hair: string; hat?: string; cape?: string }
const HUMANS: Record<string, Human> = {
  kid: { skin: '#f6c7a0', shirt: '#3ea86a', pants: '#8a5a36', hair: '#e8b04a', hat: 'cap' },
  astronaut: { skin: '#f0c098', shirt: '#eef2ff', pants: '#c8cde8', hair: '#3a2a20', hat: 'helmet' },
  wizard: { skin: '#f6c7a0', shirt: '#6b5fd8', pants: '#4a3fa8', hair: '#e8e8f0', hat: 'wizard' },
  knight: { skin: '#f0c098', shirt: '#c8cde8', pants: '#8e95b8', hair: '#8a5a30', hat: 'knight', cape: '#e8434a' },
  merchant: { skin: '#d8a070', shirt: '#2ec4b6', pants: '#8a5a30', hair: '#2a1a10', hat: 'turban' },
  scribe: { skin: '#c88a5a', shirt: '#fff7e8', pants: '#e8d8b0', hair: '#1a1010', hat: 'none' },
  builder: { skin: '#e0a878', shirt: '#ff8a3c', pants: '#4a6aa8', hair: '#3a2a20', hat: 'hard' },
  explorer: { skin: '#e8b088', shirt: '#c8a868', pants: '#7a6040', hair: '#6a3a20', hat: 'safari' },
  scientist: { skin: '#f6c7a0', shirt: '#ffffff', pants: '#5a5a8a', hair: '#ff8a3c', hat: 'goggles' },
};

function eyes(head: THREE.Object3D, r: number, y = 0, z = 0.86) {
  const black = mat('#1f1633', { rough: 0.2 }), white = mat('#ffffff', { emissive: 0.6 });
  for (const s of [-1, 1]) {
    head.add(mesh(G.sphere, black, s * 0.32 * r, y * r, z * r, 0.12 * r, 0.17 * r, 0.08 * r));
    head.add(mesh(G.sphere, white, s * 0.32 * r - 0.03 * r, (y + 0.06) * r, (z + 0.06) * r, 0.04 * r));
    head.add(mesh(G.sphere, mat('#ff8fa8', { transparent: 0.6 }), s * 0.55 * r, (y - 0.22) * r, (z - 0.12) * r, 0.12 * r, 0.06 * r, 0.04 * r));
  }
}

function base(floaty = false): Rig {
  const root = new THREE.Group(); const bob = new THREE.Group(); root.add(bob);
  return { root, bob, head: bob, feet: [], arms: [], floaty, height: 1 };
}

function human(h: Human): Rig {
  const r = base();
  const skin = mat(h.skin), shirt = mat(h.shirt), pants = mat(h.pants), hair = mat(h.hair);
  for (const s of [-1, 1]) { const f = mesh(G.sphere, mat('#4a3040'), s * 0.09, 0.06, 0.02, 0.08, 0.06, 0.11); r.root.add(f); r.feet.push(f); }
  r.bob.add(mesh(G.capsule, pants, 0, 0.2, 0, 0.13, 0.06, 0.12));
  r.bob.add(mesh(G.capsule, shirt, 0, 0.32, 0, 0.15, 0.1, 0.13));
  if (h.cape) r.bob.add(mesh(G.rbox, mat(h.cape), 0, 0.3, -0.13, 0.3, 0.34, 0.04));
  for (const s of [-1, 1]) { const a = new THREE.Group(); a.position.set(s * 0.18, 0.4, 0); a.add(mesh(G.capsule, shirt, 0, -0.08, 0, 0.05, 0.08, 0.05)); a.add(mesh(G.sphere, skin, 0, -0.17, 0, 0.055)); r.bob.add(a); r.arms.push(a); }
  const head = new THREE.Group(); head.position.set(0, 0.68, 0); r.bob.add(head); r.head = head;
  head.add(mesh(G.sphere, skin, 0, 0, 0, 0.26, 0.24, 0.24));
  if (h.hat !== 'helmet') { head.add(mesh(G.sphere, hair, 0, 0.07, -0.03, 0.275, 0.22, 0.26)); head.add(mesh(G.sphere, hair, 0, 0.12, 0.12, 0.2, 0.09, 0.14, 0, 0.3)); }
  eyes(head, 0.24, -0.05, 0.9);
  switch (h.hat) {
    case 'cap': head.add(mesh(G.cone8, mat('#3ea86a'), 0, 0.3, -0.12, 0.22, 0.5, 0.22, 0, -0.9)); break;
    case 'helmet': head.add(mesh(G.sphere, mat('#bfe6ff', { transparent: 0.35, rough: 0.1 }), 0, 0, 0, 0.34)); head.add(mesh(G.torus, mat('#c8cde8'), 0, -0.22, 0, 0.26, 0.26, 0.26, 0, Math.PI / 2)); break;
    case 'wizard': head.add(mesh(G.cone8, mat(h.shirt), 0, 0.38, 0, 0.28, 0.6, 0.28, 0, -0.15)); head.add(mesh(G.cyl, mat(h.shirt), 0, 0.14, 0, 0.36, 0.03, 0.36)); break;
    case 'knight': head.add(mesh(G.sphere, mat('#c8cde8', { rough: 0.25 }), 0, 0.06, 0, 0.29, 0.24, 0.28)); head.add(mesh(G.rbox, mat('#e8434a'), 0, 0.33, 0, 0.05, 0.16, 0.2)); break;
    case 'turban': head.add(mesh(G.sphere, mat('#ffc93c'), 0, 0.14, 0, 0.29, 0.17, 0.29)); break;
    case 'hard': head.add(mesh(G.sphere, mat('#ffc93c'), 0, 0.12, 0, 0.29, 0.18, 0.29)); break;
    case 'safari': head.add(mesh(G.cyl, mat('#c8a868'), 0, 0.13, 0, 0.4, 0.03, 0.4)); head.add(mesh(G.sphere, mat('#d8b878'), 0, 0.18, 0, 0.22, 0.12, 0.22)); break;
    case 'goggles': for (const s of [-1, 1]) head.add(mesh(G.torus, mat('#78dcff', { emissive: 0.3 }), s * 0.1, 0.13, 0.2, 0.07, 0.07, 0.07)); break;
  }
  r.height = 1.05;
  return r;
}

const SPECIAL: Record<string, () => Rig> = {
  sunflower: () => {
    const r = base();
    const green = mat('#4caf50');
    for (const s of [-1, 1]) { const f = mesh(G.sphere, mat('#6a4428'), s * 0.09, 0.06, 0, 0.09, 0.07, 0.11); r.root.add(f); r.feet.push(f); }
    r.bob.add(mesh(G.cyl, green, 0, 0.35, 0, 0.06, 0.6, 0.06));
    for (const s of [-1, 1]) { const a = new THREE.Group(); a.position.set(s * 0.08, 0.38, 0); a.add(mesh(G.sphere, mat('#5cc25a'), s * 0.14, 0, 0, 0.16, 0.04, 0.08, 0, 0, s * 0.3)); r.bob.add(a); r.arms.push(a); }
    const head = new THREE.Group(); head.position.set(0, 0.85, 0); r.bob.add(head); r.head = head;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; head.add(mesh(G.sphere, mat(i % 2 ? '#ffc93c' : '#ffd84c'), Math.cos(a) * 0.3, Math.sin(a) * 0.3, -0.02, 0.1, 0.07, 0.04, 0, 0, a)); }
    head.add(mesh(G.cyl, mat('#8a5a30'), 0, 0, 0, 0.24, 0.1, 0.24, 0, Math.PI / 2));
    eyes(head, 0.2, 0.05, 0.4);
    r.height = 1.25; return r;
  },
  'water-spirit': () => {
    const r = base(true);
    const water = mat('#5fc8f0', { emissive: 0.25, rough: 0.15, transparent: 0.85 });
    r.bob.add(mesh(G.sphere, water, 0, 0.42, 0, 0.3, 0.32, 0.3));
    r.bob.add(mesh(G.cone, water, 0, 0.82, 0, 0.2, 0.36, 0.2));
    const head = new THREE.Group(); head.position.set(0, 0.48, 0); r.bob.add(head); r.head = head; eyes(head, 0.28, 0.05, 0.95);
    for (const s of [-1, 1]) { const a = new THREE.Group(); a.position.set(s * 0.3, 0.42, 0); a.add(mesh(G.sphere, water, 0, 0, 0, 0.08)); r.bob.add(a); r.arms.push(a); }
    r.height = 1.1; return r;
  },
  tree: () => {
    const r = base();
    const bark = mat('#8a5a36');
    for (const s of [-1, 1]) { const f = mesh(G.sphere, mat('#6a4428'), s * 0.12, 0.06, 0, 0.1, 0.07, 0.13); r.root.add(f); r.feet.push(f); }
    r.bob.add(mesh(G.trunk, bark, 0, 0.42, 0, 0.24, 0.7, 0.24));
    const head = new THREE.Group(); head.position.set(0, 0.5, 0); r.bob.add(head); r.head = head; eyes(head, 0.24, 0, 0.95);
    head.add(mesh(G.sphere, mat('#8acf6a'), 0, -0.2, 0.2, 0.14, 0.1, 0.06));
    const leaf = mat('#4caf50', { rough: 0.6 });
    r.bob.add(mesh(G.sphere, leaf, 0, 1.0, 0, 0.42, 0.34, 0.42));
    r.bob.add(mesh(G.sphere, mat('#3e9a4e', { rough: 0.6 }), -0.28, 0.9, 0.05, 0.26));
    r.bob.add(mesh(G.sphere, mat('#5cc25a', { rough: 0.6 }), 0.28, 0.92, -0.05, 0.26));
    for (const s of [-1, 1]) { const a = new THREE.Group(); a.position.set(s * 0.26, 0.55, 0); a.add(mesh(G.capsule, bark, s * 0.08, 0, 0, 0.05, 0.16, 0.05, 0, 0, s * 0.8)); r.bob.add(a); r.arms.push(a); }
    r.height = 1.45; return r;
  },
  robot: () => {
    const r = base();
    const metal = mat('#c8cde8', { rough: 0.3 });
    for (const s of [-1, 1]) { const f = mesh(G.rbox, mat('#4a4f6a'), s * 0.1, 0.06, 0, 0.12, 0.1, 0.16); r.root.add(f); r.feet.push(f); }
    r.bob.add(mesh(G.rbox, metal, 0, 0.32, 0, 0.34, 0.3, 0.26));
    r.bob.add(mesh(G.sphere, mat('#ff5d8f', { emissive: 0.6 }), 0, 0.34, 0.14, 0.04));
    const head = new THREE.Group(); head.position.set(0, 0.68, 0); r.bob.add(head); r.head = head;
    head.add(mesh(G.rbox, mat('#dfe4f8', { rough: 0.3 }), 0, 0, 0, 0.44, 0.34, 0.36));
    head.add(mesh(G.rbox, mat('#2a3048'), 0, 0, 0.17, 0.34, 0.2, 0.04));
    for (const s of [-1, 1]) head.add(mesh(G.sphere, mat('#5ef2ff', { emissive: 1 }), s * 0.08, 0, 0.2, 0.04, 0.05, 0.02));
    head.add(mesh(G.cyl, metal, 0, 0.24, 0, 0.015, 0.16, 0.015)); head.add(mesh(G.sphere, mat('#ffc93c', { emissive: 0.6 }), 0, 0.34, 0, 0.05));
    for (const s of [-1, 1]) { const a = new THREE.Group(); a.position.set(s * 0.23, 0.38, 0); a.add(mesh(G.capsule, metal, 0, -0.08, 0, 0.05, 0.1, 0.05)); r.bob.add(a); r.arms.push(a); }
    r.height = 1.1; return r;
  },
  alien: () => {
    const r = human({ skin: '#7ae88a', shirt: '#7b6cff', pants: '#4a3fa8', hair: '#7ae88a', hat: 'none' });
    for (const s of [-1, 1]) { r.head.add(mesh(G.cyl, mat('#7ae88a'), s * 0.1, 0.32, 0, 0.015, 0.2, 0.015, 0, 0, s * 0.3)); r.head.add(mesh(G.sphere, mat('#ff6bd6', { emissive: 0.6 }), s * 0.14, 0.43, 0, 0.05)); }
    return r;
  },
  turtle: () => {
    const r = base();
    for (const s of [-1, 1]) for (const z of [-1, 1]) { const f = mesh(G.sphere, mat('#8ad89a'), s * 0.18, 0.06, z * 0.14, 0.07); r.root.add(f); r.feet.push(f); }
    r.bob.add(mesh(G.sphere, mat('#3fae6a', { rough: 0.35 }), 0, 0.22, -0.02, 0.32, 0.22, 0.34));
    r.bob.add(mesh(G.cyl, mat('#c8b070'), 0, 0.14, 0, 0.33, 0.04, 0.35));
    const head = new THREE.Group(); head.position.set(0, 0.3, 0.36); r.bob.add(head); r.head = head;
    head.add(mesh(G.sphere, mat('#8ad89a'), 0, 0, 0, 0.16)); eyes(head, 0.16, 0.1, 0.8);
    r.height = 0.75; return r;
  },
  fish: () => {
    const r = base(true);
    r.bob.add(mesh(G.sphere, mat('#ff8a3c'), 0, 0.5, 0, 0.22, 0.26, 0.34));
    r.bob.add(mesh(G.cone, mat('#ffb24c'), 0, 0.5, -0.38, 0.18, 0.2, 0.06, 0, -Math.PI / 2));
    const head = new THREE.Group(); head.position.set(0, 0.52, 0.12); r.bob.add(head); r.head = head; eyes(head, 0.22, 0, 0.9);
    r.height = 0.9; return r;
  },
  coral: () => {
    const r = base();
    const pink = mat('#ff7a8a');
    r.bob.add(mesh(G.capsule, pink, 0, 0.4, 0, 0.22, 0.3, 0.2));
    for (let i = 0; i < 4; i++) r.bob.add(mesh(G.capsule, mat('#ff9fb0'), -0.2 + i * 0.13, 0.85, 0, 0.05, 0.2, 0.05, 0, 0, -0.5 + i * 0.33));
    const head = new THREE.Group(); head.position.set(0, 0.5, 0); r.bob.add(head); r.head = head; eyes(head, 0.22, 0, 0.9);
    r.height = 1.1; return r;
  },
  goat: () => {
    const r = base();
    const wool = mat('#fffaf0', { rough: 0.7 });
    for (const s of [-1, 1]) for (const z of [-1, 1]) { const f = new THREE.Group(); f.position.set(s * 0.12, 0, z * 0.16); f.add(mesh(G.cyl, mat('#e8e0d0'), 0, 0.14, 0, 0.035, 0.28, 0.035)); f.add(mesh(G.sphere, mat('#3a2a40'), 0, 0.02, 0, 0.04)); r.root.add(f); r.feet.push(f); }
    r.bob.add(mesh(G.sphere, wool, 0, 0.36, 0, 0.22, 0.17, 0.32));
    for (let i = 0; i < 4; i++) r.bob.add(mesh(G.sphere, wool, Math.sin(i * 2) * 0.1, 0.48, -0.2 + i * 0.13, 0.11));
    const head = new THREE.Group(); head.position.set(0, 0.62, 0.32); r.bob.add(head); r.head = head;
    head.add(mesh(G.sphere, wool, 0, 0, 0, 0.16, 0.15, 0.18)); eyes(head, 0.16, 0.1, 0.85);
    head.add(mesh(G.cone, mat('#e8e0d0'), 0, -0.2, 0.08, 0.05, 0.14, 0.05, 0, Math.PI));
    for (const s of [-1, 1]) { head.add(mesh(G.torus, mat('#c8a070'), s * 0.1, 0.16, -0.06, 0.08, 0.08, 0.08, s * 0.5, 0, 0)); head.add(mesh(G.sphere, mat('#f0e0d0'), s * 0.18, 0.02, -0.02, 0.08, 0.03, 0.04, 0, 0, s * -0.4)); }
    r.bob.add(mesh(G.torus, mat('#ff5d8f'), 0, 0.5, 0.26, 0.13, 0.13, 0.13, 0, Math.PI / 2));
    r.height = 0.95; return r;
  },
  sprout: () => { const r = base(true); r.bob.add(mesh(G.sphere, mat('#9be07a'), 0, 0, 0, 0.16)); const head = new THREE.Group(); r.bob.add(head); r.head = head; eyes(head, 0.16, 0, 0.9); r.bob.add(mesh(G.cyl, mat('#3e9a4e'), 0, 0.2, 0, 0.015, 0.12, 0.015)); for (const s of [-1, 1]) r.bob.add(mesh(G.sphere, mat('#5cc25a'), s * 0.09, 0.28, 0, 0.1, 0.03, 0.05, 0, 0, s * 0.4)); r.height = 0.4; return r; },
  beep: () => { const r = base(true); r.bob.add(mesh(G.sphere, mat('#dfe4f8', { rough: 0.25 }), 0, 0, 0, 0.17)); r.bob.add(mesh(G.rbox, mat('#2a3048'), 0, 0.02, 0.13, 0.2, 0.1, 0.06)); for (const s of [-1, 1]) r.bob.add(mesh(G.sphere, mat('#5ef2ff', { emissive: 1 }), s * 0.05, 0.02, 0.17, 0.025)); r.bob.add(mesh(G.sphere, mat('#ff5d8f', { emissive: 0.7 }), 0, 0.24, 0, 0.04)); r.height = 0.4; return r; },
  digit: () => { const r = base(true); r.bob.add(mesh(G.rbox, mat('#ffc93c'), 0, 0, 0, 0.28, 0.28, 0.28)); const head = new THREE.Group(); r.bob.add(head); r.head = head; eyes(head, 0.15, 0, 0.98); r.height = 0.4; return r; },
  scarab: () => { const r = base(true); r.bob.add(mesh(G.sphere, mat('#2ec4b6', { rough: 0.25 }), 0, 0, 0, 0.15, 0.12, 0.18)); for (const s of [-1, 1]) r.bob.add(mesh(G.sphere, mat('#c8f0ff', { transparent: 0.5 }), s * 0.15, 0.08, -0.05, 0.14, 0.02, 0.08)); const head = new THREE.Group(); head.position.set(0, 0, 0.12); r.bob.add(head); r.head = head; eyes(head, 0.1, 0, 0.9); r.height = 0.4; return r; },
  bubble: () => { const r = base(true); r.bob.add(mesh(G.sphere, mat('#b4f0ff', { transparent: 0.5, rough: 0.05 }), 0, 0, 0, 0.18)); const head = new THREE.Group(); r.bob.add(head); r.head = head; eyes(head, 0.16, 0, 0.9); r.height = 0.4; return r; },
  sparky: () => { const r = base(true); r.bob.add(mesh(G.sphere, mat('#ffe27a', { emissive: 0.6 }), 0, 0, 0, 0.12)); for (let i = 0; i < 3; i++) r.bob.add(mesh(G.torus, mat('#c86bfa', { emissive: 0.6 }), 0, 0, 0, 0.22, 0.22, 0.22, i, i * 1.1)); const head = new THREE.Group(); r.bob.add(head); r.head = head; eyes(head, 0.12, 0, 0.95); r.height = 0.4; return r; },
};

export function spawnCharacter(archetype: string): Rig {
  const r = HUMANS[archetype] ? human(HUMANS[archetype]) : SPECIAL[archetype] ? SPECIAL[archetype]() : human(HUMANS.kid);
  r.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return r;
}

/** Procedural animation: bouncy walk / idle breathe / floaty bob. */
export function animateRig(r: Rig, t: number, moving: boolean, phase = 0) {
  const tt = t + phase;
  if (r.floaty) { r.bob.position.y = 0.05 + Math.sin(tt * 2.6) * 0.05; r.bob.rotation.z = Math.sin(tt * 1.3) * 0.05; return; }
  if (moving) {
    const s = Math.sin(tt * 11);
    r.bob.position.y = Math.abs(s) * 0.06;
    r.bob.scale.set(1, 1 - Math.abs(Math.cos(tt * 11)) * 0.05, 1);
    r.bob.rotation.z = s * 0.06;
    r.feet.forEach((f, i) => { f.position.z = (i % 2 ? 1 : -1) * s * 0.08 + (f.userData.z0 ??= f.position.z) * 1; f.position.y = Math.max(0, (i % 2 ? 1 : -1) * s) * 0.05 + 0.0 + (f.userData.y0 ??= f.position.y); });
    r.arms.forEach((a, i) => { a.rotation.x = (i % 2 ? -1 : 1) * s * 0.7; });
  } else {
    r.bob.position.y = 0;
    r.bob.scale.set(1, 1 + Math.sin(tt * 2.2) * 0.02, 1);
    r.bob.rotation.z = 0;
    r.feet.forEach((f) => { f.position.z = f.userData.z0 ?? f.position.z; f.position.y = f.userData.y0 ?? f.position.y; });
    r.arms.forEach((a, i) => { a.rotation.x = 0; a.rotation.z = (i % 2 ? 1 : -1) * Math.sin(tt * 2.2) * 0.04; });
  }
}
