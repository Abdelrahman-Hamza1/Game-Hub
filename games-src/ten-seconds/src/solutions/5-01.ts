import { go, until, type Solution } from './dsl';

export default {
  note: 'Loops are 5 s. Loop 1 holds plate a (door A), loop 2 holds plate b (door B) at the other end of the gallery, loop 3 waits at the airlock, goes up through A and B, takes the key and leaves. With 10 s loops one copy could hold a and then run to b; in 5 s the gallery is too long.',
  loops: [
    [go(1, 8)],
    [go(38, 8)],
    [go(19, 7), until(1.9), go(19, 1), go(24, 2)],
  ],
} satisfies Solution;
