import { enter, jumpTo, step, walk, type Solution } from './dsl';

// Downstairs P4 and P3 jump the pit and wait at gate A; upstairs P2 and P1 stand on their plate
// (A opens); P4 and P3 go through and stand on theirs (E opens upstairs). P2 and P1 hop the bump,
// P2 takes the key, both drop through the hole into the corridor; everyone goes in.
const up = [walk(31), jumpTo(33), jumpTo(35.5), walk(39.5), walk(43.5), enter()];

export default {
  steps: [
    step({ 4: [walk(8.5), jumpTo(11.6), walk(19.5)] }),
    step({ 3: [walk(8.5), jumpTo(11.6), walk(18.55)], 2: walk(17.45) }),
    step({ 1: walk(16.5) }),
    step({ 4: walk(29.45) }),
    step({ 3: walk(28.5) }),
    step({ 2: up }),
    step({ 1: up }),
    step({ 4: [walk(43.5), enter()] }),
    step({ 3: [walk(43.5), enter()] }),
  ],
} satisfies Solution;
