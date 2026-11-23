import { drop, enter, face, grab, jumpTo, step, walk, wait, type Solution } from './dsl';
import { climb, runJump } from './kit4';

// P4 takes the key on the bump and becomes the base at the upper level's edge; it sets the key down
// for P2. P3 climbs P4, P2 and P1 climb P3 to the upper level (4 high). P4 and P3 go through the
// tunnel onto the low pan (P4 on P3's head): the high pan rises 2. Up top P2 (key) and P1 (crate)
// jump the recess and get onto the raised high pan: 3 against 2 lifts the low pan to 1 up, and
// P4 then P3 jump out of the recess onto the block. P2 climbs P1 out of the sunk high pan, P1
// follows (the crate stays as ballast), and everyone crosses the pit to the door.
const over = (x: number) => [walk(9.3), jumpTo(10.5), walk(x)];

export default {
  steps: [
    step({ 4: over(23.5) }),
    step({ 3: over(22.55) }),
    step({ 3: climb(4) }),
    step({ 4: [face(-1), drop()], 2: over(21.6) }),
    step({ 2: [walk(22.55), climb(3), jumpTo(25.5)], 1: over(21.6) }),
    step({ 1: [walk(22.55), climb(3), jumpTo(24.5)] }),
    step({ 3: [jumpTo(21.5), walk(28.5)], 4: [wait(0.4), walk(27.5)] }),
    step({ 4: climb(3) }),
    step({ 2: [runJump(26.4, 30.5), jumpTo(32.5), walk(33.4), jumpTo(36.5), walk(36.5)] }),
    step({ 1: [walk(24.6), runJump(26.4, 30.4), walk(30.55), face(1), grab(), walk(33.4), jumpTo(34.6), walk(34.5), face(1), drop()] }),
    step({ 4: [wait(0.6), jumpTo(30.5), walk(33.4)] }),
    step({ 3: [wait(0.3), jumpTo(31.5), walk(32.45)] }),
    step({ 2: [wait(0.8), climb(1), jumpTo(37.5), jumpTo(41.5), walk(41.5), enter()] }),
    step({ 1: [wait(0.6), jumpTo(37.5), jumpTo(41.5), walk(41.5), enter()] }),
    step({ 4: [jumpTo(36.5), jumpTo(37.5), jumpTo(41.5), walk(41.5), enter()] }),
    step({ 3: [walk(33.4), jumpTo(36.5), jumpTo(37.5), jumpTo(41.5), walk(41.5), enter()] }),
  ],
} satisfies Solution;
