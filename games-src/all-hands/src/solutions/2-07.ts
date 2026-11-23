import { enter, hold, jumpTo, step, until, walk, type Solution } from './dsl';
import type { World } from '../sim/world';

// P4, P3 and P2 ride the main lift (3/3) while P1 leans on the 3-second button so gate A is open
// when they arrive; they jump off together through A. P4 takes the key and opens the door (hopping
// the service-lift shaft); P2 and P3 hold the plate (gate E opens) while P1 walks under the slab,
// hops the bump, goes through E and rides the service lift up. Then everyone in.
const lift = (w: World, i: number) => w.things.filter((t) => t.kind === 'lift')[i] as unknown as { box: { y: number }; dy: number };
const atTop = (i: number) => (w: World) => lift(w, i).box.y < 15.01 && lift(w, i).dy === 0;
const atBottom = (i: number) => (w: World) => lift(w, i).box.y > 24.99;
const toLift = (x: number) => [walk(10.4), jumpTo(12.6), walk(x)];
const home = [walk(41.4), jumpTo(44.6), walk(45.5), enter()];

export default {
  steps: [
    step({ 4: toLift(17.45) }),
    step({ 3: toLift(16.5) }),
    step({ 2: toLift(15.55), 1: [walk(10), hold(1, 0.5)] }),
    step({ 1: until(atTop(0), 'main lift up') }),
    step({ 4: jumpTo(20.5), 3: jumpTo(19.5), 2: jumpTo(18.5) }),
    step({ 4: [walk(34.5), ...home], 3: walk(23.5), 2: walk(22.5) }),
    step({ 1: [until(atBottom(0), 'main lift down'), jumpTo(12.6), walk(25.4), jumpTo(28.6), walk(43)] }),
    step({ 1: until(atTop(1), 'service lift up') }),
    step({ 1: [walk(45.5), enter()] }),
    step({ 3: home }),
    step({ 2: home }),
  ],
} satisfies Solution;
