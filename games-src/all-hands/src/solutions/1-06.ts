import { In } from '../sim/types';
import type { World } from '../sim/world';
import { enter, jumpTo, step, walk, type Action, type Solution } from './dsl';

// P4 stands under the one-way shelf, P3 on P4's head; P2 climbs the two of them and jumps up
// through the shelf for the key, then walks off it. Conga-push the 4-block onto the plate: the
// bridge appears. Everyone hops over the block, crosses the bridge and goes in (P2 opens the door).
// everyone in the conga keeps pushing until the block is on the plate (a pusher who stops early
// stalls the line)
const block = (w: World) => w.bodies.find((b) => b.kind === 'block')!;
const shove = (): Action => ({ name: 'shove', limit: 60 * 20, tick: ({ w }) => (block(w).x >= 22.5 ? null : In.Right) });
const over = [jumpTo(24), jumpTo(27.5), walk(44.5), enter()];

export default {
  steps: [
    step({ 4: walk(9.5) }),
    step({ 3: [walk(7.5), jumpTo(9.5)] }),
    step({ 2: [walk(7.5), jumpTo(9.5), jumpTo(9.5), walk(11.8)] }),
    step({ 2: walk(13.55) }),
    step({ 3: jumpTo(7.5) }),
    step({ 4: walk(12.6) }),
    step({ 3: walk(11.65), 1: walk(10.7) }),
    step({ 2: shove(), 4: shove(), 3: shove(), 1: shove() }),
    step({ 2: over }),
    step({ 4: over }),
    step({ 3: [walk(21.9), ...over] }),
    step({ 1: [walk(21.9), ...over] }),
  ],
} satisfies Solution;
