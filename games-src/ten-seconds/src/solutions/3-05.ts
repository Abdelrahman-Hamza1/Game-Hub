import { at, go, until, type Solution } from './dsl';

export default {
  note: 'Loop 1 fetches the mirror from the foyer corner and stands in the near beam at the top of the gallery. Loop 2 pushes the crate down the dead-end service corridor into the far beam (it crosses the corridor, then the gallery through the slot window); the crate is in place at about 3.8 s. Loop 3 crosses under both and brings the emerald back. One copy doing both jobs gets back to the near beam after 8.9 s, too late for anyone to get out.',
  loops: [
    [go(1, 10), go(14, 3)],
    [go(15, 1), at(23.6, 1.5)],
    [go(12, 6), until(3.1), go(31, 5), go(1, 3)],
  ],
} satisfies Solution;
