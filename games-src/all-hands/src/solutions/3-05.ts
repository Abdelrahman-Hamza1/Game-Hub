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

// P4 (hopping the key) stays on the ground floor and throws the others up to tier 1; P3 stays on
// tier 1 and throws P2 (who picked up the key) and P1 up to tier 2. The top pair hold the 2-plate,
// both lids open, and P4 then P3 ride the springs up.
const toss = (by: number) => step({ [by]: [grab(), face(1), throwIt()] });
const thru = (x: number) => [walk(x), enter()];

export default {
  steps: [
    step({ 4: [walk(6.2), jumpTo(9), walk(13.45)] }),
    step({ 3: [walk(6.2), jumpTo(9), walk(12.5)] }),
    toss(4),
    step({ 3: walk(22.45), 2: walk(12.5), 1: walk(11.55) }),
    toss(4),
    step({ 2: walk(21.5), 1: walk(12.5) }),
    toss(3),
    step({ 2: walk(30.4) }),
    toss(4),
    step({ 1: walk(21.5) }),
    toss(3),
    step({ 1: walk(29.45) }),
    step({ 4: [walk(12.5), ride(1), walk(21.5), ride(1), walk(28.5)] }),
    step({ 3: [walk(21.5), ride(1), walk(27.55)] }),
    step({ 2: thru(37.5) }),
    step({ 1: thru(37.5) }),
    step({ 4: thru(37.5) }),
    step({ 3: thru(37.5) }),
  ],
} satisfies Solution;
