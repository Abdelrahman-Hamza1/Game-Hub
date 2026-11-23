import { enter, jumpTo, push, step, walk, type Solution } from './dsl';

// P4 and P3 (front of the line) wait at the gate; P2 and P1 hold the outer plate; P4 and P3 go in
// and hold the inner plate; P1 and P2 come through and the gate closes behind everyone. P4 gives
// P3 a leg up onto the 3-high shelf for the key; then everyone jumps the pit and goes in.
const cross = (x: number) => [walk(27.5), push(1, 30.4), jumpTo(34), walk(x)];

export default {
  steps: [
    step({ 4: walk(12.5), 3: walk(11.55) }),
    step({ 2: walk(9.5), 1: walk(8.55) }),
    step({ 4: walk(17.45), 3: walk(16.5) }),
    step({ 2: walk(15.5), 1: walk(14.5) }),
    step({ 4: walk(22.5) }),
    step({ 3: [walk(20.5), jumpTo(22.5), jumpTo(24.5), walk(25.5), jumpTo(28)] }),
    step({ 3: cross(40.5) }),
    step({ 3: enter() }),
    step({ 4: cross(40.5) }),
    step({ 4: enter() }),
    step({ 2: cross(40.5) }),
    step({ 2: enter() }),
    step({ 1: cross(40.5) }),
    step({ 1: enter() }),
  ],
} satisfies Solution;
