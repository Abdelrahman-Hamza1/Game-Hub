import { enter, fall, hop, jumpTo, step, walk, wait, type Solution } from './dsl';
import { climb } from './kit4';

// P4 drops through the gold floor into the cellar and holds its plate: tall gate A opens. P2 and P1
// hop over P3 so the climber goes last. In the slot P2 is the base, P1 climbs P2, P3 climbs
// P1 and jumps up the 4-high ledge, walks through the mint gate, takes the key and presses the
// button (gates A and E stay open). Everyone else goes through the tunnel under the ledge.
export default {
  steps: [
    step({ 4: [walk(10.0), fall()] }),
    step({ 2: [jumpTo(7.0), walk(19.5)] }),
    step({ 1: [walk(3.55), jumpTo(5.9), walk(18.5)] }),
    step({ 3: walk(17.5) }),
    step({ 1: climb(2) }),
    step({ 3: climb(1) }),
    step({ 3: [jumpTo(21.5), walk(27.55), hop(1), walk(31.6), fall()] }),
    step({ 3: [walk(34.4), jumpTo(38.5), walk(42.5), enter()], 1: [jumpTo(17.5), wait(0.3), walk(32.4)], 2: [wait(0.5), walk(33.4)], 4: [jumpTo(12.0), walk(31.4)] }),
    step({ 2: [walk(34.4), jumpTo(38.5), walk(42.5), enter()] }),
    step({ 1: [walk(34.4), jumpTo(38.5), walk(42.5), enter()] }),
    step({ 4: [walk(34.4), jumpTo(38.5), walk(42.5), enter()] }),
  ],
} satisfies Solution;
