/** Curiosity Craft — Wonder Board: a chalkboard easel with magic gel pens, water / rainbow / glitter brushes and stamps.
 *  Draw, say or type what you wonder about → 3 question cards + a destination on the island. Standalone; the game passes a host. */
import './panels.css';

export interface WonderStarter { id: string; label: string; emoji?: string; icon?: string; questions: string[]; area: string }
export interface WonderHost {
  root: HTMLElement; t: (k: string, fb: string) => string;
  starters(): Promise<WonderStarter[]>;
  submit(input: { image?: string; text?: string }): Promise<{ guess: string; confidence: number; guesses: string[]; questions: string[]; worldTag: string; npc?: string; area?: string }>;
  listen?(onText: (interim: string) => void): Promise<string>;
  onPick(q: { question: string; area: string; guess?: string; starterId?: string }): void;
  onClose(): void; onEvent?(name: string, data: Record<string, unknown>): void;
}
type Res = Awaited<ReturnType<WonderHost['submit']>>;

const ART = '/art/cc';
const ICONS: Record<string, string> = { wave: `${ART}/icons/wave.webp`, surfboard: `${ART}/icons/surfboard.webp`, sun: `${ART}/icons/sun.webp`, fish: `${ART}/icons/fish.webp`, sand: `${ART}/icons/sand.webp`, wind: `${ART}/icons/wind.webp` };
const AREAS: Record<string, { name: string; npc: string; emoji: string }> = {
  beach: { name: 'Sunny Surf Beach', npc: 'Surfer Sam', emoji: '🏄' },
  volcano: { name: 'Ember Peak', npc: 'Rocky the Lava Golem', emoji: '🌋' },
  ice: { name: 'Frostbite Cave', npc: 'Penny the Penguin', emoji: '🐧' },
  jungle: { name: 'Whispering Jungle', npc: 'Fern the Frog', emoji: '🐸' },
};
const areaKey = (a?: string) => { const s = (a || '').toLowerCase(); return s.includes('volc') || s.includes('ember') || s.includes('lava') ? 'volcano' : s.includes('ice') || s.includes('frost') || s.includes('snow') ? 'ice' : s.includes('jungle') || s.includes('forest') ? 'jungle' : 'beach'; };
const STATIC_STARTERS: WonderStarter[] = [
  { id: 'wave', label: 'Waves', questions: ['Why do waves crash on the beach?', 'Where do waves come from?', 'Why are some waves so big?'], area: 'beach' },
  { id: 'surfboard', label: 'Surfboards', questions: ['Why does a surfboard float?', 'Why are surfboards so long?', 'What are surfboards made of?'], area: 'beach' },
  { id: 'sun', label: 'The Sun', questions: ['Why is the sand so hot?', 'Why is the sky blue?', 'Where does the sun go at night?'], area: 'beach' },
  { id: 'fish', label: 'Fish', questions: ['How do fish breathe underwater?', 'Why is the sea salty?', 'Why do fish swim in groups?'], area: 'beach' },
  { id: 'volc', emoji: '🌋', label: 'Volcanoes', questions: ['Why do volcanoes erupt?', 'What is lava made of?', 'Why is lava so hot?'], area: 'volcano' },
  { id: 'ice', emoji: '🐧', label: 'Ice', questions: ['Why does ice float?', 'Why is ice slippery?', 'How do penguins stay warm?'], area: 'ice' },
];

type Tool = 'gel' | 'marker' | 'rainbow' | 'water' | 'glitter' | 'eraser' | 'stamp';
interface Pt { x: number; y: number; p: number }
interface Stroke { tool: Tool; color: string; size: number; pts: Pt[]; stamp?: string; seed: number }

const SWATCHES = ['#ffffff', '#ffd23c', '#ff9a3c', '#ff5a6e', '#ff7ae0', '#b18cff', '#4fc3ff', '#4fe0c8', '#5ee06a', '#a8743f'];
const EMOJI_STAMPS = ['⭐', '🐚', '🦀', '🌋', '🐧', '🌴', '❓', '❤️'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', attrs: Record<string, string> = {}, ...kids: (Node | string | null)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (tag === 'button') (e as HTMLButtonElement).type = 'button';
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const k of kids) if (k !== null) e.append(k);
  return e;
}
const rnd = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function lighten(hex: string, f: number) { const n = parseInt(hex.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * f)); return `rgb(${c[0]},${c[1]},${c[2]})`; }
const isUrl = (s?: string) => !!s && /^(\/|https?:|data:)/.test(s);

let actx: AudioContext | null = null;
function whoosh() {
  try {
    actx = actx || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const a = actx, d = 0.55, buf = a.createBuffer(1, Math.floor(a.sampleRate * d), a.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.sin((i / ch.length) * Math.PI);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(300, a.currentTime); f.frequency.exponentialRampToValueAtTime(3200, a.currentTime + d);
    const g = a.createGain(); g.gain.value = 0.09;
    src.connect(f).connect(g).connect(a.destination); src.start();
  } catch { /* audio is optional */ }
}
function blip(freq = 660) {
  try {
    actx = actx || new AudioContext();
    const o = actx.createOscillator(), g = actx.createGain(); o.type = 'triangle'; o.frequency.value = freq;
    o.frequency.exponentialRampToValueAtTime(freq * 1.5, actx.currentTime + 0.08);
    g.gain.setValueAtTime(0.05, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.18);
    o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.2);
  } catch { /* optional */ }
}

const TOOL_SVG: Record<string, string> = {
  gel: '<svg viewBox="0 0 32 32"><defs><radialGradient id="ccxg" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#ff8ad8"/><stop offset="1" stop-color="#b0208a"/></radialGradient></defs><rect x="11" y="3" width="10" height="22" rx="5" fill="url(#ccxg)" stroke="#1d1a3a" stroke-width="2.5"/><path d="M13 25l3 5 3-5z" fill="#1d1a3a"/><rect x="13" y="6" width="2.5" height="12" rx="1.2" fill="#fff" opacity=".8"/></svg>',
  marker: '<svg viewBox="0 0 32 32"><rect x="10" y="4" width="12" height="18" rx="2" fill="#4fc3ff" stroke="#1d1a3a" stroke-width="2.5"/><path d="M12 22h8l-2 7h-4z" fill="#fff" stroke="#1d1a3a" stroke-width="2.5"/></svg>',
  eraser: '<svg viewBox="0 0 32 32"><path d="M5 20l11-12 11 9-9 9H11z" fill="#ff9ab0" stroke="#1d1a3a" stroke-width="2.5" stroke-linejoin="round"/><path d="M5 20l6 6" stroke="#1d1a3a" stroke-width="2.5"/></svg>',
};

export function openWonderBoard(host: WonderHost): { close(): void } {
  const t = host.t;
  const ev = (n: string, d: Record<string, unknown> = {}) => { try { host.onEvent?.(n, d); } catch { /* ignore */ } };
  let closed = false, raf = 0;

  // ---------------------------------------------------------------- shell
  const ov = el('div', 'ccx-ov', { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('wb.title', 'Wonder Board'), 'data-testid': 'wonder-board' });
  const xBtn = el('button', 'ccx-x', { 'aria-label': t('ui.close', 'Close'), 'data-testid': 'wonder-close' }, '✕');
  const head = el('div', 'ccx-head', {}, el('img', 'ccx-mark', { src: `${ART}/logo-mark.webp`, alt: '' }),
    el('h2', 'ccx-title', {}, el('span', 'ccx-kick', {}, t('wb.kicker', 'Wonder Board')), t('wonder.titleAny', 'What do you wonder about? Draw anything!')), xBtn);
  const body = el('div', 'ccx-body');
  const panel = el('div', 'ccx-panel ccx-wb', {}, head, body);
  ov.append(panel);

  // ---------------------------------------------------------------- tools
  let tool: Tool = 'gel', color = '#ffd23c', size = 14, stampKey = 'wave';
  const toolDefs: { id: Tool; label: string; icon: string; cls?: string }[] = [
    { id: 'gel', label: t('wb.tool.gel', 'Gel pen'), icon: TOOL_SVG.gel, cls: 'gel' },
    { id: 'rainbow', label: t('wb.tool.rainbow', 'Rainbow'), icon: '🌈', cls: 'rainbow' },
    { id: 'water', label: t('wb.tool.water', 'Water'), icon: '💧', cls: 'water' },
    { id: 'glitter', label: t('wb.tool.glitter', 'Sparkle'), icon: '✨', cls: 'glitter' },
    { id: 'marker', label: t('wb.tool.marker', 'Marker'), icon: TOOL_SVG.marker },
    { id: 'stamp', label: t('wb.tool.stamp', 'Stamps'), icon: '🐚' },
    { id: 'eraser', label: t('wb.tool.eraser', 'Eraser'), icon: TOOL_SVG.eraser },
  ];
  const tools = el('div', 'ccx-tools', { role: 'toolbar', 'aria-label': t('wb.tools', 'Drawing tools') });
  const toolBtns = new Map<Tool, HTMLButtonElement>();
  for (const d of toolDefs) {
    const ti = el('span', 'ti'); ti.innerHTML = d.icon;
    const b = el('button', `ccx-tool ${d.cls ?? ''}${d.id === tool ? ' on' : ''}`, { 'aria-pressed': String(d.id === tool), 'data-testid': `tool-${d.id}`, title: d.label }, ti, d.label);
    b.onclick = () => setTool(d.id);
    toolBtns.set(d.id, b); tools.append(b);
  }
  function setTool(id: Tool) {
    tool = id; blip(520 + Object.keys(TOOL_SVG).length * 20);
    toolBtns.forEach((b, k) => { b.classList.toggle('on', k === id); b.setAttribute('aria-pressed', String(k === id)); });
    stampRow.style.display = id === 'stamp' ? '' : 'none';
    sws.style.display = id === 'stamp' || id === 'eraser' || id === 'rainbow' ? 'none' : '';
  }

  // stamps
  const stampImgs = new Map<string, HTMLImageElement>();
  const stampRow = el('div', 'ccx-stamps', { role: 'group', 'aria-label': t('wb.stamps', 'Stamps') });
  stampRow.style.display = 'none';
  const allStamps = [...Object.keys(ICONS), ...EMOJI_STAMPS];
  for (const k of allStamps) {
    const isImg = !!ICONS[k];
    if (isImg) { const im = new Image(); im.src = ICONS[k]; im.onload = () => redrawCommitted(); stampImgs.set(k, im); }
    const b = el('button', `ccx-stamp${k === stampKey ? ' on' : ''}`, { 'aria-label': k }, isImg ? el('img', '', { src: ICONS[k], alt: '' }) : k);
    b.onclick = () => { stampKey = k; stampRow.querySelectorAll('.ccx-stamp').forEach((x) => x.classList.remove('on')); b.classList.add('on'); blip(880); };
    stampRow.append(b);
  }

  // easel + canvases
  const base = el('canvas', '', { 'data-testid': 'wonder-canvas', 'aria-label': t('wb.canvas', 'Drawing board') });
  const fx = el('canvas', '');
  fx.style.pointerEvents = 'none';
  const hint = el('div', 'ccx-hint-draw', {}, el('div', '', {}, t('wb.drawHere', 'Draw what you wonder about!'), el('span', '', {}, t('wb.drawSub', 'A wave? A volcano? A penguin? Anything!'))));
  const board = el('div', 'ccx-board', {}, base, fx, hint);
  const easel = el('div', 'ccx-easel', {}, board);
  const committed = document.createElement('canvas');
  const gB = base.getContext('2d')!, gF = fx.getContext('2d')!, gC = committed.getContext('2d')!;
  let W = 640, H = 480, dpr = 1;

  // palette row
  const sws = el('div', 'ccx-sws', { role: 'radiogroup', 'aria-label': t('wb.colors', 'Colours') });
  for (const c of SWATCHES) {
    const s = el('button', `ccx-sw${c === color ? ' on' : ''}`, { 'aria-label': c, role: 'radio', 'aria-checked': String(c === color) });
    s.style.background = c;
    s.onclick = () => { color = c; sws.querySelectorAll('.ccx-sw').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); }); s.classList.add('on'); s.setAttribute('aria-checked', 'true'); if (tool === 'eraser' || tool === 'stamp') setTool('gel'); };
    sws.append(s);
  }
  const sizeIn = el('input', '', { type: 'range', min: '4', max: '40', value: String(size), 'aria-label': t('wb.size', 'Brush size') }) as HTMLInputElement;
  const dotI = el('i'); const sizeDot = el('span', 'dot', {}, dotI);
  const syncDot = () => { const d = Math.max(4, Math.min(26, size * 0.65)); dotI.style.width = dotI.style.height = `${d}px`; };
  sizeIn.oninput = () => { size = Number(sizeIn.value); syncDot(); };
  syncDot();
  const undoB = el('button', 'ccx-btn ccx-mini', { 'aria-label': t('wonder.undo', 'Undo'), title: t('wonder.undo', 'Undo') }, '↶');
  const redoB = el('button', 'ccx-btn ccx-mini', { 'aria-label': t('wb.redo', 'Redo'), title: t('wb.redo', 'Redo') }, '↷');
  const clearB = el('button', 'ccx-btn ccx-mini coral', { 'data-testid': 'wonder-clear' }, '🧹 ', t('wonder.clear', 'Clear'));
  const palette = el('div', 'ccx-palette', {}, sws, el('label', 'ccx-size', {}, sizeDot, sizeIn), el('span', '', { style: 'flex:1' }), undoB, redoB, clearB);
  const left = el('div', 'ccx-wb-left', {}, tools, stampRow, easel, palette);

  // ---------------------------------------------------------------- right column: Sam, chips, say/type, submit
  const samLine = el('div', 'ccx-speech', {}, t('wb.samSays', 'Draw it, say it or type it. Every wonder is a good one, dude!'));
  const sam = el('div', 'ccx-wb-sam', {}, el('img', '', { src: `${ART}/sam-happy.webp`, alt: 'Sam' }), samLine);
  const chips = el('div', 'ccx-chips', { 'aria-busy': 'true' });
  for (let i = 0; i < 6; i++) chips.append(el('div', 'ccx-skel'));
  const chipCard = el('div', 'ccx-card-w', {}, el('h3', 'ccx-h', {}, t('wb.wonderAbout', 'Wonder about…')), chips);
  const mic = el('button', 'ccx-btn ccx-mic', { 'data-testid': 'wonder-mic', 'aria-label': t('wb.say', 'Say it') }, '🎤 ', t('wb.say', 'Say it'));
  const input = el('input', 'ccx-input', { type: 'text', placeholder: t('wonder.placeholder', 'Or type: I wonder…'), 'data-testid': 'wonder-text', enterkeyhint: 'go', maxlength: '160', 'aria-label': t('wb.type', 'Type it') }) as HTMLInputElement;
  const bubble = el('div', 'ccx-bubble', { 'aria-live': 'polite' });
  const sayCard = el('div', 'ccx-card-w', {}, el('h3', 'ccx-h', {}, t('wb.sayOrType', 'Say it or type it')), el('div', 'ccx-say', {}, mic, input), bubble);
  if (!host.listen) { mic.disabled = true; mic.title = t('npc.micError', 'Mic not available, type instead!'); }
  const status = el('div', 'ccx-status', { 'aria-live': 'polite' });
  const go = el('button', 'ccx-btn sun mega', { 'data-testid': 'wonder-submit' }, '✨ ', t('wonder.submit', 'I wonder!'));
  const right = el('div', 'ccx-wb-right', {}, sam, chipCard, sayCard, el('div', '', { style: 'flex:1' }), status, go);
  body.append(left, right);
  body.style.position = 'relative';
  host.root.append(ov);

  // ---------------------------------------------------------------- drawing model
  let strokes: Stroke[] = [];
  const undoStack: Stroke[][] = [], redoStack: Stroke[][] = [];
  let cur: Stroke | null = null;
  const live: { x: number; y: number; vx: number; vy: number; life: number; c: string; s: number }[] = [];
  const pushHistory = () => { undoStack.push(strokes.slice()); if (undoStack.length > 60) undoStack.shift(); redoStack.length = 0; syncHistory(); };
  const syncHistory = () => { undoB.disabled = !undoStack.length; redoB.disabled = !redoStack.length; hint.classList.toggle('gone', strokes.length > 0 || !!cur); };
  syncHistory();

  function resize() {
    const r = board.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    for (const c of [base, fx, committed]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    for (const g of [gB, gF, gC]) { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.lineCap = 'round'; g.lineJoin = 'round'; }
    redrawCommitted();
  }
  const ro = new ResizeObserver(() => resize());
  ro.observe(board);

  // points are stored normalised to the board (0..1) so resizes / rotations keep the drawing
  const P = (p: Pt) => ({ x: p.x * W, y: p.y * H });
  const widthAt = (s: Stroke, p: Pt) => s.size * (0.45 + p.p * 0.9) * Math.min(1.4, Math.max(0.7, W / 640));

  function smoothPath(g: CanvasRenderingContext2D, pts: Pt[], off = 0) {
    g.beginPath();
    const a = P(pts[0]); g.moveTo(a.x + off, a.y + off);
    if (pts.length === 1) { g.lineTo(a.x + off + 0.1, a.y + off); return; }
    for (let i = 1; i < pts.length - 1; i++) { const p = P(pts[i]), q = P(pts[i + 1]); g.quadraticCurveTo(p.x + off, p.y + off, (p.x + q.x) / 2 + off, (p.y + q.y) / 2 + off); }
    const z = P(pts[pts.length - 1]); g.lineTo(z.x + off, z.y + off);
  }
  /** per-segment quadratic curves so pressure can change the width along the stroke */
  function segments(g: CanvasRenderingContext2D, s: Stroke, wMul: number, style: (i: number) => string | CanvasGradient, off = 0) {
    const pts = s.pts;
    if (pts.length < 3) { g.lineWidth = widthAt(s, pts[0]) * wMul; g.strokeStyle = style(0); smoothPath(g, pts, off); g.stroke(); return; }
    let prev = P(pts[0]);
    for (let i = 1; i < pts.length - 1; i++) {
      const p = P(pts[i]), q = P(pts[i + 1]); const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      g.beginPath(); g.moveTo(prev.x + off, prev.y + off); g.quadraticCurveTo(p.x + off, p.y + off, mid.x + off, mid.y + off);
      g.lineWidth = widthAt(s, pts[i]) * wMul; g.strokeStyle = style(i); g.stroke();
      prev = mid;
    }
  }
  function renderStroke(g: CanvasRenderingContext2D, s: Stroke) {
    if (!s.pts.length) return;
    g.save();
    if (s.tool === 'eraser') {
      g.globalCompositeOperation = 'destination-out';
      segments(g, s, 1.8, () => '#000');
    } else if (s.tool === 'marker') {
      segments(g, s, 1, () => s.color);
    } else if (s.tool === 'gel') {
      // glowing jelly tube: glow halo, body, lighter core, glossy highlight
      g.shadowColor = s.color; g.shadowBlur = 14;
      segments(g, s, 1, () => s.color);
      g.shadowBlur = 0;
      segments(g, s, 0.62, () => lighten(s.color, 0.35));
      g.globalAlpha = 0.75;
      segments(g, s, 0.2, () => '#ffffff', -s.size * 0.16);
    } else if (s.tool === 'rainbow') {
      let dist = 0; const hue: number[] = [0];
      for (let i = 1; i < s.pts.length; i++) { const a = P(s.pts[i - 1]), b = P(s.pts[i]); dist += Math.hypot(b.x - a.x, b.y - a.y); hue.push(dist); }
      g.shadowBlur = 8; g.shadowColor = 'rgba(255,255,255,.5)';
      segments(g, s, 1, (i) => `hsl(${(hue[i] * 0.9 + s.seed) % 360} 95% 62%)`);
      g.shadowBlur = 0; g.globalAlpha = 0.45;
      segments(g, s, 0.25, () => '#fff', -s.size * 0.15);
    } else if (s.tool === 'water') {
      // watercolour: several soft translucent passes that bleed outward, then a darker pooled edge
      const r = rnd(s.seed);
      g.globalAlpha = 0.16; g.shadowColor = 'rgba(70,170,255,.8)'; g.shadowBlur = 18;
      for (let k = 0; k < 3; k++) segments(g, s, 1.5 + k * 0.35, () => 'rgba(80,175,255,1)', (r() - 0.5) * s.size * 0.5);
      g.shadowBlur = 0; g.globalAlpha = 0.28;
      segments(g, s, 1.05, () => 'rgba(40,140,240,1)');
      g.globalAlpha = 0.45;
      segments(g, s, 0.35, () => 'rgba(210,245,255,1)', -s.size * 0.12);
      g.globalAlpha = 0.5;
      for (let i = 0; i < s.pts.length; i += 6) { const p = P(s.pts[i]); const rr = widthAt(s, s.pts[i]) * (0.3 + r() * 0.5); g.fillStyle = 'rgba(120,200,255,.35)'; g.beginPath(); g.arc(p.x + (r() - 0.5) * s.size, p.y + (r() - 0.5) * s.size, rr, 0, 7); g.fill(); }
    } else if (s.tool === 'glitter') {
      const r = rnd(s.seed);
      g.globalAlpha = 0.35; segments(g, s, 0.5, () => s.color);
      g.globalAlpha = 1;
      const cols = [s.color, '#ffffff', '#ffe27a', lighten(s.color, 0.5)];
      for (const pt of s.pts) {
        const p = P(pt), w = widthAt(s, pt);
        for (let k = 0; k < 3; k++) {
          const x = p.x + (r() - 0.5) * w * 1.6, y = p.y + (r() - 0.5) * w * 1.6, rr = 0.8 + r() * 2.2;
          g.fillStyle = cols[Math.floor(r() * cols.length)];
          if (r() < 0.18) star(g, x, y, rr * 2.2); else { g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); }
        }
      }
    } else if (s.tool === 'stamp' && s.stamp) {
      const p = P(s.pts[0]), d = s.size * 3.2 * Math.min(1.4, Math.max(0.8, W / 640)), rot = (rnd(s.seed)() - 0.5) * 0.5;
      g.translate(p.x, p.y); g.rotate(rot);
      const im = stampImgs.get(s.stamp);
      g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowOffsetY = 3; g.shadowBlur = 4;
      if (im) { if (im.complete && im.naturalWidth) g.drawImage(im, -d / 2, -d / 2, d, d); }
      else { g.font = `${d * 0.85}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.stamp, 0, 0); }
    }
    g.restore();
  }
  function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, rr = i % 2 ? r * 0.35 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }
  function redrawCommitted() {
    gC.clearRect(0, 0, W, H);
    for (const s of strokes) renderStroke(gC, s);
    paintBase();
  }
  function paintBase() {
    gB.save(); gB.setTransform(1, 0, 0, 1, 0, 0); gB.clearRect(0, 0, base.width, base.height); gB.drawImage(committed, 0, 0); gB.restore();
    if (cur) renderStroke(gB, cur);
  }

  // ---------------------------------------------------------------- pointer input (pressure, pen / touch / mouse)
  const ptOf = (e: PointerEvent): Pt => {
    const r = base.getBoundingClientRect();
    const p = e.pointerType === 'mouse' || !e.pressure ? 0.55 : e.pointerType === 'touch' && e.pressure === 0.5 ? 0.6 : e.pressure;
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, p };
  };
  let dirty = false;
  base.addEventListener('pointerdown', (e) => {
    if (busy) return;
    e.preventDefault();
    const pt = ptOf(e);
    if (tool === 'stamp') {
      pushHistory();
      strokes.push({ tool, color, size, pts: [pt], stamp: stampKey, seed: (Math.random() * 1e9) | 0 });
      redrawCommitted(); syncHistory(); blip(990); burst(pt.x * W, pt.y * H, 10, '#ffe27a');
      ev('wonder_draw', { tool: 'stamp', stamp: stampKey });
      return;
    }
    try { base.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    cur = { tool, color, size, pts: [pt], seed: (Math.random() * 360) | 0 || 1 };
    hint.classList.add('gone'); dirty = true;
  });
  base.addEventListener('pointermove', (e) => {
    if (!cur) return;
    const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
    for (const ce of evs.length ? evs : [e]) {
      const pt = ptOf(ce), last = cur.pts[cur.pts.length - 1];
      if (Math.hypot((pt.x - last.x) * W, (pt.y - last.y) * H) < 1.5) continue;
      pt.p = last.p * 0.6 + pt.p * 0.4;
      cur.pts.push(pt);
      if (cur.tool === 'glitter' && Math.random() < 0.7) burst(pt.x * W, pt.y * H, 2, color);
      if (cur.tool === 'gel' && Math.random() < 0.15) burst(pt.x * W, pt.y * H, 1, '#ffffff');
    }
    dirty = true;
  });
  const endStroke = () => {
    if (!cur) return;
    pushHistory(); strokes.push(cur);
    ev('wonder_draw', { tool: cur.tool, points: cur.pts.length });
    renderStroke(gC, cur); cur = null; paintBase(); syncHistory();
  };
  base.addEventListener('pointerup', endStroke);
  base.addEventListener('pointercancel', endStroke);
  base.addEventListener('lostpointercapture', endStroke);

  function burst(x: number, y: number, n: number, c: string) {
    if (reduced()) return;
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.3, sp = 20 + Math.random() * 70; live.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, life: 0.5 + Math.random() * 0.5, c, s: 1 + Math.random() * 2.5 }); }
    if (live.length > 400) live.splice(0, live.length - 400);
  }

  const doUndo = () => { const s = undoStack.pop(); if (!s) return; redoStack.push(strokes); strokes = s; redrawCommitted(); syncHistory(); blip(440); };
  const doRedo = () => { const s = redoStack.pop(); if (!s) return; undoStack.push(strokes); strokes = s; redrawCommitted(); syncHistory(); blip(700); };
  undoB.onclick = doUndo; redoB.onclick = doRedo;
  clearB.onclick = () => {
    if (!strokes.length) return;
    pushHistory(); whoosh();
    // sweep the old drawing off to the side with a little sparkle trail
    const snap = document.createElement('canvas'); snap.width = committed.width; snap.height = committed.height; snap.getContext('2d')!.drawImage(committed, 0, 0);
    sweep = { img: snap, t: 0 };
    for (let i = 0; i < 18; i++) burst(Math.random() * W, Math.random() * H, 1, '#ffffff');
    strokes = []; redrawCommitted(); syncHistory();
    ev('wonder_clear', {});
  };
  let sweep: { img: HTMLCanvasElement; t: number } | null = null;

  // ---------------------------------------------------------------- one animation loop: live stroke, water shimmer, glitter twinkle, particles
  let last = performance.now(), time = 0;
  const loop = (now: number) => {
    if (closed) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    if (dirty) { paintBase(); dirty = false; }
    gF.clearRect(0, 0, W, H);
    const still = reduced();
    if (!still) {
      // water ripple shimmer travelling along water strokes
      for (const s of cur?.tool === 'water' ? [...strokes, cur] : strokes) {
        if (s.tool !== 'water') continue;
        gF.save(); gF.globalCompositeOperation = 'lighter';
        for (let i = 0; i < s.pts.length; i += 3) {
          const a = Math.sin(time * 3.2 - i * 0.35);
          if (a < 0.55) continue;
          const p = P(s.pts[i]), w = widthAt(s, s.pts[i]);
          gF.strokeStyle = `rgba(200,240,255,${(a - 0.55) * 1.1})`; gF.lineWidth = 1.6;
          gF.beginPath(); gF.ellipse(p.x, p.y, w * (0.25 + (1 - a) * 0.9), w * (0.12 + (1 - a) * 0.4), 0, 0, 7); gF.stroke();
        }
        gF.restore();
      }
      // glitter twinkles
      gF.fillStyle = '#fff';
      for (const s of strokes) {
        if (s.tool !== 'glitter') continue;
        const r = rnd(s.seed + 7);
        for (let i = 0; i < s.pts.length; i += 4) {
          const ph = r() * 6.3, a = Math.sin(time * 4 + ph);
          if (a < 0.8) continue;
          const p = P(s.pts[i]); gF.globalAlpha = (a - 0.8) * 5; star(gF, p.x + (r() - 0.5) * s.size, p.y + (r() - 0.5) * s.size, 3 + s.size * 0.25);
        }
        gF.globalAlpha = 1;
      }
    }
    // clear sweep
    if (sweep) {
      sweep.t += dt * 2.4;
      const k = sweep.t, ease = k * k;
      gF.save(); gF.globalAlpha = Math.max(0, 1 - k); gF.setTransform(1, 0, 0, 1, 0, 0);
      gF.translate(ease * fx.width * 1.1, -ease * fx.height * 0.1); gF.rotate(ease * 0.25);
      gF.drawImage(sweep.img, 0, 0); gF.restore(); gF.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (k >= 1) sweep = null;
    }
    // particles
    for (let i = live.length - 1; i >= 0; i--) {
      const q = live[i]; q.life -= dt; if (q.life <= 0) { live.splice(i, 1); continue; }
      q.vy += 120 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      gF.globalAlpha = Math.min(1, q.life * 2); gF.fillStyle = q.c; star(gF, q.x, q.y, q.s * 1.8);
    }
    gF.globalAlpha = 1;
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  // ---------------------------------------------------------------- starters (static instantly-ish, dynamic swapped in)
  let gotDynamic = false;
  function renderChips(list: WonderStarter[]) {
    chips.removeAttribute('aria-busy');
    chips.replaceChildren(...list.slice(0, 8).map((s, i) => {
      const ak = areaKey(s.area);
      const icon = isUrl(s.icon) ? s.icon : ICONS[s.id];
      const ci = el('span', `ci ccx-area-${ak}`, {}, icon ? el('img', '', { src: icon, alt: '' }) : (s.emoji || (s.icon && !isUrl(s.icon) ? s.icon : AREAS[ak].emoji)));
      const b = el('button', `ccx-chip ccx-area-${ak}`, { 'data-testid': `starter-${s.id}` }, ci, t(`starter.${s.id}`, s.label));
      b.style.animationDelay = `${i * 45}ms`;
      b.onclick = () => {
        ev('wonder_submit', { starter: s.id, hasDrawing: strokes.length > 0, source: 'starter', worldTag: ak });
        showQuestions(s.questions, ak, undefined, { guess: s.label, starterId: s.id });
      };
      return b;
    }));
  }
  const staticTimer = window.setTimeout(() => { if (!gotDynamic && !closed) renderChips(STATIC_STARTERS); }, 1200);
  host.starters().then((list) => { if (closed || !Array.isArray(list) || !list.length) return; gotDynamic = true; clearTimeout(staticTimer); renderChips(list); })
    .catch(() => { if (!closed && !gotDynamic) { clearTimeout(staticTimer); renderChips(STATIC_STARTERS); } });

  // ---------------------------------------------------------------- say it / type it
  let listening = false;
  mic.onclick = async () => {
    if (!host.listen || listening || busy) return;
    listening = true; mic.classList.add('live');
    bubble.classList.add('show'); bubble.replaceChildren(el('span', 'dots', {}, el('i'), el('i'), el('i')), ' ', t('wb.listening', 'Listening… tell me your wonder!'));
    ev('wonder_mic', {});
    try {
      const final = await host.listen((s) => { if (s) bubble.textContent = `“${s}”`; });
      if (closed) return;
      if (final && final.trim()) { bubble.textContent = `“${final.trim()}”`; input.value = final.trim(); void submit(); }
      else bubble.textContent = t('wb.heardNothing', 'I did not catch that. Try again or type it!');
    } catch { bubble.textContent = t('npc.micError', 'Mic not available, type instead!'); }
    finally { listening = false; mic.classList.remove('live'); }
  };
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); void submit(); } });
  go.onclick = () => void submit();

  // ---------------------------------------------------------------- submit → thinking → result
  let busy = false;
  let stage: HTMLElement | null = null;
  const snapshot = () => {
    const c = document.createElement('canvas'); c.width = Math.min(800, base.width); c.height = Math.round(c.width * (base.height / base.width));
    const g = c.getContext('2d')!; g.fillStyle = '#24443b'; g.fillRect(0, 0, c.width, c.height); g.drawImage(committed, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  };
  function openStage(cls = '') { stage?.remove(); stage = el('div', `ccx-stage ${cls}`); body.append(stage); body.scrollTop = 0; return stage; }
  function thinking() {
    const st = openStage('thinking');
    st.append(el('div', 'ccx-think', {}, el('img', 'sam', { src: `${ART}/sam-think.webp`, alt: '' }), el('img', 'ccx-qblock', { src: `${ART}/logo-mark.webp`, alt: '' })),
      el('div', 'ccx-think-txt', { 'aria-live': 'polite' }, t('wonder.thinking', 'Hmm, let me look…')));
    // sparkles fly from the drawing to Sam
    if (!reduced()) {
      const br = board.getBoundingClientRect(), sr = body.getBoundingClientRect();
      const pts = strokes.flatMap((s) => s.pts.filter((_, i) => i % 5 === 0)).slice(0, 60);
      const n = Math.min(24, Math.max(12, pts.length));
      for (let i = 0; i < n; i++) {
        const p = pts.length ? pts[Math.floor(Math.random() * pts.length)] : { x: Math.random(), y: Math.random() };
        const x = br.left - sr.left + p.x * br.width, y = br.top - sr.top + p.y * br.height + body.scrollTop;
        const sp = el('span', 'ccx-fly');
        sp.style.left = `${x}px`; sp.style.top = `${y}px`;
        sp.style.setProperty('--dx', `${sr.width / 2 - x}px`); sp.style.setProperty('--dy', `${sr.height / 2 - 40 - y}px`);
        sp.style.setProperty('--c', SWATCHES[i % SWATCHES.length]); sp.style.animationDelay = `${i * 40}ms`;
        st.append(sp);
      }
    }
  }
  async function submit(textOverride?: string) {
    if (busy) return;
    const txt = (textOverride ?? input.value).trim();
    const hasDrawing = strokes.some((s) => s.tool !== 'eraser');
    if (!txt && !hasDrawing) {
      status.textContent = t('wonder.empty', 'Draw something, say it, or type it first!');
      easel.classList.remove('ccx-nudge'); void easel.offsetWidth; easel.classList.add('ccx-nudge');
      return;
    }
    busy = true; status.textContent = ''; go.disabled = true;
    thinking();
    const started = performance.now();
    let res: Res | null = null;
    try { res = await host.submit({ image: hasDrawing ? snapshot() : undefined, text: txt || undefined }); } catch { res = null; }
    const wait = 1100 - (performance.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    busy = false; go.disabled = false;
    if (closed) return;
    if (!res || !res.questions?.length) {
      stage?.remove(); stage = null;
      status.textContent = t('wb.oops', 'Oops, my brain hiccuped! Try again or pick a wonder chip.');
      return;
    }
    const r = res;
    const ak = areaKey(r.worldTag || r.area);
    ev('wonder_result', { guess: r.guess, confidence: r.confidence, worldTag: ak, text: txt, hasDrawing });
    if (r.confidence < 0.5 && r.guesses?.length && !textOverride) showGuesses(r, hasDrawing ? snapshot() : null, txt);
    else showQuestions(r.questions, ak, r, { guess: r.guess });
  }
  function showGuesses(r: Res, thumb: string | null, txt: string) {
    const st = openStage();
    const list = [r.guess, ...r.guesses.filter((g) => g && g.toLowerCase() !== (r.guess || '').toLowerCase())].filter(Boolean).slice(0, 3);
    st.append(
      thumb ? el('img', 'ccx-drawthumb', { src: thumb, alt: '' }) : '',
      el('h3', 'ccx-result-h', {}, `${t('wonder.isIt', 'Is it a…?')}`),
      el('p', 'ccx-result-sub', {}, t('wb.isItSub', 'Help me out! Which one did you mean?')),
    );
    const grid = el('div', 'ccx-guesses');
    list.forEach((gs, i) => {
      const b = el('button', `ccx-card guess${i === 0 ? ' main' : ''}`, { 'data-testid': 'guess' }, `${gs}?`);
      b.style.animationDelay = `${i * 110}ms`;
      b.onclick = () => {
        ev('wonder_guess', { guess: gs });
        if (i === 0) showQuestions(r.questions, areaKey(r.worldTag || r.area), r, { guess: gs });
        else void submit(`${gs}${txt ? ` (${txt})` : ''}`);
      };
      grid.append(b);
    });
    const back = el('button', 'ccx-btn', {}, '↩ ', t('wb.drawMore', 'Draw some more'));
    back.onclick = () => { stage?.remove(); stage = null; };
    st.append(grid, el('div', 'ccx-row', {}, back));
    (grid.firstElementChild as HTMLElement | null)?.focus();
  }
  function showQuestions(qs: string[], ak: string, r?: Res, meta: { guess?: string; starterId?: string } = {}) {
    const st = openStage();
    const A = AREAS[ak] ?? AREAS.beach;
    const npc = r?.npc || A.npc, area = r?.area || A.name;
    st.append(
      el('h3', 'ccx-result-h', {}, meta.guess ? `${t('wb.ooh', 'Ooh,')} ${meta.guess}!` : t('wonder.pickQuestion', 'Pick a question to explore!')),
      el('p', 'ccx-result-sub', {}, t('wonder.pickQuestion', 'Pick a question to explore!')),
    );
    const grid = el('div', 'ccx-cards');
    qs.slice(0, 3).forEach((q, i) => {
      const goLine = el('span', `go ccx-area-${ak}`, {}, el('b', '', {}, A.emoji), `${t('quest.find', 'Find')} ${npc} ${t('quest.at', 'at')} ${area}`);
      const b = el('button', `ccx-card ccx-area-${ak}`, { 'data-testid': `question-${i}` }, el('span', 'num', {}, String(i + 1)), el('span', 'q', {}, q), goLine);
      b.style.animationDelay = `${120 + i * 140}ms`;
      b.onclick = () => {
        ev('question_pick', { question: q, index: i, worldTag: ak });
        blip(990);
        teardown();
        host.onPick({ question: q, area: ak, guess: meta.guess, starterId: meta.starterId });
      };
      grid.append(b);
    });
    const back = el('button', 'ccx-btn', {}, '↩ ', t('wb.back', 'Back to my drawing'));
    back.onclick = () => { stage?.remove(); stage = null; };
    st.append(grid, el('div', 'ccx-row', {}, back));
    setTimeout(() => (grid.firstElementChild as HTMLElement | null)?.focus({ preventScroll: true }), 50);
  }

  // ---------------------------------------------------------------- keyboard + close
  const onKey = (e: KeyboardEvent) => {
    if (closed) return;
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); if (stage && !busy) { stage.remove(); stage = null; } else userClose(); return; }
    const inText = e.target === input;
    if (!inText && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); }
    else if (!inText && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
  };
  ov.addEventListener('keydown', onKey);
  const onWinKey = (e: KeyboardEvent) => { if (!closed && e.key === 'Escape' && !ov.contains(e.target as Node)) { e.preventDefault(); userClose(); } };
  window.addEventListener('keydown', onWinKey);
  xBtn.onclick = () => userClose();

  function teardown() {
    if (closed) return;
    closed = true; cancelAnimationFrame(raf); clearTimeout(staticTimer); ro.disconnect();
    window.removeEventListener('keydown', onWinKey); ov.remove();
  }
  function userClose() { if (closed) return; ev('wonder_close', {}); teardown(); host.onClose(); }

  requestAnimationFrame(() => { resize(); if (matchMedia('(pointer: fine)').matches) go.focus({ preventScroll: true }); });
  return { close: teardown };
}
