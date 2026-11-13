/** Unified keyboard + gamepad input (standard mapping). Never captures keys while typing in a text field. */
export type Action = 'interact' | 'hint' | 'voice' | 'book' | 'pause' | 'back' | 'goat' | 'zoomIn' | 'zoomOut' | 'up' | 'down' | 'left' | 'right';

const KEYMAP: Record<string, Action> = {
  KeyE: 'interact', Space: 'interact', Enter: 'interact',
  KeyC: 'hint', KeyV: 'voice', KeyB: 'book', KeyJ: 'book', Escape: 'pause', KeyG: 'goat',
  Equal: 'zoomIn', Minus: 'zoomOut', NumpadAdd: 'zoomIn', NumpadSubtract: 'zoomOut',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
};
// standard gamepad: 0 South(A) 1 East(B) 2 West(X) 3 North(Y) 4 LB 5 RB 8 Select 9 Start 12-15 dpad
const PADMAP: Record<number, Action> = { 0: 'interact', 1: 'back', 2: 'voice', 3: 'hint', 4: 'zoomOut', 5: 'zoomIn', 8: 'book', 9: 'pause', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };

export function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

export class Input {
  private keys = new Set<string>();
  private pressed: Action[] = [];
  private released: Action[] = [];
  private padPrev: boolean[] = [];
  private stickLatch = { x: 0, y: 0 };
  padConnected = false;
  lastDevice: 'kb' | 'pad' = 'kb';

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (isTyping() && e.code !== 'Escape') return;
      const a = KEYMAP[e.code];
      if (!e.repeat && a) this.pressed.push(a);
      this.keys.add(e.code);
      this.lastDevice = 'kb';
      if (a && ['up', 'down', 'left', 'right', 'interact'].includes(a) && e.target === document.body) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); const a = KEYMAP[e.code]; if (a) this.released.push(a); });
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('gamepadconnected', () => { this.padConnected = true; });
    window.addEventListener('gamepaddisconnected', () => { this.padConnected = !!this.pad(); });
  }

  private pad(): Gamepad | null {
    try { const pads = navigator.getGamepads?.() ?? []; for (const p of pads) if (p && p.connected) return p; } catch { /* */ }
    return null;
  }

  /** Call once per frame before reading. */
  poll() {
    const p = this.pad();
    if (!p) return;
    this.padConnected = true;
    p.buttons.forEach((b, i) => {
      const down = !!b && (b.pressed || b.value > 0.5);
      const was = this.padPrev[i] ?? false;
      const a = PADMAP[i];
      if (a && down && !was) { this.pressed.push(a); this.lastDevice = 'pad'; }
      if (a && !down && was) this.released.push(a);
      this.padPrev[i] = down;
    });
    // left stick as menu nav edges
    const sx = p.axes[0] ?? 0, sy = p.axes[1] ?? 0;
    const lx = Math.abs(sx) > 0.6 ? Math.sign(sx) : 0, ly = Math.abs(sy) > 0.6 ? Math.sign(sy) : 0;
    if (lx !== this.stickLatch.x && lx) this.pressed.push(lx > 0 ? 'right' : 'left');
    if (ly !== this.stickLatch.y && ly) this.pressed.push(ly > 0 ? 'down' : 'up');
    this.stickLatch = { x: lx, y: ly };
  }

  /** Screen-space move vector (x right, y down), magnitude 0..1. */
  move(): { x: number; y: number } {
    if (isTyping()) return { x: 0, y: 0 };
    let x = 0, y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    const p = this.pad();
    if (p) {
      const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
      const m = Math.hypot(ax, ay);
      if (m > 0.22) { x += ax; y += ay; this.lastDevice = 'pad'; }
      const b = (i: number) => !!p.buttons[i]?.pressed;
      if (b(12)) y -= 1; if (b(13)) y += 1; if (b(14)) x -= 1; if (b(15)) x += 1;
    }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }

  take(): Action[] { const p = this.pressed; this.pressed = []; return p; }
  takeReleased(): Action[] { const r = this.released; this.released = []; return r; }
  held(code: string) { return this.keys.has(code); }
}
