/**
 * The simulation. Owns the level, entities, pulses and echo memory, and advances them at a fixed
 * timestep. It never touches the DOM, canvas or audio: it records `events` for the host to consume.
 */
import { Rng } from '../engine/rng';
import { Cart, pushCart, updateCart } from '../entities/minecart';
import { Listener, updateListener } from '../entities/listener';
import { Mimic, mimicHear, updateMimic } from '../entities/mimic';
import { Player, updatePlayer, updateStones, type Stone } from '../entities/player';
import { Swarm, startleSwarm, updateSwarm } from '../entities/swarm';
import { Tourist, updateTourist } from '../entities/tourist';
import { computeField, FieldCache, type Field } from '../sound/propagation';
import {
  KIND_INDEX, createPulse, forEachLitWall, forEachWaveTile, advanceFloorWindow, pulseFinished,
  ringRadius, tileInCone, wallBrightness, type Cone, type Owner, type Pulse, type SoundKind,
} from '../sound/pulses';
import { tileAt } from '../world/grid';
import { Mat, type Level } from '../world/level';
import type { Actions } from './actions';
import {
  CART_REACH, DRIP_EVERY, DRIP_RADIUS, ENTITY_BAND, HAND_REACH, LISTENER_CATCH, RING_END_PAD,
  SWARM_TRIGGER_RADIUS, WATERFALL_MASK_HEAR, WATERFALL_ZONE, WIND_EVERY, WIND_RADIUS,
} from './constants';
import { stonesFor, type Difficulty } from './difficulty';
import type { GameEvent } from './events';
import { Memory } from './memory';

export type GameStatus = 'playing' | 'won' | 'failed';

export interface Checkpoint {
  x: number;
  y: number;
  stones: number;
  t: number;
  sounds: number;
  alerts: number;
  /** Indices of tourists already brought out. */
  rescued: number[];
  /** Index of the tourist whose hand is held, if any. */
  held: number | null;
}

export interface GameOptions {
  level: Level;
  difficulty: Difficulty;
  seed?: number;
  /** Title-screen mode: no player, random ambient pulses. */
  attract?: boolean;
  checkpoint?: Checkpoint | null;
}

export interface EmitSpec {
  kind: SoundKind;
  owner: Owner;
  x: number;
  y: number;
  radius: number;
  /** Hearing radius for threats (before the difficulty multiplier). */
  hear: number;
  cone?: Cone | null;
  fake?: boolean;
}

export interface Stats {
  sounds: number;
  alerts: number;
  rescued: number;
  total: number;
}

/** Owners whose sounds Listeners react to (DESIGN.md decision 5). */
function heardByThreats(owner: Owner, kind: SoundKind): boolean {
  if (owner === 'player' || owner === 'cart' || owner === 'swarm') return true;
  return owner === 'tourist' && kind === 'call';
}

export class Game {
  readonly level: Level;
  readonly diff: Difficulty;
  readonly rng: Rng;
  readonly fields: FieldCache;
  readonly memory: Memory;
  readonly attract: boolean;
  t = 0;
  status: GameStatus = 'playing';
  failReason = '';
  endedAt = 0;
  player: Player;
  listeners: Listener[] = [];
  tourists: Tourist[] = [];
  swarms: Swarm[] = [];
  mimics: Mimic[] = [];
  carts: Cart[] = [];
  stones: Stone[] = [];
  pulses: Pulse[] = [];
  events: GameEvent[] = [];
  stats: Stats;
  exitKnown = false;
  /** 1 for tiles inside a waterfall's noise zone. */
  readonly zone: Uint8Array;
  /** Boundary walls inside a waterfall zone (always faintly lit). */
  private readonly zoneWalls: number[] = [];
  /** Latest checkpoint (Guide difficulty). */
  checkpoint: Checkpoint | null = null;
  /** Debug: field of the last pulse. */
  lastField: Field | null = null;
  /** Path distance to the nearest Listener (heartbeat), Infinity if none within 13. */
  nearestThreat = Infinity;
  /** Passable tiles within 6 path tiles of the player (reverb room size). */
  roomSize = 0;
  private playerField: Field | null = null;
  private playerFieldTile = -1;
  private nextWind: number;
  private nextDrips: number[];
  private nextAttract = 0.2;
  private pulseId = 1;

  constructor(opts: GameOptions) {
    const { level, difficulty } = opts;
    this.level = level;
    this.diff = difficulty;
    this.attract = !!opts.attract;
    this.rng = new Rng(opts.seed ?? ((Math.random() * 2 ** 32) >>> 0));
    this.fields = new FieldCache(level);
    this.memory = new Memory(level, this.attract ? 1.6 : difficulty.memoryTau);
    const w = level.w;
    const sx = (level.start % w) + 0.5;
    const sy = ((level.start / w) | 0) + 0.5;
    this.player = new Player(sx, sy, stonesFor(level.meta.stones, difficulty));
    this.player.trail.push({ x: sx, y: sy });
    this.player.onExit = level.start === level.exit;

    if (!this.attract) {
      level.listeners.forEach((t, i) => this.listeners.push(new Listener(i, t, w, 0, this.rng.range(1.5, 6))));
      level.tourists.forEach((t, i) => this.tourists.push(new Tourist(i, t, w, this.rng.range(0.3, 3))));
      level.swarms.forEach((t) => this.swarms.push(new Swarm(t, w)));
      level.mimics.forEach((t) => this.mimics.push(new Mimic(t, w)));
      level.carts.forEach((t) => this.carts.push(new Cart(t, w)));
    }
    this.stats = { sounds: 0, alerts: 0, rescued: 0, total: this.tourists.length };

    // Waterfall noise zones (path distance, so noise doesn't pass walls either).
    this.zone = new Uint8Array(w * level.h);
    for (const f of level.waterfalls) {
      const field = this.fields.get(f, WATERFALL_ZONE);
      for (let i = 0; i < field.dist.length; i++) if (field.dist[i] <= WATERFALL_ZONE) this.zone[i] = 1;
    }
    if (level.waterfalls.length) {
      for (let k = 0; k < level.boundary.length; k++) {
        for (let j = level.nbrStart[k]; j < level.nbrStart[k + 1]; j++) {
          if (this.zone[level.nbr[j]]) { this.zoneWalls.push(k); break; }
        }
      }
    }

    this.nextWind = 0.6;
    this.nextDrips = level.drips.map(() => this.rng.range(0.2, DRIP_EVERY));

    if (opts.checkpoint) this.applyCheckpoint(opts.checkpoint);
  }

  // ------------------------------------------------------------------ events & sounds

  push(ev: GameEvent): void {
    this.events.push(ev);
  }

  /** Make a sound: creates the pulse, lets threats hear it, records an event. */
  emit(spec: EmitSpec): Pulse {
    const level = this.level;
    const tile = tileAt(level, spec.x, spec.y);
    let hear = heardByThreats(spec.owner, spec.kind) ? spec.hear : 0;
    if (hear > 0 && this.zone[tile]) hear = Math.min(hear, WATERFALL_MASK_HEAR);
    const limit = Math.max(spec.radius, hear * this.diff.hearing) + RING_END_PAD;
    const field = spec.owner === 'ambient' ? this.fields.get(tile, limit) : computeField(level, tile, limit);
    const pulse = createPulse(level, {
      id: this.pulseId++,
      kind: spec.kind,
      owner: spec.owner,
      x: spec.x,
      y: spec.y,
      tile,
      radius: spec.radius,
      hear,
      start: this.t,
      field,
      cone: spec.cone ?? null,
      fake: !!spec.fake,
      mat: level.mat[tile] as Mat,
    });
    this.pulses.push(pulse);
    if (spec.owner !== 'ambient' && spec.owner !== 'attract') this.lastField = field;
    if (spec.owner === 'player') this.stats.sounds++;

    if (hear > 0 && this.status === 'playing') {
      const reach = hear * this.diff.hearing;
      for (const L of this.listeners) {
        const lt = tileAt(level, L.x, L.y);
        if (this.zone[lt]) continue; // the waterfall drowns everything out
        if (field.dist[lt] <= reach && L.hear(pulse, this.t)) {
          this.stats.alerts++;
          this.push({ type: 'alert', x: L.x, y: L.y });
        }
      }
    }
    if (spec.owner === 'player') for (const m of this.mimics) mimicHear(this, m, pulse);
    this.push({ type: 'sound', pulse });
    return pulse;
  }

  // ------------------------------------------------------------------ hands & carts

  tryGrabTourist(p: Player): boolean {
    let best: Tourist | null = null;
    let bestD = HAND_REACH;
    for (const T of this.tourists) {
      if (T.state === 'safe' || T.state === 'held') continue;
      const d = Math.hypot(T.x - p.x, T.y - p.y);
      if (d <= bestD) { bestD = d; best = T; }
    }
    if (!best) return false;
    best.state = 'held';
    p.holding = best;
    p.graceUntil = 0;
    p.trail = [{ x: best.x, y: best.y }, { x: p.x, y: p.y }];
    if (!best.met) {
      best.met = true;
      if (this.diff.checkpoints) this.checkpoint = this.snapshot();
    }
    this.push({ type: 'hand', held: true });
    return true;
  }

  releaseTourist(T: Tourist): void {
    if (this.player.holding === T) this.player.holding = null;
    if (T.state === 'held') {
      T.state = 'waiting';
      T.releasedAt = this.t;
    }
    this.push({ type: 'hand', held: false });
  }

  tryPushCart(p: Player): boolean {
    for (const c of this.carts) {
      if (c.rolling) continue;
      if (Math.hypot(c.x - p.x, c.y - p.y) > CART_REACH) continue;
      if (pushCart(this, c, p.x, p.y)) return true;
      this.push({ type: 'message', text: "The cart won't roll that way." });
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ checkpoints

  snapshot(): Checkpoint {
    const p = this.player;
    return {
      x: p.x,
      y: p.y,
      stones: p.stones,
      t: this.t,
      sounds: this.stats.sounds,
      alerts: this.stats.alerts,
      rescued: this.tourists.filter((T) => T.state === 'safe').map((T) => T.index),
      held: p.holding ? p.holding.index : null,
    };
  }

  private applyCheckpoint(c: Checkpoint): void {
    const p = this.player;
    p.x = c.x;
    p.y = c.y;
    p.stones = c.stones;
    p.trail = [{ x: c.x, y: c.y }];
    p.onExit = tileAt(this.level, c.x, c.y) === this.level.exit;
    this.t = c.t;
    this.stats.sounds = c.sounds;
    this.stats.alerts = c.alerts;
    for (const i of c.rescued) {
      const T = this.tourists[i];
      if (T) { T.state = 'safe'; T.met = true; }
    }
    this.stats.rescued = c.rescued.length;
    if (c.held !== null && this.tourists[c.held]) {
      const T = this.tourists[c.held];
      T.x = c.x;
      T.y = c.y;
      T.state = 'held';
      T.met = true;
      p.holding = T;
    }
    this.checkpoint = c;
    // Listeners restart their timers relative to the restored clock.
    for (const L of this.listeners) L.growlAt = this.t + this.rng.range(1.5, 6);
    for (const T of this.tourists) T.nextBreath = this.t + this.rng.range(0.3, 3);
    this.nextWind = this.t + 0.6;
    this.nextDrips = this.nextDrips.map(() => this.t + this.rng.range(0.2, DRIP_EVERY));
  }

  // ------------------------------------------------------------------ update

  update(dt: number, a: Actions): void {
    this.t += dt;
    if (this.status === 'playing') {
      if (this.attract) this.updateAttract();
      else this.updateWorld(dt, a);
    }
    this.updatePulses();
    this.memory.decay(dt, this.t);
    const f = this.memory.factor(dt);
    for (const L of this.listeners) L.seen *= f;
    for (const T of this.tourists) T.seen *= f;
    for (const s of this.swarms) s.seen *= f;
    for (const c of this.carts) c.seen *= f;
    for (const k of this.zoneWalls) {
      if (this.memory.bright[k] < 0.16) {
        this.memory.bright[k] = 0.16;
        this.memory.kind[k] = KIND_INDEX.drip;
      }
    }
  }

  private updateWorld(dt: number, a: Actions): void {
    const level = this.level;
    const p = this.player;
    updatePlayer(this, p, a, dt);
    updateStones(this, dt);
    for (const T of this.tourists) updateTourist(this, T, p, dt);
    for (const L of this.listeners) updateListener(this, L, dt);
    for (const s of this.swarms) updateSwarm(this, s, dt);
    for (const m of this.mimics) updateMimic(this, m);
    for (const c of this.carts) updateCart(this, c, dt);

    // Ambient: exit wind and drips.
    if (this.t >= this.nextWind) {
      this.nextWind = this.t + WIND_EVERY;
      const ex = (level.exit % level.w) + 0.5;
      const ey = ((level.exit / level.w) | 0) + 0.5;
      this.emit({ kind: 'wind', owner: 'ambient', x: ex, y: ey, radius: WIND_RADIUS, hear: 0 });
    }
    level.drips.forEach((d, i) => {
      if (this.t >= this.nextDrips[i]) {
        this.nextDrips[i] = this.t + DRIP_EVERY;
        this.emit({ kind: 'drip', owner: 'ambient', x: (d % level.w) + 0.5, y: ((d / level.w) | 0) + 0.5, radius: DRIP_RADIUS, hear: 0 });
      }
    });

    // Falling, getting caught, reaching the exit.
    const pt = tileAt(level, p.x, p.y);
    if (level.pit[pt]) {
      this.fail('Fell.');
      this.push({ type: 'fell' });
      return;
    }
    for (const L of this.listeners) {
      if (Math.hypot(L.x - p.x, L.y - p.y) < LISTENER_CATCH) {
        L.seen = 1;
        this.fail('Heard.');
        this.push({ type: 'caught', x: L.x, y: L.y });
        return;
      }
    }
    const onExit = pt === level.exit;
    if (onExit && !p.onExit) this.enterExit();
    p.onExit = onExit;

    this.updateThreatSense();
  }

  /** Stepping onto the exit (DESIGN.md decision 7). */
  private enterExit(): void {
    const p = this.player;
    this.exitKnown = true;
    if (p.holding) {
      const T = p.holding;
      T.state = 'safe';
      p.holding = null;
      this.stats.rescued++;
      this.push({ type: 'delivered', rescued: this.stats.rescued, total: this.stats.total });
      if (this.stats.rescued < this.stats.total) {
        this.push({ type: 'message', text: 'Tourist safe. Step onto the exit again to leave, or go back for the others.' });
        return;
      }
    }
    this.status = 'won';
    this.endedAt = this.t;
    this.push({ type: 'won' });
  }

  private fail(reason: string): void {
    this.status = 'failed';
    this.failReason = reason;
    this.endedAt = this.t;
  }

  /** Heartbeat distance and reverb room size, from a field around the player. */
  private updateThreatSense(): void {
    const level = this.level;
    const pt = tileAt(level, this.player.x, this.player.y);
    if (pt !== this.playerFieldTile) {
      this.playerFieldTile = pt;
      this.playerField = computeField(level, pt, 13);
      let room = 0;
      const d = this.playerField.dist;
      for (let i = 0; i < d.length; i++) if (d[i] <= 6) room++;
      this.roomSize = room;
    }
    let nearest = Infinity;
    const field = this.playerField!;
    for (const L of this.listeners) {
      const v = field.dist[tileAt(level, L.x, L.y)];
      if (v < nearest) nearest = v;
    }
    this.nearestThreat = nearest;
  }

  /** Path distance from the player to a tile (Infinity beyond 13 tiles). */
  pathFromPlayer(tile: number): number {
    return this.playerField ? this.playerField.dist[tile] : Infinity;
  }

  private updateAttract(): void {
    if (this.t < this.nextAttract) return;
    this.nextAttract = this.t + this.rng.range(0.6, 1.2);
    const level = this.level;
    let tile = -1;
    for (let tries = 0; tries < 50 && tile < 0; tries++) {
      const i = this.rng.int(level.w * level.h);
      if (!level.solid[i]) tile = i;
    }
    if (tile < 0) return;
    const kinds: SoundKind[] = ['clap', 'drip', 'wind', 'step', 'stone', 'growl'];
    const kind = this.rng.pick(kinds);
    this.emit({
      kind, owner: 'attract', x: (tile % level.w) + 0.5, y: ((tile / level.w) | 0) + 0.5,
      radius: kind === 'clap' ? 12 : this.rng.range(5, 9), hear: 0,
    });
  }

  // ------------------------------------------------------------------ pulses → memory

  private updatePulses(): void {
    const level = this.level;
    const mem = this.memory;
    const now = this.t;
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      const r = ringRadius(p, now);
      const kindIdx = KIND_INDEX[p.kind];
      const base = wallBrightness(r, p.radius) * p.bright;

      forEachLitWall(p, r, (k) => {
        const tile = level.boundary[k];
        const b = level.mossy[tile] ? base * 0.5 : base;
        mem.lightWall(k, b, kindIdx, now, p.fake);
      });

      forEachWaveTile(p, r, 0.9, (tile) => {
        const f = level.featureIndex[tile];
        if (f < 0) return;
        if (level.pit[tile]) {
          if (p.fake) mem.eraseFeature(f);
          else mem.lightFeature(f, base * 0.9, kindIdx);
        } else {
          mem.lightFeature(f, base, kindIdx);
        }
      });

      const dist = p.field.dist;
      const reveals = (tile: number): boolean => {
        const d = dist[tile];
        return d <= p.radius && Math.abs(r - d) < ENTITY_BAND && tileInCone(level, p, tile);
      };
      if (!this.exitKnown && reveals(level.exit)) this.exitKnown = true;
      for (const L of this.listeners) {
        if (reveals(tileAt(level, L.x, L.y))) L.seen = Math.max(L.seen, Math.max(0.55, base));
      }
      for (const T of this.tourists) {
        if (T.state !== 'safe' && reveals(tileAt(level, T.x, T.y))) T.seen = Math.max(T.seen, Math.max(0.55, base));
      }
      for (const c of this.carts) {
        if (reveals(c.at)) c.seen = Math.max(c.seen, Math.max(0.5, base));
      }
      for (const s of this.swarms) {
        if (reveals(s.tile)) s.seen = Math.max(s.seen, Math.max(0.5, base));
        if (
          s.state === 'roosted' && p.owner !== 'swarm' && p.radius >= SWARM_TRIGGER_RADIUS &&
          dist[s.tile] <= p.radius && r >= dist[s.tile] && this.status === 'playing' && !this.attract
        ) {
          startleSwarm(this, s);
        }
      }

      advanceFloorWindow(p, r);
      if (pulseFinished(p, now)) {
        p.done = true;
        this.pulses.splice(i, 1);
      }
    }
  }

  /** Drain events (host calls this once per frame). */
  drainEvents(): GameEvent[] {
    const ev = this.events;
    this.events = [];
    return ev;
  }
}
