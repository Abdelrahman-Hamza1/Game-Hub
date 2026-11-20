/**
 * Listener (brief §3.5): blind, hunts by sound. patrol → hunt → search → patrol.
 * Movement is always "walk downhill on a field": the heard pulse's field when hunting, a cached
 * field from the patrol target otherwise. Paths around walls come for free.
 */
import type { Game } from '../game/game';
import {
  LISTENER_GROWL_MAX, LISTENER_GROWL_MIN, LISTENER_GROWL_RADIUS, LISTENER_HUNT_SPEED,
  LISTENER_PATROL_RANGE, LISTENER_PATROL_REPICK, LISTENER_PATROL_SPEED, LISTENER_SEARCH_SPEED,
  LISTENER_SEARCH_TIME,
} from '../game/constants';
import { DIRS8, canStep } from '../world/grid';
import { downhill, type Field } from '../sound/propagation';
import type { Pulse } from '../sound/pulses';

export type ListenerState = 'patrol' | 'hunt' | 'search';

export class Listener {
  x: number;
  y: number;
  /** Tile it last stood on the centre of. */
  at: number;
  /** Tile it's walking to (adjacent to `at`), or −1. */
  next = -1;
  state: ListenerState = 'patrol';
  /** Field it walks downhill on. */
  field: Field | null = null;
  patrolTarget = -1;
  stateSince = 0;
  searchUntil = 0;
  growlAt: number;
  /** Visibility from echoes, 0..1 (fades like wall memory). */
  seen = 0;
  /** Number of times it has heard something (debug). */
  heardCount = 0;
  /** Where the sound it's hunting came from (debug overlay). */
  huntSource = -1;

  constructor(readonly index: number, tile: number, w: number, now: number, growlOffset: number) {
    this.at = tile;
    this.x = (tile % w) + 0.5;
    this.y = ((tile / w) | 0) + 0.5;
    this.growlAt = now + growlOffset;
  }

  /** A sound reached it. Returns true if this switched it into hunting (an alert). */
  hear(pulse: Pulse, now: number): boolean {
    const wasHunting = this.state === 'hunt';
    this.state = 'hunt';
    this.field = pulse.field;
    this.huntSource = pulse.tile;
    this.stateSince = now;
    this.heardCount++;
    return !wasHunting;
  }
}

export function updateListener(g: Game, L: Listener, dt: number): void {
  const level = g.level;
  const now = g.t;

  // Growl: the player's main way to track it.
  if (now >= L.growlAt) {
    L.growlAt = now + g.rng.range(LISTENER_GROWL_MIN, LISTENER_GROWL_MAX);
    g.emit({ kind: 'growl', owner: 'listener', x: L.x, y: L.y, radius: LISTENER_GROWL_RADIUS, hear: 0 });
  }

  switch (L.state) {
    case 'patrol': {
      if (!L.field || L.patrolTarget < 0 || now - L.stateSince > LISTENER_PATROL_REPICK) pickPatrol(g, L);
      if (walk(g, L, LISTENER_PATROL_SPEED, dt)) pickPatrol(g, L);
      break;
    }
    case 'hunt': {
      if (walk(g, L, LISTENER_HUNT_SPEED, dt)) {
        L.state = 'search';
        L.stateSince = now;
        L.searchUntil = now + LISTENER_SEARCH_TIME;
        L.field = null;
        L.next = -1;
      }
      break;
    }
    case 'search': {
      if (now >= L.searchUntil && L.next < 0) {
        L.state = 'patrol';
        L.stateSince = now;
        L.field = null;
        pickPatrol(g, L);
        break;
      }
      if (L.next < 0) {
        // small random steps
        const x = L.at % level.w;
        const y = (L.at / level.w) | 0;
        const options = DIRS8.filter((d) => canStep(level, x, y, d));
        if (options.length) {
          const d = g.rng.pick(options);
          L.next = (y + d.dy) * level.w + (x + d.dx);
        }
      }
      stepToward(g, L, LISTENER_SEARCH_SPEED, dt);
      break;
    }
  }
}

/** Choose a random tile within 7 path tiles and the field leading to it. */
function pickPatrol(g: Game, L: Listener): void {
  const around = g.fields.get(L.at, LISTENER_PATROL_RANGE);
  const candidates: number[] = [];
  for (let i = 0; i < around.dist.length; i++) {
    const d = around.dist[i];
    if (d >= 1.5 && d <= LISTENER_PATROL_RANGE) candidates.push(i);
  }
  L.stateSince = g.t;
  if (!candidates.length) {
    L.patrolTarget = L.at;
    L.field = around;
    return;
  }
  L.patrolTarget = g.rng.pick(candidates);
  L.field = g.fields.get(L.patrolTarget, LISTENER_PATROL_RANGE + 1);
}

/** Walk downhill on L.field. Returns true when it has arrived (no lower neighbour). */
function walk(g: Game, L: Listener, speed: number, dt: number): boolean {
  if (!L.field) return true;
  if (L.next < 0) {
    L.next = downhill(g.level, L.field, L.at);
    if (L.next < 0) return true;
  }
  stepToward(g, L, speed, dt);
  return false;
}

/** Move toward the centre of L.next; on reaching it, it becomes L.at. */
function stepToward(g: Game, L: Listener, speed: number, dt: number): void {
  if (L.next < 0) return;
  const w = g.level.w;
  const tx = (L.next % w) + 0.5;
  const ty = ((L.next / w) | 0) + 0.5;
  const dx = tx - L.x;
  const dy = ty - L.y;
  const d = Math.hypot(dx, dy);
  const step = speed * dt;
  if (d <= step) {
    L.x = tx;
    L.y = ty;
    L.at = L.next;
    L.next = -1;
  } else {
    L.x += (dx / d) * step;
    L.y += (dy / d) * step;
  }
}
