import { go, until, use, type Solution } from './dsl';

export default {
  note: 'Both switches start on. Loop 1 walks into the west booth and flips switch a off: door A opens (and the booth locks). Loop 2 waits in the south booth and flips switch b off once the runner is through A, which shuts A behind them and opens B. Loop 3 takes the gem and leaves through B.',
  loops: [
    [go(3, 2), use()],
    [go(22, 13), until(3.0), use()],
    [go(13, 7), until(2.0), go(14, 3), go(21, 4), go(27, 4)],
  ],
} satisfies Solution;
