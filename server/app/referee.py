"""Answer referee (port of kapow-castle server/referee.js): Jev (TypeSafe) -> LLM -> local fuzzy match."""
from __future__ import annotations

import logging
import random
import re

import httpx

from . import config, llm
from .schemas import Question, Verdict

log = logging.getLogger('wc.referee')
PRAISE = ['You got it!', 'Yes, that is right!', 'Wow, spot on!', 'Brilliant!']
NUDGE = ['So close! Try once more.', 'Good try! Here comes a hint.', 'Not quite yet. Let\'s think again.']


def edit_distance(a: str, b: str) -> int:
    row = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        prev, row[0] = row[0], i
        for j in range(1, len(b) + 1):
            cur = row[j]
            row[j] = min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] != b[j - 1]))
            prev = cur
    return row[len(b)]


def _norm(s: str) -> str:
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 -]', ' ', s.lower())).strip()


def aliases_for(q: Question) -> list[str]:
    out = [_norm(a) for a in q.accept] + [_norm(q.choices[q.answer_index])] if 0 <= q.answer_index < len(q.choices) else [_norm(a) for a in q.accept]
    out = [re.sub(r'^(a|an|the) ', '', a) for a in out if a]
    return list(dict.fromkeys(a for a in out if a))


def local_match(utterance: str, aliases: list[str]) -> bool:
    said = f' {_norm(utterance)} '
    said_no_art = re.sub(r' (a|an|the) ', ' ', said)
    if any(f' {a} ' in s or f' {a}s ' in s for a in aliases for s in (said, said_no_art)):
        return True
    words = said.split()
    cands = words + [words[i] + words[i + 1] for i in range(len(words) - 1)]
    # speech-to-text often misspells long words
    return any(len(a) >= 6 and ' ' not in a and not re.search(r'\d', a) and any(edit_distance(c, a) <= 2 for c in cands) for a in aliases)


def wrong_choice(utterance: str, q: Question) -> bool:
    said = _norm(utterance)
    return any(i != q.answer_index and _norm(c) == said for i, c in enumerate(q.choices))


def local_intent(utterance: str) -> str:
    said = utterance.lower().strip()
    if re.match(r"^(skip|next|pass)\b", said) or 'i give up' in said:
        return 'skip'
    if said.endswith('?') or re.match(r"^(why|what's|whats|what is|what are|how do|how does|who is|can you explain|i don't get|i dont get|i don't understand|i dont understand|what does)\b", said):
        return 'doubt'
    return 'answer'


async def ask_jev(prompt: str, expected: str, utterance: str) -> dict:
    key = config.env('TYPESAFE_API_KEY')
    if not key:
        raise RuntimeError('typesafe not configured')
    body = {
        'model': 'jev-latest',
        'state': f'Question asked to a child: {prompt}\nCorrect answer: {expected}\nThe child said (from speech recognition, so names may be misspelled; judge by how it sounds): "{utterance}"',
        'questions': {
            'intent': {'type': 'choice', 'instructions': 'What is the child doing?', 'criteria': {
                'answer': 'Attempting to answer the question, even if wrong',
                'doubt': 'Asking a question or saying they do not understand something',
                'skip': 'Asking to skip or move on',
                'off_topic': 'Unrelated to the question or its subject: random chatter, talking to someone else, or background noise'}},
            'correct': {'type': 'noul', 'instructions': "Does the child's words give the correct answer to the question?"},
            'power': {'type': 'score', 'instructions': 'How confident and complete is the answer?',
                      'criteria': ['Guessing or unsure', 'Right idea', 'Confident and complete']},
        },
    }
    async with httpx.AsyncClient(timeout=5) as c:
        r = await c.post('https://api.typesafe.ai/v1/systemone', json=body, headers={'Authorization': f'Bearer {key}'})
    if r.status_code != 200:
        raise RuntimeError(f'jev {r.status_code}: {r.text[:200]}')
    a = r.json()['answers']
    confused = a['intent'].get('confidence', 1) < 0.6 or abs(a['correct']['noul'] - 0.5) < 0.2
    return {'intent': a['intent']['choice'], 'correct': a['correct']['noul'] > 0.5, 'power': a['power']['score'],
            'confused': confused, 'source': 'jev'}


async def ask_llm(prompt: str, expected: str, utterance: str) -> dict:
    text = await llm.chat([{'role': 'user', 'content':
                            f'Question asked to a child: {prompt}\nCorrect answer: {expected}\nChild said (speech-to-text, may be misspelled): "{utterance}"\n'
                            'Reply with JSON only: {"intent":"answer|doubt|skip|off_topic","correct":true|false,"power":0-1}. '
                            'Use off_topic for chatter unrelated to the question. Accept answers that mean the same thing in other words.'}],
                          model='chat', max_tokens=60, temperature=0, timeout=5)
    v = llm.extract_json(text)
    if v.get('intent') not in ('answer', 'doubt', 'skip', 'off_topic', 'chat'):
        v['intent'] = 'answer'
    return {'intent': v['intent'], 'correct': bool(v.get('correct')), 'power': v.get('power', 0.7), 'source': 'llm'}


async def referee(q: Question, utterance: str) -> Verdict:
    expected = q.choices[q.answer_index] if 0 <= q.answer_index < len(q.choices) else (q.accept[0] if q.accept else '')
    aliases = aliases_for(q)
    local = local_match(utterance, aliases)
    picked_wrong = wrong_choice(utterance, q)
    verdict = None
    if not local and not picked_wrong:  # exact matches never need a model
        for provider in (ask_jev, ask_llm):
            if verdict and not verdict.get('confused'):
                break
            try:
                verdict = await provider(q.prompt, expected, utterance) or verdict
            except Exception as e:
                log.info('referee %s unavailable: %s', provider.__name__, str(e)[:120])
    if verdict is None:
        verdict = {'intent': local_intent(utterance), 'correct': local, 'power': 0.7, 'source': 'local'}
        if local or picked_wrong:
            verdict['intent'] = 'answer'
    correct = bool(verdict.get('correct')) or local
    if picked_wrong and not local:
        correct = False
    intent = 'answer' if (local or picked_wrong) else verdict.get('intent', 'answer')
    try:
        power = float(verdict.get('power', 0.7))
    except (TypeError, ValueError):
        power = 0.7
    power = max(0.35, min(1.0, power))
    log.info('referee[%s] intent=%s correct=%s power=%.2f', verdict['source'], intent, correct, power)
    return Verdict(intent=intent, correct=correct, power=power,
                   feedback=random.choice(PRAISE) if correct else random.choice(NUDGE), source=verdict['source'])
