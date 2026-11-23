import { enter, face, fall, grab, jumpTo, step, throwIt, walk, wait, type Solution } from './dsl';
import { climb } from './kit4';

// P1 and P2 drop through their colour floors into the left room, P3 and P4 into the right one.
// Left: P2 on the left pan, P1 on P2's head (the right pan rises 2). Right: P3 (carrying the
// crate) and P4 jump onto the raised right pan: 3 against 2 lifts the left pan 1 up, and P1 then P2
// jump up onto the ledge and hold the 2-plate (gate E opens). Right pan sunk 3: P3 (with the
// crate) climbs P4 and jumps out; P4, alone, is only 1 down. P3 throws the crate away; P4 then P3
// climb the stairs (P4 takes the key) and walk through gate E to the door.
export default {
  steps: [
    step({ 1: [walk(4.95), fall()], 2: [walk(8.95), fall()], 3: [walk(36.95), fall()], 4: [walk(41.95), fall()] }),
    step({ 2: walk(15.5), 1: walk(14.55), 3: [walk(37.6), face(1), grab()], 4: walk(39.5) }),
    step({ 1: climb(2) }),
    step({ 3: [walk(34.6), jumpTo(31.6), walk(31.55)] }),
    step({ 4: [walk(35.5), jumpTo(33.45), walk(33.45)] }),
    step({ 1: [wait(0.8), jumpTo(18.5), walk(19.5)] }),
    step({ 2: [wait(0.6), jumpTo(18.5), walk(18.5)] }),
    step({ 3: [wait(0.8), climb(4)] }),
    step({ 3: [wait(0.3), jumpTo(35.5), face(1), throwIt(), walk(38.5)] }),
    step({ 4: [wait(0.3), jumpTo(35.5)] }),
    step({ 4: [walk(31.5), jumpTo(30.5), jumpTo(28.9), jumpTo(26.5), walk(21.5), enter()], 3: [wait(1.5), walk(31.5), jumpTo(30.5), jumpTo(28.9), jumpTo(26.5), walk(22.5)] }),
    step({ 3: [walk(21.5), enter()] }),
    step({ 1: [walk(21.5), enter()] }),
    step({ 2: [walk(21.5), enter()] }),
  ],
} satisfies Solution;
