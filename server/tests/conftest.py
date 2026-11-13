import os
import sys
import tempfile
from pathlib import Path

# Hermetic: no API keys, throwaway data dir.
for k in ('NEON_AI_GATEWAY_BASE_URL', 'NEON_AI_GATEWAY_TOKEN', 'DEEPGRAM_API_KEY', 'EXA_API_KEY', 'TYPESAFE_API_KEY'):
    os.environ[k] = ''
os.environ['WC_DATA_DIR'] = tempfile.mkdtemp(prefix='wc-test-')
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
