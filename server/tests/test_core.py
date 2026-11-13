import asyncio
import copy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.extract import material_from_pdf
from app.generate import generate_world
from app.heuristic import heuristic_lesson, heuristic_world
from app.main import app
from app.schemas import LessonSpec, NpcReplyRequest
from app.services import npc_turn
from app.validate import errors, validate_lesson, validate_world

SAMPLES = Path(__file__).resolve().parent.parent / 'samples'
client = TestClient(app)


def load(kind, name):
    return json.loads((SAMPLES / kind / f'{name}.json').read_text(encoding='utf-8'))


@pytest.mark.parametrize('name', ['forest-photosynthesis', 'space-solar-system', 'math-fractions',
                                  'egypt-pyramids', 'ocean-coral-reefs', 'lab-states-of-matter'])
def test_samples_valid(name):
    lesson, d1 = validate_lesson(load('lessons', name))
    _, d2 = validate_world(load('worlds', name), lesson)
    assert not errors(d1) and not errors(d2), errors(d1) + errors(d2)


def test_validator_rejects_malformed_and_fallback_recovers():
    lesson = LessonSpec.model_validate(load('lessons', 'forest-photosynthesis'))
    bad = copy.deepcopy(load('worlds', 'forest-photosynthesis'))
    bad['npcs'][0]['check']['answerIndex'] = 9
    bad['quests'][0]['steps'][0]['targetId'] = 'nope'
    bad['puzzles'][1]['items'] = ['only one']
    bad['quests'][0]['prerequisiteIds'] = ['q-final']  # cycle
    bad['memoryLandmarks'] = bad['memoryLandmarks'][:1]
    bad['study'][0]['sourceSectionIds'] = ['s99']
    _, d = validate_world(bad, lesson)
    msg = ' | '.join(errors(d))
    for needle in ['out of range', 'does not exist', 'sequence needs', 'cycle', 'memoryLandmarks', 'unknown source section']:
        assert needle in msg, needle
    assert validate_world({'worldId': 'x'})[0] is None  # schema-level garbage
    bad_lesson = load('lessons', 'forest-photosynthesis')
    bad_lesson['objectives'][0]['evidence'][0]['quote'] = 'Plants eat pizza on Tuesdays.'
    assert any('not found in section' in x for x in validate_lesson(bad_lesson)[1])
    # no keys: generation for the sample lesson returns its valid sample world
    res = asyncio.run(generate_world(lesson, 'forest'))
    assert res.world.world_id == 'forest-photosynthesis'
    assert not errors(validate_world(res.world, lesson)[1])


def test_heuristic_on_sample_pdfs_valid_and_different():
    worlds = []
    for f in ['photosynthesis', 'solar-system']:
        m = material_from_pdf((SAMPLES / 'pdfs' / f'{f}.pdf').read_bytes(), f'{f}.pdf')
        assert len(m.sections) >= 4
        lesson = heuristic_lesson(m)
        assert not errors(validate_lesson(lesson)[1])
        w = heuristic_world(lesson)
        assert not errors(validate_world(w, lesson)[1]), errors(validate_world(w, lesson)[1])
        assert w.source == 'heuristic' and len(w.study) >= 3 and w.glossary and w.review_questions
        worlds.append((lesson, w))
    (l1, w1), (l2, w2) = worlds
    assert w1.template_id == 'forest' and w2.template_id == 'space'
    assert w1.npcs[0].knowledge != w2.npcs[0].knowledge
    assert {g.term for g in w1.glossary}.isdisjoint({g.term for g in w2.glossary})
    assert [o.text for o in l1.objectives] != [o.text for o in l2.objectives]


def test_results_from_events():
    sid = client.post('/api/sessions', json={'worldId': 'forest-photosynthesis'}).json()['sessionId']

    def ev(**k):
        body = {'sessionId': sid, 'worldId': 'forest-photosynthesis', 'timestamp': '2026-11-13T12:00:00Z', **k}
        assert client.post(f'/api/sessions/{sid}/events', json=body).json() == {'ok': True}

    ev(eventType='study_open', objectiveId='obj-1', detail='study-1a')
    ev(eventType='question_answer', questionId='check-wally', result='incorrect', attempt=1, hintsUsed=1)
    ev(eventType='question_answer', questionId='check-wally', result='correct', attempt=2)
    ev(eventType='explain_attempt', objectiveId='obj-1', result='correct')
    ev(eventType='puzzle_attempt', puzzleId='pz-steps', result='incorrect')
    ev(eventType='recall_attempt', questionId='recall-well', result='correct')
    r = client.get(f'/api/sessions/{sid}/results').json()
    o1, o2, o3 = r['objectives']
    assert o1 == {'objectiveId': 'obj-1', 'text': o1['text'], 'demonstrated': True, 'attempts': 2, 'correct': 1,
                  'hintsUsed': 1, 'recalled': True, 'studied': True, 'explained': True}
    assert o2['demonstrated'] is False and o2['attempts'] == 1 and o2['recalled'] is None and o2['explained'] is None
    assert o3['attempts'] == 0 and not r['completed'] and r['events'] == 7  # + session_start
    assert len(r['suggestedReview']) == 2
    assert any(s['sessionId'] == sid for s in client.get('/api/sessions').json())


def test_npc_turn_offline():
    def run(**k):
        return asyncio.run(npc_turn(NpcReplyRequest(worldId='forest-photosynthesis', history=[], **k)))

    r = run(npcId='npc-2', utterance='chlorofil', questionId='check-sunny')  # STT misspelling
    assert r.verdict and r.verdict.correct and r.verdict.intent == 'answer'
    r = run(npcId='npc-2', utterance='starch', questionId='check-sunny', mode='answer')
    assert r.verdict and not r.verdict.correct and 'chlorophyll' not in r.reply.lower()
    r = run(npcId='npc-1', utterance='how do leaves get water?')
    assert 'root' in r.reply.lower() and r.source == 'local'
    r = run(npcId='npc-1', utterance='plants need water and sunlight and carbon dioxide from the air', mode='explain', objectiveId='obj-1')
    assert r.explain and r.explain.passed
    r = run(npcId='npc-1', utterance='plants need water', mode='explain', objectiveId='obj-1')
    assert r.explain and not r.explain.passed and r.explain.missing


def test_api_smoke_no_keys():
    cfg = client.get('/api/config').json()
    assert cfg['llm'] is False and cfg['tts'] is False
    assert len(client.get('/api/samples').json()) == 3
    m = client.post('/api/materials/sample', json={'sampleId': 'solar-system'}).json()
    g = client.post('/api/lessons/generate', json={'materialId': m['materialId'], 'ageBand': '10-12'}).json()
    assert g['source'] == 'sample' and len(g['lesson']['objectives']) == 3
    text = (SAMPLES / 'texts' / 'pyramids.md').read_text(encoding='utf-8')
    t = client.post('/api/materials/text', json={'title': 'Pyramids', 'text': text}).json()
    gl = client.post('/api/lessons/generate', json={'materialId': t['materialId']}).json()
    assert gl['source'] == 'heuristic'
    gw = client.post('/api/worlds/generate', json={'lesson': gl['lesson'], 'templateId': 'ocean'}).json()
    assert gw['world']['templateId'] == 'ocean' and gw['world']['source'] == 'heuristic'
    wid = gw['world']['worldId']
    assert client.get(f'/api/worlds/{wid}').status_code == 200
    assert client.put(f'/api/worlds/{wid}', json=gw['world']).status_code == 200
    assert client.put(f'/api/worlds/{wid}', json=dict(gw['world'], npcs=[])).status_code == 422
    assert client.get('/api/tts', params={'text': 'hi'}).status_code == 503
    assert client.post('/api/goat', json={'question': 'why is the sky blue'}).json()['text']
    v = client.post('/api/grade', json={'worldId': 'space-solar-system', 'questionId': 'check-orbit', 'utterance': 'mercury'}).json()
    assert v['correct'] is True and v['source'] == 'local'
    assert client.post('/api/materials', files={'file': ('x.pdf', b'%PDF-1.4 garbage', 'application/pdf')}).status_code == 422
