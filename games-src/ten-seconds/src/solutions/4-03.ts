import { go, inCar, to, until, type Solution } from './dsl';

export default {
  note: 'Loop 1 boards the rear carriage during the stop (2–4 s) and stands on its plate, which holds the cage in the front carriage open. Loop 2 boards the front carriage, takes the jewel case from the cage and gets off when the train stops at the exit platform (6 s).',
  loops: [
    [go(16, 3), until(2.4), inCar(0, 4, 6), inCar(0, 6, 7)],
    [go(26, 3), until(2.4), inCar(1, 14, 6), inCar(1, 16, 6), inCar(1, 17, 6), inCar(1, 18, 7), inCar(1, 17, 6), inCar(1, 15, 6), inCar(1, 15, 7), until(6.0), inCar(1, 15, 8), to(34, 10), go(37, 10)],
  ],
} satisfies Solution;
