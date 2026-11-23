import { enter, jumpTo, step, walk, type Solution } from './dsl';

// Over the 1-bridge one at a time, all four onto the 3-floor (it gives way under the fourth),
// then a leg-up onto the key shelf in the cellar and everyone walks under it to the door.
const thru = (x: number) => [walk(x), enter()];

export default {
  steps: [
    step({ 4: walk(20.4) }),
    step({ 3: walk(19.45) }),
    step({ 2: walk(18.5) }),
    step({ 1: walk(17.55) }),
    step({ 4: walk(25.4), 3: walk(24.45), 2: walk(23.5), 1: walk(22.55) }),
    // the fall shuffles them: P1 lands in front
    step({ 1: walk(33.5), 4: walk(32.5), 3: walk(31.5), 2: walk(30.5) }),
    step({ 4: [jumpTo(33.5), jumpTo(35.3), walk(35.5), jumpTo(39), ...thru(44.5)] }),
    step({ 1: thru(44.5) }),
    step({ 3: thru(44.5) }),
    step({ 2: thru(44.5) }),
  ],
} satisfies Solution;
