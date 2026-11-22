import { go, inCar, to, until, type Solution } from './dsl';

export default {
  note: 'Both loops board at the first platform and wait in the carriage while it stands in the tunnel. When the lights go out (3.5–6.5 s), loop 1 runs west along the ledge to the plate and holds the locker open until loop 2 has the payroll, then both are back aboard before the lights come on. Loop 2 gets off at the far platform.',
  loops: [
    [go(5, 3), inCar(0, 5, 6), inCar(0, 3, 6), until(3.5), inCar(0, 7, 7), inCar(0, 7, 8), to(20, 9), to(20, 10), go(14, 10), until(5.55), go(20, 10), to(20, 9), inCar(0, 7, 7), inCar(0, 3, 6)],
    [go(5, 3), inCar(0, 5, 6), inCar(0, 9, 6), until(3.5), inCar(0, 8, 7), inCar(0, 8, 8), to(21, 9), to(21, 10), go(27, 10), to(27, 11), to(26, 12), to(27, 11), to(27, 10), go(21, 10), to(21, 9), inCar(0, 8, 7), inCar(0, 9, 6), until(7.0), inCar(0, 5, 6), inCar(0, 5, 5), to(31, 3), go(34, 2)],
  ],
} satisfies Solution;
