/**
 * Deterministic learning/quest state machine. The game owns ALL state; AI only returns advisory verdicts.
 * Facts drive everything: study:<card>, talk:<npc>, explain:<npc>, visit:<zone>, puzzle:<id>, recall:<zone>, side:<id>.
 */
import type { Quest, QuestStep, WorldSpec } from '../../shared/contracts';

export type MasteryStage = 'studied' | 'checked' | 'explained' | 'practised' | 'recalled';
export const STAGES: MasteryStage[] = ['studied', 'checked', 'explained', 'practised', 'recalled'];

export interface ObjStats { attempts: number; correct: number; hints: number }

export class GameState {
  facts = new Set<string>();
  counts = new Map<string, number>();
  completedQuests: string[] = [];
  discovered = new Set<string>();
  found = new Set<string>();         // collectible instance ids + discoveries
  hintLevel = new Map<string, number>();
  stats = new Map<string, ObjStats>();
  sideDone = new Set<string>();
  sideStarted = new Set<string>();
  reviewAsked = new Map<string, number>();
  finished = false;
  listeners: ((ev: { type: 'quest'; quest: Quest } | { type: 'change' }) => void)[] = [];

  constructor(public world: WorldSpec) {}

  on(fn: GameState['listeners'][number]) { this.listeners.push(fn); }
  private emit(ev: Parameters<GameState['listeners'][number]>[0]) { for (const l of this.listeners) l(ev); }

  stat(obj: string): ObjStats { let s = this.stats.get(obj); if (!s) { s = { attempts: 0, correct: 0, hints: 0 }; this.stats.set(obj, s); } return s; }
  record(obj: string | undefined, correct: boolean) { if (!obj) return; const s = this.stat(obj); s.attempts++; if (correct) s.correct++; }

  add(fact: string) {
    if (this.facts.has(fact)) return;
    this.facts.add(fact);
    this.evaluate();
  }
  collect(id: string) { this.counts.set(id, (this.counts.get(id) ?? 0) + 1); this.evaluate(); }
  has(f: string) { return this.facts.has(f); }

  questDone(q: Quest) { return this.completedQuests.includes(q.id); }
  prereqsDone(q: Quest) { return q.prerequisiteIds.every((p) => this.completedQuests.includes(p) || !this.world.quests.some((x) => x.id === p)); }

  stepDone(s: QuestStep): boolean {
    switch (s.kind) {
      case 'study': return this.has(`study:${s.targetId}`);
      case 'talk': return this.has(`talk:${s.targetId}`);
      case 'explain': return this.has(`explain:${s.targetId}`);
      case 'visit': return this.has(`visit:${s.targetId}`);
      case 'puzzle': return this.has(`puzzle:${s.targetId}`);
      case 'collect': {
        const need = s.count ?? this.world.collectibles.find((c) => c.id === s.targetId)?.count ?? 1;
        return (this.counts.get(s.targetId) ?? 0) >= need;
      }
      case 'recall': {
        if (this.world.memoryLandmarks.some((m) => m.zoneId === s.targetId)) return this.has(`recall:${s.targetId}`);
        const need = Math.min(s.count ?? this.world.memoryLandmarks.length, this.world.memoryLandmarks.length);
        return this.world.memoryLandmarks.filter((m) => this.has(`recall:${m.zoneId}`)).length >= need;
      }
    }
    return true;
  }

  activeQuest(): Quest | null {
    return this.world.quests.find((q) => !this.questDone(q) && this.prereqsDone(q)) ?? null;
  }
  currentStep(): { quest: Quest; step: QuestStep; index: number } | null {
    const q = this.activeQuest(); if (!q) return null;
    const index = q.steps.findIndex((s) => !this.stepDone(s));
    if (index < 0) return null;
    return { quest: q, step: q.steps[index], index };
  }

  /** Quests whose steps include recall or target the goal are the finale; gate opens once the others are done. */
  isFinale(q: Quest) { const goal = this.world.zones.find((z) => z.kind === 'goal')?.id; return q.steps.some((s) => s.kind === 'recall' || (goal && s.targetId === goal)); }
  gateOpen() { return this.world.quests.filter((q) => !this.isFinale(q)).every((q) => this.questDone(q)); }
  recallActive() { const c = this.currentStep(); return !!c && c.step.kind === 'recall'; }

  evaluate() {
    let changed = true;
    while (changed) {
      changed = false;
      for (const q of this.world.quests) {
        if (this.questDone(q) || !this.prereqsDone(q)) continue;
        if (q.steps.every((s) => this.stepDone(s))) {
          this.completedQuests.push(q.id); changed = true;
          this.emit({ type: 'quest', quest: q });
        }
      }
    }
    if (!this.finished && this.world.quests.length && this.world.quests.every((q) => this.questDone(q))) this.finished = true;
    this.emit({ type: 'change' });
  }

  // ---------- mastery
  objectives(): string[] {
    const ids: string[] = [];
    for (const q of this.world.quests) if (!ids.includes(q.objectiveId)) ids.push(q.objectiveId);
    for (const s of this.world.study ?? []) if (!ids.includes(s.objectiveId)) ids.push(s.objectiveId);
    return ids;
  }
  objectiveLabel(obj: string): string {
    const q = this.world.quests.find((x) => x.objectiveId === obj && !this.isFinale(x)) ?? this.world.quests.find((x) => x.objectiveId === obj);
    const cards = (this.world.study ?? []).filter((s) => s.objectiveId === obj);
    return cards.length ? cards.map((c) => c.title).join(' · ') : q?.title ?? obj;
  }
  mastery(obj: string): Record<MasteryStage, boolean> {
    const cards = (this.world.study ?? []).filter((s) => s.objectiveId === obj);
    const npcs = this.world.npcs.filter((n) => n.objectiveId === obj);
    const puzzles = this.world.puzzles.filter((p) => p.objectiveId === obj);
    const mem = this.world.memoryLandmarks.filter((m) => m.objectiveId === obj);
    return {
      studied: cards.length ? cards.every((c) => this.has(`opened:${c.id}`)) : npcs.some((n) => this.has(`talk:${n.id}`)),
      checked: (cards.length ? cards.every((c) => this.has(`study:${c.id}`)) : true) && npcs.every((n) => this.has(`talk:${n.id}`)),
      explained: npcs.length ? npcs.every((n) => this.has(`explain:${n.id}`)) : false,
      practised: puzzles.length ? puzzles.every((p) => this.has(`puzzle:${p.id}`)) : false,
      recalled: mem.length ? mem.every((m) => this.has(`recall:${m.zoneId}`)) : false,
    };
  }
  masteryCount(obj: string) { const m = this.mastery(obj); return STAGES.filter((s) => m[s]).length; }
  currentObjective(): string | null { return this.currentStep()?.quest.objectiveId ?? null; }
}
