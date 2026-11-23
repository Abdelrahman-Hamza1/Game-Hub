/**
 * Scripted solutions: four bots play a level through the real simulation (tests prove every level
 * can be won; the title screen plays one as a demo).
 *
 * A solution is a list of steps. Each step gives some players a queue of actions; the step ends
 * when every queue in it is done, then the next step starts. Positions are tile x of the player's
 * centre (a player standing in column 8 has centre 8.5).
 *
 *   walk(x)           walk until your centre is at x
 *   jumpTo(x)         jump (full height) and steer to land with your centre at x; done on landing
 *   jump()            a full jump in place
 *   hop(dir)          a short running hop (for one-tile steps)
 *   push(dir, x)      hold a direction until your centre reaches x (pushing whatever is in front)
 *   hold(dir, s)      hold a direction for s seconds
 *   wait(s)           stand still for s seconds
 *   until(fn)         stand still until fn(world) is true
 *   face(dir)         turn without moving (much)
 *   grab()  throw()  drop()  enter()  escape()   one press each
 *   fall()            wait until you're standing on something
 */
import { In, type Body } from '../sim/types';
import type { World } from '../sim/world';

export interface Ctx {
  w: World;
  me: Body;
  /** ticks since this action started */
  t: number;
  /** scratch state for the action */
  s: Record<string, number>;
}

export interface Action {
  name: string;
  /** input for this tick, or null when the action is finished */
  tick(c: Ctx): number | null;
  /** give up after this many ticks (the run fails) */
  limit?: number;
}

export type Step = Partial<Record<0 | 1 | 2 | 3, Action[]>>;

export interface Solution {
  steps: Step[];
  note?: string;
}

const centre = (b: Body) => b.x + b.w / 2;
const dirTo = (from: number, to: number, dead = 0.04) => (to > from + dead ? In.Right : to < from - dead ? In.Left : 0);
const standing = (b: Body) => !!b.support && b.vy >= 0;
/** Jump was held last tick, so pressing it now wouldn't count: release for one tick first. */
const heldJump = (b: Body) => !!(b.p && b.p.prev & In.Jump);

export function walk(x: number, tol = 0.06): Action {
  return {
    name: `walk(${x})`,
    limit: 60 * 30,
    tick({ me }) {
      const c = centre(me);
      const d = x - c;
      if (Math.abs(d) <= tol && Math.abs(me.vx) < 0.6) return null;
      // brake early: at 6 tiles/s and 60 tiles/s² you need 0.3 tiles to stop
      const stop = (me.vx * me.vx) / 120 + 0.02;
      if (Math.abs(d) <= stop && Math.sign(me.vx) === Math.sign(d)) return 0;
      if (Math.abs(d) <= tol) return 0;
      return d > 0 ? In.Right : In.Left;
    },
  };
}

/** Jump and steer so your centre lands at x. `hold` ticks of jump (default: full jump). */
export function jumpTo(x: number, hold = 24): Action {
  return {
    name: `jumpTo(${x})`,
    limit: 60 * 6,
    tick({ me, t, s }) {
      if (t === 0 && heldJump(me)) {
        s.delay = 1;
        return dirTo(centre(me), x);
      }
      t -= s.delay ?? 0;
      if (t === 0) {
        s.left = 0;
        return In.Jump | dirTo(centre(me), x);
      }
      if (!standing(me)) s.left = 1;
      if (s.left && standing(me) && t > 4) return null;
      if (t > 40 && standing(me)) return null; // never left the ground: give up quietly
      const c = centre(me);
      const d = x - c;
      let steer = 0;
      // steer, braking so as not to overshoot
      const stop = (me.vx * me.vx) / 70 + 0.03;
      if (Math.abs(d) > 0.06 && !(Math.abs(d) <= stop && Math.sign(me.vx) === Math.sign(d))) steer = d > 0 ? In.Right : In.Left;
      return (t < hold ? In.Jump : 0) | steer;
    },
  };
}

export function jump(hold = 24): Action {
  return {
    name: 'jump',
    limit: 60 * 4,
    tick({ me, t, s }) {
      if (t === 0 && heldJump(me)) {
        s.delay = 1;
        return 0;
      }
      t -= s.delay ?? 0;
      if (t === 0) {
        s.left = 0;
        return In.Jump;
      }
      if (!standing(me)) s.left = 1;
      if (s.left && standing(me)) return null;
      if (t > 30 && standing(me)) return null;
      return t < hold ? In.Jump : 0;
    },
  };
}

/** A short hop while running in a direction (gets you up a one-tile step). */
export function hop(dir: 1 | -1, hold = 8): Action {
  const d = dir > 0 ? In.Right : In.Left;
  return {
    name: `hop(${dir})`,
    limit: 60 * 3,
    tick({ me, t, s }) {
      if (t === 0 && heldJump(me)) {
        s.delay = 1;
        return d;
      }
      t -= s.delay ?? 0;
      if (t === 0) {
        s.left = 0;
        return In.Jump | d;
      }
      if (!standing(me)) s.left = 1;
      if (s.left && standing(me)) return null;
      if (t > 30 && standing(me)) return null;
      return (t < hold ? In.Jump : 0) | d;
    },
  };
}

export function push(dir: 1 | -1, x: number): Action {
  return {
    name: `push(${dir}, ${x})`,
    limit: 60 * 40,
    tick({ me }) {
      const c = centre(me);
      if ((dir > 0 && c >= x) || (dir < 0 && c <= x)) return null;
      return dir > 0 ? In.Right : In.Left;
    },
  };
}

export function hold(dir: 1 | -1 | 0, seconds: number): Action {
  return {
    name: `hold(${dir}, ${seconds})`,
    tick({ t }) {
      if (t >= Math.round(seconds * 60)) return null;
      return dir > 0 ? In.Right : dir < 0 ? In.Left : 0;
    },
  };
}

export function wait(seconds: number): Action {
  return hold(0, seconds);
}

export function until(fn: (w: World) => boolean, label = 'until', limitS = 60): Action {
  return {
    name: label,
    limit: 60 * limitS,
    tick({ w }) {
      return fn(w) ? null : 0;
    },
  };
}

export function fall(): Action {
  return {
    name: 'fall',
    limit: 60 * 10,
    tick({ me, t }) {
      return t > 1 && standing(me) ? null : 0;
    },
  };
}

export function face(dir: 1 | -1): Action {
  return {
    name: `face(${dir})`,
    tick({ t }) {
      return t === 0 ? (dir > 0 ? In.Right : In.Left) : null;
    },
  };
}

const press = (name: string, bits: number): Action => ({
  name,
  tick({ t }) {
    return t === 0 ? bits : t === 1 ? 0 : null;
  },
});

export const grab = () => press('grab', In.Grab);
export const throwIt = () => press('throw', In.Grab);
export const drop = () => press('drop', In.Grab | In.Down);
export const escape = () => press('escape', In.Jump);

export function enter(): Action {
  return {
    name: 'enter',
    limit: 60 * 3,
    tick({ me, t }) {
      if (me.p!.inside) return null;
      return t % 2 === 0 ? In.Down : 0;
    },
  };
}

/** Build a step from player numbers 1..4 (as written in level notes) to action lists. */
export function step(byPlayer: Record<number, Action[] | Action>): Step {
  const out: Step = {};
  for (const [k, v] of Object.entries(byPlayer)) {
    const i = Number(k) - 1;
    if (i < 0 || i > 3) throw new Error(`players are 1..4, got ${k}`);
    out[i as 0 | 1 | 2 | 3] = Array.isArray(v) ? v : [v];
  }
  return out;
}

/** The same action list for all four. */
export function all(...a: Action[]): Step {
  return step({ 1: a, 2: [...a], 3: [...a], 4: [...a] });
}
