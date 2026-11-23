import { In } from '../sim/types';
import { enter, grab, jumpTo, step, walk, type Action, type Solution } from './dsl';

/** Everyone holds Right until the block has dropped into the hole. */
const shove = (): Action => ({
  name: 'shove',
  limit: 60 * 20,
  tick: ({ w }) => (w.bodies.find((b) => b.kind === 'block')!.y > 13.5 ? null : In.Right),
});

// P4 (in front) takes the lantern and leads. Over the first pit one at a time; P3 stands under the
// shelf and P2 jumps off P3's head up through it for the key (the lantern carrier's hands are
// full, so the key goes to a free pair of hands). Over the second pit, conga of four into the
// tunnel, push the 4-block into the hole, over it, and in.
const pit1 = (x: number) => [walk(9.3), jumpTo(12.6), walk(x)];
const pit2 = (x: number) => [walk(19.3), jumpTo(22.6), walk(x)];
const door = [walk(45.5), enter()];
const over = [walk(32.4), jumpTo(36.5)];

export default {
  steps: [
    step({ 4: [walk(6.6), grab()] }),
    step({ 4: [...pit1(19.3), ...pit2(27.55)] }),
    step({ 3: pit1(16.5) }),
    step({ 2: pit1(15.4) }),
    step({ 1: pit1(13.5) }),
    step({ 2: [jumpTo(16.5), jumpTo(16.5), walk(17.5), jumpTo(19.3), jumpTo(22.6), walk(26.6)] }),
    step({ 3: pit2(25.65) }),
    step({ 1: pit2(24.7) }),
    step({ 4: shove(), 2: shove(), 3: shove(), 1: shove() }),
    step({ 4: [jumpTo(36.5), walk(46.5)] }),
    step({ 2: [...over, ...door] }),
    step({ 3: [...over] }),
    step({ 4: door }),
    step({ 3: door }),
    step({ 1: [...over, ...door] }),
  ],
} satisfies Solution;
