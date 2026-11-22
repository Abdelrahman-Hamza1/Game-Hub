import { go, until, type Solution } from './dsl';

export default {
  note: 'Loops 1 and 2 step into the two plate closets (a and b) before their doors lock at 2.5 s. Whenever a plate holder is the newest copy, the Auditor walks down the one-tile escapement passage to its closet and waits outside the locked door, blocking the passage for the rest of the loop. So loop 3 is the decoy: it goes down the south stair, idles in the bottom gallery and reaches the corner alcove at about 9 s. In loop 4 the Auditor heads down the service stair to that alcove, and the runner goes through A and B for the minute train and back out to the exit. In either order, a plate holder as the newest copy keeps the passage shut.',
  loops: [
    [go(14, 10)],
    [go(10, 10)],
    [go(2, 20), go(20, 20), until(7.5), go(32, 19)],
    [until(0.4), go(34, 7), go(36, 2), go(1, 6)],
  ],
} satisfies Solution;
