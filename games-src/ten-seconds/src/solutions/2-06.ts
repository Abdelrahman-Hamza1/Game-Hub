import { go, until, use, type Solution } from './dsl';

export default {
  note: 'Loop 1 walks to the shutter switch and presses it at 1.6 s. Loop 2 waits round the corner from the vault corridor, runs up it while the camera is blind, takes the gem and is back round the corner before it wakes, then walks to the exit.',
  loops: [
    [go(2, 5), until(1.6), use()],
    [go(15, 7), until(2.0), go(16, 1), go(20, 2), go(15, 7), go(30, 14)],
  ],
} satisfies Solution;
