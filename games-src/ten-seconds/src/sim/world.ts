/**
 * One loop of one level: the whole simulation state and tick(). Deterministic: the same level,
 * copies and live input always give the same states. No DOM, no randomness, no clocks.
 *
 * Tick order (fixed, see DESIGN.md "Decisions"):
 *   1. actors in lane order: the live player moves by input, copies move to their recorded
 *      position (or freeze in a paradox); each then does that tick's actions and picks things up
 *   2. thrown coins land (noises)
 *   3. triggers, then doors
 *   4. lasers, threats (guards, auditors, cameras, hounds, lamps)
 *   5. detection, then the win check, then the clock
 */
import { HZ } from './constants';
import { Tile, type ItemKind, type Level } from './level';
import { type Recording } from './recording';
import { stepCopy, stepLive, type LiveInput } from './actors';
import { landCoins } from './objects/items';
import { updateTriggers } from './objects/triggers';
import { updateDoors } from './objects/doors';
import { updateLasers, laserDetect } from './objects/lasers';
import { initGuard, updateGuard, guardDetect, type GuardState } from './threats/guard';
import { updateCamera, cameraDetect, type CameraState } from './threats/camera';
import { initHound, updateHound, houndDetect, type HoundState } from './threats/hound';
import { lampDetect, updateLamps, type LampState } from './threats/lamp';
import { watchmakerCheck } from './threats/watchmaker';
import { carriageOffset, moveTrain } from './train';

export type ActorState = 'wait' | 'active' | 'done' | 'paradox';

export interface Actor {
  /** index in world.actors, which is also the lane */
  idx: number;
  live: boolean;
  rec: Recording;
  x: number;
  y: number;
  px: number;
  py: number;
  face: number;
  state: ActorState;
  paradoxAt: number;
  carry: number;
  crouch: number;
  /** the low-wall tile this actor crouches at */
  crouchTx: number;
  crouchTy: number;
  vaultT0: number;
  vaultUntil: number;
  vaultFx: number;
  vaultFy: number;
  vaultTx: number;
  vaultTy: number;
  /** has stepped off the start tile (bodies only collide once both have; see DESIGN.md) */
  out: boolean;
  /** recorded positions of this actor in this loop (for the Hound) */
  trailX: Float64Array;
  trailY: Float64Array;
}

export interface Item {
  kind: ItemKind;
  x: number;
  y: number;
  px: number;
  py: number;
  carrier: number;
  noPick: number;
  noPickUntil: number;
  mustLeave: boolean;
  /** a thrown coin in the air */
  fly: { x0: number; y0: number; x1: number; y1: number; t0: number; t1: number; by: number } | null;
}

export interface Crate {
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface TriggerState {
  pressed: boolean;
  on: boolean;
  until: number;
}

export interface LaserState {
  on: boolean;
  /** beam from (x0,y0) to (x1,y1), already cut short by a crate or mirror */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** end of the beam if nothing were in the way */
  fx: number;
  fy: number;
  blockedBy: 'crate' | 'mirror' | null;
}

export type DetectorKind = 'guard' | 'auditor' | 'camera' | 'laser' | 'hound' | 'lamp' | 'watchmaker';

export interface Caught {
  by: DetectorKind;
  index: number;
  /** actor seen (-1 when nobody in particular, e.g. the Watchmaker) */
  actor: number;
  t: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type EventKind =
  | 'press'
  | 'pickup'
  | 'drop'
  | 'pass'
  | 'throw'
  | 'land'
  | 'crouch'
  | 'vault'
  | 'paradox'
  | 'seen'
  | 'win'
  | 'door'
  | 'plate'
  | 'bell'
  | 'shutter'
  | 'stone'
  | 'rewound'
  | 'step';

export interface SimEvent {
  t: number;
  kind: EventKind;
  /** actor index, or -1 for the world */
  actor: number;
  x: number;
  y: number;
  /** door/trigger index, item index, open/closed… depends on the kind */
  a: number;
  b: number;
}

export type Status = 'running' | 'won' | 'caught' | 'over';

export interface BeginOptions {
  /** recorded copies, in lane order */
  lanes: Recording[];
  /** lane the live player records into: an index < lanes.length replaces that lane (re-record),
   *  lanes.length appends a new one, -1 means no live player (plan preview) */
  liveSlot: number;
  /** the recording the live player writes into */
  liveRec?: Recording;
  loopTicks: number;
}

export class World {
  readonly lv: Level;
  t = 0;
  loopTicks = 600;
  status: Status = 'running';
  caught: Caught | null = null;
  winTick = -1;
  actors: Actor[] = [];
  live: Actor | null = null;
  items: Item[] = [];
  crates: Crate[] = [];
  triggers: TriggerState[] = [];
  doorOpen: boolean[] = [];
  lasers: LaserState[] = [];
  guards: GuardState[] = [];
  cameras: CameraState[] = [];
  hounds: HoundState[] = [];
  lamps: LampState[] = [];
  /** the actor whose recording is the newest (the Hound and the Auditor follow it), or -1 */
  newest = -1;
  events: SimEvent[] = [];
  /** every event since begin() (events is cleared by the caller each frame) */
  log: SimEvent[] = [];
  /** set when the live player touched a rewind stone this loop */
  stoneTouched = false;
  /** the Watchmaker rewound the room */
  rewound = false;
  /** each carriage's offset in tiles, now */
  offs: number[] = [];

  constructor(lv: Level) {
    this.lv = lv;
  }

  begin(o: BeginOptions): void {
    const lv = this.lv;
    this.t = 0;
    this.loopTicks = o.loopTicks;
    this.status = 'running';
    this.caught = null;
    this.winTick = -1;
    this.events = [];
    this.log = [];
    this.stoneTouched = false;
    this.rewound = false;
    this.offs = lv.carriages.map((c) => carriageOffset(c, 0));
    const sx = lv.start[0] + 0.5;
    const sy = lv.start[1] + 0.5;
    const recs: { rec: Recording; live: boolean }[] = o.lanes.map((rec) => ({ rec, live: false }));
    if (o.liveSlot >= 0) {
      const live = { rec: o.liveRec!, live: true };
      if (o.liveSlot < recs.length) recs[o.liveSlot] = live;
      else recs.push(live);
    }
    const cap = o.loopTicks + 1;
    this.actors = recs.map(({ rec, live }, idx) => ({
      idx,
      live,
      rec,
      x: sx,
      y: sy,
      px: sx,
      py: sy,
      face: -Math.PI / 2,
      state: live ? 'active' : 'wait',
      paradoxAt: -1,
      carry: -1,
      crouch: 0,
      crouchTx: 0,
      crouchTy: 0,
      vaultT0: -1,
      vaultUntil: -1,
      vaultFx: 0,
      vaultFy: 0,
      vaultTx: 0,
      vaultTy: 0,
      out: false,
      trailX: new Float64Array(cap),
      trailY: new Float64Array(cap),
    }));
    this.live = this.actors.find((a) => a.live) ?? null;
    let newestStamp = -Infinity;
    this.newest = -1;
    this.actors.forEach((a) => {
      if (!a.live && a.rec.stamp > newestStamp) {
        newestStamp = a.rec.stamp;
        this.newest = a.idx;
      }
    });

    this.items = lv.items.map((it) => ({
      kind: it.kind,
      x: it.x + 0.5,
      y: it.y + 0.5,
      px: it.x + 0.5,
      py: it.y + 0.5,
      carrier: -1,
      noPick: -1,
      noPickUntil: 0,
      mustLeave: false,
      fly: null,
    }));
    this.crates = lv.crates.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5, px: x + 0.5, py: y + 0.5 }));
    // things drawn inside a carriage start where the carriage is at tick 0
    if (this.offs.length) {
      const shift = (o: { x: number; y: number; px: number; py: number }) => {
        const k = lv.carriageAt[Math.floor(o.y) * lv.w + Math.floor(o.x)];
        if (k >= 0) {
          o.x += this.offs[k];
          o.px = o.x;
        }
      };
      this.items.forEach(shift);
      this.crates.forEach(shift);
    }
    this.triggers = lv.triggers.map((t) => ({ pressed: false, on: t.on, until: -1 }));
    this.doorOpen = lv.doors.map(() => false);
    this.lasers = lv.lasers.map(() => ({ on: true, x0: 0, y0: 0, x1: 0, y1: 0, fx: 0, fy: 0, blockedBy: null }));
    this.cameras = lv.cameras.map((c) => ({ angle: c.from, blindUntil: -1 }));
    this.lamps = lv.lamps.map(() => ({ sx: 0, sy: 0 }));
    this.guards = [];
    this.hounds = [];
    // settle the world at tick 0 so the first frame already shows correct doors, beams and cones
    for (const a of this.actors) {
      a.trailX[0] = a.x;
      a.trailY[0] = a.y;
    }
    updateTriggers(this, true);
    updateDoors(this, true);
    // threats plan their first walks with the doors as they really are at tick 0
    this.guards = [
      ...lv.guards.map((g, i) => initGuard(this, g, i, false)),
      ...lv.auditors.map((g, i) => initGuard(this, g, i, true)),
    ];
    this.hounds = lv.hounds.map((h) => initHound(this, h));
    updateLasers(this);
    // guards with a warm-up start part-way along their patrol
    for (const g of this.guards) {
      const n = Math.round(g.def.warmup * HZ);
      if (!n || g.mode !== 'route') continue;
      for (let k = -n; k < 0; k++) {
        this.t = k;
        updateGuard(this, g);
      }
      this.t = 0;
      g.px = g.x;
      g.py = g.y;
    }
    this.cameras.forEach((c, i) => updateCamera(this, c, i));
    updateLamps(this);
  }

  /** Advance one tick. `input` drives the live player (ignored when there is none). */
  tick(input: LiveInput | null): void {
    if (this.status !== 'running') return;
    const t = this.t;
    for (const a of this.actors) {
      a.px = a.x;
      a.py = a.y;
    }
    for (const it of this.items) {
      it.px = it.x;
      it.py = it.y;
    }
    for (const c of this.crates) {
      c.px = c.x;
      c.py = c.y;
    }
    if (this.offs.length) moveTrain(this);
    const sx0 = this.lv.start[0] + 0.5;
    const sy0 = this.lv.start[1] + 0.5;
    for (const a of this.actors) {
      if (a.live) stepLive(this, a, input ?? NO_INPUT);
      else stepCopy(this, a);
      if (!a.out && Math.hypot(a.x - sx0, a.y - sy0) >= 0.8) a.out = true;
      a.trailX[t + 1] = a.x;
      a.trailY[t + 1] = a.y;
    }
    // carried items follow their carriers
    for (const it of this.items) {
      if (it.carrier >= 0) {
        const c = this.actors[it.carrier];
        it.x = c.x;
        it.y = c.y;
      }
    }
    landCoins(this);
    updateTriggers(this, false);
    updateDoors(this, false);
    updateLasers(this);
    for (const g of this.guards) updateGuard(this, g);
    this.cameras.forEach((c, i) => updateCamera(this, c, i));
    for (const h of this.hounds) updateHound(this, h);
    updateLamps(this);

    this.t = t + 1;
    this.detect();
    if (this.status === 'running') watchmakerCheck(this);
    if (this.status === 'running') this.checkWin();
    if (this.status === 'running' && this.t >= this.loopTicks) this.status = 'over';
  }

  private detect(): void {
    const c =
      this.guards.reduce<Caught | null>((acc, g) => acc ?? guardDetect(this, g), null) ??
      this.cameras.reduce<Caught | null>((acc, cam, i) => acc ?? cameraDetect(this, cam, i), null) ??
      laserDetect(this) ??
      this.hounds.reduce<Caught | null>((acc, h, i) => acc ?? houndDetect(this, h, i), null) ??
      lampDetect(this);
    if (c) this.fail(c);
  }

  fail(c: Caught): void {
    this.caught = c;
    this.status = 'caught';
    this.emit('seen', c.actor, c.x1, c.y1, c.index, 0);
  }

  private checkWin(): void {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.kind !== 'target' || it.fly) continue;
      const tx = Math.floor(it.x);
      const ty = Math.floor(it.y);
      if (tx >= 0 && ty >= 0 && tx < this.lv.w && ty < this.lv.h && this.lv.exitAt[ty * this.lv.w + tx]) {
        this.status = 'won';
        this.winTick = this.t;
        this.emit('win', it.carrier, it.x, it.y, i, 0);
        return;
      }
    }
  }

  emit(kind: EventKind, actor: number, x: number, y: number, a = 0, b = 0): void {
    const e: SimEvent = { t: this.t, kind, actor, x, y, a, b };
    this.events.push(e);
    this.log.push(e);
  }

  // ---------- geometry ----------

  tileAt(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.lv.w || ty >= this.lv.h) return Tile.Wall;
    return this.lv.tiles[ty * this.lv.w + tx];
  }

  doorClosedAt(tx: number, ty: number): boolean {
    const d = this.lv.doorAt[ty * this.lv.w + tx];
    return d >= 0 && !this.doorOpen[d];
  }

  /** Does this tile stop a body? Low walls let a vaulting actor through. */
  solidFor(tx: number, ty: number, vaulting: boolean): boolean {
    const t = this.tileAt(tx, ty);
    if (t === Tile.Floor) return false;
    if (t === Tile.Door) return !this.doorOpen[this.lv.doorAt[ty * this.lv.w + tx]];
    if (t === Tile.Low) return !vaulting;
    return true;
  }

  /** Does this tile stop sight and lasers? Walls, emitters and closed doors do; windows and low walls don't. */
  opaque(tx: number, ty: number): boolean {
    const t = this.tileAt(tx, ty);
    if (t === Tile.Wall || t === Tile.Emitter) return true;
    if (t === Tile.Door) return !this.doorOpen[this.lv.doorAt[ty * this.lv.w + tx]];
    return false;
  }

  seconds(): number {
    return this.t / HZ;
  }
}

const NO_INPUT: LiveInput = { dx: 0, dy: 0, use: false };
