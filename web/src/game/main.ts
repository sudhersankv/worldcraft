/** Curiosity Craft — core loop: spawn → roam → recall → Wonder Board → 3 questions → Sam's Why Ladder → Surfboard Lab → recall → report. */
import './cc/cc.css';
import type { AskResponse, CuriosityWorld, Lang, Material } from '../shared/curiosity';
import { DENSITY, LANGS } from '../shared/curiosity';
import { Input } from './core/input';
import { Audio } from './core/audio';
import { BEACH, LANG, LANG_NAMES, localAsk, localWonder, questionsForGuess, setLang, t } from './cc/data';
import { ask, emit, fetchWorld, SESSION, startSession, wonder } from './cc/net';
import { Listener, speak, stopSpeech, sttSupported } from './cc/speech';
import { Voxel } from './cc/voxel';
import { ART_CC } from '../shared/art';

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const ROAM_S = DEMO ? 3 : 30;

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else el.setAttribute(k, String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

// ------------------------------------------------------------------ state (the ENGINE owns progress)
const S = {
  world: BEACH as CuriosityWorld,
  xp: 0, level: 0, deepest: 0, asked: 0,
  concepts: new Set<string>(),
  journal: [] as { icon: string; question: string; level: number }[],
  history: [] as { role: 'kid' | 'npc'; text: string }[],
  lastFact: null as string | null,
  phase: 'roam' as 'roam' | 'wonder' | 'sam' | 'lab' | 'end',
  recallBefore: null as boolean | null, recallAfter: null as boolean | null,
  topicIcon: '❓',
  labDone: false,
};
(window as unknown as Record<string, unknown>).__CC = S;

const ui = document.getElementById('ui')!;
const input = new Input();
let vox!: Voxel;

// ------------------------------------------------------------------ HUD
const xpChip = h('div', { class: 'chip panel', 'data-testid': 'xp' });
const ladder = h('div', { id: 'ladder', class: 'panel', 'data-testid': 'ladder' });
const conceptsEl = h('div', { id: 'concepts' });
const hud = h('div', { id: 'hud' }, xpChip, ladder, conceptsEl);
const timer = h('div', { id: 'timer', class: 'panel passive', 'data-testid': 'timer' });
const toastEl = h('div', { id: 'toast', class: 'panel' });
const prompt = h('div', { id: 'prompt', class: 'panel' });
const langSel = h('select', { id: 'lang', 'aria-label': 'Language', 'data-testid': 'lang' }) as HTMLSelectElement;
for (const l of LANGS) langSel.append(h('option', { value: l }, LANG_NAMES[l]));
langSel.value = LANG;
const lucky = h('div', { id: 'lucky' });
const journalBtn = h('button', { class: 'btn', 'data-testid': 'journal-btn', onclick: () => toggleJournal() }, '📔 ', h('span', {}), h('kbd', {}, 'J'));
const topright = h('div', { id: 'topright' }, journalBtn, h('div', {}, langSel, lucky));
const hint = h('div', { id: 'hint' });
ui.append(hud, timer, toastEl, prompt, topright, hint);

function renderHud() {
  xpChip.replaceChildren('✦ ', h('span', { class: 'xp' }, `${S.xp}`), ' curiosity XP');
  ladder.replaceChildren(...[0, 1, 2, 3, 4].map((i) => h('div', { class: `rung${S.asked > 0 && i <= S.level ? ' on' : ''}` })), h('div', { class: 'lbl' }, t('npc.whyLevel', 'Why level {n}', { n: S.level })));
  ladder.dataset.level = String(S.level);
  conceptsEl.replaceChildren(...[...S.concepts].map((id) => h('span', { class: 'cchip' }, S.world.concepts.find((c) => c.id === id)?.name ?? id)));
  (journalBtn.children[0] as HTMLElement).textContent = `${t('journal.title', 'Journal')} ${S.journal.length}`;
  lucky.textContent = t('lang.lucky8', 'Lucky 8 languages');
  hint.innerHTML = `<kbd>WASD</kbd> ${t('ui.move', 'move')} · <kbd>E</kbd> ${t('ui.talk', 'talk')} · <kbd>V</kbd> ${t('npc.holdToTalk', 'hold to talk')} · <kbd>J</kbd> ${t('journal.title', 'Journal')}`;
}
let toastT = 0;
function toast(s: string, ms = 2600) { toastEl.textContent = s; toastEl.classList.add('show'); clearTimeout(toastT); toastT = window.setTimeout(() => toastEl.classList.remove('show'), ms); }
function xpFly(n: number) {
  S.xp += n; renderHud();
  const r = xpChip.getBoundingClientRect();
  const f = h('div', { id: 'xpfly', style: `left:${r.right + 8}px;top:${r.top}px` }, `+${n} XP`);
  ui.append(f); setTimeout(() => f.remove(), 1200);
  Audio.play('coins', { volume: 0.6 });
}
langSel.addEventListener('change', async () => { await setLang(langSel.value as Lang); emit('lang', { lang: langSel.value }); renderHud(); toast(LANG_NAMES[langSel.value as Lang]); });

// ------------------------------------------------------------------ modal helpers
let modal: HTMLElement | null = null;
function open(card: HTMLElement): HTMLElement { close(); modal = h('div', { class: 'veil' }, card); ui.append(modal); vox.frozen = true; return modal; }
function close() { modal?.remove(); modal = null; if (vox) vox.frozen = !!samBox; }

let activeMic: { start: () => void; stop: () => void } | null = null;
function micButton(onFinal: (t: string) => void, interimEl: HTMLElement): HTMLButtonElement {
  const b = h('button', { class: `mic${sttSupported ? '' : ' off'}`, title: t('npc.holdToTalk', 'Hold to talk'), 'aria-label': t('npc.holdToTalk', 'Hold to talk'), 'data-testid': 'mic' }) as HTMLButtonElement;
  b.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><rect x="8" y="2" width="8" height="13" rx="2" fill="#1b1035"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4" stroke="#1b1035" stroke-width="2.6" fill="none"/></svg>';
  const L = new Listener(LANG, (s) => (interimEl.textContent = s), (s) => { interimEl.textContent = s; onFinal(s); }, (st) => { b.classList.toggle('live', st === 'listening'); if (st === 'error') interimEl.textContent = t('npc.micError', 'Mic not available, type instead!'); });
  const down = (e: Event) => { e.preventDefault(); if (!sttSupported) { interimEl.textContent = t('npc.micError', 'Mic not available, type instead!'); return; } L.start(); };
  const up = () => L.stop();
  b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up);
  activeMic = { start: () => L.start(), stop: up };
  return b;
}

/** Typewriter that starts when the voice starts and is paced to its length. */
async function sayLine(el: HTMLElement, text: string) {
  el.textContent = '';
  let shown = false;
  const reveal = (ms: number) => {
    if (shown) return; shown = true;
    const n = text.length; const per = Math.max(12, Math.min(70, ms / Math.max(1, n)));
    let i = 0; const step = () => { if (!el.isConnected) return; i = Math.min(n, i + 2); el.textContent = text.slice(0, i); if (i < n) setTimeout(step, per * 2); };
    step();
  };
  const fallback = setTimeout(() => reveal(text.length * 30), 3800); // captions never stay empty
  await speak(text, LANG, S.world.npc.voice, reveal);
  clearTimeout(fallback); if (!shown) reveal(text.length * 20);
}

// ------------------------------------------------------------------ 1) roam
function roam() {
  S.phase = 'roam';
  let left = ROAM_S;
  const render = () => (timer.textContent = `🧭 ${t('roam.title', 'Explore!')} ${Math.max(0, left)}s`);
  render();
  const iv = setInterval(() => {
    left--; render();
    if (left <= 0) { clearInterval(iv); timer.remove(); emit('roam_end', { seconds: ROAM_S }); recall('before', () => wonderBoard()); }
  }, 1000);
}

// ------------------------------------------------------------------ recall (before / after)
function recall(when: 'before' | 'after', then: () => void) {
  const r = S.world.recall;
  const fb = h('div', { class: 'result' });
  const card = h('div', { class: 'card panel', 'data-testid': `recall-${when}` },
    h('div', { class: 'kicker' }, when === 'before' ? t('recall.before', 'Quick guess before we start!') : t('recall.after', 'Now that you tried it…')),
    h('h2', {}, r.prompt),
    h('div', { class: 'choices' }, ...r.choices.map((c, i) => {
      const b = h('button', { class: 'btn choice', 'data-testid': `recall-choice-${i}` }, c) as HTMLButtonElement;
      b.onclick = () => {
        const ok = i === r.answerIndex;
        if (when === 'before') S.recallBefore = ok; else S.recallAfter = ok;
        emit(when === 'before' ? 'recall_before' : 'recall_after', { correct: ok, choice: i, conceptId: r.conceptId });
        card.querySelectorAll('button.choice').forEach((x, k) => { (x as HTMLButtonElement).disabled = true; if (k === r.answerIndex && when === 'after') x.classList.add('right'); });
        if (when === 'after') { b.classList.add(ok ? 'right' : 'wrong'); fb.textContent = ok ? t('recall.correct', 'Yes! You remembered.') : t('recall.wrong', 'Good try! Look at the green answer.'); }
        else fb.textContent = t('recall.thanks', "Thanks! Let's find out together.");
        Audio.play('confirm');
        setTimeout(() => { close(); then(); }, when === 'after' ? 1600 : 600);
      };
      return b;
    })), fb);
  open(card);
}

// ------------------------------------------------------------------ 2) Wonder Board
function wonderBoard() {
  S.phase = 'wonder';
  const cv = h('canvas', { width: 640, height: 480, 'data-testid': 'wonder-canvas' }) as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#fffdf5'; g.fillRect(0, 0, 640, 480); g.lineCap = 'round'; g.lineJoin = 'round';
  let color = '#1e9fe0', drawn = false, drawing = false;
  const undo: ImageData[] = [];
  const pos = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * 640, y: ((e.clientY - r.top) / r.height) * 480 }; };
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); if (undo.length > 20) undo.shift(); undo.push(g.getImageData(0, 0, 640, 480)); drawing = true; const p = pos(e); g.strokeStyle = color; g.lineWidth = e.pointerType === 'pen' && e.pressure ? 4 + e.pressure * 14 : 10; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + 0.1, p.y); g.stroke(); drawn = true; });
  cv.addEventListener('pointermove', (e) => { if (!drawing) return; const p = pos(e); g.lineTo(p.x, p.y); g.stroke(); });
  const end = () => { drawing = false; }; cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  const sw = ['#1e9fe0', '#4fe0e8', '#ffd23c', '#ff9a3c', '#ff5d8f', '#5ec84a', '#8a5a32', '#1b1035'];
  const pal = h('div', { class: 'palette' }, ...sw.map((c) => { const s = h('button', { class: `swatch${c === color ? ' on' : ''}`, style: `background:${c}`, 'aria-label': c }); s.onclick = () => { color = c; pal.querySelectorAll('.swatch').forEach((x) => x.classList.remove('on')); s.classList.add('on'); }; return s; }),
    h('button', { class: 'btn', onclick: () => { const d = undo.pop(); if (d) g.putImageData(d, 0, 0); } }, '↶ ', t('wonder.undo', 'Undo')),
    h('button', { class: 'btn', onclick: () => { undo.push(g.getImageData(0, 0, 640, 480)); g.fillStyle = '#fffdf5'; g.fillRect(0, 0, 640, 480); drawn = false; } }, t('wonder.clear', 'Clear')));
  const text = h('input', { class: 'wtext', type: 'text', placeholder: t('wonder.placeholder', 'Or type: I wonder…'), 'data-testid': 'wonder-text' }) as HTMLInputElement;
  text.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') void submit(); });
  const interim = h('div', { class: 'interim' });
  const mic = micButton((s) => { text.value = s; void submit(); }, interim);
  const status = h('div', { class: 'result' });
  const starters = h('div', { class: 'starters' }, ...S.world.starters.map((s) => h('button', { class: 'btn', 'data-testid': `starter-${s.id}`, onclick: () => { S.topicIcon = s.icon; emit('wonder_submit', { starter: s.id, hasDrawing: drawn, source: 'starter' }); showQuestions(s.questions); } }, ART_CC.icons[s.id] ? h('img', { class: 'sicon', src: ART_CC.icons[s.id], alt: '' }) : h('span', { class: 'ic' }, s.icon), t(`starter.${s.id}`, s.label))));
  let busy = false;
  const submit = async () => {
    if (busy) return;
    const txt = text.value.trim();
    if (!txt && !drawn) { status.textContent = t('wonder.empty', 'Draw something, say it, or type it first!'); return; }
    busy = true;
    status.textContent = t('wonder.thinking', 'Hmm, let me look…');
    let res;
    try { res = await wonder({ image: drawn ? cv.toDataURL('image/png') : undefined, text: txt || undefined, lang: LANG, worldId: 'beach' }); if (!res?.questions?.length) throw new Error('empty'); }
    catch { res = localWonder(txt, drawn, S.world); }
    busy = false;
    emit('wonder_submit', { text: txt, hasDrawing: drawn, guess: res.guess, confidence: res.confidence, source: res.source });
    S.topicIcon = S.world.starters.find((s) => s.label.toLowerCase() === (res.guess ?? '').toLowerCase())?.icon ?? '❓';
    if (res.confidence < 0.5 && res.guesses?.length) {
      const r = res;
      body.replaceChildren(h('div', { style: 'grid-column:1/-1' }, h('h2', {}, t('wonder.isIt', 'Is it a…?')), h('div', { class: 'qcards' }, ...r.guesses.slice(0, 3).map((gs) => h('button', { class: 'btn qcard', 'data-testid': 'guess', onclick: () => { emit('wonder_guess', { guess: gs }); S.topicIcon = S.world.starters.find((s) => s.label.toLowerCase() === gs.toLowerCase())?.icon ?? '❓'; showQuestions(r.source === 'llm' && gs === r.guess ? r.questions : questionsForGuess(gs, S.world)); } }, gs)))));
    } else showQuestions(res.questions);
  };
  const body = h('div', { class: 'wb' },
    h('div', {}, h('div', { class: 'canvaswrap' }, cv), pal),
    h('div', {}, h('div', { class: 'kicker' }, t('starters.title', 'Or pick one')), starters,
      h('div', { class: 'row', style: 'margin-top:10px' }, mic, interim), text,
      h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn gold big', 'data-testid': 'wonder-submit', onclick: () => void submit() }, t('wonder.submit', 'I wonder!'))), status));
  const card = h('div', { class: 'card panel', 'data-testid': 'wonder-board' }, h('div', { class: 'kicker' }, 'Wonder Board'), h('h2', {}, t('wonder.title', 'What do you wonder about?')), body);
  open(card);
  void speak(t('wonder.title', 'What do you wonder about?'), LANG, S.world.npc.voice, () => undefined);
  function showQuestions(qs: string[]) {
    body.replaceChildren(h('div', { style: 'grid-column:1/-1' }, h('h2', {}, t('wonder.pickQuestion', 'Pick a question to explore!')),
      h('div', { class: 'qcards' }, ...qs.slice(0, 3).map((q, i) => h('button', { class: 'btn qcard', 'data-testid': `question-${i}`, onclick: () => { emit('question_pick', { question: q, index: i }); close(); travelToSam(q); } }, q)))));
  }
}

// ------------------------------------------------------------------ 3) Why Ladder with Sam
let samBox: HTMLElement | null = null;
let samRefs: { say: HTMLElement; hook: HTMLElement; kid: HTMLElement; tryBtn: HTMLButtonElement; whyBtn: HTMLButtonElement; face: HTMLImageElement } | null = null;
function travelToSam(q: string) {
  S.phase = 'sam';
  vox.teleportNear(vox.sam);
  vox.flyTo(vox.sam.x, vox.sam.z);
  toast(`🏄 ${t('wonder.goTo', 'To Surfer Sam!')}`);
  setTimeout(() => { vox.followPlayer(); openSam(); void askSam(q, false); }, 900);
}
function openSam() {
  if (samBox) return;
  vox.frozen = true;
  const say = h('div', { class: 'say', 'data-testid': 'sam-answer', 'aria-live': 'polite' });
  const hook = h('div', { class: 'hook', 'data-testid': 'sam-hook' });
  const kid = h('div', { class: 'kid' });
  const interim = h('div', { class: 'interim' });
  const txt = h('input', { type: 'text', placeholder: t('npc.typeInstead', 'Ask Sam anything…'), 'data-testid': 'sam-input' }) as HTMLInputElement;
  const send = () => { const v = txt.value.trim(); if (v) { txt.value = ''; void askSam(v, /^(why|por qu|pourquoi|waarom|为什么|क्यों|ஏன்)/i.test(v) && v.split(/\s+/).length <= 3); } };
  txt.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') send(); });
  const whyBtn = h('button', { class: 'btn why', 'data-testid': 'why', onclick: () => void askSam(t('npc.why', 'Why?'), true) }, t('npc.why', 'Why?')) as HTMLButtonElement;
  const tryBtn = h('button', { class: 'btn mint big', 'data-testid': 'try-it', style: 'display:none', onclick: () => { closeSam(); openLab(); } }, '🧪 ', t('tryit.button', 'Try it!')) as HTMLButtonElement;
  const mic = micButton((s) => void askSam(s, /^(why|por qu|pourquoi|waarom|为什么|क्यों|ஏன்)/i.test(s.trim()) && s.trim().split(/\s+/).length <= 3), interim);
  const face = h('img', { class: 'samface', src: ART_CC.sam.happy, alt: 'Surfer Sam' }) as HTMLImageElement;
  samBox = h('div', { id: 'sam', class: 'panel', 'data-testid': 'sam-panel' }, face,
    h('div', { class: 'name' }, S.world.npc.name), kid, say, hook,
    h('div', { class: 'ctrl' }, whyBtn, mic, interim, txt, h('button', { class: 'btn sky', onclick: send }, t('npc.ask', 'Ask')), tryBtn, h('button', { class: 'btn ghost', 'data-testid': 'sam-close', onclick: () => closeSam() }, '✕')));
  samRefs = { say, hook, kid, tryBtn, whyBtn, face };
  if (S.level >= 2 || S.labDone) tryBtn.style.display = '';
  ui.append(samBox);
}
function closeSam() { samBox?.remove(); samBox = null; samRefs = null; stopSpeech(); vox.sam.talk = false; vox.frozen = !!modal; asking = false; }

let asking = false;
async function askSam(question: string, isWhy: boolean) {
  if (!samRefs || asking) return;
  asking = true;
  const R = samRefs;
  R.kid.textContent = `${t('ui.you', 'You')}: “${question}”`;
  R.whyBtn.disabled = true;
  // ENGINE awards progress: XP for every question; +1 ladder level per follow-up "why"
  if (isWhy && S.asked > 0) { S.level++; S.deepest = Math.max(S.deepest, S.level); emit('why_level', { level: S.level }); }
  S.asked++;
  emit('question_asked', { question, level: S.level, why: isWhy });
  xpFly(isWhy ? 15 : 10);
  const prev = S.history.length ? S.history[S.history.length - 1].text : '';
  const req = { worldId: 'beach' as const, lang: LANG, sessionId: SESSION, question: isWhy && prev ? `Why? (about: ${prev})` : question, level: S.level, history: S.history.slice(-8) };
  let res: AskResponse;
  R.face.src = ART_CC.sam.thinking;
  const local = localAsk({ ...req, question }, S.lastFact);
  try { res = await ask(req); if (!res?.answer) throw new Error('empty'); }
  catch { res = local; }
  S.lastFact = local.factId || S.lastFact;
  S.history.push({ role: 'kid', text: question }, { role: 'npc', text: `${res.answer} ${res.whyHook}` });
  for (const c of res.conceptIds ?? []) if (!S.concepts.has(c)) { S.concepts.add(c); emit('concept', { id: c }); }
  if (isWhy && S.journal.length) S.journal[S.journal.length - 1].level = S.level;
  else { S.journal.push({ icon: S.topicIcon, question, level: S.level }); emit('journal_card', { question, level: S.level }); }
  renderHud();
  if (res.suggestChallenge || S.level >= 2) R.tryBtn.style.display = '';
  R.face.src = res.grounded === false ? ART_CC.sam.laughing : ART_CC.sam.happy;
  vox.sam.talk = true;
  R.hook.textContent = '';
  await sayLine(R.say, res.answer);
  if (samRefs === R) await sayLine(R.hook, res.whyHook);
  vox.sam.talk = false;
  R.whyBtn.disabled = false;
  if (samRefs === R) asking = false;
}

// ------------------------------------------------------------------ 4) Surfboard Lab (pure client buoyancy sim)
function openLab() {
  S.phase = 'lab';
  let material: Material = 'stone', shape: 'short' | 'long' = 'short';
  const cv = h('canvas', { width: 720, height: 300, 'data-testid': 'lab-canvas' }) as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  const result = h('div', { class: 'result', 'data-testid': 'lab-result' });
  const sticker = h('img', { class: 'sticker', alt: '' }) as HTMLImageElement;
  const mats: Material[] = ['stone', 'wood', 'foam', 'fiberglass-foam'];
  const icon: Record<Material, string> = { stone: '🪨', wood: '🪵', foam: '🧽', 'fiberglass-foam': '🏄' };
  const colorOf: Record<Material, string> = { stone: '#9197a2', wood: '#c8954f', foam: '#fff4c8', 'fiberglass-foam': '#ffd23c' };
  const label: Record<Material, string> = { stone: t('lab.mat.stone', 'Stone'), wood: t('lab.mat.wood', 'Wood'), foam: t('lab.mat.foam', 'Foam'), 'fiberglass-foam': t('lab.mat.fiberglass', 'Fiberglass + foam') };
  const matRow = h('div', { class: 'row' }, ...mats.map((m) => h('button', { class: `btn opt${m === material ? ' on' : ''}`, 'data-testid': `mat-${m}`, onclick: (e: Event) => { material = m; matRow.querySelectorAll('.opt').forEach((x) => x.classList.remove('on')); (e.currentTarget as HTMLElement).classList.add('on'); draw(-60, 0); } }, icon[m], ' ', label[m])));
  const shapeRow = h('div', { class: 'row' }, ...(['short', 'long'] as const).map((s) => h('button', { class: `btn opt${s === shape ? ' on' : ''}`, 'data-testid': `shape-${s}`, onclick: (e: Event) => { shape = s; shapeRow.querySelectorAll('.opt').forEach((x) => x.classList.remove('on')); (e.currentTarget as HTMLElement).classList.add('on'); draw(-60, 0); } }, s === 'short' ? t('lab.shape.short', 'Short board') : t('lab.shape.long', 'Long board'))));
  const waveIn = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: '0.3', 'aria-label': 'Wave size' }) as HTMLInputElement;
  let wave = 0.3, tt = 0, raf = 0;
  waveIn.oninput = () => { wave = Number(waveIn.value); vox.setWave(wave); };
  waveIn.onchange = () => emit('challenge_attempt', { challenge: 'wave-maker', choice: wave.toFixed(2), result: wave > 0.6 ? 'big waves' : 'small waves' });
  const WL = 150;
  function draw(boardY: number, tilt: number) {
    g.fillStyle = '#bfe8ff'; g.fillRect(0, 0, 720, 300);
    g.fillStyle = '#ffe9a8'; g.fillRect(0, 272, 720, 28);
    g.fillStyle = 'rgba(30,159,224,0.75)';
    g.beginPath(); g.moveTo(0, 300);
    for (let x = 0; x <= 720; x += 12) g.lineTo(x, WL + Math.sin(x * 0.03 + tt * 3) * (4 + wave * 14));
    g.lineTo(720, 300); g.closePath(); g.fill();
    const len = shape === 'long' ? 260 : 150;
    g.save(); g.translate(360, boardY); g.rotate(tilt);
    g.fillStyle = colorOf[material]; g.strokeStyle = '#1b1035'; g.lineWidth = 4;
    g.beginPath(); g.roundRect(-len / 2, -12, len, 24, 12); g.fill(); g.stroke();
    if (material === 'stone') { g.fillStyle = 'rgba(0,0,0,.15)'; for (let i = 0; i < 8; i++) g.fillRect(-len / 2 + 10 + i * (len / 8), -6 + (i % 2) * 6, 10, 6); }
    if (material === 'fiberglass-foam') { g.fillStyle = '#ff5d8f'; g.fillRect(-4, -12, 8, 24); }
    if (material === 'foam' || material === 'fiberglass-foam') { g.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 10; i++) { g.beginPath(); g.arc(-len / 2 + 14 + i * (len - 28) / 9, (i % 3) * 5 - 5, 2.5, 0, 7); g.fill(); } }
    g.restore();
    g.fillStyle = '#1b1035'; g.font = 'bold 16px sans-serif'; g.fillText(`${t('lab.density', 'Density')}: ${DENSITY[material]} g/cm³   (${t('lab.water', 'water')} = 1.0)`, 14, 24);
  }
  draw(-60, 0);
  let attempts = 0;
  const drop = () => {
    cancelAnimationFrame(raf);
    attempts++;
    const d = DENSITY[material];
    const floats = d < 1;
    const stable = shape === 'long' ? 0.35 : 1;
    const eq = WL - 12 + d * 24;
    let y = 20, v = 0; tt = 0;
    result.textContent = '';
    const outcome = !floats ? 'sank' : d < 0.2 ? 'floated-high' : 'floated';
    if (material === 'stone') setTimeout(() => Audio.play('wrong', { volume: 0.5 }), 500);
    const step = () => {
      tt += 1 / 60;
      if (floats) { v += (eq - y) * 0.02; v *= 0.9; y += v * 3; }
      else { v = Math.min(v + 0.4, 1 + (d - 1) * 2); y = Math.min(256, y + v * 2.2); }
      draw(y, floats ? Math.sin(tt * 3) * 0.06 * stable * (1 + wave) : Math.min(0.3, tt * 0.1));
      if (tt < 2.4) raf = requestAnimationFrame(step); else finish();
    };
    step();
    function finish() {
      result.dataset.outcome = outcome;
      const art = (ART_CC.lab as Record<string, string>)[material === 'fiberglass-foam' ? 'foam' : material]; if (art) { sticker.src = art; sticker.classList.remove('pop'); void sticker.offsetWidth; sticker.classList.add('pop'); }
      emit('challenge_attempt', { challenge: 'surfboard-lab', choice: `${material}-${shape}`, result: outcome, attempt: attempts });
      xpFly(5);
      if (outcome === 'sank') void sayLine(result, `🫧 ${t('lab.fail.1', 'BLOOP! Stone is denser than water, 2.6 times! What is lighter for its size?')}`);
      else if (outcome === 'floated') void sayLine(result, `🪵 ${t('lab.result.wobbles', 'It floats, but sits low. Can you find something even lighter for its size?')}`);
      else {
        S.labDone = true;
        void sayLine(result, `🏄 ${t('lab.success', 'It floats high! Foam is full of air bubbles, so it is super light for its size. Sam can surf!')}${shape === 'long' ? ' ' + t('lab.hint.shape', 'And the long board is extra steady!') : ''}`);
        Audio.play('jingle-success');
        doneRow.style.display = '';
      }
    }
  };
  const doneRow = h('div', { class: 'row', style: 'display:none' },
    h('button', { class: 'btn sky big', 'data-testid': 'watch-surf', onclick: () => { close(); vox.samSurf(true); vox.flyTo(8, 22); toast(t('lab.watch', 'Go Sam, go!'), 4000); setTimeout(() => { vox.samSurf(false); vox.followPlayer(); finale(); }, 6500); } }, t('lab.watchBtn', 'Watch Sam surf!')),
    h('button', { class: 'btn gold big', 'data-testid': 'lab-finish', onclick: () => { cancelAnimationFrame(raf); close(); finale(); } }, t('lab.finish', 'Finish')));
  const card = h('div', { class: 'card panel lab', 'data-testid': 'lab' },
    h('div', { class: 'kicker' }, t('tryit.button', 'Try it!')), h('h2', {}, t('lab.title', 'Surfboard Lab: what floats?')),
    h('div', { class: 'kicker', style: 'margin-top:4px' }, t('lab.materials', 'Material')), matRow,
    h('div', { class: 'kicker', style: 'margin-top:8px' }, t('lab.shapes', 'Shape')), shapeRow,
    h('div', { style: 'margin:8px 0' }, cv),
    h('div', { class: 'row' }, h('button', { class: 'btn gold big', 'data-testid': 'drop', onclick: drop }, '⬇ ', t('lab.drop', 'Drop it in!')), h('span', { class: 'spacer' }), h('label', { class: 'row' }, '🌊 ', t('wave.title', 'Wave maker'), waveIn)),
    h('div', { class: 'row' }, sticker, result), doneRow);
  open(card);
  void speak(t('lab.predict', 'Pick a material and drop it in. Guess first: will it float?'), LANG, S.world.npc.voice, () => undefined);
}

// ------------------------------------------------------------------ 5) end: recall again + report
function finale() {
  S.phase = 'end';
  recall('after', () => {
    const w = S.world;
    const card = h('div', { class: 'card panel', 'data-testid': 'end' },
      h('div', { class: 'kicker' }, t('report.forParents', 'Curiosity report')), h('h2', {}, t('end.title', 'You are a curious scientist!')),
      h('div', {}, h('span', { class: 'stat', 'data-testid': 'stat-questions' }, h('b', {}, String(S.asked)), t('report.questions', 'questions')), h('span', { class: 'stat', 'data-testid': 'stat-level' }, h('b', {}, String(S.deepest)), t('report.deepest', 'deepest why')), h('span', { class: 'stat' }, h('b', {}, String(S.concepts.size)), t('report.concepts', 'ideas')), h('span', { class: 'stat' }, h('b', {}, String(S.xp)), 'XP')),
      h('p', { style: 'font-size:18px' }, `🏠 ${w.tryAtHome}`),
      h('p', { style: 'font-size:16px;color:var(--dim)' }, `📚 ${w.realWorld.book} · 👩‍🔬 ${w.realWorld.job} · 🌟 ${w.realWorld.person}`),
      h('div', { class: 'row' }, h('button', { class: 'btn gold big', 'data-testid': 'report', onclick: () => { emit('report_view', {}); const url = `/#report/${encodeURIComponent(SESSION)}`; if (window.top !== window) window.open(url, '_blank'); else location.href = url; } }, t('report.title', 'See your report')), h('button', { class: 'btn', onclick: () => { close(); S.phase = 'sam'; } }, t('end.keep', 'Keep exploring'))));
    open(card);
    void speak(t('end.title', 'You are a curious scientist!'), LANG, w.npc.voice, () => undefined);
  });
}

// ------------------------------------------------------------------ journal
let journalEl: HTMLElement | null = null;
function toggleJournal() {
  if (journalEl) { journalEl.remove(); journalEl = null; return; }
  journalEl = h('div', { id: 'journal', class: 'panel', 'data-testid': 'journal' }, h('div', { class: 'row' }, h('h2', {}, t('journal.title', 'Journal')), h('span', { class: 'spacer' }), h('button', { class: 'btn ghost', onclick: () => toggleJournal() }, '✕')),
    ...(S.journal.length ? S.journal.map((j) => h('div', { class: 'jcard' }, h('span', { class: 'ic' }, j.icon), h('span', {}, j.question), h('span', { class: 'lv' }, `${t('npc.why', 'Why?')} ${j.level}`))) : [h('p', {}, t('journal.empty', 'Ask questions to collect cards!'))]));
  ui.append(journalEl);
}

// ------------------------------------------------------------------ boot
async function boot() {
  const [remote] = await Promise.all([fetchWorld('beach'), startSession(LANG)]);
  if (remote?.facts?.length && remote.starters?.length) S.world = { ...BEACH, ...remote };
  vox = new Voxel(document.getElementById('game')!, input, 'beach');
  vox.onInteract = () => { if (S.phase === 'sam' || S.phase === 'end') openSam(); };
  vox.onTick = () => {
    for (const a of input.take()) {
      if (a === 'book') toggleJournal();
      if (a === 'interact' && !modal && !samBox && vox.near === 'sam' && (S.phase === 'sam' || S.phase === 'end')) openSam();
      if (a === 'voice') activeMic?.start();
      if (a === 'pause' && samBox && !asking) closeSam();
    }
    for (const r of input.takeReleased()) if (r === 'voice') activeMic?.stop();
    if (vox.near === 'sam' && !samBox && !modal && (S.phase === 'sam' || S.phase === 'end')) {
      const p = vox.screen(vox.sam.x, vox.sam.y + 1.45, vox.sam.z);
      prompt.innerHTML = `<kbd>E</kbd> ${t('ui.talkSam', 'Talk to Sam')}`; prompt.style.left = `${p.x}px`; prompt.style.top = `${p.y}px`; prompt.classList.add('show');
    } else prompt.classList.remove('show');
  };
  vox.start();
  addEventListener('pointerdown', () => Audio.init(), { once: true });
  addEventListener('keydown', () => Audio.init(), { once: true });
  renderHud();
  document.getElementById('loading')?.classList.add('gone');
  setTimeout(() => document.getElementById('loading')?.remove(), 500);
  emit('session_start', { lang: LANG, worldId: 'beach', demo: DEMO });
  emit('spawn', { worldId: 'beach' });
  emit('lang', { lang: LANG });
  roam();
  (window as unknown as Record<string, unknown>).__CCvox = vox;
}
boot().catch((e) => { console.error(e); const l = document.getElementById('loading'); if (l) l.textContent = 'Oops! Reload to try again.'; });
