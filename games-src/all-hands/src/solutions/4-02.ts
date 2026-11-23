import { enter, face, fall, grab, hop, jumpTo, step, throwIt, walk, wait, type Solution } from './dsl';
import { runJump } from './kit4';

// P4 hops the crate and jumps the left pan onto the right one. P3 carries the crate onto the raised
// left pan, P2 and P1 drop in beside: 4 against 1 lifts P4 three tiles, up to the tower. P4 opens
// the tunnel gate, takes the key and heads for the door. In the sunk pan P1 climbs P2 and jumps
// out; P3 (with the crate) climbs onto P2 too, jumps out and throws the crate away; P2, alone, is
// only 1 down. Then each jumps the empty left pan, steps over the right one and up into the tunnel.
const cross = (x: number) => [runJump(9.6, 14.5), walk(18.4), hop(1), walk(29.3), jumpTo(33.5), walk(x)];

export default {
  steps: [
    step({ 4: [jumpTo(8.5), runJump(9.5, 14.5), walk(17.5)] }),
    step({ 3: [walk(5.5), grab(), walk(9.3), jumpTo(12.5), walk(12.52)] }),
    step({ 2: [walk(11.55), fall()] }),
    step({ 1: [walk(10.6), fall(), wait(1.2)] }),
    step({ 4: [jumpTo(20.5), walk(21.5), hop(1), walk(25.5), walk(29.4), jumpTo(33.5), walk(36.5), enter()] }),
    step({ 1: [jumpTo(11.55), jumpTo(8.0), walk(5.5)] }),
    step({ 3: [jumpTo(11.6), wait(1), jumpTo(8.2), face(-1), throwIt()] }),
    step({ 2: [wait(0.6), jumpTo(14.5)] }),
    step({ 2: [walk(18.4), hop(1), walk(29.3), jumpTo(33.5), walk(36.5), enter()] }),
    step({ 3: [walk(8.5), ...cross(36.5), enter()] }),
    step({ 1: [walk(8.5), ...cross(36.5), enter()] }),
  ],
} satisfies Solution;
