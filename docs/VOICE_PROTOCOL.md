# Voice protocol: `/ws/voice`

Server: `server/app/voice.py` (router, included by `main.py`). Client: `web/src/voice/` (`VoiceSession`).
Dev harness: `/voice-lab.html` (dev server only).

No audio is stored anywhere. Mic frames are relayed to Deepgram and dropped; TTS bytes are relayed to the browser and dropped. Only the text of the last 8 turns stays in memory, for the life of the socket.

## Pipeline

```
mic -> AudioWorklet (downsample to 16 kHz PCM16, 40 ms frames) -> WS binary
    -> Deepgram Nova-3 live (interim_results, endpointing=300, utterance_end_ms=1000, vad_events)
    -> interim / final -> services.npc_turn (LLM + Jev referee) -> reply
    -> Deepgram Aura-2 REST /v1/speak (linear16, 24 kHz, container=none), streamed chunk by chunk
    -> WS binary -> PcmPlayer (WebAudio buffers scheduled back to back)
```

## Client to server

| message | meaning |
|---|---|
| `{"type":"start", worldId, npcId, sessionId?, questionId?, mode?, objectiveId?, voice?, sampleRate:16000}` | Opens Deepgram STT and replies with `ready`. |
| `{"type":"context", ...partial}` | Updates worldId, npcId, questionId, mode, objectiveId or voice. Changing `npcId` clears the history. |
| `{"type":"text", text}` | Typed turn. Same flow as speech: `final`, `thinking`, `reply`, then TTS. |
| `{"type":"commit"}` | Push-to-talk release. Sends Deepgram `Finalize` and flushes the utterance (0.7 s grace, includes the last interim). |
| `{"type":"speak", text, voice, id?}` | TTS of a scripted line. `voice` must match `aura-…`; otherwise the NPC's voice is used. |
| `{"type":"barge"}` | Stop the current TTS stream now. |
| `{"type":"stop"}` | Close STT and cancel the turn and TTS. The socket stays open. |
| binary | Raw PCM16 LE mono 16 kHz mic audio, about 40 ms per frame. Dropped when STT is off. |

## Server to client

| message | meaning |
|---|---|
| `{"type":"ready", stt, tts}` | `stt:false` means there is no key or Deepgram is down. Text turns still work; the client uses browser STT/TTS. |
| `{"type":"interim", text}` | Running text of the current utterance (finals plus the current interim). Deduped, filler-only text is suppressed. |
| `{"type":"final", text}` | Utterance committed; a turn starts. |
| `{"type":"thinking"}` | npc_turn is running. |
| `{"type":"reply", ...NpcReplyResponse, voice}` | `reply`, `verdict?`, `goat?`, `explain?`, `source`, plus the Aura voice used. |
| `{"type":"tts_start", id, voice, format:"linear16", sampleRate:24000, text}` | Binary frames that follow are PCM16 LE mono audio for `id`. |
| binary | TTS audio chunks. Always an even byte length. |
| `{"type":"tts_end", id, error?, reason?}` | End of stream. `reason:"barge"` when interrupted. `error` (e.g. no key) means the client should speak locally. |
| `{"type":"error", message}` | Non-fatal error. |

## Turn-taking

- **End of utterance:** Deepgram `speech_final` (300 ms pause) or `UtteranceEnd` (1 s word gap), or a client `commit`. Empty, 1-character and filler-only ("um", "uh", "hmm") text is ignored. A newer utterance cancels an older in-flight turn.
- **Explain mode** (`mode:"explain"`): `speech_final` is ignored. The turn ends on `UtteranceEnd` plus 0.8 s more silence (about 1.8 s total). New words cancel the pending end, so long explanations are not cut off mid-thought.
- **Barge-in:**
  - Server side: any interim with real words while TTS is streaming cancels the stream and sends `tts_end{reason:"barge"}`.
  - Client side: local VAD (RMS > 0.06 for about 160 ms, starting 350 ms after playback begins), or a server `interim` during playback, stops playback immediately and sends `barge`.
- **Keepalive:** `{"type":"KeepAlive"}` goes to Deepgram after 4 s without audio (mute, NPC speaking). Shutdown sends `CloseStream`. If Deepgram drops, the server reconnects lazily on the next audio frame.

## History

The last 8 turns (child and npc) are kept per connection and passed to `npc_turn` as `history`, along with `questionId`, `mode` and `objectiveId`.

## Client modes (`detectVoiceMode`)

- `realtime`: `/api/config` reports both `stt` and `tts`, and getUserMedia, AudioWorklet and WebSocket exist.
- `browser`: Web Speech `SpeechRecognition` (continuous, interim results) feeds `api.npcReply`, and replies are spoken with `speechSynthesis`. The voice, pitch and rate are picked from a hash of the voice name. Recognition pauses while the NPC speaks.
- `text`: typed turns only.

`VoiceSession.start` falls back automatically: realtime, then browser, then text. If the mic is denied, the mode becomes `text` and an `error` event says "You can type instead".
