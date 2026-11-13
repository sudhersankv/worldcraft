import type { TemplateId } from '../shared/contracts';
import { islandSVG } from './art';
import { islandThumbs } from './diorama';

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface WorldMeta { id: TemplateId; name: string; blurb: string; npcs: string; companion: string; accent: string }
export const WORLDS: WorldMeta[] = [
  { id: 'forest', name: 'Enchanted Forest', blurb: 'Mushroom huts, a sunlight tower and a bloom that needs saving.', npcs: 'Sunny, Wally, Oakley', companion: 'Sprout', accent: 'var(--w-forest)' },
  { id: 'space', name: 'Space Station', blurb: 'Docking bays, hologram planets and a console waiting for power.', npcs: 'Captain Nova, Orbit, Zig', companion: 'Beep', accent: 'var(--w-space)' },
  { id: 'math', name: 'Math Kingdom', blurb: 'A castle town of towers, markets and puzzle gates.', npcs: 'Professor Pi, Sir Fraction, Mira', companion: 'Digit', accent: 'var(--w-math)' },
  { id: 'egypt', name: 'Ancient Egypt', blurb: 'Sandstone streets, an oasis and an archive to open.', npcs: 'Nefru, Khepri, Amina', companion: 'Scarab', accent: 'var(--w-egypt)' },
  { id: 'ocean', name: 'Ocean World', blurb: 'Coral reefs, a shipwreck and caves that light up.', npcs: 'Tilly, Coral Guardian, Finn', companion: 'Bubble', accent: 'var(--w-ocean)' },
  { id: 'lab', name: 'Science Lab', blurb: 'Bubbling stations and a big machine to restart.', npcs: 'Professor Proton, Atom, Dr. Bubbles', companion: 'Sparky', accent: 'var(--w-lab)' },
];
export const worldMeta = (id: string): WorldMeta => WORLDS.find((w) => w.id === id) ?? WORLDS[0];

export const playUrl = (worldId: string) => `/play.html?world=${encodeURIComponent(worldId)}`;

let toastTimer = 0;
export function toast(msg: string, kind: 'ok' | 'warn' = 'ok') {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.append(el); }
  el.className = `toast toast-${kind} show`;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 2600);
}

export function confetti(origin?: HTMLElement) {
  if (reducedMotion()) return;
  const r = origin?.getBoundingClientRect();
  const x0 = r ? r.left + r.width / 2 : innerWidth / 2;
  const y0 = r ? r.top + r.height / 3 : innerHeight / 3;
  const colors = ['var(--sun)', 'var(--berry)', 'var(--mint)', 'var(--sky)', 'var(--w-lab)', 'var(--coral)'];
  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    const ang = Math.random() * Math.PI * 2;
    const dist = 120 + Math.random() * 260;
    p.style.left = `${x0}px`; p.style.top = `${y0}px`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(ang) * dist - 120}px`);
    p.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    p.style.animationDelay = `${Math.random() * 120}ms`;
    if (i % 3 === 0) p.style.borderRadius = '50%';
    layer.append(p);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 1800);
}

/** Friendly wording for fetch failures. */
export function friendly(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  if (/Failed to fetch|NetworkError|ECONNREFUSED/.test(m) || /^50[234]$/.test(m)) return 'Can\'t reach the CuriosityCraft server. Start it, then try again.';
  if (m === '500') return 'The server hit an error. Try again.';
  if (m === '404') return 'Not found.';
  if (/timed? ?out|TimeoutError|aborted/i.test(m)) return 'Timed out. Try again, or use a sample lesson.';
  return m;
}

/** Make an element tilt toward the pointer (3D sticker tilt). */
export function tilt(el: HTMLElement, max = 10) {
  if (reducedMotion()) return;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${x * max * 2}deg`);
    el.style.setProperty('--rx', `${-y * max}deg`);
  });
  el.addEventListener('pointerleave', () => { el.style.setProperty('--ry', '0deg'); el.style.setProperty('--rx', '0deg'); });
}

/** <img> placeholder for a 3D island portrait; call hydrateThumbs(root) after inserting. */
export const thumb = (t: TemplateId, alt = '') => `<img class="thumb" data-thumb="${t}" alt="${esc(alt)}" width="420" height="360" decoding="async"/>`;
export function hydrateThumbs(root: ParentNode = document) {
  const imgs = $$<HTMLImageElement>('img[data-thumb]:not([src])', root);
  if (!imgs.length) return;
  const svgFallback = (t: TemplateId) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(islandSVG(t).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
  islandThumbs().then(
    (m) => imgs.forEach((i) => { i.src = m[i.dataset.thumb as TemplateId] ?? svgFallback(i.dataset.thumb as TemplateId); }),
    () => imgs.forEach((i) => { i.src = svgFallback(i.dataset.thumb as TemplateId); }),
  );
}
