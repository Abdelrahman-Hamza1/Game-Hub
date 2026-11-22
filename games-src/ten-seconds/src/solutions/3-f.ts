import { at, go, to, until, use, wait, type Solution } from './dsl';

export default {
  note: 'At 2.5 s every lockdown door shuts. Loops 1 to 3 get inside first and stay locked in at their posts: loop 1 holds the cellar plate (the necklace room door), loop 2 takes the mirror from the far end of the booth and stands in the near beam where it is fired down into the gallery, and loop 3 pushes the crate down the corridor under the gallery into the far beam (in place at about 3.4 s). Loop 4 waits by the low wall and crouches at 6.2 s and again a second later. Loop 5 is the decoy: it runs out along the far edge of the terrace past the terrace guard, and because it is the newest copy the Hound follows it there. Otherwise the Hound trails an inside copy to the lockdown door and waits exactly where the runner lands after the boost. Loop 6 waits for the gallery guard to turn his back (leave at 3.5 to 4.9 s), takes the necklace and is boosted out. The helpers are locked in, so no copy can do two jobs and five loops cannot work.',
  loops: [
    [go(8, 1)],
    [go(20, 3), go(21, 2)],
    [go(19, 14), at(24.6, 14.5)],
    [go(13, 10), until(6.2), go(13, 9), use(), wait(1.05), use()],
    [go(2, 15), until(0.5), go(2, 19), to(34, 19), to(34, 18)],
    [go(19, 10), until(3.9), go(31, 8), go(14, 10), to(11, 9), go(8, 8)],
  ],
} satisfies Solution;
