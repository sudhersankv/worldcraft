"""Shared NPC brain + world/session helpers. Used by the REST API and by the realtime voice websocket (voice.py).

Keep signatures stable:
  async npc_turn(req: NpcReplyRequest) -> NpcReplyResponse
  get_world(world_id) -> WorldSpec | None
  find_question(world, question_id) -> (Question, objective_id) | None
  npc_voice(world, npc_id) -> str
  async record_event(ev: SessionEvent)
"""
from __future__ import annotations

import asyncio
import logging
import math
import random
import re
import uuid
from datetime import datetime, timezone

from . import config, llm, store
from .goat import ask_goat
from .heuristic import STOP, words
from .referee import local_intent, local_match, referee
from .schemas import (ExplainResult, LessonSpec, NpcReplyRequest, NpcReplyResponse, ObjectiveResult, Question,
                      SessionEvent, SessionResults, WorldSpec)

log = logging.getLogger('wc.services')
DEFAULT_VOICE = 'aura-2-thalia-en'
COMPANION_VOICE = 'aura-2-luna-en'
GOAT_VOICE = 'aura-2-hermes-en'
UNSAFE = re.compile(r'\b(address|phone number|password|where do you live|your school|last name|kill|blood|gun|sex)\b', re.I)


# ------------------------------------------------------------------ lookups
_world_cache: dict[str, WorldSpec] = {}


def get_world(world_id: str) -> WorldSpec | None:
    if not world_id:
        return None
    raw = store.get('worlds', world_id) or store.samples('worlds').get(world_id)
    if not raw:
        return None
    w = _world_cache.get(world_id)
    if w is None or w.model_dump(by_alias=True, mode='json') != raw:
        try:
            w = WorldSpec.model_validate(raw)
        except Exception as e:
            log.warning('stored world %s invalid: %s', world_id, e)
            return None
        _world_cache[world_id] = w
    return w


def invalidate_world(world_id: str) -> None:
    _world_cache.pop(world_id, None)


def get_lesson(lesson_id: str) -> LessonSpec | None:
    raw = store.get('lessons', lesson_id) or store.samples('lessons').get(lesson_id)
    try:
        return LessonSpec.model_validate(raw) if raw else None
    except Exception:
        return None


def find_question(world: WorldSpec | None, question_id: str | None) -> tuple[Question, str] | None:
    if not world or not question_id:
        return None
    for n in world.npcs:
        if n.check.id == question_id:
            return n.check, n.objective_id
    for p in world.puzzles:
        for q in p.questions or []:
            if q.id == question_id:
                return q, p.objective_id
    for m in world.memory_landmarks:
        if m.question.id == question_id:
            return m.question, m.objective_id
    for s in world.study:
        for q in s.checks:
            if q.id == question_id:
                return q, s.objective_id
    for sq in world.side_quests:
        for q in sq.questions or []:
            if q.id == question_id:
                return q, sq.objective_id
    for q in world.review_questions:
        if q.id == question_id:
            return q, _guess_objective(world, q)
    return None


def _guess_objective(world: WorldSpec, q: Question) -> str:
    """Review questions mix objectives; attribute to the NPC whose knowledge overlaps the answer most."""
    target = set(words(' '.join([q.prompt, q.explain, q.choices[q.answer_index] if q.choices else ''])))
    best, best_obj = -1, world.npcs[0].objective_id if world.npcs else ''
    for n in world.npcs:
        sc = len(target & set(words(' '.join(n.knowledge + n.teach))))
        if sc > best:
            best, best_obj = sc, n.objective_id
    return best_obj


def npc_voice(world: WorldSpec | None, npc_id: str) -> str:
    if npc_id == 'companion':
        return COMPANION_VOICE
    if npc_id == 'goat':
        return GOAT_VOICE
    if world:
        for n in world.npcs:
            if n.id == npc_id:
                return n.voice or DEFAULT_VOICE
    return DEFAULT_VOICE


def _speaker(world: WorldSpec | None, npc_id: str) -> dict:
    """Name/persona/knowledge/objective for any speaker id."""
    if world:
        for n in world.npcs:
            if n.id == npc_id:
                return dict(name=n.name, title=n.title, persona=n.persona, knowledge=n.knowledge + n.teach,
                            objective_id=n.objective_id, check=n.check, npc=n)
    if npc_id == 'goat':
        return dict(name='Exa', title='the Goat', persona='A cheerful library goat who looks things up in kid-safe books.',
                    knowledge=[], objective_id=None, check=None, npc=None)
    know = []
    if world:
        for s in world.study:
            know += s.body
        for n in world.npcs:
            know += n.knowledge
    name = world.companion.name if world else 'Sprout'
    return dict(name=name, title='your helper', persona=f'{name} is the player\'s small, friendly helper. Encouraging, playful, gives progressive hints and never just dumps the answer.',
                knowledge=know, objective_id=None, check=None, npc=None)


def _lesson_snippets(world: WorldSpec | None, utterance: str, k: int = 3) -> list[str]:
    if not world:
        return []
    lesson = get_lesson(world.lesson_id)
    if not lesson:
        return []
    q = set(w for w in words(utterance) if w not in STOP)
    scored = sorted(lesson.sections, key=lambda s: -len(q & set(words(s.text + ' ' + s.heading))))
    return [f'[{s.id} {s.heading}] {s.text[:700]}' for s in scored[:k]]


def _objective(world: WorldSpec | None, objective_id: str | None):
    if not world or not objective_id:
        return None
    lesson = get_lesson(world.lesson_id)
    if lesson:
        for o in lesson.objectives:
            if o.id == objective_id:
                return o
    return None


def _best_snippet(knowledge: list[str], utterance: str) -> tuple[str | None, int]:
    q = set(w for w in words(utterance) if w not in STOP and len(w) > 2)
    best, score = None, 0
    for k in knowledge:
        kw = set(words(k))
        sc = len(q & kw) + sum(1 for w in q for x in kw if len(w) > 4 and (x.startswith(w[:5])))
        if sc > score:
            best, score = k, sc
    return best, score


def _first_sentences(text: str, n: int = 2, cap: int = 220) -> str:
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    out = ' '.join(parts[:n])
    return out if len(out) <= cap else out[:cap].rsplit(' ', 1)[0] + '...'


def _child_turns(req: NpcReplyRequest) -> int:
    return sum(1 for h in req.history if h.role == 'child')


# ------------------------------------------------------------------ the NPC brain
async def npc_turn(req: NpcReplyRequest) -> NpcReplyResponse:
    try:
        return await asyncio.wait_for(_npc_turn(req), timeout=14)
    except Exception as e:
        log.warning('npc_turn fallback: %s', e)
        return NpcReplyResponse(reply='Hmm, let me think about that... Can you say it another way?', source='local')


async def _npc_turn(req: NpcReplyRequest) -> NpcReplyResponse:
    world = get_world(req.world_id)
    utter = (req.utterance or '').strip()
    sp = _speaker(world, req.npc_id)
    subject = world.subject if world else ''
    if not utter:
        greet = sp['npc'].greeting if sp['npc'] else (world.companion.greeting if world and req.npc_id == 'companion' else 'Hello there! What would you like to learn?')
        return NpcReplyResponse(reply=greet, source='local')
    if UNSAFE.search(utter):
        return NpcReplyResponse(reply="Let's keep our secrets safe and stick to our adventure! What would you like to learn about next?", source='local')
    if req.npc_id == 'goat':
        clue = await ask_goat(utter, subject)
        return NpcReplyResponse(reply=_first_sentences(clue.text, 2, 300), goat=clue, source='local')
    mode = req.mode or ('answer' if req.question_id else 'chat')
    if mode == 'explain':
        return await _explain(world, sp, req, utter)
    if mode == 'answer' and req.question_id:
        found = find_question(world, req.question_id)
        if found:
            q, _obj = found
            v = await referee(q, utter)
            if v.intent == 'answer':
                return NpcReplyResponse(reply=_answer_reply(sp, q, v.correct, req), verdict=v, source='local')
            if v.intent == 'skip':
                return NpcReplyResponse(reply=f'No problem! Here is a clue for later: {q.hints[0] if q.hints else "think about what you studied."}', source='local')
            if v.intent == 'off_topic':
                return NpcReplyResponse(reply=f'Ha! Let\'s get back to our question: {q.prompt}', source='local')
            # doubt: fall through to tutoring chat, keeping the question in mind
            return await _chat(world, sp, req, utter, doubt=True, question=q)
    found = find_question(world, req.question_id) if req.question_id else None
    return await _chat(world, sp, req, utter, doubt=local_intent(utter) == 'doubt', question=found[0] if found else None)


def _answer_reply(sp: dict, q: Question, correct: bool, req: NpcReplyRequest) -> str:
    if correct:
        praise = random.choice(['Yes! You got it!', 'That\'s right, well done!', 'Brilliant answer!', 'Spot on!'])
        return f'{praise} {_first_sentences(q.explain, 1, 180)}'.strip()
    tries = _child_turns(req)
    hint = q.hints[min(tries, len(q.hints) - 1)] if q.hints else 'Think about what you studied here.'
    nudge = random.choice(['Not quite, but good thinking!', 'Close! Let\'s try again.', 'Good try!'])
    return f'{nudge} Here\'s a hint: {hint}'


async def _chat(world, sp, req, utter, doubt: bool, question: Question | None = None) -> NpcReplyResponse:
    knowledge = sp['knowledge']
    snippets = _lesson_snippets(world, utter)
    obj = _objective(world, sp['objective_id'])
    if config.has_llm():
        hist = '\n'.join(f'{"Child" if h.role == "child" else sp["name"]}: {h.text}' for h in req.history[-6:])
        sys_prompt = (
            f'You are {sp["name"]} {sp["title"]}, a character in an educational game for children aged 7-12 about "{world.subject if world else "a lesson"}".\n'
            f'Persona: {sp["persona"]}\n'
            + (f'Your teaching goal: help the child {obj.text[0].lower() + obj.text[1:]}.\n' if obj else '')
            + 'Facts you may use (the ONLY source of truth):\n- ' + '\n- '.join(knowledge[:14])
            + ('\nLesson text:\n' + '\n'.join(snippets) if snippets else '')
            + (f'\nThe question currently on the table (do NOT reveal its answer): {question.prompt}' if question else '')
            + '\nRules: reply in at most 2 short sentences with simple words. Be a Socratic tutor: guide with a question, '
              'but if the child is stuck, says they do not know, or asks directly, explain clearly using the facts. '
              'Stay in character. Never claim the child completed a task. Never ask for personal information. '
              'If the facts cannot answer the child\'s question, say so kindly and set "grounded" to false. '
              'End with one short follow-up question when natural.\n'
              'Reply with JSON only: {"reply":"...","grounded":true|false}')
        msgs = [{'role': 'system', 'content': sys_prompt},
                {'role': 'user', 'content': (f'Conversation so far:\n{hist}\n\n' if hist else '') + f'Child: {utter}'}]
        try:
            raw = await llm.chat(msgs, model='chat', max_tokens=400, temperature=0.6, timeout=12)
            try:
                data = llm.extract_json(raw)
                reply, grounded = str(data.get('reply', '')).strip(), bool(data.get('grounded', True))
            except ValueError:
                m = re.search(r'"reply"\s*:\s*"((?:[^"\\]|\\.)*)', raw)
                reply = (m.group(1).replace('\\"', '"').replace('\\n', ' ') if m else raw).strip().strip('"{} ')
                grounded = '"grounded": false' not in raw and '"grounded":false' not in raw
            if reply:
                goat = await ask_goat(utter, world.subject if world else '') if (doubt and not grounded and config.has_exa()) else None
                if goat:
                    reply = _first_sentences(reply, 1, 160) + " Let's ask Exa the goat!"
                return NpcReplyResponse(reply=_first_sentences(reply, 3, 300), goat=goat, source='llm')
        except Exception as e:
            log.info('chat llm fallback: %s', str(e)[:160])
    return await _local_chat(world, sp, req, utter, doubt, question, knowledge)


async def _local_chat(world, sp, req, utter, doubt, question, knowledge) -> NpcReplyResponse:
    best, score = _best_snippet(knowledge, utter)
    low = utter.lower()
    stuck = bool(re.search(r"\b(i don'?t know|no idea|help|stuck|confused|not sure)\b", low))
    if question and (stuck or doubt):
        tries = _child_turns(req)
        hint = question.hints[min(tries, len(question.hints) - 1)] if question.hints else ''
        lead = _first_sentences(best, 1, 180) if best and score else ''
        return NpcReplyResponse(reply=f'{lead} Here\'s a hint: {hint}'.strip(), source='local')
    if best and score > 0:
        follow = ''
        if sp.get('check') is not None and not question:
            follow = ' Want to try my question?'
        elif sp['npc'] is None and world:
            follow = ' What do you think?'
        return NpcReplyResponse(reply=_first_sentences(best, 2, 220) + follow, source='local')
    if doubt:
        if config.has_exa():
            goat = await ask_goat(utter, world.subject if world else '')
            return NpcReplyResponse(reply="Ooh, that one isn't in my lesson! Let's ask Exa the goat!", goat=goat, source='local')
        return NpcReplyResponse(reply="Great question! My lesson doesn't say, so let's ask your teacher later. Want to hear what I DO know?", source='local')
    if knowledge:
        k = knowledge[_child_turns(req) % len(knowledge)]
        return NpcReplyResponse(reply=f'Here\'s something cool: {_first_sentences(k, 1, 200)} What do you think about that?', source='local')
    return NpcReplyResponse(reply='I love exploring with you! What would you like to learn about?', source='local')


# ------------------------------------------------------------------ explain-in-your-own-words grading
GENERIC = set('says say mentions mention names name explains explain gets idea main uses use own words their part least one two '
              'three or and the that it its gives give where from like'.split())


def _criterion_keys(c: str) -> list[str]:
    c = re.sub(r'^(gets the main idea:|mentions|names|says|explains)\s*', '', c.strip(), flags=re.I)
    inner = re.findall(r'\(([^)]*)\)', c)
    ws = [w for w in words(c) if w not in STOP and w not in GENERIC and len(w) > 2]
    for i in inner:
        ws += [w for w in words(i) if w not in STOP and len(w) > 2]
    return list(dict.fromkeys(ws))


def local_explain(utter: str, criteria: list[str]) -> ExplainResult:
    covered, missing = [], []
    for c in criteria:
        keys = _criterion_keys(c)
        if not keys:
            continue
        need = 1 if len(keys) <= 3 else 2
        hits = sum(1 for k in keys if local_match(utter, [k]) or (len(k) > 5 and k[:5] in utter.lower()))
        (covered if hits >= need else missing).append(c)
    n = len(covered) + len(missing)
    passed = n > 0 and len(covered) >= max(1, math.ceil(n * 0.6))
    return ExplainResult(covered=covered, missing=missing, passed=passed)


async def _explain(world, sp, req, utter) -> NpcReplyResponse:
    obj_id = req.objective_id or sp['objective_id']
    obj = _objective(world, obj_id)
    criteria = list(obj.rubric.criteria) if obj else []
    rule = obj.rubric.passing_rule if obj else ''
    if world and not criteria:
        for sq in world.side_quests:
            if sq.objective_id == obj_id and sq.rubric:
                criteria = list(sq.rubric)
    if not criteria:
        criteria = [f'Uses the idea: {k}' for k in sp['knowledge'][:2]]
    if config.has_llm():
        prompt = (f'You are {sp["name"]} {sp["title"]} ({sp["persona"]}). A child aged 7-12 is explaining, in their own words, '
                  f'this learning goal: "{obj.text if obj else world.subject if world else ""}".\n'
                  'Rubric criteria:\n' + '\n'.join(f'- {c}' for c in criteria) + f'\nPassing rule: {rule or "covers most criteria"}\n'
                  'Lesson facts:\n- ' + '\n- '.join(sp['knowledge'][:10]) +
                  f'\nChild said (speech-to-text, may be misspelled): "{utter}"\n'
                  'Judge generously on meaning, not exact words. Reply with JSON only: {"covered":[criteria copied exactly],'
                  '"missing":[criteria copied exactly],"passed":true|false,"reply":"warm, specific feedback in character, max 2 short '
                  'sentences: praise what they got right and, if not passed, ask them to add the missing idea without giving the full answer"}')
        try:
            data = await llm.chat_json([{'role': 'user', 'content': prompt}], model='chat', max_tokens=500, temperature=0.3, timeout=12)
            cov = [c for c in data.get('covered', []) if c in criteria]
            mis = [c for c in criteria if c not in cov]
            res = ExplainResult(covered=cov, missing=mis, passed=bool(data.get('passed')))
            reply = str(data.get('reply', '')).strip()
            if reply:
                return NpcReplyResponse(reply=_first_sentences(reply, 3, 300), explain=res, source='llm')
        except Exception as e:
            log.info('explain llm fallback: %s', str(e)[:160])
    res = local_explain(utter, criteria)
    def plain(c):
        return re.sub(r'^(mentions|names|says|explains|gets the main idea:)\s*', '', c, flags=re.I).rstrip('.')
    if res.passed:
        got = plain(res.covered[0]) if res.covered else 'the big idea'
        reply = f'Wonderful explaining! You covered {got}' + (f' and more.' if len(res.covered) > 1 else '.')
        if res.missing:
            reply += f' Bonus idea to add next time: {plain(res.missing[0])}.'
    elif res.covered:
        reply = f'Good start! You got {plain(res.covered[0])}. Can you add something about {plain(res.missing[0])}?'
    else:
        reply = f'Nice try! Can you tell me about {plain(criteria[0])}? Look back at your study card if you need to.'
    return NpcReplyResponse(reply=reply, explain=res, source='local')


# ------------------------------------------------------------------ sessions
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def start_session(world_id: str) -> str:
    sid = f'sess-{uuid.uuid4().hex[:10]}'
    store.put('sessions', sid, {'sessionId': sid, 'worldId': world_id, 'startedAt': now_iso(), 'events': []})
    return sid


_session_lock = asyncio.Lock()


async def record_event(ev) -> None:
    if not isinstance(ev, SessionEvent):
        ev = SessionEvent.model_validate(ev)
    if not ev.timestamp:
        ev.timestamp = now_iso()
    async with _session_lock:
        s = store.get('sessions', ev.session_id)
        if not s:
            s = {'sessionId': ev.session_id, 'worldId': ev.world_id, 'startedAt': ev.timestamp, 'events': []}
        s['events'].append(ev.wire())
        store.put('sessions', ev.session_id, s)


def _event_objective(world: WorldSpec | None, e: dict) -> str | None:
    if e.get('objectiveId'):
        return e['objectiveId']
    if not world:
        return None
    if e.get('questionId'):
        f = find_question(world, e['questionId'])
        if f:
            return f[1]
    if e.get('puzzleId'):
        for p in world.puzzles:
            if p.id == e['puzzleId']:
                return p.objective_id
        for sq in world.side_quests:
            if sq.id == e['puzzleId']:
                return sq.objective_id
    d = e.get('detail') or ''
    for s in world.study:
        if s.id == d:
            return s.objective_id
    return None


def compute_results(session: dict) -> SessionResults:
    world = get_world(session.get('worldId', ''))
    lesson = get_lesson(world.lesson_id) if world else None
    if lesson:
        objectives = [(o.id, o.text) for o in lesson.objectives]
    elif world:
        objectives = [(z.objective_id, f'{z.name}') for z in world.zones if z.kind == 'landmark' and z.objective_id]
    else:
        objectives = []
    events = session.get('events', [])
    per: dict[str, dict] = {oid: dict(attempts=0, correct=0, hints=0, recall=[], explain=[], studied=False, review_wrong=0)
                            for oid, _ in objectives}
    completed = False
    for e in events:
        t = e.get('eventType')
        if t == 'world_complete':
            completed = True
        oid = _event_objective(world, e)
        if oid not in per:
            continue
        p = per[oid]
        res = e.get('result')
        if t in ('question_answer', 'puzzle_attempt'):
            if res in ('correct', 'incorrect'):
                p['attempts'] += 1
                p['correct'] += res == 'correct'
            p['hints'] += int(e.get('hintsUsed') or 0)
        elif t == 'hint':
            p['hints'] += 1
        elif t == 'recall_attempt' and res in ('correct', 'incorrect'):
            p['recall'].append(res == 'correct')
        elif t == 'explain_attempt' and res in ('correct', 'incorrect'):
            p['explain'].append(res == 'correct')
        elif t in ('study_open', 'study_check'):
            p['studied'] = True
        elif t == 'review_attempt' and res == 'incorrect':
            p['review_wrong'] += 1
    out, review = [], []
    for oid, text in objectives:
        p = per[oid]
        recalled = (any(p['recall']) if p['recall'] else None)
        explained = (any(p['explain']) if p['explain'] else None)
        demonstrated = p['correct'] > 0
        out.append(ObjectiveResult(objective_id=oid, text=text, demonstrated=demonstrated, attempts=p['attempts'],
                                   correct=p['correct'], hints_used=p['hints'], recalled=recalled,
                                   studied=p['studied'], explained=explained))
        if not demonstrated:
            review.append(f'Practise: {text}' if p['attempts'] else f'Not reached yet: {text}')
        elif recalled is False:
            review.append(f'Revisit (could not recall yet): {text}')
        elif explained is False:
            review.append(f'Explain again in own words: {text}')
        elif p['review_wrong']:
            review.append(f'Quick review: {text}')
        elif p['hints'] >= 3:
            review.append(f'Needed several hints: {text}')
    return SessionResults(session_id=session.get('sessionId', ''), world_id=session.get('worldId', ''),
                          lesson_title=(lesson.title if lesson else world.title if world else ''),
                          started_at=session.get('startedAt', ''), completed=completed, objectives=out,
                          events=len(events), suggested_review=review)
