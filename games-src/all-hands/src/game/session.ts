/**
 * One level being played: the world, who drives each player, quick chat and the fixed-step clock.
 * The host (or a local game) steps it; guests only load snapshots into it.
 */
import { HZ } from '../sim/constants';
import type { Level } from '../sim/level';
import { In, type GameEvent } from '../sim/types';
import { World } from '../sim/world';
import type { Chat } from '../render/renderer';

export const CHAT_LINES = ['Here!', 'Wait!', 'Jump!', 'Go!', 'Hop on!', 'Push!'];

export class Session {
  world: World;
  chats: Chat[] = [];
  private acc = 0;
  private chatPrev = [false, false, false, false];
  private chatIdx = [0, 0, 0, 0];
  private chatAt = [-9, -9, -9, -9];
  /** events since the last snapshot (host) */
  pending: GameEvent[] = [];

  constructor(readonly lv: Level) {
    this.world = new World(lv);
  }

  restart(): void {
    this.world = new World(this.lv);
    this.acc = 0;
    this.chats = [];
  }

  /** Seconds since the level started. */
  get time(): number {
    const w = this.world;
    return (w.status === 'won' ? w.wonTick : w.t) / HZ;
  }

  /**
   * Advance by real time. `inputs()` is asked once per tick for the four players' bits.
   * `before` runs before each tick (the renderer captures positions for interpolation).
   * Returns the 0..1 progress into the next tick.
   */
  advance(dt: number, inputs: () => number[], now: number, before?: () => void): { alpha: number; events: GameEvent[] } {
    this.acc = Math.min(this.acc + dt, Math.max(0.25, dt));
    const events: GameEvent[] = [];
    while (this.acc >= 1 / HZ) {
      this.acc -= 1 / HZ;
      const inp = inputs();
      for (let i = 0; i < 4; i++) {
        const c = !!(inp[i] & In.Chat);
        if (c && !this.chatPrev[i]) this.chat(i, null, now);
        this.chatPrev[i] = c;
      }
      before?.();
      this.world.step(inp);
      events.push(...this.world.events);
      this.world.events.length = 0;
    }
    this.pending.push(...events);
    if (this.pending.length > 200) this.pending.splice(0, this.pending.length - 200);
    this.chats = this.chats.filter((c) => c.until > now);
    return { alpha: this.acc * HZ, events };
  }

  /** A quick-chat line over a player's head; pressing again soon cycles to the next line. */
  chat(p: number, text: string | null, now: number): Chat {
    if (text === null) {
      this.chatIdx[p] = now - this.chatAt[p] < 1.5 ? (this.chatIdx[p] + 1) % CHAT_LINES.length : 0;
      text = CHAT_LINES[this.chatIdx[p]];
    }
    this.chatAt[p] = now;
    this.chats = this.chats.filter((c) => c.p !== p);
    const c = { p, text, until: now + 2 };
    this.chats.push(c);
    return c;
  }

  takeEvents(): GameEvent[] {
    const e = this.pending;
    this.pending = [];
    return e;
  }
}
