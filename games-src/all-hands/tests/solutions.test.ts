/** Every level's scripted solution wins through the real physics. */
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/levels';
import { solutionFor } from '../src/solutions';
import { runSolution } from '../src/solutions/run';

describe('every level can be won by four bots following its solution', () => {
  for (const lv of LEVELS) {
    const sol = solutionFor(lv.id);
    it.skipIf(!sol)(`${lv.id} ${lv.name}`, () => {
      const r = runSolution(lv, sol!);
      expect(r.won, r.stuck ?? '').toBe(true);
      // the fast medal must be earnable: par (1.5x the bots' time, DESIGN.md) is never below it
      expect(r.ticks / 60, `bots took ${(r.ticks / 60).toFixed(1)} s, par is ${lv.par} s`).toBeLessThanOrEqual(lv.par);
      expect(r.pops).toBe(0);
    });
  }
});
