import { go, until, use, type Solution } from './dsl';

export default {
  note: 'Loop 1 holds the plate. Loop 2 rings the bell once the night guard is at his post, so he leaves for the niche. Loop 3 slips past the day guard into the vault before the night guard arrives, and walks out while he is at the bell.',
  loops: [
    [go(1, 13)],
    [go(3, 1), until(5.0), use()],
    [go(5, 6), until(1.0), go(29, 2), go(30, 7), until(5.2), go(9, 7), go(1, 7)],
  ],
} satisfies Solution;
