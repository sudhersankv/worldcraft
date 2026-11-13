/**
 * Web Audio sound: CC0 Kenney sound effects + original procedurally sequenced
 * chiptune music and ambience per theme. No audio files are required for music.
 */
const SFX = ['select', 'click', 'back', 'confirm', 'wrong', 'open', 'close', 'tick', 'pluck', 'appear', 'step0', 'step1', 'coins', 'door', 'page', 'latch', 'powerup', 'switch', 'beep', 'chime', 'jingle-success', 'jingle-quest', 'jingle-complete', 'jingle-item'] as const;
export type Sfx = (typeof SFX)[number];

export interface MusicMood { root: number; scale: number[]; tempo: number; lead: OscillatorType; pad: OscillatorType; mood: string }

class AudioManagerImpl {
  ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private ambGain!: GainNode;
  private musicTimer: number | null = null;
  private ambNodes: AudioNode[] = [];
  private ambTimer: number | null = null;
  private musicVol = 0.5;
  private sfxVol = 0.7;
  private loading: Promise<void> | null = null;
  private currentMood: MusicMood | null = null;

  init(): void {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.ctx.destination);
    this.ambGain = this.ctx.createGain(); this.ambGain.connect(this.ctx.destination);
    this.setVolumes(this.musicVol, this.sfxVol);
    const unlock = () => { this.ctx?.resume(); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    this.loading = this.loadAll();
  }

  private async loadAll() {
    await Promise.all(SFX.map(async (name) => {
      try {
        const res = await fetch(`/assets/kenney/audio/${name}.ogg`);
        const buf = await res.arrayBuffer();
        this.buffers.set(name, await this.ctx!.decodeAudioData(buf));
      } catch { /* missing codec or file: stay silent */ }
    }));
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVol = music; this.sfxVol = sfx;
    if (!this.ctx) return;
    this.musicGain.gain.value = music * 0.22;
    this.ambGain.gain.value = music * 0.35;
    this.sfxGain.gain.value = sfx;
  }

  play(name: Sfx, opts: { rate?: number; volume?: number } = {}): void {
    if (!this.ctx || this.sfxVol <= 0) return;
    const b = this.buffers.get(name);
    if (!b) { this.blip(name); return; }
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = opts.rate ?? 1;
    const g = this.ctx.createGain(); g.gain.value = opts.volume ?? 1;
    src.connect(g).connect(this.sfxGain);
    src.start();
  }

  /** Fallback synthesized blip when a sample has not decoded. */
  private blip(name: string) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'square'; o.frequency.value = name === 'wrong' ? 180 : 660;
    g.gain.setValueAtTime(0.08, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
    o.connect(g).connect(this.sfxGain); o.start(); o.stop(this.ctx.currentTime + 0.13);
  }

  /** Typewriter voice blip with a pitch per character. */
  voiceBlip(pitch = 1): void {
    if (!this.ctx || this.sfxVol <= 0) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 340 * pitch * (0.92 + Math.random() * 0.16);
    g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g).connect(this.sfxGain); o.start(t); o.stop(t + 0.06);
  }

  // ----------------------------------------------------------- music
  playMusic(mood: MusicMood | null, seed = 1): void {
    if (!this.ctx) return;
    if (this.currentMood === mood && this.musicTimer) return;
    this.stopMusic();
    this.currentMood = mood;
    if (!mood) return;
    const ctx = this.ctx;
    const spb = 60 / mood.tempo / 2; // eighth notes
    const prog = [0, 4, 5, 3];
    let rnd = seed * 9301 + 49297;
    const rand = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
    const melody: (number | null)[] = [];
    let deg = 4;
    for (let i = 0; i < 64; i++) {
      if (rand() < 0.3) { melody.push(null); continue; }
      deg = Math.max(0, Math.min(mood.scale.length * 2 - 1, deg + Math.floor(rand() * 5) - 2));
      melody.push(deg);
    }
    const noteFreq = (deg: number, octave: number) => {
      const s = mood.scale;
      const semis = s[((deg % s.length) + s.length) % s.length] + 12 * Math.floor(deg / s.length);
      return 440 * Math.pow(2, (mood.root + semis + octave * 12 - 69) / 12);
    };
    let step = 0;
    let next = ctx.currentTime + 0.1;
    const tone = (type: OscillatorType, f: number, t: number, d: number, v: number) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + d);
      o.connect(g).connect(this.musicGain); o.start(t); o.stop(t + d + 0.02);
    };
    const schedule = () => {
      while (next < ctx.currentTime + 0.25) {
        const bar = Math.floor(step / 8) % 4;
        const chord = prog[bar];
        if (step % 8 === 0) tone(mood.pad, noteFreq(chord, -2), next, spb * 7, 0.5);
        if (step % 4 === 2) tone('triangle', noteFreq(chord + 4, -2), next, spb * 2, 0.3);
        const arp = [0, 2, 4, 2][step % 4];
        tone(mood.pad, noteFreq(chord + arp, -1), next, spb * 0.9, 0.16);
        const m = melody[step % 64];
        if (m !== null && step % 2 === 0) tone(mood.lead, noteFreq(m, 0), next, spb * 1.8, 0.22);
        next += spb; step++;
      }
    };
    schedule();
    this.musicTimer = window.setInterval(schedule, 100);
    this.ambience(mood.mood);
  }

  stopMusic(): void {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.currentMood = null;
    if (this.ambTimer) clearInterval(this.ambTimer);
    this.ambTimer = null;
    this.ambNodes.forEach((n) => { try { (n as AudioScheduledSourceNode).stop?.(); n.disconnect(); } catch { /* */ } });
    this.ambNodes = [];
  }

  private ambience(mood: string) {
    const ctx = this.ctx!;
    const noise = (filterFreq: number, q: number, vol: number, lfo = 0) => {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = vol;
      src.connect(f).connect(g).connect(this.ambGain); src.start();
      this.ambNodes.push(src, f, g);
      if (lfo) {
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.frequency.value = lfo; og.gain.value = vol * 0.8; o.connect(og).connect(g.gain); o.start();
        this.ambNodes.push(o, og);
      }
    };
    const chirp = () => {
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; const f0 = 2200 + Math.random() * 1600;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 1.4, t + 0.08);
      g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(g).connect(this.ambGain); o.start(t); o.stop(t + 0.15);
    };
    switch (mood) {
      case 'cozy': noise(600, 0.5, 0.05); this.ambTimer = window.setInterval(() => { if (Math.random() < 0.35) { chirp(); setTimeout(chirp, 140); } }, 1400); break;
      case 'dreamy': noise(380, 1, 0.22, 0.12); break;
      case 'wonder': noise(160, 4, 0.12); break;
      case 'playful': noise(220, 6, 0.06); break;
      case 'mysterious': noise(900, 0.3, 0.06, 0.2); break;
      default: noise(500, 0.5, 0.03);
    }
  }
}

export const Audio = new AudioManagerImpl();
