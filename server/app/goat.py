"""Exa the goat (port of kapow-castle server/exa.js): kid-safe web answers from an allow-listed set of domains."""
from __future__ import annotations

import logging
import re
from urllib.parse import urlparse

import httpx

from . import config
from .schemas import GoatClue

log = logging.getLogger('wc.goat')
DOMAINS = ['britannica.com', 'kids.nationalgeographic.com', 'nasa.gov', 'khanacademy.org', 'wikipedia.org',
           'ducksters.com', 'natgeokids.com']
FALLBACK = "Baa! My library signal is a bit fuzzy right now. Let's ask your teacher, or look in your lesson's Study Book together!"


def kid_summary(question: str) -> str:
    return (f'Answer this question for a 9 year old in two short, friendly sentences with simple words: "{question}". '
            'Keep it gentle and age-appropriate, with no violence or scary details.')


def _domain(url: str) -> str:
    try:
        return urlparse(url).hostname.removeprefix('www.')
    except Exception:
        return 'the web'


async def ask_goat(question: str, subject: str = '') -> GoatClue:
    question = (question or '').strip()[:300]
    key = config.env('EXA_API_KEY')
    if not key or not question:
        return GoatClue(question=question, text=FALLBACK, source='Exa the goat')
    body = {'query': f'{question} ({subject + ", " if subject else ""}explained for kids)', 'type': 'auto', 'numResults': 3,
            'includeDomains': DOMAINS, 'contents': {'summary': {'query': kid_summary(question)}}}
    try:
        async with httpx.AsyncClient(timeout=9) as c:
            r = await c.post('https://api.exa.ai/search', json=body, headers={'x-api-key': key})
        if r.status_code != 200:
            raise RuntimeError(f'exa {r.status_code}: {r.text[:200]}')
        results = r.json().get('results') or []
        top = next((x for x in results if x.get('summary')), None)
        if top:
            text = re.sub(r'\s+', ' ', top['summary']).strip()[:500]
            return GoatClue(question=question, text=text, source=_domain(top.get('url', '')), url=top.get('url'))
    except Exception as e:
        log.info('goat unavailable: %s', str(e)[:160])
    return GoatClue(question=question, text=FALLBACK, source='Exa the goat')
