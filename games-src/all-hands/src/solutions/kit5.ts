/**
 * Moves the world-5 solutions share (Night Market), built on dsl.ts: a running jump, a hop onto
 * a spring, and "hold a direction until something happens" for team pushes.
 */
import { In, type Body } from '../sim/types';
import type { World } from '../sim/world';
import type { Action } from './dsl';

const centre = (b: Body) => b.x + b.w / 2;
const standing = (b: Body) => !!b.support && b.vy >= 0;

function steer(me: Body, x: number): number {
  const d = x - centre(me);
  const stop = (me.vx * me.vx) / 70 + 0.03;
  if (Math.abs(d) <= 0.06 || (Math.abs(d) <= stop && Math.sign(me.vx) === Math.sign(d))) return 0;
  return d > 0 ? In.Right : In.Left;
}

/**
 * A running jump: run toward `x`, take off once your centre passes `from` (a spot near the edge),
 * and steer to land at `x`. Done on landing. Start a tile or two behind `from` to get up to speed.
 */
export function runJump(from: number, x: number, hold = 24): Action {
  const dir = x > from ? 1 : -1;
  return {
    name: `runJump(${from}, ${x})`,
    limit: 60 * 8,
    tick({ me, t, s }) {
      const c = centre(me);
      if (!s.off) {
        if ((dir > 0 ? c >= from : c <= from) && standing(me)) {
          s.off = 1;
          s.t0 = t;
          return In.Jump | (dir > 0 ? In.Right : In.Left);
        }
        return dir > 0 ? In.Right : In.Left;
      }
      if (!standing(me)) s.air = 1;
      if (s.air && standing(me)) return null;
      return (t - s.t0 < hold ? In.Jump : 0) | steer(me, x);
    },
  };
}

/** Hop onto a spring centred near `xs` (a short jump), then once launched steer to land at `x`. */
export function spring(xs: number, x: number, hopHold = 6): Action {
  return {
    name: `spring(${xs}, ${x})`,
    limit: 60 * 6,
    tick({ me, t, s }) {
      if (t === 0) return In.Jump | (xs > centre(me) ? In.Right : In.Left);
      if (me.vy < -21) s.up = 1; // a spring launch, not the hop itself
      if (s.up && standing(me)) return null;
      return (t < hopHold ? In.Jump : 0) | steer(me, s.up ? x : xs);
    },
  };
}

/** Hold a direction (0: stand still) until `done(world)`. */
export function holdUntil(dir: 1 | -1 | 0, done: (w: World) => boolean, label = 'holdUntil', limitS = 30): Action {
  return {
    name: label,
    limit: 60 * limitS,
    tick: ({ w }) => (done(w) ? null : dir > 0 ? In.Right : dir < 0 ? In.Left : 0),
  };
}

/** The first heavy block. */
export const block = (w: World, i = 0) => w.bodies.filter((b) => b.kind === 'block')[i];
