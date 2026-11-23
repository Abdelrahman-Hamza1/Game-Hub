import { drop, enter, face, grab, hop, jumpTo, step, throwIt, until, wait, walk, type Solution } from './dsl';
import { In, type Body } from '../sim/types';
import type { World } from '../sim/world';
import type { Action } from './dsl';

const centre = (b: Body) => b.x + b.w / 2;
const steer = (b: Body, x: number) => {
  const d = x - centre(b);
  const stop = (b.vx * b.vx) / 70 + 0.03;
  if (Math.abs(d) <= 0.06 || (Math.abs(d) <= stop && Math.sign(b.vx) === Math.sign(d))) return 0;
  return d > 0 ? In.Right : In.Left;
};
/** A full jump straight up (holding x0) until the feet are above y, then steer to x; done on landing. */
const upThen = (x0: number, y: number, x: number): Action => ({
  name: `up then ${x}`,
  limit: 60 * 4,
  tick({ me, t, s }) {
    if (t === 0) return In.Jump | steer(me, x0);
    if (!(me.support && me.vy >= 0)) s.left = 1;
    if (s.left && me.support && me.vy >= 0) return null;
    const j = t < 24 ? In.Jump : 0;
    if (!s.free && me.y + me.h > y) return j | steer(me, x0);
    s.free = 1;
    return j | steer(me, x);
  },
});

// Pans: B (x=4-6, the rider's) and A (x=22-30). P1 crosses to the shelf side first; P2, P3 and P4
// (holding the floor crate) stand on pan A (4 vs 0: pan B rises 3). P1 hops
// onto the step at x=7-8 and over onto pan B (4 vs 1 keeps it at +3), then up onto the shelf.
// P1 opens the door first (so nobody picks the key up instead of a crate); each crate P1 then
// throws down onto pan A lets one more climber hop out of A and follow.
const pan = (w: World, i: number) => w.things.filter((t) => t.kind === 'pan')[i] as unknown as { box: { y: number }; weight: number };
const panBUp = until((w) => pan(w, 0).box.y <= 16.02, 'pan B up');
const heavyA = (n: number) => until((w) => pan(w, 1).weight >= n, `pan A ${n}`);
// from the floor under the shelf: onto the step, over onto pan B, up onto the shelf
const climb = (shelfX: number) => [walk(9.6), jumpTo(8.0), walk(7.46), panBUp, jumpTo(5.5), walk(5.9), upThen(5.9, 13.95, shelfX)];
const toss = (x: number) => [walk(x), face(-1), grab(), walk(17.4), face(1), throwIt()];
const out = [walk(22.5), jumpTo(20.4), walk(12)];

const px = (n: number) => (w: World) => w.players[n - 1].x + 0.45;

export default {
  steps: [
    step({ 1: [walk(33.5), jumpTo(30.5), walk(21.3), walk(12)] }),
    // onto pan A, keeping clear of where thrown crates land (x~24-25): P2 and P3 on the left, P4
    // on the right holding the floor crate on its head (carried weight counts)
    step({
      2: [walk(33.6), jumpTo(30.5), walk(22.55)],
      3: [until((w) => px(2)(w) < 30, 'P2 on A'), walk(33.6), jumpTo(30.5), walk(23.5)],
      4: [until((w) => px(3)(w) < 30, 'P3 on A'), walk(32.95), face(-1), grab(), hop(-1), walk(25.9)],
    }),
    // P1 up, over the crates to the key, opens the door (that uses the key up), then throws the
    // crates down onto pan A from the shelf's right end, right to left
    step({ 1: [...climb(8.5), jumpTo(13.5), walk(16.5), ...toss(13.45)] }),
    step({ 2: [heavyA(5), ...out, ...climb(8.5), walk(9.5)] }),
    step({ 1: toss(12.45) }),
    step({ 3: [heavyA(5), ...out, ...climb(8.5), walk(8.5)] }),
    // P4 sets its crate down on the right and hops left over the two-crate stack
    step({ 4: [face(1), drop(), jumpTo(22.6)] }),
    step({ 1: toss(11.45) }),
    step({ 2: walk(14.6), 3: [wait(0.3), walk(13.6)], 4: [heavyA(5), ...out, ...climb(8.5)] }),
    step({ 1: [walk(16.5), enter()] }),
    step({ 2: [walk(16.5), enter()] }),
    step({ 3: [walk(16.5), enter()] }),
    step({ 4: [walk(16.5), enter()] }),
  ],
} satisfies Solution;
