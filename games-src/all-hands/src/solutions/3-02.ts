import { drop, enter, face, grab, jumpTo, push, step, throwIt, walk, type Solution } from './dsl';

// P4 (nearest the gap) throws P3, P2 and P1 up onto the roof; they hold the 3-plate, which opens
// the pen. P4 sets the crate down by the gap, fetches the key, climbs the crate onto the roof with
// it, sets the key down in front so P1 picks it up, and everyone hops the last gap to the door.
const toss = (n: number) => [step({ [n]: walk(15.5) }), step({ 4: [grab(), face(1), throwIt()] })];
const thru = (x: number) => [walk(x), enter()];

export default {
  steps: [
    step({ 4: walk(16.45) }),
    ...toss(3),
    step({ 3: walk(25.4) }),
    ...toss(2),
    step({ 2: walk(24.45) }),
    ...toss(1),
    step({ 1: walk(23.5) }),
    step({ 4: [walk(6.5), face(-1), grab(), walk(15.5), face(1), drop()] }),
    step({ 4: [walk(2.5), walk(14.6), jumpTo(16.3), push(1, 16.75), jumpTo(21), walk(22.5)] }),
    step({ 4: [face(1), drop()] }),
    step({ 3: [walk(30.4), jumpTo(34), walk(42.5)] }),
    step({ 2: [walk(30.4), jumpTo(34), walk(41.55)] }),
    step({ 1: [walk(30.4), jumpTo(34), ...thru(40.5)] }),
    step({ 4: [walk(30.4), jumpTo(34), ...thru(40.5)] }),
    step({ 2: thru(40.5) }),
    step({ 3: thru(40.5) }),
  ],
} satisfies Solution;
