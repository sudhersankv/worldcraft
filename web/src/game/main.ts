/** Curiosity Craft — core loop: spawn → roam → recall → Wonder Board → 3 questions → Sam's Why Ladder → Surfboard Lab → recall → report. */
import './cc/cc.css';
import type { AskResponse, CuriosityWorld, Lang, Material, WorldTag } from '../shared/curiosity';
import { DENSITY, LANGS } from '../shared/curiosity';
import { Input } from './core/input';
import { Audio } from './core/audio';
import { BEACH, EGGS, LANG, LANG_NAMES, localAsk, localWonder, questionsForGuess, setLang, t } from './cc/data';
import { ask, emit, fetchWorld, SESSION, startSession, wonder } from './cc/net';
import { HandsFree, Listener, setMuted, speak, speakQuick, stopSpeech, sttSupported } from './cc/speech';
import { BIOME_PLACES, BIOMES, BOARD, LAB_DOCK, NPC_SPOTS, PLACES, Voxel, type Biome } from './cc/voxel';
import { createLab3D, type Lab3D } from './cc/lab3d';
import { ART_CC } from '../shared/art';

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const ROAM_S = DEMO ? 3 : 30;

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (tag === 'button') (el as HTMLButtonElement).type = 'button';
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
  phase: 'roam' as 'roam' | 'board' | 'wonder' | 'sam' | 'lab' | 'end',
  pendingQ: null as string | null,
  pendingBiome: 'beach' as Biome,
  labArrived: false,
  visited: new Set<string>(),
  lastConcepts: [] as string[],
  biome: 'beach' as Biome,
  askedBiomes: new Set<string>(),
  recallBefore: null as boolean | null, recallAfter: null as boolean | null,
  topicIcon: '❓',
  labDone: false,
  wonders: new Set<string>(),
};
(window as unknown as Record<string, unknown>).__CC = S;
const W8 = window as unknown as { __CCboot?: number };
W8.__CCboot = (W8.__CCboot ?? 0) + 1;

// ------------------------------------------------------------------ biomes / NPCs (fact sheets come from /api/cc/worlds/<id>)
const stub = (id: string, name: string, npc: string, npcName: string, voice: string, greeting: string, starters: { id: string; label: string; icon: string; questions: string[] }[]): CuriosityWorld =>
  ({ ...BEACH, id: id as WorldTag, name, npc: { id: npc, name: npcName, persona: '', voice, greeting }, facts: [], concepts: [], starters });
const WORLDS: Record<Biome, CuriosityWorld> = {
  beach: BEACH,
  volcano: stub('volcano', 'Ember Peak', 'rocky', 'Rocky the Lava Golem', 'aura-2-zeus-en', 'Rumble rumble! I am Rocky. Ask me about volcanoes!', [
    { id: 'volcano', label: 'Volcano', icon: '🌋', questions: ['Why do volcanoes erupt?', 'What is lava made of?', 'Why is lava so hot?'] },
    { id: 'lava', label: 'Lava', icon: '🔥', questions: ['Why does lava glow?', 'What happens when lava cools?', 'Why is obsidian so shiny?'] }]),
  ice: stub('ice', 'Frostbite Cave', 'penny', 'Penny the Penguin', 'aura-2-luna-en', 'Brrr, hi! I am Penny. Ask me about ice and snow!', [
    { id: 'snowflake', label: 'Snowflake', icon: '❄️', questions: ['Why does ice float?', 'Why do snowflakes have six sides?', 'How do penguins stay warm?'] },
    { id: 'iceberg', label: 'Iceberg', icon: '🧊', questions: ['Why do icebergs float?', 'Why is ice slippery?', 'Why is snow white?'] }]),
  jungle: stub('jungle', 'Whispering Jungle', 'fern', 'Fern the Tree Frog', 'aura-2-thalia-en', 'Ribbit! I am Fern. Ask me about the jungle!', [
    { id: 'frog', label: 'Frog', icon: '🐸', questions: ['Why do frogs live near water?', 'How do tree frogs stick to leaves?', 'Why are some frogs so colorful?'] },
    { id: 'leaf', label: 'Giant leaf', icon: '🍃', questions: ['Why are jungle leaves so big?', 'How do plants make food?', 'Why does it rain so much in the jungle?'] }]),
};
const tagToBiome = (tag?: string): Biome => (tag === 'volcano' || tag === 'ice' || tag === 'jungle' ? tag : 'beach');
const npcBiome = (npc: string): Biome => (Object.keys(BIOMES) as Biome[]).find((b) => BIOMES[b].npc === npc) ?? 'beach';
function curWorld(): CuriosityWorld { return WORLDS[S.biome] ?? BEACH; }
function npcActor(b: Biome = S.biome) { return b === 'beach' ? vox.sam : vox.npcs[BIOMES[b].npc]; }
const CONCEPT_NAMES = new Map<string, string>();
function conceptName(id: string) {
  const n = CONCEPT_NAMES.get(id); if (n) return n; for (const w of Object.values(WORLDS)) { const c = w.concepts.find((x) => x.id === id); if (c) return c.name; } return id.replace(/-/g, ' '); }

const ui = document.getElementById('ui')!;
const input = new Input();
let vox!: Voxel;
let lab3d: Lab3D | null = null;
const labPanelBtn = h('button', { class: 'btn mint', 'data-testid': 'lab-panel', style: 'display:none', onclick: () => openLab() }, '🧪 ', 'Lab panel');

// ------------------------------------------------------------------ HUD
const xpChip = h('div', { class: 'chip panel', 'data-testid': 'xp' });
const ladder = h('div', { id: 'ladder', class: 'panel', 'data-testid': 'ladder' });
const conceptsEl = h('div', { id: 'concepts' });
const wondersChip = h('div', { class: 'chip panel', 'data-testid': 'wonders' });
const questEl = h('div', { class: 'quest panel', 'data-testid': 'quest', style: 'display:none' });
const qArrow = h('div', { id: 'qarrow' }, '➤');
const exitBtn = h('button', { class: 'btn exit', 'data-testid': 'exit', title: 'Leave the island' }, '← ', t('ui.exit', 'Exit'));
exitBtn.onclick = () => { if (!confirm(t('ui.leave', 'Leave the island? Your journal is saved.'))) return; if (window.top !== window) window.open('/', '_top'); else location.href = '/'; };
const logo = h('img', { class: 'logo-mark', src: '/art/cc/logo-mark.webp', alt: 'Curiosity Craft' });
const hud = h('div', { id: 'hud' }, h('div', { class: 'row hudtop' }, exitBtn, logo), questEl, labPanelBtn, xpChip, wondersChip, ladder, conceptsEl);
const timer = h('div', { id: 'timer', class: 'panel passive', 'data-testid': 'timer' });
const toastEl = h('div', { id: 'toast', class: 'panel' });
const prompt = h('div', { id: 'prompt', class: 'panel' });
const langSel = h('select', { id: 'lang', 'aria-label': 'Language', 'data-testid': 'lang' }) as HTMLSelectElement;
for (const l of LANGS) langSel.append(h('option', { value: l }, LANG_NAMES[l]));
langSel.value = LANG;
const lucky = h('div', { id: 'lucky' });
const journalBtn = h('button', { class: 'btn', 'data-testid': 'journal-btn', onclick: () => toggleJournal() }, '📔 ', h('span', {}), h('kbd', {}, 'J'));
const qualSel = h('select', { id: 'lang', 'aria-label': 'Graphics', title: 'Graphics quality', 'data-testid': 'quality' }) as HTMLSelectElement;
for (const [v, l] of [['auto', '⚙ Auto'], ['high', '⚙ High'], ['medium', '⚙ Medium'], ['low', '⚙ Low']]) qualSel.append(h('option', { value: v }, l));
try { qualSel.value = localStorage.getItem('cc-quality') ?? 'auto'; } catch { /* */ }
qualSel.addEventListener('change', () => vox?.setQuality(qualSel.value as 'auto'));
const muteBtn = h('button', { class: 'btn', title: 'Sound', 'aria-label': 'Sound on/off' }, '🔊') as HTMLButtonElement;
muteBtn.onclick = () => { const m = muteBtn.textContent === '🔊'; muteBtn.textContent = m ? '🔇' : '🔊'; setMuted(m); Audio.setVolumes(m ? 0 : 0.5, m ? 0 : 0.7); };
const topright = h('div', { id: 'topright' }, journalBtn, muteBtn, h('div', {}, langSel, lucky), qualSel);
const hint = h('div', { id: 'hint' });
ui.append(hud, timer, toastEl, prompt, topright, hint, qArrow);

function renderHud() {
  xpChip.replaceChildren('✦ ', h('span', { class: 'xp' }, `${S.xp}`), ' curiosity XP');
  ladder.replaceChildren(...[0, 1, 2, 3, 4].map((i) => h('div', { class: `rung${S.asked > 0 && i <= S.level ? ' on' : ''}` })), h('div', { class: 'lbl' }, t('npc.whyLevel', 'Why level {n}', { n: S.level })));
  ladder.dataset.level = String(S.level);
  wondersChip.replaceChildren('✨ ', h('span', { class: 'xp' }, `${S.wonders.size}/${Object.keys(EGGS).length}`), ` ${t('ui.wonders', 'wonders found')}`);
  conceptsEl.replaceChildren(...[...S.concepts].map((id) => h('span', { class: 'cchip' }, conceptName(id))));
  (journalBtn.children[0] as HTMLElement).textContent = `${t('journal.title', 'Journal')} ${S.journal.length}`;
  lucky.textContent = t('lang.lucky8', 'Lucky 8 languages');
  if (matchMedia('(pointer: coarse)').matches) { hint.textContent = `👆 ${t('ui.tapWalk', 'Tap to walk · drag to look around')}`; } else hint.innerHTML = `<kbd>WASD</kbd> ${t('ui.move', 'move')} · <kbd>E</kbd> ${t('ui.talk', 'talk')} · <kbd>V</kbd> ${t('npc.holdToTalk', 'hold to talk')} · <kbd>J</kbd> ${t('journal.title', 'Journal')}`;
}
const bannerEl = h('div', { id: 'banner' });
ui.append(bannerEl);
let bannerT = 0;
function banner(s: string) { bannerEl.textContent = s; bannerEl.classList.add('show'); clearTimeout(bannerT); bannerT = window.setTimeout(() => bannerEl.classList.remove('show'), 2600); }
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
function open(card: HTMLElement, onBack?: () => void): HTMLElement {
  close();
  const x = h('button', { class: 'xclose', 'aria-label': t('ui.back', 'Back'), title: t('ui.back', 'Back (Esc)'), 'data-testid': 'close' }, '✕');
  x.onclick = () => { close(); onBack?.(); };
  card.prepend(x);
  modal = h('div', { class: 'veil' }, card); ui.append(modal); vox.frozen = true;
  modalBack = onBack ?? null;
  return modal;
}
let modalBack: (() => void) | null = null;
/** Esc / gamepad B: close the top-most overlay, never losing progress. */
function back(): boolean {
  if (modal) { close(); const f = modalBack; modalBack = null; f?.(); return true; }
  if (journalEl) { toggleJournal(); return true; }
  if (samBox) { closeSam(); return true; }
  return false;
}
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
  await speak(text, LANG, curWorld().npc.voice, reveal);
  clearTimeout(fallback); if (!shown) reveal(text.length * 20);
}

// ------------------------------------------------------------------ quests (walk there yourself; no teleports)
type Quest = { text: string; x: number; z: number; kind: 'board' | 'sam' | 'place' | 'lab'; place?: string } | null;
let quest: Quest = null;
function setQuest(q: Quest, say = true) {
  quest = q;
  vox.setBeacon(q ? q.x : null, q ? q.z : 0);
  questEl.style.display = q ? '' : 'none';
  if (q) { questEl.replaceChildren(h('div', { class: 'kicker' }, t('quest.title', 'Quest')), h('div', { class: 'qtext' }, q.text)); if (say) toast(`🧭 ${q.text}`, 3200); }
}
function placeFor(concepts: string[]): string {
  const order: [string, string][] = [['wave-breaking', 'pier'], ['waves-wind', 'pier'], ['density', 'dock'], ['buoyancy', 'dock'], ['materials', 'dock'], ['erosion', 'castle'], ['sun-wind', 'tower'], ['tides', 'pool']];
  if (S.biome === 'beach') for (const [c, pl] of order) if (concepts.includes(c) && !S.visited.has(pl)) return pl;
  const pool = BIOME_PLACES[S.biome];
  return pool.find((pl) => !S.visited.has(pl)) ?? pool[0];
}
function nextStep(res?: { suggestChallenge?: string; conceptIds?: string[]; whyHook?: string }) {
  if ((S.labDone && S.level >= 2) || S.level >= 3) { setQuest(null); npcActor().wave = true; toast(`🎉 ${t('quest.done', 'Amazing curiosity! Sam is cheering!')}`); setTimeout(() => { npcActor().wave = false; closeSam(); finale(); }, 1800); return; }
  if (!S.labDone && (res?.suggestChallenge === 'surfboard-lab' || (S.biome === 'beach' && S.level >= 2))) { setQuest({ text: t('quest.lab', 'Try it! Build a surfboard at the Lab dock'), x: LAB_DOCK.x, z: LAB_DOCK.z, kind: 'lab' }); return; }
  const pk = placeFor(res?.conceptIds ?? S.lastConcepts); const P = PLACES[pk];
  setQuest({ text: `${t('quest.investigate', 'Go look at')} ${P.name}${res?.whyHook ? ': ' + res.whyHook : ''}`, x: P.x, z: P.z, kind: 'place', place: pk });
}
function arrive() {
  if (!quest || modal || samBox) return;
  const q = quest;
  if (q.kind === 'place' && vox.dist2(q.x, q.z) < 2.6) {
    S.visited.add(q.place!);
    setQuest(null, false);
    vox.flyTo(q.x, q.z);
    toast(`👀 ${t('quest.look', 'Look closely…')}`, 1800);
    setTimeout(() => { vox.followPlayer(); openSam(true); void askSam(t('npc.why', 'Why?'), true); }, 1700);
  } else if (q.kind === 'lab' && vox.dist2(q.x, q.z) < 3.5 && !S.labArrived) {
    S.labArrived = true;
    if (lab3d) { toast(`🧪 ${t('quest.labHow', 'Pick up a board (E), walk to the end of the dock and throw it in (E)!')}`, 5000); void speak(t('quest.labSam', 'Pick a board, throw it off the dock, and see what floats!'), LANG, curWorld().npc.voice, () => undefined); }
    else openLab();
  }
}
function interactBoard() { if (S.phase !== 'board' && S.phase !== 'wonder') return; S.phase = 'wonder'; if (S.recallBefore === null) recall('before', () => wonderBoard()); else wonderBoard(); }
function interactSam(b: Biome = 'beach') {
  if (S.phase === 'roam' || S.phase === 'board' || S.phase === 'wonder') { if (b === 'beach') { toast(t('quest.boardFirst', 'Sam: “Draw your wonder on the board first, dude!”')); return; } }
  const pendingHere = S.pendingQ && S.pendingBiome === b;
  S.biome = b;
  openSam();
  if (pendingHere) { const q = S.pendingQ!; S.pendingQ = null; setQuest(null, false); npcActor().wave = false; void askSam(q, false); }
  else if (!S.askedBiomes.has(b)) { S.askedBiomes.add(b); if (samRefs) void sayLine(samRefs.say, curWorld().npc.greeting); }
}

// ------------------------------------------------------------------ 1) roam
function roam() {
  S.phase = 'roam';
  let left = ROAM_S;
  const render = () => (timer.textContent = `🧭 ${t('roam.title', 'Explore!')} ${Math.max(0, left)}s`);
  render();
  const iv = setInterval(() => {
    if (left <= 0 && (modal || samBox)) return; // let the kid finish what they are reading
    left--; render();
    if (left <= 0) {
      clearInterval(iv); timer.remove(); emit('roam_end', { seconds: ROAM_S });
      S.phase = 'board'; vox.boardGlow = true; vox.sam.wave = true;
      setQuest({ text: t('quest.board', 'Walk to the glowing Wonder Board by the surf shack'), x: BOARD.x, z: BOARD.z + 1.3, kind: 'board' });
      void speak(t('quest.samCall', 'Hey dude! Come draw what you wonder about on my Wonder Board!'), LANG, curWorld().npc.voice, () => undefined);
    }
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
  const mixed: { s: CuriosityWorld['starters'][number]; b: Biome }[] = [
    ...BEACH.starters.slice(0, 3).map((x) => ({ s: x, b: 'beach' as Biome })),
    ...(['volcano', 'ice', 'jungle'] as Biome[]).flatMap((b) => WORLDS[b].starters.slice(0, 2).map((x) => ({ s: x, b }))),
    ...BEACH.starters.slice(3, 6).map((x) => ({ s: x, b: 'beach' as Biome })),
  ];
  void fetch(`/api/cc/starters?lang=${LANG}`, { signal: AbortSignal.timeout(2500) }).then((r) => (r.ok ? r.json() : null)).then((arr: { id: string; label: string; emoji: string; questions: string[]; area?: string }[] | null) => {
    if (!Array.isArray(arr) || !arr.length || !starters.isConnected) return;
    starters.replaceChildren(...arr.slice(0, 8).map((x) => { const b = tagToBiome(x.area); return h('button', { class: 'btn', 'data-testid': `starter-${x.id}`, onclick: () => { S.topicIcon = x.emoji; boardBiome = b; emit('wonder_submit', { starter: x.id, hasDrawing: drawn, source: 'starter', worldTag: b }); showQuestions(x.questions); } }, ART_CC.icons[x.id] ? h('img', { class: 'sicon', src: ART_CC.icons[x.id], alt: '' }) : /^[\x00-\x7f]*$/.test(x.emoji ?? '') ? '' : h('span', { class: 'ic' }, x.emoji), x.label); }));
  }).catch(() => undefined);
  const starters = h('div', { class: 'starters' }, ...mixed.map(({ s, b }) => h('button', { class: 'btn', 'data-testid': `starter-${s.id}`, onclick: () => { S.topicIcon = s.icon; boardBiome = b; emit('wonder_submit', { starter: s.id, hasDrawing: drawn, source: 'starter', worldTag: b }); showQuestions(s.questions); } }, ART_CC.icons[s.id] ? h('img', { class: 'sicon', src: ART_CC.icons[s.id], alt: '' }) : h('span', { class: 'ic' }, s.icon), t(`starter.${s.id}`, s.label))));
  let busy = false;
  let boardBiome: Biome = 'beach';
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
    boardBiome = tagToBiome(res.worldTag);
    emit('wonder_submit', { text: txt, hasDrawing: drawn, guess: res.guess, confidence: res.confidence, source: res.source, worldTag: boardBiome });
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
  const card = h('div', { class: 'card panel', 'data-testid': 'wonder-board' }, h('div', { class: 'kicker' }, 'Wonder Board'), h('h2', {}, t('wonder.titleAny', 'What do you wonder about? Draw anything!')), body);
  open(card);
  void speak(t('wonder.title', 'What do you wonder about?'), LANG, curWorld().npc.voice, () => undefined);
  function showQuestions(qs: string[]) {
    body.replaceChildren(h('div', { style: 'grid-column:1/-1' }, h('h2', {}, t('wonder.pickQuestion', 'Pick a question to explore!')),
      h('div', { class: 'qcards' }, ...qs.slice(0, 3).map((q, i) => h('button', { class: 'btn qcard', 'data-testid': `question-${i}`, onclick: () => { emit('question_pick', { question: q, index: i, worldTag: boardBiome }); close(); pickQuestion(q, boardBiome); } }, q)))));
  }
}

// ------------------------------------------------------------------ 3) Why Ladder with Sam
let samBox: HTMLElement | null = null;
let handsFree: HandsFree | null = null;
let samRefs: { say: HTMLElement; hook: HTMLElement; kid: HTMLElement; tryBtn: HTMLButtonElement; whyBtn: HTMLButtonElement; face: HTMLImageElement; goBtn: HTMLButtonElement } | null = null;
function pickQuestion(q: string, b: Biome = 'beach') {
  S.phase = 'sam'; S.pendingQ = q; S.pendingBiome = b; vox.boardGlow = false; vox.sam.wave = false;
  const a = npcActor(b); a.wave = true;
  const w = WORLDS[b];
  setQuest({ text: b === 'beach' ? `${t('quest.ask', 'Ask Surfer Sam')}: “${q}”` : `${t('quest.find', 'Find')} ${w.npc.name} ${t('quest.at', 'at')} ${BIOMES[b].name}: “${q}”`, x: a.x, z: a.z + 1.2, kind: 'sam' });
}
function travelToSam(q: string) { pickQuestion(q); }
function openSam(remote = false) {
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
  const tryBtn = h('button', { class: 'btn mint big', 'data-testid': 'try-it', style: 'display:none', onclick: () => { closeSam(); setQuest({ text: t('quest.lab', 'Try it! Build a surfboard at the Lab dock'), x: LAB_DOCK.x, z: LAB_DOCK.z, kind: 'lab' }); } }, '🧪 ', t('tryit.button', 'Try it!')) as HTMLButtonElement;
  const goBtn = h('button', { class: 'btn gold', 'data-testid': 'go-investigate', style: 'display:none', onclick: () => closeSam() }, '🧭 ', t('quest.go', 'Go investigate!')) as HTMLButtonElement;
  const isWhyText = (s: string) => /^(why|por qu|pourquoi|waarom|为什么|क्यों|ஏன்)/i.test(s.trim()) && s.trim().split(/\s+/).length <= 3;
  const mic = micButton((s) => void askSam(s, isWhyText(s)), interim);
  const hfBtn = h('button', { class: 'btn', 'data-testid': 'handsfree', title: t('npc.handsFree', 'Hands-free: just talk') }, '🎧 ', t('npc.handsFree', 'Hands-free')) as HTMLButtonElement;
  handsFree = new HandsFree(LANG, (s) => (interim.textContent = s), (s) => void askSam(s, isWhyText(s)), (on) => { hfBtn.classList.toggle('gold', on); if (!on && !sttSupported) interim.textContent = t('npc.micError', 'Mic not available, type instead!'); });
  hfBtn.onclick = () => { if (handsFree?.active) handsFree.stop(); else handsFree?.start(); };
  const face = h('img', { class: 'samface', src: ART_CC.sam.happy, alt: curWorld().npc.name }) as HTMLImageElement;
  const shot = S.biome === 'beach' ? null : vox.portraitURL(BIOMES[S.biome].npc);
  if (shot) face.src = shot;
  const badge = S.biome === 'beach' || shot ? null : h('div', { class: 'npcbadge' }, BIOMES[S.biome].emoji);
  if (badge) face.style.display = 'none';
  samBox = h('div', { id: 'sam', class: 'panel', 'data-testid': 'sam-panel' }, face, badge,
    h('div', { class: 'name' }, remote ? `📻 ${curWorld().npc.name}` : curWorld().npc.name), kid, say, hook,
    h('div', { class: 'ctrl' }, whyBtn, mic, hfBtn, interim, txt, h('button', { class: 'btn sky', onclick: send }, t('npc.ask', 'Ask')), goBtn, tryBtn, h('button', { class: 'xclose', 'data-testid': 'sam-close', 'aria-label': 'Back', onclick: () => closeSam() }, '✕')));
  samRefs = { say, hook, kid, tryBtn, whyBtn, face, goBtn };
  if (S.level >= 2 || S.labDone) tryBtn.style.display = '';
  ui.append(samBox);
}
function closeSam() { handsFree?.stop(); handsFree = null; samBox?.remove(); samBox = null; samRefs = null; stopSpeech(); npcActor().talk = false; vox.frozen = !!modal; asking = false; }

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
  const req = { worldId: S.biome as WorldTag, lang: LANG, sessionId: SESSION, question: isWhy && prev ? `Why? (about: ${prev})` : question, level: S.level, history: S.history.slice(-8) };
  let res: AskResponse;
  if (S.biome === 'beach') R.face.src = ART_CC.sam.thinking;
  const fillers = [t('sam.f1', 'Ooh, good one!'), t('sam.f2', 'Hmm, let me think…'), t('sam.f3', 'Gnarly question, dude!'), t('sam.f4', 'Great wondering!')];
  const filler = fillers[S.asked % fillers.length];
  R.say.textContent = `${filler} …`; R.hook.textContent = '';
  handsFree?.pause();
  speakQuick(filler, LANG);
  const local = S.biome === 'beach' ? localAsk({ ...req, question }, S.lastFact) : { answer: t('npc.notSure', "Hmm, I'm not sure! Let's go look closely and find out."), whyHook: t('npc.lookHook', 'What do you notice? Why do you think it happens?'), conceptIds: [], grounded: false, source: 'local' as const, factId: '' };
  try { res = await ask(req); if (!res?.answer) throw new Error('empty'); }
  catch { res = local; }
  S.lastFact = local.factId || S.lastFact;
  S.history.push({ role: 'kid', text: question }, { role: 'npc', text: `${res.answer} ${res.whyHook}` });
  for (const c of res.conceptIds ?? []) if (!S.concepts.has(c)) { S.concepts.add(c); emit('concept', { id: c }); }
  if (res.conceptIds?.length) S.lastConcepts = res.conceptIds;
  for (const c of (res as AskResponse & { concepts?: { id: string; name: string }[] }).concepts ?? []) if (c?.id && c.name) { CONCEPT_NAMES.set(c.id, c.name); if (!S.concepts.has(c.id)) { S.concepts.add(c.id); emit('concept', { id: c.id }); } }
  if (isWhy && S.journal.length) S.journal[S.journal.length - 1].level = S.level;
  else { S.journal.push({ icon: S.topicIcon, question, level: S.level }); emit('journal_card', { question, level: S.level }); }
  renderHud();
  if (res.suggestChallenge || S.level >= 2) R.tryBtn.style.display = '';
  if (S.biome === 'beach') R.face.src = res.grounded === false ? ART_CC.sam.laughing : ART_CC.sam.happy;
  npcActor().talk = true;
  R.hook.textContent = '';
  await sayLine(R.say, res.answer);
  if (samRefs === R) await sayLine(R.hook, res.whyHook);
  npcActor().talk = false;
  R.whyBtn.disabled = false;
  if (samRefs === R) asking = false;
  handsFree?.resume();
  if (samRefs === R) { nextStep(res); if (quest?.kind === 'place') R.goBtn.style.display = ''; }
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
        void 0;
        void sayLine(result, `🏄 ${t('lab.success', 'It floats high! Foam is full of air bubbles, so it is super light for its size. Sam can surf!')}${shape === 'long' ? ' ' + t('lab.hint.shape', 'And the long board is extra steady!') : ''}`);
        Audio.play('jingle-success');
        doneRow.style.display = '';
      }
    }
  };
  const doneRow = h('div', { class: 'row', style: 'display:none' },
    h('button', { class: 'btn sky big', 'data-testid': 'watch-surf', onclick: () => { close(); vox.samSurf(true); vox.flyTo(8, 22); toast(t('lab.watch', 'Go Sam, go!'), 4000); setTimeout(() => { vox.samSurf(false); vox.followPlayer(); afterLab(); }, 6500); } }, t('lab.watchBtn', 'Watch Sam surf!')),
    h('button', { class: 'btn gold big', 'data-testid': 'lab-finish', onclick: () => { cancelAnimationFrame(raf); close(); afterLab(); } }, t('lab.finish', 'Finish')));
  const card = h('div', { class: 'card panel lab', 'data-testid': 'lab' },
    h('div', { class: 'kicker' }, t('tryit.button', 'Try it!')), h('h2', {}, t('lab.title', 'Surfboard Lab: what floats?')),
    h('div', { class: 'kicker', style: 'margin-top:4px' }, t('lab.materials', 'Material')), matRow,
    h('div', { class: 'kicker', style: 'margin-top:8px' }, t('lab.shapes', 'Shape')), shapeRow,
    h('div', { style: 'margin:8px 0' }, cv),
    h('div', { class: 'row' }, h('button', { class: 'btn gold big', 'data-testid': 'drop', onclick: drop }, '⬇ ', t('lab.drop', 'Drop it in!')), h('span', { class: 'spacer' }), h('label', { class: 'row' }, '🌊 ', t('wave.title', 'Wave maker'), waveIn)),
    h('div', { class: 'row' }, sticker, result), doneRow);
  open(card, () => { cancelAnimationFrame(raf); });
  void speak(t('lab.predict', 'Pick a material and drop it in. Guess first: will it float?'), LANG, curWorld().npc.voice, () => undefined);
}

function afterLab() {
  if (S.labDone) return;
  S.labDone = true; xpFly(10); labPanelBtn.style.display = 'none';
  if (S.level >= 2) nextStep();
  else { S.pendingQ = t('quest.whyFoam', 'Why did the foam board float?'); setQuest({ text: t('quest.tellSam', 'Tell Sam what you found!'), x: vox.sam.x, z: vox.sam.z + 1.2, kind: 'sam' }); S.pendingBiome = 'beach'; }
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

// ------------------------------------------------------------------ wonder sparkles (Easter eggs)
function openEgg(id: string) {
  const e = EGGS[id]; if (!e || S.wonders.has(id)) return;
  S.wonders.add(id); vox.markEgg(id);
  xpFly(5);
  S.journal.push({ icon: e.icon, question: e.wonder, level: 0 });
  emit('journal_card', { question: e.wonder, level: 0, egg: id });
  renderHud();
  Audio.play('jingle-item', { volume: 0.7 });
  const canAsk = S.phase === 'sam' || S.phase === 'end' || S.phase === 'lab';
  const card = h('div', { class: 'card panel egg', 'data-testid': 'egg-card' },
    h('div', { class: 'kicker' }, `✨ ${e.label}`), h('h2', {}, e.wonder),
    h('p', { style: 'font-size:18px' }, canAsk ? t('egg.ask', 'Curious? Ask Sam and climb the Why ladder!') : t('egg.saved', 'Saved to your Journal! You can ask Sam about it soon.')),
    h('div', { class: 'row' }, canAsk ? h('button', { class: 'btn gold big', onclick: () => { close(); S.topicIcon = e.icon; travelToSam(e.wonder); } }, t('egg.askBtn', 'Ask Sam!')) : '', h('button', { class: 'btn', onclick: () => close() }, t('egg.ok', 'Cool!'))));
  open(card);
  void speak(e.wonder, LANG, curWorld().npc.voice, () => undefined);
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
  if (remote?.facts?.length && remote.starters?.length) { S.world = { ...BEACH, ...remote }; WORLDS.beach = S.world; }
  void Promise.all((['volcano', 'ice', 'jungle'] as Biome[]).map(async (b) => { const w = await fetchWorld(b as WorldTag); if (w?.npc?.name) WORLDS[b] = { ...WORLDS[b], ...w, starters: w.starters?.length ? w.starters : WORLDS[b].starters }; }));
  vox = new Voxel(document.getElementById('game')!, input);
  vox.onInteract = (what) => { if (what.startsWith('egg:')) openEgg(what.slice(4)); else if (what === 'sam') interactSam('beach'); else if (what.startsWith('npc:')) interactSam(npcBiome(what.slice(4))); else if (what === 'board') interactBoard(); };
  vox.onTick = () => {
    for (const a of input.take()) {
      if (a === 'book') toggleJournal();
      if (a === 'interact' && !modal && !samBox && lab3d && (() => { try { return lab3d!.interact(); } catch { return false; } })()) continue;
      if (a === 'interact' && !modal && !samBox && vox.near?.startsWith('egg:')) openEgg(vox.near.slice(4));
      else if (a === 'interact' && !modal && !samBox && vox.near === 'sam') interactSam('beach');
      else if (a === 'interact' && !modal && !samBox && vox.near?.startsWith('npc:')) interactSam(npcBiome(vox.near.slice(4)));
      else if (a === 'interact' && !modal && !samBox && vox.near === 'board') interactBoard();
      if (a === 'voice') activeMic?.start();
      if (a === 'pause' || a === 'back') back();
    }
    for (const r of input.takeReleased()) if (r === 'voice') activeMic?.stop();
    const egg = vox.near?.startsWith('egg:') ? vox.eggs.find((g) => `egg:${g.id}` === vox.near) : null;
    const labHint = !modal && !samBox && lab3d ? lab3d.prompt() : null;
    if (labHint) { const pp = vox.screen(vox.player.x, vox.player.y + 2.4, vox.player.z); prompt.innerHTML = `<kbd>E</kbd> ${labHint}`; prompt.style.left = `${pp.x}px`; prompt.style.top = `${pp.y}px`; prompt.classList.add('show'); arrive(); return; }
    labPanelBtn.style.display = (quest?.kind === 'lab' || S.labArrived) && !S.labDone ? '' : 'none';
    const board = vox.near === 'board' && (S.phase === 'board' || S.phase === 'wonder');
    const npcNear = vox.near?.startsWith('npc:') ? vox.npcs[vox.near.slice(4)] : null;
    if (!samBox && !modal && (egg || board || vox.near === 'sam' || npcNear)) {
      const p = egg ? vox.screen(egg.x, egg.y + 1.3, egg.z) : board ? vox.screen(BOARD.x, 3.4, BOARD.z) : npcNear ? vox.screen(npcNear.x, npcNear.y + 2.3, npcNear.z) : vox.screen(vox.sam.x, vox.sam.y + 2.1, vox.sam.z);
      prompt.innerHTML = egg ? `<kbd>E</kbd> ✨ ${t('ui.lookCloser', 'Look closer')}` : board ? `<kbd>E</kbd> 🎨 ${t('ui.board', 'Open the Wonder Board')}` : `<kbd>E</kbd> ${t('ui.talkTo', 'Talk to')} ${npcNear ? WORLDS[npcBiome(vox.near!.slice(4))].npc.name.split(' ')[0] : 'Sam'}`; prompt.style.left = `${p.x}px`; prompt.style.top = `${p.y}px`; prompt.classList.add('show');
    } else prompt.classList.remove('show');
    arrive();
    if (quest && !modal) {
      const sp = vox.screen(quest.x, vox.groundY(quest.x, quest.z) + 1, quest.z);
      const m = 60, Wd = innerWidth, Hd = innerHeight;
      const off = sp.behind || sp.x < m || sp.y < m || sp.x > Wd - m || sp.y > Hd - m;
      if (off) {
        let dx = sp.x - Wd / 2, dy = sp.y - Hd / 2; if (sp.behind) { dx = -dx; dy = -dy; }
        const a = Math.atan2(dy, dx), k = Math.min((Wd / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (Hd / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
        qArrow.style.display = 'block'; qArrow.style.left = `${Wd / 2 + Math.cos(a) * k}px`; qArrow.style.top = `${Hd / 2 + Math.sin(a) * k}px`; qArrow.style.transform = `translate(-50%,-50%) rotate(${a}rad)`;
      } else qArrow.style.display = 'none';
    } else qArrow.style.display = 'none';
  };
  try {
    lab3d = createLab3D({ scene: vox.scene, camera: vox.camera, vox, player: () => ({ x: vox.player.x, z: vox.player.z }), lang: LANG,
      onAttempt: (e) => {
        emit('challenge_attempt', { ...e }); xpFly(5);
        if (e.result === 'floats' && /foam/.test(e.choice)) setTimeout(() => afterLab(), 2500);
      },
      onSpeak: (text) => { void speak(text, LANG, curWorld().npc.voice, () => undefined); } }, LAB_DOCK);
  } catch (err) { console.warn('[curiosity-craft] lab3d unavailable, using the lab panel', err); lab3d = null; }
  vox.onFrame = (dt) => { try { lab3d?.update(dt); vox.labNear = !!lab3d?.prompt(); } catch { /* */ } };
  vox.onBiome = (b) => { const B = BIOMES[b]; banner(`${B.emoji} ${B.name}`); emit('spawn', { worldId: b, enter: true }); };
  vox.start();
  let audioOn = false;
  const startAudio = () => { if (audioOn) return; audioOn = true; Audio.init(); Audio.setVolumes(0.45, 0.7); Audio.playMusic({ root: 62, scale: [0, 2, 4, 7, 9], tempo: 76, lead: 'triangle', pad: 'sine', mood: 'wonder' }, 7); };
  addEventListener('pointerdown', startAudio, { once: true });
  addEventListener('keydown', startAudio, { once: true });
  renderHud();
  document.getElementById('loading')?.classList.add('gone');
  setTimeout(() => document.getElementById('loading')?.remove(), 500);
  try { const k = 'cc.sessions'; const arr = JSON.parse(localStorage.getItem(k) ?? '[]') as string[]; if (!arr.includes(SESSION)) arr.push(SESSION); localStorage.setItem(k, JSON.stringify(arr.slice(-20))); } catch { /* */ }
  emit('session_start', { lang: LANG, worldId: 'beach', demo: DEMO });
  emit('spawn', { worldId: 'beach' });
  emit('lang', { lang: LANG });
  roam();
  (window as unknown as Record<string, unknown>).__CCvox = vox;
  (window as unknown as Record<string, unknown>).__CCgo = (where: 'board' | 'sam' | 'quest') => {
    if (where === 'board') { vox.teleport(BOARD.x, BOARD.z + 1.4); interactBoard(); }
    else if (where === 'sam') { const b = S.pendingQ ? S.pendingBiome : 'beach'; const a = npcActor(b); vox.teleport(a.x - 0.9, a.z + 1.1); interactSam(b); }
    else if (quest) vox.teleport(quest.x, quest.z + 0.3);
  };
}
boot().catch((e) => { console.error(e); const l = document.getElementById('loading'); if (l) l.textContent = 'Oops! Reload to try again.'; });
