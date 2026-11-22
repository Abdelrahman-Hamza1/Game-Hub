import { face, go, inCar, to, until, use, type Solution } from './dsl';

export default {
  note: 'Loop 1 runs up to the signal gallery and throws its coin down through the coach window (1.7 s): the conductor leaves the door and stands over the exit. Loop 2 waits on platform B and throws the second coin as the coach window slides under it (4.4–4.75 s): the conductor walks to the front. Loop 3 boards behind his back (1.9 s), takes the bonds case and slips out of the exit door when the train stops.',
  loops: [
    [go(20, 5), go(10, 4), face(90), use(), go(14, 4)],
    [go(37, 4), go(28, 4), until(4.6), face(90), use(), go(32, 4)],
    [go(5, 5), until(1.9), go(3, 5), inCar(0, 3, 8), inCar(0, 6, 8), until(5.1), inCar(0, 11, 8), inCar(0, 11, 9), to(31, 11), go(36, 11)],
  ],
} satisfies Solution;
