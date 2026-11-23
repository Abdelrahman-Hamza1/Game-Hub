/**
 * Local controls → per-device input bits. Up to four people share one keyboard (four key sets),
 * plus gamepads and on-screen touch controls. Players join in the lobby by pressing Jump on a
 * device; from then on that device drives their player.
 *
 *   keyboard left     A D move · W jump · S door · E grab · Q chat
 *   keyboard right    ← → move · ↑ jump · ↓ door · / or Right Shift grab · . chat
 *   keyboard middle   J L move · I jump · K door · O grab · U chat
 *   numpad            4 6 move · 8 jump · 5 door · 9 grab · 7 chat
 *   gamepad           stick or d-pad · A jump · X or B grab · down door · Y chat · Start pause
 *   touch             left pad · Jump · Grab · chat bubble
 */
import { In } from '../sim/types';

export type DeviceId = 'kb1' | 'kb2' | 'kb3' | 'kb4' | 'pad0' | 'pad1' | 'pad2' | 'pad3' | 'touch';

interface KeySet {
  left: string[];
  right: string[];
  jump: string[];
  down: string[];
  grab: string[];
  chat: string[];
}

const KEYS: Record<'kb1' | 'kb2' | 'kb3' | 'kb4', KeySet> = {
  kb1: { left: ['KeyA'], right: ['KeyD'], jump: ['KeyW', 'Space'], down: ['KeyS'], grab: ['KeyE'], chat: ['KeyQ'] },
  kb2: { left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp'], down: ['ArrowDown'], grab: ['Slash', 'ShiftRight', 'Enter'], chat: ['Period'] },
  kb3: { left: ['KeyJ'], right: ['KeyL'], jump: ['KeyI'], down: ['KeyK'], grab: ['KeyO'], chat: ['KeyU'] },
  kb4: { left: ['Numpad4'], right: ['Numpad6'], jump: ['Numpad8'], down: ['Numpad5', 'Numpad2'], grab: ['Numpad9'], chat: ['Numpad7'] },
};

export const DEVICE_LABEL: Record<DeviceId, string> = {
  kb1: 'Keyboard, left (WASD)',
  kb2: 'Keyboard, right (arrows)',
  kb3: 'Keyboard, middle (IJKL)',
  kb4: 'Numpad',
  pad0: 'Gamepad 1',
  pad1: 'Gamepad 2',
  pad2: 'Gamepad 3',
  pad3: 'Gamepad 4',
  touch: 'Touch',
};

export const DEVICE_KEYS: Record<DeviceId, string> = {
  kb1: 'A D move · W jump · E grab · S door',
  kb2: '← → move · ↑ jump · / grab · ↓ door',
  kb3: 'J L move · I jump · O grab · K door',
  kb4: '4 6 move · 8 jump · 9 grab · 5 door',
  pad0: 'Stick move · A jump · X grab · down door',
  pad1: 'Stick move · A jump · X grab · down door',
  pad2: 'Stick move · A jump · X grab · down door',
  pad3: 'Stick move · A jump · X grab · down door',
  touch: 'Pad move · Jump · Grab · pad down for the door',
};

const ALL: DeviceId[] = ['kb1', 'kb2', 'kb3', 'kb4', 'pad0', 'pad1', 'pad2', 'pad3', 'touch'];
/** buttons whose quick taps matter */
const TAPPABLE = In.Jump | In.Grab | In.Down | In.Chat;
const GAME_CODES = new Set(Object.values(KEYS).flatMap((k) => Object.values(k).flat()));

export class Input {
  private held = new Set<string>();
  /** keys pressed since the game last read them: a tap shorter than a frame still counts */
  private tapped = new Set<string>();
  private carry: Partial<Record<DeviceId, number>> = {};
  private snap: Partial<Record<DeviceId, number>> = {};
  private prevBits: Partial<Record<DeviceId, number>> = {};
  private pauseQueued = false;
  private padPausePrev: boolean[] = [];
  /** bits from the on-screen controls */
  touchBits = 0;
  /** chat presses from the on-screen bubble */
  touchChat = false;
  enabled = true;
  last: 'keys' | 'pad' | 'touch' = 'keys';

  constructor() {
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => this.held.clear());
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'Escape' && down && !e.repeat) {
      this.pauseQueued = true;
      return;
    }
    if (!GAME_CODES.has(e.code)) return;
    // Space and Enter on a focused button press the button, not the game
    if ((e.code === 'Space' || e.code === 'Enter') && t && t.tagName === 'BUTTON') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.enabled) e.preventDefault();
    if (down) {
      this.held.add(e.code);
      this.tapped.add(e.code);
    } else this.held.delete(e.code);
    this.last = 'keys';
  }

  private pads(): (Gamepad | null)[] {
    try {
      return Array.from(navigator.getGamepads?.() ?? []);
    } catch {
      return [];
    }
  }

  /**
   * Once per frame: read every device. Taps since the last read are kept (carried) until a sim
   * tick has used them (`used()`), so a press shorter than a frame is never lost.
   */
  poll(): void {
    for (const id of ALL) {
      const b = this.read(id);
      this.carry[id] = (this.carry[id] ?? 0) | (b & TAPPABLE);
      this.snap[id] = b | (this.carry[id] ?? 0);
    }
    this.tapped.clear();
  }

  /** A sim tick has read this frame's input: taps are spent. */
  used(): void {
    this.carry = {};
  }

  /** This frame's bits for a device. */
  bits(id: DeviceId): number {
    return this.enabled ? this.snap[id] ?? 0 : 0;
  }

  private read(id: DeviceId): number {
    if (!this.enabled) return 0;
    if (id === 'touch') {
      const b = this.touchBits | (this.touchChat ? In.Chat : 0);
      this.touchChat = false;
      return b;
    }
    if (id.startsWith('kb')) {
      const k = KEYS[id as 'kb1'];
      const on = (codes: string[]) => codes.some((c) => this.held.has(c) || this.tapped.has(c));
      return (on(k.left) ? In.Left : 0) | (on(k.right) ? In.Right : 0) | (on(k.jump) ? In.Jump : 0) | (on(k.down) ? In.Down : 0) | (on(k.grab) ? In.Grab : 0) | (on(k.chat) ? In.Chat : 0);
    }
    const p = this.pads()[Number(id.slice(3))];
    if (!p) return 0;
    const ax = p.axes[0] ?? 0;
    const ay = p.axes[1] ?? 0;
    const btn = (i: number) => !!p.buttons[i]?.pressed;
    let b = 0;
    if (ax < -0.4 || btn(14)) b |= In.Left;
    if (ax > 0.4 || btn(15)) b |= In.Right;
    if (btn(0)) b |= In.Jump;
    if (ay > 0.6 || btn(13)) b |= In.Down;
    if (btn(2) || btn(1)) b |= In.Grab;
    if (btn(3)) b |= In.Chat;
    if (b) this.last = 'pad';
    return b;
  }

  /** Devices that pressed Jump this frame (for joining and ready-up). Call once per frame, after poll(). */
  joins(): DeviceId[] {
    const out: DeviceId[] = [];
    for (const id of ALL) {
      const b = this.snap[id] ?? 0;
      if (b & In.Jump && !((this.prevBits[id] ?? 0) & In.Jump)) out.push(id);
      this.prevBits[id] = b;
    }
    return out;
  }

  /** Esc or Start, once per press. */
  pause(): boolean {
    let p = this.pauseQueued;
    this.pauseQueued = false;
    this.pads().forEach((pad, i) => {
      const now = !!pad?.buttons[9]?.pressed;
      if (now && !this.padPausePrev[i]) p = true;
      this.padPausePrev[i] = now;
    });
    return p;
  }

  clear(): void {
    this.held.clear();
    this.tapped.clear();
    this.carry = {};
    this.touchBits = 0;
  }
}
