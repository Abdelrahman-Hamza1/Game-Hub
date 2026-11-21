import { go, until, use, type Solution } from './dsl';

export default {
  note: 'The front doors lock at 2 s. Loop 1 stays on the street under the teller window and leaves for the getaway at 7.8 s. Loop 2 takes the keycard from the back office and stands beside the card door. Loop 3 crosses to the plate room and holds the plate. Loop 4 slips round behind the back-office guard into the security booth and presses the shutter at 3.6 s. Loop 5 waits beside the card door, runs the whole vault while the camera is blind, comes back along the west wall, waits for the counter guard to turn, and passes the diamond out through the teller window.',
  loops: [
    [go(9, 3), until(7.8), go(13, 2)],
    [go(18, 8), go(6, 12), go(4, 13)],
    [go(35, 8), go(37, 12)],
    [go(18, 8), go(25, 9), go(31, 9), go(31, 11), go(28, 10), until(3.6), use()],
    [go(17, 8), go(2, 10), go(2, 13), until(4.2), go(3, 20), go(1, 12), go(1, 10), go(6, 8), go(9, 5), use(), go(7, 6)],
  ],
} satisfies Solution;
