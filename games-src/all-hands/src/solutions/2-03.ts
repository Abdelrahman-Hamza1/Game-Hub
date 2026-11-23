import { enter, hold, jump, jumpTo, step, walk, type Solution } from './dsl';

// P4 hops the 4-block and jumps into the switch against gate A (A opens, E shuts); all four
// conga-push the block through A up to E; P1 flips the switch from the inside (A shuts, E opens);
// push on to the plateau wall, climb block -> plateau, key, pit, door.
const up = (x: number) => [walk(31.5), jumpTo(33), jumpTo(36.5), walk(43.4), jumpTo(47.5), walk(x)];

export default {
  steps: [
    step({ 4: [walk(8), jumpTo(12.5), hold(1, 1.2), jump(), walk(11.5), jumpTo(8.4)] }),
    step({ 4: walk(8.45), 3: walk(7.5), 2: walk(6.55), 1: walk(5.6) }),
    step({ 1: hold(1, 6.2), 2: hold(1, 6.2), 3: hold(1, 6.2), 4: hold(1, 6.2) }),
    step({ 1: [walk(17.4), jump(), walk(19.85)] }),
    step({ 1: hold(1, 4.2), 2: hold(1, 4.2), 3: hold(1, 4.2), 4: hold(1, 4.2) }),
    step({ 4: [jumpTo(33), jumpTo(36.5), walk(43.4), jumpTo(47.5), walk(48.5), enter()] }),
    step({ 3: [...up(48.5), enter()] }),
    step({ 2: [...up(48.5), enter()] }),
    step({ 1: [...up(48.5), enter()] }),
  ],
} satisfies Solution;
