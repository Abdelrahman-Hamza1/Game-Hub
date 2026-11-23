import { drop, enter, grab, hold, jump, jumpTo, step, until, wait, walk, type Solution } from './dsl';
import type { World } from '../sim/world';

// A: P2 climbs P1 to the shelf twice and carries both crates to the plate: gate A opens for good.
// B: P4 hops the 4-block and jumps into the switch against E (E opens, F shuts), hops back; all
//    four push the block through E up to F. P1 flips the switch from the right (E shuts, F
//    opens); P4 climbs P3 and jumps up through the one-way shelf for the key, then walks back over
//    their heads to the end of the line; push on to the mezzanine.
// C: block -> mezzanine, all four on the 4-lift, everyone jumps off at the top together.
// D: P1 and P4 hold the near plate (bridge H), P2 and P3 cross and hold the far one, P1 and P4
//    cross; P4 hops over P1 and opens the door.
const fetch = (cx: number, dropAt: number) => [walk(6.45), jumpTo(5.5), jumpTo(3.5), walk(cx), grab(), walk(dropAt), drop()];
const lift = (w: World) => w.things.find((t) => t.kind === 'lift') as unknown as { box: { y: number }; dy: number };
const climb = (x: number) => [walk(45.5), jumpTo(47), walk(47.4), jumpTo(50.5), walk(x)];

export default {
  steps: [
    // A
    step({ 1: walk(5.5), 3: walk(17.5), 4: walk(18.45) }),
    step({ 2: fetch(3.5, 14.5) }),
    step({ 2: fetch(2.5, 13.5) }),
    // B
    step({ 4: [walk(25.4), jumpTo(29.5), walk(30), hold(1, 0.3), wait(0.05), jump()] }),
    step({ 3: walk(24.2), 2: [jumpTo(17), walk(23.25)], 1: [walk(12.5), jumpTo(17), walk(22.3)] }),
    step({ 4: [walk(28.45), jumpTo(27), walk(25.5)] }),
    step({ 1: hold(1, 5.4), 2: hold(1, 5.4), 3: hold(1, 5.4), 4: hold(1, 5.4) }),
    step({ 1: [walk(32.4), jump(), walk(34.85)] }),
    step({ 4: [jumpTo(36.65), wait(0.05), jump(), walk(33.95)] }),
    step({ 1: hold(1, 3.6), 2: hold(1, 3.6), 3: hold(1, 3.6), 4: hold(1, 3.6) }),
    // C
    step({ 3: climb(59.3) }),
    step({ 2: climb(58.35) }),
    step({ 1: climb(57.4) }),
    step({ 4: climb(56.45) }),
    step({ 1: until((w) => lift(w).box.y < 16.01 && lift(w).dy === 0, 'lift up') }),
    step({ 3: jumpTo(63), 2: jumpTo(62), 1: jumpTo(61), 4: jumpTo(60) }),
    // D
    step({ 3: walk(67.45), 2: walk(66.5) }),
    step({ 1: walk(64.5), 4: walk(63.55) }),
    step({ 3: walk(78.5), 2: walk(77.55) }),
    step({ 1: walk(76.6), 4: walk(75.65) }),
    step({ 3: walk(88.45), 2: walk(87.5) }),
    step({ 4: [jumpTo(78.6), walk(86.5), enter()] }),
    step({ 2: [walk(86.5), enter()] }),
    step({ 3: [walk(86.5), enter()] }),
    step({ 1: [walk(86.5), enter()] }),
  ],
} satisfies Solution;
