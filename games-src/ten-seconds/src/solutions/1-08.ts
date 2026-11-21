import { go, type Solution } from './dsl';

export default {
  note: 'Loop 1 holds plate a. Loop 2 walks in through A and stands on plate b. Loop 3 takes the gem out through B.',
  loops: [
    [go(1, 9)],
    [go(12, 9)],
    [go(15, 2), go(27, 5)],
  ],
} satisfies Solution;
