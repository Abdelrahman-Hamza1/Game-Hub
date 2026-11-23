import { drop, enter, grab, jumpTo, step, walk, type Solution } from './dsl';

// P2 climbs P1 to the crate shelf twice and carries both crates to the outer plate; with P1 and P2
// on it too that's 4/4. P3 and P4 hold the inner plate; P2 carries one crate in (it is the step up
// the 3-high key ledge that everyone has to cross), P1 follows. Then over the ledge, the pit, and in.
const fetch = (cx: number, dropAt: number) => [walk(7.45), jumpTo(6.5), jumpTo(4.5), walk(cx), grab(), walk(dropAt), drop()];
const over = (x: number) => [walk(27.5), jumpTo(28.45), jumpTo(30.5), walk(34.4), jumpTo(38.5), walk(x)];

export default {
  steps: [
    step({ 1: walk(6.5), 3: walk(17.5), 4: walk(18.45) }),
    step({ 2: fetch(3.5, 15.5) }),
    step({ 2: fetch(2.5, 14.5) }),
    step({ 1: walk(13.5) }),
    step({ 3: walk(22.45), 4: walk(23.4) }),
    step({ 2: [grab(), jumpTo(18.5), walk(21), jumpTo(25.2), walk(27.5), drop()] }),
    step({ 1: [jumpTo(17.5), walk(21)] }),
    step({ 2: [jumpTo(28.45), jumpTo(30.5), walk(34.4), jumpTo(38.5), walk(41.5), enter()] }),
    step({ 4: [...over(41.5), enter()] }),
    step({ 3: [...over(41.5), enter()] }),
    step({ 1: [...over(41.5), enter()] }),
  ],
} satisfies Solution;
