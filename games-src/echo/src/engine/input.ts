/**
 * Keyboard, mouse, touch and gamepad → one Actions snapshot per simulation tick (brief §3.2, §8).
 * Presses are edge-triggered: the first tick sampled after a press sees it, later ticks don't.
 */
import { noActions, type Actions } from '../game/actions';

export type MetaAction = 'pause' | 'retry' | 'debug';

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

/** Keys whose default browser behaviour (scrolling, find) must never fire during play. */
const SWALLOW = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F3', 'Tab']);

type Edge = 'click' | 'clap' | 'cane' | 'hand';

interface TouchState {
  id: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  startTime: number;
  moved: boolean;
}

export interface InputHost {
  /** Screen (CSS px, relative to the canvas) → world tiles. */
  screenToWorld(sx: number, sy: number): { x: number; y: number };
  playerPos(): { x: number; y: number };
  playerFacing(): number;
}

export class Input {
  /** Whether gameplay input is live (false on menus). */
  enabled = false;
  private keys = new Set<string>();
  private edges = new Set<Edge>();
  private meta: MetaAction[] = [];
  private throwAt: { sx: number; sy: number } | null = null;
  private throwDir: { x: number; y: number } | null = null;
  private touch: TouchState | null = null;
  /** Sneak toggle (touch button). */
  sneakToggle = false;
  private padPrev: boolean[] = [];
  /** Last device used, for showing the right hints and touch controls. */
  lastDevice: 'keyboard' | 'touch' | 'gamepad' = 'keyboard';
  onDeviceChange: ((d: Input['lastDevice']) => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly host: InputHost) {
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('pointerdown', (e) => this.pointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.pointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.pointerUp(e));
    canvas.addEventListener('pointercancel', () => { this.touch = null; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private setDevice(d: Input['lastDevice']): void {
    if (d === this.lastDevice) return;
    this.lastDevice = d;
    this.onDeviceChange?.(d);
  }

  private keyDown(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (typing) return;
    if (e.code === 'F3') { e.preventDefault(); this.meta.push('debug'); return; }
    if (!this.enabled) return;
    if (SWALLOW.has(e.code)) e.preventDefault();
    this.setDevice('keyboard');
    if (e.repeat) { this.keys.add(e.code); return; }
    this.keys.add(e.code);
    switch (e.code) {
      case 'KeyF': this.edges.add('click'); break;
      case 'Space': this.edges.add('clap'); break;
      case 'KeyQ': this.edges.add('cane'); break;
      case 'KeyE': this.edges.add('hand'); break;
      case 'Escape': case 'KeyP': this.meta.push('pause'); break;
      case 'KeyR': this.meta.push('retry'); break;
    }
  }

  // ---- Pointer: mouse click throws; touch holds walk and quick taps throw ----

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private pointerDown(e: PointerEvent): void {
    if (!this.enabled) return;
    this.canvas.focus({ preventScroll: true });
    const p = this.local(e);
    if (e.pointerType === 'mouse') {
      this.setDevice('keyboard');
      if (e.button === 0) this.throwAt = { sx: p.x, sy: p.y };
      return;
    }
    this.setDevice('touch');
    if (this.touch) return;
    e.preventDefault();
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this.touch = { id: e.pointerId, startX: p.x, startY: p.y, x: p.x, y: p.y, startTime: performance.now(), moved: false };
  }

  private pointerMove(e: PointerEvent): void {
    const t = this.touch;
    if (!t || e.pointerId !== t.id) return;
    const p = this.local(e);
    t.x = p.x;
    t.y = p.y;
    if (Math.hypot(p.x - t.startX, p.y - t.startY) > 12) t.moved = true;
  }

  private pointerUp(e: PointerEvent): void {
    const t = this.touch;
    if (!t || e.pointerId !== t.id) return;
    this.touch = null;
    const quick = performance.now() - t.startTime < 200 && !t.moved;
    if (quick && this.enabled) this.throwAt = { sx: t.x, sy: t.y };
  }

  // ---- On-screen buttons ----

  press(edge: Edge): void {
    if (!this.enabled) return;
    this.edges.add(edge);
  }

  pressMeta(m: MetaAction): void {
    this.meta.push(m);
  }

  // ---- Sampling ----

  /** Pause / retry / debug requests since the last call. */
  takeMeta(): MetaAction[] {
    this.pollGamepadMeta();
    const m = this.meta;
    this.meta = [];
    return m;
  }

  /** One tick's actions. Clears edge presses. */
  sample(): Actions {
    const a = noActions();
    if (!this.enabled) {
      this.edges.clear();
      this.throwAt = null;
      this.throwDir = null;
      return a;
    }
    for (const [code, [dx, dy]] of Object.entries(MOVE_KEYS)) {
      if (this.keys.has(code)) { a.moveX += dx; a.moveY += dy; }
    }
    a.sneak = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.sneakToggle;

    // Touch: hold to walk toward the finger.
    const t = this.touch;
    if (t && (t.moved || performance.now() - t.startTime >= 200)) {
      const w = this.host.screenToWorld(t.x, t.y);
      const p = this.host.playerPos();
      const dx = w.x - p.x;
      const dy = w.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.35) {
        const m = Math.min(1, d / 0.9);
        a.moveX = (dx / d) * m;
        a.moveY = (dy / d) * m;
      }
    }

    this.pollGamepad(a);

    a.click = this.edges.has('click');
    a.clap = this.edges.has('clap');
    a.cane = this.edges.has('cane');
    a.hand = this.edges.has('hand');
    this.edges.clear();
    if (this.throwAt) {
      a.throwAt = this.host.screenToWorld(this.throwAt.sx, this.throwAt.sy);
      this.throwAt = null;
    }
    if (this.throwDir) {
      a.throwDir = this.throwDir;
      this.throwDir = null;
    }
    const mag = Math.hypot(a.moveX, a.moveY);
    if (mag > 1) { a.moveX /= mag; a.moveY /= mag; }
    return a;
  }

  // ---- Gamepad (standard mapping) ----

  private pad(): Gamepad | null {
    if (!navigator.getGamepads) return null;
    for (const p of navigator.getGamepads()) if (p && p.connected) return p;
    return null;
  }

  private edge(pad: Gamepad, i: number): boolean {
    const down = !!pad.buttons[i]?.pressed;
    const was = this.padPrev[i] ?? false;
    this.padPrev[i] = down;
    return down && !was;
  }

  private pollGamepadMeta(): void {
    const pad = this.pad();
    if (!pad) return;
    if (this.edge(pad, 9)) { this.meta.push('pause'); this.setDevice('gamepad'); }
    if (this.edge(pad, 8)) { this.meta.push('retry'); this.setDevice('gamepad'); }
  }

  private pollGamepad(a: Actions): void {
    const pad = this.pad();
    if (!pad) return;
    const dz = (v: number) => (Math.abs(v) < 0.2 ? 0 : v);
    let mx = dz(pad.axes[0] ?? 0);
    let my = dz(pad.axes[1] ?? 0);
    if (pad.buttons[12]?.pressed) my = -1;
    if (pad.buttons[13]?.pressed) my = 1;
    if (pad.buttons[14]?.pressed) mx = -1;
    if (pad.buttons[15]?.pressed) mx = 1;
    if (mx || my) { a.moveX = mx; a.moveY = my; this.setDevice('gamepad'); }
    if ((pad.buttons[6]?.value ?? 0) > 0.4) a.sneak = true;
    if (this.edge(pad, 0)) { this.edges.add('clap'); this.setDevice('gamepad'); }
    if (this.edge(pad, 1)) this.edges.add('cane');
    if (this.edge(pad, 2)) this.edges.add('click');
    if (this.edge(pad, 3)) this.edges.add('hand');
    if (this.edge(pad, 7)) {
      const ax = dz(pad.axes[2] ?? 0);
      const ay = dz(pad.axes[3] ?? 0);
      if (Math.hypot(ax, ay) > 0.4) this.throwDir = { x: ax, y: ay };
      else {
        const f = this.host.playerFacing();
        this.throwDir = { x: Math.cos(f), y: Math.sin(f) };
      }
    }
  }

  /** Right-stick aim, for drawing an aim line. */
  aim(): { x: number; y: number } | null {
    const pad = this.pad();
    if (!pad) return null;
    const ax = pad.axes[2] ?? 0;
    const ay = pad.axes[3] ?? 0;
    return Math.hypot(ax, ay) > 0.4 ? { x: ax, y: ay } : null;
  }

  resetHeld(): void {
    this.keys.clear();
    this.touch = null;
    this.edges.clear();
    this.throwAt = null;
    this.throwDir = null;
  }
}
