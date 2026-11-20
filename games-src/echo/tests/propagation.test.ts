import { describe, expect, it } from 'vitest';
import { computeField, downhill, pathDownhill, wallDistance } from '../src/sound/propagation';
import { canStep, DIRS8 } from '../src/world/grid';
import { RING_SPEED, SIM_DT } from '../src/game/constants';
import { game, idx, lvl, press, run } from './helpers';

describe('sound propagation', () => {
  it('does not pass through a 1-tile wall', () => {
    const L = lvl(
      '#######',
      '#..#..#',
      '#..#..#',
      '#######',
    );
    const f = computeField(L, idx(L, 1, 1), 50);
    expect(f.dist[idx(L, 2, 1)]).toBe(1);
    expect(f.dist[idx(L, 4, 1)]).toBe(Infinity);
    expect(f.dist[idx(L, 5, 2)]).toBe(Infinity);
  });

  it('never lights walls on the far side of a wall', () => {
    const L = lvl(
      '#######',
      '#S.#..#',
      '#.E#..#',
      '#######',
    );
    const g = game(L);
    press(g, { clap: true });
    run(g, 2);
    const farWall = L.boundaryIndex[idx(L, 6, 1)];
    const nearWall = L.boundaryIndex[idx(L, 0, 1)];
    expect(farWall).toBeGreaterThanOrEqual(0);
    expect(g.memory.bright[nearWall]).toBeGreaterThan(0);
    expect(g.memory.bright[farWall]).toBe(0);
  });

  it('reaches around an L-shaped corner at the path distance', () => {
    const L = lvl(
      '#####',
      '#...#',
      '###.#',
      '###.#',
      '#####',
    );
    const f = computeField(L, idx(L, 1, 1), 50);
    expect(f.dist[idx(L, 3, 1)]).toBe(2);
    // The diagonal (2,1)→(3,2) would cut the corner of wall (2,2): it must go around.
    expect(f.dist[idx(L, 3, 2)]).toBeCloseTo(3, 5);
    expect(f.dist[idx(L, 3, 3)]).toBeCloseTo(4, 5);
  });

  it('uses diagonal cost √2 in open space', () => {
    const L = lvl(
      '#####',
      '#...#',
      '#...#',
      '#...#',
      '#####',
    );
    const f = computeField(L, idx(L, 1, 1), 50);
    expect(f.dist[idx(L, 2, 2)]).toBeCloseTo(Math.SQRT2, 5);
    expect(f.dist[idx(L, 3, 3)]).toBeCloseTo(2 * Math.SQRT2, 5);
  });

  it('does not leak diagonally between wall corners', () => {
    const L = lvl(
      '####',
      '#.##',
      '##.#',
      '####',
    );
    const f = computeField(L, idx(L, 1, 1), 50);
    expect(f.dist[idx(L, 2, 2)]).toBe(Infinity);

    // With only one corner blocked the diagonal is still forbidden: it goes around (cost 2).
    const L2 = lvl(
      '####',
      '#.##',
      '#..#',
      '####',
    );
    const f2 = computeField(L2, idx(L2, 1, 1), 50);
    expect(f2.dist[idx(L2, 2, 2)]).toBe(2);
    expect(canStep(L2, 1, 1, DIRS8.find((d) => d.dx === 1 && d.dy === 1)!)).toBe(false);
  });

  it('stops expanding past the limit', () => {
    const L = lvl('#' + '.'.repeat(30) + '#');
    const f = computeField(L, idx(L, 1, 0), 5);
    expect(f.dist[idx(L, 6, 0)]).toBe(5);
    expect(f.dist[idx(L, 7, 0)]).toBe(Infinity);
  });

  it('lights a wall when the ring passes its distance', () => {
    const L = lvl(
      '##########',
      '#S.......#',
      '##########',
    );
    const g = game(L);
    const wall = L.boundaryIndex[idx(L, 9, 1)];
    press(g, { clap: true });
    const wd = wallDistance(L, g.pulses[0].field, wall);
    expect(wd).toBeCloseTo(7.5, 5); // 7 tiles to (8,1), then +0.5 into the wall
    // Before the ring gets there (r < wd − 1.1) the wall is dark.
    run(g, (wd - 1.5) / RING_SPEED - SIM_DT);
    expect(g.memory.bright[wall]).toBe(0);
    run(g, 0.2);
    expect(g.memory.bright[wall]).toBeGreaterThan(0.3);
  });

  it('decays echo memory faster on Blind than on Guide', () => {
    const L = lvl(
      '#######',
      '#S....#',
      '#######',
    );
    const blind = game(L, { difficulty: 'blind' });
    const guide = game(L, { difficulty: 'guide' });
    for (const g of [blind, guide]) {
      press(g, { clap: true });
      run(g, 3);
    }
    const k = L.boundaryIndex[idx(L, 6, 1)];
    expect(guide.memory.bright[k]).toBeGreaterThan(blind.memory.bright[k] * 2);
  });

  it('amplifies sound past crystal: twice the remaining radius', () => {
    const plain = lvl(
      '##################',
      '#................#',
      '##################',
    );
    const crystal = lvl(
      '#####K############',
      '#................#',
      '##################',
    );
    const a = computeField(plain, idx(plain, 1, 1), 50);
    const b = computeField(crystal, idx(crystal, 1, 1), 50);
    // (4,1),(5,1),(6,1) touch the crystal at (5,0). Sound reaches (4,1) at 3; past it, distances
    // grow half as fast: (13,1) is 9 more tiles → 3 + 4.5.
    expect(a.dist[idx(plain, 13, 1)]).toBeCloseTo(12, 5);
    expect(b.dist[idx(crystal, 13, 1)]).toBeCloseTo(3 + 9 * 0.5, 5);
    expect(b.dist[idx(crystal, 3, 1)]).toBeCloseTo(2, 5);
  });
});

describe('downhill paths', () => {
  const maze = lvl(
    '###########',
    '#S..#.....#',
    '###.#.###.#',
    '#...#...#.#',
    '#.#####.#.#',
    '#.......#E#',
    '###########',
  );

  it('walks from anywhere to the source around walls', () => {
    const src = idx(maze, 9, 5);
    const f = computeField(maze, src, 100);
    const from = idx(maze, 1, 1);
    const path = pathDownhill(maze, f, from);
    expect(path[path.length - 1]).toBe(src);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      expect(maze.solid[b]).toBe(0);
      const ax = a % maze.w, ay = (a / maze.w) | 0, bx = b % maze.w, by = (b / maze.w) | 0;
      const d = DIRS8.find((dd) => dd.dx === bx - ax && dd.dy === by - ay)!;
      expect(d).toBeDefined();
      expect(canStep(maze, ax, ay, d)).toBe(true);
      expect(f.dist[b]).toBeLessThan(f.dist[a]);
    }
    expect(downhill(maze, f, src)).toBe(-1);
  });

  it('a Listener that hears a clap walks to its source', () => {
    const L = lvl(
      '############',
      '#S.........#',
      '########.###',
      '#C.........#',
      '#.........E#',
      '############',
    );
    const g = game(L, { seed: 3 });
    // Put the player's clap at (8,1): just out of the corridor mouth, path distance from the
    // Listener ~ 9 < 12.
    g.player.x = 8.5;
    g.player.y = 1.5;
    const L0 = g.listeners[0];
    press(g, { clap: true });
    expect(L0.state).toBe('hunt');
    expect(g.stats.alerts).toBe(1);
    // Move the player away so it isn't caught; the Listener should reach the clap tile.
    g.player.x = 1.5;
    let reached = false;
    for (let i = 0; i < 600 && !reached; i++) {
      press(g, {});
      const tx = Math.floor(L0.x);
      const ty = Math.floor(L0.y);
      expect(L.solid[ty * L.w + tx]).toBe(0);
      if (L0.at === idx(L, 8, 1)) reached = true;
    }
    expect(reached).toBe(true);
  });

  it('a Listener does not hear a clap behind a thick wall', () => {
    const L = lvl(
      '#############',
      '#S..#......C#',
      '#...#.......#',
      '#.#########.#',
      '#...........#',
      '#E..........#',
      '#############',
    );
    const g = game(L);
    press(g, { clap: true });
    // Straight line 10 tiles, but the path around is ~16.
    expect(g.listeners[0].state).toBe('patrol');
    expect(g.stats.alerts).toBe(0);
  });
});
