import { at, go, inCar, until, use, type Solution } from './dsl';

export default {
  note: 'Loop 1 runs to the far plate (3.5 s), which opens the mail car door. Loop 2 boards, takes the gem and stands under the window; as it slides past the hatch on platform 2 (5.85–6.3 s) it passes the gem out. Loop 3 goes round the buffers, waits at the hatch, catches the gem and takes it to the exit.',
  loops: [
    [go(37, 10)],
    [go(12, 9), until(3.3), inCar(0, 12, 6), inCar(0, 9, 5), inCar(0, 15, 5), until(6.05), use()],
    [go(2, 2), at(32, 3.5), until(6.5), go(37, 2)],
  ],
} satisfies Solution;
