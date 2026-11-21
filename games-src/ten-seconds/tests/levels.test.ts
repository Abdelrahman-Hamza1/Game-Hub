import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/levels';
import { validateLevel } from '../src/sim/level';

describe('level files', () => {
  it('there are levels', () => expect(LEVELS.length).toBeGreaterThan(0));
  for (const lv of LEVELS) {
    it(`${lv.id} ${lv.name} is valid`, () => {
      expect(validateLevel(lv)).toEqual([]);
      expect(lv.par).toBeGreaterThanOrEqual(1);
      expect(lv.hint.length).toBeGreaterThan(0);
    });
  }
});
