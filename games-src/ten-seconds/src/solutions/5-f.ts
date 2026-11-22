import { go, until, type Solution } from './dsl';

export default {
  note: 'Loops 1 to 3 shut themselves into the three escapement closets (levers a, b and c) before the doors lock at 2.5 s. The Watchmaker rewinds loops 1 and 2 at 8 s, since not every lever is held yet; from loop 3 on all three are held at 8 s. A remembered lever holder sends an Auditor down the escapement passage to wait at its closet, so the two newest copies must be decoys. Loop 4 shuts itself into the north niche and loop 5 into the south niche; both niches lock at 5.5 s. In loop 6 each Auditor climbs out through a stair gate (which shuts at 3 s) and waits outside a niche. The runner crosses the empty workshop, and when the case opens at 8 s she takes the master watch to the exit.',
  loops: [
    [go(9, 12)],
    [go(11, 8)],
    [go(13, 12)],
    [go(2, 2), until(1.25), go(16, 3)],
    [go(2, 19), until(1.25), go(16, 18)],
    [until(1), go(35, 10), go(37, 10), go(38, 10)],
  ],
} satisfies Solution;
