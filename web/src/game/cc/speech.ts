/** One voice at a time: Aura TTS only (en, es); never a browser/robot voice. Web Speech STT for hold-to-talk. */
import { SPEECH_LOCALE, type Lang } from '../../shared/curiosity';

let audio: HTMLAudioElement | null = null;
let token = 0;
export let muted = false;
export function setMuted(m: boolean) { muted = m; if (m) stopSpeech(); }

export function stopSpeech() {
  token++;
  if (audio) { try { audio.pause(); audio.src = ''; } catch { /* */ } audio = null; }
  try { speechSynthesis.cancel(); } catch { /* */ }
}

/**
 * Speaks `text`; calls onStart(durationMs) when audio actually starts (so captions can sync), resolves when done.
 * Never throws. Falls back to a silent timed caption.
 */
export function speak(text: string, lang: Lang, voice: string, onStart: (ms: number) => void): Promise<void> {
  stopSpeech();
  const my = ++token;
  const est = Math.max(1200, text.split(/\s+/).length * 340);
  if (muted || !text.trim()) { onStart(est); return new Promise((r) => setTimeout(r, est * 0.4)); }
  // NO robot/browser voice ever (user request): if Sam's real voice can't play, show silent captions instead.
  const browser = () => new Promise<void>((resolve) => {
    if (my !== token) return resolve();
    onStart(est); setTimeout(resolve, est);
  });
  // Real Aura voices exist for English and Spanish; other languages get captions only.
  const auraVoice = lang === 'en' ? voice : lang === 'es' ? 'aura-2-nestor-es' : null;
  if (!auraVoice) return browser();
  return new Promise<void>((resolve) => {
    const a = new Audio(`/api/tts?voice=${encodeURIComponent(auraVoice)}&text=${encodeURIComponent(text.slice(0, 600))}`);
    audio = a;
    let done = false;
    // Kill this <audio> for good so a late-arriving Aura stream can never overlap the fallback voice.
    const kill = () => { try { a.pause(); a.removeAttribute('src'); a.load(); } catch { /* */ } if (audio === a) audio = null; };
    const fail = () => { if (done || my !== token) { kill(); return; } done = true; kill(); void browser().then(resolve); };
    const timer = setTimeout(fail, 7000);
    a.addEventListener('playing', () => {
      clearTimeout(timer);
      if (my !== token || done) { kill(); return; }   // superseded or already fell back: stay silent
      try { speechSynthesis.cancel(); } catch { /* */ } // stop any filler line the moment Sam's real voice starts
      const d = isFinite(a.duration) && a.duration > 0 ? a.duration * 1000 : est; onStart(d);
    });
    a.addEventListener('ended', () => { if (!done) { done = true; resolve(); } });
    a.addEventListener('error', () => { clearTimeout(timer); fail(); });
    a.play().catch(() => { clearTimeout(timer); fail(); });
  });
}

// ------------------------------------------------------------------ speech to text
type Rec = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; abort(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onerror: ((e: unknown) => void) | null; onend: (() => void) | null };
const Ctor = (window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition;
export const sttSupported = !!Ctor;

export class Listener {
  private rec: Rec | null = null;
  private text = '';
  constructor(private lang: Lang, private onInterim: (t: string) => void, private onFinal: (t: string) => void, private onState: (s: 'idle' | 'listening' | 'error') => void) {}
  start() {
    if (!Ctor) { this.onState('error'); return; }
    stopSpeech();
    try {
      const r = new Ctor(); this.rec = r; this.text = '';
      r.lang = SPEECH_LOCALE[this.lang]; r.interimResults = true; r.continuous = true;
      r.onresult = (e) => {
        let s = '';
        for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
        this.text = s; this.onInterim(s);
      };
      r.onerror = () => this.onState('error');
      r.onend = () => { this.onState('idle'); const tx = this.text.trim(); this.text = ''; if (tx) this.onFinal(tx); this.rec = null; };
      r.start(); this.onState('listening');
    } catch { this.onState('error'); }
  }
  stop() { try { this.rec?.stop(); } catch { /* */ } }
}

/** Instant short line with the browser voice (no network) — used as a filler while the answer loads. */
export function speakQuick(_text: string, _lang: Lang) { /* disabled: no browser voice (user request) */ }

/** Hands-free: keeps listening, sends each finished sentence (on a pause). Paused while Sam talks. */
export class HandsFree {
  private rec: Rec | null = null;
  active = false;
  private paused = false;
  constructor(private lang: Lang, private onInterim: (t: string) => void, private onUtterance: (t: string) => void, private onState: (on: boolean) => void) {}
  start() { if (!Ctor) { this.onState(false); return; } this.active = true; this.paused = false; this.open(); this.onState(true); }
  stop() { this.active = false; try { this.rec?.abort(); } catch { /* */ } this.rec = null; this.onState(false); }
  pause() { this.paused = true; try { this.rec?.abort(); } catch { /* */ } this.rec = null; }
  resume() { if (!this.active) return; this.paused = false; if (!this.rec) this.open(); }
  private open() {
    if (!Ctor || !this.active || this.paused) return;
    try {
      const r = new Ctor(); this.rec = r;
      r.lang = SPEECH_LOCALE[this.lang]; r.interimResults = true; r.continuous = true;
      let sent = 0;
      r.onresult = (e) => {
        let interim = '';
        for (let i = sent; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) { sent = i + 1; const tx = res[0].transcript.trim(); if (tx) { this.onInterim(tx); this.onUtterance(tx); } }
          else interim += res[0].transcript;
        }
        if (interim) this.onInterim(interim);
      };
      r.onerror = () => undefined;
      r.onend = () => { this.rec = null; if (this.active && !this.paused) setTimeout(() => this.open(), 250); };
      r.start();
    } catch { /* */ }
  }
}
