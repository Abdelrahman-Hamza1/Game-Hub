import type { World } from '../sim/world';
import { enter, grab, hop, jumpTo, step, wait, walk, type Solution } from './dsl';
import { block, holdUntil, runJump, spring } from './kit5';

const lift = (w: World) => (w.things.find((t) => t.kind === 'lift') as unknown as { box: { y: number } }).box;
/**
 * Wait for the lift to reach the upper market. It sinks again as soon as anyone steps off, so the
 * team rides it as two stacks of two: both stacks jump off at once.
 */
const up = () => holdUntil(0, (w) => lift(w).y <= 15.001, 'lift up');
/** Push the 3-block left until it drops off the terrace. */
const push = () => holdUntil(-1, (w) => block(w).y > 11.5, 'push');
const pit1 = (x: number) => [walk(7.0), runJump(8.3, 11.8), walk(x)];
/** From the pile at the pillar, over the lid onto the lift. */
const toLift = (x: number) => [walk(37.2), hop(1), walk(x)];
/** From the terrace to the door. */
const toDoor = [walk(82.0), runJump(83.6, 88.5), walk(93.2), jumpTo(95.0), walk(106.5), enter()];

// P1 carries the lantern. Over the pit; P4 stands against the stall, P3 on P4's head, P2 and P1
// climb them onto the stall roof and stand on its plate: tunnel gate A opens for P4 and P3. Flag.
// P2 on the pillar plate, P1 on P2, P3 from the step on P1 (3/3): the spring lid opens and P4
// springs up through the shelf for the key. All four ride the 4-lift to the upper market as two
// stacks (P1 on P4, P2 on P3), both jumping off at once since it sinks as soon as anyone leaves;
// flag; over the creaky bridge one, one, then two. P1 (first across) boosts P4, P3, P2 onto the
// terrace; they push the 3-block off it as a step for P1. Flag, last pit, the step, the door.
export default {
  steps: [
    step({ 4: pit1(13.5) }),
    step({ 3: pit1(12.4) }),
    step({ 3: jumpTo(13.5) }),
    step({ 2: [...pit1(12.4), jumpTo(13.5), jumpTo(16.5), walk(17.5)] }),
    step({ 1: [walk(6.6), grab(), ...pit1(12.4), jumpTo(13.5), jumpTo(16.5), walk(16.5)] }),
    step({ 3: jumpTo(12.0) }),
    step({ 4: [walk(29.0), jumpTo(32.5), walk(37.4)], 3: [walk(25.0), walk(29.0), jumpTo(32.5)] }),
    step({ 2: [walk(20.6), jumpTo(23.0), walk(29.3), jumpTo(30.5)] }),
    step({ 1: [walk(20.6), jumpTo(23.0), walk(29.3), jumpTo(30.5)] }),
    step({ 3: jumpTo(30.5) }),
    step({ 4: [spring(38.5, 40.5), walk(46.35)] }),
    step({ 3: [jumpTo(34.5), ...toLift(45.4)] }),
    step({ 1: [jumpTo(32.5), ...toLift(42.4), jumpTo(45.4), walk(46.35)] }),
    step({ 2: [jumpTo(32.5), ...toLift(42.4), jumpTo(45.4)] }),
    step({ 4: [up(), jumpTo(51.5)], 3: [up(), wait(0.05), jumpTo(49.0)] }),
    step({ 2: jumpTo(47.5), 1: [jumpTo(53.5), walk(69.5)] }),
    step({ 4: walk(68.4) }),
    step({ 3: walk(67.4), 2: walk(66.4) }),
    step({ 4: [jumpTo(69.5), jumpTo(71.0), jumpTo(74.5), walk(76.35)] }),
    step({ 3: [walk(68.4), jumpTo(69.5), jumpTo(71.0), jumpTo(74.5), walk(75.4)] }),
    step({ 2: [walk(68.4), jumpTo(69.5), jumpTo(71.0), jumpTo(74.5), walk(74.45)] }),
    step({ 1: walk(65.0) }),
    step({ 4: push(), 3: push(), 2: push() }),
    step({ 4: walk(80.0), 3: walk(79.0), 2: walk(78.0), 1: holdUntil(0, (w) => !!block(w).support, 'block down') }),
    step({ 1: [jumpTo(68.6), jumpTo(71.5), walk(76.0)] }),
    step({ 4: toDoor }),
    step({ 3: toDoor }),
    step({ 2: toDoor }),
    step({ 1: toDoor }),
  ],
} satisfies Solution;
