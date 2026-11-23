import { In } from '../sim/types';
import { drop, enter, face, hop, jumpTo, step, walk, type Action, type Solution } from './dsl';

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

// Each hops onto the open spring and up the cliff (P4 takes the key on the way and hands it to P3).
// P4 and P3 make a two-high stack against the step; P2 and P1 climb it and hold the 2-plate, which
// opens the lid. P3 and P4 drop into the hole and spring onto the step, and in we go.
const boing = [walk(9.6), hop(1)];
const thru = (x: number) => [walk(x), enter()];

export default {
  steps: [
    step({ 4: [...boing, walk(29.5)] }),
    step({ 3: [...boing, walk(28.4)] }),
    step({ 4: [face(-1), drop()] }),
    step({ 3: jumpTo(29.5) }),
    step({ 2: [...boing, walk(28.4), jumpTo(29.5), jumpTo(31.5), walk(34.45)] }),
    step({ 1: [...boing, walk(28.4), jumpTo(29.5), jumpTo(31.5), walk(33.5)] }),
    step({ 3: [jumpTo(28.3), walk(27.5), ride(1), walk(31.5)] }),
    step({ 4: [walk(27.5), ride(1)] }),
    step({ 2: walk(46.4), 1: walk(45.45) }),
    step({ 3: thru(44.5) }),
    step({ 4: thru(44.5) }),
    step({ 1: thru(44.5) }),
    step({ 2: thru(44.5) }),
  ],
} satisfies Solution;
