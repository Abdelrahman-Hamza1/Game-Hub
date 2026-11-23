import { enter, fall, jumpTo, step, until, walk, wait, type Solution } from './dsl';
import { climb, ferry, leap, of, onFerry, walkTo } from './kit4';

// Roles (spawn order puts P4 nearest the ferry): P4 is the base at the ferry's right end, P3 rides
// on P4's head, P2 and P1 climb the two-friend tower and jump to the block top as the ferry nears
// the far wall. P1 and P2 hold the 2-plate, gate A opens, and P3 and P4 walk off the docked ferry
// into the tunnel.
const s = (w: Parameters<typeof ferry>[0]) => (w.things.filter((t) => t.kind === 'mover')[0] as unknown as { s: number }).s;
const coming = (w: Parameters<typeof ferry>[0]) => s(w) > 10 && ferry(w).x <= 12.8;
const nearWall = (w: Parameters<typeof ferry>[0]) => s(w) < 10 && ferry(w).x >= 21.2;

export default {
  steps: [
    step({ 4: walk(11.5), 3: walk(10.55), 2: walk(9.6), 1: walk(8.65) }),
    step({ 4: until(coming, 'ferry coming', 20) }),
    step({ 4: walkTo(onFerry(3.5)), 3: walkTo(onFerry(2.55)), 2: walkTo(onFerry(1.6)), 1: walkTo(onFerry(0.65)) }),
    step({ 3: climb(4) }),
    step({ 2: walkTo(onFerry(2.55)), 1: walkTo(onFerry(1.6)) }),
    step({ 2: [climb(3), walkTo(of(3), 0.05)] }),
    step({ 2: [until(nearWall, 'near wall'), jumpTo(29.3), walk(29.5)] }),
    step({ 1: [walkTo(onFerry(2.55)), climb(3), walkTo(of(3), 0.05)] }),
    step({ 1: [until(nearWall, 'near wall'), jumpTo(28.4), walk(28.5)] }),
    step({ 3: [wait(0.5), leap(onFerry(2.55))] }),
    step({ 4: [until((w) => s(w) < 10 && ferry(w).x >= 21.5, 'docking'), walk(35.5)], 3: [until((w) => s(w) < 10 && ferry(w).x >= 21.2, 'docking'), walk(34.5)] }),
    step({ 4: [walk(36.4), jumpTo(41), walk(44.5)], 3: [wait(0.4), walk(36.4), jumpTo(41), walk(43.5)] }),
    step({ 2: walk(32.5), 1: walk(31.5) }),
    step({ 2: [walk(34.6), fall(), walk(36.4), jumpTo(40.5), walk(42.5), enter()], 1: [wait(0.5), walk(34.6), fall(), walk(36.4), jumpTo(40)] }),
    step({ 3: [walk(42.5), enter()] }),
    step({ 4: [walk(42.5), enter()] }),
    step({ 1: [walk(42.5), enter()] }),
  ],
} satisfies Solution;
