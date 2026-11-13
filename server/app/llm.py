"""Neon AI Gateway (OpenAI-compatible chat completions) + robust JSON extraction."""
from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from . import config

log = logging.getLogger('wc.llm')


class LLMError(RuntimeError):
    pass


class NoCreditsError(LLMError):
    """Gateway answered 403 paid_plan_required: the account has no AI Gateway credits."""


_models: dict | None = None  # {'enabled': [...ids], 'error': str|None}
_status: dict = {'noCredits': False}


async def list_models(force: bool = False) -> dict:
    """GET ${BASE}/v1/models (cached). Returns {'enabled': [ids], 'error': str|None}."""
    global _models
    if _models is not None and not force:
        return _models
    base, token = config.gateway()
    if not (base and token):
        return {'enabled': [], 'error': 'not configured'}
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f'{base}/v1/models', headers={'Authorization': f'Bearer {token}'})
        data = r.json().get('data', []) if r.status_code == 200 else []
        enabled = [m['id'] for m in data if m.get('enabled')]
        reasons = {m.get('unavailable_reason') for m in data if not m.get('enabled')}
        err = None if r.status_code == 200 else f'models {r.status_code}'
        if data and not enabled and 'paid_plan_required' in reasons:
            err = 'paid_plan_required'
            _status['noCredits'] = True
        _models = {'enabled': enabled, 'error': err}
    except Exception as e:  # don't cache transient failures
        return {'enabled': [], 'error': type(e).__name__}
    return _models


def _pick(configured: str, enabled: list[str]) -> str:
    if not enabled or configured in enabled:
        return configured
    claude = [m for m in enabled if m.startswith('claude')]
    family = 'haiku' if 'haiku' in configured else 'sonnet' if 'sonnet' in configured else ''
    pref = [m for m in claude if family and family in m]
    return (pref or claude or enabled)[0]


async def resolve_model(kind: str = 'chat') -> str:
    configured = config.model_chat() if kind == 'chat' else config.model_gen()
    info = await list_models()
    return _pick(configured, info.get('enabled') or [])


def no_credits() -> bool:
    return bool(_status['noCredits'])


async def chat(messages: list[dict], *, model: str | None = None, max_tokens: int = 1024,
               temperature: float = 0.4, timeout: float = 60.0) -> str:
    base, token = config.gateway()
    if not (base and token):
        raise LLMError('LLM gateway not configured')
    if _status['noCredits']:
        raise NoCreditsError('LLM gateway has no credits (paid_plan_required)')
    if model in (None, 'chat', 'gen'):
        model = await resolve_model(model or 'chat')
    body = {'model': model, 'messages': messages, 'max_tokens': max_tokens}
    # Newer Claude models (5.x) reject a custom temperature; only send it to older ones.
    if not re.search(r'-(5|[6-9])(-|$)', str(model)):
        body['temperature'] = temperature
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(f'{base}/v1/chat/completions', json=body,
                                  headers={'Authorization': f'Bearer {token}'})
    except httpx.HTTPError as e:
        raise LLMError(f'gateway request failed: {type(e).__name__}') from e
    if r.status_code == 403 and 'paid_plan_required' in r.text:
        _status['noCredits'] = True
        raise NoCreditsError('LLM gateway has no credits (403 paid_plan_required); add AI Gateway credits on the Neon Billing page')
    if r.status_code != 200:
        raise LLMError(f'gateway {r.status_code}: {r.text[:200]}')
    try:
        content = r.json()['choices'][0]['message']['content']
    except Exception as e:
        raise LLMError('gateway returned an unexpected shape') from e
    if isinstance(content, list):  # some providers return content parts
        content = ''.join(p.get('text', '') for p in content if isinstance(p, dict))
    return content or ''


def extract_json(text: str) -> Any:
    """Pull the first complete JSON object out of a model response (handles fences / prose)."""
    if not text:
        raise ValueError('empty response')
    fence = re.search(r'```(?:json)?\s*(.*?)```', text, re.S)
    candidates = [fence.group(1)] if fence else []
    candidates.append(text)
    for cand in candidates:
        start = cand.find('{')
        while start != -1:
            depth, in_str, esc = 0, False, False
            for i in range(start, len(cand)):
                ch = cand[i]
                if in_str:
                    if esc:
                        esc = False
                    elif ch == '\\':
                        esc = True
                    elif ch == '"':
                        in_str = False
                    continue
                if ch == '"':
                    in_str = True
                elif ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        chunk = cand[start:i + 1]
                        try:
                            return json.loads(chunk)
                        except json.JSONDecodeError:
                            try:  # trailing commas are the usual offender
                                return json.loads(re.sub(r',\s*([}\]])', r'\1', chunk))
                            except json.JSONDecodeError:
                                break
            start = cand.find('{', start + 1)
    raise ValueError('no JSON object found in response')


async def chat_json(messages: list[dict], **kw) -> Any:
    return extract_json(await chat(messages, **kw))
