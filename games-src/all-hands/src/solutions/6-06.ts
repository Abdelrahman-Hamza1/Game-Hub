import { drop, enter, face, grab, hold, jumpTo, step, until, walk, type Solution } from './dsl';
import type { World } from '../sim/world';

// P4 takes the lantern and leads; P4 leans on the timer button (gate A, 10 s) and everyone runs
// over the three pits and through gate A. Pile on the pillar: P2 on the plate, P1 on P2, P3 from
// the step on top (gate E opens). P4 carries the light through gate E, over the pit, sets it down
// (hands must be empty for the key), takes the key and comes back; the pile climbs down to the
// left, P4 opens the door and all go in.
const after = (n: number, x: number) => until((w: World) => { const p = w.players[n - 1]; return p.gone || p.x + p.w / 2 >= x; }, `after P${n} ${x}`);
// from just left of the start button over the pits to just left of gate A's knob at x=36
const run = [jumpTo(11.6), walk(13.4), jumpTo(16.8), walk(18.3), hold(1, 0.28), jumpTo(24.0), walk(26.4), jumpTo(30.0)];

export default {
  steps: [
    step({ 4: [walk(6.6), face(1), grab(), walk(9.4), hold(1, 0.1)] }),
    step({
      4: [...run, walk(35.3), jumpTo(37.6), walk(40.2), jumpTo(41.5), jumpTo(43.6), walk(45.5)],
      3: [walk(8.4), after(4, 12), walk(9.4), ...run, walk(35.3), jumpTo(37.6), walk(40.2), jumpTo(41.5), jumpTo(43.6)],
      2: [walk(7.4), after(3, 12), walk(9.4), ...run, walk(35.3), after(3, 41), jumpTo(37.6), walk(40.3)],
      1: [walk(6.4), after(2, 12), walk(9.4), hold(1, 0.1), ...run, walk(35.3), after(2, 38), jumpTo(37.6), walk(39.3)],
    }),
    // the pile: P2 onto the pillar (plate), P1 onto P2, P3 from the step on top
    step({ 2: jumpTo(41.5) }),
    step({ 1: jumpTo(41.5) }),
    step({ 3: jumpTo(41.5) }),
    // P4 with the lantern through gate E, over the pit (x=50-52), lantern down, key, and back
    step({ 4: [until((w) => !!w.power.E, 'gate E'), walk(48.2), hold(1, 0.28), jumpTo(54.0), walk(54.5), face(1), drop(), walk(56.5), walk(54.6), hold(-1, 0.28), jumpTo(47.5), walk(45.5)] }),
    // the pile climbs down to the left of the pillar; P4 over the step and the pillar to the door
    step({ 3: jumpTo(39.5) }),
    step({ 1: jumpTo(37.4) }),
    step({ 2: walk(40.5) }),
    step({ 4: [jumpTo(43.6), jumpTo(41.5), jumpTo(38.5), enter()] }),
    step({ 1: [walk(38.5), enter()] }),
    step({ 3: [walk(38.5), enter()] }),
    step({ 2: [walk(38.5), enter()] }),
  ],
} satisfies Solution;
