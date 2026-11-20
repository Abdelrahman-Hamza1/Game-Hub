/** Regression tests for bugs found in code review. */
import { describe, expect, it } from 'vitest';
import { game, idx, lvl, press, run } from './helpers';

describe('review regressions', () => {
  it('a stone does not slip through a diagonal crack between wall corners', () => {
    const L = lvl(
      '######',
      '#S####',
      '##...#',
      '##..E#',
      '######',
    );
    const g = game(L);
    press(g, { throwAt: { x: 2.9, y: 2.9 } });
    run(g, 1);
    const stone = g.events.length >= 0 && g.lastField;
    expect(stone).toBeTruthy();
    // The landing sound must start on Mira's side of the wall: tile (1,1).
    expect(g.lastField!.source).toBe(idx(L, 1, 1));
  });

  it('a tourist left out of reach after a clap is let go (and will panic)', () => {
    const L = lvl(
      '##############',
      '#S.P.........#',
      '#...........E#',
      '##############',
    );
    const g = game(L);
    g.player.x = 3.0;
    press(g, { hand: true });
    press(g, { clap: true });
    // Walk away from the tourist (who is just to the right) during the 0.5 s grace.
    run(g, 0.7, () => ({ moveX: -1 }));
    const T = g.tourists[0];
    expect(T.state).toBe('waiting');
    run(g, 2.2);
    expect(T.state).toBe('panic');
  });

  it('waterfall masking is 2 tiles on every difficulty', () => {
    const L = lvl(
      '#################',
      '#F......S...C..E#',
      '#################',
    );
    const g = game(L, { difficulty: 'hardcore' });
    // The Listener 4 tiles away must be outside the zone for this to test masking, not deafness.
    expect(g.zone[idx(L, 12, 1)]).toBe(0);
    expect(g.zone[idx(L, 8, 1)]).toBe(1);
    press(g, { clap: true });
    expect(g.listeners[0].state).toBe('patrol');
    expect(g.stats.alerts).toBe(0);
  });

  it('crystal does not stretch a Listener\'s patrol beyond its post', () => {
    const L = lvl(
      '#KKKKKKKKKKKKKKKKKKKK#',
      '#.C.................#',
      '#KKKKKKKKKKKKKKKKKKKK#',
      '#S#################E##',
    );
    const g = game(L, { seed: 4 });
    let far = 0;
    for (let i = 0; i < 60 * 90; i++) {
      press(g, {});
      far = Math.max(far, Math.abs(g.listeners[0].x - 2.5));
      if (g.status !== 'playing') break;
    }
    expect(far).toBeLessThanOrEqual(7.6);
  });

  it('hearing Mira during the final chase is not an alert', () => {
    const L = lvl(
      '######################',
      '#S!..................#',
      '#..........C........E#',
      '######################',
    );
    L.meta.chase = true;
    const g = game(L);
    run(g, 0.4, () => ({ moveX: 1, sneak: true }));
    expect(g.chasing).toBe(true);
    press(g, { clap: true });
    expect(g.stats.alerts).toBe(0);
  });

  it('a tourist whose hand is taken on the exit tile is delivered', () => {
    const L = lvl(
      '########',
      '#S..EP.#',
      '########',
    );
    const g = game(L);
    run(g, 2, () => ({ moveX: 1, sneak: true }));
    // Standing on the exit next to the tourist (not all rescued: level continues).
    g.player.x = 4.5;
    run(g, 0.1);
    expect(g.status).toBe('playing');
    press(g, { hand: true });
    run(g, 0.2);
    expect(g.stats.rescued).toBe(1);
    expect(g.status).toBe('won');
  });
});
