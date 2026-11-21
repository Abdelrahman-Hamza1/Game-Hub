import { go, until, type Solution } from './dsl';

export default {
  note: 'Loop 1 holds the plate until the runner is out of the gem room, then steps off so B opens.',
  loops: [
    [go(13, 3), until(3.2), go(11, 2)],
    [go(18, 7), go(13, 4), go(20, 3), go(25, 3)],
  ],
} satisfies Solution;
