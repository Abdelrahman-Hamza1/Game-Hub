import { drop, enter, grab, jumpTo, step, until, walk, type Solution } from './dsl';

// P2 climbs P1 to the shelf, brings the crate down onto the plate (gate A at the top opens); all
// four hop the crate and the pit and squeeze onto the 4-lift; at the top, through A and in.
const board = (x: number) => [walk(16.4), jumpTo(19.6), walk(x)];

export default {
  steps: [
    step({ 1: walk(5.5), 3: walk(14.6), 4: walk(15.55) }),
    step({ 2: [walk(6.45), jumpTo(5.5), jumpTo(3.5), walk(2.5), grab(), walk(11.5), drop()] }),
    step({ 4: board(29.3) }),
    step({ 3: board(28.35) }),
    step({ 2: [jumpTo(14.6), ...board(27.4)] }),
    step({ 1: [walk(10.5), jumpTo(14.6), ...board(26.45)] }),
    step({ 1: until((w) => w.things.some((t) => t.kind === 'lift' && t.dy === 0 && (t as unknown as { box: { y: number } }).box.y < 13.01), 'lift at the top') }),
    // everyone jumps off at once: with fewer than four aboard the lift slides back down
    step({ 4: [jumpTo(33), walk(38.5)], 3: jumpTo(32), 2: jumpTo(31), 1: jumpTo(30) }),
    step({ 4: [walk(40.5), enter()], 3: walk(38.5) }),
    step({ 3: [walk(40.5), enter()], 2: walk(38.5) }),
    step({ 2: [walk(40.5), enter()], 1: walk(38.5) }),
    step({ 1: [walk(40.5), enter()] }),
  ],
} satisfies Solution;
