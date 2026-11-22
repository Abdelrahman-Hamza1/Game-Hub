import { go, until, type Solution } from './dsl';

export default {
  note: 'Loop 1 picks up the mirror and stands in the beam at the top of the corridor. Loop 2 waits for it there, then runs through under it to the brooch and back. One loop cannot do both: you carry one thing at a time, and the brooch has to cross the beam.',
  loops: [
    [go(1, 8), go(13, 4)],
    [go(9, 5), until(2.0), go(23, 3), go(1, 5)],
  ],
} satisfies Solution;
