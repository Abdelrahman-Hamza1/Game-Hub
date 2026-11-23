import { enter, fall, jumpTo, step, walk, type Solution } from './dsl';
import { runJump } from './kit4';

// Each player walks over the other colours' floors, drops through their own into their well,
// touches its button (P3 picks up the key on the way), jumps out to the left and then takes a
// running jump over the well. When all four gates are open the team walks through to the door.
const well = (x: number, wait: number) => [
  walk(x - 1.5),
  walk(x + 0.6),
  fall(),
  walk(x + 1.55),
  jumpTo(x - 1.5),
  walk(x - 3),
  runJump(x - 0.1, x + 3.6),
  walk(wait),
];

export default {
  steps: [
    step({ 4: well(23, 28.5) }),
    step({ 3: well(18, 27.55) }),
    step({ 2: well(13, 26.6) }),
    step({ 1: well(8, 25.65) }),
    step({ 4: walk(42.5), 3: walk(41.5), 2: walk(39.5), 1: walk(38.5) }),
    step({ 3: [walk(40.5), enter()] }),
    step({ 4: [walk(40.5), enter()] }),
    step({ 2: [walk(40.5), enter()] }),
    step({ 1: [walk(40.5), enter()] }),
  ],
} satisfies Solution;
