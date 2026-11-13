/** Tiny menu blips (Web Audio). Silent until the user has interacted; respects a mute preference. */
let ctx: AudioContext | null = null;
let armed = false;
addEventListener('pointerdown', () => { armed = true; }, { once: true });
addEventListener('keydown', () => { armed = true; }, { once: true });

export function sfxMuted(): boolean { try { return localStorage.getItem('cc-mute') === '1'; } catch { return false; } }
export function setSfxMuted(m: boolean) { try { localStorage.setItem('cc-mute', m ? '1' : '0'); } catch { /* */ } }

export function blip(freq = 660, dur = .05) {
  if (!armed || sfxMuted()) return;
  try {
    ctx ??= new AudioContext();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = freq;
    g.gain.setValueAtTime(.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.05, ctx.currentTime + .01);
    g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur + .02);
  } catch { /* audio unavailable */ }
}
