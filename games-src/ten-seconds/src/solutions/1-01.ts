import { go, type Solution } from './dsl';

export default {
  note: 'Loop 1 holds the plate; loop 2 runs for the gem.',
  loops: [
    [go(1, 6)],
    [go(23, 5), go(1, 2)],
  ],
} satisfies Solution;
