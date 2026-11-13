"""Record real playtest sessions of the Curiosity Craft loop through the actual API (real Wonder Board + Sam answers).

Each run follows a different play pattern (deep diver, explorer, experimenter...). The resulting event logs are saved
to server/cc_seed/ and loaded by the server at startup, so the parent dashboard has real history to show.
Usage (from repo root, with the API env configured):  python tools/record_playtests.py
"""
import json, os, random, sys, time
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'server'))
from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app import store  # noqa: E402

c = TestClient(app)
OUT = Path(__file__).resolve().parent.parent / 'server' / 'cc_seed'
OUT.mkdir(exist_ok=True)

PATTERNS = [
    # (label, lang, minutes, wonder text, start question, why-depth, extra questions, lab sequence, wonder spots, recall before/after)
    ('Explorer #0412', 'en', 12, 'a big wave', 'What makes a wave?', 3, [], ['stone-long', 'wood-short', 'foam-long'], ['tide pool', 'pier end'], (False, True)),
    ('Explorer #1187', 'hi', 15, 'sand castle', 'Where does sand come from?', 1,
     ['Why do waves crash near the shore?', 'Why is the tide high sometimes?', 'How do wetsuits keep you warm?', 'Why swim between the flags?'],
     ['foam-long'], ['sandcastle', 'shell', 'lifeguard tower', 'palm'], (True, True)),
    ('Explorer #2093', 'es', 9, 'una tabla de surf', '¿Por qué flota una tabla de surf?', 2, [],
     ['stone-short', 'stone-long', 'wood-long', 'foam-short'], [], (False, True)),
    ('Explorer #3341', 'en', 7, 'the sun', 'Why do I need sunscreen at the beach?', 1, ['Why is wet sand darker?'], ['wood-long', 'foam-long'], ['lifeguard tower'], (False, False)),
    ('Explorer #5520', 'zh', 11, '鱼', '鱼为什么能在水里漂浮？', 2, ['海浪是怎么形成的？'], ['stone-long', 'foam-long'], ['tide pool', 'pier end', 'shell'], (False, True)),
]
DENS = {'stone': 2.6, 'wood': 0.6, 'foam': 0.05, 'fiberglass': 0.15}


def result(choice):
    mat, shape = choice.split('-')
    if DENS[mat] > 1: return 'sinks'
    if mat == 'wood' and shape == 'short': return 'wobbles'
    return 'floats'


def run(i, p, start):
    label, lang, minutes, wtext, q0, depth, extra, labs, spots, (rb, ra) = p
    sid = c.post('/api/cc/sessions', json={'worldId': 'beach', 'lang': lang}).json()['sessionId']
    evs = []
    def ev(name, data):
        evs.append((name, data))
    ev('session_start', {'worldId': 'beach', 'lang': lang}); ev('spawn', {'worldId': 'beach'})
    for sp in spots:
        ev('wonder_spot', {'spot': sp, 'source': 'wonder_spot'})
    ev('roam_end', {}); ev('recall_before', {'correct': rb})
    w = c.post('/api/cc/wonder', json={'text': wtext, 'lang': lang, 'worldId': 'beach'}).json()
    ev('wonder_submit', {'guess': w.get('guess'), 'text': wtext, 'source': w.get('source')})
    hist, q, level = [], q0, 0
    ev('question_pick', {'question': q, 'level': 0})
    for lvl in range(depth + 1):
        a = c.post('/api/cc/ask', json={'worldId': 'beach', 'lang': lang, 'question': q, 'level': lvl, 'history': hist}).json()
        ev('question_asked', {'question': q, 'level': lvl, 'conceptIds': a.get('conceptIds', []), 'source': a.get('source')})
        for cid in a.get('conceptIds', []):
            ev('concept', {'conceptId': cid})
        ev('journal_card', {'question': q, 'level': lvl})
        hist += [{'role': 'kid', 'text': q}, {'role': 'npc', 'text': a['answer'] + ' ' + a['whyHook']}]
        if lvl < depth:
            ev('why_level', {'level': lvl + 1})
            q = a['whyHook']
    for q in extra:
        a = c.post('/api/cc/ask', json={'worldId': 'beach', 'lang': lang, 'question': q, 'level': 0, 'history': []}).json()
        ev('question_asked', {'question': q, 'level': 0, 'conceptIds': a.get('conceptIds', []), 'source': a.get('source')})
        ev('journal_card', {'question': q, 'level': 0})
    for ch in labs:
        ev('challenge_attempt', {'challenge': 'surfboard-lab', 'choice': ch, 'result': result(ch)})
    ev('recall_after', {'correct': ra}); ev('report_view', {})
    # space the timestamps over the real session length
    step = timedelta(seconds=minutes * 60 / max(1, len(evs)))
    t = start
    for name, data in evs:
        c.post('/api/cc/events', json={'sessionId': sid, 'name': name, 'data': data, 'ts': t.isoformat()})
        t += step
    s = store.get('cc_sessions', sid)
    s['startedAt'] = start.isoformat(); s['label'] = label; s['lang'] = lang
    (OUT / f'{sid}.json').write_text(json.dumps(s, ensure_ascii=False, indent=1), encoding='utf-8')
    print(label, sid, len(evs), 'events')


now = datetime.now(timezone.utc)
for i, p in enumerate(PATTERNS):
    run(i, p, now - timedelta(hours=5 - i, minutes=random.randint(0, 40)))
