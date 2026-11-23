import { enter, jumpTo, push, step, walk, type Solution } from './dsl';

// P4 runs ahead to the gate and P3 waits on the 1-high step; P2 hops onto the plate pillar, P1
// onto P2's head, P3 onto P1's head (3/3): the gate opens. P4 fetches the key over the steps and
// the pit and comes back to open the door; the pile climbs down and everyone goes in.
export default {
  steps: [
    step({ 4: [walk(8.5), jumpTo(10.5), jumpTo(12.5), walk(19.5)] }),
    step({ 3: [walk(8.5), jumpTo(10.5), jumpTo(12.8)] }),
    step({ 2: [walk(8.5), jumpTo(10.5)] }),
    step({ 1: [walk(8.5), jumpTo(10.5)] }),
    step({ 3: jumpTo(10.5) }),
    step({
      4: [
        walk(24.5),
        jumpTo(26.8),
        walk(27.6),
        jumpTo(28.6),
        push(1, 29.9),
        jumpTo(33.9),
        jumpTo(36),
        walk(39.5),
        // back with the key
        jumpTo(37),
        walk(35.5),
        jumpTo(34.3),
        push(-1, 33.1),
        jumpTo(29),
        walk(28.4),
        jumpTo(27),
        walk(26.2),
        jumpTo(24),
        walk(17.5),
        enter(),
      ],
    }),
    step({ 3: [jumpTo(13.5), walk(17.5), enter()] }),
    step({ 1: [jumpTo(13.5), walk(17.5), enter()] }),
    step({ 2: [jumpTo(13.5), walk(17.5), enter()] }),
  ],
} satisfies Solution;
