import { go, until, use, type Solution } from './dsl';

export default {
  note: 'Loop 1 runs the long way round to the office and passes the card through the window. Loop 2 waits under the window, takes the card through the card door, drops it by the gem and carries the gem out.',
  loops: [
    [go(12, 4), go(12, 6), use()],
    [go(12, 8), until(3.8), go(36, 2), use(), go(37, 1), go(28, 12)],
  ],
} satisfies Solution;
