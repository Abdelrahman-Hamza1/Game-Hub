import { enter, jumpTo, push, step, walk, type Solution } from './dsl';

// P4 (front of the spawn line) is the leg up: it stands against the 3-high ledge; P3, P2, P1
// climb off its head and line up right of the 3-block; P4 steps back, the three push the block
// down as a step; P4 climbs block then ledge. Everyone takes a running jump over the pit (the
// first one has the key) and goes in.
const climb = (x: number) => [walk(11.5), jumpTo(13.5), jumpTo(15.3), walk(15.5), jumpTo(17), jumpTo(x)];
const cross = [push(1, 30.3), jumpTo(35.3), walk(36.5), enter()];

export default {
  steps: [
    step({ 4: walk(13.5) }),
    step({ 3: climb(20.35) }),
    step({ 2: climb(19.4) }),
    step({ 1: climb(18.45) }),
    step({ 4: walk(8.5) }),
    step({ 1: push(-1, 14.25), 2: push(-1, 15.2), 3: push(-1, 16.15) }),
    step({ 3: walk(26.5) }),
    step({ 2: walk(25.55) }),
    step({ 1: walk(24.6) }),
    step({ 4: [walk(10), jumpTo(12.3), jumpTo(15.5), walk(23.65)] }),
    step({ 3: cross }),
    step({ 2: cross }),
    step({ 1: cross }),
    step({ 4: cross }),
  ],
} satisfies Solution;
