import { go, until, use, type Solution } from './dsl';

export default {
  note: 'Loop 1 runs round the long wall, grabs the gem and passes it through the window. Loop 2 waits on the other side and carries it out.',
  loops: [
    [go(6, 9), go(6, 8), use()],
    [go(6, 6), until(4.6), go(5, 2)],
  ],
} satisfies Solution;
