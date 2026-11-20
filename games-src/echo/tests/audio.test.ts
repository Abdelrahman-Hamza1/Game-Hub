import { describe, expect, it } from 'vitest';
import { arrowFor, gainFor, heartBpm, heartGain, panFor, roomFor, detuneRate } from '../src/audio/mix';
import { computeField } from '../src/sound/propagation';
import { idx, lvl } from './helpers';

describe('audio mixing', () => {
  it('pans by horizontal offset, clamped', () => {
    expect(panFor(0)).toBe(0);
    expect(panFor(6)).toBe(0.5);
    expect(panFor(-30)).toBe(-1);
    expect(panFor(30)).toBe(1);
  });

  it('falls off with path distance, silent out of earshot', () => {
    expect(gainFor('growl', 6, 0)).toBeGreaterThan(gainFor('growl', 6, 5));
    expect(gainFor('growl', 6, 5)).toBeGreaterThan(gainFor('growl', 6, 10));
    expect(gainFor('growl', 6, Infinity)).toBe(0);
    expect(gainFor('growl', 6, 40)).toBe(0);
  });

  it('a Listener behind a wall sounds farther away than one in the open', () => {
    const L = lvl(
      '############',
      '#..........#',
      '#.....#....#',
      '#.....#....#',
      '#.....#....#',
      '############',
    );
    const player = idx(L, 4, 3);
    const open = idx(L, 4, 1);    // 2 tiles up, nothing between
    const behind = idx(L, 8, 3);  // 4 tiles right, wall in between
    const f = computeField(L, player, 30);
    const gOpen = gainFor('growl', 6, f.dist[open]);
    const gBehind = gainFor('growl', 6, f.dist[behind]);
    expect(f.dist[behind]).toBeGreaterThan(4); // path goes around the wall
    expect(gBehind).toBeLessThan(gOpen);
    // Same straight-line distance (4), but the wall makes the path longer, so it's quieter.
    expect(gainFor('growl', 6, f.dist[behind])).toBeLessThan(gainFor('growl', 6, 4));
  });

  it('picks reverb by room size', () => {
    expect(roomFor(20)).toBe('small');
    expect(roomFor(80)).toBe('medium');
    expect(roomFor(150)).toBe('large');
  });

  it('heartbeat rises from 60 to 140 bpm as a Listener closes in', () => {
    expect(heartBpm(Infinity)).toBe(60);
    expect(heartBpm(12)).toBe(60);
    expect(heartBpm(1)).toBe(140);
    expect(heartBpm(6)).toBeGreaterThan(80);
    expect(heartGain(20)).toBe(0);
    expect(heartGain(2)).toBeGreaterThan(heartGain(8));
  });

  it('detunes Mimic copies by −30 cents', () => {
    expect(detuneRate(-30)).toBeCloseTo(0.98282, 4);
  });

  it('points caption arrows toward the source', () => {
    expect(arrowFor(-5, 0)).toBe('←');
    expect(arrowFor(5, 0)).toBe('→');
    expect(arrowFor(0, -5)).toBe('↑');
    expect(arrowFor(0, 5)).toBe('↓');
    expect(arrowFor(4, -4)).toBe('↗');
    expect(arrowFor(0.1, 0.1)).toBe('•');
  });
});
