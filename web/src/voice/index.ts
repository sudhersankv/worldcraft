/**
 * CURIOSITYCRAFT voice: hands-free NPC conversation with live transcript, auto turn-taking and barge-in.
 *
 *   realtime: mic -> AudioWorklet PCM16 16 kHz -> /ws/voice (Deepgram Nova-3 STT, npc_turn, Aura-2 TTS) -> PcmPlayer
 *   browser : Web Speech SpeechRecognition + api.npcReply + speechSynthesis
 *   text    : typed turns only (+ speech if available)
 *
 * The exported API is FIXED (game + site code against it). Protocol: docs/VOICE_PROTOCOL.md.
 * PRIVACY: no audio is stored anywhere - not here, not on the server.
 */
import type { NpcReplyResponse, VoiceContext, VoiceEvents, VoiceMode } from '../shared/contracts';
import { api } from '../shared/api';
import { Mic, PcmPlayer, cancelBrowserSpeech, micSupported, speakBrowser, speechRecCtor, type SpeechRec } from './audio';

export { micSupported } from './audio';
export { LiveTranscript } from './transcript';

type State = Parameters<VoiceEvents['state']>[0];
type Turn = { role: 'child' | 'npc'; text: string };

const BARGE_RMS = 0.06;          // local VAD threshold while the NPC talks
const BARGE_FRAMES = 4;          // x 40 ms frames = ~160 ms of speech
const BARGE_GRACE_MS = 350;      // ignore VAD right after playback starts (echo-canceller settling)
const HISTORY = 16;              // 8 turns

let cfgPromise: Promise<{ stt: boolean; tts: boolean }> | null = null;
function serverVoiceConfig(): Promise<{ stt: boolean; tts: boolean }> {
  cfgPromise ??= Promise.race([
    api.config().then((c) => ({ stt: !!c.stt, tts: !!c.tts })),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
  ]).catch(() => { cfgPromise = null; return { stt: false, tts: false }; });
  return cfgPromise;
}

export async function detectVoiceMode(): Promise<VoiceMode> {
  const c = await serverVoiceConfig();
  if (c.stt && c.tts && micSupported()) return 'realtime';
  if (speechRecCtor()) return 'browser';
  return 'text';
}

function wsUrl(): string { return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/voice`; }
function isMicDenied(e: unknown): boolean {
  const n = (e as { name?: string })?.name;
  return n === 'NotAllowedError' || n === 'SecurityError' || n === 'NotFoundError';
}
const MIC_DENIED_MSG = "I can't hear you - the microphone is off. You can type instead!";

interface PendingSpeak { text: string; voice: string; resolve: () => void }

export class VoiceSession {
  mode: VoiceMode = 'text';
  private ctx: VoiceContext | null = null;
  private history: Turn[] = [];
  private st: State = 'idle';
  private muted = false;
  private active = false;
  // realtime
  private ws: WebSocket | null = null;
  private mic: Mic | null = null;
  private player = new PcmPlayer();
  private ready = { stt: false, tts: false };
  private ttsId: string | null = null;
  private speaks = new Map<string, PendingSpeak>();
  private replyWaiters: ((r: NpcReplyResponse | null) => void)[] = [];
  private loud = 0;
  // smooth level meter (rAF, attack/release envelope)
  private levelTarget = 0;
  private levelNow = 0;
  private raf = 0;
  // browser
  private rec: SpeechRec | null = null;
  private recWanted = false;
  private recFinal = '';
  private recTimer: ReturnType<typeof setTimeout> | null = null;
  private htmlAudio: HTMLAudioElement | null = null;
  private localSpeaking = 0;

  constructor(private on: Partial<VoiceEvents> = {}) {}

  private setState(s: State): void { if (s !== this.st) { this.st = s; this.on.state?.(s); } }
  private err(msg: string): void { this.on.error?.(msg); }
  private remember(role: Turn['role'], text: string): void { this.history.push({ role, text }); if (this.history.length > HISTORY) this.history.splice(0, this.history.length - HISTORY); }
  private idleState(): State { return this.active && this.mode !== 'text' && !this.muted ? 'listening' : 'idle'; }

  /** Begin a hands-free conversation (mic opens, live transcript, auto turn-taking, barge-in). */
  async start(ctx: VoiceContext): Promise<void> {
    if (this.active) this.stop();
    this.ctx = { ...ctx };
    this.history = [];
    this.active = true;
    this.player.unlock(); // we're (usually) inside a user gesture: unlock autoplay now
    this.setState('connecting');
    let mode = await detectVoiceMode();
    if (!this.active) return;
    if (mode === 'realtime') {
      try { await this.startRealtime(); this.mode = 'realtime'; this.setState('listening'); return; } catch (e) {
        this.teardownRealtime();
        if (!this.active) return;
        if (isMicDenied(e)) { this.mode = 'text'; this.err(MIC_DENIED_MSG); this.setState('idle'); return; }
        mode = speechRecCtor() ? 'browser' : 'text';
      }
    }
    if (mode === 'browser') {
      try { this.startBrowser(); this.mode = 'browser'; this.setState('listening'); return; } catch { /* fall through */ }
    }
    this.mode = 'text';
    this.setState('idle');
  }

  /** Update what NPC / question is active without reconnecting. */
  setContext(ctx: Partial<VoiceContext>): void {
    if (!this.ctx) return;
    if (ctx.npcId && ctx.npcId !== this.ctx.npcId) this.history = [];
    this.ctx = { ...this.ctx, ...ctx };
    this.send({ type: 'context', ...ctx });
  }

  /** Push-to-talk (controller West button / V key). In hands-free mode these just force a turn boundary. */
  holdStart(): void {
    if (!this.active) return;
    if (this.st === 'speaking') this.barge();
    if (this.mode === 'browser') { this.cancelSpeech(); this.recWanted = true; this.recStart(); }
    this.setState('listening');
  }
  holdEnd(): void {
    if (!this.active) return;
    if (this.mode === 'realtime') this.send({ type: 'commit' });
    else if (this.mode === 'browser') { try { this.rec?.stop(); } catch { /* */ } this.flushRec(250); }
  }

  /** Mute the mic without ending the session. */
  mute(m: boolean): void {
    this.muted = m;
    if (this.mode === 'browser') { this.recWanted = !m; if (m) { try { this.rec?.abort(); } catch { /* */ } } else this.recStart(); }
    if (m) this.levelTarget = 0;
    if (this.st === 'listening' || this.st === 'idle') this.setState(this.idleState());
  }

  /** Typed fallback: runs the same NPC turn as speech would. */
  async sendText(text: string): Promise<NpcReplyResponse | null> {
    text = text.trim();
    if (!this.ctx || !text) return null;
    if (this.mode === 'realtime' && this.ws?.readyState === WebSocket.OPEN) {
      const p = new Promise<NpcReplyResponse | null>((res) => {
        this.replyWaiters.push(res);
        setTimeout(() => { const i = this.replyWaiters.indexOf(res); if (i >= 0) { this.replyWaiters.splice(i, 1); res(null); } }, 25000);
      });
      this.send({ type: 'text', text });
      return p;
    }
    return this.localTurn(text);
  }

  /** Speak a scripted line in an NPC voice (Aura-2 when available, else speechSynthesis). Resolves when done. */
  async speak(text: string, voice: string): Promise<void> {
    if (!text.trim()) return;
    if (this.mode === 'realtime' && this.ready.tts && this.ws?.readyState === WebSocket.OPEN) {
      const id = Math.random().toString(36).slice(2, 10);
      return new Promise<void>((resolve) => { this.speaks.set(id, { text, voice, resolve }); this.send({ type: 'speak', text, voice, id }); });
    }
    return this.speakLocal(text, voice);
  }

  cancelSpeech(): void {
    if (this.player.playing || this.ttsId) this.barge();
    this.htmlAudio?.pause(); this.htmlAudio = null;
    cancelBrowserSpeech();
    for (const [, s] of this.speaks) s.resolve();
    this.speaks.clear();
  }

  /** End the conversation and release the mic. */
  stop(): void {
    this.active = false;
    this.cancelSpeech();
    this.teardownRealtime();
    this.stopBrowser();
    for (const w of this.replyWaiters) w(null);
    this.replyWaiters = [];
    this.stopLevelLoop();
    this.setState('idle');
  }
  destroy(): void { this.stop(); this.player.close(); }

  // ================================================================ realtime
  private send(m: object): void { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }

  private async startRealtime(): Promise<void> {
    const mic = new Mic();
    this.mic = mic;
    await mic.open(); // throws NotAllowedError when denied
    const ws = new WebSocket(wsUrl());
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    await new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new Error('voice socket timeout')), 6000);
      ws.onopen = () => { clearTimeout(t); res(); };
      ws.onerror = () => { clearTimeout(t); rej(new Error('voice socket failed')); };
    });
    const c = this.ctx!;
    const ready = await new Promise<{ stt: boolean; tts: boolean }>((res, rej) => {
      const t = setTimeout(() => rej(new Error('voice server not ready')), 9000);
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string') return;
        const m = JSON.parse(e.data);
        if (m.type === 'ready') { clearTimeout(t); res({ stt: !!m.stt, tts: !!m.tts }); }
      };
      ws.send(JSON.stringify({ type: 'start', worldId: c.worldId, npcId: c.npcId, sessionId: c.sessionId, questionId: c.questionId, mode: c.mode, objectiveId: c.objectiveId, sampleRate: 16000 }));
    });
    if (!ready.stt) throw new Error('server speech-to-text unavailable');
    this.ready = ready;
    ws.onmessage = (e) => this.onWs(e.data);
    ws.onclose = () => {
      if (this.ws !== ws || !this.active) return;
      // connection lost mid-conversation: silently degrade
      this.teardownRealtime();
      this.mode = speechRecCtor() ? 'browser' : 'text';
      this.err('Voice connection lost - switching to backup voice.');
      if (this.mode === 'browser') { try { this.startBrowser(); } catch { this.mode = 'text'; } }
      this.setState(this.idleState());
    };
    mic.onFrame = (pcm, rms) => this.onMicFrame(pcm, rms);
    this.startLevelLoop();
  }

  /** Emits `level` once per animation frame with a fast-attack / slow-release envelope: smooth waveform. */
  private startLevelLoop(): void {
    if (this.raf || typeof requestAnimationFrame === 'undefined') return;
    const tick = () => {
      const k = this.levelTarget > this.levelNow ? 0.45 : 0.12;
      this.levelNow += (this.levelTarget - this.levelNow) * k;
      this.levelTarget *= 0.92; // decay between 40 ms mic frames so it never sticks
      this.on.level?.(this.levelNow < 0.002 ? 0 : this.levelNow);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  private stopLevelLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0; this.levelTarget = 0; this.levelNow = 0;
    this.on.level?.(0);
  }

  private onMicFrame(pcm: ArrayBuffer, rms: number): void {
    if (this.muted) return;
    this.levelTarget = Math.max(this.levelTarget, Math.min(1, Math.sqrt(rms) * 1.6)); // perceptual curve
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(pcm);
    // local VAD barge-in: faster than waiting for server words
    if (this.st === 'speaking' && performance.now() - this.player.startedAt > BARGE_GRACE_MS) {
      this.loud = rms > BARGE_RMS ? this.loud + 1 : 0;
      if (this.loud >= BARGE_FRAMES) { this.loud = 0; this.barge(); }
    } else this.loud = 0;
  }

  private onWs(data: unknown): void {
    if (data instanceof ArrayBuffer) { if (this.ttsId) this.player.push(data); return; }
    if (typeof data !== 'string') return;
    let m: Record<string, any>;
    try { m = JSON.parse(data); } catch { return; }
    switch (m.type) {
      case 'interim':
        if (this.st === 'speaking') this.barge();
        if (this.st !== 'thinking') this.setState('listening');
        this.on.interim?.(m.text);
        break;
      case 'final':
        this.remember('child', m.text);
        this.on.final?.(m.text);
        break;
      case 'thinking':
        this.setState('thinking');
        break;
      case 'reply': {
        const { type: _t, voice, ...r } = m;
        const resp = r as NpcReplyResponse;
        if (resp.reply) this.remember('npc', resp.reply);
        this.on.reply?.(resp);
        this.replyWaiters.shift()?.(resp);
        if (!this.ready.tts && resp.reply) void this.speakLocal(resp.reply, voice ?? this.ctx?.npcId ?? 'npc');
        else if (!resp.reply) this.setState(this.idleState());
        break;
      }
      case 'tts_start': {
        const id = String(m.id);
        this.ttsId = id;
        this.setState('speaking');
        this.player.begin(Number(m.sampleRate) || 24000, () => {
          this.speaks.get(id)?.resolve(); this.speaks.delete(id);
          if (this.ttsId === id) { this.ttsId = null; if (this.st === 'speaking') this.setState(this.idleState()); }
        });
        break;
      }
      case 'tts_end': {
        const id = String(m.id);
        const sp = this.speaks.get(id);
        if (m.error && sp && this.ttsId !== id) { this.speaks.delete(id); void this.speakLocal(sp.text, sp.voice).then(sp.resolve); break; }
        if (this.ttsId === id) this.player.end();
        else if (sp) { this.speaks.delete(id); sp.resolve(); }
        break;
      }
      case 'error':
        this.err(String(m.message ?? 'voice error'));
        break;
    }
  }

  /** Kid talked over the NPC: cut audio now, tell the server to stop streaming. */
  private barge(): void {
    this.ttsId = null;
    this.player.stop();
    this.send({ type: 'barge' });
    if (this.st === 'speaking') this.setState(this.idleState());
  }

  private teardownRealtime(): void {
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null; ws.onmessage = null;
      try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' })); ws.close(); } catch { /* */ }
    }
    this.mic?.close(); this.mic = null;
    this.stopLevelLoop();
    this.player.stop();
    this.ttsId = null;
    this.ready = { stt: false, tts: false };
  }

  // ================================================================ browser / text
  private async localTurn(text: string): Promise<NpcReplyResponse | null> {
    const c = this.ctx;
    if (!c) return null;
    this.on.final?.(text);
    this.setState('thinking');
    let r: NpcReplyResponse;
    try {
      r = await api.npcReply({ worldId: c.worldId, npcId: c.npcId, sessionId: c.sessionId, questionId: c.questionId,
        mode: c.mode, objectiveId: c.objectiveId, utterance: text, history: this.history.slice() });
    } catch {
      this.err('The character could not answer right now. Try again!');
      this.setState(this.idleState());
      return null;
    }
    this.remember('child', text);
    if (r.reply) this.remember('npc', r.reply);
    this.on.reply?.(r);
    if (r.reply && this.active) void this.speakLocal(r.reply, c.npcId);
    else this.setState(this.idleState());
    return r;
  }

  private async speakLocal(text: string, voice: string): Promise<void> {
    this.localSpeaking++;
    this.setState('speaking');
    const pauseRec = this.mode === 'browser' && this.recWanted;
    if (pauseRec) { this.recWanted = false; try { this.rec?.abort(); } catch { /* */ } } // don't transcribe our own voice
    try {
      const cfg = await serverVoiceConfig();
      if (cfg.tts && /^aura/.test(voice)) {
        const ok = await new Promise<boolean>((res) => {
          const a = new Audio(api.ttsUrl(text, voice));
          this.htmlAudio = a;
          a.onended = () => res(true); a.onerror = () => res(false); a.onpause = () => res(true);
          a.play().catch(() => res(false));
        });
        this.htmlAudio = null;
        if (!ok) await speakBrowser(text, voice);
      } else await speakBrowser(text, voice);
    } finally {
      this.localSpeaking--;
      if (pauseRec && this.active && this.mode === 'browser' && !this.muted) { this.recWanted = true; this.recStart(); }
      if (!this.localSpeaking && this.st === 'speaking') this.setState(this.idleState());
    }
  }

  private startBrowser(): void {
    const Ctor = speechRecCtor();
    if (!Ctor) throw new Error('no speech recognition');
    const rec = new Ctor();
    rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.recFinal += ' ' + r[0].transcript; else interim += r[0].transcript;
      }
      const running = (this.recFinal + ' ' + interim).trim();
      if (running) { if (this.localSpeaking) this.cancelSpeech(); this.on.interim?.(running); }
      if (interim.trim()) { if (this.recTimer) { clearTimeout(this.recTimer); this.recTimer = null; } } // still talking
      else if (this.recFinal.trim()) this.flushRec(this.ctx?.mode === 'explain' ? 1500 : 500);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.stopBrowser(); this.mode = 'text'; this.err(MIC_DENIED_MSG); this.setState('idle');
      }
    };
    rec.onend = () => { if (this.recWanted && this.rec === rec) setTimeout(() => this.recStart(), 150); };
    this.rec = rec;
    this.recWanted = !this.muted;
    this.recStart();
  }

  private recStart(): void { if (this.rec && this.recWanted) { try { this.rec.start(); } catch { /* already running */ } } }

  private flushRec(delay: number): void {
    if (this.recTimer) clearTimeout(this.recTimer);
    this.recTimer = setTimeout(() => {
      this.recTimer = null;
      const text = this.recFinal.trim();
      this.recFinal = '';
      if (text.replace(/[^a-z0-9]/gi, '').length >= 2) void this.localTurn(text);
    }, delay);
  }

  private stopBrowser(): void {
    this.recWanted = false;
    if (this.recTimer) clearTimeout(this.recTimer);
    this.recTimer = null; this.recFinal = '';
    const rec = this.rec; this.rec = null;
    if (rec) { rec.onend = null; rec.onresult = null; rec.onerror = null; try { rec.abort(); } catch { /* */ } }
  }
}
