/**
 * Swarm (brief §3.5): a roost of ~60 tiny creatures. Harmless, but any pulse of radius ≥ 9 that
 * reaches the roost startles them: they fly off along the tunnels and their alarm (radius 14)
 * alerts every Listener in range.
 */
import type { Game } from '../game/game';
import { SWARM_ALARM_RADIUS, SWARM_COUNT, SWARM_FLIGHT_TIME, SWARM_RESETTLE } from '../game/constants';
import { DIRS8, canStep } from '../world/grid';
import type { Field } from '../sound/propagation';

export type SwarmState = 'roosted' | 'flying' | 'gone';

export interface Fleck {
  x: number;
  y: number;
  at: number;
  next: number;
  speed: number;
}

export class Swarm {
  readonly x: number;
  readonly y: number;
  state: SwarmState = 'roosted';
  until = 0;
  seen = 0;
  flecks: Fleck[] = [];

  constructor(readonly tile: number, w: number) {
    this.x = (tile % w) + 0.5;
    this.y = ((tile / w) | 0) + 0.5;
  }
}

export function startleSwarm(g: Game, s: Swarm): void {
  if (s.state !== 'roosted') return;
  s.state = 'flying';
  s.until = g.t + SWARM_FLIGHT_TIME;
  s.flecks = [];
  for (let i = 0; i < SWARM_COUNT; i++) {
    s.flecks.push({
      x: s.x + g.rng.range(-0.4, 0.4),
      y: s.y + g.rng.range(-0.4, 0.4),
      at: s.tile,
      next: -1,
      speed: g.rng.range(5, 9),
    });
  }
  g.push({ type: 'swarm', x: s.x, y: s.y });
  g.emit({ kind: 'swarm', owner: 'swarm', x: s.x, y: s.y, radius: SWARM_ALARM_RADIUS, hear: SWARM_ALARM_RADIUS });
}

export function updateSwarm(g: Game, s: Swarm, dt: number): void {
  if (s.state === 'flying') {
    const away = g.fields.get(s.tile, 40);
    for (const f of s.flecks) flyAway(g, f, away, dt);
    if (g.t >= s.until) {
      s.state = 'gone';
      s.flecks = [];
      s.until = g.t + SWARM_RESETTLE;
    }
  } else if (s.state === 'gone' && g.t >= s.until) {
    s.state = 'roosted';
  }
}

/** Each fleck wanders to neighbouring tiles that are farther from the roost. */
function flyAway(g: Game, f: Fleck, away: Field, dt: number): void {
  const level = g.level;
  const w = level.w;
  if (f.next < 0) {
    const x = f.at % w;
    const y = (f.at / w) | 0;
    const here = away.dist[f.at];
    const opts: number[] = [];
    const flat: number[] = [];
    for (const d of DIRS8) {
      if (!canStep(level, x, y, d)) continue;
      const j = (y + d.dy) * w + (x + d.dx);
      if (away.dist[j] > here) opts.push(j);
      else flat.push(j);
    }
    const list = opts.length ? opts : flat;
    if (!list.length) return;
    f.next = g.rng.pick(list);
  }
  const tx = (f.next % w) + 0.5 + Math.sin(f.speed * 13 + g.t * 9) * 0.3;
  const ty = ((f.next / w) | 0) + 0.5 + Math.cos(f.speed * 7 + g.t * 11) * 0.3;
  const dx = tx - f.x;
  const dy = ty - f.y;
  const d = Math.hypot(dx, dy);
  const step = f.speed * dt;
  if (d <= step) {
    f.x = tx;
    f.y = ty;
    f.at = f.next;
    f.next = -1;
  } else {
    f.x += (dx / d) * step;
    f.y += (dy / d) * step;
  }
}
