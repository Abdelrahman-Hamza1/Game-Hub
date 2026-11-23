import { enter, hold, hop, jumpTo, push, step, until, wait, walk, type Action, type Solution } from './dsl';
import type { World } from '../sim/world';

// Scroll 1 t/s from the first tick, so everyone moves at once, staggered; after that the screen's
// right edge sets the pace (nobody can be more than ~29.5 tiles ahead of its left edge).
// Front to back: P4, P3, P2, P1. Over the bump and the pit, conga the 4-block into its hole, then
// at the pillar: P2 on the plate, P1 on P2, P3 (waiting on the step) on top (3/3, gate A opens);
// P4 runs through and touches the 8 s button, the pile comes down and follows. Over the button,
// the step and the pit; P2 takes the key off the 3-high shelf by a leg-up from P1; over the last
// pit, and in once the door is on screen.
const sx = (x: number) => until((w: World) => w.cam.scrollX >= x - 29.4, `screen ${x}`);
const go = (x: number): Action[] => [sx(x), walk(x)];
const jt = (x: number): Action[] => [sx(x), jumpTo(x)];
const over = (delay: number, x: number) => [wait(delay), walk(8.5), hop(1), walk(12.5), jumpTo(17), walk(x)];
const blockDown = (w: World) => w.bodies.some((b) => b.kind === 'block' && b.y > 14.5);
const after = (n: number, x: number) => until((w: World) => { const p = w.players[n - 1]; return p.gone || p.x + p.w / 2 >= x; }, `after P${n} ${x}`);
const onward = (x: number) => [...go(55.4), jumpTo(57.3), walk(58.5), ...sxw(64), hold(1, 0.17), jumpTo(64), walk(x)];
const sxw = (x: number) => [sx(x)];

export default {
  steps: [
    step({ 4: over(0, 20.55), 3: over(0.4, 19.6), 2: over(0.8, 18.65), 1: over(1.2, 17.7) }),
    // conga: P4 against the block (block x=21 → P4 centre 20.55); it drops in at x=27
    step({ 4: push(1, 26.9), 3: push(1, 25.95), 2: push(1, 25.0), 1: push(1, 24.05) }),
    step({ 4: until(blockDown, 'block in hole') }),
    // to the pillar: P4 over the pillar and the step to wait by the gate, P3 onto the step,
    // P2 onto the pillar (the plate), P1 onto P2, P3 on top
    step({
      4: [...go(39.3), jumpTo(40.5), ...jt(42.9), ...go(46.5)],
      3: [wait(0.4), ...go(38.4)],
      2: [wait(0.6), ...go(37.4)],
      1: [wait(0.8), ...go(36.4)],
    }),
    step({ 3: [walk(39.3), jumpTo(40.5), jumpTo(42.6)] }),
    step({ 2: [walk(39.3), jumpTo(40.5)] }),
    step({ 1: [walk(39.3), jumpTo(40.5)] }),
    step({ 3: [jumpTo(40.5)] }),
    // gate open: P4 to the button (8 s from the last touch) and over it; the pile comes down
    step({
      4: [until((w) => !!w.power.A, 'gate A'), ...go(50.4), hold(1, 0.2), jumpTo(52.6), walk(55.4)],
      3: [after(4, 51), jumpTo(46.5), walk(49.6), after(4, 54), jumpTo(52.6), walk(54.45)],
      1: [after(3, 47), jumpTo(44.5), walk(46.5), after(3, 52), walk(49.6), after(3, 53.5), jumpTo(52.6), walk(53.5)],
      2: [after(1, 44), jumpTo(46.5), after(1, 52), walk(49.6), after(1, 53), jumpTo(52.55)],
    }),
    // up the 2-high step, down its far side, a running jump over the 3-wide pit, on under the key shelf
    step({ 4: onward(80.5), 3: [after(4, 62.6), ...onward(79.5)], 1: [after(3, 62.6), ...onward(73.4)], 2: [after(1, 62.6), ...onward(72.3)] }),
    // the key: P1 stands by the shelf, P2 hops on P1's head and up onto the shelf for the key
    step({ 2: [jumpTo(73.4)] }),
    step({ 2: [jumpTo(75.5)] }),
    step({ 2: [jumpTo(78.2)] }),
    // over the last pit (x=82-83), then in once the door (x=92) is on screen; P2 opens it
    step({ 4: [walk(81.3), ...jt(84.6), walk(88.5)] }),
    step({ 3: [walk(81.3), ...jt(84.6), walk(87.5)] }),
    step({ 2: [walk(81.3), ...jt(84.6), walk(86.5)] }),
    step({ 1: [walk(81.3), ...jt(84.6), walk(85.5)] }),
    step({ 4: go(94.5), 3: [after(4, 92), ...go(93.55)], 2: [after(3, 92.6), ...go(92.5), enter()], 1: [after(2, 88), ...go(91.4)] }),
    step({ 3: [walk(92.5), enter()] }),
    step({ 4: [walk(92.5), enter()] }),
    step({ 1: [walk(92.5), enter()] }),
  ],
} satisfies Solution;
