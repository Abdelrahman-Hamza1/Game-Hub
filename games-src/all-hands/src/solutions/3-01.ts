import { enter, face, grab, jumpTo, step, throwIt, walk, type Solution } from './dsl';

// P1 throws P2 and P3 left onto the balcony first; they pile up against the wall (P3 on P2's
// head) to leave room, then P1 throws both crates after them (plate 4/4, bridge up). P1 and P4
// cross to the far 2-plate, the balcony pair jumps down and follows, then a leg-up onto the key
// shelf.
const thru = (x: number) => [walk(x), enter()];

export default {
  steps: [
    step({ 4: [jumpTo(14.5), jumpTo(17.5)], 1: walk(6.5), 2: walk(7.45) }),
    step({ 1: [grab(), face(-1), throwIt()] }),
    step({ 2: walk(1.45), 3: walk(7.45) }),
    step({ 1: [grab(), face(-1), throwIt()] }),
    step({ 3: [walk(2.6), jumpTo(1.45)] }),
    step({ 1: [walk(12.5), face(1), grab(), walk(6.5), face(-1), throwIt()] }),
    step({ 1: [walk(14.5), face(1), grab(), walk(6.5), face(-1), throwIt()] }),
    step({ 4: walk(28.4), 1: walk(27.45) }),
    step({ 3: [jumpTo(7.5), walk(26.45)] }),
    step({ 2: [jumpTo(7.5), walk(25.5)] }),
    step({ 4: walk(32.5) }),
    step({ 1: [walk(31.5), jumpTo(32.5), jumpTo(34.5), walk(35.5), jumpTo(39.5), ...thru(42.5)] }),
    step({ 4: thru(42.5) }),
    step({ 3: thru(42.5) }),
    step({ 2: thru(42.5) }),
  ],
} satisfies Solution;
