import { at, go, until, type Solution, type Step } from './dsl';

/** The shadow's centre (tiles) at t seconds: it swings from x 5.5 to 31.5 and back every 10 s. */
const shadowX = (t: number) => 5.5 + 26 * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 10));

/** Wait in the dark by door A, then hop along inside the shadow, 0.1 s ahead of it, until out of the light. */
function ride(): Step[] {
  const s: Step[] = [go(7, 6)];
  for (let k = 8; ; k++) {
    const x = Math.max(7.5, shadowX(k / 10 + 0.1));
    s.push(until(k / 10), at(Math.min(x, 28.5), 6.5));
    if (x > 28.4) return s;
  }
}

export default {
  note: 'Loop 1 holds plate a, so door A is open as the shadow sweeps past it at about 1 s. Loops 2 and 3 ride the shadow across the lit hall and hold plates b and c at opposite ends of the east room (doors B and C stand back to back, so both must be open at once). Loop 4 rides across too, goes through B and C and takes the pendulum bob to the exit. Nobody can hold a and still catch the shadow, and the shadow crosses only once a loop.',
  loops: [
    [go(1, 1)],
    [...ride(), go(30, 1)],
    [...ride(), go(30, 20)],
    [...ride(), go(33, 6), go(37, 4), go(37, 7)],
  ],
} satisfies Solution;
