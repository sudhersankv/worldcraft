/** Curiosity Craft — Surfboard Lab: pick a board, PREDICT, drop it into a jelly-water tank (1D spring-mass ripples + buoyancy),
 *  see what happens, and build the "floats if density < 1" pattern. Failure is funny + a hint, never a penalty. Standalone; the game passes a host. */
import './panels.css';
import { DENSITY, type Material } from '../../shared/curiosity';

export interface LabHost {
  root: HTMLElement; t: (k: string, fb: string) => string;
  onAttempt(e: { challenge: 'surfboard-lab'; choice: string; result: 'floats' | 'sinks' | 'wobbles'; predicted?: string }): void;
  speak?(text: string): void; onClose(): void;
}
type Shape = 'short' | 'long';
type Result = 'floats' | 'sinks' | 'wobbles';
type Phase = 'hover' | 'drag' | 'fall' | 'water' | 'done';

const ART = '/art/cc';
const MATS: Material[] = ['stone', 'wood', 'foam', 'fiberglass-foam'];
const STICKER: Record<Material, string> = { stone: `${ART}/lab/stone.webp`, wood: `${ART}/lab/wood.webp`, foam: `${ART}/lab/foam.webp`, 'fiberglass-foam': `${ART}/lab/foam.webp` };
const G = 900; // px/s²

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', attrs: Record<string, string> = {}, ...kids: (Node | string | null)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (tag === 'button') (e as HTMLButtonElement).type = 'button';
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const k of kids) if (k !== null) e.append(k);
  return e;
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ tiny WebAudio sfx (quiet)
let actx: AudioContext | null = null;
const ac = () => (actx = actx || new AudioContext());
function noise(dur: number, f0: number, f1: number, gain: number, type: BiquadFilterType = 'lowpass') {
  try {
    const a = ac(), buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 2);
    const s = a.createBufferSource(); s.buffer = buf;
    const f = a.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, a.currentTime); f.frequency.exponentialRampToValueAtTime(f1, a.currentTime + dur);
    const g = a.createGain(); g.gain.value = gain; s.connect(f).connect(g).connect(a.destination); s.start();
  } catch { /* optional */ }
}
function tone(f0: number, f1: number, dur: number, gain = 0.06, type: OscillatorType = 'sine', delay = 0) {
  try {
    const a = ac(), o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  } catch { /* optional */ }
}
const sfx = {
  splash: (k: number) => noise(0.45, 2400, 300, 0.05 + 0.06 * k),
  bloop: () => { tone(420, 120, 0.35, 0.07); tone(300, 90, 0.4, 0.05, 'sine', 0.25); },
  bump: () => { tone(110, 50, 0.18, 0.12, 'triangle'); noise(0.2, 600, 150, 0.06); },
  ding: () => { tone(784, 784, 0.18, 0.05, 'triangle'); tone(1175, 1175, 0.3, 0.05, 'triangle', 0.12); },
  click: () => tone(660, 990, 0.08, 0.035, 'triangle'),
  tada: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.25, 0.05, 'triangle', i * 0.1)); },
};

// ------------------------------------------------------------------ board drawing (side view in the tank, top view on cards)
function fillMaterial(g: CanvasRenderingContext2D, m: Material, L: number, T: number, seed = 3) {
  let s = seed; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  if (m === 'stone') {
    const gr = g.createLinearGradient(0, -T, 0, T); gr.addColorStop(0, '#b9bec6'); gr.addColorStop(1, '#7c838f'); g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    for (let i = 0; i < L / 4; i++) { g.fillStyle = r() < 0.5 ? 'rgba(40,40,60,.25)' : 'rgba(255,255,255,.35)'; g.beginPath(); g.arc((r() - 0.5) * L, (r() - 0.5) * T * 1.4, 0.8 + r() * 1.8, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(40,40,60,.45)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-L * 0.1, -T); g.lineTo(-L * 0.05, 0); g.lineTo(-L * 0.12, T * 0.3); g.moveTo(L * 0.2, -T); g.lineTo(L * 0.24, -T * 0.1); g.stroke();
    g.restore();
  } else if (m === 'wood') {
    g.fillStyle = '#cf9550'; g.fill(); g.save(); g.clip();
    g.strokeStyle = 'rgba(120,70,25,.55)'; g.lineWidth = 1.3;
    for (let k = -3; k <= 3; k++) { g.beginPath(); for (let x = -L / 2; x <= L / 2; x += 6) g.lineTo(x, k * T * 0.16 + Math.sin(x * 0.07 + k) * 1.4); g.stroke(); }
    g.fillStyle = 'rgba(120,70,25,.6)'; g.beginPath(); g.ellipse(L * 0.12, T * 0.05, 4, 2, 0, 0, 7); g.fill();
    g.restore();
  } else if (m === 'foam') {
    g.fillStyle = '#fff2bd'; g.fill(); g.save(); g.clip();
    for (let i = 0; i < L / 3; i++) { g.fillStyle = 'rgba(214,170,70,.35)'; g.beginPath(); g.arc((r() - 0.5) * L, (r() - 0.5) * T * 1.3, 0.8 + r() * 2, 0, 7); g.fill(); }
    g.restore();
  } else {
    const gr = g.createLinearGradient(0, -T, 0, T); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#d4f7ff'); gr.addColorStop(1, '#7fd8ef'); g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    g.strokeStyle = '#ff5a6e'; g.lineWidth = 2; g.beginPath(); g.moveTo(-L / 2, 0); g.lineTo(L / 2, 0); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(-L * 0.35, -T * 0.42, L * 0.5, T * 0.16);
    g.restore();
  }
}
function boardSidePath(g: CanvasRenderingContext2D, L: number, T: number) {
  const h = T / 2;
  g.beginPath();
  g.moveTo(-L / 2 + h, -h);
  g.lineTo(L / 2 - L * 0.2, -h);
  g.quadraticCurveTo(L / 2 - L * 0.02, -h - T * 0.15, L / 2, -h - T * 0.55); // upturned nose (rocker)
  g.quadraticCurveTo(L / 2 - L * 0.06, h * 0.9, L / 2 - L * 0.22, h);
  g.lineTo(-L / 2 + h, h);
  g.arc(-L / 2 + h, 0, h, Math.PI / 2, -Math.PI / 2);
  g.closePath();
}
function drawBoardSide(g: CanvasRenderingContext2D, m: Material, L: number, T: number) {
  if (m === 'fiberglass-foam') { // fin under the tail
    g.beginPath(); g.moveTo(-L / 2 + L * 0.08, T / 2); g.quadraticCurveTo(-L / 2 + L * 0.1, T / 2 + T * 0.9, -L / 2 + L * 0.03, T / 2 + T * 1.1); g.lineTo(-L / 2 + L * 0.16, T / 2); g.closePath();
    g.fillStyle = '#19c3d6'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#1d1a3a'; g.stroke();
  }
  boardSidePath(g, L, T); fillMaterial(g, m, L, T);
  boardSidePath(g, L, T); g.lineWidth = 3; g.strokeStyle = '#1d1a3a'; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-L / 2 + T * 0.7, -T / 2 + 3); g.lineTo(L / 2 - L * 0.24, -T / 2 + 3); g.stroke();
}
function drawBoardTop(c: HTMLCanvasElement, m: Material, shape: Shape) {
  const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = r.width || 140, h = r.height || 46;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, w / 2 * dpr, h / 2 * dpr);
  const L = Math.min(w - 10, shape === 'long' ? w - 10 : w * 0.62), Wd = Math.min(h - 8, L * 0.3);
  const path = () => { g.beginPath(); g.moveTo(-L / 2, 0); g.bezierCurveTo(-L / 2, -Wd / 2, L * 0.15, -Wd / 2, L / 2, 0); g.bezierCurveTo(L * 0.15, Wd / 2, -L / 2, Wd / 2, -L / 2, 0); g.closePath(); };
  g.save(); g.translate(2, 3); path(); g.fillStyle = 'rgba(29,26,58,.25)'; g.fill(); g.restore();
  path(); fillMaterial(g, m, L, Wd, 7);
  path(); g.lineWidth = 2.5; g.strokeStyle = '#1d1a3a'; g.stroke();
}

// ------------------------------------------------------------------ the panel
export function openLabPanel(host: LabHost): { close(): void } {
  const t = host.t;
  let closed = false, raf = 0;
  const say = (s: string) => { try { host.speak?.(s); } catch { /* optional */ } };

  const label: Record<Material, string> = { stone: t('lab.mat.stone', 'Stone'), wood: t('lab.mat.wood', 'Wood'), foam: t('lab.mat.foam', 'Foam'), 'fiberglass-foam': t('lab.mat.fiberglass', 'Fiberglass + foam') };
  const texture: Record<Material, string> = { stone: t('lab.tex.stone', 'Hard, heavy, packed tight'), wood: t('lab.tex.wood', 'Tiny tubes inside, a bit of air'), foam: t('lab.tex.foam', 'Full of air bubbles'), 'fiberglass-foam': t('lab.tex.fiberglass', 'Foam core, shiny tough shell') };

  let material: Material = 'wood', shape: Shape = 'short', predicted: 'floats' | 'sinks' | null = null, wave = 0;
  const tries: { m: Material; s: Shape; d: number; p: string | null; r: Result }[] = [];
  let ahaShown = false, sawSink = false, sawFloat = false;

  // ---------------------------------------------------------------- shell
  const ov = el('div', 'ccx-ov', { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('lab.title', 'Surfboard Lab: what floats?'), 'data-testid': 'lab' });
  const xBtn = el('button', 'ccx-x', { 'aria-label': t('ui.close', 'Close'), 'data-testid': 'lab-close' }, '✕');
  const head = el('div', 'ccx-head', {}, el('img', 'ccx-mark', { src: `${ART}/icons/surfboard.webp`, alt: '' }),
    el('h2', 'ccx-title', {}, el('span', 'ccx-kick', {}, t('tryit.button', 'Try it!')), t('lab.title', 'Surfboard Lab: what floats?')), xBtn);
  const body = el('div', 'ccx-body');
  ov.append(el('div', 'ccx-panel ccx-lab', {}, head, body));

  // steps
  const stepNames = [t('lab.step.pick', 'Pick'), t('lab.step.predict', 'Predict'), t('lab.step.drop', 'Drop'), t('lab.step.see', 'See')];
  const steps = el('div', 'ccx-steps', { 'aria-hidden': 'true' }, ...stepNames.map((n, i) => el('div', 'ccx-step', {}, el('b', '', {}, String(i + 1)), el('span', '', {}, n))));
  const setStep = (k: number) => [...steps.children].forEach((c, i) => { c.classList.toggle('now', i === k); c.classList.toggle('done', i < k); });

  // material cards
  const mats = el('div', 'ccx-mats', { role: 'radiogroup', 'aria-label': t('lab.materials', 'Material') });
  const matCanvases: { c: HTMLCanvasElement; m: Material }[] = [];
  for (const m of MATS) {
    const c = el('canvas');
    const b = el('button', `ccx-mat${m === material ? ' on' : ''}`, { role: 'radio', 'aria-checked': String(m === material), 'data-testid': `mat-${m}` },
      c, el('span', 'nm', {}, label[m]), el('span', 'dens', {}, `${DENSITY[m]} g/cm³`), el('span', 'tex', {}, texture[m]));
    b.onclick = () => { if (busy()) return; material = m; sfx.click(); mats.querySelectorAll('.ccx-mat').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); }); b.classList.add('on'); b.setAttribute('aria-checked', 'true'); resetBoard(); };
    matCanvases.push({ c, m }); mats.append(b);
  }
  const shapeBtns = (['short', 'long'] as Shape[]).map((s) => {
    const b = el('button', `ccx-btn${s === shape ? ' on' : ''}`, { 'aria-pressed': String(s === shape), 'data-testid': `shape-${s}` }, s === 'short' ? '🏄 ' : '🛶 ', s === 'short' ? t('lab.shape.short', 'Short board') : t('lab.shape.long', 'Long board'));
    b.onclick = () => { if (busy()) return; shape = s; sfx.click(); shapeBtns.forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); redrawCards(); resetBoard(); };
    return b;
  });
  // prediction
  const pF = el('button', 'ccx-btn leaf', { 'data-testid': 'predict-floats', 'aria-pressed': 'false' }, '🛟 ', t('lab.floats', 'Floats'), el('small', '', {}, t('lab.predictF', 'I think it floats')));
  const pS = el('button', 'ccx-btn coral', { 'data-testid': 'predict-sinks', 'aria-pressed': 'false' }, '⚓ ', t('lab.sinks', 'Sinks'), el('small', '', {}, t('lab.predictS', 'I think it sinks')));
  const predict = el('div', 'ccx-predict', {}, pF, pS);
  const setPred = (p: 'floats' | 'sinks' | null) => {
    predicted = p;
    pF.classList.toggle('on', p === 'floats'); pS.classList.toggle('on', p === 'sinks');
    pF.setAttribute('aria-pressed', String(p === 'floats')); pS.setAttribute('aria-pressed', String(p === 'sinks'));
    if (p) { sfx.click(); setStep(2); tip(t('lab.tipDrop', 'Drag the board over the tank and let go, or tap Drop!')); }
  };
  pF.onclick = () => { if (!busy()) setPred('floats'); };
  pS.onclick = () => { if (!busy()) setPred('sinks'); };

  const table = el('div', '');
  const ctrl = el('div', 'ccx-lab-ctrl', {}, steps,
    el('div', 'ccx-lbl', {}, `1 · ${t('lab.pickBoard', 'Pick a board')}`), mats, el('div', 'ccx-seg', {}, ...shapeBtns),
    el('div', 'ccx-lbl', {}, `2 · ${t('lab.willIt', 'Will it float or sink?')}`), predict);
  const notebook = el('div', 'ccx-lab-notes', {}, el('div', 'ccx-lbl', {}, `🔬 ${t('lab.notebook', 'Science notebook')}`), table);

  // tank + meter
  const cv = el('canvas', '', { 'data-testid': 'lab-canvas', 'aria-label': t('lab.tank', 'Water tank') });
  const tipEl = el('div', 'ccx-tank-tip', { 'aria-live': 'polite' });
  const meter = el('div', 'ccx-meter', { 'aria-hidden': 'true' });
  meter.innerHTML = `<svg viewBox="0 0 120 66"><path d="M8 58 A52 52 0 0 1 34 13" stroke="#2fc46a" stroke-width="11" fill="none"/><path d="M34 13 A52 52 0 0 1 112 58" stroke="#ff5a6e" stroke-width="11" fill="none"/>
    <path d="M8 58 A52 52 0 0 1 112 58" stroke="#1d1a3a" stroke-width="2" fill="none"/><line x1="34" y1="13" x2="40" y2="23" stroke="#1d1a3a" stroke-width="2.5"/>
    <text x="10" y="40" font-size="9" font-weight="700" fill="#0d7a3c" font-family="system-ui">${t('lab.floats', 'Floats')}</text><text x="83" y="40" font-size="9" font-weight="700" fill="#c4253a" font-family="system-ui">${t('lab.sinks', 'Sinks')}</text>
    <g class="needle" style="transform:rotate(-90deg)"><line x1="60" y1="58" x2="60" y2="14" stroke="#1d1a3a" stroke-width="3.5" stroke-linecap="round"/></g><circle cx="60" cy="58" r="6" fill="#ffc928" stroke="#1d1a3a" stroke-width="2.5"/></svg><div class="val">? g/cm³</div>`;
  const needle = meter.querySelector('.needle') as SVGGElement, meterVal = meter.querySelector('.val') as HTMLElement;
  const swingMeter = (d: number | null) => {
    if (d === null) { needle.style.transform = 'rotate(-90deg)'; meterVal.textContent = '? g/cm³'; return; }
    const a = -90 + (clamp(d, 0, 3) / 3) * 180; // water (1.0) sits at -30°
    needle.style.transform = `rotate(${a}deg)`; meterVal.textContent = `${d} ${d < 1 ? '<' : '>'} 1.0`;
  };
  const tank = el('div', 'ccx-tankwrap', {}, cv, tipEl, meter);
  const resBox = el('div', '');
  const dropBtn = el('button', 'ccx-btn sun big', { 'data-testid': 'drop' }, '⬇ ', t('lab.drop', 'Drop it in!'));
  const waveIn = el('input', '', { type: 'range', min: '0', max: '1', step: '0.05', value: '0', 'aria-label': t('wave.title', 'Wave maker') }) as HTMLInputElement;
  waveIn.oninput = () => { wave = Number(waveIn.value); };
  const dropbar = el('div', 'ccx-dropbar', {}, dropBtn, el('label', 'ccx-wave', {}, '🌊 ', t('wave.title', 'Wave maker'), waveIn));
  const main = el('div', 'ccx-lab-main', {}, tank, resBox, dropbar);
  body.append(ctrl, notebook, main);
  host.root.append(ov);
  body.style.position = 'relative';

  // ---------------------------------------------------------------- sim state
  const g = cv.getContext('2d')!;
  let W = 600, H = 360, dpr = 1;
  const N = 72; const hgt = new Float32Array(N), vel = new Float32Array(N);
  const Y0 = () => Math.round(H * 0.38);
  const FLOOR = () => H - 30;
  const surf = (x: number) => { const f = clamp(x / W, 0, 1) * (N - 1), i = Math.floor(f), k = f - i; return Y0() + hgt[i] * (1 - k) + hgt[Math.min(N - 1, i + 1)] * k; };
  const B = { x: 0, y: 0, vy: 0, ang: 0, va: 0, L: 160, T: 16, phase: 'hover' as Phase, tIn: 0, tLand: -1, entered: false, maxWob: 0, swung: false, bubbleT: 0 };
  type Pt = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; kind: 'drop' | 'dust' | 'bubble' | 'puff' };
  const parts: Pt[] = [];
  const ambient: { x: number; y: number; r: number; sp: number; ph: number }[] = [];
  const pebbles: { x: number; w: number; h: number; c: string }[] = [];
  const weeds: { x: number; h: number; ph: number }[] = [];
  const fish = { x: -40, y: 0, dir: 1, sp: 38, flee: 0, ph: 0 };
  let time = 0;

  function layout() {
    const r = tank.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    pebbles.length = 0; weeds.length = 0;
    let s = 11; const rr = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    const cols = ['#9aa1ab', '#c9b79c', '#7e8794', '#d9c4a0', '#a48d6e'];
    for (let x = 6; x < W; x += 14 + rr() * 26) pebbles.push({ x, w: 6 + rr() * 12, h: 4 + rr() * 6, c: cols[Math.floor(rr() * cols.length)] });
    for (const f of [0.07, 0.16, 0.62, 0.86, 0.94]) weeds.push({ x: W * f, h: (FLOOR() - Y0()) * (0.3 + rr() * 0.35), ph: rr() * 6 });
    fish.y = Y0() + (FLOOR() - Y0()) * 0.55;
    if (B.phase === 'hover' || B.phase === 'done') resetBoard(true);
    redrawCards();
  }
  const ro = new ResizeObserver(() => layout());
  ro.observe(tank);
  function redrawCards() { for (const { c, m } of matCanvases) drawBoardTop(c, m, shape); }

  const busy = () => B.phase === 'fall' || B.phase === 'water';
  const hoverY = () => Math.max(B.T + 22, Y0() - Math.min(100, Y0() * 0.55));
  function resetBoard(keepX = false) {
    B.L = clamp(W * (shape === 'long' ? 0.46 : 0.27), 80, shape === 'long' ? 380 : 220);
    B.T = clamp(B.L * 0.11, 12, 22);
    if (!keepX || B.phase !== 'hover') B.x = W / 2;
    B.x = clamp(B.x, B.L / 2 + 8, W - B.L / 2 - 8);
    B.y = hoverY(); B.vy = 0; B.ang = 0; B.va = 0; B.phase = 'hover'; B.entered = false; B.tLand = -1; B.maxWob = 0; B.swung = false;
    swingMeter(null);
    if (!keepX) { setStep(predicted ? 2 : 1); tip(predicted ? t('lab.tipDrop', 'Drag the board over the tank and let go, or tap Drop!') : t('lab.tipPredict', 'First: will it float or sink? Make a guess!')); }
    dropBtn.disabled = false;
  }
  function tip(s: string) { tipEl.textContent = s; tipEl.style.opacity = s ? '1' : '0'; }

  function drop() {
    if (B.phase !== 'hover' && B.phase !== 'drag') return;
    if (!predicted) {
      predict.classList.remove('ccx-nudge'); void predict.offsetWidth; predict.classList.add('ccx-nudge');
      predict.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
      tip(t('lab.tipPredict', 'First: will it float or sink? Make a guess!'));
      say(t('lab.predictFirst', 'Scientists guess first! Will it float or sink?'));
      B.phase = 'hover';
      return;
    }
    resBox.replaceChildren();
    B.phase = 'fall'; B.vy = 0; B.tIn = 0; dropBtn.disabled = true; setStep(3); tip('');
    tone(700, 300, 0.25, 0.03, 'triangle');
  }
  dropBtn.onclick = drop;

  // drag the hovering board, release to drop
  let dragOff = 0;
  const local = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('pointerdown', (e) => {
    if (B.phase !== 'hover') return;
    const p = local(e);
    if (Math.abs(p.x - B.x) < B.L / 2 + 30 && Math.abs(p.y - B.y) < 60) {
      B.phase = 'drag'; dragOff = B.x - p.x; cv.style.cursor = 'grabbing';
      try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      e.preventDefault();
    }
  });
  cv.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (B.phase === 'drag') { B.x = clamp(p.x + dragOff, B.L / 2 + 8, W - B.L / 2 - 8); B.y = clamp(p.y, B.T + 10, Y0() - B.T - 8); }
    else cv.style.cursor = B.phase === 'hover' && Math.abs(p.x - B.x) < B.L / 2 + 30 && Math.abs(p.y - B.y) < 60 ? 'grab' : 'default';
  });
  const release = () => {
    if (B.phase !== 'drag') return;
    cv.style.cursor = 'grab';
    if (!predicted) { B.y = hoverY(); B.phase = 'hover'; drop(); return; }
    drop();
  };
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', () => { if (B.phase === 'drag') { B.phase = 'hover'; B.y = hoverY(); } });

  // ---------------------------------------------------------------- physics
  function springs() {
    const k = 0.025, d = 0.022, spread = 0.24;
    const amp = wave * Math.min(22, H * 0.06);
    if (amp > 0) { hgt[0] = Math.sin(time * 3.1) * amp; vel[0] = 0; }
    for (let i = amp > 0 ? 1 : 0; i < N; i++) { vel[i] += -k * hgt[i] - d * vel[i]; hgt[i] += vel[i]; }
    const lD = new Float32Array(N), rD = new Float32Array(N);
    for (let pass = 0; pass < 6; pass++) {
      for (let i = 0; i < N; i++) {
        if (i > 0) { lD[i] = spread * (hgt[i] - hgt[i - 1]); vel[i - 1] += lD[i]; }
        if (i < N - 1) { rD[i] = spread * (hgt[i] - hgt[i + 1]); vel[i + 1] += rD[i]; }
      }
      for (let i = 0; i < N; i++) { if (i > 0) hgt[i - 1] += lD[i]; if (i < N - 1) hgt[i + 1] += rD[i]; }
    }
    const lim = H * 0.16;
    for (let i = 0; i < N; i++) hgt[i] = clamp(hgt[i], -lim, lim);
  }
  const colAt = (x: number) => clamp(Math.round((x / W) * (N - 1)), 0, N - 1);
  function poke(x0: number, x1: number, v: number) { for (let i = colAt(x0); i <= colAt(x1); i++) vel[i] += v; }

  function boardStep(dt: number) {
    const d = DENSITY[material], floats = d < 1;
    if (B.phase === 'fall' || B.phase === 'water') {
      const n = 5, cos = Math.cos(B.ang), sin = Math.sin(B.ang);
      let sub = 0, torque = 0, bottomMax = -1e9;
      for (let j = 0; j < n; j++) {
        const u = -1 + (2 * j) / (n - 1), ux = u * B.L / 2;
        const sx = B.x + ux * cos, by = B.y + ux * sin + B.T / 2;
        const sj = clamp((by - surf(sx)) / B.T, 0, 1);
        sub += sj; torque += u * sj; bottomMax = Math.max(bottomMax, by);
      }
      sub /= n; torque /= n;
      if (!B.entered && sub > 0.02) {
        B.entered = true; B.phase = 'water'; B.tIn = 0;
        const k = clamp(B.vy / 500, 0.2, 1.2);
        const mass = clamp(d, 0.3, 1);
        poke(B.x - B.L / 2, B.x + B.L / 2, B.vy / 60 * 0.5 * mass);
        poke(B.x - B.L / 2 - 30, B.x - B.L / 2, -B.vy / 60 * 0.15 * mass); poke(B.x + B.L / 2, B.x + B.L / 2 + 30, -B.vy / 60 * 0.15 * mass);
        if (!reduced()) for (let i = 0; i < 26 + k * 24; i++) {
          const side = Math.random() < 0.5 ? -1 : 1;
          parts.push({ kind: 'drop', x: B.x + side * (B.L / 2) * Math.random(), y: Y0() - 2, vx: side * (40 + Math.random() * 160) * k, vy: -(120 + Math.random() * 300) * k, life: 1.4, max: 1.4, r: 2 + Math.random() * 3.5 });
        }
        sfx.splash(k);
        B.vy *= 0.35 + 0.65 * clamp(d, 0, 1); // light boards get stopped hard by the water
        fish.flee = 1.6;
        const kick = (material === 'wood' ? 5 : material === 'stone' ? 0.8 : material === 'foam' ? 2.2 : 1.6) * (shape === 'short' ? 1 : 0.32);
        B.va += kick * (Math.random() < 0.5 ? -1 : 1);
        if (!B.swung) { B.swung = true; swingMeter(d); }
        if (!floats) sfx.bloop();
      }
      // vertical: gravity vs buoyancy (submerged fraction / density), water drag
      const dragC = floats ? 6 / Math.max(d, 0.3) : 8;
      const ay = G * (1 - sub / d) - dragC * B.vy * sub;
      B.vy += ay * dt; B.y += B.vy * dt;
      // rotation: buoyancy torque levels the board to the water surface (long boards average more of it)
      const dr = Math.max(d, 0.12);
      const aa = -(G / dr) * (4 / B.L) * torque - (floats ? 2.4 / Math.max(d, 0.35) : 4) * B.va * Math.max(sub, 0.05);
      B.va += aa * dt; B.ang += B.va * dt;
      B.ang = clamp(B.ang, -0.9, 0.9);
      // couple: a moving board pushes the water around it
      if (sub > 0 && sub < 1) poke(B.x - B.L / 3, B.x + B.L / 3, B.vy * dt * 0.012);
      // walls
      B.x = clamp(B.x + Math.sin(time * 1.3) * wave * 6 * dt * (shape === 'short' ? 1 : 0.4), B.L / 2 + 6, W - B.L / 2 - 6);
      // floor
      const over = bottomMax + B.T * 0.1 - FLOOR();
      if (over > 0) {
        B.y -= over;
        if (B.vy > 18) { // bump + dust puff
          if (B.tLand < 0) { sfx.bump(); if (!reduced()) for (let i = 0; i < 22; i++) { const s = Math.random() < 0.5 ? -1 : 1; parts.push({ kind: 'dust', x: B.x + s * Math.random() * B.L / 2, y: FLOOR(), vx: s * (20 + Math.random() * 60), vy: -(10 + Math.random() * 40), life: 1.3, max: 1.3, r: 4 + Math.random() * 6 }); } }
          B.vy = -B.vy * 0.25; B.va += 0.6;
        } else B.vy = Math.min(B.vy, 0);
        if (B.tLand < 0) B.tLand = B.tIn;
        B.ang += (0.05 - B.ang) * Math.min(1, dt * 4); B.va *= 0.9;
      }
      if (B.phase === 'water') {
        B.tIn += dt;
        if (B.tIn > 1.8 && floats) B.maxWob = Math.max(B.maxWob, Math.abs(B.ang - slopeUnder()));
        if (!floats && sub > 0.6 && !reduced()) { B.bubbleT -= dt; if (B.bubbleT <= 0) { B.bubbleT = 0.07; parts.push({ kind: 'bubble', x: B.x + (Math.random() - 0.5) * B.L * 0.8, y: B.y - B.T / 2, vx: 0, vy: -40 - Math.random() * 40, life: 3, max: 3, r: 1.5 + Math.random() * 3 }); } }
        const settledFloat = floats && B.tIn > 2.6 && Math.abs(B.vy) < 14;
        const settledSink = !floats && B.tLand >= 0 && B.tIn - B.tLand > 0.7;
        if (settledFloat || settledSink || B.tIn > (floats ? 5 : 8)) finish();
      }
    } else if (B.phase === 'done' && DENSITY[material] < 1) {
      // keep floating on the live water after the result (waves!)
      const target = surf(B.x) - B.T / 2 + B.T * DENSITY[material];
      B.vy += ((target - B.y) * 40 - 6 * B.vy) * dt; B.y += B.vy * dt;
      const aT = slopeUnder();
      B.va += ((aT - B.ang) * (shape === 'short' ? 60 : 25) - 3 * B.va) * dt; B.ang += B.va * dt;
    } else if (B.phase === 'hover') {
      B.ang = Math.sin(time * 2) * 0.04; B.y = hoverY() + Math.sin(time * 2.4) * 3;
    }
  }
  const slopeUnder = () => { const a = surf(B.x - B.L / 2), b = surf(B.x + B.L / 2); return Math.atan2(b - a, B.L); };

  // ---------------------------------------------------------------- result
  function finish() {
    if (B.phase === 'done') return;
    B.phase = 'done';
    const d = DENSITY[material], floats = d < 1;
    const wobbly = shape === 'short' && (material === 'wood' || B.maxWob > 0.16 || wave > 0.6); // short boards tip; long ones rest on more water
    const result: Result = !floats ? 'sinks' : wobbly ? 'wobbles' : 'floats';
    const pred = predicted;
    if (floats) sawFloat = true; else sawSink = true;
    tries.push({ m: material, s: shape, d, p: pred, r: result });
    host.onAttempt({ challenge: 'surfboard-lab', choice: `${material}-${shape}`, result, predicted: pred ?? undefined });
    setStep(4);

    const lines: Record<Material, [string, string]> = {
      stone: [t('lab2.stone', 'BLOOP! It dove to the bottom like a grumpy rock submarine!'), t('lab2.stoneHint', 'Stone is 2.6 g/cm³, much heavier than the same amount of water (1.0). Find something lighter for its size!')],
      wood: [t('lab2.wood', 'It floats! It sits low in the water like a sleepy hippo.'), t('lab2.woodHint', 'Wood is 0.6, less than water (1.0), so it floats, but low. Can you find something even lighter?')],
      foam: [t('lab2.foam', 'WHEE! It floats high like a marshmallow cloud!'), t('lab2.foamHint', 'Foam is full of air bubbles, only 0.05 g/cm³. Super light for its size!')],
      'fiberglass-foam': [t('lab2.fiber', 'Pro surfboard! Light foam inside, tough shiny shell outside.'), t('lab2.fiberHint', 'At 0.15 it is light AND strong. Real surfboards are made like this!')],
    };
    let [big, hint] = lines[material];
    if (result === 'wobbles') { big = t('lab2.wobble', 'Wibble-wobble! It floats, but it rocks like a jelly!'); hint = shape === 'short' ? t('lab2.wobbleHint', 'Short boards tip on bumpy water. Try the long board: it rests on more water, so it is steadier!') : t('lab2.wobbleHint2', 'Big waves! Even long boards rock. Turn the wave maker down or try a lighter board.'); }
    const word = (r: string) => (r === 'sinks' ? t('lab2.sank', 'it SANK') : r === 'wobbles' ? t('lab2.wobbled', 'it FLOATED (wobbly!)') : t('lab2.floated', 'it FLOATED'));
    const right = pred === (floats ? 'floats' : 'sinks');
    const prLine = pred ? `${t('lab2.youPredicted', 'You predicted')} ${pred === 'floats' ? t('lab.floats', 'Floats').toUpperCase() : t('lab.sinks', 'Sinks').toUpperCase()}, ${t('lab2.and', 'and')} ${word(result)}! ${right ? t('lab2.right', 'Great prediction! 🎯') : t('lab2.surprise', 'Surprise! Scientists learn the most from surprises. 🤩')}` : '';
    const ahaLine = sawSink && sawFloat ? t('lab2.ahaLine', 'Aha! The heavy-for-its-size stone sank, the light ones floated. Density is the secret!') : '';
    const xp = el('div', 'ccx-xp', {}, right ? '+10 XP' : '+5 XP');
    const card = el('div', 'ccx-res', { 'data-testid': 'lab-result', 'data-outcome': result },
      el('img', '', { src: STICKER[material], alt: label[material] }),
      el('div', 'tx', {}, el('div', 'big', {}, big), prLine ? el('div', 'pr', {}, prLine) : null, el('div', 'hint', {}, `💡 ${hint}`), ahaLine ? el('div', 'aha', {}, `✨ ${ahaLine}`) : null),
      xp);
    const again = el('button', 'ccx-btn sea', { 'data-testid': 'lab-again' }, '🔁 ', t('lab2.again', 'Try another board'));
    again.onclick = () => { resBox.replaceChildren(); setPred(null); resetBoard(); mats.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); (mats.querySelector('.ccx-mat.on') as HTMLElement | null)?.focus({ preventScroll: true }); };
    const row = el('div', 'ccx-row', { style: 'justify-content:flex-start;margin-top:8px' }, again);
    if (sawFloat) { const done = el('button', 'ccx-btn sun', { 'data-testid': 'lab-finish' }, '🏄 ', t('lab.finish', 'Finish')); done.onclick = () => userClose(); row.append(done); }
    resBox.replaceChildren(card, row);
    resBox.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    if (floats) sfx.ding();
    say(`${big} ${hint}`);
    tip('');
    renderTable(true);
    if (!ahaShown && tries.length >= 3 && sawSink && sawFloat) { ahaShown = true; setTimeout(() => !closed && showAha(), 1600); }
  }

  function renderTable(fresh = false) {
    if (!tries.length) { table.replaceChildren(el('div', 'ccx-empty', {}, t('lab2.emptyTable', 'Your results show up here. Try 3 boards to find the pattern!'))); return; }
    const reveal = tries.length >= 3 && sawSink && sawFloat;
    const sorted = tries.map((x, i) => ({ ...x, i })).sort((a, b) => a.d - b.d);
    const tb = el('tbody');
    let lineDone = false;
    for (const r of sorted) {
      if (reveal && !lineDone && r.d > 1) { tb.append(el('tr', 'line', {}, el('td', '', { colspan: '4' }, `💧 ${t('lab2.waterLine', 'water = 1.0 g/cm³')} 💧`))); lineDone = true; }
      const ok = r.r !== 'sinks';
      const tr = el('tr', fresh && r.i === tries.length - 1 ? 'new' : '', {},
        el('td', '', {}, `${label[r.m]} · ${r.s === 'short' ? t('lab2.short', 'short') : t('lab2.long', 'long')}`),
        el('td', '', {}, String(r.d)),
        el('td', '', {}, r.p ? `${r.p === 'floats' ? '🛟' : '⚓'} ${r.p === (ok ? 'floats' : 'sinks') ? '👍' : '🤔'}` : '–'),
        el('td', ok ? 'ok' : 'no', {}, ok ? `✓ ${r.r === 'wobbles' ? t('lab2.wobbly', 'wobbly') : t('lab2.floatsW', 'floats')}` : `✗ ${t('lab2.sinksW', 'sinks')}`));
      tb.append(tr);
    }
    if (reveal && !lineDone) tb.append(el('tr', 'line', {}, el('td', '', { colspan: '4' }, `💧 ${t('lab2.waterLine', 'water = 1.0 g/cm³')} 💧`)));
    table.replaceChildren(el('table', 'ccx-table', {}, el('thead', '', {}, el('tr', '', {}, el('th', '', {}, t('lab2.board', 'Board')), el('th', '', {}, 'g/cm³'), el('th', '', {}, t('lab2.guess', 'Guess')), el('th', '', {}, t('lab2.result', 'Result')))), tb),
      reveal ? '' : el('div', 'ccx-empty', {}, `${t('lab2.morePattern', 'Try more boards (one that sinks AND one that floats) to find the pattern!')} ${tries.length}/3`));
  }
  renderTable();

  function showAha() {
    const msg = t('lab2.aha', 'Aha! Things float when they are less dense than water!');
    const box = el('div', 'ccx-aha', { role: 'alertdialog', 'aria-label': msg });
    const ok = el('button', 'ccx-btn coral big', { 'data-testid': 'aha-ok' }, '🤙 ', t('lab2.ahaOk', 'Totally tubular!'));
    const card = el('div', 'ccx-aha-card', {}, el('img', '', { src: `${ART}/sam-laugh.webp`, alt: '', style: 'width:110px;height:110px;object-fit:contain;margin-top:-70px;filter:drop-shadow(3px 3px 0 rgba(29,26,58,.4))' }),
      el('h3', '', {}, msg),
      el('p', '', {}, t('lab2.ahaSub', 'Less than 1.0 g/cm³ floats, more than 1.0 sinks. Surfboards are made of foam so they float high and fast!')), ok);
    box.append(card);
    if (!reduced()) for (let i = 0; i < 40; i++) { const c = el('i', 'ccx-confetti'); c.style.left = `${Math.random() * 100}%`; c.style.background = ['#ffc928', '#ff5a6e', '#2fc46a', '#19c3d6', '#cbb8ff'][i % 5]; c.style.animationDelay = `${Math.random() * 0.6}s`; c.style.top = '-20px'; box.append(c); }
    ok.onclick = () => box.remove();
    body.append(box);
    box.style.position = 'fixed';
    sfx.tada(); say(msg);
    ok.focus();
  }

  // ---------------------------------------------------------------- render
  function render() {
    const y0 = Y0(), fl = FLOOR();
    // sky / air above the water
    const sky = g.createLinearGradient(0, 0, 0, y0); sky.addColorStop(0, '#bfeaff'); sky.addColorStop(1, '#e9fbff');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // depth gradient water body
    const surfPath = () => { g.beginPath(); g.moveTo(0, H); for (let i = 0; i < N; i++) g.lineTo((i / (N - 1)) * W, y0 + hgt[i]); g.lineTo(W, H); g.closePath(); };
    const deep = g.createLinearGradient(0, y0 - 20, 0, H); deep.addColorStop(0, '#57dcef'); deep.addColorStop(0.45, '#1fa6d6'); deep.addColorStop(1, '#0b4a73');
    surfPath(); g.fillStyle = deep; g.fill();
    // light rays + caustics
    g.save(); surfPath(); g.clip();
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 4; k++) {
      const x = ((k * 0.29 + time * 0.015) % 1.2 - 0.1) * W;
      const gr = g.createLinearGradient(0, y0, 0, fl); gr.addColorStop(0, 'rgba(255,255,255,.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(x, y0); g.lineTo(x + 40, y0); g.lineTo(x + 110, fl); g.lineTo(x + 50, fl); g.closePath(); g.fill();
    }
    g.lineWidth = 2; g.strokeStyle = 'rgba(190,250,255,.16)';
    for (let k = 0; k < 7; k++) {
      const yy = y0 + 18 + k * ((fl - y0 - 18) / 7);
      g.beginPath();
      for (let x = 0; x <= W; x += 10) g.lineTo(x, yy + Math.sin(x * 0.045 + time * 1.7 + k * 1.9) * 5 + Math.sin(x * 0.11 - time * 2.3 + k) * 3);
      g.stroke();
    }
    g.restore();
    // sand bed, pebbles, seaweed
    g.fillStyle = '#e9c77f'; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 12) g.lineTo(x, fl + Math.sin(x * 0.05) * 3); g.lineTo(W, H); g.closePath(); g.fill();
    g.strokeStyle = '#1d1a3a'; g.lineWidth = 2; g.stroke();
    for (const p of pebbles) { g.fillStyle = p.c; g.beginPath(); g.ellipse(p.x, fl + 6, p.w, p.h, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(29,26,58,.6)'; g.lineWidth = 1.5; g.stroke(); }
    for (const w of weeds) {
      const sway = Math.sin(time * 1.4 + w.ph) * 12 + Math.sin(time * 3 + w.ph) * 2 + (wave * 10 * Math.sin(time * 3.1 - w.x * 0.01));
      for (const [col, lw] of [['#1d1a3a', 9], ['#2fc46a', 5]] as [string, number][]) {
        g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round';
        g.beginPath(); g.moveTo(w.x, fl + 4); g.quadraticCurveTo(w.x - sway * 0.6, fl - w.h * 0.5, w.x + sway, fl - w.h); g.stroke();
      }
    }
    // fish
    drawFish();
    // ambient bubbles
    for (const b of ambient) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.4; g.beginPath(); g.arc(b.x + Math.sin(time * 3 + b.ph) * 2, b.y, b.r, 0, 7); g.stroke(); }
    // the board
    g.save(); g.translate(B.x, B.y); g.rotate(B.ang);
    if (B.phase === 'hover' || B.phase === 'drag') { // shadow on the water + bobbing hand-drop hint
      g.save(); g.rotate(-B.ang); g.fillStyle = 'rgba(11,74,115,.18)'; g.beginPath(); g.ellipse(0, y0 - B.y + 2, B.L * 0.45, 5, 0, 0, 7); g.fill(); g.restore();
    }
    drawBoardSide(g, material, B.L, B.T);
    g.restore();
    // translucent water over the submerged part, so you can SEE how deep it sits
    g.save(); surfPath(); g.clip(); g.fillStyle = 'rgba(25,150,210,.38)'; g.fillRect(0, 0, W, H); g.restore();
    // jelly surface: thick glossy line + ink outline + highlight
    g.beginPath(); for (let i = 0; i < N; i++) g.lineTo((i / (N - 1)) * W, y0 + hgt[i]);
    g.lineJoin = 'round'; g.strokeStyle = '#1d1a3a'; g.lineWidth = 5; g.stroke(); g.strokeStyle = '#a8f3ff'; g.lineWidth = 2.5; g.stroke();
    g.beginPath(); for (let i = 0; i < N; i++) g.lineTo((i / (N - 1)) * W, y0 + hgt[i] + 6); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; g.stroke();
    // water level ticks on the glass
    g.fillStyle = 'rgba(29,26,58,.5)'; for (let k = 0; k < 6; k++) g.fillRect(4, y0 + k * ((fl - y0) / 6), k % 2 ? 6 : 12, 2);
    // wave paddle
    if (wave > 0) { const py = y0 + hgt[0]; g.fillStyle = '#ffc928'; g.strokeStyle = '#1d1a3a'; g.lineWidth = 2.5; g.beginPath(); g.roundRect(0, py - 26, 10, 46, 3); g.fill(); g.stroke(); }
    // particles
    for (const p of parts) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.kind === 'drop') { g.fillStyle = `rgba(120,215,255,${a})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); g.fillStyle = `rgba(255,255,255,${a})`; g.beginPath(); g.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.35, 0, 7); g.fill(); }
      else if (p.kind === 'dust') { g.fillStyle = `rgba(214,180,110,${a * 0.6})`; g.beginPath(); g.arc(p.x, p.y, p.r * (1.6 - a * 0.6), 0, 7); g.fill(); }
      else if (p.kind === 'bubble') { g.strokeStyle = `rgba(255,255,255,${0.4 + a * 0.5})`; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.stroke(); }
      else { g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, p.r * (2 - a), 0, 7); g.stroke(); }
    }
    // glass glints
    g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(W * 0.78, 0); g.lineTo(W * 0.84, 0); g.lineTo(W * 0.66, H); g.lineTo(W * 0.6, H); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(W * 0.87, 0); g.lineTo(W * 0.885, 0); g.lineTo(W * 0.705, H); g.lineTo(W * 0.69, H); g.closePath(); g.fill();
  }
  function drawFish() {
    const f = fish, s = 1 + (W > 500 ? 0.3 : 0);
    g.save(); g.translate(f.x, f.y + Math.sin(f.ph) * 4); g.scale(f.dir * s, s);
    const tail = Math.sin(f.ph * 3) * 4;
    g.fillStyle = '#ff9a3c'; g.strokeStyle = '#1d1a3a'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(-12, 0); g.lineTo(-22, -7 + tail); g.lineTo(-22, 7 + tail); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(0, 0, 14, 8, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(-2, 0, 2.5, 7, 0, 0, 7); g.fill();
    g.fillStyle = '#1d1a3a'; g.beginPath(); g.arc(7, -2, 1.8, 0, 7); g.fill();
    g.restore();
  }

  function update(dt: number) {
    time += dt;
    springs();
    for (let k = 0; k < 4; k++) boardStep(dt / 4);
    // particles
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt;
      if (p.kind === 'drop') { p.vy += G * 0.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.vy > 0 && p.y > surf(p.x)) { vel[colAt(p.x)] += 0.6; p.life = 0; } }
      else if (p.kind === 'dust') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.95; }
      else if (p.kind === 'bubble') { p.y += p.vy * dt; p.x += Math.sin(time * 6 + p.r) * 0.4; if (p.y < surf(p.x) + 2) { p.life = 0; parts.push({ kind: 'puff', x: p.x, y: surf(p.x), vx: 0, vy: 0, life: 0.3, max: 0.3, r: p.r }); } }
      if (p.life <= 0) parts.splice(i, 1);
    }
    if (parts.length > 500) parts.splice(0, parts.length - 500);
    // ambient bubbles
    if (!reduced() && ambient.length < 14 && Math.random() < dt * 3) ambient.push({ x: Math.random() * W, y: FLOOR() - 4, r: 1.5 + Math.random() * 3, sp: 25 + Math.random() * 35, ph: Math.random() * 6 });
    for (let i = ambient.length - 1; i >= 0; i--) { const b = ambient[i]; b.y -= b.sp * dt; if (b.y < surf(b.x) + 3) { ambient.splice(i, 1); parts.push({ kind: 'puff', x: b.x, y: surf(b.x), vx: 0, vy: 0, life: 0.3, max: 0.3, r: b.r }); } }
    // fish swims, darts away after a splash
    const fsp = fish.sp * (reduced() ? 0.5 : 1) * (1 + fish.flee * 2.2);
    fish.flee = Math.max(0, fish.flee - dt);
    fish.x += fish.dir * fsp * dt; fish.ph += dt * (3 + fish.flee * 6);
    if (fish.x > W + 40) { fish.dir = -1; fish.y = Y0() + (FLOOR() - Y0()) * (0.35 + Math.random() * 0.35); }
    if (fish.x < -40) { fish.dir = 1; fish.y = Y0() + (FLOOR() - Y0()) * (0.35 + Math.random() * 0.35); }
  }

  let last = performance.now();
  const loop = (now: number) => {
    if (closed) return;
    const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
    update(dt); render();
    raf = requestAnimationFrame(loop);
  };

  // ---------------------------------------------------------------- keyboard + close
  const onKey = (e: KeyboardEvent) => {
    if (closed) return;
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); const aha = body.querySelector('.ccx-aha'); if (aha) aha.remove(); else userClose(); }
    else if ((e.key === ' ' || e.key === 'Enter') && e.target === cv) { e.preventDefault(); drop(); }
  };
  ov.addEventListener('keydown', onKey);
  const onWinKey = (e: KeyboardEvent) => { if (!closed && e.key === 'Escape' && !ov.contains(e.target as Node)) { e.preventDefault(); userClose(); } };
  window.addEventListener('keydown', onWinKey);
  cv.tabIndex = 0;
  xBtn.onclick = () => userClose();

  function teardown() {
    if (closed) return;
    closed = true; cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('keydown', onWinKey); ov.remove();
  }
  function userClose() { if (closed) return; teardown(); host.onClose(); }

  layout(); resetBoard(); setStep(0);
  tip(t('lab.tipPredict', 'First: will it float or sink? Make a guess!'));
  raf = requestAnimationFrame(loop);
  say(t('lab.predict', 'Pick a material and drop it in. Guess first: will it float?'));
  return { close: teardown };
}
