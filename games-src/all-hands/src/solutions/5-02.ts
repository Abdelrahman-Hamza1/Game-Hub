import { enter, grab, jumpTo, step, walk, type Solution } from './dsl';

// P4 (in front) takes the lantern. P1 and P2 hold the near plate while P3 and P4 cross the bridge
// and pile onto the pillar plate (P3 on the pillar, P4 on P3's head); P1 and P2 cross. Under the
// shelf P3 is the base and P2 jumps up through it for the key. Over the last pit and in.
const door = [walk(44.5), enter()];
const pit = (x: number) => [walk(37.3), jumpTo(40.8), walk(x)];

export default {
  steps: [
    step({ 4: [walk(6.6), grab(), walk(13.5)] }),
    step({ 3: walk(12.5) }),
    step({ 2: walk(11.45) }),
    step({ 1: walk(10.5) }),
    step({ 4: walk(25.5), 3: walk(24.4) }),
    step({ 3: jumpTo(26.5) }),
    step({ 4: jumpTo(26.5) }),
    step({ 2: walk(24.5), 1: walk(23.5) }),
    step({ 4: [jumpTo(28.5), walk(36.3)] }),
    step({ 3: [jumpTo(28.5), walk(34.5)] }),
    step({ 2: [walk(25.4), jumpTo(27.5), walk(33.4)] }),
    step({ 2: [jumpTo(34.5), jumpTo(34.5)] }),
    step({ 4: pit(46.5) }),
    step({ 2: [walk(35.6), walk(36.6), ...pit(44.5), enter()] }),
    step({ 4: door }),
    step({ 3: [...pit(44.5), enter()] }),
    step({ 1: [walk(25.4), jumpTo(27.5), ...pit(44.5), enter()] }),
  ],
} satisfies Solution;
