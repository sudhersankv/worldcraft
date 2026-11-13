/** One voice at a time: Aura TTS (en) or speechSynthesis (other langs); Web Speech STT for hold-to-talk. */
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
  const browser = () => new Promise<void>((resolve) => {
    if (my !== token) return resolve();
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = SPEECH_LOCALE[lang]; u.rate = 1.0; u.pitch = 1.05;
      const v = speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith(SPEECH_LOCALE[lang].slice(0, 2).toLowerCase()));
      if (v) u.voice = v;
      let started = false;
      u.onstart = () => { started = true; onStart(est); };
      u.onend = () => resolve(); u.onerror = () => { if (!started) onStart(est); resolve(); };
      speechSynthesis.speak(u);
      setTimeout(() => { if (!started) { onStart(est); } }, 600);
      setTimeout(resolve, est + 4000);
    } catch { onStart(est); setTimeout(resolve, est); }
  });
  if (lang !== 'en') return browser();
  return new Promise<void>((resolve) => {
    const a = new Audio(`/api/tts?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text.slice(0, 600))}`);
    audio = a;
    let done = false;
    const fail = () => { if (done || my !== token) return; done = true; audio = null; void browser().then(resolve); };
    const timer = setTimeout(fail, 4500);
    a.addEventListener('playing', () => { clearTimeout(timer); if (my !== token) return; const d = isFinite(a.duration) && a.duration > 0 ? a.duration * 1000 : est; onStart(d); }, { once: true });
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
export function speakQuick(text: string, lang: Lang) {
  if (muted) return;
  stopSpeech();
  try { const u = new SpeechSynthesisUtterance(text); u.lang = SPEECH_LOCALE[lang]; u.rate = 1.1; speechSynthesis.speak(u); } catch { /* */ }
}
