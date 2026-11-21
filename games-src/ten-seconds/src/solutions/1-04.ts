import { go, until, type Solution } from './dsl';

export default {
  note: 'Loop 1 holds the plate. Loop 2 waits in the lobby, crosses while the guard walks away, grabs the gem, waits out of sight by the vault, and crosses back behind him.',
  loops: [
    [go(1, 7)],
    [go(6, 3), until(1.0), go(29, 6), go(26, 3), until(5.5), go(1, 5)],
  ],
} satisfies Solution;
