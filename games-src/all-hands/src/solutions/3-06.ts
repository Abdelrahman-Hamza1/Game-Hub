import { enter, face, grab, jumpTo, step, throwIt, walk, type Solution } from './dsl';

// P4 throws P3 right onto the right balcony, P1 throws P2 left onto the left one: both halves of
// the hatch open. P4 and P1 drop through and cross the 1-bridge one at a time to hold the lower
// 2-plate; the balcony pair jump down and drop through the hatch. P1 and P4 come back over the
// bridge one at a time, then a leg-up onto the key shelf and everyone walks under it to the door.
const thru = (x: number) => [walk(x), enter()];

export default {
  steps: [
    step({ 4: walk(27.5), 3: walk(26.55) }),
    step({ 4: [grab(), face(1), throwIt()] }),
    step({ 3: walk(31.5), 1: walk(6.5), 2: walk(7.45) }),
    step({ 1: [grab(), face(-1), throwIt()] }),
    step({ 2: walk(2.5) }),
    step({ 4: [walk(17.5), walk(8.5)] }),
    step({ 1: [walk(16.5), walk(9.45)] }),
    step({ 2: [jumpTo(8), walk(16.5), walk(19.45)] }),
    step({ 3: [jumpTo(26), walk(17.5), walk(18.5)] }),
    step({ 1: walk(16.5) }),
    step({ 4: walk(15.5) }),
    step({ 3: [jumpTo(19.45), jumpTo(20.8), walk(21.5), jumpTo(23.4), ...thru(24.5)] }),
    step({ 2: thru(24.5) }),
    step({ 1: thru(24.5) }),
    step({ 4: thru(24.5) }),
  ],
} satisfies Solution;
