import { at, go, until, type Solution } from './dsl';

export default {
  note: 'The airlock (A, B, C in a row) needs plates a, b and c at once. Loop 1 runs up the service stair, past plate a, to plate b in the cloakroom. Loop 2 waits in the crate corridor until loop 1 is through (about 2.4 s), nudges the crate onto plate a, which seals the stair behind loop 1, and walks back to plate c. Loop 3 runs through the airlock. Pushing the crate early traps the stair: if loop 1 is recorded later it is blocked, and if it was recorded first it freezes in a paradox. Two loops cannot work: the crate and one copy hold only two of the three plates.',
  loops: [
    [go(14, 12), go(14, 1), go(29, 3)],
    [go(12, 3), until(3.2), at(13.6, 3.5), go(1, 1)],
    [go(20, 12), until(5.0), go(27, 9), go(29, 12)],
  ],
} satisfies Solution;
