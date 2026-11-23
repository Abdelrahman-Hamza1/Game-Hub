/** Build tiny test levels from ASCII and drive players tick by tick. */
import { parseLevel, type LevelJson } from '../src/sim/level';
import { World } from '../src/sim/world';

/** Pads rows to a rectangle with air; adds the key and door if missing. */
export function makeWorld(rows: string[], json: Partial<LevelJson> = {}): World {
  const w = Math.max(...rows.map((r) => r.length));
  const grid = rows.map((r) => r.padEnd(w, '.'));
  const txt = grid.join('\n');
  return new World(parseLevel('9-1', txt, { name: 'test', ...json } as LevelJson));
}

export function run(w: World, ticks: number, input: number[] | ((t: number) => number[])): void {
  for (let i = 0; i < ticks; i++) w.step(typeof input === 'function' ? input(i) : input);
}

/** Highest a player's feet reach (smallest bottom y) over some ticks of input. */
export function peakFeet(w: World, n: number, ticks: number, input: (t: number) => number[]): number {
  let best = Infinity;
  for (let i = 0; i < ticks; i++) {
    w.step(input(i));
    const p = w.players[n];
    best = Math.min(best, p.y + p.h);
  }
  return best;
}
