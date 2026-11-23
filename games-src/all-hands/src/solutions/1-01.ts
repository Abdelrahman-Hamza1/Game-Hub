import { enter, jumpTo, push, step, walk, type Solution } from './dsl';

// Over the bumps one at a time (the first over picks up the key), line up in the tunnel, push the
// 4-block into the hole, hop the last gap, and in.
const over = (x: number) => [walk(6.5), jumpTo(8), jumpTo(11.5), walk(12.45), jumpTo(17.5), walk(x)];

export default {
  steps: [
    step({ 4: over(22.5) }),
    step({ 3: over(21.55) }),
    step({ 2: over(20.6) }),
    step({ 1: over(19.65) }),
    step({ 4: push(1, 27.7), 3: push(1, 26.75), 2: push(1, 25.8), 1: push(1, 24.85) }),
    step({ 4: [jumpTo(33), walk(37.5), enter()] }),
    step({ 3: [jumpTo(33), walk(37.5), enter()] }),
    step({ 2: [jumpTo(33), walk(37.5), enter()] }),
    step({ 1: [jumpTo(33), walk(37.5), enter()] }),
  ],
} satisfies Solution;
