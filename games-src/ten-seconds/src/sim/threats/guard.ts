/**
 * Guards walk a route, turn toward where they're going, investigate noises (lures, coins), wait
 * facing the noise with a slow sweep, and walk back. The Auditor is a guard with a watch: at the
 * start of each loop he walks to where the newest copy ended its loop, waits, then takes his route.
 */
import { AUDITOR_WAIT, CONE_HALF, CONE_LEN, GUARD_RUN, GUARD_SPEED, GUARD_SWEEP, GUARD_TURN, GUARD_WAIT, HZ, NEAR } from '../constants';
import type { GuardDef } from '../level';
import { endPoint } from '../recording';
import { findPath, pathDistance } from '../path';
import { angleDiff, inCone, losClear } from '../vision';
import type { Caught, World } from '../world';

export type GuardMode = 'route' | 'pause' | 'go' | 'wait' | 'back';

export interface GuardState {
  def: GuardDef;
  auditor: boolean;
  /** index within its list (guards or auditors), for messages */
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  face: number;
  mode: GuardMode;
  routeI: number;
  dir: 1 | -1;
  path: [number, number][];
  pathI: number;
  speed: number;
  until: number;
  waitTicks: number;
  lookX: number;
  lookY: number;
  sweepT0: number;
  resumeX: number;
  resumeY: number;
  hasResume: boolean;
  /** alerted by a noise (shown as a "?" over the guard) */
  alerted: boolean;
}

export function initGuard(w: World, def: GuardDef, index: number, auditor: boolean): GuardState {
  const x = def.x + 0.5;
  const y = def.y + 0.5;
  const first = def.route[def.toward] ?? def.route[0];
  const face = def.face ?? (first && (first[0] + 0.5 !== x || first[1] + 0.5 !== y) ? Math.atan2(first[1] + 0.5 - y, first[0] + 0.5 - x) : Math.PI / 2);
  const g: GuardState = {
    def,
    auditor,
    index,
    x,
    y,
    px: x,
    py: y,
    face,
    mode: 'route',
    routeI: def.toward,
    dir: 1,
    path: [],
    pathI: 0,
    speed: GUARD_SPEED,
    until: 0,
    waitTicks: 0,
    lookX: x,
    lookY: y,
    sweepT0: 0,
    resumeX: x,
    resumeY: y,
    hasResume: false,
    alerted: false,
  };
  if (def.mode === 'pingpong' && def.route.length > 1 && def.toward === 0) g.dir = -1;
  if (auditor && w.newest >= 0) {
    const a = w.actors[w.newest];
    const [ex, ey] = endPoint(a.rec, w.lv.start[0] + 0.5, w.lv.start[1] + 0.5);
    const p = findPath(w, x, y, ex, ey);
    if (p) {
      g.mode = 'go';
      g.path = p;
      g.pathI = 0;
      g.speed = GUARD_SPEED;
      g.waitTicks = Math.round(def.wait * HZ) || AUDITOR_WAIT;
      g.lookX = ex;
      g.lookY = ey;
      g.resumeX = x;
      g.resumeY = y;
      g.hasResume = true;
    }
  }
  return g;
}

/** A noise at (x, y): go and look if it's within hearing (path distance). */
export function hearNoise(w: World, g: GuardState, x: number, y: number): void {
  const d = pathDistance(w, g.x, g.y, x, y, w.lv.hearing + 1);
  if (!(d <= w.lv.hearing)) return;
  if (g.mode === 'route' || g.mode === 'pause') {
    g.resumeX = g.x;
    g.resumeY = g.y;
    g.hasResume = true;
  }
  const p = findPath(w, g.x, g.y, x, y, true) ?? [];
  g.mode = 'go';
  g.path = p;
  g.pathI = 0;
  g.speed = GUARD_RUN;
  g.waitTicks = GUARD_WAIT;
  g.lookX = x;
  g.lookY = y;
  g.alerted = true;
}

export function updateGuard(w: World, g: GuardState): void {
  g.px = g.x;
  g.py = g.y;
  const def = g.def;
  switch (g.mode) {
    case 'route': {
      const p = def.route[g.routeI];
      if (!p || def.route.length < 2) {
        if (p && walk(w, g, p[0] + 0.5, p[1] + 0.5, GUARD_SPEED) && def.face !== null) turnTo(g, def.face);
        break;
      }
      if (walk(w, g, p[0] + 0.5, p[1] + 0.5, GUARD_SPEED)) {
        const n = def.route.length;
        if (def.mode === 'loop') g.routeI = (g.routeI + 1) % n;
        else {
          if (g.routeI + g.dir < 0 || g.routeI + g.dir >= n) g.dir = g.dir === 1 ? -1 : 1;
          g.routeI += g.dir;
        }
        if (def.pause > 0) {
          g.mode = 'pause';
          g.until = w.t + Math.round(def.pause * HZ);
        }
      }
      break;
    }
    case 'pause':
      if (w.t >= g.until) g.mode = 'route';
      break;
    case 'go': {
      const q = g.path[g.pathI];
      if (!q) {
        startWait(w, g);
        break;
      }
      if (walk(w, g, q[0], q[1], g.speed)) {
        g.pathI++;
        if (g.pathI >= g.path.length) startWait(w, g);
      }
      break;
    }
    case 'wait': {
      const base = Math.atan2(g.lookY - g.y, g.lookX - g.x);
      const want = base + GUARD_SWEEP * Math.sin(((w.t - g.sweepT0) / (2 * HZ)) * Math.PI * 2);
      turnTo(g, want);
      if (w.t >= g.until) {
        g.alerted = false;
        if (g.hasResume) {
          g.mode = 'back';
          g.path = findPath(w, g.x, g.y, g.resumeX, g.resumeY) ?? [];
          g.pathI = 0;
        } else g.mode = 'route';
      }
      break;
    }
    case 'back': {
      const q = g.path[g.pathI];
      if (!q || walk(w, g, q[0], q[1], GUARD_SPEED)) {
        if (q) g.pathI++;
        if (!q || g.pathI >= g.path.length) {
          g.mode = 'route';
          g.hasResume = false;
        }
      }
      break;
    }
  }
}

function startWait(w: World, g: GuardState): void {
  g.mode = 'wait';
  g.until = w.t + g.waitTicks;
  g.sweepT0 = w.t;
}

function turnTo(g: GuardState, want: number): number {
  const d = angleDiff(g.face, want);
  if (Math.abs(d) <= GUARD_TURN) g.face = want;
  else g.face += Math.sign(d) * GUARD_TURN;
  return Math.abs(d);
}

/** Step toward (tx, ty); turns first when facing far off. True on arrival. */
function walk(w: World, g: GuardState, tx: number, ty: number, speed: number): boolean {
  const dx = tx - g.x;
  const dy = ty - g.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return true;
  const off = turnTo(g, Math.atan2(dy, dx));
  if (off > 0.6) return false;
  const s = Math.min(speed, d);
  const nx = g.x + (dx / d) * s;
  const ny = g.y + (dy / d) * s;
  // a closed door in the way: wait for it
  const ax = Math.floor(nx + (dx / d) * 0.4);
  const ay = Math.floor(ny + (dy / d) * 0.4);
  if (w.doorClosedAt(ax, ay)) return false;
  g.x = nx;
  g.y = ny;
  return s >= d - 1e-9;
}

export function guardDetect(w: World, g: GuardState): Caught | null {
  for (const a of w.actors) {
    const d = Math.hypot(a.x - g.x, a.y - g.y);
    let seen = false;
    if (d < NEAR + 0.2) seen = losClear(w, g.x, g.y, a.x, a.y);
    else seen = inCone(w, g.x, g.y, g.face, CONE_HALF, CONE_LEN, a.x, a.y);
    if (seen) return { by: g.auditor ? 'auditor' : 'guard', index: g.index, actor: a.idx, t: w.t, x0: g.x, y0: g.y, x1: a.x, y1: a.y };
  }
  return null;
}
