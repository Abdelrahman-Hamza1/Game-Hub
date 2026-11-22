import { go, inCar, to, until, type Solution } from './dsl';

export default {
  note: 'Loop 1 boards the rear car at platform 1 (it stops there until 2.8 s) and holds plate a, which opens the cage in the front car. Loop 2 walks round to platform 2 and boards the middle car (4–5.5 s) to hold plate b, the front car\'s exit door. Loop 3 boards the front car at platform 2, takes the gold from the cage and steps out at the exit platform (6.5 s).',
  loops: [
    [go(3, 5), inCar(0, 3, 8), inCar(0, 5, 9)],
    [go(18, 5), until(4.2), inCar(1, 12, 8), inCar(1, 13, 9)],
    [go(29, 5), until(4.2), inCar(2, 23, 8), inCar(2, 22, 9), inCar(2, 20, 9), inCar(2, 19, 9), inCar(2, 22, 9), inCar(2, 24, 9), until(6.0), inCar(2, 24, 10), to(36, 12), go(31, 12)],
  ],
} satisfies Solution;
