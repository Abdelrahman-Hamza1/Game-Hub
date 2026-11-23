import { enter, hop, jumpTo, step, walk, type Solution } from './dsl';

// Leash 6, two floors. Downstairs P3 and P4 jump the pit and wait at gate A. Each pair then
// stands on a plate that opens the other pair's next gate, leapfrogging: U1 opens A, L1 opens E,
// U2 opens F, L2 opens G. Upstairs P2 takes the key and drops through the hole; all in.
export default {
  steps: [
    step({ 4: [walk(4.3), jumpTo(7.6), walk(9.5)] }),
    step({ 3: [walk(4.3), jumpTo(7.6), walk(8.55)] }),
    step({ 2: walk(7.5), 1: walk(6.55) }),
    step({ 4: walk(14.5), 3: walk(13.55) }),
    step({ 2: [walk(12.6), hop(1), walk(18.5)], 1: [walk(11.6), walk(12.5), hop(1), walk(17.55)] }),
    step({ 4: walk(25.5), 3: walk(24.55) }),
    step({ 2: [walk(24.6), jumpTo(28.5), walk(33.5)], 1: walk(23.5) }),
    step({ 2: walk(38.5), 4: walk(31.5), 3: walk(30.5), 1: [walk(24.6), jumpTo(28.5), walk(33.5)] }),
    step({ 2: [walk(42.5), enter()], 1: walk(40.5), 4: walk(39.5), 3: walk(38.5) }),
    step({ 1: [walk(42.5), enter()] }),
    step({ 4: [walk(42.5), enter()] }),
    step({ 3: [walk(42.5), enter()] }),
  ],
} satisfies Solution;
