import { drop, enter, face, grab, jumpTo, step, throwIt, walk, type Solution } from './dsl';

// Leash 6. P1 stands against the right end of the stall counter; P2 jumps off P1's head onto it,
// throws one crate down to the floor and the other straight onto the plate. P1 carries the first
// crate over and sets it down beside the second: gate A opens. Over the pit, through A, and a
// 4-high stack at the wall (P4 at the bottom, P3 on P4): P2 and P1 go up and stand on the
// plate, P3 and P4 walk through the tunnel; P4 takes the key and opens the door.
const pit = (x: number) => [walk(23.3), jumpTo(26.6), walk(x)];

export default {
  steps: [
    step({ 1: walk(13.5), 2: walk(14.6), 3: walk(15.6), 4: walk(16.6) }),
    step({ 2: [jumpTo(13.5), jumpTo(12.5)] }),
    step({ 2: [face(-1), grab(), face(-1), throwIt()] }),
    step({ 2: [walk(11.45), face(-1), grab(), walk(9.55), face(-1), throwIt()] }),
    step({ 1: [walk(7.6), face(-1), grab(), walk(5.0), jumpTo(1.5), face(1), drop(), jumpTo(5.0)], 3: walk(11.5), 4: walk(12.5) }),
    step({ 2: [walk(8.6)] }),
    step({ 4: pit(40.5), 3: pit(39.55), 2: pit(38.5), 1: pit(37.5) }),
    step({ 3: jumpTo(40.5) }),
    step({ 2: [walk(39.55), jumpTo(40.5), jumpTo(44.5), walk(44.5)] }),
    step({ 1: [walk(39.55), jumpTo(40.5), jumpTo(43.5), walk(43.55)] }),
    step({ 3: jumpTo(38.5) }),
    step({ 4: [walk(52.5), enter()], 3: walk(51.0) }),
    step({ 3: [walk(52.5), enter()] }),
    step({ 2: [walk(47.5), jumpTo(50.5), walk(52.5), enter()] }),
    step({ 1: [walk(47.5), jumpTo(50.5), walk(52.5), enter()] }),
  ],
} satisfies Solution;
