/** Every level file parses, builds, and survives a few seconds of nobody touching anything. */
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/levels';
import { World } from '../src/sim/world';

describe('levels', () => {
  it('there are 48 of them, six worlds of eight', () => {
    expect(LEVELS.length).toBe(48);
    for (let w = 1; w <= 6; w++) expect(LEVELS.filter((l) => l.world === w).length).toBe(8);
  });
  for (const lv of LEVELS) {
    it(`${lv.id} ${lv.name} builds and settles`, () => {
      const w = new World(lv);
      for (let i = 0; i < 300; i++) w.step([0, 0, 0, 0]);
      for (const b of w.bodies) {
        expect(Number.isFinite(b.x) && Number.isFinite(b.y), `${b.kind} ${b.id}`).toBe(true);
      }
      // nobody falls out of the level by standing still (scroll levels push the team along)
      if (!lv.json.scroll) expect(w.pops).toBe(0);
    });
  }
});
