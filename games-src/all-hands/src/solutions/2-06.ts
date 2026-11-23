import { enter, jumpTo, step, until, wait, walk, type Solution } from './dsl';
import type { World } from '../sim/world';

// P3 and P4 ride the right lift up and wait. P1 and P2 ride the left lift to the balcony (P2 takes
// the key) and hold its plate: gate A opens. P3 and P4 go through A and hold the inner plate. P1 and P2 jump down, ride the right
// lift (it slid back down) and come through. Pairs leave a lift together, jumping, because a lift
// with one rider slides back down.
const liftTop = (i: number) => (w: World) => {
  const l = w.things.filter((t) => t.kind === 'lift')[i] as unknown as { box: { y: number }; dy: number };
  return l.box.y < 13.01 && l.dy === 0;
};
const liftDown = (i: number) => (w: World) => {
  const l = w.things.filter((t) => t.kind === 'lift')[i] as unknown as { box: { y: number } };
  return l.box.y > 22.99;
};

export default {
  steps: [
    step({ 4: walk(31.45) }),
    step({ 3: walk(30.5) }),
    step({ 2: walk(10.5), 1: walk(9.45) }),
    step({ 1: until(liftTop(0), 'left lift up') }),
    step({ 2: [jumpTo(15), walk(16.5), walk(14.5)], 1: [jumpTo(13), walk(13.5)] }),
    step({ 4: [jumpTo(34.5), walk(36.95)], 3: [jumpTo(33.5), walk(36)] }),
    step({ 2: [walk(19.5), walk(28.5)] }),
    step({ 1: [walk(19.5), walk(27.5)] }),
    step({ 1: until(liftDown(1), 'right lift down') }),
    step({ 2: walk(31.45), 1: walk(30.5) }),
    step({ 1: until(liftTop(1), 'right lift up') }),
    step({ 2: jumpTo(34.5), 1: jumpTo(33.5) }),
    // P2 (key) hops over the others' heads to the door
    step({ 2: [jumpTo(36.4), wait(0.05), jumpTo(39.5), walk(42.5), enter()] }),
    step({ 4: [walk(42.5), enter()] }),
    step({ 3: [walk(42.5), enter()] }),
    step({ 1: [walk(42.5), enter()] }),
  ],
} satisfies Solution;
