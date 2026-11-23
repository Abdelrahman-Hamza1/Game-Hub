import { drop, enter, face, fall, grab, hop, jumpTo, step, until, walk, wait, type Solution } from './dsl';
import { climb, ferry, ferryS, leap, onFerry, runJump, walkTo } from './kit4';
import type { World } from '../sim/world';

const s = (w: World) => ferryS(w);
const walkToF = (off: number) => walkTo(onFerry(off));
const leapF = (off: number) => leap(onFerry(off));
const coming = (w: World) => s(w) > 10 && ferry(w).x <= 30.8;
const nearWall = (w: World) => s(w) < 10 && ferry(w).x >= 39.2;
const docked = (w: World) => s(w) < 10 && ferry(w).x >= 39.5;
/** Over the empty pans of ring A (each sinks 1 under you: hop out), through the tunnel, down to the dock. */
const crossA = (x: number) => [walk(8.4), walk(11.4), hop(1), walk(17.4), hop(1), walk(x)];

// RING A. P4 hops the crate and the left pan onto the right pan. P3 carries the crate onto the
// raised left pan, P1 (hopping ahead of P2) and P2 drop in beside: 4 against 1 lifts P4 to the
// tower; P4 opens gate A and drops to the ferry dock. P2 climbs P1 out to the left, P3 (crate)
// climbs P1 out too and sets the crate down; P1, alone, is 1 down and jumps out to the right.
// RING B. P1, P3, P2 board the ferry; P3 climbs P1, P2 climbs P3; P4 holds the plate (gate E) and
// P2 jumps from the tower to the far block through the sky post, takes the key and presses the
// button (gate F). P1 and P3 walk off at the far end into the tunnel; P4 follows on the ferry.
// RING C. P2 is the base at the balcony, P1 climbs P2, P3 and P4 climb P1 up to the balcony. P3
// fetches the crate through the mint gate; P2 and P1 stand on the low pan (P1 on P2's head) and
// the high pan rises; P4 and P3 (crate) get on it and lift the pair; everyone gets out and in.
export default {
  steps: [
    // ring A
    step({ 4: [jumpTo(8.4), walk(11.4), hop(1), walk(16.5)] }),
    step({ 3: [walk(6.55), grab()] }),
    step({ 1: jumpTo(5.0) }),
    step({ 3: [walk(8.3), jumpTo(11.5), walk(11.52)] }),
    step({ 1: [walk(10.55), fall()] }),
    step({ 2: [walk(9.6), fall(), wait(1.2)] }),
    step({ 4: [jumpTo(19.5), walk(20.55), hop(1), walk(24.0), walk(26.5), walk(25.5)] }),
    step({ 2: [climb(1), jumpTo(7.0), walk(4.5)] }),
    step({ 3: [climb(1), wait(1), jumpTo(7.6), face(-1), drop()] }),
    step({ 1: [wait(0.6), jumpTo(13.5)] }),
    step({ 1: [walk(17.4), hop(1), walk(29.5)] }),
    step({ 3: crossA(28.55) }),
    step({ 2: [walk(5.5), jumpTo(8.4), ...crossA(27.6)] }),
    // ring B
    step({ 1: until(coming, 'ferry coming', 20) }),
    step({ 1: walkToF(3.5), 3: walkToF(2.55), 2: walkToF(1.6) }),
    step({ 3: climb(1), 4: walk(26.5) }),
    step({ 2: [walkToF(2.55), climb(3)] }),
    step({ 2: [until(nearWall, 'near wall'), jumpTo(45.5), walk(48.55), hop(1), walk(51.8), fall(), walk(59.5)] }),
    step({ 3: [wait(0.3), leapF(1.7), walkToF(2.55)] }),
    step({ 1: [until(docked, 'docked'), walk(58.55)], 3: [until(docked, 'docked'), walk(57.6)] }),
    step({ 4: [until(coming, 'ferry coming'), walkToF(2.0), until(docked, 'docked'), walk(55.5)] }),
    // ring C
    step({ 1: climb(2) }),
    step({ 3: [walk(58.55), climb(1), jumpTo(60.6), walk(60.5), runJump(62.4, 67.5), walk(70.5), hop(1), walk(73.55), face(1), grab(), walk(70.5), jumpTo(68.5)] }),
    step({ 4: [walk(58.55), climb(1), jumpTo(60.6), walk(60.5), runJump(62.4, 66.6), walk(66.5)] }),
    step({ 1: jumpTo(57.5) }),
    step({ 2: walk(65.5), 1: [wait(0.3), walk(64.5)] }),
    step({ 1: climb(2) }),
    step({ 3: [wait(0.8), jumpTo(70.6), walk(70.6)] }),
    step({ 4: [walk(68.5), jumpTo(69.5), walk(69.5)] }),
    step({ 1: [wait(0.8), jumpTo(61.5)] }),
    step({ 2: [wait(0.6), jumpTo(67.5), walk(67.5), enter()] }),
    step({ 1: [wait(0.5), walk(60.5), runJump(62.4, 67.5), walk(67.5), enter()] }),
    step({ 3: [climb(4), wait(0.3), jumpTo(67.5), walk(67.5), enter()] }),
    step({ 4: [wait(0.6), jumpTo(67.5), walk(67.5), enter()] }),
  ],
} satisfies Solution;
