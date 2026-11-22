import { face, go, inCar, to, until, use, type Solution } from './dsl';

export default {
  note: 'Loop 1 takes the coin along the mezzanine and throws it down into the waiting room (2.35 s); the platform guard goes to look. Loop 2 boards the plate car at platform 1 and holds plate a (vault door A). Loop 3 goes round the buffers to platform 2, boards the brake van when the train stops there (5.5–6.3 s) and holds plate c (vault door C). Loop 4 goes all the way round to the tunnel ledge, waits out of the cameras\' sight, steps onto plate b when the lights go out (6.8 s) and is off the ledge again before they come back. Loop 5 boards the mail car, empties the vault once both doors are open, and steps out of side door B at the end of the line (7.4 s).',
  loops: [
    [go(8, 1), go(17, 1), face(90), use(), go(12, 1)],
    [go(2, 9), until(2.1), go(21, 9), inCar(1, 21, 12), inCar(1, 22, 13)],
    [go(1, 10), go(1, 19), go(33, 19), go(33, 17), go(30, 16), until(5.3), to(30, 15), inCar(2, 27, 14), inCar(2, 27, 13), inCar(2, 28, 12)],
    [go(1, 10), go(1, 19), go(38, 19), go(38, 9), go(32, 8), until(6.85), to(32, 9), to(32, 10), go(35, 10), until(8.8), go(32, 10), to(32, 9), to(32, 8)],
    [go(4, 7), until(2.6), go(13, 9), inCar(0, 13, 12), inCar(0, 11, 12), inCar(0, 9, 12), inCar(0, 9, 13), inCar(0, 9, 12), inCar(0, 11, 12), inCar(0, 13, 12), inCar(0, 15, 13), until(7.0), inCar(0, 15, 14), to(22, 16), go(19, 16)],
  ],
} satisfies Solution;
