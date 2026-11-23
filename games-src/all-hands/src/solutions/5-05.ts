import { enter, hop, jumpTo, step, walk, type Solution } from './dsl';
import { block, holdUntil, runJump, spring } from './kit5';

const pit1 = (x: number) => [walk(6.3), jumpTo(9.7), walk(x)];
const shove = () => holdUntil(1, (w) => block(w).x >= 37.6, 'shove');
const lidToDoor = [walk(62.6), hop(1), walk(73.3), runJump(74.4, 78.7), walk(80.3), jumpTo(82.5), walk(82.0), runJump(83.6, 89.0), walk(92.5), enter()];

// Over the first pit; P2 on the pillar plate, P1 on P2, P3 from the step on P1 (3/3); P4 goes
// through A and holds the inner plate while the pile comes down and jumps over P4. Flag.
// Conga-push the 4-block onto the 4-plate: the bridge appears. Over it, flag, over the small pit;
// P1, P2, P4 hold the lid plate, P3 hops on the spring up through the shelf for the key, and
// everyone runs to the door.
export default {
  steps: [
    step({ 4: [...pit1(11.3), jumpTo(13.5), hop(1), walk(17.5)] }),
    step({ 3: [...pit1(11.3), jumpTo(13.5), hop(1), walk(14.6)] }),
    step({ 2: [...pit1(11.3), jumpTo(12.5)] }),
    step({ 1: [...pit1(11.3), jumpTo(12.5)] }),
    step({ 3: [jumpTo(12.5)] }),
    step({ 4: [walk(22.5)] }),
    step({ 3: [jumpTo(16.5), walk(21.4), jumpTo(25.5), walk(29.55)] }),
    step({ 1: [jumpTo(16.5), walk(21.4), jumpTo(25.5), walk(28.6)] }),
    step({ 2: [jumpTo(13.6), walk(21.4), jumpTo(25.5), walk(27.65)] }),
    step({ 4: walk(26.7) }),
    step({ 3: shove(), 2: shove(), 1: shove(), 4: shove() }),
    step({ 3: [jumpTo(39.0), walk(40.0), walk(54.4), jumpTo(57.6), walk(63.5)] }),
    step({ 1: [jumpTo(39.0), walk(40.0), walk(54.4), jumpTo(57.6), walk(61.45)] }),
    step({ 2: [walk(37.0), jumpTo(39.0), walk(40.0), walk(54.4), jumpTo(57.6), walk(60.5)] }),
    step({ 4: [walk(37.0), jumpTo(39.0), walk(40.0), walk(54.4), jumpTo(57.6), walk(59.55)] }),
    step({ 3: [spring(64.6, 66.5), walk(68.7), walk(73.5)] }),
    step({ 3: lidToDoor.slice(2) }),
    step({ 1: lidToDoor }),
    step({ 2: lidToDoor }),
    step({ 4: lidToDoor }),
  ],
} satisfies Solution;
