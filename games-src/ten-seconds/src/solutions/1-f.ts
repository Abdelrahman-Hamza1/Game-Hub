import { go, until, use, type Solution } from './dsl';

export default {
  note: 'Loop 1 slips into the bell closet before the plates go down. Loop 2 heads for the exit wing and waits under the window. Loops 3 and 4 hold plates a and b together, opening the airlock (and shutting doors C and D). Loop 5 times the stair guard, crosses the airlock, follows the gallery guard east, and once the bell has pulled him into his alcove, passes the ruby up through the window. Expert: the holders can step off after the airlock and one of them can ring the bell, if the runner hides in the gallery until it rings (4 loops).',
  loops: [
    [go(1, 1), until(4.4), use()],
    [go(30, 9), until(7.4), go(28, 8)],
    [go(17, 2), until(4.0), go(17, 1)],
    [go(17, 8), until(4.0), go(17, 9)],
    [go(5, 8), until(3.6), go(30, 11), use(), go(26, 13)],
  ],
} satisfies Solution;
