/** DOM overlay: HUD, modal stack with keyboard/gamepad focus navigation, voice bar, figures. */
import './ui.css';
import type { Question } from '../../shared/contracts';

type Child = Node | string | null | undefined | false;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export interface VoiceBar { el: HTMLElement; input: HTMLInputElement; setLevel(v: number): void; setInterim(t: string): void; setState(s: string): void; setLive(on: boolean): void }

export class UI {
  root = document.getElementById('ui')!;
  tracker = h('div', { id: 'tracker', class: 'sticker passive' });
  top = h('div', { id: 'topbtns' });
  banner = h('div', { id: 'banner', class: 'sticker' });
  toastEl = h('div', { id: 'toast', class: 'sticker' });
  prompt = h('div', { id: 'prompt', class: 'sticker' });
  arrow = h('div', { id: 'arrow' });
  bubble = h('div', { id: 'bubble', class: 'sticker' });
  goatCard = h('div', { id: 'goatcard', class: 'sticker' });
  hint = h('div', { id: 'controlsHint' });
  stack: HTMLElement[] = [];
  dialogue: HTMLElement | null = null;
  voiceBar: VoiceBar | null = null;
  private bannerT = 0; private toastT = 0; private bubbleT = 0;

  constructor() {
    this.arrow.innerHTML = '<svg viewBox="0 0 44 44" width="44" height="44"><path d="M22 4 L38 34 L22 27 L6 34 Z" fill="#ffc93c" stroke="#1f1633" stroke-width="3" stroke-linejoin="round"/></svg>';
    this.root.append(this.tracker, this.top, this.banner, this.toastEl, this.prompt, this.arrow, this.bubble, this.goatCard, this.hint);
  }

  get modal() { return this.stack.length > 0 || !!this.dialogue; }

  topButtons(btns: { label: string; key: string; on: () => void }[]) {
    this.top.replaceChildren(...btns.map((b) => h('button', { class: 'btn', onclick: (e: Event) => { (e.currentTarget as HTMLElement).blur(); b.on(); }, title: b.label }, b.label, ' ', h('kbd', {}, b.key))));
  }

  showBanner(kicker: string, name: string) {
    this.banner.replaceChildren(h('div', { class: 'k' }, kicker), h('div', { class: 'n' }, name));
    this.banner.classList.add('show');
    clearTimeout(this.bannerT); this.bannerT = window.setTimeout(() => this.banner.classList.remove('show'), 2600);
  }
  toast(text: string, good = false, ms = 3200) {
    this.toastEl.textContent = text; this.toastEl.className = `sticker show${good ? ' good' : ''}`;
    clearTimeout(this.toastT); this.toastT = window.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
  showPrompt(x: number, y: number, key: string, label: string | null) {
    if (!label) { this.prompt.classList.remove('show'); return; }
    if (this.prompt.dataset.l !== label + key) { this.prompt.replaceChildren(h('kbd', {}, key), label); this.prompt.dataset.l = label + key; }
    this.prompt.style.left = `${x}px`; this.prompt.style.top = `${y}px`; this.prompt.classList.add('show');
  }
  say(name: string, text: string, ms = 5200) {
    this.bubble.replaceChildren(h('b', {}, name), text);
    this.bubble.classList.add('show');
    clearTimeout(this.bubbleT); this.bubbleT = window.setTimeout(() => this.bubble.classList.remove('show'), ms);
  }
  placeBubble(x: number, y: number) { this.bubble.style.left = `${Math.max(160, Math.min(innerWidth - 160, x))}px`; this.bubble.style.top = `${Math.max(120, y)}px`; }
  setArrow(x: number | null, y = 0, angle = 0) {
    if (x === null) { this.arrow.classList.remove('show'); return; }
    this.arrow.classList.add('show');
    this.arrow.style.left = `${x}px`; this.arrow.style.top = `${y}px`; this.arrow.style.transform = `rotate(${angle + Math.PI / 2}rad)`;
  }

  // --------------------------------------------------- modals
  open(content: HTMLElement, opts: { veil?: boolean } = {}): HTMLElement {
    const wrap = opts.veil === false ? content : h('div', { class: 'veil' }, content);
    this.root.append(wrap); this.stack.push(wrap);
    setTimeout(() => this.focusFirst(wrap), 30);
    return wrap;
  }
  close(el?: HTMLElement) {
    const target = el ?? this.stack[this.stack.length - 1];
    if (!target) return;
    this.stack = this.stack.filter((s) => s !== target);
    target.remove();
    const nt = this.stack[this.stack.length - 1] ?? this.dialogue;
    if (nt) this.focusFirst(nt); else (document.activeElement as HTMLElement | null)?.blur?.();
  }
  closeAll() { while (this.stack.length) this.close(); }
  topEl(): HTMLElement | null { return this.stack[this.stack.length - 1] ?? this.dialogue; }
  focusables(el: HTMLElement): HTMLElement[] {
    return [...el.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"], a[href]')].filter((e) => e.offsetParent !== null);
  }
  focusFirst(el: HTMLElement) {
    const def = el.querySelector<HTMLElement>('[data-default]');
    const f = def && def.offsetParent !== null ? def : this.focusables(el).find((e) => e.tagName === 'BUTTON');
    f?.focus({ preventScroll: true });
  }
  nav(dir: 'up' | 'down' | 'left' | 'right') {
    const el = this.topEl(); if (!el) return;
    const list = this.focusables(el); if (!list.length) return;
    const cur = list.indexOf(document.activeElement as HTMLElement);
    const step = dir === 'up' || dir === 'left' ? -1 : 1;
    const next = cur < 0 ? 0 : (cur + step + list.length) % list.length;
    list[next].focus();
  }
  activate() {
    const el = this.topEl(); if (!el) return;
    const a = document.activeElement as HTMLElement | null;
    if (a && el.contains(a) && a.tagName === 'BUTTON') { a.click(); return; }
    el.querySelector<HTMLElement>('[data-default]')?.click();
  }

  // --------------------------------------------------- shared widgets
  typewriter(el: HTMLElement, text: string, reduced: boolean, onTick?: () => void): Promise<void> {
    el.textContent = '';
    if (reduced) { el.textContent = text; return Promise.resolve(); }
    return new Promise((res) => {
      let i = 0;
      const tick = () => {
        if (!el.isConnected) return res();
        i = Math.min(text.length, i + 2);
        el.textContent = text.slice(0, i);
        if (i % 6 === 0) onTick?.();
        if (i >= text.length) res(); else setTimeout(tick, 22);
      };
      el.onclick = () => { i = text.length; };
      tick();
    });
  }

  makeVoiceBar(opts: { placeholder: string; micAvailable: boolean; onSend: (t: string) => void; onMic: () => void }): VoiceBar {
    const cv = h('canvas', { width: 180, height: 68 });
    const g = cv.getContext('2d')!;
    const levels: number[] = new Array(30).fill(0.02);
    const mic = h('button', { class: `mic${opts.micAvailable ? '' : ' off'}`, title: opts.micAvailable ? 'Microphone (V to hold)' : 'Microphone unavailable: type instead', 'aria-label': 'Microphone', onclick: opts.onMic, html: '<svg width="22" height="22" viewBox="0 0 24 24"><rect x="8" y="2" width="8" height="13" rx="4" fill="#1f1633"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4" stroke="#1f1633" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>' });
    const state = h('span', { class: 'state' }, opts.micAvailable ? 'READY' : 'TYPE');
    const interim = h('span', { class: 'interim' });
    const input = h('input', { type: 'text', placeholder: opts.placeholder, 'aria-label': opts.placeholder });
    const send = h('button', { class: 'btn primary icon', title: 'Send', onclick: () => { const v = input.value.trim(); if (v) { opts.onSend(v); input.value = ''; } } }, 'Send');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send.click(); } e.stopPropagation(); });
    const draw = () => {
      g.clearRect(0, 0, 180, 68);
      levels.forEach((l, i) => { const hh = Math.max(4, l * 60); g.fillStyle = i > 24 ? '#ff5d8f' : '#4cc9f0'; g.beginPath(); g.roundRect(i * 6, 34 - hh / 2, 4, hh, 2); g.fill(); });
    };
    draw();
    const el = h('div', { class: 'voicebar' }, mic, cv, state, interim, input, send);
    const bar: VoiceBar = {
      el, input,
      setLevel: (v) => { levels.push(Math.min(1, v * 3)); levels.shift(); draw(); },
      setInterim: (t) => { interim.textContent = t; },
      setState: (s) => { state.textContent = s.toUpperCase(); },
      setLive: (on) => { mic.classList.toggle('live', on); },
    };
    this.voiceBar = bar;
    return bar;
  }

  /** Choice buttons; returns the container. */
  choices(q: Question, onPick: (i: number, btn: HTMLButtonElement) => void, order?: number[]): HTMLElement {
    const idx = order ?? q.choices.map((_, i) => i);
    return h('div', { class: 'choices' }, ...idx.map((i, k) => {
      const b = h('button', { class: 'btn choice' }, h('span', { class: 'n' }, String(k + 1)), q.choices[i]);
      b.addEventListener('click', () => onPick(i, b));
      return b;
    }));
  }
}

/** Little SVG diagrams for study cards, built from key terms. */
export function figureSvg(kind: string | undefined, terms: string[], title: string, accent: string): string | null {
  const t = terms.slice(0, 5).map((s) => esc(s));
  const box = (x: number, y: number, w: number, label: string, fill: string) => `<g><rect x="${x - w / 2}" y="${y - 20}" width="${w}" height="40" rx="12" fill="${fill}" stroke="#1f1633" stroke-width="3"/><text x="${x}" y="${y + 6}" text-anchor="middle" font-family="Atkinson Hyperlegible, sans-serif" font-weight="700" font-size="16" fill="#1f1633">${label}</text></g>`;
  const arrowDef = `<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#1f1633"/></marker></defs>`;
  if (kind === 'arrow-in-out' && t.length) {
    const ins = t.slice(0, Math.min(3, t.length));
    const out = t.slice(3);
    let s = `<svg viewBox="0 0 560 190" width="100%" style="max-width:560px">${arrowDef}`;
    ins.forEach((x, i) => { const y = 35 + i * 60; s += box(95, y, 160, x, '#fff7e8') + `<line x1="178" y1="${y}" x2="232" y2="95" stroke="#1f1633" stroke-width="3" marker-end="url(#ah)"/>`; });
    s += `<circle cx="290" cy="95" r="54" fill="${accent}" stroke="#1f1633" stroke-width="3"/><text x="290" y="90" text-anchor="middle" font-family="Jersey 10, sans-serif" font-size="22" fill="#1f1633">${esc(title.split(' ').slice(0, 2).join(' '))}</text><text x="290" y="112" text-anchor="middle" font-family="Jersey 10, sans-serif" font-size="22" fill="#1f1633">${esc(title.split(' ').slice(2, 4).join(' '))}</text>`;
    if (out.length) out.forEach((x, i) => { const y = 60 + i * 60; s += `<line x1="346" y1="95" x2="392" y2="${y}" stroke="#1f1633" stroke-width="3" marker-end="url(#ah)"/>` + box(475, y, 150, x, '#d8f8e8'); });
    return s + '</svg>';
  }
  if (kind === 'cycle' && t.length >= 2) {
    const n = Math.max(3, t.length); const cx = 280, cy = 110, r = 80;
    let s = `<svg viewBox="0 0 560 230" width="100%" style="max-width:560px">${arrowDef}<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1f1633" stroke-width="3" stroke-dasharray="8 8"/>`;
    const labels = t.length >= 3 ? t : [...t, esc(title)];
    labels.slice(0, n).forEach((x, i) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; s += box(cx + Math.cos(a) * (r + 60), cy + Math.sin(a) * (r - 10), 150, x, i % 2 ? '#d8f8e8' : '#fff7e8'); });
    return s + '</svg>';
  }
  if (kind === 'ordered-list' && t.length) {
    let s = `<svg viewBox="0 0 ${t.length * 180} 70" width="100%" style="max-width:${t.length * 180}px">${arrowDef}`;
    t.forEach((x, i) => { s += box(90 + i * 180, 35, 150, `${i + 1}. ${x}`, i % 2 ? '#d8f8e8' : '#fff7e8'); if (i < t.length - 1) s += `<line x1="${167 + i * 180}" y1="35" x2="${190 + i * 180}" y2="35" stroke="#1f1633" stroke-width="3" marker-end="url(#ah)"/>`; });
    return s + '</svg>';
  }
  if (kind === 'compare' && t.length >= 2) {
    return `<svg viewBox="0 0 520 80" width="100%" style="max-width:520px">${box(130, 40, 220, t[0], '#fff7e8')}<text x="260" y="48" text-anchor="middle" font-family="Jersey 10" font-size="28">vs</text>${box(390, 40, 220, t[1], '#d8f8e8')}</svg>`;
  }
  return null;
}
