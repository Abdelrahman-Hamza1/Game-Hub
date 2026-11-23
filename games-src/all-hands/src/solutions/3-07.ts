import { In } from '../sim/types';
import { enter, face, grab, jumpTo, step, throwIt, walk, type Action, type Solution } from './dsl';

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

// P4 stays on the street and throws; P3 stays on roof 1 and throws. P2 (with the key) and P1 go
// up both roofs, then the crate follows the same way and P1 holds it on the 3-plate (P1 + crate +
// P2). Both lids open and P4, then P3, ride the springs up.
const toss = (by: number) => step({ [by]: [grab(), face(1), throwIt()] });
const thru = (x: number) => [walk(x), enter()];
const hopKey = [walk(7), jumpTo(9.6), walk(11.5)];

export default {
  steps: [
    step({ 4: [jumpTo(7.5), jumpTo(10.5), walk(12.45)] }),
    step({ 3: [walk(5.5), jumpTo(7.5), jumpTo(10.5), walk(11.5)] }),
    toss(4),
    step({ 3: walk(21.45), 2: hopKey }),
    toss(4),
    step({ 2: walk(20.5) }),
    toss(3),
    step({ 2: walk(31.4), 1: hopKey }),
    toss(4),
    step({ 1: walk(20.5) }),
    toss(3),
    step({ 1: walk(30.45), 4: [walk(9.5), face(-1), grab(), walk(12.45), face(1), throwIt()] }),
    step({ 3: [walk(17), face(-1), grab(), walk(21.45), face(1), throwIt()] }),
    step({ 1: [walk(25.85), face(-1), grab(), walk(30.45)] }),
    step({ 4: [walk(11.5), ride(1), walk(20.5), ride(1), walk(28.5)] }),
    step({ 3: [walk(20.5), ride(1), walk(27.5)] }),
    step({ 2: thru(40.5) }),
    step({ 1: thru(40.5) }),
    step({ 4: thru(40.5) }),
    step({ 3: thru(40.5) }),
  ],
} satisfies Solution;
