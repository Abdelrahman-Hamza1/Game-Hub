import { enter, hold, jumpTo, step, until, walk, type Action, type Solution } from './dsl';
import { In, type Body } from '../sim/types';
import type { World } from '../sim/world';

const centre = (b: Body) => b.x + b.w / 2;
const steer = (b: Body, x: number) => {
  const d = x - centre(b);
  const stop = (b.vx * b.vx) / 70 + 0.03;
  if (Math.abs(d) <= 0.06 || (Math.abs(d) <= stop && Math.sign(b.vx) === Math.sign(d))) return 0;
  return d > 0 ? In.Right : In.Left;
};
/**
 * Hop onto the spring at centre x0; once launched, steer to x1 until the feet are above y, then
 * to x2; done on landing.
 */
const spring = (x0: number, x1: number, y: number, x2: number): Action => ({
  name: `spring ${x0}→${x2}`,
  limit: 60 * 6,
  tick({ me, t, s }) {
    if (t === 0) return In.Jump | steer(me, x0);
    if (me.vy < -20) s.up = 1; // a spring launch (a jump is ~17.6)
    if (s.up && me.support && me.vy >= 0) return null;
    if (!s.up) return (t < 8 ? In.Jump : 0) | steer(me, x0);
    if (!s.free && me.y + me.h > y) return steer(me, x1);
    s.free = 1;
    return steer(me, x2);
  },
});
const lifted = (w: World) => w.players.slice(0, 3).every((p) => p.y + p.h <= 14.05);

// P4 holds the plate (lid A open) while P1-P3 ride the 3-lift to the top floor; they hop off
// together. P3 takes the key on its way to lean on the button (cap E off the floor spring). P4 springs onto
// the mid ledge, then off its spring onto the top floor, and all go in.
export default {
  steps: [
    step({ 4: walk(18.5), 3: walk(7.4), 2: walk(6.45), 1: walk(5.5) }),
    step({ 1: until(lifted, 'lift at the top') }),
    step({ 3: jumpTo(11.0), 2: jumpTo(10.05), 1: jumpTo(9.1) }),
    step({ 3: [walk(23.5), hold(1, 0.1)], 2: walk(16.5), 1: walk(15.5) }),
    step({ 4: [until((w) => !!w.power.E, 'cap open'), walk(23.4), spring(24.5, 27, 18, 27.5)] }),
    step({ 4: [walk(28.3), spring(29.5, 27.6, 14, 25.5)] }),
    step({ 3: [walk(18.5), enter()] }),
    step({ 4: [jumpTo(22.5), walk(18.5), enter()] }),
    step({ 2: [walk(18.5), enter()] }),
    step({ 1: [walk(18.5), enter()] }),
  ],
} satisfies Solution;
