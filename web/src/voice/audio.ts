/**
 * Low-level audio for the voice loop: mic capture (AudioWorklet -> PCM16 16 kHz) and
 * progressive playback of streamed PCM16 TTS.
 *
 * PRIVACY: no audio is stored anywhere. Mic frames go straight to the voice socket and are
 * dropped; TTS chunks are played and dropped. Nothing is written to disk, storage or logs.
 */

export const MIC_RATE = 16000;
export const FRAME_SAMPLES = 640; // 40 ms @ 16 kHz

/** Worklet: box-filter decimation (any input rate -> 16 kHz) + PCM16 framing + RMS. Inlined so Vite needs no config. */
const WORKLET_SRC = `
class WcMic extends AudioWorkletProcessor {
  constructor(o) {
    super();
    const p = o.processorOptions || {};
    this.ratio = sampleRate / (p.targetRate || 16000);
    this.n = p.frameSamples || 640;
    this.out = new Int16Array(this.n);
    this.i = 0; this.acc = 0; this.cnt = 0; this.pos = 0; this.sq = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let k = 0; k < ch.length; k++) {
      this.acc += ch[k]; this.cnt++; this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        let v = this.acc / this.cnt; this.acc = 0; this.cnt = 0;
        if (v > 1) v = 1; else if (v < -1) v = -1;
        this.sq += v * v;
        this.out[this.i++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        if (this.i === this.n) {
          const buf = this.out.buffer.slice(0);
          this.port.postMessage({ pcm: buf, rms: Math.sqrt(this.sq / this.n) }, [buf]);
          this.i = 0; this.sq = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('wc-mic', WcMic);
`;

let workletUrl: string | null = null;
function getWorkletUrl(): string {
  if (!workletUrl) workletUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
  return workletUrl;
}

export function micSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
    && typeof AudioWorkletNode !== 'undefined' && typeof WebSocket !== 'undefined';
}

export class Mic {
  onFrame: (pcm: ArrayBuffer, rms: number) => void = () => {};
  private ac: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;

  /** Throws DOMException NotAllowedError if the user denies the mic. */
  async open(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    try {
      this.ac = new AudioContext();
      await this.ac.audioWorklet.addModule(getWorkletUrl());
      const src = this.ac.createMediaStreamSource(this.stream);
      this.node = new AudioWorkletNode(this.ac, 'wc-mic', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
        processorOptions: { targetRate: MIC_RATE, frameSamples: FRAME_SAMPLES },
      });
      this.node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => this.onFrame(e.data.pcm, e.data.rms);
      const sink = this.ac.createGain();
      sink.gain.value = 0; // keep the graph pulled without echoing the mic
      src.connect(this.node).connect(sink).connect(this.ac.destination);
      if (this.ac.state === 'suspended') await this.ac.resume().catch(() => {});
    } catch (e) {
      this.close();
      throw e;
    }
  }

  close(): void {
    this.node?.port.close();
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ac?.close().catch(() => {});
    this.node = null; this.stream = null; this.ac = null;
  }
}

/** Schedules streamed PCM16 chunks back-to-back on a WebAudio clock. Lowest first-audio latency, works everywhere. */
export class PcmPlayer {
  private ac: AudioContext | null = null;
  private rate = 24000;
  private nextTime = 0;
  private live = new Set<AudioBufferSourceNode>();
  private ended = true;
  private carry: Uint8Array | null = null;
  private done: (() => void) | null = null;
  startedAt = 0;

  private ctx(): AudioContext {
    if (!this.ac || this.ac.state === 'closed') this.ac = new AudioContext();
    if (this.ac.state === 'suspended') void this.ac.resume().catch(() => {});
    return this.ac;
  }
  /** Call from a user gesture once, so autoplay policies allow later playback. */
  unlock(): void { this.ctx(); }

  get playing(): boolean { return !this.ended || this.live.size > 0; }

  /** Begin a new stream. `onDone` fires once when it finished or was stopped. */
  begin(sampleRate: number, onDone: () => void): void {
    this.stop();
    this.rate = sampleRate;
    this.ended = false;
    this.nextTime = 0;
    this.carry = null;
    this.done = onDone;
    this.startedAt = performance.now();
  }

  push(chunk: ArrayBuffer): void {
    if (this.ended) return;
    let bytes = new Uint8Array(chunk);
    if (this.carry) { const m = new Uint8Array(this.carry.length + bytes.length); m.set(this.carry); m.set(bytes, this.carry.length); bytes = m; this.carry = null; }
    if (bytes.length % 2) { this.carry = bytes.slice(bytes.length - 1); bytes = bytes.subarray(0, bytes.length - 1); }
    const n = bytes.length / 2;
    if (!n) return;
    const ac = this.ctx();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    const buf = ac.createBuffer(1, n, this.rate);
    const f = buf.getChannelData(0);
    for (let i = 0; i < n; i++) f[i] = view.getInt16(i * 2, true) / 0x8000;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(ac.destination);
    const now = ac.currentTime;
    if (this.nextTime < now + 0.02) this.nextTime = now + 0.04; // first chunk / underrun: small jitter lead
    src.start(this.nextTime);
    this.nextTime += buf.duration;
    this.live.add(src);
    src.onended = () => { this.live.delete(src); this.maybeDone(); };
  }

  /** Server finished sending; resolve once the queued audio has played. */
  end(): void { this.ended = true; this.maybeDone(); }

  /** Stop immediately (barge-in / cancel). */
  stop(): void {
    this.ended = true;
    for (const s of this.live) { s.onended = null; try { s.stop(); } catch { /* */ } }
    this.live.clear();
    this.maybeDone();
  }

  private maybeDone(): void {
    if (this.ended && this.live.size === 0 && this.done) { const d = this.done; this.done = null; d(); }
  }

  close(): void { this.stop(); void this.ac?.close().catch(() => {}); this.ac = null; }
}

// ------------------------------------------------------------------ browser speechSynthesis fallback
function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

async function voices(): Promise<SpeechSynthesisVoice[]> {
  const ss = window.speechSynthesis;
  let v = ss.getVoices();
  if (v.length) return v;
  await new Promise<void>((r) => { const t = setTimeout(r, 600); ss.addEventListener('voiceschanged', () => { clearTimeout(t); r(); }, { once: true }); });
  return ss.getVoices();
}

let currentUtter: { cancel: () => void } | null = null;

/** Speak with the browser's voices; pitch/rate/voice vary by a hash of the voice name so NPCs sound distinct. */
export async function speakBrowser(text: string, voiceName: string): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis || !text.trim()) return;
  const ss = window.speechSynthesis;
  ss.cancel();
  const all = await voices();
  const en = all.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const pool = en.length ? en : all;
  const h = hash(voiceName || 'npc');
  const u = new SpeechSynthesisUtterance(text);
  if (pool.length) u.voice = pool[h % pool.length];
  u.pitch = 0.85 + ((h >>> 8) % 6) * 0.08;   // 0.85..1.25
  u.rate = 0.95 + ((h >>> 16) % 4) * 0.04;   // 0.95..1.07 (kid-friendly pace)
  await new Promise<void>((resolve) => {
    let fin = false;
    const end = () => { if (!fin) { fin = true; clearTimeout(t); currentUtter = null; resolve(); } };
    const t = setTimeout(end, 2000 + text.length * 110); // Chrome sometimes never fires onend
    u.onend = end; u.onerror = end;
    currentUtter = { cancel: () => { ss.cancel(); end(); } };
    ss.speak(u);
  });
}
export function cancelBrowserSpeech(): void { currentUtter?.cancel(); if (typeof window !== 'undefined') window.speechSynthesis?.cancel(); }

// ------------------------------------------------------------------ Web Speech recognition (typed loosely: not in TS DOM lib)
export interface SpeechRec {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
export function speechRecCtor(): (new () => SpeechRec) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
