import { In } from '../sim/types';
import { drop, enter, face, grab, jumpTo, step, throwIt, walk, type Action, type Solution } from './dsl';

// Hold a direction through a spring launch until you land somewhere.
const ride = (dir: 1 | -1): Action => ({
  name: `ride(${dir})`,
  limit: 60 * 4,
  tick({ me, s }) {
    if (!me.support) s.up = 1;
    else if (s.up && me.vy >= 0) return null;
    return dir > 0 ? In.Right : In.Left;
  },
});

const thru = (x: number) => [walk(x), enter()];
const toss = (by: number) => step({ [by]: [grab(), face(1), throwIt()] });

export default {
  steps: [
    // stage 1: P1 throws P2 and P3 onto the balcony (they pile against the wall), then the crate
    step({ 4: [walk(11), jumpTo(13.8)], 1: walk(6.5), 2: walk(7.45) }),
    step({ 1: [grab(), face(-1), throwIt()] }),
    step({ 2: walk(1.45), 3: walk(7.45) }),
    step({ 1: [grab(), face(-1), throwIt()] }),
    step({ 3: [walk(2.6), jumpTo(1.45)] }),
    step({ 1: [walk(11.5), face(1), grab(), walk(6.5), face(-1), throwIt()] }),
    // over the bridge; P4 toggles the button and everyone else jumps clear of it
    step({ 4: [walk(23.55), jumpTo(26.8), walk(29.4)], 1: [walk(13), walk(23.3)] }),
    step({ 1: [jumpTo(26.8), walk(28.45)] }),
    step({ 3: [jumpTo(7.5), walk(23.3), jumpTo(26.8), walk(27.5)] }),
    step({ 2: [jumpTo(3.1), jumpTo(7.5), walk(23.3), jumpTo(26.8), walk(26.55)] }),
    // stage 2: the 1-bridge one at a time, then all four onto the trapdoor (it holds three)
    step({ 4: walk(44.5) }),
    step({ 1: walk(43.55) }),
    step({ 3: walk(42.6) }),
    step({ 2: walk(41.65) }),
    // the fall leaves them in the order P2 P3 P1 P4; through the tunnel past the flag
    step({ 4: walk(65.5), 1: walk(64.5), 3: walk(63.5), 2: walk(62.5) }),
    // stage 3: P4 throws P1, P3 and P2 onto roof 1; P1 (who lands on the key) passes it to P3
    // and throws P3 and P2 onto roof 2; they hold the 2-plate and P4, then P1, ride the springs
    toss(4),
    step({ 1: walk(73.45), 3: walk(64.5) }),
    toss(4),
    step({ 3: walk(72.5) }),
    step({ 1: [face(-1), drop()] }),
    toss(1),
    step({ 3: walk(81.4), 2: walk(64.5) }),
    toss(4),
    step({ 2: walk(72.5) }),
    toss(1),
    step({ 2: walk(80.45) }),
    step({ 4: [walk(64.5), ride(1), walk(72.5), ride(1), walk(79.5)] }),
    step({ 1: [walk(72.5), ride(1), walk(78.55)] }),
    step({ 3: thru(88.5) }),
    step({ 2: thru(88.5) }),
    step({ 4: thru(88.5) }),
    step({ 1: thru(88.5) }),
  ],
} satisfies Solution;
