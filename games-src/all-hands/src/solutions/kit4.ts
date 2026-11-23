/**
 * Moves the world-4 solutions share (Funhouse: moving platforms and scales), built on dsl.ts.
 * Targets can be functions of the world, so a bot can walk to or jump onto something that moves.
 */
import { In, type Body } from '../sim/types';
import type { World } from '../sim/world';
import type { Action } from './dsl';

type X = number | ((w: World) => number);
const at = (x: X, w: World) => (typeof x === 'number' ? x : x(w));
const centre = (b: Body) => b.x + b.w / 2;
const standing = (b: Body) => !!b.support && b.vy >= 0;

/** The box of moving platform i (in reading order of the level's M groups). */
export function ferry(w: World, i = 0): { x: number; y: number; w: number; h: number } {
  return (w.things.filter((t) => t.kind === 'mover')[i] as unknown as { box: { x: number; y: number; w: number; h: number } }).box;
}

/** How far moving platform i is along its loop (tiles from path[0]). */
export function ferryS(w: World, i = 0): number {
  return (w.things.filter((t) => t.kind === 'mover')[i] as unknown as { s: number }).s;
}

/** A position on ferry i: `off` tiles from its left edge. */
export const onFerry =
  (off: number, i = 0) =>
  (w: World) =>
    ferry(w, i).x + off;

/** Centre x of player n (1..4). */
export const of = (n: number) => (w: World) => centre(w.players[n - 1]);

/** walk() to a target that may move (a spot on a ferry, a friend). */
export function walkTo(x: X, tol = 0.08): Action {
  return {
    name: `walkTo`,
    limit: 60 * 30,
    tick({ w, me }) {
      const d = at(x, w) - centre(me);
      if (Math.abs(d) <= tol && Math.abs(me.vx) < 0.6) return null;
      const stop = (me.vx * me.vx) / 120 + 0.02;
      if (Math.abs(d) <= stop && Math.sign(me.vx) === Math.sign(d)) return 0;
      if (Math.abs(d) <= tol) return 0;
      return d > 0 ? In.Right : In.Left;
    },
  };
}

/**
 * jumpTo() with a target that may move; done on landing. With `above`, no steering until your
 * feet are above that height (so you don't bump your head on a friend's overhang).
 */
export function leap(x: X, hold = 24, above?: (w: World) => number): Action {
  return {
    name: `leap`,
    limit: 60 * 6,
    tick({ w, me, t, s }) {
      const c = centre(me);
      const d = at(x, w) - c;
      const free = !above || me.y + me.h < above(w);
      if (t === 0) {
        s.left = 0;
        return In.Jump | (free ? (d > 0.04 ? In.Right : d < -0.04 ? In.Left : 0) : 0);
      }
      if (!standing(me)) s.left = 1;
      if (s.left && standing(me) && t > 4) return null;
      if (t > 40 && standing(me)) return null;
      let steer = 0;
      const stop = (me.vx * me.vx) / 70 + 0.03;
      if (free && Math.abs(d) > 0.06 && !(Math.abs(d) <= stop && Math.sign(me.vx) === Math.sign(d))) steer = d > 0 ? In.Right : In.Left;
      return (t < hold ? In.Jump : 0) | steer;
    },
  };
}

/** Run toward `x` and take off once your centre passes `from`, steering to land at x. */
export function runJump(from: number, x: X): Action {
  const j = leap(x);
  return {
    name: `runJump(${from})`,
    limit: 60 * 10,
    tick(c) {
      if (!c.s.go) {
        const dir = at(x, c.w) > from ? 1 : -1;
        const cx = centre(c.me);
        if (dir > 0 ? cx < from : cx > from) return dir > 0 ? In.Right : In.Left;
        c.s.go = 1;
        c.s.t0 = c.t;
      }
      return j.tick({ ...c, t: c.t - c.s.t0 });
    },
  };
}

/**
 * Jump onto friend n's head (1..4), wherever they are going. If you're tucked under their
 * overhang, first step back so the jump doesn't bump your head.
 */
export function climb(n: number): Action {
  const j = leap(of(n), 24, (w) => w.players[n - 1].y - 0.02);
  return {
    name: `climb(P${n})`,
    limit: 60 * 8,
    tick(c) {
      const f = c.w.players[n - 1];
      if (!c.s.go) {
        const dx = centre(f) - centre(c.me);
        if (Math.abs(dx) < 0.93 && c.t < 30) return dx > 0 ? In.Left : In.Right;
        c.s.go = 1;
        c.s.t0 = c.t;
      }
      return j.tick({ ...c, t: c.t - c.s.t0 });
    },
  };
}

/** Walk off a ledge toward `dir`, then steer to land with your centre at x; done on landing. */
export function stepOff(dir: 1 | -1, x: number): Action {
  return {
    name: `stepOff(${dir}, ${x})`,
    limit: 60 * 6,
    tick({ me, s }) {
      if (!s.air) {
        if (!standing(me)) s.air = 1;
        else return dir > 0 ? In.Right : In.Left;
      }
      s.n = (s.n ?? 0) + 1;
      if (s.n > 3 && standing(me)) return null;
      const d = x - centre(me);
      const stop = (me.vx * me.vx) / 70 + 0.03;
      if (Math.abs(d) <= 0.06 || (Math.abs(d) <= stop && Math.sign(me.vx) === Math.sign(d))) return 0;
      return d > 0 ? In.Right : In.Left;
    },
  };
}
