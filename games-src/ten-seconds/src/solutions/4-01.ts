import { go, inCar, to, until, type Solution } from './dsl';

export default {
  note: 'Wait at the platform gap; as the carriage door slides past (about 2.9–3.5 s), step in, grab the briefcase, ride to the end of the line and step off through the far door when the train stops at 6.5 s.',
  loops: [[go(14, 3), to(15, 3), until(2.8), inCar(0, 7, 6), inCar(0, 5, 7), until(6.5), inCar(0, 7, 8), to(29, 10), go(38, 10)]],
} satisfies Solution;
