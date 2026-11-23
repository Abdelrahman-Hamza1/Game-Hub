import { In } from '../sim/types';
import type { World } from '../sim/world';
import { enter, jumpTo, push, step, walk, type Action, type Solution } from './dsl';

// Blocks in reading order: [0] the 3-block on the door step, [1] the 2-block, [2] the 4-block.
const blk = (w: World, i: number) => w.bodies.filter((b) => b.kind === 'block')[i];
/** hold a direction until the world says stop (a conga where one pusher stops early stalls) */
const shove = (dir: 1 | -1, done: (w: World) => boolean): Action => ({
  name: 'shove',
  limit: 60 * 20,
  tick: ({ w }) => (done(w) ? null : dir > 0 ? In.Right : In.Left),
});
const twoIn = (w: World) => blk(w, 1).x >= 15;
const fourAtWall = (w: World) => blk(w, 2).x >= 35.98;
const threeOff = (w: World) => blk(w, 0).y > 12.5;

// P4 and P3 jump the pit and push the 2-block into the notch onto the plate (gate A opens for
// good); P1 and P2 follow. All four conga the 4-block against the plateau and climb it. P4 under
// the shelf, P3 on P4, P2 up through the shelf for the key. P4 gives P2, P3, P1 a leg up the door
// step; they push the 3-block down for P4; everyone jumps the pit to the door.
const upStep = (x: number) => [walk(47.5), jumpTo(49.5), jumpTo(50.8), walk(51.3), jumpTo(52.8), jumpTo(54.7), walk(x)];
const toDoor = [push(1, 56.5), jumpTo(61.5), walk(61.5), enter()];

export default {
  steps: [
    step({ 4: [jumpTo(9), walk(9.5)] }),
    step({ 3: [walk(5.5), jumpTo(8.6)] }),
    step({ 4: shove(1, twoIn), 3: shove(1, twoIn) }),
    step({ 4: walk(30.55) }),
    step({ 3: walk(29.6) }),
    step({ 2: [walk(5.5), jumpTo(8.6), walk(28.65)] }),
    step({ 1: [walk(5.5), jumpTo(8.6), walk(27.7)] }),
    step({ 4: shove(1, fourAtWall), 3: shove(1, fourAtWall), 2: shove(1, fourAtWall), 1: shove(1, fourAtWall) }),
    step({ 4: [jumpTo(37), jumpTo(39.5), walk(44.5)] }),
    step({ 3: [walk(35.4), jumpTo(37), jumpTo(39.5), walk(42.5), jumpTo(44.5)] }),
    step({ 2: [walk(35.4), jumpTo(37), jumpTo(39.5), walk(42.5), jumpTo(44.5), jumpTo(44.5), walk(43.5)] }),
    step({ 1: [walk(35.4), jumpTo(37), jumpTo(39.5)] }),
    step({ 3: walk(41.5) }),
    step({ 2: walk(42.5) }),
    step({ 4: walk(49.55) }),
    step({ 2: upStep(56.35) }),
    step({ 3: upStep(55.4) }),
    step({ 1: upStep(54.45) }),
    step({ 4: walk(45.5) }),
    step({ 2: shove(-1, threeOff), 3: shove(-1, threeOff), 1: shove(-1, threeOff) }),
    step({ 2: toDoor }),
    step({ 3: toDoor }),
    step({ 1: toDoor }),
    step({ 4: [jumpTo(48.6), jumpTo(51.5), ...toDoor] }),
  ],
} satisfies Solution;
