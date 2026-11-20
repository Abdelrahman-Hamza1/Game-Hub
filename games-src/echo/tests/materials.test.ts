import { describe, expect, it } from 'vitest';
import type { Game } from '../src/game/game';
import type { Pulse } from '../src/sound/pulses';
import { validateLevel } from '../src/world/level';
import { CRYSTAL_HOLD } from '../src/game/memory';
import { game, idx, lvl, press, run } from './helpers';
import { ghostCheck } from './bot';

/** Walk right until the first footstep; return its pulse. */
function firstStep(g: Game, sneak = false): Pulse | null {
  for (let i = 0; i < 120; i++) {
    press(g, { moveX: 1, sneak });
    for (const e of g.drainEvents()) {
      if (e.type === 'sound' && e.pulse.owner === 'player') return e.pulse;
    }
  }
  return null;
}

function strip(floor: string): string[] {
  return ['############', '#S' + floor.repeat(9) + '#', '############'];
}

describe('materials', () => {
  it('footstep radius follows the floor: rock 4, water 9, gravel 6, metal 8, moss silent', () => {
    expect(firstStep(game(lvl(...strip('.'))))!.radius).toBeCloseTo(4);
    const water = firstStep(game(lvl(...strip('W'))))!;
    expect(water.radius).toBeCloseTo(9);
    expect(water.mat).toBe(1);
    expect(firstStep(game(lvl(...strip('G'))))!.radius).toBeCloseTo(6);
    expect(firstStep(game(lvl(...strip('T'))))!.radius).toBeCloseTo(8);
    expect(firstStep(game(lvl(...strip('M'))))).toBeNull();
  });

  it('sneaking: radius 1.2 × the floor multiplier', () => {
    expect(firstStep(game(lvl(...strip('.'))), true)!.radius).toBeCloseTo(1.2);
    expect(firstStep(game(lvl(...strip('W'))), true)!.radius).toBeCloseTo(2.7);
  });

  it('walls touching moss echo at half brightness', () => {
    // Symmetric corridor: moss floor at the left end, rock at the right end, same distance.
    const L = lvl(
      '###########',
      '#M...S....#',
      '###########',
    );
    const g = game(L);
    press(g, { clap: true });
    const mossy = L.boundaryIndex[idx(L, 0, 1)];
    const plain = L.boundaryIndex[idx(L, 10, 1)];
    expect(L.mossy[idx(L, 0, 1)]).toBe(1);
    expect(L.mossy[idx(L, 10, 1)]).toBe(0);
    run(g, 0.5);
    expect(g.memory.bright[mossy]).toBeGreaterThan(0);
    expect(g.memory.bright[mossy] / g.memory.bright[plain]).toBeCloseTo(0.5, 1);
  });

  it('metal walls keep their echo 3× longer', () => {
    const L = lvl(
      '#######',
      '#S...EX',
      '#######',
    );
    const g = game(L);
    press(g, { clap: true });
    run(g, 1);
    const rock = L.boundaryIndex[idx(L, 6, 0)];
    const metal = L.boundaryIndex[idx(L, 6, 1)];
    const r0 = g.memory.bright[rock];
    const m0 = g.memory.bright[metal];
    run(g, 2);
    // After 2 s at τ = 2 s: rock × e^−1 ≈ 0.37; metal × e^−1/3 ≈ 0.72.
    expect(g.memory.bright[rock] / r0).toBeLessThan(0.45);
    expect(g.memory.bright[metal] / m0).toBeGreaterThan(0.65);
  });

  it('crystal walls hold their echo for 10 s', () => {
    const L = lvl(
      '#################',
      'K....S.........E#',
      '#################',
    );
    const g = game(L);
    press(g, { clap: true });
    run(g, 1);
    const crystal = L.boundaryIndex[idx(L, 0, 1)];
    const b0 = g.memory.bright[crystal];
    expect(b0).toBeGreaterThan(0.3);
    run(g, CRYSTAL_HOLD - 2);
    expect(g.memory.bright[crystal]).toBeCloseTo(b0, 5);
    run(g, 6);
    expect(g.memory.bright[crystal]).toBeLessThan(b0 * 0.2);
  });

  it('crystal amplifies: a clap reveals walls far beyond its radius', () => {
    const row = (c: string) => '#' + c + '#'.repeat(26);
    const plain = lvl(row('#'), '#S' + '.'.repeat(24) + '.#', '#'.repeat(28));
    const amp = lvl('#K' + '#'.repeat(26), '#S' + '.'.repeat(24) + '.#', '#'.repeat(28));
    const far = (L: typeof plain) => L.boundaryIndex[idx(L, 20, 0)];
    const g1 = game(plain);
    const g2 = game(amp);
    for (const g of [g1, g2]) { press(g, { clap: true }); run(g, 1.5); }
    expect(g1.memory.bright[far(plain)]).toBe(0);
    expect(g2.memory.bright[far(amp)]).toBeGreaterThan(0);
  });

  it('the tongue click only reveals its cone, and is heard as radius 3', () => {
    const L = lvl(
      '#####################',
      '#.....S...........E.#',
      '#####################',
    );
    const g = game(L);
    g.player.facing = 0; // facing right
    press(g, { click: true });
    const p = g.pulses.find((x) => x.kind === 'click')!;
    expect(p.radius).toBe(6);
    expect(p.hear).toBe(3);
    run(g, 0.8);
    const ahead = L.boundaryIndex[idx(L, 9, 0)];
    const behind = L.boundaryIndex[idx(L, 3, 0)];
    expect(g.memory.bright[ahead]).toBeGreaterThan(0);
    expect(g.memory.bright[behind]).toBe(0);
  });

  it('the cane reveals radius 2 in front and is heard within 1 tile', () => {
    const L = lvl(
      '#########',
      '#...S...#',
      '#########',
    );
    const g = game(L);
    g.player.facing = Math.PI; // facing left
    press(g, { cane: true });
    const p = g.pulses.find((x) => x.kind === 'cane')!;
    expect(p.radius).toBe(2);
    expect(p.hear).toBe(1);
  });

  it('rubble gives stones up to 5', () => {
    const L = lvl(
      '#####',
      '#SR.#',
      '#####',
    );
    const g = game(L);
    g.player.stones = 3;
    g.player.stoneCap = 5;
    g.player.x = 2.5;
    for (let i = 0; i < 4; i++) press(g, { hand: true });
    expect(g.player.stones).toBe(5);
  });

  it('a waterfall masks your sounds beyond 2 tiles, and deafens Listeners inside it', () => {
    const L = lvl(
      '##############',
      '#S....F.....C#',
      '#............#',
      '##############',
    );
    // Player at (5,1), inside the zone; Listener at (12,1), 7 tiles away (outside the zone? no:
    // zone radius 8 from F at (6,1) includes (12,1)). Use the wall-free row to check both rules.
    const g = game(L);
    g.player.x = 5.5;
    press(g, { clap: true });
    const clap = g.pulses.find((x) => x.kind === 'clap')!;
    expect(clap.hear).toBe(2);
    expect(g.listeners[0].state).toBe('patrol');
    expect(g.zone[idx(L, 12, 1)]).toBe(1);
  });

  it('a Listener outside the zone still hears sounds made outside it', () => {
    const L = lvl(
      '#########################',
      '#F......................#',
      '#..........S.......C....#',
      '#########################',
    );
    const g = game(L);
    expect(g.zone[idx(L, 11, 2)]).toBe(0);
    press(g, { clap: true });
    expect(g.listeners[0].state).toBe('hunt');
  });
});

describe('materials sandbox level', () => {
  const text = [
    '##############################',
    '#S....WWWW....GGGG....MMMM...#',
    '#.....WWWW....GGGG....MMMM...#',
    '#..R..........................#'.slice(0, 30),
    '###.#####XXXXX####KKKK####.###',
    '#.....TTTT......D.........F..#',
    '#.....TTTT...................#',
    '#........C.................E.#',
    '##############################',
  ].join('\n');

  it('uses every material and is valid', () => {
    expect(validateLevel(text)).toEqual([]);
    for (const ch of ['W', 'G', 'M', 'T', 'X', 'K', 'R', 'D', 'F', 'C']) expect(text).toContain(ch);
  });

  it('plays: the bot escapes it', () => {
    const L = lvl(...text.split('\n'));
    const { ok } = ghostCheck(L, [1, 2, 3, 4]);
    expect(ok).toBe(true);
  });
});
