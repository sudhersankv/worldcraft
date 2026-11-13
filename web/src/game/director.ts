/**
 * The Director runs every learning flow (study -> check -> explain -> practise -> recall), voice, telemetry and HUD.
 * The scene only renders and reports interactions; the GameState decides progress.
 */
import type { NpcReplyResponse, NpcSpec, PuzzleSpec, Question, SideQuest, StudyCard, WorldSpec } from '../shared/contracts';
import { api } from '../shared/api';
import { detectVoiceMode, VoiceSession } from '../voice/index';
import { Audio } from './core/audio';
import type { Input } from './core/input';
import { GameState, STAGES } from './core/state';
import type { Telemetry } from './core/telemetry';
import { portrait } from './art/characters';
import type { Kit } from './world/kits';
import type { SceneHooks, Target, WorldScene } from './scene/WorldScene';
import type { ZonePlace } from './world/layout';
import { esc, figureSvg, h, UI, type VoiceBar } from './ui/ui';

// ----------------------------------------------------------- local grading helpers
const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'it', 'is', 'are', 'in', 'names', 'name', 'mentions', 'mention', 'says', 'explains', 'explain', 'that', 'its', 'with', 'for', 'from', 'by', 'on', 'or', 'some', 'they', 'their', 'plant', 'plants', 'uses', 'use', 'make', 'makes', 'how', 'what', 'why']);
const stem = (w: string) => (w.length > 4 ? w.replace(/ies$/, 'y').replace(/(es|s)$/, '') : w);
function norm(s: string): string {
  return ` ${s.toLowerCase()} `.replace(/co2|co₂/g, ' carbon dioxide ').replace(/\bo2\b|o₂/g, ' oxygen ').replace(/glucose/g, ' glucose sugar ').replace(/\bsugars?\b/g, ' sugar glucose ').replace(/\bsun\b/g, ' sun sunlight light ').replace(/\blight\b/g, ' light sunlight ');
}
function toks(s: string): Set<string> { return new Set(norm(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map(stem)); }
function phraseIn(phrase: string, ans: Set<string>): boolean {
  const p = [...toks(phrase)].filter((w) => !STOP.has(w));
  return p.length > 0 && p.every((w) => ans.has(w));
}
export function localGrade(q: Question, text: string): boolean {
  const ans = toks(text);
  if (q.accept.some((a) => phraseIn(a, ans))) return true;
  const right = q.choices[q.answerIndex];
  if (right && phraseIn(right, ans) && !q.choices.some((c, i) => i !== q.answerIndex && phraseIn(c, ans) && !phraseIn(right, toks(c)))) return true;
  const n = text.trim().match(/^([1-4])$/);
  return !!n && Number(n[1]) - 1 === q.answerIndex;
}

type Waiter = { q: Question; judge: (correct: boolean, feedback?: string) => void } | null;
type ExplainWaiter = { handle: (r: NpcReplyResponse) => void; criteria: string[] } | null;

export class Director implements SceneHooks {
  ui = new UI();
  scene!: WorldScene;
  voice: VoiceSession;
  micAvailable = false;
  reduced = false;
  volume = 0.7;
  private activeNpc: NpcSpec | null = null;
  private waiter: Waiter = null;
  private explainWaiter: ExplainWaiter = null;
  private reviewClock = 0;
  private lastReviewAt = -999;
  private elapsed = 0;
  private holding = false;
  private dlg: { line: HTMLElement; child: HTMLElement; area: HTMLElement; bar: VoiceBar; npc: NpcSpec | null } | null = null;
  private history: { role: 'child' | 'npc'; text: string }[] = [];

  constructor(public world: WorldSpec, public kit: Kit, public state: GameState, public tele: Telemetry, public input: Input) {
    this.voice = new VoiceSession({
      state: (s) => { this.ui.voiceBar?.setState(s); this.ui.voiceBar?.setLive(s === 'listening'); },
      interim: (t) => this.ui.voiceBar?.setInterim(t),
      final: (t) => { if (this.dlg) this.dlg.child.textContent = `You: “${t}”`; this.ui.voiceBar?.setInterim(''); this.tele.send('utterance', { detail: t.slice(0, 200) }); },
      level: (v) => this.ui.voiceBar?.setLevel(v),
      reply: (r) => this.onReply(r),
      error: (m) => { this.ui.voiceBar?.setState('type'); console.warn('[voice]', m); },
    });
    void detectVoiceMode().then((m) => { this.micAvailable = m !== 'text'; }).catch(() => { this.micAvailable = false; });
    try { this.reduced = localStorage.getItem('wc-reduced') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches; this.volume = Number(localStorage.getItem('wc-vol') ?? '0.7'); } catch { /* */ }
    document.body.classList.toggle('reduced', this.reduced);
    state.on((ev) => { if (ev.type === 'quest') this.onQuestComplete(ev.quest.id); else this.refresh(); });
    this.ui.topButtons([
      { label: 'Study Book', key: 'B', on: () => this.openBook() },
      { label: 'Hint', key: 'C', on: () => this.hint() },
      { label: 'Ask Exa', key: 'G', on: () => this.askGoat() },
      { label: 'Menu', key: 'Esc', on: () => this.openPause() },
    ]);
    this.ui.hint.innerHTML = 'Move <kbd>WASD</kbd>/click · Talk <kbd>E</kbd> · Hint <kbd>C</kbd> · Book <kbd>B</kbd> · Voice <kbd>V</kbd>';
  }

  attach(scene: WorldScene) { this.scene = scene; scene.reducedMotion = this.reduced; this.refresh(); }

  // ============================================================ scene hooks
  isModal() { return this.ui.modal; }
  labelFor(t: Target): string | null {
    switch (t.kind) {
      case 'npc': return 'Talk';
      case 'station': return 'Study';
      case 'discovery': return 'Look';
      case 'gate': return 'Look';
      case 'landmark': {
        const z = this.world.zones.find((q) => q.id === t.zoneId);
        if (this.state.recallActive() && this.world.memoryLandmarks.some((m) => m.zoneId === t.zoneId && !this.state.has(`recall:${m.zoneId}`))) return 'Remember';
        const pz = this.world.puzzles.find((p) => p.zoneId === t.zoneId && !this.state.has(`puzzle:${p.id}`));
        if (pz && this.puzzleReady(pz)) return 'Practise';
        return z?.kind === 'hub' ? null : 'Look';
      }
    }
  }
  onInteract(t: Target) {
    Audio.init(); Audio.play('select');
    if (t.kind === 'npc') { const n = this.world.npcs.find((q) => q.id === t.id); if (n) void this.talk(n); }
    else if (t.kind === 'station') void this.openStudy(t.zoneId);
    else if (t.kind === 'discovery') this.discover(t.id, t.text);
    else if (t.kind === 'gate') this.companionSay(`It's locked. Help everyone first, then the way to ${this.goalName()} will open!`);
    else this.landmark(t.zoneId);
  }
  onZoneEnter(z: ZonePlace) {
    const first = !this.state.discovered.has(z.zone.id);
    this.state.discovered.add(z.zone.id);
    this.ui.showBanner(z.zone.kind === 'goal' ? 'the goal' : z.zone.kind === 'wild' ? 'secret spot' : 'now entering', z.zone.name);
    if (first) { Audio.play('appear'); this.tele.send('visit', { objectiveId: z.zone.objectiveId, detail: z.zone.id }); }
    this.state.add(`visit:${z.zone.id}`);
    // spaced review when coming back to a place you already mastered
    const q = this.world.quests.find((x) => x.objectiveId === z.zone.objectiveId);
    if (!first && q && this.state.questDone(q) && this.elapsed - this.lastReviewAt > 75) setTimeout(() => { if (!this.ui.modal) this.openReview(); }, 900);
  }
  onCollect(id: string, inst: string) {
    this.state.found.add(inst);
    const c = this.world.collectibles.find((x) => x.id === id);
    Audio.play('coins');
    this.state.collect(id);
    const have = this.state.counts.get(id) ?? 0;
    this.ui.toast(`${c?.name ?? 'Item'} ${have}/${c?.count ?? have}`, true, 1600);
    this.tele.send('collect', { detail: id, objectiveId: this.world.zones.find((z) => z.id === c?.zoneId)?.objectiveId });
  }
  onAction(a: string) {
    const modal = this.ui.modal;
    if (a === 'step') { Audio.play(Math.random() < 0.5 ? 'step0' : 'step1', { volume: 0.25 }); return; }
    if (a === 'voice') { if (this.dlg) { this.holding = true; this.voice.holdStart(); this.ui.voiceBar?.setLive(true); } return; }
    if (a === 'voiceUp') { if (this.holding) { this.holding = false; this.voice.holdEnd(); } return; }
    if (modal) {
      if (a === 'up' || a === 'down' || a === 'left' || a === 'right') this.ui.nav(a);
      else if (a === 'interact') { if (this.input.lastDevice === 'pad' || this.input.held('KeyE')) this.ui.activate(); else if (!this.ui.topEl()?.contains(document.activeElement)) this.ui.activate(); }
      else if (a === 'back' || a === 'pause') this.back();
      return;
    }
    if (a === 'hint') this.hint();
    else if (a === 'book') this.openBook();
    else if (a === 'pause' || a === 'back') { if (a === 'pause') this.openPause(); }
    else if (a === 'goat') this.askGoat();
  }
  private back() {
    const top = this.ui.stack[this.ui.stack.length - 1];
    if (top) { const c = top.querySelector<HTMLElement>('[data-close]'); if (c) c.click(); else this.ui.close(); Audio.play('back'); return; }
    if (this.dlg) this.closeDialogue();
  }
  onFrame(dt: number) {
    if (!this.scene) return;
    this.elapsed += dt;
    const s = this.scene;
    // prompt above nearest target
    const t = s.nearTarget;
    if (t && !this.ui.modal) {
      const p = s.toScreen(t.x, t.y, t.kind === 'landmark' ? 120 : t.kind === 'npc' ? 74 : 50);
      this.ui.showPrompt(p.x, p.y, this.input.lastDevice === 'pad' ? 'A' : 'E', this.labelFor(t));
    } else this.ui.showPrompt(0, 0, '', null);
    const cp = s.toScreen(s.companion.gx, s.companion.gy, 46);
    this.ui.placeBubble(cp.x, cp.y);
    if (s.goat) { const gp = s.toScreen(s.goat.gx, s.goat.gy, 70); this.ui.goatCard.style.left = `${Math.max(170, Math.min(innerWidth - 170, gp.x))}px`; this.ui.goatCard.style.top = `${Math.max(200, gp.y)}px`; }
    // edge arrow toward current target
    const tgt = this.targetPos();
    if (tgt && !this.ui.modal) {
      const p = s.toScreen(tgt.x, tgt.y, 30);
      const m = 50, W = innerWidth, H = innerHeight;
      if (p.x < m || p.y < m || p.x > W - m || p.y > H - m) {
        const cx = W / 2, cy = H / 2, ang = Math.atan2(p.y - cy, p.x - cx);
        const k = Math.min((W / 2 - m) / Math.abs(Math.cos(ang) || 1e-6), (H / 2 - m) / Math.abs(Math.sin(ang) || 1e-6));
        this.ui.setArrow(cx + Math.cos(ang) * k, cy + Math.sin(ang) * k, ang);
      } else this.ui.setArrow(null);
    } else this.ui.setArrow(null);
    // spaced review while exploring
    if (!this.ui.modal && this.state.completedQuests.length && this.world.reviewQuestions.length) {
      this.reviewClock += dt;
      if (this.reviewClock > 150) { this.reviewClock = 0; this.openReview(); }
    }
  }

  // ============================================================ helpers
  private goalName() { return this.world.zones.find((z) => z.kind === 'goal')?.name ?? 'the goal'; }
  private zoneName(id: string) { return this.world.zones.find((z) => z.id === id)?.name ?? id; }
  private npcFor(obj: string) { return this.world.npcs.find((n) => n.objectiveId === obj); }
  private cardsFor(zoneId: string) { return this.world.study.filter((c) => c.zoneId === zoneId); }
  private narratorVoice() { return this.world.npcs[0]?.voice ?? 'aura-2-thalia-en'; }
  private speak(text: string, voice?: string) { void this.voice.speak(text, voice ?? this.narratorVoice()).catch(() => undefined); }
  companionSay(text: string) { this.ui.say(this.world.companion.name, text); Audio.play('pluck'); }

  private puzzleReady(p: PuzzleSpec): boolean {
    const q = this.world.quests.find((x) => x.steps.some((s) => s.kind === 'puzzle' && s.targetId === p.id));
    if (!q) return true;
    const i = q.steps.findIndex((s) => s.kind === 'puzzle' && s.targetId === p.id);
    return q.steps.slice(0, i).every((s) => s.kind === 'collect' || s.kind === 'visit' || this.state.stepDone(s));
  }

  targetPos(): { x: number; y: number } | null {
    const cur = this.state.currentStep(); if (!cur || !this.scene) return null;
    const s = cur.step, L = this.scene.L;
    const zp = (id: string) => L.zones.find((z) => z.zone.id === id);
    switch (s.kind) {
      case 'study': { const c = this.world.study.find((x) => x.id === s.targetId); const z = c && zp(c.zoneId); return z?.station ? { x: z.station.x + 0.5, y: z.station.y + 0.5 } : z ? { x: z.cx, y: z.cy } : null; }
      case 'talk': case 'explain': { const n = this.world.npcs.find((x) => x.id === s.targetId); const z = n && zp(n.zoneId); return z?.npc ? { x: z.npc.x + 0.5, y: z.npc.y + 0.5 } : null; }
      case 'visit': { const z = zp(s.targetId); return z ? { x: z.cx + 0.5, y: z.cy + 0.5 } : null; }
      case 'puzzle': { const p = this.world.puzzles.find((x) => x.id === s.targetId); const z = p && zp(p.zoneId); return z ? { x: z.landmark.x + 0.5, y: z.landmark.y + 0.5 } : null; }
      case 'collect': {
        let best: { x: number; y: number } | null = null, bd = 1e9;
        for (const c of this.scene.collectibles) if (c.id === s.targetId) { const d = Math.hypot(c.gx - this.scene.player.gx, c.gy - this.scene.player.gy); if (d < bd) { bd = d; best = { x: c.gx, y: c.gy }; } }
        return best;
      }
      case 'recall': {
        let best: { x: number; y: number } | null = null, bd = 1e9;
        for (const m of this.world.memoryLandmarks) { if (this.state.has(`recall:${m.zoneId}`)) continue; const z = zp(m.zoneId); if (!z) continue; const d = Math.hypot(z.cx - this.scene.player.gx, z.cy - this.scene.player.gy); if (d < bd) { bd = d; best = { x: z.landmark.x + 0.5, y: z.landmark.y + 0.5 }; } }
        return best;
      }
    }
    return null;
  }

  // ============================================================ HUD
  refresh() {
    if (!this.scene) return;
    const cur = this.state.currentStep();
    const obj = cur?.quest.objectiveId ?? this.state.objectives()[0];
    const objs = this.state.objectives();
    const oi = Math.max(0, objs.indexOf(obj));
    const m = obj ? this.state.mastery(obj) : null;
    const icon: Record<string, [string, string]> = { study: ['📖', '#3ddc97'], talk: ['?', '#ffc93c'], explain: ['!', '#ff5d8f'], visit: ['>', '#4cc9f0'], collect: ['+', '#ffe27a'], puzzle: ['#', '#c86bfa'], recall: ['*', '#ff8a65'] };
    const ic = cur ? icon[cur.step.kind] ?? ['>', '#ffc93c'] : ['*', '#3ddc97'];
    const glyph = cur?.step.kind === 'study' ? '' : ic[0];
    const stepText = cur ? cur.step.text : this.state.finished ? 'You restored the whole world! Keep exploring.' : 'Explore!';
    this.ui.tracker.replaceChildren(
      h('div', { class: 'obj' }, h('span', {}, cur && this.state.isFinale(cur.quest) ? 'Final memory quest' : `Learning goal ${oi + 1} of ${objs.length}`), h('span', {}, cur ? `${cur.index + 1}/${cur.quest.steps.length}` : '')),
      h('div', { class: 'objname' }, obj ? this.state.objectiveLabel(obj) : this.world.title),
      h('div', { class: 'step' }, h('span', { class: 'ic', style: `background:${ic[1]}`, html: glyph || '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="1" y="2" width="6" height="12" rx="1" fill="#1f1633"/><rect x="9" y="2" width="6" height="12" rx="1" fill="#1f1633"/></svg>' }), h('span', {}, stepText)),
      m ? h('div', { class: 'mastery' }, ...STAGES.map((s) => h('span', { class: m[s] ? 'on' : '', title: s }))) : '',
      m ? h('div', { class: 'mastery-labels' }, ...STAGES.map((s) => h('span', {}, s))) : '',
    );
    // world markers
    const s = this.scene;
    for (const z of s.L.zones) {
      if (z.npc) {
        const npc = this.world.npcs.find((n) => n.id === z.npc!.id)!;
        const a = s.npcs.get(npc.id)!;
        const main = cur && (cur.step.kind === 'talk' || cur.step.kind === 'explain') && cur.step.targetId === npc.id;
        const side = this.world.sideQuests.some((q) => q.giverNpcId === npc.id && !this.state.sideDone.has(q.id)) && this.state.has(`talk:${npc.id}`);
        s.setMarker(`npc:${npc.id}`, main ? 'main' : side ? 'side' : null, a.sprite.x, a.sprite.y - 96);
      }
      if (z.station) {
        const st = s.stations.get(z.zone.id)!;
        const needs = cur?.step.kind === 'study' && this.world.study.some((c) => c.id === cur.step.targetId && c.zoneId === z.zone.id);
        s.setMarker(`st:${z.zone.id}`, needs ? 'study' : null, st.x, st.y - 50);
      }
      const lm = s.landmarks.get(z.zone.id);
      if (lm) {
        const recall = this.state.recallActive() && this.world.memoryLandmarks.some((mm) => mm.zoneId === z.zone.id && !this.state.has(`recall:${z.zone.id}`));
        const pz = cur?.step.kind === 'puzzle' && this.world.puzzles.some((p) => p.id === cur.step.targetId && p.zoneId === z.zone.id);
        s.setMarker(`lm:${z.zone.id}`, recall ? 'recall' : pz ? 'main' : null, lm.x, lm.y - 125);
      }
    }
    if (this.state.gateOpen() && !s.gateOpen) {
      s.openGate();
      const g = s.L.gateCells[0];
      if (g) { s.panTo(g.x, g.y, 2200); }
      Audio.play('door');
      this.ui.toast(`The way to ${this.goalName()} is open!`, true);
    }
  }

  private onQuestComplete(qid: string) {
    const q = this.world.quests.find((x) => x.id === qid)!;
    const fx = this.world.rewardEffects.find((e) => e.id === q.rewardEffectId);
    const nonFinale = this.world.quests.filter((x) => !this.state.isFinale(x));
    const done = nonFinale.filter((x) => this.state.questDone(x)).length;
    const finale = this.state.isFinale(q);
    const sat = finale ? 0.12 : this.kit.startSaturation * (1 - done / Math.max(1, nonFinale.length));
    this.tele.send('quest_complete', { objectiveId: q.objectiveId, detail: q.id });
    Audio.play(finale ? 'jingle-complete' : 'jingle-quest');
    const zone = fx?.zoneId ?? this.world.zones.find((z) => z.objectiveId === q.objectiveId)?.id ?? 'hub';
    setTimeout(() => {
      this.scene.reward(finale ? 'bloom' : fx?.kind ?? 'restore', zone, sat);
      if (finale) { for (const z of this.scene.L.zones) this.scene.reward('restore', z.zone.id, sat); }
      this.ui.toast(fx?.text ?? `Quest complete: ${q.title}`, true, 4200);
      this.speak(fx?.text ?? q.title);
      this.refresh();
      if (finale) setTimeout(() => this.finale(), 2600);
    }, this.ui.modal ? 600 : 50);
  }

  // ============================================================ dialogue shell
  private openDialogue(npc: NpcSpec | null, name: string, title: string, archetype: string) {
    this.closeDialogue();
    const line = h('div', { class: 'line', 'aria-live': 'polite' });
    const child = h('div', { class: 'child' });
    const area = h('div', {});
    const bar = this.ui.makeVoiceBar({
      placeholder: 'Type your answer or question…', micAvailable: this.micAvailable,
      onSend: (t) => this.childSays(t),
      onMic: () => { if (this.micAvailable) { this.voice.holdStart(); setTimeout(() => this.voice.holdEnd(), 6000); } else this.ui.toast('No microphone here: type your answer instead!'); },
    });
    const pc = portrait(archetype, 190);
    const el = h('div', { id: 'dialogue', class: 'sticker' }, h('div', { class: 'portrait' }, pc), h('div', { class: 'body' }, h('div', { class: 'who' }, name, h('small', {}, title)), line, child, area, bar.el));
    this.ui.root.append(el);
    this.ui.dialogue = el;
    this.dlg = { line, child, area, bar, npc };
    this.activeNpc = npc;
    this.history = [];
    if (npc) void this.voice.start({ worldId: this.world.worldId, npcId: npc.id, sessionId: this.tele.sessionId, mode: 'chat', objectiveId: npc.objectiveId }).catch(() => undefined);
  }
  closeDialogue() {
    if (!this.dlg) return;
    this.ui.dialogue?.remove(); this.ui.dialogue = null; this.dlg = null; this.ui.voiceBar = null;
    this.waiter = null; this.explainWaiter = null; this.activeNpc = null;
    try { this.voice.cancelSpeech(); this.voice.stop(); } catch { /* */ }
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.refresh();
  }
  private async say(text: string, voice?: string) {
    if (!this.dlg) return;
    this.history.push({ role: 'npc', text });
    this.speak(text, voice ?? this.activeNpc?.voice);
    await this.ui.typewriter(this.dlg.line, text, this.reduced, () => Audio.voiceBlip(1.1));
  }
  private buttons(btns: { label: string; cls?: string; def?: boolean; on: () => void }[]) {
    if (!this.dlg) return;
    this.dlg.area.replaceChildren(h('div', { class: 'row' }, ...btns.map((b) => h('button', { class: `btn ${b.cls ?? ''}`, 'data-default': b.def ? '1' : undefined, onclick: () => { Audio.play('click'); b.on(); } }, b.label))));
    setTimeout(() => this.dlg && this.ui.focusFirst(this.dlg.area), 20);
  }
  private next(label = 'Next'): Promise<void> { return new Promise((res) => this.buttons([{ label, cls: 'primary', def: true, on: res }])); }

  private childSays(text: string) {
    if (this.dlg) this.dlg.child.textContent = `You: “${text}”`;
    this.history.push({ role: 'child', text });
    if (this.waiter) {
      const w = this.waiter;
      if (localGrade(w.q, text)) { w.judge(true); return; }
      // ask the referee; fall back to "not yet"
      api.grade(this.world.worldId, w.q.id, text).then((v) => { if (this.waiter === w) w.judge(!!v.correct, v.feedback); }).catch(() => { if (this.waiter === w) w.judge(false); });
      return;
    }
    if (this.explainWaiter) {
      const ew = this.explainWaiter;
      this.voice.sendText(text).then((r) => { if (!r && this.explainWaiter === ew) ew.handle(this.localExplain(text, ew.criteria)); }).catch(() => { if (this.explainWaiter === ew) ew.handle(this.localExplain(text, ew.criteria)); });
      return;
    }
    // free chat
    this.voice.sendText(text).then((r) => { if (!r) this.onReply(this.localChat(text)); }).catch(() => this.onReply(this.localChat(text)));
  }

  private onReply(r: NpcReplyResponse) {
    if (r.goat) this.showGoat(r.goat.question, r.goat.text, r.goat.source);
    if (this.explainWaiter && r.explain) { this.explainWaiter.handle(r); return; }
    if (this.waiter && r.verdict && r.verdict.intent === 'answer') { this.waiter.judge(!!r.verdict.correct, r.verdict.feedback || r.reply); return; }
    if (this.explainWaiter && !r.explain) { /* chatty reply during explain: just show it */ }
    if (r.reply && this.dlg) void this.say(r.reply);
  }

  private localChat(text: string): NpcReplyResponse {
    const npc = this.activeNpc;
    const pool = [...(npc?.knowledge ?? []), ...(npc?.teach ?? [])];
    const t = toks(text);
    let best = pool[0] ?? "Hmm, let's look at the study stone together!", bs = -1;
    for (const k of pool) { const s = [...toks(k)].filter((w) => t.has(w) && !STOP.has(w)).length; if (s > bs) { bs = s; best = k; } }
    return { reply: bs > 0 ? best : `Good question! Here's something I know: ${best}`, source: 'local' };
  }
  private localExplain(text: string, criteria: string[]): NpcReplyResponse {
    const ans = toks(text);
    const covered = criteria.filter((c) => phraseIn(c, ans));
    const missing = criteria.filter((c) => !covered.includes(c));
    const need = Math.min(criteria.length, Math.max(2, Math.ceil(criteria.length * 0.5)));
    const passed = covered.length >= need && text.trim().split(/\s+/).length >= 4;
    const reply = passed ? `Wonderful explaining! You talked about ${covered.slice(0, 3).join(', ')}.` : covered.length ? `Good start! You mentioned ${covered.join(', ')}. Can you also tell me about ${missing[0]}?` : `Hmm, try telling me about ${missing.slice(0, 2).join(' and ')}. Use whole sentences!`;
    return { reply, explain: { covered, missing, passed }, source: 'local' };
  }

  // ============================================================ ask a question (choice / typed / voice)
  private ask(container: HTMLElement, q: Question, opts: { hideChoices?: boolean; objectiveId?: string; kind: 'question_answer' | 'recall_attempt' | 'review_attempt' | 'study_check'; speakVoice?: string; npcSpeaks?: boolean }): Promise<{ attempts: number; hints: number }> {
    return new Promise((resolve) => {
      let attempts = 0, hints = 0;
      const prompt = h('div', { class: 'qprompt' }, q.prompt);
      const fb = h('div', { class: 'feedback' });
      const choicesWrap = h('div', {});
      const order = q.choices.map((_, i) => i);
      const showChoices = () => {
        choicesWrap.replaceChildren(this.ui.choices(q, (i, btn) => { if (i === q.answerIndex) btn.classList.add('right'); else btn.classList.add('wrong'); judge(i === q.answerIndex); }, order));
        setTimeout(() => this.ui.focusFirst(choicesWrap), 20);
      };
      let localBar: VoiceBar | null = null;
      const extra = h('div', { class: 'row', style: 'margin-top:10px' });
      if (opts.hideChoices) {
        const reveal = h('button', { class: 'btn soft', disabled: 'true', onclick: () => { reveal.remove(); showChoices(); } }, 'Show choices');
        extra.append(reveal);
        (extra as HTMLElement & { _reveal?: HTMLElement })._reveal = reveal;
      } else showChoices();
      container.replaceChildren(prompt, choicesWrap, fb, extra);
      if (!this.dlg) {
        localBar = this.ui.makeVoiceBar({ placeholder: 'Type your answer…', micAvailable: this.micAvailable, onSend: (t) => this.childSays(t), onMic: () => { if (this.micAvailable) { this.voice.holdStart(); setTimeout(() => this.voice.holdEnd(), 6000); } } });
        container.append(localBar.el);
        if (opts.hideChoices) setTimeout(() => localBar!.input.focus(), 50);
        void this.voice.start({ worldId: this.world.worldId, npcId: this.activeNpc?.id ?? 'companion', sessionId: this.tele.sessionId, questionId: q.id, mode: 'answer', objectiveId: opts.objectiveId }).catch(() => undefined);
      } else this.voice.setContext({ questionId: q.id, mode: 'answer', objectiveId: opts.objectiveId });
      const judge = (correct: boolean, feedback?: string) => {
        attempts++;
        this.state.record(opts.objectiveId, correct);
        this.tele.send(opts.kind, { objectiveId: opts.objectiveId, questionId: q.id, attempt: attempts, result: correct ? 'correct' : 'incorrect', hintsUsed: hints });
        if (correct) {
          this.waiter = null;
          Audio.play('confirm');
          fb.className = 'feedback show good'; fb.textContent = q.explain || feedback || 'Yes!';
          if (opts.npcSpeaks) this.speak(q.explain || 'Yes!', opts.speakVoice);
          const p = this.scene.player.sprite; this.scene.burst(p.x, p.y - 40, 14, '#3ddc97');
          choicesWrap.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
          extra.replaceChildren(h('button', { class: 'btn go', 'data-default': '1', onclick: () => { if (localBar) this.voice.stop(); resolve({ attempts, hints }); } }, 'Continue'));
          setTimeout(() => this.ui.focusFirst(extra), 30);
        } else {
          Audio.play('wrong', { volume: 0.5 });
          const hint = q.hints[Math.min(hints, q.hints.length - 1)];
          if (hint) hints++;
          if (hint) { this.state.stat(opts.objectiveId ?? '').hints++; this.tele.send('hint', { objectiveId: opts.objectiveId, questionId: q.id, hintsUsed: hints }); }
          fb.className = 'feedback show try';
          fb.innerHTML = `<b>Not quite, try again!</b> ${esc(feedback && !hint ? feedback : hint ? `Hint: ${hint}` : '')}`;
          const rv = (extra as HTMLElement & { _reveal?: HTMLButtonElement })._reveal as HTMLButtonElement | undefined;
          if (rv) rv.disabled = false;
          if (opts.npcSpeaks && hint) this.speak(hint, opts.speakVoice);
        }
      };
      this.waiter = { q, judge };
    });
  }

  // ============================================================ STUDY
  async openStudy(zoneId: string, startId?: string) {
    const cards = this.cardsFor(zoneId);
    if (!cards.length) { this.companionSay('Nothing to read here.'); return; }
    this.closeDialogue();
    let ci = Math.max(0, startId ? cards.findIndex((c) => c.id === startId) : cards.findIndex((c) => !this.state.has(`study:${c.id}`)));
    const card = h('div', { class: 'sticker card study' });
    const shell = this.ui.open(card);
    const close = () => { this.ui.close(shell); this.voice.cancelSpeech(); this.waiter = null; this.refresh(); };
    const renderCard = async (c: StudyCard) => {
      this.state.add(`opened:${c.id}`);
      this.tele.send('study_open', { objectiveId: c.objectiveId, detail: c.id });
      const pages: ('p' | 'ex' | 'fig')[] = [];
      c.body.forEach(() => pages.push('p'));
      const fig = figureSvg(c.figure, c.keyTerms.map((k) => k.term), c.title, this.kit.glow);
      if (fig) pages.push('fig');
      if (c.example) pages.push('ex');
      let pi = 0;
      const render = () => {
        const kind = pages[pi];
        const content = h('div', {});
        if (kind === 'p') {
          const para = h('div', { class: 'para' });
          let html = esc(c.body[c.body.filter((_, i) => i <= pi).length - 1] ?? c.body[pi]);
          html = esc(c.body[pages.slice(0, pi + 1).filter((p) => p === 'p').length - 1]);
          for (const k of [...c.keyTerms].sort((a, b) => b.term.length - a.term.length)) {
            const re = new RegExp(`\\b(${k.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'i');
            html = html.replace(re, `<span class="term" tabindex="0" data-term="${esc(k.term)}">$1</span>`);
          }
          para.innerHTML = html;
          const tip = h('div', { class: 'termtip', style: 'display:none' });
          para.querySelectorAll<HTMLElement>('.term').forEach((t) => {
            const show = () => { const k = c.keyTerms.find((x) => x.term === t.dataset.term); if (k) { tip.innerHTML = `<b>${esc(k.term)}</b>: ${esc(k.meaning)}`; tip.style.display = 'block'; Audio.play('tick'); } };
            t.addEventListener('click', show); t.addEventListener('keydown', (e) => { if (e.key === 'Enter') show(); });
          });
          content.append(para, tip);
          this.speak(para.textContent ?? '');
        } else if (kind === 'fig') {
          content.append(h('div', { class: 'figure', html: fig! }), h('div', { class: 'chips' }, ...c.keyTerms.map((k) => h('span', { class: 'chip', title: k.meaning }, k.term))));
        } else {
          content.append(h('div', { class: 'example' }, h('b', {}, 'For example'), c.example!));
          this.speak(c.example!);
        }
        const last = pi === pages.length - 1;
        card.replaceChildren(
          h('div', { class: 'row' }, h('span', { class: 'kicker' }, `Study · ${this.zoneName(c.zoneId)} · card ${ci + 1} of ${cards.length}`), h('span', { class: 'spacer' }), h('button', { class: 'btn icon ghost', 'data-close': '1', onclick: close, 'aria-label': 'Close' }, 'Close')),
          h('h2', {}, c.title),
          h('div', { class: 'dots' }, ...pages.map((_, i) => h('i', { class: i <= pi ? 'on' : '' }))),
          content,
          h('div', { class: 'row', style: 'margin-top:14px' },
            c.sourceSectionIds.length ? h('span', { class: 'prov' }, `From your lesson: section ${c.sourceSectionIds.join(', ')}`) : '',
            h('span', { class: 'spacer' }),
            h('button', { class: 'btn soft', onclick: () => this.speak(content.textContent ?? '') }, 'Read aloud'),
            pi > 0 ? h('button', { class: 'btn', onclick: () => { pi--; Audio.play('page'); render(); } }, 'Back') : '',
            h('button', { class: 'btn primary', 'data-default': '1', onclick: () => { Audio.play('page'); if (!last) { pi++; render(); } else void checks(); } }, last ? (this.state.has(`study:${c.id}`) ? 'Done' : 'Check what I learned') : 'Next'),
          ),
        );
        setTimeout(() => this.ui.focusFirst(card), 20);
      };
      const checks = async () => {
        if (this.state.has(`study:${c.id}`) || !c.checks.length) { this.state.add(`study:${c.id}`); return afterCard(); }
        for (let i = 0; i < c.checks.length; i++) {
          const area = h('div', {});
          card.replaceChildren(h('div', { class: 'row' }, h('span', { class: 'kicker' }, `Quick check ${i + 1} of ${c.checks.length}`), h('span', { class: 'spacer' }), h('button', { class: 'btn soft', onclick: () => { pi = 0; render(); } }, 'Read again')), h('h2', {}, c.title), area);
          await this.ask(area, c.checks[i], { objectiveId: c.objectiveId, kind: 'study_check', npcSpeaks: true });
        }
        this.state.add(`study:${c.id}`);
        this.ui.toast(`Studied: ${c.title}`, true, 2000);
        afterCard();
      };
      const afterCard = () => {
        const nextIdx = cards.findIndex((x, i) => i > ci && !this.state.has(`study:${x.id}`));
        if (nextIdx >= 0 || ci < cards.length - 1) { ci = nextIdx >= 0 ? nextIdx : ci + 1; void renderCard(cards[ci]); }
        else {
          const npc = this.npcFor(c.objectiveId);
          card.replaceChildren(h('h2', {}, 'Great reading!'), h('p', { style: 'font-size:22px' }, npc ? `Now go and show ${npc.name} what you learned.` : 'You finished every card here.'), h('div', { class: 'row' }, h('span', { class: 'spacer' }), h('button', { class: 'btn primary', 'data-default': '1', 'data-close': '1', onclick: () => { close(); if (npc) void this.talk(npc); } }, npc ? `Talk to ${npc.name}` : 'Close')));
          setTimeout(() => this.ui.focusFirst(card), 20);
        }
      };
      render();
    };
    void renderCard(cards[ci]);
  }

  // ============================================================ NPC TUTOR
  async talk(npc: NpcSpec) {
    this.openDialogue(npc, npc.name, npc.title, npc.archetype);
    this.tele.send('npc_talk', { objectiveId: npc.objectiveId, detail: npc.id });
    const cards = this.world.study.filter((c) => c.objectiveId === npc.objectiveId);
    const firstVisit = !this.state.has(`met:${npc.id}`);
    this.state.add(`met:${npc.id}`);
    if (firstVisit || !this.state.has(`talk:${npc.id}`)) await this.say(npc.greeting);
    else await this.say(`Hello again! What would you like to do?`);
    if (!this.dlg) return;
    const unread = cards.filter((c) => !this.state.has(`study:${c.id}`));
    if (!this.state.has(`talk:${npc.id}`) && unread.length) {
      await this.say(`Before I ask you anything, read the study stone next to me. It's called “${unread[0].title}”.`);
      this.buttons([{ label: 'Read it now', cls: 'primary', def: true, on: () => { this.closeDialogue(); void this.openStudy(unread[0].zoneId, unread[0].id); } }, { label: 'Chat first', on: () => void this.menu(npc) }, { label: 'Bye', on: () => this.closeDialogue() }]);
      return;
    }
    if (!this.state.has(`talk:${npc.id}`)) {
      for (const t of npc.teach) { if (!this.dlg) return; await this.next(); await this.say(t); }
      if (!this.dlg) return;
      await this.next('Ask me!');
      await this.say(npc.check.prompt);
      if (!this.dlg) return;
      await this.ask(this.dlg.area, npc.check, { objectiveId: npc.objectiveId, kind: 'question_answer', speakVoice: npc.voice, npcSpeaks: true });
      this.state.add(`talk:${npc.id}`);
    }
    if (!this.dlg) return;
    if (!this.state.has(`explain:${npc.id}`)) { await this.explain(npc); if (!this.dlg) return; }
    await this.menu(npc);
  }

  private criteriaFor(objectiveId: string): string[] {
    const terms: string[] = [];
    for (const c of this.world.study.filter((s) => s.objectiveId === objectiveId)) for (const k of c.keyTerms) if (!terms.includes(k.term)) terms.push(k.term);
    return terms.slice(0, 5);
  }

  private explain(npc: NpcSpec, side?: SideQuest): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.dlg) return resolve(false);
      const criteria = side?.rubric?.length ? side.rubric : this.criteriaFor(npc.objectiveId);
      const cards = this.world.study.filter((c) => c.objectiveId === npc.objectiveId);
      const topic = cards.map((c) => c.title.toLowerCase()).join(' and ') || 'what you learned';
      const ask = side ? side.prompt : `Now you be the teacher! Explain to me, in your own words: ${topic}. Use whole sentences.`;
      let attempts = 0;
      void this.say(ask);
      this.voice.setContext({ mode: 'explain', objectiveId: side?.objectiveId ?? npc.objectiveId, questionId: undefined });
      const chips = h('div', { class: 'chips' }, ...criteria.map((c) => h('span', { class: 'chip miss' }, c)));
      const render = (extra: HTMLElement[] = []) => {
        this.dlg?.area.replaceChildren(h('div', { style: 'font-size:15px;color:var(--muted-ink)' }, 'Say it with the mic or type below. A good explanation mentions:'), chips, h('div', { class: 'row' }, ...extra,
          cards[0] ? h('button', { class: 'btn soft', onclick: () => { this.closeDialogue(); void this.openStudy(cards[0].zoneId, cards[0].id); resolve(false); } }, 'Show me again') : '',
          h('button', { class: 'btn ghost', onclick: () => { this.explainWaiter = null; resolve(false); void this.menu(npc); } }, 'Not now')));
        setTimeout(() => this.dlg?.bar.input.focus(), 40);
      };
      render();
      this.explainWaiter = {
        criteria,
        handle: (r) => {
          attempts++;
          const ex = r.explain ?? this.localExplain('', criteria).explain!;
          chips.replaceChildren(...criteria.map((c) => h('span', { class: `chip ${ex.covered.some((k) => k.toLowerCase() === c.toLowerCase()) ? 'ok' : 'miss'}` }, c)), ...ex.covered.filter((k) => !criteria.some((c) => c.toLowerCase() === k.toLowerCase())).map((k) => h('span', { class: 'chip ok' }, k)));
          this.tele.send('explain_attempt', { objectiveId: side?.objectiveId ?? npc.objectiveId, attempt: attempts, result: ex.passed ? 'correct' : 'incorrect', detail: side?.id ?? npc.id });
          this.state.record(side?.objectiveId ?? npc.objectiveId, ex.passed);
          void this.say(r.reply);
          if (ex.passed) {
            this.explainWaiter = null;
            Audio.play('jingle-success');
            const p = this.scene.player.sprite; this.scene.burst(p.x, p.y - 40, 24, '#ffc93c');
            if (!side) this.state.add(`explain:${npc.id}`);
            this.voice.setContext({ mode: 'chat' });
            this.dlg?.area.replaceChildren(chips, h('div', { class: 'row' }, h('button', { class: 'btn go', 'data-default': '1', onclick: () => resolve(true) }, 'Continue')));
            setTimeout(() => this.dlg && this.ui.focusFirst(this.dlg.area), 30);
          } else { Audio.play('wrong', { volume: 0.4 }); }
        },
      };
    });
  }

  private async menu(npc: NpcSpec) {
    if (!this.dlg) return;
    this.voice.setContext({ mode: 'chat', questionId: undefined, objectiveId: npc.objectiveId });
    const sides = this.world.sideQuests.filter((q) => q.giverNpcId === npc.id && !this.state.sideDone.has(q.id));
    const cur = this.state.currentStep();
    const nextTip = cur && cur.step.kind === 'puzzle' && this.world.puzzles.some((p) => p.id === cur.step.targetId && p.zoneId === npc.zoneId) ? `Now try the practice at the ${this.zoneName(npc.zoneId)}!` : 'Ask me anything about it, or try a bonus quest!';
    await this.say(nextTip);
    if (!this.dlg) return;
    this.buttons([
      ...(this.state.has(`talk:${npc.id}`) ? sides.map((q) => ({ label: `★ ${q.title}`, cls: 'sideflag', on: () => void this.side(npc, q) })) : []),
      ...(!this.state.has(`explain:${npc.id}`) && this.state.has(`talk:${npc.id}`) ? [{ label: 'Explain it to you', cls: 'primary', on: () => { void this.explain(npc).then((ok) => ok && this.menu(npc)); } }] : []),
      { label: 'Bye', def: true, on: () => this.closeDialogue() },
    ]);
  }

  private async side(npc: NpcSpec, q: SideQuest) {
    if (!this.dlg) return;
    const done = () => {
      this.state.sideDone.add(q.id); this.state.add(`side:${q.id}`);
      this.tele.send('side_quest_complete', { objectiveId: q.objectiveId, detail: q.id });
      Audio.play('jingle-item');
      this.ui.toast(`Bonus quest done! You earned ${q.reward}.`, true);
    };
    if (q.kind === 'explain') {
      const ok = await this.explain(npc, q);
      if (ok) done();
      if (this.dlg) void this.menu(npc);
      return;
    }
    if (q.kind === 'find' && q.targetId) {
      const col = this.world.collectibles.find((c) => c.id === q.targetId);
      const zoneTarget = this.world.zones.find((z) => z.id === q.targetId);
      const have = col ? (this.state.counts.get(col.id) ?? 0) >= col.count : zoneTarget ? this.state.discovered.has(zoneTarget.id) : true;
      if (!have) { this.state.sideStarted.add(q.id); await this.say(q.prompt); this.buttons([{ label: "I'll find them!", cls: 'primary', def: true, on: () => this.closeDialogue() }]); return; }
    } else await this.say(q.prompt);
    for (const qq of q.questions ?? []) {
      if (!this.dlg) return;
      await this.say(qq.prompt);
      if (!this.dlg) return;
      await this.ask(this.dlg.area, qq, { objectiveId: q.objectiveId, kind: 'question_answer', speakVoice: npc.voice, npcSpeaks: true });
    }
    done();
    if (this.dlg) void this.menu(npc);
  }

  // ============================================================ landmarks / practice / recall
  private landmark(zoneId: string) {
    const z = this.world.zones.find((q) => q.id === zoneId);
    const mem = this.world.memoryLandmarks.find((m) => m.zoneId === zoneId);
    if (this.state.recallActive() && mem && !this.state.has(`recall:${zoneId}`)) { void this.recall(mem.zoneId); return; }
    const pz = this.world.puzzles.find((p) => p.zoneId === zoneId && !this.state.has(`puzzle:${p.id}`));
    if (pz) {
      if (this.puzzleReady(pz)) { void this.puzzle(pz); return; }
      const npc = this.npcFor(pz.objectiveId);
      this.companionSay(`This is a practice spot! First read the study stone${npc ? ` and talk to ${npc.name}` : ''}.`);
      return;
    }
    this.companionSay(z?.description || `This is ${z?.name}.`);
  }

  private puzzleShell(p: PuzzleSpec) {
    const card = h('div', { class: 'sticker card' });
    const shell = this.ui.open(card);
    let hints = 0, attempts = 0;
    const fb = h('div', { class: 'feedback' });
    const body = h('div', {});
    const hintBtn = h('button', { class: 'btn soft', onclick: () => { const t = p.hints[Math.min(hints, p.hints.length - 1)]; if (!t) return; hints++; this.state.stat(p.objectiveId).hints++; this.tele.send('hint', { objectiveId: p.objectiveId, puzzleId: p.id, hintsUsed: hints }); fb.className = 'feedback show try'; fb.textContent = `Hint: ${t}`; Audio.play('pluck'); } }, 'Hint');
    const checkBtn = h('button', { class: 'btn primary', 'data-default': '1' }, 'Check');
    card.append(h('div', { class: 'row' }, h('span', { class: 'kicker' }, `Practice · ${this.zoneName(p.zoneId)}`), h('span', { class: 'spacer' }), h('button', { class: 'btn ghost', 'data-close': '1', onclick: () => this.ui.close(shell) }, 'Later')), h('h2', {}, p.title), h('p', { style: 'font-size:21px;margin:4px 0 8px' }, p.prompt), body, fb, h('div', { class: 'row', style: 'margin-top:12px' }, hintBtn, h('span', { class: 'spacer' }), checkBtn));
    const attempt = (ok: boolean) => {
      attempts++;
      this.state.record(p.objectiveId, ok);
      this.tele.send('puzzle_attempt', { objectiveId: p.objectiveId, puzzleId: p.id, attempt: attempts, result: ok ? 'correct' : 'incorrect', hintsUsed: hints });
      if (ok) {
        Audio.play('jingle-success');
        fb.className = 'feedback show good'; fb.textContent = p.success;
        this.speak(p.success);
        checkBtn.textContent = 'Wonderful!'; checkBtn.onclick = () => { this.ui.close(shell); this.state.add(`puzzle:${p.id}`); };
        hintBtn.remove();
        setTimeout(() => checkBtn.focus(), 30);
      } else {
        Audio.play('wrong', { volume: 0.5 });
        fb.className = 'feedback show try';
        const t = p.hints[Math.min(hints, p.hints.length - 1)];
        fb.textContent = `Almost! Look again.${t ? ` Hint: ${t}` : ''}`;
        if (t) hints++;
      }
    };
    return { card, shell, body, checkBtn, attempt };
  }

  private async puzzle(p: PuzzleSpec) {
    this.closeDialogue();
    const { body, checkBtn, attempt } = this.puzzleShell(p);
    if (p.kind === 'sequence' && p.items) {
      const correct = p.items;
      let order = [...correct];
      for (let i = 0; i < 20 && order.every((x, j) => x === correct[j]); i++) order = order.map((v) => ({ v, r: Math.random() })).sort((a, b) => a.r - b.r).map((x) => x.v);
      let sel = -1;
      const list = h('div', { class: 'seq' });
      const render = (focusIdx = -1) => {
        list.replaceChildren(...order.map((it, i) => {
          const el = h('div', { class: `seq-item${sel === i ? ' sel' : ''}`, tabindex: '0', draggable: 'true', 'aria-label': `${i + 1}. ${it}. Press Enter to pick up, arrows to move.` },
            h('span', { class: 'num' }, String(i + 1)), it,
            h('span', { class: 'mv' }, h('button', { class: 'btn icon', 'aria-label': 'Move up', onclick: (e: Event) => { e.stopPropagation(); move(i, -1); } }, '▲'), h('button', { class: 'btn icon', 'aria-label': 'Move down', onclick: (e: Event) => { e.stopPropagation(); move(i, 1); } }, '▼')));
          el.addEventListener('click', () => { sel = sel === i ? -1 : i; render(i); });
          el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); sel = sel === i ? -1 : i; render(i); }
            if (sel === i && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); e.stopPropagation(); move(i, e.key === 'ArrowUp' ? -1 : 1); }
          });
          el.addEventListener('dragstart', (e) => { e.dataTransfer?.setData('text/plain', String(i)); el.classList.add('dragging'); });
          el.addEventListener('dragover', (e) => e.preventDefault());
          el.addEventListener('drop', (e) => { e.preventDefault(); const from = Number(e.dataTransfer?.getData('text/plain')); if (Number.isFinite(from) && from !== i) { const [x] = order.splice(from, 1); order.splice(i, 0, x); Audio.play('tick'); render(i); } });
          return el;
        }));
        if (focusIdx >= 0) (list.children[focusIdx] as HTMLElement)?.focus();
      };
      const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; if (sel === i) sel = j; Audio.play('tick'); render(j); };
      // gamepad: up/down moves the selected item
      body.append(list); render();
      checkBtn.onclick = () => attempt(order.every((x, j) => x === correct[j]));
    } else if (p.kind === 'match' && p.pairs) {
      const pairs = p.pairs;
      const rights = pairs.map((x, i) => ({ t: x.right, i })).sort(() => Math.random() - 0.5);
      const matched = new Set<number>();
      let left = -1;
      const grid = h('div', { class: 'match' });
      const lBtns: HTMLButtonElement[] = [], rBtns: HTMLButtonElement[] = [];
      pairs.forEach((pr, i) => {
        const lb = h('button', { class: 'btn match-btn', onclick: () => { left = i; lBtns.forEach((b, k) => b.classList.toggle('sel', k === i)); Audio.play('select'); rBtns.find((b) => !b.classList.contains('done'))?.focus(); } }, pr.left);
        const r = rights[i];
        const rb = h('button', { class: 'btn match-btn', onclick: () => {
          if (left < 0) { fbPick(); return; }
          const ok = r.i === left;
          if (ok) { matched.add(left); lBtns[left].classList.add('done'); rb.classList.add('done'); rb.textContent = `${pairs[left].left} → ${r.t}`; Audio.play('confirm'); left = -1; lBtns.forEach((b) => b.classList.remove('sel')); lBtns.find((b) => !b.classList.contains('done'))?.focus(); if (matched.size === pairs.length) attempt(true); }
          else { rb.classList.add('bad'); setTimeout(() => rb.classList.remove('bad'), 400); attempt(false); }
        } }, r.t);
        lBtns.push(lb); rBtns.push(rb); grid.append(lb, rb);
      });
      const fbPick = () => this.ui.toast('Pick something on the left first!');
      body.append(grid);
      checkBtn.style.display = 'none';
      setTimeout(() => lBtns[0]?.focus(), 40);
    } else if (p.kind === 'choice' && p.questions) {
      checkBtn.style.display = 'none';
      for (const q of p.questions) {
        const area = h('div', {}); body.replaceChildren(area);
        const r = await this.ask(area, q, { objectiveId: p.objectiveId, kind: 'question_answer' });
        this.tele.send('puzzle_attempt', { objectiveId: p.objectiveId, puzzleId: p.id, questionId: q.id, attempt: r.attempts, result: 'correct', hintsUsed: r.hints });
      }
      checkBtn.style.display = '';
      attempt(true);
    }
  }

  private async recall(zoneId: string) {
    const mem = this.world.memoryLandmarks.find((m) => m.zoneId === zoneId)!;
    this.closeDialogue();
    const card = h('div', { class: 'sticker card' });
    const shell = this.ui.open(card);
    const area = h('div', {});
    card.append(h('div', { class: 'row' }, h('span', { class: 'kicker' }, `Memory place · ${this.zoneName(zoneId)}`), h('span', { class: 'spacer' }), h('button', { class: 'btn ghost', 'data-close': '1', onclick: () => { this.waiter = null; this.ui.close(shell); } }, 'Later')), h('h2', {}, 'Remember…'), h('p', { style: 'font-size:18px;color:var(--muted-ink);margin:0' }, 'Say or type it from memory. Choices appear only after you try.'), area);
    this.speak(mem.question.prompt);
    await this.ask(area, mem.question, { objectiveId: mem.objectiveId, kind: 'recall_attempt', hideChoices: true });
    this.ui.close(shell);
    this.scene.reward('light', zoneId, this.scene.saturation);
    this.state.add(`recall:${zoneId}`);
    const left = this.world.memoryLandmarks.filter((m) => !this.state.has(`recall:${m.zoneId}`)).length;
    if (left) this.companionSay(`You remembered! ${left} more memory place${left > 1 ? 's' : ''} to visit.`);
  }

  openReview() {
    if (this.ui.modal || !this.world.reviewQuestions.length) return;
    this.lastReviewAt = this.elapsed; this.reviewClock = 0;
    const q = [...this.world.reviewQuestions].sort((a, b) => (this.state.reviewAsked.get(a.id) ?? -1) - (this.state.reviewAsked.get(b.id) ?? -1))[0];
    this.state.reviewAsked.set(q.id, this.elapsed);
    const card = h('div', { class: 'sticker card' });
    const shell = this.ui.open(card);
    const area = h('div', {});
    card.append(h('div', { class: 'row' }, h('span', { class: 'kicker' }, 'Quick recall!'), h('span', { class: 'spacer' }), h('button', { class: 'btn ghost', 'data-close': '1', onclick: () => { this.waiter = null; this.tele.send('review_attempt', { questionId: q.id, result: 'skipped' }); this.ui.close(shell); } }, 'Not now')), h('h2', {}, `${this.world.companion.name} wonders…`), area);
    Audio.play('chime');
    void this.ask(area, q, { kind: 'review_attempt', hideChoices: true }).then(() => this.ui.close(shell));
  }

  private discover(id: string, text: string) {
    this.scene.removeDiscovery(id);
    this.state.found.add(id);
    Audio.play('jingle-item');
    this.ui.toast('You found a secret fact!', true, 1600);
    this.companionSay(text);
    this.speak(text);
  }

  // ============================================================ hints (companion)
  hint() {
    const cur = this.state.currentStep();
    if (!cur) { this.companionSay(this.state.finished ? 'We did it! Explore and find secret sparkles!' : 'Look around!'); return; }
    const key = cur.step.id;
    const lvl = Math.min(3, (this.state.hintLevel.get(key) ?? 0) + 1);
    this.state.hintLevel.set(key, lvl);
    const s = cur.step;
    let hints: string[] = [];
    let where = '';
    const npc = this.world.npcs.find((n) => n.id === s.targetId);
    if (s.kind === 'study') { const c = this.world.study.find((x) => x.id === s.targetId); where = c ? `the study stone at the ${this.zoneName(c.zoneId)}` : ''; hints = c?.checks[0]?.hints ?? []; }
    else if (s.kind === 'talk' && npc) { where = `${npc.name} at the ${this.zoneName(npc.zoneId)}`; hints = npc.check.hints; }
    else if (s.kind === 'explain' && npc) { where = `${npc.name}`; hints = [`Tell ${npc.name} about: ${this.criteriaFor(npc.objectiveId).join(', ')}.`, `Start with: “A plant…” and use the key words from the study cards.`]; }
    else if (s.kind === 'puzzle') { const p = this.world.puzzles.find((x) => x.id === s.targetId); where = p ? `the ${this.zoneName(p.zoneId)}` : ''; hints = p?.hints ?? []; }
    else if (s.kind === 'collect') { const c = this.world.collectibles.find((x) => x.id === s.targetId); where = c ? `around the ${this.zoneName(c.zoneId)}` : ''; }
    else if (s.kind === 'visit') where = `the ${this.zoneName(s.targetId)}`;
    else if (s.kind === 'recall') where = 'the glowing memory places';
    const dir = this.dirWord();
    const msg = lvl === 1 ? `Let's go to ${where}${dir ? `, ${dir}` : ''}! Follow the yellow arrow.` : hints[lvl - 2] ?? hints[hints.length - 1] ?? `Head to ${where}.`;
    if (s.kind === 'recall' && lvl > 1) this.companionSay('Try to remember first! At the place, you can ask for choices after one try.');
    else this.companionSay(msg);
    this.tele.send('hint', { objectiveId: cur.quest.objectiveId, hintsUsed: lvl, detail: s.id });
  }
  private dirWord(): string {
    const t = this.targetPos(); if (!t || !this.scene) return '';
    const p = this.scene.player;
    const dx = (t.x - p.gx) - (t.y - p.gy), dy = (t.x - p.gx) + (t.y - p.gy);
    if (Math.hypot(dx, dy) < 3) return 'right here';
    const v = dy < -Math.abs(dx) * 0.5 ? 'up' : dy > Math.abs(dx) * 0.5 ? 'down' : '';
    const hz = dx < -Math.abs(dy) * 0.5 ? 'left' : dx > Math.abs(dy) * 0.5 ? 'right' : '';
    return [v, hz].filter(Boolean).join(' and ') ? `${[v, hz].filter(Boolean).join(' and to the ')}` : '';
  }

  // ============================================================ Exa the goat
  askGoat() {
    if (this.ui.stack.length) return;
    const card = h('div', { class: 'sticker card' });
    const shell = this.ui.open(card);
    const input = h('input', { type: 'text', placeholder: 'I wonder why…', style: 'font:20px var(--font-body);padding:12px;border:3px solid var(--ink);border-radius:12px;flex:1;min-width:200px' });
    const go = async () => {
      const q = input.value.trim(); if (!q) return;
      this.ui.close(shell);
      this.tele.send('goat', { detail: q.slice(0, 200) });
      try { const c = await api.goat(q, this.world.worldId); this.showGoat(q, c.text, c.source); }
      catch { this.showGoat(q, "My internet is napping right now! Ask a grown-up to help you look it up, or ask one of the characters.", 'offline'); }
    };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') void go(); });
    card.append(h('div', { class: 'row' }, h('span', { class: 'kicker' }, 'Ask Exa the goat'), h('span', { class: 'spacer' }), h('button', { class: 'btn ghost', 'data-close': '1', onclick: () => this.ui.close(shell) }, 'Close')), h('h2', {}, 'What are you curious about?'), h('p', { style: 'font-size:18px' }, 'Exa finds a kid-friendly fact from a trusted website.'), h('div', { class: 'row' }, input, h('button', { class: 'btn primary', onclick: () => void go() }, 'Ask')));
    setTimeout(() => input.focus(), 50);
  }
  showGoat(question: string, text: string, source: string) {
    this.scene.goatIn();
    Audio.play('appear');
    setTimeout(() => {
      let domain = source; try { domain = new URL(source).hostname.replace(/^www\./, ''); } catch { /* plain */ }
      this.ui.goatCard.replaceChildren(h('b', {}, 'Exa the goat'), h('div', { style: 'font-size:14px;color:var(--muted-ink);margin:2px 0 6px' }, `“${question}”`), h('div', { style: 'font-size:17px;line-height:1.4' }, text), h('span', { class: 'domain' }, domain));
      this.ui.goatCard.classList.add('show');
      this.speak(text);
      setTimeout(() => { this.ui.goatCard.classList.remove('show'); this.scene.goatOut(); }, Math.max(7000, text.length * 70));
    }, 1100);
  }

  // ============================================================ book / pause / intro / finale
  openBook() {
    if (this.ui.stack.length) return;
    Audio.play('open');
    const card = h('div', { class: 'sticker card' });
    const shell = this.ui.open(card);
    const tabs = ['Goals', 'Study cards', 'Glossary', 'Places'];
    let tab = 0;
    const content = h('div', {});
    const render = () => {
      let body: HTMLElement;
      if (tab === 0) {
        body = h('div', {}, ...this.state.objectives().map((o, i) => {
          const m = this.state.mastery(o);
          return h('div', { class: 'objrow' }, h('h3', {}, `${i + 1}. ${this.state.objectiveLabel(o)}`), h('div', { class: 'mastery' }, ...STAGES.map((s) => h('span', { class: m[s] ? 'on' : '' }))), h('div', { class: 'mastery-labels' }, ...STAGES.map((s) => h('span', {}, s))));
        }));
      } else if (tab === 1) {
        const opened = this.world.study.filter((c) => this.state.has(`opened:${c.id}`));
        body = h('div', { class: 'list' }, ...(opened.length ? opened.map((c) => h('button', { class: 'btn', style: 'justify-content:space-between', onclick: () => { this.ui.close(shell); void this.openStudy(c.zoneId, c.id); } }, c.title, h('span', { class: 'chip' }, this.state.has(`study:${c.id}`) ? 'checked' : 'read'))) : [h('p', { style: 'font-size:18px' }, 'Read a study stone to add cards here.')]));
      } else if (tab === 2) {
        const known = this.world.glossary.filter((g) => this.world.study.some((c) => this.state.has(`opened:${c.id}`) && c.keyTerms.some((k) => k.term.toLowerCase() === g.term.toLowerCase())) || this.state.completedQuests.length > 1);
        body = h('div', { class: 'gloss' }, ...(known.length ? known : this.world.glossary.slice(0, 0)).flatMap((g) => [h('b', {}, g.term), h('span', {}, g.meaning)]));
        if (!known.length) body = h('p', { style: 'font-size:18px' }, 'New words appear here as you study.');
      } else {
        const zones = this.world.zones.filter((z) => z.kind !== 'hub');
        body = h('div', {}, h('p', { style: 'font-size:18px' }, `Places discovered: ${zones.filter((z) => this.state.discovered.has(z.id)).length} / ${zones.length}`), h('div', { class: 'chips' }, ...zones.map((z) => h('span', { class: `chip ${this.state.discovered.has(z.id) ? 'ok' : 'miss'}` }, this.state.discovered.has(z.id) ? z.name : '???'))),
          h('p', { style: 'font-size:18px' }, 'Items:'), h('div', { class: 'chips' }, ...this.world.collectibles.map((c) => h('span', { class: 'chip' }, `${c.name}: ${this.state.counts.get(c.id) ?? 0}/${c.count}`))),
          h('p', { style: 'font-size:18px' }, `Secret facts found: ${this.scene.discoveries.filter((d) => d.found).length} / ${this.scene.discoveries.length}`));
      }
      content.replaceChildren(h('div', { class: 'tabs' }, ...tabs.map((t, i) => h('button', { class: `btn${i === tab ? ' on' : ''}`, onclick: () => { tab = i; Audio.play('page'); render(); } }, t))), body);
    };
    card.append(h('div', { class: 'row' }, h('span', { class: 'kicker' }, this.world.subject), h('span', { class: 'spacer' }), h('button', { class: 'btn ghost', 'data-close': '1', onclick: () => { this.ui.close(shell); Audio.play('close'); } }, 'Close')), h('h2', {}, 'Study Book'), content);
    render();
  }

  openPause() {
    if (this.ui.stack.length) return;
    Audio.play('open');
    const card = h('div', { class: 'sticker card', style: 'width:min(460px,calc(100vw - 32px))' });
    const shell = this.ui.open(card);
    const vol = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(this.volume), 'aria-label': 'Volume' }) as HTMLInputElement;
    vol.addEventListener('input', () => { this.volume = Number(vol.value); Audio.setVolumes(this.volume * 0.7, this.volume); try { localStorage.setItem('wc-vol', vol.value); } catch { /* */ } });
    const rm = h('button', { class: 'btn', onclick: () => { this.reduced = !this.reduced; document.body.classList.toggle('reduced', this.reduced); this.scene.reducedMotion = this.reduced; rm.textContent = `Reduced motion: ${this.reduced ? 'on' : 'off'}`; try { localStorage.setItem('wc-reduced', this.reduced ? '1' : '0'); } catch { /* */ } } }, `Reduced motion: ${this.reduced ? 'on' : 'off'}`);
    card.append(h('h2', {}, 'Paused'), h('div', { class: 'list' },
      h('button', { class: 'btn primary', 'data-default': '1', 'data-close': '1', onclick: () => this.ui.close(shell) }, 'Resume'),
      h('button', { class: 'btn', onclick: () => this.controls() }, 'Controls'),
      h('label', { class: 'row', style: 'font-size:18px;font-weight:700' }, 'Volume', vol), rm,
      h('a', { class: 'btn', href: '/' }, 'Back to website')));
  }
  controls() {
    const card = h('div', { class: 'sticker card', style: 'width:min(620px,calc(100vw - 32px))' });
    const shell = this.ui.open(card);
    const rows: [string, string, string][] = [['Move', 'WASD / arrows / click', 'Left stick / D-pad'], ['Talk / use', 'E or Space', 'A (South)'], ['Hint from ' + this.world.companion.name, 'C', 'Y (North)'], ['Hold to talk (voice)', 'V', 'X (West)'], ['Study Book', 'B', 'Select'], ['Ask Exa the goat', 'G', ''], ['Zoom', 'Mouse wheel / + -', 'LB / RB'], ['Menu', 'Esc', 'Start'], ['Back', 'Esc', 'B (East)']];
    card.append(h('h2', {}, 'Controls'), h('div', { class: 'gloss', style: 'grid-template-columns:auto auto auto' }, h('b', {}, ''), h('b', {}, 'Keyboard'), h('b', {}, 'Gamepad'), ...rows.flatMap((r) => [h('b', {}, r[0]), h('span', {}, r[1]), h('span', {}, r[2])])), h('div', { class: 'row', style: 'margin-top:14px' }, h('span', { class: 'spacer' }), h('button', { class: 'btn primary', 'data-default': '1', 'data-close': '1', onclick: () => this.ui.close(shell) }, 'OK')));
  }

  intro(): Promise<void> {
    return new Promise((res) => {
      const lines = this.world.story.intro.length ? this.world.story.intro : [this.world.story.goal];
      const card = h('div', { class: 'sticker card' });
      const shell = this.ui.open(card);
      let i = 0;
      const render = () => {
        card.replaceChildren(h('span', { class: 'kicker' }, `${this.kit.name} · ${this.world.subject}`), h('h2', {}, this.world.title), h('p', { style: 'font-size:24px;line-height:1.5;min-height:3em' }, lines[i]),
          h('div', { class: 'dots' }, ...lines.map((_, k) => h('i', { class: k <= i ? 'on' : '' }))),
          i === lines.length - 1 ? h('p', { style: 'font-size:17px;color:var(--muted-ink)' }, 'Read each study stone, answer the characters, then explain it in your own words. Your Study Book (B) tracks what you have mastered.') : '',
          h('div', { class: 'row', style: 'margin-top:12px' }, h('span', { class: 'spacer' }), h('button', { class: 'btn primary', 'data-default': '1', onclick: () => { Audio.init(); Audio.play('page'); if (i < lines.length - 1) { i++; render(); } else { this.ui.close(shell); Audio.playMusic(this.kit.music, this.world.seed); res(); } } }, i < lines.length - 1 ? 'Next' : "Let's go!")));
        setTimeout(() => this.ui.focusFirst(card), 20);
      };
      render();
    });
  }

  finale() {
    this.tele.send('world_complete', { detail: this.state.objectives().join(',') });
    this.closeDialogue();
    const card = h('div', { class: 'sticker card celebrate' });
    const shell = this.ui.open(card);
    this.speak(this.world.story.finale);
    card.append(h('span', { class: 'kicker' }, 'World restored'), h('h2', {}, 'You did it!'), h('p', { style: 'font-size:22px;line-height:1.45' }, this.world.story.finale),
      ...this.state.objectives().map((o) => { const m = this.state.mastery(o); const st = this.state.stat(o); return h('div', { class: 'objrow' }, h('h3', {}, this.state.objectiveLabel(o)), h('div', { class: 'mastery' }, ...STAGES.map((s) => h('span', { class: m[s] ? 'on' : '' }))), h('div', { style: 'font-size:14px;color:var(--muted-ink);margin-top:4px' }, `${st.correct} correct of ${st.attempts} tries · ${st.hints} hints`)); }),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('a', { class: 'btn', href: `/#report/${encodeURIComponent(this.tele.sessionId)}` }, 'See my learning report'), h('span', { class: 'spacer' }), h('button', { class: 'btn primary', 'data-default': '1', 'data-close': '1', onclick: () => this.ui.close(shell) }, 'Keep exploring')));
  }
}
