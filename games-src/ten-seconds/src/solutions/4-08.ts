import { face, go, inCar, to, until, use, type Solution } from './dsl';

export default {
  note: 'Loop 1 takes the coin along the mezzanine and throws it down into the waiting room (2.2 s); the platform guard goes to look. Loop 2 boards the rear car and holds its plate, which opens the front car\'s side door. Loop 3 boards the front car before it leaves (4.7 s). Loop 4 goes round the buffers to the left-luggage office and passes the strongbox through its window into the open side door as the train creeps past (5.7–6.6 s). Loop 3 picks it up and steps off at the end of the line (7.6 s).',
  loops: [
    [go(8, 1), go(15, 1), face(90), use(), go(10, 1)],
    [go(6, 8), until(3.0), go(12, 9), inCar(0, 12, 12), inCar(0, 14, 13)],
    [go(6, 9), until(2.7), go(19, 9), inCar(1, 19, 12), inCar(1, 24, 13), until(6.5), inCar(1, 24, 14), inCar(1, 24, 13), until(7.0), inCar(1, 24, 14), to(36, 16), go(37, 16)],
    [go(1, 10), go(1, 16), go(26, 17), go(31, 17), go(30, 16), until(6.15), use()],
  ],
} satisfies Solution;
