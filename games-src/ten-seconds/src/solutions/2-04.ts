import { go, until, use, type Solution } from './dsl';

export default {
  note: 'Loop 1 takes the card and holds door A while the others go into the vault, then walks to the window and passes the card into the back room. Loop 2 goes through the vault and the scanner into the back room, picks up the card and holds door B. Loop 3 takes the gem through the scanner and out through B.',
  loops: [
    [go(9, 9), go(4, 7), until(1.8), go(14, 10), use()],
    [go(4, 5), go(20, 5), go(16, 10), go(24, 10)],
    [go(19, 2), go(20, 7), go(31, 10)],
  ],
} satisfies Solution;
