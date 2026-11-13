/** Six template kits: palette + materials + props + particles. All art is drawn in code from these. */
import type { TemplateId } from '../../shared/contracts';

export interface Material { top: string; top2: string; speck: string }
export type Particles = 'fireflies' | 'pollen' | 'stars' | 'bubbles' | 'sparks' | 'dust';

export interface Kit {
  id: TemplateId;
  name: string;
  sky: [string, string, string];           // CSS gradient top, mid, bottom
  ground: Material;                         // base terrain
  zoneMats: Material[];                     // per-zone ground (cycled)
  path: Material;
  water: { deep: string; shallow: string; foam: string };
  cliff: { left: string; right: string; strata: string[]; under: string };
  bridge: string;
  stone: string; stone2: string;            // landmark masonry
  accent: string; accent2: string; glow: string;
  props: { key: string; w: number }[];      // weighted scatter props
  plaza: string[];                          // small props around zones
  particles: Particles;
  gate: 'vines' | 'field' | 'bars';
  station: 'lectern' | 'holo' | 'scroll' | 'shell' | 'panel';
  companion: 'sprout' | 'beep' | 'digit' | 'scarab' | 'bubble' | 'sparky';
  startSaturation: number;                  // -1..0 (desaturated start, colour floods back)
  music: { root: number; scale: number[]; tempo: number; lead: OscillatorType; pad: OscillatorType; mood: string };
}

const M = (top: string, top2: string, speck: string): Material => ({ top, top2, speck });

export const KITS: Record<TemplateId, Kit> = {
  forest: {
    id: 'forest', name: 'Enchanted Forest',
    sky: ['#9fe3ff', '#d6f3ff', '#fff3d6'],
    ground: M('#79c850', '#6cbc47', '#a6e06c'),
    zoneMats: [M('#8fd45c', '#83ca52', '#ffe27a'), M('#5fb35a', '#55a852', '#9be08b'), M('#6fbf6a', '#62b25f', '#c9f29a'), M('#a6d85e', '#97cd52', '#ff9fc4')],
    path: M('#e2c088', '#d6b27a', '#f1d9a8'),
    water: { deep: '#2f8fd8', shallow: '#56c4f0', foam: '#e8fbff' },
    cliff: { left: '#a5764c', right: '#7c5536', strata: ['#8c6240', '#6e4a30', '#5a3b26'], under: '#3d2a1f' },
    bridge: '#b07a48', stone: '#cfc7b8', stone2: '#a69c8c', accent: '#ffc93c', accent2: '#ff7aa8', glow: '#fff2a8',
    props: [{ key: 'tree-round', w: 5 }, { key: 'tree-pine', w: 4 }, { key: 'bush', w: 4 }, { key: 'flowers', w: 5 }, { key: 'mushroom', w: 2 }, { key: 'rock', w: 2 }, { key: 'stump', w: 1 }, { key: 'fern', w: 3 }],
    plaza: ['flowers', 'mushroom', 'fern', 'lamp'],
    particles: 'fireflies', gate: 'vines', station: 'lectern', companion: 'sprout', startSaturation: -0.72,
    music: { root: 60, scale: [0, 2, 4, 7, 9], tempo: 84, lead: 'triangle', pad: 'sine', mood: 'cozy' },
  },
  space: {
    id: 'space', name: 'Space Station',
    sky: ['#0b0a24', '#1d1650', '#3b2a78'],
    ground: M('#6d64b8', '#6259ab', '#8f86d8'),
    zoneMats: [M('#8e95c8', '#8189bd', '#c4c9ff'), M('#5d7fc0', '#5374b4', '#9fd0ff'), M('#8a6cc0', '#7e61b4', '#e0b6ff'), M('#5fa7b8', '#549bab', '#a6fff4')],
    path: M('#b8bfdc', '#aab1d0', '#e6ebff'),
    water: { deep: '#1a2a7a', shallow: '#3a8cff', foam: '#bdf2ff' },
    cliff: { left: '#5a4f9a', right: '#3f3678', strata: ['#4a4088', '#352d68', '#261f50'], under: '#140f30' },
    bridge: '#9aa3c8', stone: '#c8cde8', stone2: '#8e95c0', accent: '#5ef2ff', accent2: '#ff6bd6', glow: '#a8fbff',
    props: [{ key: 'crystal', w: 4 }, { key: 'rock', w: 3 }, { key: 'antenna', w: 2 }, { key: 'lamp', w: 2 }, { key: 'crate', w: 2 }, { key: 'moonplant', w: 4 }, { key: 'dish', w: 1 }],
    plaza: ['lamp', 'crate', 'crystal'],
    particles: 'stars', gate: 'field', station: 'holo', companion: 'beep', startSaturation: -0.5,
    music: { root: 57, scale: [0, 2, 3, 7, 8], tempo: 72, lead: 'sine', pad: 'triangle', mood: 'dreamy' },
  },
  math: {
    id: 'math', name: 'Math Kingdom',
    sky: ['#8fd3ff', '#cfeaff', '#fff0c9'],
    ground: M('#9ad35e', '#8dc853', '#d6f08a'),
    zoneMats: [M('#e8d8a8', '#ddcc98', '#fff3c4'), M('#a8c4f0', '#9ab6e4', '#e0ecff'), M('#f0c48a', '#e6b67a', '#fff0c8'), M('#c9b2f0', '#bba2e6', '#efe2ff')],
    path: M('#f0dcae', '#e4cf9c', '#fff4d6'),
    water: { deep: '#2f7fe0', shallow: '#5fb8ff', foam: '#eaf6ff' },
    cliff: { left: '#c79a5e', right: '#9c7444', strata: ['#ad8350', '#8c663c', '#6e4e2e'], under: '#4a3420' },
    bridge: '#c08a50', stone: '#f2e6c8', stone2: '#c8b48a', accent: '#ffb627', accent2: '#4c7dff', glow: '#fff1b0',
    props: [{ key: 'tree-round', w: 4 }, { key: 'bush', w: 3 }, { key: 'flowers', w: 3 }, { key: 'blocks', w: 3 }, { key: 'banner', w: 1 }, { key: 'rock', w: 1 }],
    plaza: ['banner', 'blocks', 'lamp'],
    particles: 'sparks', gate: 'bars', station: 'scroll', companion: 'digit', startSaturation: -0.45,
    music: { root: 62, scale: [0, 2, 4, 5, 7, 9, 11], tempo: 96, lead: 'square', pad: 'triangle', mood: 'playful' },
  },
  egypt: {
    id: 'egypt', name: 'Ancient Egypt',
    sky: ['#ffb36b', '#ffd9a0', '#fff1d0'],
    ground: M('#ecc77e', '#e2bb70', '#f8dfa8'),
    zoneMats: [M('#d9b46a', '#cfa95f', '#f4d9a0'), M('#8fcb68', '#82c05c', '#c8ee9a'), M('#e6c48a', '#dbb77c', '#fff0c8'), M('#d8a868', '#cd9c5c', '#f6d49c')],
    path: M('#f5dcaa', '#ebcf98', '#fff0cc'),
    water: { deep: '#1f9fb0', shallow: '#3fd6d0', foam: '#e6fffb' },
    cliff: { left: '#d09a5a', right: '#a8743e', strata: ['#b8844a', '#9a6a38', '#7a522a'], under: '#523620' },
    bridge: '#a87a48', stone: '#f0d8a0', stone2: '#c8a468', accent: '#2ec4b6', accent2: '#ffcc33', glow: '#fff0b0',
    props: [{ key: 'palm', w: 4 }, { key: 'rock', w: 3 }, { key: 'pot', w: 2 }, { key: 'reeds', w: 3 }, { key: 'column', w: 1 }],
    plaza: ['pot', 'column', 'reeds'],
    particles: 'dust', gate: 'bars', station: 'scroll', companion: 'scarab', startSaturation: -0.45,
    music: { root: 57, scale: [0, 1, 4, 5, 7, 8, 10], tempo: 80, lead: 'triangle', pad: 'sine', mood: 'mysterious' },
  },
  ocean: {
    id: 'ocean', name: 'Ocean World',
    sky: ['#0a5a8a', '#1a8fbf', '#7fe0f0'],
    ground: M('#e8d9a2', '#dccd94', '#fff2c8'),
    zoneMats: [M('#7fd0a8', '#72c49c', '#c8ffe4'), M('#f0b4b8', '#e6a6ab', '#ffe0e2'), M('#9ad8d0', '#8ccdc4', '#d6fffa'), M('#d6c4f0', '#c8b4e6', '#f2e8ff')],
    path: M('#f6ead0', '#ecdfc0', '#ffffff'),
    water: { deep: '#0d4f8a', shallow: '#1f88c8', foam: '#c8f4ff' },
    cliff: { left: '#c8a878', right: '#9c8058', strata: ['#a88a60', '#8a6e4a', '#6a5236'], under: '#3a2c20' },
    bridge: '#a87a50', stone: '#e8f0e8', stone2: '#a8c0b8', accent: '#ff8a65', accent2: '#2fa4ff', glow: '#b8fff4',
    props: [{ key: 'kelp', w: 5 }, { key: 'coral', w: 5 }, { key: 'rock', w: 2 }, { key: 'shell', w: 2 }, { key: 'anemone', w: 3 }],
    plaza: ['shell', 'anemone', 'coral'],
    particles: 'bubbles', gate: 'field', station: 'shell', companion: 'bubble', startSaturation: -0.5,
    music: { root: 55, scale: [0, 2, 4, 7, 9], tempo: 68, lead: 'sine', pad: 'sine', mood: 'wonder' },
  },
  lab: {
    id: 'lab', name: 'Science Lab',
    sky: ['#2a1f5a', '#5a3f9a', '#c8a8ff'],
    ground: M('#dfeef2', '#d2e4ea', '#ffffff'),
    zoneMats: [M('#bfe8f0', '#b0dce6', '#ffffff'), M('#e0ccff', '#d4bdf8', '#ffffff'), M('#c8f0d8', '#b8e6ca', '#ffffff'), M('#ffe0b8', '#f6d2a6', '#ffffff')],
    path: M('#a8e8f0', '#98dce6', '#e6ffff'),
    water: { deep: '#18a868', shallow: '#5ff0a0', foam: '#e6ffe8' },
    cliff: { left: '#9aa8c8', right: '#6e7ca0', strata: ['#7e8cb0', '#626e92', '#4a5476'], under: '#2a3048' },
    bridge: '#8e9ac0', stone: '#e8eef8', stone2: '#a8b4cc', accent: '#c86bfa', accent2: '#3ddc97', glow: '#e8c8ff',
    props: [{ key: 'beaker', w: 3 }, { key: 'crate', w: 3 }, { key: 'pottedplant', w: 3 }, { key: 'lamp', w: 2 }, { key: 'coil', w: 1 }, { key: 'pipe', w: 2 }],
    plaza: ['beaker', 'lamp', 'pottedplant'],
    particles: 'sparks', gate: 'field', station: 'panel', companion: 'sparky', startSaturation: -0.45,
    music: { root: 60, scale: [0, 2, 3, 5, 7, 9, 10], tempo: 90, lead: 'triangle', pad: 'triangle', mood: 'playful' },
  },
};

export function kitFor(id: string | undefined | null): Kit {
  return (id && (KITS as Record<string, Kit>)[id]) || KITS.forest;
}
