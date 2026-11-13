"""Curiosity Craft API (/api/cc/*). Contract: web/src/shared/curiosity.ts.

Safety: Sam answers ONLY from the world's fact sheet; the engine (client + this module), never the LLM, awards levels.
Every number in the report is computed from the event log.
"""
from __future__ import annotations

import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import config, llm, store

log = logging.getLogger('cc')
router = APIRouter(prefix='/api/cc')

WORLDS_DIR = Path(__file__).resolve().parent.parent / 'cc_worlds'
LANGS = ['en', 'es', 'zh', 'fr', 'pt', 'nl', 'hi', 'ta']
LANG_NAMES = {'en': 'English', 'es': 'Spanish', 'zh': 'Simplified Chinese', 'fr': 'French', 'pt': 'Brazilian Portuguese',
              'nl': 'Dutch', 'hi': 'Hindi (Devanagari script)', 'ta': 'Tamil (Tamil script)'}
WORLD_TAGS = ['beach', 'ice', 'volcano', 'space', 'forest', 'ocean', 'sky']
_cache: dict[str, dict] = {}

FALLBACK_BEACH = {
    'id': 'beach', 'name': 'Sunny Surf Beach',
    'npc': {'id': 'sam', 'name': 'Surfer Sam', 'persona': 'A friendly, laid-back surfer who loves explaining the ocean.',
            'voice': 'aura-2-arcas-en', 'greeting': "Hey dude! I'm Sam. What are you wondering about?"},
    'facts': [
        {'id': 'f1', 'text': 'Things float when they are less dense than water. Water has a density of 1 gram per cubic centimetre.', 'conceptIds': ['density']},
        {'id': 'f2', 'text': 'Stone is about 2.6 times denser than water, so it sinks.', 'conceptIds': ['density']},
        {'id': 'f3', 'text': 'Foam is full of tiny air bubbles, so it is very light and floats.', 'conceptIds': ['buoyancy']},
        {'id': 'f4', 'text': 'Water pushes up on things in it. This push is called buoyancy.', 'conceptIds': ['buoyancy']},
        {'id': 'f5', 'text': 'Most waves are made by wind blowing over the water.', 'conceptIds': ['waves']},
        {'id': 'f6', 'text': 'A wave moves energy through the water; the water itself mostly moves up and down.', 'conceptIds': ['waves']},
        {'id': 'f7', 'text': 'Longer surfboards float more and are more stable, so they are easier for beginners.', 'conceptIds': ['buoyancy', 'boards']},
        {'id': 'f8', 'text': 'Salt water is denser than fresh water, so things float a little better in the sea.', 'conceptIds': ['density']},
    ],
    'concepts': [{'id': 'density', 'name': 'Density', 'plain': 'How heavy something is for its size; less dense than water means it floats.'},
                 {'id': 'buoyancy', 'name': 'Buoyancy', 'plain': 'The upward push water gives to things in it.'},
                 {'id': 'waves', 'name': 'Waves', 'plain': 'Energy from wind travelling through water.'},
                 {'id': 'boards', 'name': 'Surfboards', 'plain': 'Board size and material change how well it floats.'}],
    'starters': [
        {'id': 'wave', 'label': 'Wave', 'icon': 'wave', 'questions': ['What makes a wave?', 'Why do waves crash?', 'Where does a wave go?']},
        {'id': 'surfboard', 'label': 'Surfboard', 'icon': 'surfboard', 'questions': ['Why does a surfboard float?', 'What are surfboards made of?', 'Why are some boards long?']},
        {'id': 'sun', 'label': 'Sun', 'icon': 'sun', 'questions': ['Why is the sun so hot?', 'Why do I need sunscreen?', 'Why is the sky blue?']},
        {'id': 'fish', 'label': 'Fish', 'icon': 'fish', 'questions': ['How do fish breathe underwater?', 'Why do fish swim in groups?', 'Why are fish slippery?']},
        {'id': 'sand', 'label': 'Sand', 'icon': 'sand', 'questions': ['Where does sand come from?', 'Why is sand hot?', 'Why is wet sand darker?']},
        {'id': 'wind', 'label': 'Wind', 'icon': 'wind', 'questions': ['What makes the wind blow?', 'How does wind make waves?', 'Why is it windy at the beach?']},
    ],
    'recall': {'prompt': 'Why does a foam surfboard float?', 'choices': ['It is lighter than water for its size', 'It is magic', 'It is very heavy'],
               'answerIndex': 0, 'conceptId': 'density'},
    'challenges': ['surfboard-lab', 'wave-maker'],
    'tryAtHome': 'Fill a bowl with water. Guess first, then drop in a cork, a coin and an apple. Which float? Why?',
    'realWorld': {'book': 'Surfer of the Century (Ellie Crowe)', 'job': 'Oceanographer', 'person': 'Duke Kahanamoku'},
}


def get_world(world_id: str) -> dict:
    world_id = world_id if world_id in WORLD_TAGS else 'beach'
    if world_id in _cache:
        return _cache[world_id]
    p = WORLDS_DIR / f'{world_id}.json'
    try:
        w = json.loads(p.read_text(encoding='utf-8')) if p.exists() else None
    except Exception as e:  # malformed world file must never crash the demo
        log.warning('bad world file %s: %s', p, e)
        w = None
    if not w or not w.get('facts'):
        w = FALLBACK_BEACH if world_id == 'beach' else (get_world('beach') if world_id != 'beach' else FALLBACK_BEACH)
    _cache[world_id] = w
    return w


def _lang(lang: str | None) -> str:
    return lang if lang in LANGS else 'en'


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ------------------------------------------------------------------ worlds
@router.get('/worlds/{world_id}')
async def world(world_id: str):
    return get_world(world_id)


@router.get('/worlds')
async def worlds():
    out = []
    for t in WORLD_TAGS:
        if (WORLDS_DIR / f'{t}.json').exists() or t == 'beach':
            w = get_world(t)
            out.append({'id': w.get('id', t), 'name': w.get('name'), 'npc': w.get('npc', {}).get('name')})
    return out


# ------------------------------------------------------------------ Wonder Board
class WonderRequest(BaseModel):
    image: str | None = None
    text: str | None = None
    lang: str = 'en'
    worldId: str = 'beach'


def _local_wonder(text: str, w: dict) -> dict:
    t = (text or '').lower()
    for s in w.get('starters', []):
        if s['id'] in t or s['label'].lower() in t:
            return {'guess': s['label'], 'confidence': 0.9, 'guesses': [x['label'] for x in w['starters'][:3]],
                    'questions': s['questions'][:3], 'worldTag': w.get('id', 'beach'), 'source': 'local'}
    s0 = w.get('starters', FALLBACK_BEACH['starters'])
    return {'guess': '', 'confidence': 0.0, 'guesses': [x['label'] for x in s0[:3]],
            'questions': s0[0]['questions'][:3], 'worldTag': w.get('id', 'beach'), 'source': 'local'}


@router.post('/wonder')
async def wonder(req: WonderRequest):
    w = get_world(req.worldId)
    lang = _lang(req.lang)
    if not config.has_llm() or (not req.image and not (req.text or '').strip()):
        return _local_wonder(req.text or '', w)
    content: list[dict] = [{'type': 'text', 'text': (
        f'A child aged 8-11 is curious. They {"drew the picture below" if req.image else "did not draw"}'
        f'{" and wrote/said: " + json.dumps(req.text[:200]) if (req.text or "").strip() else ""}.\n'
        'Guess what it is (be kind about messy drawings), then write 3 short, concrete, kid-friendly questions '
        '(10 words or fewer each) a curious kid could ask about it, and pick the best destination world for exploring it from: '
        + ', '.join(WORLD_TAGS) + f'. Write guess, guesses and questions in {LANG_NAMES[lang]}.\n'
        'Reply with JSON only: {"guess":str,"confidence":0-1,"guesses":[3 alternative guesses],"questions":[3],"worldTag":str}')}]
    if req.image and req.image.startswith('data:image/'):
        content.append({'type': 'image_url', 'image_url': {'url': req.image[:2_500_000]}})
    try:
        data = await llm.chat_json([{'role': 'user', 'content': content}], model='chat', max_tokens=1200, timeout=18)
        qs = [str(q).strip() for q in data.get('questions', []) if str(q).strip()][:3]
        if len(qs) < 3:
            raise ValueError('too few questions')
        tag = 'beach'  # demo: one world only
        guesses = [str(g) for g in data.get('guesses', [])][:3] or [s['label'] for s in w['starters'][:3]]
        return {'guess': str(data.get('guess', '')), 'confidence': max(0.0, min(1.0, float(data.get('confidence', 0.5)))),
                'guesses': guesses, 'questions': qs, 'worldTag': tag, 'source': 'llm'}
    except Exception as e:
        log.info('wonder fallback: %s', str(e)[:200])
        return _local_wonder(req.text or '', w)


# ------------------------------------------------------------------ Why Ladder
class Turn(BaseModel):
    role: str
    text: str


class AskRequest(BaseModel):
    worldId: str = 'beach'
    lang: str = 'en'
    sessionId: str | None = None
    question: str
    level: int = 0
    history: list[Turn] = Field(default_factory=list)


NOT_SURE = {'en': "I'm not sure, let's test it!", 'es': 'No estoy seguro, ¡vamos a probarlo!', 'zh': '我不太确定，我们来试试看吧！',
            'fr': "Je ne suis pas sûr, testons-le !", 'pt': 'Não tenho certeza, vamos testar!', 'nl': 'Ik weet het niet zeker, laten we het testen!',
            'hi': 'मुझे पक्का नहीं पता, चलो इसे आज़माते हैं!', 'ta': 'எனக்கு உறுதியாகத் தெரியவில்லை, சோதித்துப் பார்ப்போம்!'}
WHY = {'en': 'But why?', 'es': '¿Pero por qué?', 'zh': '可是为什么呢？', 'fr': 'Mais pourquoi ?', 'pt': 'Mas por quê?', 'nl': 'Maar waarom?',
       'hi': 'पर क्यों?', 'ta': 'ஆனால் ஏன்?'}
STOP = set('the a an is are do does why what how it to of and you i me my in on for be can this that'.split())


def _words(s: str) -> set[str]:
    return {x for x in re.findall(r'[a-z]+', s.lower()) if x not in STOP and len(x) > 2}


def _local_ask(req: AskRequest, w: dict) -> dict:
    q = _words(req.question + ' ' + ' '.join(t.text for t in req.history[-2:]))
    facts = w.get('facts', [])
    scored = sorted(facts, key=lambda f: -len(q & _words(f['text'])))
    lang = _lang(req.lang)
    if not scored or not (q & _words(scored[0]['text'])):
        return {'answer': NOT_SURE[lang], 'whyHook': WHY[lang], 'conceptIds': [], 'grounded': False,
                'suggestChallenge': (w.get('challenges') or [None])[0], 'source': 'local'}
    used = {t.text for t in req.history if t.role == 'npc'}
    pick = next((f for f in scored if f['text'] not in used), scored[0])
    nxt = next((f for f in scored if f is not pick), None)
    hook = f'Why do you think {nxt["text"].split(",")[0].rstrip(".").lower()}?' if (nxt and lang == 'en') else WHY[lang]
    return {'answer': pick['text'], 'whyHook': hook, 'conceptIds': pick.get('conceptIds', []), 'grounded': True,
            'suggestChallenge': 'surfboard-lab' if set(pick.get('conceptIds', [])) & {'density', 'buoyancy', 'boards'} else None,
            'source': 'local'}


@router.post('/ask')
async def ask(req: AskRequest):
    w = get_world(req.worldId)
    lang = _lang(req.lang)
    concept_ids = {c['id'] for c in w.get('concepts', [])}
    if config.has_llm():
        npc = w.get('npc', {})
        facts = '\n'.join(f'[{f["id"]}] ({",".join(f.get("conceptIds", []))}) {f["text"]}' for f in w.get('facts', []))
        hist = '\n'.join(f'{"Kid" if t.role == "kid" else npc.get("name", "Sam")}: {t.text}' for t in req.history[-6:])
        system = (f'You are {npc.get("name", "Surfer Sam")}. Persona: {npc.get("persona", "")}\n'
                  'You talk with a curious child aged 8-11. RULES: answer ONLY using the FACT SHEET below; if the fact sheet '
                  f'does not cover it, the answer must be exactly "{NOT_SURE[lang]}" and grounded=false. Max 2 short sentences. '
                  'Then ALWAYS give one "why?" hook: a short question that goes one level deeper into the cause behind your answer. '
                  'Never ask for personal information. Kid-safe. Be funny and warm. '
                  f'Write answer and whyHook in {LANG_NAMES[lang]}.\nFACT SHEET:\n{facts}\n'
                  'Reply with JSON only: {"answer":str,"whyHook":str,"conceptIds":[concept ids from the fact lines you used],'
                  '"grounded":true|false,"suggestChallenge":"surfboard-lab"|"wave-maker"|null}')
        user = (f'Conversation so far:\n{hist}\n\n' if hist else '') + f'Why-level {req.level}. Kid asks: {req.question[:400]}'
        try:
            data = await llm.chat_json([{'role': 'system', 'content': system}, {'role': 'user', 'content': user}],
                                       model='chat', max_tokens=1200, timeout=14)
            ans = str(data.get('answer', '')).strip()
            if ans:
                ch = data.get('suggestChallenge')
                return {'answer': ans, 'whyHook': str(data.get('whyHook') or WHY[lang]).strip(),
                        'conceptIds': [c for c in data.get('conceptIds', []) if c in concept_ids],
                        'grounded': bool(data.get('grounded', True)),
                        'suggestChallenge': ch if ch in (w.get('challenges') or []) else None, 'source': 'llm'}
        except Exception as e:
            log.info('ask fallback: %s', str(e)[:200])
    return _local_ask(req, w)


# ------------------------------------------------------------------ events + report
class CCEvent(BaseModel):
    sessionId: str
    name: str
    data: dict = Field(default_factory=dict)
    ts: str | None = None


def _session(sid: str) -> dict:
    s = store.get('cc_sessions', sid)
    if not s:
        s = {'sessionId': sid, 'startedAt': _now(), 'events': []}
    return s


@router.post('/sessions')
async def new_session(body: dict | None = None):
    sid = 'cc-' + uuid.uuid4().hex[:10]
    s = {'sessionId': sid, 'startedAt': _now(), 'events': [], 'worldId': (body or {}).get('worldId', 'beach'),
         'lang': _lang((body or {}).get('lang'))}
    store.put('cc_sessions', sid, s)
    return {'sessionId': sid}


@router.post('/events')
async def event(ev: CCEvent):
    if not re.fullmatch(r'[A-Za-z0-9_-]{3,64}', ev.sessionId):
        raise HTTPException(422, 'bad sessionId')
    s = _session(ev.sessionId)
    if len(s['events']) < 2000:
        s['events'].append({'name': ev.name[:40], 'data': json.loads(json.dumps(ev.data)[:4000]) if ev.data else {},
                            'ts': ev.ts or _now()})
    if ev.name == 'session_start':
        s['worldId'] = ev.data.get('worldId', s.get('worldId', 'beach'))
    if ev.name in ('session_start', 'lang') and ev.data.get('lang'):
        s['lang'] = _lang(ev.data.get('lang'))
    store.put('cc_sessions', ev.sessionId, s)
    return {'ok': True}


def build_report(s: dict) -> dict:
    w = get_world(s.get('worldId', 'beach'))
    evs = s.get('events', [])
    by = lambda n: [e for e in evs if e['name'] == n]  # noqa: E731
    asked = by('question_asked') + by('question_pick')
    levels = [int(e['data'].get('level', 0) or 0) for e in by('why_level')] + [int(e['data'].get('level', 0) or 0) for e in asked]
    cids: list[str] = []
    for e in by('concept') + asked:
        for c in (e['data'].get('conceptIds') or ([e['data']['conceptId']] if e['data'].get('conceptId') else [])):
            if c not in cids:
                cids.append(c)
    cmap = {c['id']: c for c in w.get('concepts', [])}
    def rec(n):
        xs = by(n)
        return None if not xs else bool(xs[-1]['data'].get('correct'))
    t0 = s.get('startedAt')
    last = evs[-1]['ts'] if evs else t0
    try:
        minutes = round((datetime.fromisoformat(last) - datetime.fromisoformat(t0)).total_seconds() / 60, 1)
    except Exception:
        minutes = 0
    journal = [{'question': str(e['data'].get('question', ''))[:200], 'level': int(e['data'].get('level', 0) or 0),
                'kidWords': e['data'].get('kidWords')} for e in by('journal_card')] or \
              [{'question': str(e['data'].get('question', ''))[:200], 'level': int(e['data'].get('level', 0) or 0)} for e in asked]
    return {
        'sessionId': s['sessionId'], 'lang': s.get('lang', 'en'), 'worldId': w.get('id', 'beach'), 'worldName': w.get('name'),
        'startedAt': t0, 'minutes': max(0, minutes),
        'questionsAsked': len(asked), 'deepestWhyLevel': max(levels) if levels else 0,
        'concepts': [cmap[c] for c in cids if c in cmap],
        'challengeAttempts': [{'challenge': str(e['data'].get('challenge', '')), 'choice': str(e['data'].get('choice', '')),
                               'result': str(e['data'].get('result', ''))} for e in by('challenge_attempt')],
        'recall': {'before': rec('recall_before'), 'after': rec('recall_after'), 'prompt': w.get('recall', {}).get('prompt', '')},
        'journal': journal, 'tryAtHome': w.get('tryAtHome', ''), 'realWorld': w.get('realWorld', {}),
        'wonder': [{'guess': e['data'].get('guess'), 'text': e['data'].get('text')} for e in by('wonder_submit')][:5],
    }


@router.get('/report/{session_id}')
async def report(session_id: str):
    s = store.get('cc_sessions', session_id)
    if not s:
        raise HTTPException(404, 'Report not found.')
    return build_report(s)


@router.get('/reports')
async def reports():
    out = []
    for s in store.all_('cc_sessions')[-30:]:
        try:
            r = build_report(s)
            out.append({k: r[k] for k in ('sessionId', 'startedAt', 'questionsAsked', 'deepestWhyLevel', 'worldName')})
        except Exception:
            continue
    return out[::-1]
