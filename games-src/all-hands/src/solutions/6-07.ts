import { enter, fall, hold, jumpTo, step, until, wait, walk, type Solution } from './dsl';
import type { World } from '../sim/world';

// Cells: P1 (x=10, y=15, 1 tall) and P3 (x=9-10 above it) on the left; P2 (x=23, y=15) and P4
// (above it) on the right. P1 goes into its cell; P3 hops onto P2's head and from there onto the
// left step (through gate 3); P4 hops onto the right step (through gate 4); P2 walks right into its cell (P3 took the key on its way).
// All four wait a hair from their buttons, touch them on the same tick, then run to the shaft
// (x=16-17) and drop through all four lids, one after another, and spread out in the vault.
const deep = (n: number) => until((w: World) => w.players[n - 1].y + w.players[n - 1].h > 25, `P${n} in the vault`);

export default {
  steps: [
    step({ 1: walk(10.6), 4: [jumpTo(22.5), walk(23.4)] }),
    step({ 3: [walk(15.0), jumpTo(13.5), jumpTo(11.4), walk(10.6)] }),
    step({ 2: walk(23.4) }),
    // the count: everyone presses together
    step({ 1: hold(-1, 0.1), 3: hold(-1, 0.1), 2: hold(1, 0.1), 4: hold(1, 0.1) }),
    step({
      1: [walk(16.5), fall(), walk(12.5)],
      2: [walk(17.5), fall(), walk(20.5)],
      3: [wait(0.1), deep(1), walk(16.5), fall(), walk(13.5)],
      4: [wait(0.1), deep(2), walk(17.4), fall(), walk(19.5)],
    }),
    // P3 picked the key up on its way to the step; P2 steps right to let P3 by
    step({ 2: walk(24.4), 4: walk(23.45) }),
    step({ 3: [walk(22.5), enter()] }),
    step({ 4: [walk(22.5), enter()] }),
    step({ 2: [walk(22.5), enter()] }),
    step({ 1: [walk(22.5), enter()] }),
  ],
} satisfies Solution;
