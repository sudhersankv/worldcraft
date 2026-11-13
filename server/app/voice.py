"""Realtime voice loop for CURIOSITYCRAFT: WebSocket /ws/voice.

Browser mic (PCM16 mono 16 kHz) -> Deepgram Nova-3 live STT -> npc_turn (LLM + referee)
-> Deepgram Aura-2 TTS (raw linear16 24 kHz, streamed) -> browser.

Protocol: docs/VOICE_PROTOCOL.md.

PRIVACY: no audio is stored anywhere. Mic frames are relayed straight to Deepgram and
dropped; TTS bytes are relayed straight to the browser and dropped. Only the text of
the last few turns lives in memory for the lifetime of the socket.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
import uuid
from collections import deque
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

log = logging.getLogger("curiositycraft.voice")
router = APIRouter()

DG_LISTEN_URL = "wss://api.deepgram.com/v1/listen?" + urlencode({
    "model": "nova-3",
    "encoding": "linear16",
    "sample_rate": 16000,
    "channels": 1,
    "interim_results": "true",
    "smart_format": "true",
    "endpointing": 300,
    "utterance_end_ms": 1000,
    "vad_events": "true",
})
DG_SPEAK_URL = "https://api.deepgram.com/v1/speak"
TTS_SAMPLE_RATE = 24000
DEFAULT_VOICE = "aura-2-thalia-en"
HISTORY_TURNS = 8
KEEPALIVE_S = 4.0
COMMIT_GRACE_S = 0.7
EXPLAIN_EXTRA_PAUSE_S = 0.8  # explain mode: UtteranceEnd (1.0 s) + this = ~1.8 s of silence ends the turn
_VOICE_RE = re.compile(r"^aura(-2)?-[a-z0-9-]+$")
FILLER = {"um", "uh", "uhm", "umm", "hmm", "hm", "mm", "mmm", "ah", "er", "erm", "huh", "oh", "eh"}


# ------------------------------------------------------------------ helpers
def deepgram_key() -> str | None:
    """DEEPGRAM_API_KEY from the environment or the app config (never logged)."""
    k = os.environ.get("DEEPGRAM_API_KEY")
    if k:
        return k
    try:
        from . import config  # type: ignore
        for holder in (getattr(config, "settings", None), config):
            if holder is None:
                continue
            for name in ("deepgram_api_key", "DEEPGRAM_API_KEY", "deepgram_key"):
                v = getattr(holder, name, None)
                if v:
                    return str(v.get_secret_value() if hasattr(v, "get_secret_value") else v)
        get = getattr(config, "get_settings", None)
        if callable(get):
            s = get()
            v = getattr(s, "deepgram_api_key", None)
            if v:
                return str(v.get_secret_value() if hasattr(v, "get_secret_value") else v)
    except Exception:
        pass
    return None


def meaningful(text: str) -> bool:
    words = [w for w in re.sub(r"[^\w\s']", " ", text.lower()).split() if w]
    if not words:
        return False
    real = [w for w in words if w not in FILLER]
    return bool(real) and len("".join(real)) >= 2


def _dump(obj: Any) -> dict:
    if hasattr(obj, "model_dump"):
        return obj.model_dump(by_alias=True, exclude_none=True, mode="json")
    if isinstance(obj, dict):
        return {k: v for k, v in obj.items() if v is not None}
    return {"reply": str(obj), "source": "local"}


async def call_npc(req: dict) -> dict:
    """Run one NPC turn via services.npc_turn (imported lazily). Degrades to a local line."""
    try:
        from . import services, schemas  # type: ignore
        model = schemas.NpcReplyRequest.model_validate(req)
        return _dump(await services.npc_turn(model))
    except Exception as e:  # services mid-edit, LLM down, bad ids...
        log.warning("npc_turn unavailable: %s", e)
        return {"reply": "Hmm, my ears are a bit fuzzy. Can you say that again?", "source": "local"}


def npc_voice_for(world_id: str, npc_id: str) -> str:
    try:
        from . import services  # type: ignore
        world = services.get_world(world_id)
        v = services.npc_voice(world, npc_id)
        if v and _VOICE_RE.match(v):
            return v
    except Exception:
        pass
    return DEFAULT_VOICE


async def record_utterance(ctx: dict, text: str) -> None:
    if not ctx.get("sessionId"):
        return
    try:
        from . import services, schemas  # type: ignore
        from datetime import datetime, timezone
        ev = {"eventType": "utterance", "sessionId": ctx["sessionId"], "worldId": ctx.get("worldId", ""),
              "questionId": ctx.get("questionId"), "detail": text[:200],
              "timestamp": datetime.now(timezone.utc).isoformat()}
        model = getattr(schemas, "SessionEvent", None)
        await services.record_event(model.model_validate(ev) if model else ev)
    except Exception:
        pass


async def dg_connect(url: str, key: str):
    import websockets
    headers = {"Authorization": f"Token {key}"}
    try:  # websockets >= 14 (new asyncio client)
        return await websockets.connect(url, additional_headers=headers, max_size=None, open_timeout=8)
    except TypeError:  # websockets < 14 (legacy client)
        return await websockets.connect(url, extra_headers=headers, max_size=None, open_timeout=8)


# ------------------------------------------------------------------ connection
class VoiceConn:
    def __init__(self, ws: WebSocket):
        self.ws = ws
        self.key = deepgram_key()
        self.ctx: dict = {}
        self.history: deque = deque(maxlen=HISTORY_TURNS * 2)
        self.send_lock = asyncio.Lock()
        self.closed = False
        # STT
        self.dg = None
        self.dg_tasks: list[asyncio.Task] = []
        self.dg_connecting = False
        self.dg_last_attempt = 0.0
        self.last_audio = 0.0
        self.finals: list[str] = []
        self.last_interim_sent = ""
        self.interim = ""
        self.commit_task: asyncio.Task | None = None
        self.pause_task: asyncio.Task | None = None  # explain-mode delayed end of turn
        # turns / TTS
        self.turn_task: asyncio.Task | None = None
        self.tts_task: asyncio.Task | None = None
        self.tts_active: str | None = None  # id of the utterance being streamed
        self.http = None

    # ---- send
    async def send(self, obj: dict) -> None:
        if self.closed:
            return
        try:
            async with self.send_lock:
                await self.ws.send_text(json.dumps(obj))
        except Exception:
            self.closed = True

    async def send_audio(self, b: bytes) -> None:
        if self.closed:
            return
        try:
            async with self.send_lock:
                await self.ws.send_bytes(b)
        except Exception:
            self.closed = True

    # ---- control messages
    async def on_control(self, m: dict) -> None:
        t = m.get("type")
        if t == "start":
            self.set_ctx(m)
            stt = False
            if self.key:
                stt = await self.open_stt()
            await self.send({"type": "ready", "stt": stt, "tts": bool(self.key)})
        elif t == "context":
            self.set_ctx(m)
        elif t == "text":
            text = str(m.get("text", "")).strip()[:500]
            if text:
                self.start_turn(text)
        elif t == "commit":
            await self.commit()
        elif t == "speak":
            text = str(m.get("text", "")).strip()[:800]
            voice = str(m.get("voice") or "")
            if not _VOICE_RE.match(voice):
                voice = self.voice()
            if text:
                await self.cancel_tts()
                self.tts_task = asyncio.create_task(self.tts(text, voice, str(m.get("id") or uuid.uuid4().hex[:8])))
        elif t == "barge":
            await self.cancel_tts()
        elif t == "stop":
            await self.close_stt()
            await self.cancel_turn()
        else:
            await self.send({"type": "error", "message": f"unknown message type {t!r}"})

    def set_ctx(self, m: dict) -> None:
        prev_npc = self.ctx.get("npcId")
        for k in ("worldId", "npcId", "sessionId", "questionId", "voice", "mode", "objectiveId"):
            if k in m:
                self.ctx[k] = m[k]
        if prev_npc is not None and self.ctx.get("npcId") != prev_npc:
            self.history.clear()

    def voice(self) -> str:
        v = self.ctx.get("voice")
        if isinstance(v, str) and _VOICE_RE.match(v):
            return v
        return npc_voice_for(self.ctx.get("worldId", ""), self.ctx.get("npcId", ""))

    # ---- STT (Deepgram live)
    async def open_stt(self) -> bool:
        if self.dg is not None:
            return True
        self.dg_connecting = True
        self.dg_last_attempt = time.monotonic()
        try:
            self.dg = await dg_connect(DG_LISTEN_URL, self.key or "")
        except Exception as e:
            log.warning("deepgram listen connect failed: %s", e)
            self.dg = None
            return False
        finally:
            self.dg_connecting = False
        self.dg_tasks = [asyncio.create_task(self.dg_reader(self.dg)), asyncio.create_task(self.dg_keepalive(self.dg))]
        return True

    async def close_stt(self) -> None:
        dg, self.dg = self.dg, None
        for task in self.dg_tasks:
            task.cancel()
        self.dg_tasks = []
        if dg is not None:
            try:
                await dg.send(json.dumps({"type": "CloseStream"}))
                await asyncio.wait_for(dg.close(), 2)
            except Exception:
                pass
        self.finals, self.interim = [], ""

    async def on_audio(self, b: bytes) -> None:
        self.last_audio = time.monotonic()
        dg = self.dg
        if dg is None:
            # lazy reconnect if Deepgram dropped us mid-session
            if self.key and self.ctx and not self.dg_connecting and time.monotonic() - self.dg_last_attempt > 3:
                asyncio.create_task(self.open_stt())
            return
        try:
            await dg.send(b)
        except Exception:
            self.dg = None

    async def dg_keepalive(self, dg) -> None:
        try:
            while True:
                await asyncio.sleep(KEEPALIVE_S / 2)
                if time.monotonic() - self.last_audio > KEEPALIVE_S:
                    await dg.send(json.dumps({"type": "KeepAlive"}))
        except asyncio.CancelledError:
            raise
        except Exception:
            pass

    async def dg_reader(self, dg) -> None:
        try:
            async for raw in dg:
                if isinstance(raw, (bytes, bytearray)):
                    continue
                try:
                    m = json.loads(raw)
                except ValueError:
                    continue
                await self.on_dg(m)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.info("deepgram stream ended: %s", e)
        if self.dg is dg:
            self.dg = None

    async def on_dg(self, m: dict) -> None:
        t = m.get("type")
        if t == "Results":
            try:
                text = (m["channel"]["alternatives"][0].get("transcript") or "").strip()
            except (KeyError, IndexError, TypeError):
                text = ""
            if m.get("is_final"):
                if text:
                    self.finals.append(text)
                self.interim = ""
            else:
                self.interim = text
            running = " ".join(self.finals + ([self.interim] if self.interim else [])).strip()
            if text and meaningful(text):
                self.cancel_pause()  # still talking: don't end an explanation mid-thought
                if self.tts_active:
                    await self.cancel_tts(barged=True)
                if running != self.last_interim_sent:  # dedupe: no redundant repaints on the client
                    self.last_interim_sent = running
                    await self.send({"type": "interim", "text": running})
            if m.get("from_finalize") and self.commit_task:
                await self.flush()
            elif m.get("speech_final"):
                if self.explaining():
                    pass  # short pauses don't end an explanation; wait for UtteranceEnd
                else:
                    await self.flush()
        elif t == "UtteranceEnd":
            if self.explaining():
                self.cancel_pause()

                async def later():
                    await asyncio.sleep(EXPLAIN_EXTRA_PAUSE_S)
                    self.pause_task = None
                    await self.flush()
                self.pause_task = asyncio.create_task(later())
            else:
                await self.flush()
        elif t == "SpeechStarted":
            pass  # noise also triggers this; barge-in waits for real words
        elif t == "Error" or m.get("err_code"):
            await self.send({"type": "error", "message": str(m.get("description") or m.get("err_msg") or "stt error")})

    def explaining(self) -> bool:
        return self.ctx.get("mode") == "explain"

    def cancel_pause(self) -> None:
        if self.pause_task:
            self.pause_task.cancel()
            self.pause_task = None

    async def commit(self) -> None:
        """Push-to-talk release: ask Deepgram to finalize, then flush what we have."""
        if self.dg is not None:
            try:
                await self.dg.send(json.dumps({"type": "Finalize"}))
            except Exception:
                pass
        if self.commit_task:
            self.commit_task.cancel()

        async def later():
            await asyncio.sleep(COMMIT_GRACE_S)
            self.commit_task = None
            await self.flush(include_interim=True)
        self.commit_task = asyncio.create_task(later())

    async def flush(self, include_interim: bool = False) -> None:
        parts = list(self.finals)
        if include_interim and self.interim:
            parts.append(self.interim)
        self.finals, self.interim, self.last_interim_sent = [], "", ""
        if self.pause_task and self.pause_task is not asyncio.current_task():
            self.cancel_pause()
        if self.commit_task and not include_interim:
            self.commit_task.cancel()
            self.commit_task = None
        text = " ".join(parts).strip()
        if meaningful(text):
            self.start_turn(text)

    # ---- turns
    def start_turn(self, text: str) -> None:
        if self.turn_task and not self.turn_task.done():
            self.turn_task.cancel()  # kid said something new: newest utterance wins
        self.turn_task = asyncio.create_task(self.run_turn(text))

    async def cancel_turn(self) -> None:
        if self.turn_task and not self.turn_task.done():
            self.turn_task.cancel()
        await self.cancel_tts()

    async def run_turn(self, text: str) -> None:
        await self.cancel_tts()
        await self.send({"type": "final", "text": text})
        await self.send({"type": "thinking"})
        req = {"worldId": self.ctx.get("worldId", ""), "npcId": self.ctx.get("npcId", ""),
               "sessionId": self.ctx.get("sessionId"), "questionId": self.ctx.get("questionId"),
               "mode": self.ctx.get("mode"), "objectiveId": self.ctx.get("objectiveId"),
               "utterance": text, "history": list(self.history)}
        req = {k: v for k, v in req.items() if v is not None}
        asyncio.create_task(record_utterance(dict(self.ctx), text))
        resp = await call_npc(req)
        reply = str(resp.get("reply") or "").strip()
        self.history.append({"role": "child", "text": text})
        if reply:
            self.history.append({"role": "npc", "text": reply})
        voice = self.voice()
        await self.send({"type": "reply", **resp, "voice": voice})
        if reply and self.key:
            self.tts_task = asyncio.create_task(self.tts(reply, voice, uuid.uuid4().hex[:8]))

    # ---- TTS (Deepgram Aura-2 REST, streamed raw linear16)
    async def cancel_tts(self, barged: bool = False) -> None:
        task, self.tts_task = self.tts_task, None
        if task and not task.done():
            sid = self.tts_active
            task.cancel()
            try:
                await task
            except BaseException:
                pass
            if barged and sid:
                log.debug("barge-in on %s", sid)

    async def tts(self, text: str, voice: str, sid: str) -> None:
        if not self.key:
            await self.send({"type": "tts_end", "id": sid, "error": "tts unavailable"})
            return
        import httpx
        if self.http is None:
            self.http = httpx.AsyncClient(timeout=httpx.Timeout(20, connect=5))
        self.tts_active = sid
        await self.send({"type": "tts_start", "id": sid, "voice": voice, "format": "linear16",
                         "sampleRate": TTS_SAMPLE_RATE, "text": text})
        err = None
        try:
            params = {"model": voice, "encoding": "linear16", "sample_rate": TTS_SAMPLE_RATE, "container": "none"}
            headers = {"Authorization": f"Token {self.key}", "Content-Type": "application/json"}
            async with self.http.stream("POST", DG_SPEAK_URL, params=params, headers=headers, json={"text": text}) as r:
                if r.status_code != 200:
                    body = (await r.aread())[:200]
                    err = f"tts http {r.status_code}"
                    log.warning("deepgram speak %s: %s", r.status_code, body)
                else:
                    carry = b""
                    async for chunk in r.aiter_bytes():
                        chunk = carry + chunk
                        cut = len(chunk) - (len(chunk) % 2)  # keep PCM16 frames whole
                        carry = chunk[cut:]
                        if cut:
                            await self.send_audio(chunk[:cut])
        except asyncio.CancelledError:
            err = "barge"
            raise
        except Exception as e:
            err = f"tts failed: {e.__class__.__name__}"
        finally:
            if self.tts_active == sid:
                self.tts_active = None
            msg: dict = {"type": "tts_end", "id": sid}
            if err:
                msg["error" if err != "barge" else "reason"] = err
            await self.send(msg)

    async def close(self) -> None:
        self.closed = True
        self.cancel_pause()
        if self.commit_task:
            self.commit_task.cancel()
        if self.turn_task and not self.turn_task.done():
            self.turn_task.cancel()
        if self.tts_task and not self.tts_task.done():
            self.tts_task.cancel()
        await self.close_stt()
        if self.http is not None:
            try:
                await self.http.aclose()
            except Exception:
                pass


@router.websocket("/ws/voice")
async def voice_ws(ws: WebSocket) -> None:
    await ws.accept()
    conn = VoiceConn(ws)
    try:
        while not conn.closed:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            if msg.get("bytes") is not None:
                await conn.on_audio(msg["bytes"])
            elif msg.get("text") is not None:
                try:
                    data = json.loads(msg["text"])
                    assert isinstance(data, dict)
                except Exception:
                    await conn.send({"type": "error", "message": "bad json"})
                    continue
                await conn.on_control(data)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        await conn.close()
