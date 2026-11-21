import { go, until, use, type Solution } from './dsl';

export default {
  note: 'Loop 1 flips the switch at once (the vault opens, the way out shuts) and flips it back at 5 s. Loop 2 walks in, takes the gem, waits at B and leaves when it opens.',
  loops: [
    [go(1, 8), use(), until(5.0), use()],
    [go(25, 5), go(27, 5), go(32, 4)],
  ],
} satisfies Solution;
