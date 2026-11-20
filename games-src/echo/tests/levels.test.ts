import { describe, expect, it } from 'vitest';
import { LEVELS, loadLevel } from '../src/levels';
import { validateLevel } from '../src/world/level';
import { ghostCheck } from './bot';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

describe('level files', () => {
  it('level 1-01 is the brief\'s "Lights Out"', () => {
    const first = LEVELS[0];
    expect(first.id).toBe('1-01');
    expect(first.meta.name).toBe('Lights Out');
    expect(first.meta.stones).toBe(5);
    const L = loadLevel(first);
    expect(L.w).toBe(40);
    expect(L.h).toBe(24);
    expect(L.listeners.length).toBe(2);
  });

  for (const entry of LEVELS) {
    describe(entry.id + ' ' + entry.meta.name, () => {
      it('is valid', () => {
        expect(validateLevel(entry.text)).toEqual([]);
        expect(entry.meta.name.length).toBeGreaterThan(0);
        expect(entry.meta.parTime).toBeGreaterThan(0);
      });

      it('can be escaped with a Ghost rank (bot playtest)', () => {
        const { ok, results } = ghostCheck(loadLevel(entry), SEEDS);
        if (!ok) {
          const lines = results.map((r) => `seed ${r.seed}: ${r.status} ${r.reason} alerts=${r.alerts} t=${r.time.toFixed(0)} tourists=${r.rescued}/${r.total}`);
          throw new Error('No Ghost escape:\n' + lines.join('\n'));
        }
        expect(ok).toBe(true);
      }, 60_000);
    });
  }
});
