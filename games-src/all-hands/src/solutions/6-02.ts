import { enter, hold, jumpTo, step, until, walk, type Action, type Solution } from './dsl';
import { In } from '../sim/types';
import type { World } from '../sim/world';

/** Hold Right until the block's left edge reaches x (the whole conga stops together). */
const shove = (x: number): Action => ({
  name: `shove to ${x}`,
  limit: 60 * 30,
  tick: ({ w }) => (w.bodies.find((b) => b.kind === 'block')!.x >= x ? null : In.Right),
});

// P1 stands against the button ledge, P2 climbs it off P1's head while P4 and P3 line up behind
// the block. P2 touches the 12 s button (gate A) and runs back to the end of the conga; the four
// push the block through gate A onto the 4-plate (gate E opens for good). Over the block and the
// bump, P2 touches the lid button (8 s) and the four ride the lift up; all hop off together, P4
// takes the key, and in.
const after = (n: number, x: number) => until((w: World) => w.players[n - 1].x + 0.45 >= x, `after P${n} ${x}`);
const lifted = (w: World) => w.players.every((p) => p.y + p.h <= 14.05);
const over = (x: number) => [jumpTo(30.8), jumpTo(32.5), jumpTo(35.5), walk(x)];

export default {
  steps: [
    step({ 1: walk(5.45), 2: walk(6.6), 3: walk(14.6), 4: walk(15.55) }),
    step({ 2: [jumpTo(5.45), jumpTo(3.5), hold(-1, 0.2)] }),
    step({ 1: walk(13.65), 2: [jumpTo(6.5), walk(12.7)] }),
    step({ 4: shove(29.9), 3: shove(29.9), 1: shove(29.9), 2: shove(29.9) }),
    // over the block and the bump, through gate E onto the lift; P2 touches the lid button last
    step({ 4: over(41.35), 3: [after(4, 33), ...over(40.4)], 1: [after(3, 33), ...over(39.45)], 2: [after(1, 33), ...over(35.45), hold(-1, 0.1), walk(38.5)] }),
    step({ 4: until(lifted, 'lift at the top') }),
    // all off together onto the ledge
    step({ 4: jumpTo(45.4), 3: jumpTo(44.45), 1: jumpTo(43.5), 2: jumpTo(42.55) }),
    step({ 4: [walk(47.5), enter()] }),
    step({ 3: [walk(47.5), enter()] }),
    step({ 1: [walk(47.5), enter()] }),
    step({ 2: [walk(47.5), enter()] }),
  ],
} satisfies Solution;
