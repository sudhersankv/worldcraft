/** Defensive WorldSpec validation: never crash; drop broken elements with a console warning. */
import type { Question, WorldSpec } from '../../shared/contracts';
import { TEMPLATE_IDS } from '../../shared/contracts';

const warn = (...a: unknown[]) => console.warn('[worldcraft] spec:', ...a);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function okQuestion(q: Question | undefined | null): q is Question {
  return !!q && typeof q.prompt === 'string' && Array.isArray(q.choices) && q.choices.length >= 2 && typeof q.answerIndex === 'number' && q.answerIndex >= 0 && q.answerIndex < q.choices.length;
}
function fixQ(q: Question): Question {
  return { ...q, id: q.id || `q-${Math.random().toString(36).slice(2, 7)}`, accept: arr<string>(q.accept), hints: arr<string>(q.hints), explain: q.explain ?? '' };
}

export function validateWorld(raw: unknown): WorldSpec {
  const w = { ...(raw as WorldSpec) };
  if (!TEMPLATE_IDS.includes(w.templateId)) { warn('unknown templateId', w.templateId); w.templateId = 'forest'; }
  w.seed = Number.isFinite(w.seed) ? w.seed : 1234;
  w.title = w.title || 'A New World';
  w.subject = w.subject || '';
  w.story = { intro: arr<string>(w.story?.intro), goal: w.story?.goal ?? '', finale: w.story?.finale ?? 'You did it!' };
  w.companion = { name: w.companion?.name || 'Sprout', greeting: w.companion?.greeting || "Hi! Let's explore." };
  w.zones = arr<WorldSpec['zones'][number]>(w.zones).filter((z) => z && z.id && z.name);
  if (!w.zones.some((z) => z.kind === 'hub')) w.zones.unshift({ id: 'hub', name: 'Clearing', kind: 'hub', landmark: 'fountain', description: '' });
  const zoneIds = new Set(w.zones.map((z) => z.id));
  w.npcs = arr<WorldSpec['npcs'][number]>(w.npcs).filter((n) => {
    if (!n?.id || !zoneIds.has(n.zoneId)) { warn('npc dropped', n?.id); return false; }
    n.teach = arr<string>(n.teach); n.knowledge = arr<string>(n.knowledge); n.voice = n.voice || 'aura-2-thalia-en';
    if (!okQuestion(n.check)) { warn('npc check invalid', n.id); return false; }
    n.check = fixQ(n.check);
    return true;
  });
  w.collectibles = arr<WorldSpec['collectibles'][number]>(w.collectibles).filter((c) => c?.id && zoneIds.has(c.zoneId));
  w.puzzles = arr<WorldSpec['puzzles'][number]>(w.puzzles).filter((p) => {
    if (!p?.id) return false;
    if (!zoneIds.has(p.zoneId)) { warn('puzzle zone missing', p.id); return false; }
    p.hints = arr<string>(p.hints);
    if (p.kind === 'sequence' && arr(p.items).length < 2) { warn('sequence puzzle without items', p.id); return false; }
    if (p.kind === 'match' && arr(p.pairs).length < 2) { warn('match puzzle without pairs', p.id); return false; }
    if (p.kind === 'choice') { p.questions = arr<Question>(p.questions).filter(okQuestion).map(fixQ); if (!p.questions.length) { warn('choice puzzle without questions', p.id); return false; } }
    return true;
  });
  w.study = arr<WorldSpec['study'][number]>(w.study).filter((s) => {
    if (!s?.id || !arr(s.body).length) { warn('study card dropped', s?.id); return false; }
    if (!zoneIds.has(s.zoneId)) { const z = w.zones.find((z) => z.objectiveId === s.objectiveId); if (!z) { warn('study zone missing', s.id); return false; } s.zoneId = z.id; }
    s.keyTerms = arr(s.keyTerms); s.checks = arr<Question>(s.checks).filter(okQuestion).map(fixQ); s.sourceSectionIds = arr(s.sourceSectionIds);
    return true;
  });
  const npcIds = new Set(w.npcs.map((n) => n.id));
  w.sideQuests = arr<WorldSpec['sideQuests'][number]>(w.sideQuests).filter((q) => {
    if (!q?.id || !npcIds.has(q.giverNpcId)) { warn('side quest dropped', q?.id); return false; }
    q.questions = arr<Question>(q.questions).filter(okQuestion).map(fixQ);
    if (q.kind !== 'explain' && !q.questions.length) { warn('side quest without questions', q.id); return false; }
    q.rubric = arr(q.rubric);
    return true;
  });
  w.glossary = arr(w.glossary);
  w.reviewQuestions = arr<Question>(w.reviewQuestions).filter(okQuestion).map(fixQ);
  w.memoryLandmarks = arr<WorldSpec['memoryLandmarks'][number]>(w.memoryLandmarks).filter((m) => m && zoneIds.has(m.zoneId) && okQuestion(m.question)).map((m) => ({ ...m, question: fixQ(m.question) }));
  w.rewardEffects = arr(w.rewardEffects);
  const targets = new Set<string>([...zoneIds, ...npcIds, ...w.puzzles.map((p) => p.id), ...w.collectibles.map((c) => c.id), ...w.study.map((s) => s.id), 'memory']);
  const qIds = new Set<string>();
  w.quests = arr<WorldSpec['quests'][number]>(w.quests).filter((q) => q?.id).map((q) => {
    qIds.add(q.id);
    return { ...q, prerequisiteIds: arr<string>(q.prerequisiteIds), steps: arr<WorldSpec['quests'][number]['steps'][number]>(q.steps).filter((s) => {
      const ok = s && targets.has(s.targetId) && ['study', 'talk', 'explain', 'visit', 'collect', 'puzzle', 'recall'].includes(s.kind);
      if (!ok) warn('quest step dropped', q.id, s?.id, s?.targetId);
      return ok;
    }) };
  }).filter((q) => q.steps.length);
  for (const q of w.quests) q.prerequisiteIds = q.prerequisiteIds.filter((p) => qIds.has(p) && p !== q.id);
  return w;
}
