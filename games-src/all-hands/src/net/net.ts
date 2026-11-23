/**
 * Online play inside a Game Night room. The room's host runs the simulation and the app's state
 * (which screen, who's in which slot, ready marks, pause, votes) and broadcasts both; guests send
 * their input bits and a few commands. Messages are prefixed "ah:" so they never clash with the hub.
 */
import type { HubRoom } from '../hub';
import type { Chat } from '../render/renderer';
import type { GameEvent } from '../sim/types';
import type { WorldSave } from '../sim/world';

export interface SlotInfo {
  name: string;
  /** room peer id (online), or null for a player on the host's own devices */
  peer: string | null;
  /** what drives it, for the lobby card */
  device: string;
}

export interface AppState {
  screen: 'lobby' | 'levels' | 'play' | 'clear';
  slots: (SlotInfo | null)[];
  level: string | null;
  paused: string | null;
  votes: number[];
  ready: boolean[];
  result: { time: number; pops: number; best: boolean } | null;
}

export interface Snap {
  s: WorldSave;
  e: GameEvent[];
  c: Chat[];
}

export type Cmd =
  | { c: 'chat'; text: string }
  | { c: 'ready' }
  | { c: 'pause' }
  | { c: 'resume' }
  | { c: 'vote' }
  | { c: 'pick'; level: string };

const T = { app: 'ah:app', snap: 'ah:snap', inp: 'ah:in', cmd: 'ah:cmd' };

export interface NetHandlers {
  onApp(s: AppState): void;
  onSnap(s: Snap): void;
  onInput(peer: string, bits: number): void;
  onCmd(peer: string, cmd: Cmd): void;
  onPeers(): void;
}

export class Net {
  readonly self: string;
  private offs: (() => void)[] = [];
  private lastBits = -1;
  private lastSent = 0;

  constructor(
    readonly room: HubRoom,
    h: NetHandlers,
  ) {
    this.self = room.me.id;
    const on = (type: string, fn: (d: unknown, from: string) => void) => this.offs.push(room.on(type, fn));
    if (room.isHost) {
      on(T.inp, (d, from) => h.onInput(from, Number((d as { b: number }).b) | 0));
      on(T.cmd, (d, from) => h.onCmd(from, d as Cmd));
    } else {
      on(T.app, (d) => h.onApp(d as AppState));
      on(T.snap, (d) => h.onSnap(d as Snap));
    }
    this.offs.push(room.onPlayers(() => h.onPeers()));
  }

  get isHost(): boolean {
    return this.room.isHost;
  }

  sendApp(s: AppState): void {
    this.room.send(T.app, s);
  }

  sendSnap(s: Snap): void {
    this.room.send(T.snap, s);
  }

  /** Guests: send input when it changes, and at least every 150 ms. */
  sendInput(bits: number, now: number): void {
    if (bits === this.lastBits && now - this.lastSent < 150) return;
    this.lastBits = bits;
    this.lastSent = now;
    this.room.sendToHost(T.inp, { b: bits });
  }

  sendCmd(c: Cmd): void {
    this.room.sendToHost(T.cmd, c);
  }

  close(): void {
    for (const o of this.offs) o();
    this.offs = [];
  }
}
