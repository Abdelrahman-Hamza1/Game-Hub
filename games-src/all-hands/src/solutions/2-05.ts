import { drop, enter, face, grab, hold, jumpTo, push, step, wait, walk, type Action, type Solution } from './dsl';
import type { World } from '../sim/world';

// P4 stands against the tower, P3 on P4's head; P2 and P1 climb them onto the tower and push the
// 2-block off onto the plate. P3 takes the crate out of the way, P4 pushes the 1-block up to the
// 2-block, P3 drops the crate on the plate's left end (2 + 1 + 1 = 4): gate A opens. Through the
// tunnel (P4, P3) and down off the tower (P2, P1); hop the 3-wide pit; key; door.
const tipped = (w: World) => w.bodies.some((b) => b.kind === 'block' && b.pushN === 2 && b.y > 12.5);
function holdUntil(dir: 1 | -1, fn: (w: World) => boolean): Action {
  return { name: `holdUntil(${dir})`, limit: 60 * 20, tick: ({ w }) => (fn(w) ? null : dir > 0 ? 2 : 1) };
}
const cross = [walk(7.4), jumpTo(10), jumpTo(13)];
const home = (x: number) => [walk(30), push(1, 32.3), jumpTo(37.5), walk(x), enter()];

export default {
  steps: [
    step({ 4: [...cross, walk(17.45)] }),
    step({ 3: [...cross, walk(16.5), jumpTo(17.45)] }),
    step({ 2: [...cross, walk(16.5), jumpTo(17.45), jumpTo(19), wait(0.05), jumpTo(21), walk(23.45)] }),
    step({ 1: [...cross, walk(16.5), jumpTo(17.45), jumpTo(19), wait(0.05), jumpTo(21), walk(22.45)] }),
    step({ 3: [jumpTo(13.5), walk(12.5), grab(), walk(9.5), jumpTo(6.5), walk(3.5)] }),
    step({ 4: [walk(9.5), jumpTo(7), walk(7.45)] }),
    step({ 1: holdUntil(-1, tipped), 2: holdUntil(-1, tipped) }),
    step({ 4: [hold(1, 3), jumpTo(14.6)] }),
    step({ 3: [walk(12.5), face(1), drop()] }),
    step({ 4: [walk(18.5), ...home(46.5)] }),
    step({ 3: [jumpTo(14.6), walk(18.5), ...home(46.5)] }),
    step({ 2: [walk(28), ...home(46.5)] }),
    step({ 1: [walk(28), ...home(46.5)] }),
  ],
} satisfies Solution;
