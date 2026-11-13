"""Curiosity Craft AI brain: dynamic generation, grounded in the parent-designed SYLLABUS.

The syllabus = the fact sheets of every island area (beach, volcano, ice cave, jungle), editable by parents/teachers
via POST /api/cc/syllabus. Guides answer ANY wondering by explaining syllabus facts (all areas, current area first);
anything outside the syllabus gets a kind "not in our island notes yet" plus a related fact. Questions, starters and
why-hooks are generated live by the model. No web access. The game engine (not the LLM) awards progress.
"""
from __future__ import annotations

import json
import random
import re
import time

from fastapi import HTTPException
from pydantic import BaseModel

from . import config, llm, store
from .cc import (LANG_NAMES, WHY, WORLDS_DIR, AskRequest, _cache, _lang, _local_ask, _now, biomes, get_world, log, router)

UNSAFE_Q = re.compile(r'\b(kill|suicide|sex|porn|drugs?|gun|weapon|bomb|blood|murder|address|phone number|password)\b', re.I)
SAFE_REDIRECT = {
    'en': "That's a question for a grown-up you trust. Want to wonder about something else, like why the sea is salty?",
    'es': 'Esa pregunta es para un adulto de confianza. ¿Quieres preguntarte otra cosa, como por qué el mar es salado?',
}


def _slug(s: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:40] or 'idea'


def _record_concepts(sid: str | None, concepts: list[dict]) -> None:
    if not sid or not concepts or not re.fullmatch(r'[A-Za-z0-9_-]{3,64}', sid):
        return
    s = store.get('cc_sessions', sid)
    if not s:
        return
    for c in concepts[:4]:
        s.setdefault('events', []).append({'name': 'concept', 'ts': _now(),
                                           'data': {'conceptId': c['id'], 'name': c['name'], 'plain': c.get('plain', '')}})
    store.put('cc_sessions', sid, s)


def _all_concepts(first: dict) -> dict:
    cmap: dict = {}
    for b in [first] + biomes():
        for c in b.get('concepts', []):
            cmap.setdefault(c['id'], c)
    return cmap


def syllabus_text(w: dict, per_other: int = 25) -> str:
    lines = [f'[{f["id"]}] ({",".join(f.get("conceptIds", []))}) {f["text"]}' for f in w.get('facts', [])]
    for b in biomes():
        if b.get('id') == w.get('id'):
            continue
        lines += [f'[{b["id"]}:{f["id"]}] ({",".join(f.get("conceptIds", []))}) {f["text"]}' for f in b.get('facts', [])[:per_other]]
    return '\n'.join(lines)


async def open_ask(req: AskRequest) -> dict:
    w = get_world(req.worldId)
    lang = _lang(req.lang)
    if UNSAFE_Q.search(req.question or ''):
        return {'answer': SAFE_REDIRECT.get(lang, SAFE_REDIRECT['en']), 'whyHook': WHY[lang], 'conceptIds': [],
                'concepts': [], 'grounded': False, 'fromNotes': False, 'source': 'local'}
    if config.has_llm():
        npc = w.get('npc', {})
        hist = '\n'.join(f'{"Kid" if t.role == "kid" else npc.get("name", "Sam")}: {t.text}' for t in req.history[-8:])
        system = (
            f'You are {npc.get("name", "Surfer Sam")}, a character in a curiosity game on {w.get("name", "an island")}. '
            f'Persona: {npc.get("persona", "")}\n'
            'You talk with a curious child aged 8-11 who may wonder about anything. The SYLLABUS below (written by the '
            "child's parents and teachers) is your ONLY source of facts. Answer by combining and explaining syllabus facts in "
            'simple vivid words with a fun analogy, adapted to exactly what the child asked. If the question is partly covered, '
            'answer with the closest syllabus facts. If nothing in the syllabus covers it, say kindly that it is not in the '
            'island notes yet (a grown-up can add it), then connect to one related syllabus fact, and set fromNotes=false. '
            'Max 2-3 short sentences. Then ALWAYS give one "why?" hook: a short, intriguing question that goes one level deeper '
            'and that the syllabus can answer. Kid-safe; never ask for personal information. Be warm, funny and in character. '
            f'Write answer and whyHook in {LANG_NAMES[lang]}.\nSYLLABUS:\n{syllabus_text(w)}\n'
            'Reply with JSON only: {"answer":str,"whyHook":str,"conceptIds":[concept ids in parentheses from the syllabus lines '
            'you used],"fromNotes":true|false,"suggestChallenge":"surfboard-lab"|null}')
        user = (f'Conversation so far:\n{hist}\n\n' if hist else '') + f'Why-level {req.level}. Kid asks: {req.question[:400]}'
        try:
            data = await llm.chat_json([{'role': 'system', 'content': system}, {'role': 'user', 'content': user}],
                                       model='chat', max_tokens=1400, timeout=20)
            ans = str(data.get('answer', '')).strip()
            if ans:
                cmap = _all_concepts(w)
                cids = list(dict.fromkeys(c for c in data.get('conceptIds', []) if c in cmap))
                concepts = [cmap[c] for c in cids]
                _record_concepts(req.sessionId, concepts)
                ch = data.get('suggestChallenge')
                notes = bool(data.get('fromNotes', True))
                return {'answer': ans, 'whyHook': str(data.get('whyHook') or WHY[lang]).strip(), 'conceptIds': cids,
                        'concepts': concepts, 'grounded': notes, 'fromNotes': notes,
                        'suggestChallenge': ch if ch == 'surfboard-lab' else None, 'source': 'llm'}
        except Exception as e:
            log.info('ask fallback: %s', str(e)[:200])
    return _local_ask(req, w)


# ------------------------------------------------------------------ dynamic Wonder Board starters (from the syllabus)
_starter_cache: dict[str, list] = {}


@router.get('/starters')
async def starters(lang: str = 'en'):
    """6 fresh, varied wonder starters generated from the syllabus (refreshed every 90 s); static fallback."""
    lang = _lang(lang)
    key = f'{lang}:{int(time.time() // 90)}'
    if key in _starter_cache:
        return _starter_cache[key]
    fallback = []
    for b in biomes():
        fallback += [{'id': s['id'], 'label': s['label'], 'emoji': '', 'questions': s['questions'][:3], 'area': b['id']}
                     for s in b.get('starters', [])[:2]]
    if not config.has_llm():
        return fallback[:6]
    areas = ', '.join(f'{b["id"]} ({b.get("name")})' for b in biomes())
    syl = '\n'.join(f'[{b["id"]}] ' + ' | '.join(f['text'] for f in random.sample(b.get('facts', []), min(8, len(b.get('facts', [])))))
                    for b in biomes())
    prompt = (f'Suggest 6 surprising, varied things a curious 8-11 year old might wonder about while exploring an island with '
              f'these areas: {areas}. Every idea and question MUST be answerable from this syllabus; spread them across areas '
              f'and topics:\n{syl}\nFor each: a 1-2 word label, one emoji, 3 short WHY/HOW questions (10 words or fewer), and the '
              f'area id. Write labels and questions in {LANG_NAMES[lang]}. Variety seed: {random.randint(1, 10 ** 6)}.\n'
              'Reply with JSON only: {"starters":[{"label":str,"emoji":str,"questions":[3],"area":str}]}')
    try:
        data = await llm.chat_json([{'role': 'user', 'content': prompt}], model='chat', max_tokens=1200, timeout=12)
        ids = {b['id'] for b in biomes()}
        out = [{'id': _slug(str(s['label'])), 'label': str(s['label'])[:24], 'emoji': str(s.get('emoji', ''))[:4],
                'questions': [str(q) for q in s.get('questions', [])][:3], 'area': s.get('area') if s.get('area') in ids else 'beach'}
               for s in data.get('starters', []) if s.get('label') and len(s.get('questions', [])) >= 3][:6]
        if len(out) >= 4:
            _starter_cache.clear()
            _starter_cache[key] = out
            return out
    except Exception as e:
        log.info('starters fallback: %s', str(e)[:200])
    return fallback[:6]


# ------------------------------------------------------------------ parents/teachers design the syllabus
class SyllabusRequest(BaseModel):
    area: str = 'beach'          # which island area's syllabus to extend
    title: str = ''
    text: str = ''               # pasted lesson text (or extracted PDF text)
    materialId: str | None = None
    replace: bool = False        # replace the area's facts instead of adding


@router.get('/syllabus')
async def syllabus_get():
    return [{'area': b['id'], 'name': b.get('name'), 'guide': b.get('npc', {}).get('name'), 'facts': len(b.get('facts', [])),
             'concepts': [c['name'] for c in b.get('concepts', [])], 'sample': [f['text'] for f in b.get('facts', [])[:5]]}
            for b in biomes()]


@router.post('/syllabus')
async def syllabus_add(req: SyllabusRequest):
    """Turn a parent's lesson into syllabus facts for an area. The guides use them immediately."""
    text = req.text
    if not text and req.materialId:
        m = store.get('materials', req.materialId)
        if m:
            text = '\n\n'.join(f'{s.get("heading", "")}\n{s.get("text", "")}' for s in m.get('sections', []))
    text = (text or '').strip()[:20000]
    if len(text) < 80:
        raise HTTPException(422, 'Add a bit more lesson text (at least a few sentences).')
    w = get_world(req.area)
    if not config.has_llm():
        sents = [x.strip() for x in re.split(r'(?<=[.!?])\s+', text) if 12 < len(x.strip()) < 220][:20]
        concept = {'id': _slug(req.title or 'parent-lesson'), 'name': req.title or 'Parent lesson', 'plain': sents[0] if sents else ''}
        facts = [{'id': f'p{i + 1}', 'text': t, 'conceptIds': [concept['id']]} for i, t in enumerate(sents)]
        concepts = [concept]
    else:
        prompt = ('Turn this lesson (written by a parent or teacher) into a syllabus for a kids curiosity game (ages 8-11). '
                  'Write 12-25 short, accurate, kid-level facts that are faithful to the lesson (no invented facts), and 3-6 '
                  'concepts with a parent-friendly one-line explanation. Each fact lists the concept ids it teaches.\n'
                  f'Lesson title: {req.title}\nLesson:\n{text}\n'
                  'Reply with JSON only: {"concepts":[{"id":str,"name":str,"plain":str}],"facts":[{"text":str,"conceptIds":[str]}]}')
        try:
            data = await llm.chat_json([{'role': 'user', 'content': prompt}], model='gen', max_tokens=4000, timeout=60)
        except Exception as e:
            raise HTTPException(502, f'Could not build the syllabus right now: {str(e)[:120]}')
        concepts = [{'id': _slug(str(c.get('id') or c.get('name'))), 'name': str(c.get('name', ''))[:60], 'plain': str(c.get('plain', ''))[:220]}
                    for c in data.get('concepts', []) if c.get('name')]
        ids = {c['id'] for c in concepts}
        raw_map = {str(c.get('id')): _slug(str(c.get('id') or c.get('name'))) for c in data.get('concepts', [])}
        facts = []
        for i, f in enumerate(data.get('facts', [])):
            cids = [raw_map.get(str(x), _slug(str(x))) for x in f.get('conceptIds', [])]
            cids = [c for c in cids if c in ids] or ([concepts[0]['id']] if concepts else [])
            if f.get('text'):
                facts.append({'id': f'p{int(time.time()) % 100000}-{i + 1}', 'text': str(f['text'])[:300], 'conceptIds': cids})
    if not facts:
        raise HTTPException(422, 'No usable facts found in that lesson.')
    w = json.loads(json.dumps(w))
    if req.replace:
        w['facts'], w['concepts'] = facts, concepts
    else:
        known = {c['id'] for c in w.get('concepts', [])}
        w['facts'] = w.get('facts', []) + facts
        w['concepts'] = w.get('concepts', []) + [c for c in concepts if c['id'] not in known]
    w.setdefault('syllabusLessons', []).append({'title': req.title or 'Parent lesson', 'facts': len(facts), 'ts': _now()})
    (WORLDS_DIR / f'{w["id"]}.json').write_text(json.dumps(w, ensure_ascii=False, indent=1), encoding='utf-8')
    _cache.pop(w['id'], None)
    return {'ok': True, 'area': w['id'], 'added': len(facts), 'concepts': [c['name'] for c in concepts],
            'sample': [f['text'] for f in facts[:5]]}
