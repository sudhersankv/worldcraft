"""Voice WebSocket tests (no Deepgram key: text turns only)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import voice


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(voice, "deepgram_key", lambda: None)
    app = FastAPI()
    app.include_router(voice.router)
    return TestClient(app)


def test_meaningful():
    assert not voice.meaningful("")
    assert not voice.meaningful("um")
    assert not voice.meaningful("Uh, hmm.")
    assert not voice.meaningful("a")
    assert voice.meaningful("sunlight")
    assert voice.meaningful("um water")


def test_text_turn_with_mocked_npc(client, monkeypatch):
    seen = {}

    async def fake_npc(req):
        seen.setdefault("reqs", []).append(req)
        return {"reply": f"You said {req['utterance']}!", "source": "llm",
                "verdict": {"intent": "answer", "correct": True, "power": 0.9, "feedback": "Yes", "source": "jev"}}

    monkeypatch.setattr(voice, "call_npc", fake_npc)
    with client.websocket_connect("/ws/voice") as ws:
        ws.send_json({"type": "start", "worldId": "w1", "npcId": "sunny", "questionId": "q1", "sampleRate": 16000})
        assert ws.receive_json() == {"type": "ready", "stt": False, "tts": False}
        ws.send_bytes(b"\x00\x00" * 320)  # audio without STT is ignored, not an error
        ws.send_json({"type": "text", "text": "sunlight"})
        assert ws.receive_json() == {"type": "final", "text": "sunlight"}
        assert ws.receive_json() == {"type": "thinking"}
        r = ws.receive_json()
        assert r["type"] == "reply" and r["reply"] == "You said sunlight!"
        assert r["verdict"]["correct"] is True and r["voice"].startswith("aura")
        # second turn carries history
        ws.send_json({"type": "text", "text": "and water"})
        for _ in range(3):
            r = ws.receive_json()
        assert r["type"] == "reply"
        hist = seen["reqs"][1]["history"]
        assert hist == [{"role": "child", "text": "sunlight"}, {"role": "npc", "text": "You said sunlight!"}]
        assert seen["reqs"][1]["questionId"] == "q1"
        # speak without TTS -> immediate tts_end with error so the client falls back
        ws.send_json({"type": "speak", "text": "Hello!", "voice": "aura-2-thalia-en", "id": "s1"})
        r = ws.receive_json()
        assert r["type"] == "tts_end" and r["id"] == "s1" and r.get("error")
        ws.send_json({"type": "stop"})


def test_context_switch_clears_history_and_bad_json(client, monkeypatch):
    reqs = []

    async def fake_npc(req):
        reqs.append(req)
        return {"reply": "ok", "source": "local"}

    monkeypatch.setattr(voice, "call_npc", fake_npc)
    with client.websocket_connect("/ws/voice") as ws:
        ws.send_json({"type": "start", "worldId": "w1", "npcId": "a"})
        ws.receive_json()
        ws.send_json({"type": "text", "text": "hello there"})
        for _ in range(3):
            ws.receive_json()
        ws.send_json({"type": "context", "npcId": "b"})
        ws.send_text("not json")
        assert ws.receive_json()["type"] == "error"
        ws.send_json({"type": "text", "text": "hi again"})
        for _ in range(3):
            ws.receive_json()
        assert reqs[1]["npcId"] == "b" and reqs[1]["history"] == []


def test_npc_fallback_when_services_missing(client):
    # real call_npc: services may not exist / may fail -> graceful local reply, never a crash
    with client.websocket_connect("/ws/voice") as ws:
        ws.send_json({"type": "start", "worldId": "nope", "npcId": "nobody"})
        ws.receive_json()
        ws.send_json({"type": "text", "text": "what is a leaf"})
        assert ws.receive_json()["type"] == "final"
        assert ws.receive_json()["type"] == "thinking"
        r = ws.receive_json()
        assert r["type"] == "reply" and isinstance(r["reply"], str) and r["reply"]


class FakeDG:
    """Stands in for the Deepgram live socket: test pushes Deepgram JSON messages in."""
    def __init__(self):
        import asyncio
        self.q = asyncio.Queue()
        self.sent = []

    async def send(self, m):
        self.sent.append(m)
        if isinstance(m, str) and '"Finalize"' in m:
            await self.q.put('{"type":"Results","is_final":true,"from_finalize":true,"channel":{"alternatives":[{"transcript":"three"}]}}')

    async def close(self):
        await self.q.put(None)

    def __aiter__(self):
        return self

    async def __anext__(self):
        m = await self.q.get()
        if m is None:
            raise StopAsyncIteration
        return m


def _res(text, is_final=False, speech_final=False):
    import json
    return json.dumps({"type": "Results", "is_final": is_final, "speech_final": speech_final,
                       "channel": {"alternatives": [{"transcript": text}]}})


def test_stt_flow_interim_final_reply_tts_and_barge(monkeypatch):
    import asyncio
    dg = FakeDG()

    async def fake_connect(url, key):
        assert "model=nova-3" in url and key == "k"
        return dg

    async def fake_npc(req):
        return {"reply": "Great job!", "source": "llm"}

    async def fake_tts(self, text, voice, sid):
        self.tts_active = sid
        await self.send({"type": "tts_start", "id": sid, "voice": voice, "format": "linear16", "sampleRate": 24000})
        try:
            await self.send_audio(b"\x01\x00" * 100)
            await asyncio.sleep(30)  # "long" speech, waits for barge-in
        finally:
            self.tts_active = None
            await self.send({"type": "tts_end", "id": sid})

    monkeypatch.setattr(voice, "deepgram_key", lambda: "k")
    monkeypatch.setattr(voice, "dg_connect", fake_connect)
    monkeypatch.setattr(voice, "call_npc", fake_npc)
    monkeypatch.setattr(voice.VoiceConn, "tts", fake_tts)
    app = FastAPI()
    app.include_router(voice.router)
    with TestClient(app).websocket_connect("/ws/voice") as ws:
        ws.send_json({"type": "start", "worldId": "w", "npcId": "n"})
        assert ws.receive_json() == {"type": "ready", "stt": True, "tts": True}
        ws.send_bytes(b"\x00\x00" * 320)
        put = dg.q.put_nowait
        put(_res("um"))  # filler: no interim
        put(_res("plants need"))
        assert ws.receive_json() == {"type": "interim", "text": "plants need"}
        put(_res("plants need sunlight", is_final=True))
        assert ws.receive_json() == {"type": "interim", "text": "plants need sunlight"}
        put(_res("", is_final=True, speech_final=True))
        assert ws.receive_json() == {"type": "final", "text": "plants need sunlight"}
        assert ws.receive_json() == {"type": "thinking"}
        assert ws.receive_json()["reply"] == "Great job!"
        st = ws.receive_json()
        assert st["type"] == "tts_start"
        assert ws.receive_bytes() == b"\x01\x00" * 100
        put(_res("wait what"))  # kid talks over the NPC -> barge-in
        msgs = [ws.receive_json(), ws.receive_json()]
        assert {"type": "tts_end", "id": st["id"]} in msgs
        assert {"type": "interim", "text": "wait what"} in msgs
        # push-to-talk commit: Finalize -> from_finalize result -> flush
        ws.send_json({"type": "commit"})
        assert ws.receive_json() == {"type": "interim", "text": "three"}
        assert ws.receive_json() == {"type": "final", "text": "three"}
        ws.send_json({"type": "stop"})
        assert ws.receive_json()["type"] == "thinking"
    assert any('"CloseStream"' in m for m in dg.sent if isinstance(m, str))


def test_explain_mode_waits_past_short_pauses(monkeypatch):
    dg = FakeDG()
    reqs = []

    async def fake_connect(url, key):
        return dg

    async def fake_npc(req):
        reqs.append(req)
        return {"reply": "Nice explaining!", "source": "llm",
                "explain": {"covered": ["light"], "missing": [], "passed": True}}

    monkeypatch.setattr(voice, "deepgram_key", lambda: "k")
    monkeypatch.setattr(voice, "dg_connect", fake_connect)
    monkeypatch.setattr(voice, "call_npc", fake_npc)
    monkeypatch.setattr(voice, "EXPLAIN_EXTRA_PAUSE_S", 0.05)

    async def no_tts(self, text, voice_, sid):
        return None
    monkeypatch.setattr(voice.VoiceConn, "tts", no_tts)
    app = FastAPI()
    app.include_router(voice.router)
    with TestClient(app).websocket_connect("/ws/voice") as ws:
        ws.send_json({"type": "start", "worldId": "w", "npcId": "n", "mode": "explain", "objectiveId": "obj-1"})
        ws.receive_json()
        put = dg.q.put_nowait
        put(_res("plants use light", is_final=True, speech_final=True))  # short pause: NOT the end
        assert ws.receive_json() == {"type": "interim", "text": "plants use light"}
        put(_res("to make sugar", is_final=True, speech_final=True))
        assert ws.receive_json() == {"type": "interim", "text": "plants use light to make sugar"}
        put('{"type":"UtteranceEnd","last_word_end":2.0}')
        assert ws.receive_json() == {"type": "final", "text": "plants use light to make sugar"}
        assert ws.receive_json() == {"type": "thinking"}
        r = ws.receive_json()
        assert r["explain"]["passed"] is True
    assert reqs[0]["mode"] == "explain" and reqs[0]["objectiveId"] == "obj-1"
