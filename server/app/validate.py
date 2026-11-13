"""Validation gates for LessonSpec / WorldSpec. Returns diagnostics; errors block, 'warn:' lines don't."""
from __future__ import annotations

import re
from typing import Any

from pydantic import ValidationError

from .schemas import TEMPLATE_IDS, LessonSpec, Question, WorldSpec

BLOCKLIST = ['kill', 'killed', 'killing', 'murder', 'blood', 'bloody', 'gun', 'guns', 'shoot', 'sex', 'sexy', 'drug', 'drugs',
             'alcohol', 'beer', 'wine', 'suicide', 'weapon', 'weapons', 'damn', 'hell', 'stupid', 'idiot', 'hate', 'dumb',
             'shut up', 'porn', 'naked', 'cigarette', 'vape', 'gambling', 'bomb', 'terror']
_BLOCK_RE = re.compile(r'(?<![a-z])(' + '|'.join(re.escape(w) for w in BLOCKLIST) + r')(?![a-z])', re.I)
LANDMARK_KITS = {'tower', 'well', 'tree', 'shrine', 'console', 'gate', 'statue', 'fountain', 'obelisk', 'reef'}
CAP_SHORT, CAP_LONG = 400, 700
LONG_KEYS = {'persona', 'knowledge', 'body', 'explain', 'description', 'text', 'meaning', 'intro', 'finale'}


def norm(s: str) -> str:
    s = s.replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')
    s = s.replace('–', '-').replace('—', '-')
    return re.sub(r'\s+', ' ', s).strip().lower()


def quote_in(quote: str, text: str) -> bool:
    q = norm(quote).strip(' ."\'')
    return bool(q) and q in norm(text)


def is_error(d: str) -> bool:
    return not d.startswith('warn:')


def errors(diags: list[str]) -> list[str]:
    return [d for d in diags if is_error(d)]


def _walk_strings(obj: Any, path: str = ''):
    if isinstance(obj, str):
        yield path, obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield from _walk_strings(v, f'{path}.{k}' if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _walk_strings(v, f'{path}[{i}]')


def safety(obj: Any) -> list[str]:
    out = []
    for path, s in _walk_strings(obj):
        m = _BLOCK_RE.search(s)
        if m:
            out.append(f'{path}: contains a word that is not kid-safe ("{m.group(1)}")')
        key = re.sub(r'\[\d+\]', '', path.split('.')[-1])
        limit = CAP_LONG if key in LONG_KEYS else CAP_SHORT
        if len(s) > limit:
            out.append(f'{path}: text too long ({len(s)} > {limit} chars)')
    return out


def check_question(q: Question, where: str) -> list[str]:
    d = []
    if not (2 <= len(q.choices) <= 4):
        d.append(f'{where} ({q.id}): needs 2-4 choices, has {len(q.choices)}')
    if not (0 <= q.answer_index < len(q.choices)):
        d.append(f'{where} ({q.id}): answerIndex {q.answer_index} out of range')
    if len({c.strip().lower() for c in q.choices}) != len(q.choices):
        d.append(f'{where} ({q.id}): duplicate choices')
    if not q.prompt.strip():
        d.append(f'{where} ({q.id}): empty prompt')
    if not q.accept:
        d.append(f'warn: {where} ({q.id}): no accept phrases')
    return d


# ------------------------------------------------------------------ lesson
def validate_lesson(data: dict | LessonSpec) -> tuple[LessonSpec | None, list[str]]:
    try:
        lesson = data if isinstance(data, LessonSpec) else LessonSpec.model_validate(data)
    except ValidationError as e:
        return None, [f'schema: {".".join(map(str, er["loc"]))}: {er["msg"]}' for er in e.errors()[:15]]
    d: list[str] = []
    if not lesson.sections:
        d.append('lesson has no sections')
    secs = {s.id: s for s in lesson.sections}
    if not (2 <= len(lesson.objectives) <= 5):
        d.append(f'lesson needs 2-5 objectives, has {len(lesson.objectives)}')
    ids = [o.id for o in lesson.objectives]
    if len(set(ids)) != len(ids):
        d.append('duplicate objective ids')
    cids = {c.id for c in lesson.concepts}
    if len(cids) != len(lesson.concepts):
        d.append('duplicate concept ids')
    for o in lesson.objectives:
        if not o.evidence:
            d.append(f'{o.id}: needs at least one evidence quote')
        for ev in o.evidence:
            sec = secs.get(ev.section_id)
            if not sec:
                d.append(f'{o.id}: evidence references unknown section {ev.section_id}')
            elif not quote_in(ev.quote, sec.text):
                d.append(f'{o.id}: evidence quote is not found in section {ev.section_id}: "{ev.quote[:80]}"')
        for c in o.concept_ids:
            if c not in cids:
                d.append(f'warn: {o.id}: unknown concept {c}')
        if not o.rubric.criteria:
            d.append(f'warn: {o.id}: rubric has no criteria')
    for c in lesson.concepts:
        for p in c.prerequisites:
            if p not in cids:
                d.append(f'warn: concept {c.id}: unknown prerequisite {p}')
    if lesson.suggested_template not in TEMPLATE_IDS:
        d.append(f'unknown template {lesson.suggested_template}')
    d += safety(lesson.model_dump(by_alias=True, exclude={'sections'}))
    return lesson, d


# ------------------------------------------------------------------ world
def validate_world(data: dict | WorldSpec, lesson: LessonSpec | None = None) -> tuple[WorldSpec | None, list[str]]:
    try:
        w = data if isinstance(data, WorldSpec) else WorldSpec.model_validate(data)
    except ValidationError as e:
        return None, [f'schema: {".".join(map(str, er["loc"]))}: {er["msg"]}' for er in e.errors()[:15]]
    d: list[str] = []
    if w.template_id not in TEMPLATE_IDS:
        d.append(f'unknown templateId {w.template_id}')
    zones = {z.id: z for z in w.zones}
    npcs = {n.id: n for n in w.npcs}
    puzzles = {p.id: p for p in w.puzzles}
    cols = {c.id: c for c in w.collectibles}
    study = {s.id: s for s in w.study}
    fx = {r.id: r for r in w.reward_effects}
    # unique ids
    for label, items in [('zone', w.zones), ('npc', w.npcs), ('puzzle', w.puzzles), ('quest', w.quests),
                         ('collectible', w.collectibles), ('reward', w.reward_effects), ('study card', w.study),
                         ('side quest', w.side_quests)]:
        ids = [x.id for x in items]
        dup = {i for i in ids if ids.count(i) > 1}
        if dup:
            d.append(f'duplicate {label} ids: {sorted(dup)}')
    questions: list[tuple[Question, str]] = []
    for n in w.npcs:
        questions.append((n.check, f'npc {n.id} check'))
    for p in w.puzzles:
        for q in p.questions or []:
            questions.append((q, f'puzzle {p.id}'))
    for m in w.memory_landmarks:
        questions.append((m.question, f'recall {m.zone_id}'))
    for s in w.study:
        for q in s.checks:
            questions.append((q, f'study {s.id}'))
    for sq in w.side_quests:
        for q in sq.questions or []:
            questions.append((q, f'side quest {sq.id}'))
    for q in w.review_questions:
        questions.append((q, 'review'))
    qids = [q.id for q, _ in questions]
    dup = {i for i in qids if qids.count(i) > 1}
    if dup:
        d.append(f'duplicate question ids: {sorted(dup)}')
    for q, where in questions:
        d += check_question(q, where)
    # objectives
    if lesson is not None:
        obj_ids = {o.id for o in lesson.objectives}
        sec_ids = {s.id: s for s in lesson.sections}
        if w.lesson_id != lesson.lesson_id:
            d.append(f'warn: world.lessonId {w.lesson_id} != lesson {lesson.lesson_id}')
    else:
        obj_ids = {z.objective_id for z in w.zones if z.objective_id}
        sec_ids = None

    def obj(ref: str, where: str):
        if ref not in obj_ids:
            d.append(f'{where}: unknown objective {ref}')

    # zones
    hubs = [z for z in w.zones if z.kind == 'hub']
    goals = [z for z in w.zones if z.kind == 'goal']
    lms = [z for z in w.zones if z.kind == 'landmark']
    if len(hubs) != 1:
        d.append(f'need exactly 1 hub zone, have {len(hubs)}')
    if len(goals) != 1:
        d.append(f'need exactly 1 goal zone, have {len(goals)}')
    if not (3 <= len(lms) <= 5):
        d.append(f'need 3 landmark zones, have {len(lms)}')
    for z in lms:
        if not z.objective_id:
            d.append(f'landmark zone {z.id} has no objectiveId')
        else:
            obj(z.objective_id, f'zone {z.id}')
        if z.landmark not in LANDMARK_KITS:
            d.append(f'warn: zone {z.id}: unknown landmark kit "{z.landmark}" (renders as shrine)')
    # npcs
    if len(w.npcs) != 3:
        d.append(f'need 3 npcs, have {len(w.npcs)}')
    for n in w.npcs:
        if n.zone_id not in zones:
            d.append(f'npc {n.id}: unknown zone {n.zone_id}')
        obj(n.objective_id, f'npc {n.id}')
        if not n.teach:
            d.append(f'npc {n.id}: needs teach lines')
        if not n.knowledge:
            d.append(f'npc {n.id}: needs knowledge snippets')
        if not n.voice.startswith('aura-'):
            d.append(f'warn: npc {n.id}: voice "{n.voice}" is not an Aura model')
    # puzzles
    if len(w.puzzles) < 2:
        d.append(f'need at least 2 puzzles, have {len(w.puzzles)}')
    for p in w.puzzles:
        if p.zone_id not in zones:
            d.append(f'puzzle {p.id}: unknown zone {p.zone_id}')
        obj(p.objective_id, f'puzzle {p.id}')
        if p.kind == 'sequence':
            items = p.items or []
            if not (3 <= len(items) <= 6):
                d.append(f'puzzle {p.id}: sequence needs 3-6 items, has {len(items)}')
            if len({i.lower() for i in items}) != len(items):
                d.append(f'puzzle {p.id}: duplicate sequence items')
        elif p.kind == 'match':
            pairs = p.pairs or []
            if not (3 <= len(pairs) <= 5):
                d.append(f'puzzle {p.id}: match needs 3-5 pairs, has {len(pairs)}')
            if len({x.left.lower() for x in pairs}) != len(pairs) or len({x.right.lower() for x in pairs}) != len(pairs):
                d.append(f'puzzle {p.id}: duplicate match sides')
        elif p.kind == 'choice':
            if not (1 <= len(p.questions or []) <= 4):
                d.append(f'puzzle {p.id}: choice needs 1-4 questions')
        if sec_ids is not None:
            for s in p.evidence_section_ids:
                if s not in sec_ids:
                    d.append(f'puzzle {p.id}: unknown evidence section {s}')
    # study
    covered = {s.objective_id for s in w.study}
    for o in obj_ids:
        if o not in covered:
            d.append(f'objective {o} has no study card')
    for s in w.study:
        obj(s.objective_id, f'study {s.id}')
        if s.zone_id not in zones:
            d.append(f'study {s.id}: unknown zone {s.zone_id}')
        if not (1 <= len(s.body) <= 5):
            d.append(f'study {s.id}: body needs 1-5 short paragraphs')
        if not s.source_section_ids:
            d.append(f'study {s.id}: needs sourceSectionIds')
        if sec_ids is not None:
            src = ' '.join(sec_ids[i].text for i in s.source_section_ids if i in sec_ids)
            for i in s.source_section_ids:
                if i not in sec_ids:
                    d.append(f'study {s.id}: unknown source section {i}')
            for kt in s.key_terms:
                if src and norm(kt.term) not in norm(src):
                    d.append(f'warn: study {s.id}: key term "{kt.term}" not found in its source text')
    for sq in w.side_quests:
        if sq.giver_npc_id not in npcs:
            d.append(f'side quest {sq.id}: unknown giver {sq.giver_npc_id}')
        if sq.zone_id not in zones:
            d.append(f'side quest {sq.id}: unknown zone {sq.zone_id}')
        obj(sq.objective_id, f'side quest {sq.id}')
        if sq.kind in ('quiz', 'find') and not sq.questions:
            d.append(f'side quest {sq.id}: {sq.kind} needs questions')
        if sq.kind == 'explain' and not sq.rubric:
            d.append(f'warn: side quest {sq.id}: explain without rubric')
        if sq.target_id and sq.target_id not in zones and sq.target_id not in cols:
            d.append(f'side quest {sq.id}: unknown target {sq.target_id}')
    if sec_ids is not None:
        for g in w.glossary:
            if g.section_id not in sec_ids:
                d.append(f'warn: glossary "{g.term}": unknown section {g.section_id}')
    for c in w.collectibles:
        if c.zone_id not in zones:
            d.append(f'collectible {c.id}: unknown zone {c.zone_id}')
    # memory landmarks
    if len(w.memory_landmarks) != 3:
        d.append(f'need 3 memoryLandmarks, have {len(w.memory_landmarks)}')
    for m in w.memory_landmarks:
        z = zones.get(m.zone_id)
        if not z or z.kind != 'landmark':
            d.append(f'memory landmark {m.question.id}: zone {m.zone_id} is not a landmark zone')
        obj(m.objective_id, f'memory landmark {m.zone_id}')
    for r in w.reward_effects:
        if r.zone_id not in zones:
            d.append(f'reward {r.id}: unknown zone {r.zone_id}')
    # quests
    qmap = {q.id: q for q in w.quests}
    if not w.quests:
        d.append('no quests')
    targets = {'talk': npcs, 'explain': npcs, 'visit': zones, 'collect': cols, 'puzzle': puzzles, 'study': study}
    for q in w.quests:
        obj(q.objective_id, f'quest {q.id}')
        if q.reward_effect_id not in fx:
            d.append(f'quest {q.id}: unknown reward effect {q.reward_effect_id}')
        for p in q.prerequisite_ids:
            if p not in qmap:
                d.append(f'quest {q.id}: unknown prerequisite {p}')
        if not q.steps:
            d.append(f'quest {q.id}: no steps')
        for s in q.steps:
            if s.kind == 'recall':
                if s.target_id != 'memory' and s.target_id not in zones:
                    d.append(f'quest {q.id} step {s.id}: recall target must be "memory"')
            elif s.target_id not in targets[s.kind]:
                d.append(f'quest {q.id} step {s.id}: {s.kind} target {s.target_id} does not exist')
            if s.kind == 'collect' and s.target_id in cols and (s.count or 1) > cols[s.target_id].count:
                d.append(f'quest {q.id} step {s.id}: needs {s.count} but only {cols[s.target_id].count} exist')
    # acyclic
    state: dict[str, int] = {}

    def visit(qid: str) -> bool:
        if state.get(qid) == 1:
            return False
        if state.get(qid) == 2 or qid not in qmap:
            return True
        state[qid] = 1
        ok = all(visit(p) for p in qmap[qid].prerequisite_ids)
        state[qid] = 2
        return ok

    if not all(visit(q) for q in qmap):
        d.append('quest prerequisites contain a cycle')
    if w.quests:
        last = w.quests[-1]
        if not last.steps or last.steps[-1].kind != 'recall' or last.steps[-1].target_id != 'memory':
            d.append('final quest must end with a recall step targeting "memory"')
    if len(w.puzzles) and not any(s.kind == 'puzzle' for q in w.quests for s in q.steps):
        d.append('warn: no quest step uses a puzzle')
    d += safety(w.model_dump(by_alias=True))
    return w, d
