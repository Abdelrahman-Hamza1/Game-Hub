import { describe, expect, it } from 'vitest';
import { LEVELS, fileKey } from '../src/levels';
import { runSolution, describeRun } from '../src/solutions/run';
import type { Solution } from '../src/solutions/dsl';

const mods = import.meta.glob('../src/solutions/[1-5]-*.ts', { import: 'default', eager: true }) as Record<string, Solution>;
const solutionFor = (id: string) => mods[`../src/solutions/${fileKey(id)}.ts`];

describe('every level is beatable at par by its scripted solution', () => {
  for (const lv of LEVELS) {
    it(`${lv.id} ${lv.name}`, () => {
      const sol = solutionFor(lv.id);
      expect(sol, `src/solutions/${fileKey(lv.id)}.ts is missing`).toBeTruthy();
      const r = runSolution(lv, sol);
      const why = describeRun(r);
      expect(r.won, why).toBe(true);
      expect(r.result!.loops, why).toBeLessThanOrEqual(lv.par);
      // at least a second to spare
      expect(r.winTick, why).toBeLessThanOrEqual(r.loopTicks - 60);
    });
  }
});
