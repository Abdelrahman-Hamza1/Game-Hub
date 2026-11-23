/** Shared shapes for the simulation. */
import type { T } from './level';

export type BodyKind = 'player' | 'crate' | 'block' | 'key' | 'lantern';

export interface PlayerState {
  /** 0..3 */
  n: number;
  face: 1 | -1;
  coyote: number;
  buffer: number;
  jumpHeld: boolean;
  prev: number;
  /** inside the door */
  inside: boolean;
  /** ticks until a popped player comes back (0 = not popped) */
  pop: number;
  /** thrown: no steering until landing */
  thrown: boolean;
  /** set while pushing a heavy thing (caps speed) */
  pushing: boolean;
  /** the flag tile this player is touching (y * w + x), or -1 */
  onFlag: number;
}

export interface Body {
  id: number;
  kind: BodyKind;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  solid: boolean;
  /** pushers needed to move it (0: not pushable) */
  pushN: number;
  /** for plates, scales and bridges */
  weight: number;
  grabbable: boolean;
  carrier: Body | null;
  carrying: Body | null;
  support: Solid | null;
  /** the stack under it reaches the ground (or a platform) */
  supported: boolean;
  /** how far it moved this tick (riders follow) */
  dx: number;
  dy: number;
  home: [number, number];
  /** inside the door or popped: out of the world */
  gone: boolean;
  /** a lost thing waiting for its spawn to clear */
  lost: boolean;
  /** last player to hold or push it (for buttons) */
  moving: boolean;
  p: PlayerState | null;
}

/** Something that blocks movement this tick. */
export interface Solid {
  x: number;
  y: number;
  w: number;
  h: number;
  /** a static tile (null owner) has a tile code */
  tile: T | null;
  body: Body | null;
  thing: Thing | null;
}

/**
 * A level object that isn't a body: gates, plates, buttons, lifts... Each kind lives in its own
 * module under src/sim/objects/ and is listed in objects/registry.ts.
 */
export interface Thing {
  kind: string;
  /** solid boxes right now (empty while open or broken) */
  boxes(): { x: number; y: number; w: number; h: number }[];
  /** how far it moved this tick (platforms) */
  dx: number;
  dy: number;
  /** before bodies move (platforms) */
  move?(w: import('./world').World): void;
  /** after bodies move (sensors, timers) */
  update?(w: import('./world').World): void;
  save(): unknown;
  load(s: unknown): void;
}

export const enum In {
  Left = 1,
  Right = 2,
  Jump = 4,
  Down = 8,
  Grab = 16,
  Chat = 32,
}

export type GameEventType =
  | 'jump'
  | 'land'
  | 'grab'
  | 'throw'
  | 'drop'
  | 'key'
  | 'open'
  | 'enter'
  | 'exit'
  | 'pop'
  | 'respawn'
  | 'plate'
  | 'gate'
  | 'button'
  | 'spring'
  | 'flag'
  | 'crumble'
  | 'push'
  | 'win';

export interface GameEvent {
  type: GameEventType;
  x: number;
  y: number;
  /** the player involved, if any */
  p: number;
  /** extra: on/off for plates and gates */
  on?: boolean;
}
