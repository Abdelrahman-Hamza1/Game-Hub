import { go, type Solution } from './dsl';

export default {
  note: 'One copy per plate, then the runner.',
  loops: [
    [go(1, 1)],
    [go(1, 7)],
    [go(20, 6), go(1, 5)],
  ],
} satisfies Solution;
