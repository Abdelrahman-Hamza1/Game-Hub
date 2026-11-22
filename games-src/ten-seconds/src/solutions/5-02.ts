import { go, type Solution } from './dsl';

export default {
  note: 'Loop 1 touches the rewind stone, so loop 2 lasts 5 s. Loop 2 slips into the spring closet before its door locks at 2.5 s and stands on plate a; the loop ends before the watchman turns round at 6.5 s, and the copy stays on the plate. Loop 3 runs the gallery through door A, takes the balance wheel and leaves before the watchman sees the closet. A holder recorded in a 10 s loop is locked in and seen.',
  loops: [
    [go(1, 6), go(2, 4)],
    [go(2, 1)],
    [go(34, 4), go(36, 2), go(37, 6)],
  ],
} satisfies Solution;
