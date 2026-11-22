import { go, until, type Solution } from './dsl';

export default {
  note: 'Loop 1 steps into the closet (plate a) before it locks at 2.5 s. Each Auditor remembers one copy: the upper one the newest, the lower one the copy before. A remembered plate holder sends him down the escapement passage to wait outside the closet, which shuts the passage. So the two newest copies must both be decoys. Loop 2 climbs the west stair and slips into the north niche at about 9.9 s. Loop 3 goes down to the south gallery and reaches the south niche at about 9.3 s. In loop 4 both Auditors leave the watch room, one up each stair, and the runner takes the chronometer through door A and back out.',
  loops: [
    [go(9, 12)],
    [go(2, 2), until(8.75), go(14, 3)],
    [go(2, 19), until(8), go(14, 18)],
    [until(0.5), go(32, 10), go(37, 10), go(1, 12)],
  ],
} satisfies Solution;
