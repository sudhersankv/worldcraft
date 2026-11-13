import logging
import os
from pathlib import Path

from dotenv import load_dotenv

SERVER_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = SERVER_DIR.parent
for _p in (SERVER_DIR / '.env', ROOT_DIR / '.env'):
    if _p.exists():
        load_dotenv(_p, override=False)

logging.basicConfig(level=logging.INFO, format='%(levelname)s %(name)s: %(message)s')

DATA_DIR = Path(os.getenv('WC_DATA_DIR') or (SERVER_DIR / 'data'))
SAMPLES_DIR = SERVER_DIR / 'samples'
DIST_DIR = Path(os.getenv('WC_DIST') or (ROOT_DIR / 'dist'))

MAX_PAGES = 20
MAX_CHARS = 60_000


def env(name: str) -> str:
    return (os.getenv(name) or '').strip()


def gateway() -> tuple[str, str]:
    base = env('NEON_AI_GATEWAY_BASE_URL').rstrip('/')
    if base and not base.startswith('http'):
        base = 'https://' + base
    return base, env('NEON_AI_GATEWAY_TOKEN')


def has_llm() -> bool:
    base, token = gateway()
    return bool(base and token)


def model_gen() -> str:
    return env('WC_MODEL_GEN') or 'claude-sonnet-4-6'


def model_chat() -> str:
    return env('WC_MODEL_CHAT') or 'claude-haiku-4-5'


def has_deepgram() -> bool:
    return bool(env('DEEPGRAM_API_KEY'))


def has_exa() -> bool:
    return bool(env('EXA_API_KEY'))


def has_typesafe() -> bool:
    return bool(env('TYPESAFE_API_KEY'))
