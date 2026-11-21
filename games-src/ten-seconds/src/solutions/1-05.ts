import { go, until, use, type Solution } from './dsl';

export default {
  note: 'Loop 1 holds the 2×2 plate, loop 2 rings the lure so the guard runs to the far bell, loop 3 lets him pass and runs for the gem. Expert: one copy rings the lure, then holds the plate (2 loops).',
  loops: [
    [go(2, 16)],
    [go(3, 1), use()],
    [until(1.2), go(35, 10), go(2, 9)],
  ],
} satisfies Solution;
