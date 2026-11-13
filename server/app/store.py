"""JSON-file persistence under server/data/ with an in-memory cache. Samples are read-only."""
from __future__ import annotations

import json
import logging
import re
import threading
from pathlib import Path
from typing import Any

from . import config

log = logging.getLogger('wc.store')
_lock = threading.Lock()
_cache: dict[str, dict[str, Any]] = {}
KINDS = ('materials', 'lessons', 'worlds', 'sessions')


def _safe(id_: str) -> str:
    return re.sub(r'[^A-Za-z0-9_.-]', '_', id_)[:120]


def _dir(kind: str) -> Path:
    d = config.DATA_DIR / kind
    d.mkdir(parents=True, exist_ok=True)
    return d


def put(kind: str, id_: str, obj: dict) -> None:
    with _lock:
        _cache.setdefault(kind, {})[id_] = obj
        try:
            (_dir(kind) / f'{_safe(id_)}.json').write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding='utf-8')
        except OSError as e:
            log.warning('could not persist %s/%s: %s', kind, id_, e)


def get(kind: str, id_: str) -> dict | None:
    c = _cache.setdefault(kind, {})
    if id_ in c:
        return c[id_]
    p = config.DATA_DIR / kind / f'{_safe(id_)}.json'
    if p.exists():
        try:
            obj = json.loads(p.read_text(encoding='utf-8'))
            c[id_] = obj
            return obj
        except Exception as e:
            log.warning('bad json %s: %s', p, e)
    return None


def all_(kind: str) -> list[dict]:
    d = config.DATA_DIR / kind
    out = []
    if d.exists():
        for p in sorted(d.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True):
            try:
                out.append(json.loads(p.read_text(encoding='utf-8')))
            except Exception:
                pass
    return out


# ------------------------------------------------------------------ samples (read-only)
_samples: dict[str, dict[str, dict]] = {}


def samples(kind: str) -> dict[str, dict]:
    """kind: 'worlds' | 'lessons'. Keyed by worldId / lessonId."""
    if kind not in _samples:
        key = 'worldId' if kind == 'worlds' else 'lessonId'
        res: dict[str, dict] = {}
        for p in sorted((config.SAMPLES_DIR / kind).glob('*.json')):
            try:
                obj = json.loads(p.read_text(encoding='utf-8'))
                res[obj[key]] = obj
            except Exception as e:
                log.warning('bad sample %s: %s', p, e)
        _samples[kind] = res
    return _samples[kind]


def reset_cache() -> None:
    _cache.clear()
    _samples.clear()
