/**
 * Keyboard, gamepad and touch → a movement vector and a queue of actions.
 *
 *   Move   WASD / arrows · left stick · hold a finger on the map
 *   Use    E / Space · A · Use button
 *   Retry  R · Y        Delete last loop  Z · B        Re-record lane N  1–6 · D-pad up/down
 *   Pause  Esc · Start   Scrub  , and .  · D-pad left/right   Debug  F3
 */
export type Action =
  | { kind: 'use' }
  | { kind: 'retry' }
  | { kind: 'delete' }
  | { kind: 'pause' }
  | { kind: 'debug' }
  | { kind: 'lane'; n: number }
  | { kind: 'laneStep'; d: 1 | -1 }
  | { kind: 'scrub'; d: 1 | -1 }
  | { kind: 'paths' }
  | { kind: 'hint' };

const MOVE: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export class Input {
  private held = new Set<string>();
  private queue: Action[] = [];
  private padPrev: boolean[] = [];
  /** finger held on the map, in client pixels */
  touch: { x: number; y: number; id: number } | null = null;
  /** set by the play screen: client point → direction to walk */
  touchDir: ((cx: number, cy: number) => [number, number]) | null = null;
  /** last kind of input used (for button prompts) */
  last: 'keys' | 'pad' | 'touch' = 'keys';
  enabled = true;

  constructor() {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.clear());
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (!this.enabled) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const code = e.code;
    if (MOVE[code]) {
      e.preventDefault();
      if (down) this.held.add(code);
      else this.held.delete(code);
      this.last = 'keys';
      return;
    }
    if (!down || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const push = (a: Action) => {
      e.preventDefault();
      this.queue.push(a);
      this.last = 'keys';
    };
    switch (code) {
      case 'KeyE':
      case 'Space':
        // Space on a focused button should press the button, not the game
        if (t && t.tagName === 'BUTTON' && code === 'Space') return;
        push({ kind: 'use' });
        break;
      case 'KeyR':
        push({ kind: 'retry' });
        break;
      case 'KeyZ':
      case 'Backspace':
        push({ kind: 'delete' });
        break;
      case 'Escape':
        push({ kind: 'pause' });
        break;
      case 'F3':
        push({ kind: 'debug' });
        break;
      case 'Comma':
        push({ kind: 'scrub', d: -1 });
        break;
      case 'Period':
        push({ kind: 'scrub', d: 1 });
        break;
      case 'KeyP':
        push({ kind: 'paths' });
        break;
      case 'KeyH':
        push({ kind: 'hint' });
        break;
      default:
        if (/^Digit[1-6]$/.test(code)) push({ kind: 'lane', n: Number(code.slice(5)) - 1 });
        else if (/^Numpad[1-6]$/.test(code)) push({ kind: 'lane', n: Number(code.slice(6)) - 1 });
    }
  }

  /** Called by touch buttons and the map. */
  push(a: Action): void {
    this.queue.push(a);
  }

  /** Drain queued actions (also polls the gamepad). */
  take(): Action[] {
    this.pollPad();
    const q = this.queue;
    this.queue = [];
    return this.enabled ? q : [];
  }

  /** Movement vector, magnitude ≤ 1. */
  move(): [number, number] {
    if (!this.enabled) return [0, 0];
    let x = 0;
    let y = 0;
    for (const k of this.held) {
      x += MOVE[k][0];
      y += MOVE[k][1];
    }
    x = Math.sign(x);
    y = Math.sign(y);
    const pad = this.padStick();
    if (pad) [x, y] = pad;
    if (!x && !y && this.touch && this.touchDir) [x, y] = this.touchDir(this.touch.x, this.touch.y);
    const m = Math.hypot(x, y);
    return m > 1 ? [x / m, y / m] : [x, y];
  }

  clear(): void {
    this.held.clear();
    this.queue = [];
    this.touch = null;
  }

  private pads(): Gamepad[] {
    try {
      return (navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p);
    } catch {
      return [];
    }
  }

  private padStick(): [number, number] | null {
    for (const p of this.pads()) {
      let x = p.axes[0] ?? 0;
      let y = p.axes[1] ?? 0;
      const m = Math.hypot(x, y);
      if (m < 0.25) continue;
      // rescale past the dead zone so small tilts walk slowly
      const k = Math.min(1, (m - 0.25) / 0.65) / m;
      x *= k;
      y *= k;
      this.last = 'pad';
      return [x, y];
    }
    return null;
  }

  private pollPad(): void {
    const p = this.pads()[0];
    if (!p) return;
    const now = p.buttons.map((b) => b.pressed);
    const edge = (i: number) => now[i] && !this.padPrev[i];
    const map: [number, Action][] = [
      [0, { kind: 'use' }],
      [1, { kind: 'delete' }],
      [3, { kind: 'retry' }],
      [9, { kind: 'pause' }],
      [12, { kind: 'laneStep', d: -1 }],
      [13, { kind: 'laneStep', d: 1 }],
      [14, { kind: 'scrub', d: -1 }],
      [15, { kind: 'scrub', d: 1 }],
    ];
    for (const [i, a] of map) {
      if (edge(i)) {
        this.queue.push(a);
        this.last = 'pad';
      }
    }
    this.padPrev = now;
  }
}
