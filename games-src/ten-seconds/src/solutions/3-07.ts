import { go, to, until, use, wait, type Solution } from './dsl';

export default {
  note: 'Bodies collide, so the copies queue out of the foyer a fifth of a second apart. Loop 1 stands on the cloakroom plate, which drops the booth curtain (the guard watches the stage front through it) at about 1.9 s. Loop 2 waits in the crowd until then, crouches at the stage edge, and crouches again a second later. Loop 3 is boosted onto the bandstand from beside the crouched copy (from beside, so the vault does not pass through it) and crouches at the balcony edge. Loop 4 takes both leg-ups, the second from the tile beside loop 3, and carries the diamond to the stairs. Three loops cannot work: the curtain, both leg-ups and the runner are all needed at the same moment, and the bandstand partner needs a leg-up itself.',
  loops: [
    [go(17, 13), go(3, 13), go(2, 14)],
    [wait(0.2), go(17, 10), until(2.2), go(17, 7), use(), wait(1.05), use()],
    [wait(0.4), go(18, 10), until(2.8), go(18, 7), to(17, 5), go(18, 4), use()],
    [wait(0.6), go(18, 12), until(3.0), go(18, 7), to(17, 5), to(17, 4), to(18, 2), go(13, 1), go(22, 1)],
  ],
} satisfies Solution;
