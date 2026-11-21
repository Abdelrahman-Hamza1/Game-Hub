import { go, until, use, type Solution } from './dsl';

export default {
  note: 'Loop 1 walks to the security office and presses the shutter at 4.2 s. Loop 2 takes the keycard and stands beside the card door, out of the camera\'s line, holding it open. Loop 3 waits on the other side of the door, runs up the corridor while the camera is blind and the clerk walks away, grabs the gem and is back through the door before the camera wakes.',
  loops: [
    [go(36, 3), until(4.2), use()],
    [go(5, 13), go(9, 12)],
    [go(11, 12), until(4.6), go(10, 6), go(13, 6), go(10, 6), go(10, 12), go(1, 15)],
  ],
} satisfies Solution;
