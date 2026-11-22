import { go, until, type Solution } from './dsl';

export default {
  note: 'Full-length jobs first: the closets lock at 2.5 s and the watchmen look in at 8.2 s, so after a closet copy exists, every 10 s loop gets seen. Loop 1 (10 s, no stone) holds plate e so the runner gets through G at about 5.5 s, then lets go at 5.8 s so F opens. Loop 2 (10 s) touches the stone and holds plate f (door D) until 7.2 s, then lets go so H opens. Loop 3 (5 s) touches the stone again and shuts itself in closet a. Loop 4 (5 s, no stone) shuts itself in closet b, so loop 5 is full length: the runner goes through A and B and both airlocks and leaves with the mainspring before the watchmen turn. A 5 s copy can\'t let go after 5 s, a 10 s copy in a closet is seen, and plates e and f are too far apart for one copy.',
  loops: [
    [go(1, 3), until(5.8), go(3, 4)],
    [go(1, 6), go(38, 4), until(7.2), go(36, 4)],
    [go(1, 6), go(2, 1)],
    [go(17, 1)],
    [go(37, 9), go(18, 10), go(9, 10), go(1, 10)],
  ],
} satisfies Solution;
