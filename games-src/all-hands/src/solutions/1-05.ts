import { enter, jumpTo, push, step, walk, type Solution } from './dsl';

// P4 (front of the line) stands against the wall and P3 on P4's head; P2 and P1 climb the
// two-friend stack onto the wall top and stand on the plate: the tunnel gate opens. P3 and P4 go
// through, P1 and P2 jump down after them; one at a time over the pit, onto the key step, in.
const cross = [push(1, 26.4), jumpTo(30.5), walk(31.6), jumpTo(34.5), walk(35.6), jumpTo(38.5), walk(40.5), enter()];

export default {
  steps: [
    step({ 4: walk(13.5) }),
    step({ 3: [walk(11.5), jumpTo(13.5)] }),
    step({ 2: [walk(11.5), jumpTo(13.5), jumpTo(15.3), walk(17.45)] }),
    step({ 1: [walk(11.5), jumpTo(13.5), jumpTo(15.3), walk(16.5)] }),
    step({ 3: jumpTo(11.5) }),
    step({ 4: walk(25.5) }),
    step({ 3: walk(24.55) }),
    step({ 2: [walk(20.5), jumpTo(23.6)] }),
    step({ 1: [walk(20.5), jumpTo(22.65)] }),
    step({ 4: cross }),
    step({ 3: [walk(25.5), ...cross] }),
    step({ 2: [walk(25.5), ...cross] }),
    step({ 1: [walk(25.5), ...cross] }),
  ],
} satisfies Solution;
