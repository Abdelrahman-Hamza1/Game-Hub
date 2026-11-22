import { face, go, inCar, to, until, use, type Solution } from './dsl';

export default {
  note: 'Loop 1 runs up to the mezzanine, takes the coin and throws it down through the windows into the waiting room (3.8 s); the guard goes to look. Loop 2 waits out of his sight, then takes the mail sack, boards during the stop (4.4–6.2 s) and gets off at the exit platform.',
  loops: [
    [go(14, 1), go(30, 1), face(90), use(), go(24, 1)],
    [go(9, 8), until(4.15), go(23, 8), go(22, 9), inCar(0, 22, 12), inCar(0, 25, 13), until(7.2), inCar(0, 25, 14), to(33, 16), go(37, 16)],
  ],
} satisfies Solution;
