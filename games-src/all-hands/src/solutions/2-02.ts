import { enter, hold, jump, jumpTo, step, until, walk, type Solution } from './dsl';
import type { World } from '../sim/world';

// Three push the 3-block up to gate A while P1 leans on the far button; through the gate and on to
// the plateau wall. P2 then jumps into the inner button again and again while P1 runs over.
const innerOn = (w: World) => w.things.some((t) => t.kind === 'button' && (t as unknown as { x: number; timer: number }).x === 27 && (t as unknown as { timer: number }).timer > 0);
const up = (x: number) => [walk(33.5), jumpTo(35), jumpTo(38.5), walk(45.4), jumpTo(49.5), walk(x)];

export default {
  steps: [
    step({ 4: walk(19.45), 3: walk(18.5), 2: walk(17.55) }),
    step({ 4: hold(1, 2.2), 3: hold(1, 2.2), 2: hold(1, 2.2) }),
    step({ 1: hold(-1, 0.6), 4: hold(1, 4.8), 3: hold(1, 4.8), 2: hold(1, 4.8) }),
    step({ 2: [walk(27.5), ...Array.from({ length: 10 }, () => jump())], 1: [until(innerOn, 'inner button'), walk(30.5)] }),
    step({ 4: [jumpTo(35), jumpTo(38.5), walk(45.4), jumpTo(49.5), walk(52.5), enter()] }),
    step({ 3: [...up(52.5), enter()] }),
    step({ 2: [...up(52.5), enter()] }),
    step({ 1: [...up(52.5), enter()] }),
  ],
} satisfies Solution;
