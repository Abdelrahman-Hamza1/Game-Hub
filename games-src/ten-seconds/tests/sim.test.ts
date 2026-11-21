import { describe, expect, it } from 'vitest';
import { parseLevel, type LevelJson } from '../src/sim/level';
import { World } from '../src/sim/world';
import { Session } from '../src/game/session';
import { Bot, go, to, use, wait, type Step } from '../src/solutions/dsl';
import { hashWorld } from '../src/sim/hash';
import { Preview } from '../src/sim/scrub';
import { losClear, inCone } from '../src/sim/vision';
import { levelById } from '../src/levels';
import { runSolution } from '../src/solutions/run';
import sol15 from '../src/solutions/1-05';

const lvl = (rows: string[], json: LevelJson = {}) => parseLevel('t', rows.join('\n'), json);

/** Record one loop with a bot into the session; returns the phase it ended in. */
function record(s: Session, steps: Step[]): string {
  s.prepare();
  s.start();
  const bot = new Bot(steps, s.lv);
  while (s.phase === 'recording') s.step(bot.input(s.world));
  return s.phase;
}

describe('determinism', () => {
  it('the same plan gives identical states at ticks 0, 300 and 599', () => {
    const lv = levelById('1-5')!;
    const r = runSolution(lv, sol15);
    expect(r.won).toBe(true);
    const lanes = [...r.session.lanes, r.session.rec];
    const hashes = () => {
      const p = new Preview(lv);
      p.setPlan(lanes, 600);
      return [0, 300, 599].map((n) => hashWorld(p.seek(n)));
    };
    const a = hashes();
    const b = hashes();
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(3);
  });

  it('a winning live loop wins again, at the same tick, when replayed as a copy', () => {
    const lv = levelById('1-5')!;
    const r = runSolution(lv, sol15);
    const p = new Preview(lv);
    p.setPlan([...r.session.lanes, r.session.rec], 600);
    const w = p.seek(600);
    expect(w.status).toBe('won');
    expect(w.winTick).toBe(r.winTick);
  });
});

describe('paradox', () => {
  const rows = [
    '##########',
    '#S...A..T#',
    '#a...#####',
    '##########',
  ];
  const json: LevelJson = { doors: { A: { rule: 'plate', wires: ['a'] } }, exits: undefined } as LevelJson;

  it('a copy whose path runs into a closed door freezes there', () => {
    const lv = lvl([...rows.slice(0, 1), '#S...A..T#', '#a...#..E#', rows[3]], json);
    const s = new Session(lv);
    expect(record(s, [go(1, 2)])).toBe('over'); // copy 1 holds the plate
    expect(record(s, [go(8, 1), go(8, 2)])).toBe('won'); // through the open door
    // now plan: only the runner (as a copy), without the plate holder
    const runner = s.rec;
    runner.delay = 0;
    runner.cut = runner.len;
    const p = new Preview(lv);
    p.setPlan([runner], 600);
    const w = p.seek(600);
    const c = w.actors[0];
    expect(c.state).toBe('paradox');
    expect(c.x).toBeLessThan(5);
    expect(c.x).toBeGreaterThan(3.9);
    expect(p.events.some((e) => e.kind === 'paradox')).toBe(true);
  });

  it('a delayed copy waits on the start tile, then plays from its first frame', () => {
    const lv = lvl(['#######', '#S...T#', '#E....#', '#######']);
    const s = new Session(lv);
    record(s, [go(4, 1)]);
    s.trim(0, 120, s.lanes[0].len);
    const w = s.world;
    for (let i = 0; i < 100; i++) w.tick(null);
    expect(w.actors[0].state).toBe('wait');
    expect(w.actors[0].x).toBeCloseTo(1.5);
    for (let i = 0; i < 40; i++) w.tick(null);
    expect(w.actors[0].state).toBe('active');
  });
});

describe('vision', () => {
  const lv = lvl([
    '############',
    '#..........#',
    '#....#.....#',
    '#....-.....#',
    '#....A.....#',
    '############',
  ], { doors: { A: { rule: 'timer', open: [1, 2] } } });
  const w = new World(lv);
  w.begin({ lanes: [], liveSlot: -1, loopTicks: 600 });

  it('walls block sight, windows do not', () => {
    expect(losClear(w, 2.5, 2.5, 8.5, 2.5)).toBe(false);
    expect(losClear(w, 2.5, 3.5, 8.5, 3.5)).toBe(true);
    expect(losClear(w, 2.5, 1.5, 8.5, 1.5)).toBe(true);
  });

  it('closed doors block sight, open ones do not', () => {
    expect(losClear(w, 2.5, 4.5, 8.5, 4.5)).toBe(false);
    for (let i = 0; i < 70; i++) w.tick(null);
    expect(w.doorOpen[0]).toBe(true);
    expect(losClear(w, 2.5, 4.5, 8.5, 4.5)).toBe(true);
  });

  it('cones have a length and a width', () => {
    expect(inCone(w, 1.5, 1.5, 0, 0.55, 9, 8.5, 1.5)).toBe(true);
    expect(inCone(w, 1.5, 1.5, 0, 0.55, 9, 10.6, 1.5)).toBe(false); // too far
    expect(inCone(w, 1.5, 1.5, Math.PI, 0.55, 9, 8.5, 1.5)).toBe(false); // behind
    expect(inCone(w, 1.5, 1.5, 0, 0.55, 9, 3.5, 4.5)).toBe(false); // too wide
  });

  it('a guard sees a body in his cone and anyone right next to him', () => {
    const lv2 = lvl(['##########', '#S.......#', '#........#', '#.......@#', '#T......E#', '##########'], {
      guards: [{ route: [[8, 3]], face: 180 }],
    });
    const s = new Session(lv2);
    // walk into his cone
    expect(record(s, [go(3, 3), wait(1)])).toBe('caught');
    expect(s.world.caught!.by).toBe('guard');
    // walk behind him and stand right next to him: seen within 1 tile
    const s2 = new Session(lv2);
    expect(record(s2, [go(8, 1), to(8, 2), wait(1)])).toBe('caught');
  });
});

describe('door rules', () => {
  const rows = ['############', '#S.abc.....#', '#..........#', '#ABCDF.....#', '#T........E#', '############'];
  const make = (json: LevelJson) => {
    const w = new World(lvl(rows, json));
    w.begin({ lanes: [], liveSlot: -1, loopTicks: 900 });
    return w;
  };
  const base: LevelJson = {
    triggers: { a: { type: 'switch' }, b: { type: 'switch' }, c: { type: 'plate' } },
    doors: {
      A: { rule: 'switch', wires: ['a'] },
      B: { rule: 'switch', wires: ['a', 'b'] },
      C: { rule: 'inverted', wires: ['c'] },
      D: { rule: 'timer', open: [2, 4] },
      F: { rule: 'cycle', period: 3, openFor: 1, phase: 0.5 },
    },
  };

  it('switch doors open on an odd number of switches; inverted doors open when nothing is active', () => {
    const w = make(base);
    expect(w.doorOpen.slice(0, 3)).toEqual([false, false, true]);
    w.triggers[0].on = true;
    w.tick(null);
    expect(w.doorOpen.slice(0, 2)).toEqual([true, true]);
    w.triggers[1].on = true;
    w.tick(null);
    expect(w.doorOpen.slice(0, 2)).toEqual([true, false]); // exactly one of two: closed again
  });

  it('timer and cycle doors follow the clock', () => {
    const w = make(base);
    const at = (s: number) => {
      while (w.t < s * 60) w.tick(null);
      return [w.doorOpen[3], w.doorOpen[4]];
    };
    expect(at(1)).toEqual([false, true]);
    expect(at(1.6)).toEqual([false, false]);
    expect(at(2.5)).toEqual([true, false]);
    expect(at(3.6)).toEqual([true, true]);
    expect(at(4.2)).toEqual([false, true]);
  });

  it('"invert" flips any rule', () => {
    const w = make({ ...base, doors: { ...base.doors, D: { rule: 'timer', open: [2, 4], invert: true } } });
    expect(w.doorOpen[3]).toBe(true);
  });

  it('card doors open while a keycard carrier is near', () => {
    const lv = lvl(['##########', '#S.K..A.T#', '#E.......#', '##########'], { doors: { A: { rule: 'card' } } });
    const s = new Session(lv);
    expect(record(s, [go(3, 1), go(5, 1), wait(0.1)])).toBe('over');
    expect(s.world.doorOpen[0]).toBe(true);
    const s2 = new Session(lv);
    record(s2, [go(4, 1), wait(0.1)]);
    expect(s2.world.doorOpen[0]).toBe(false); // no card
  });
});

describe('items', () => {
  it('Use passes the item through an adjacent window', () => {
    const lv = lvl(['#########', '#S..T...#', '####-####', '#E......#', '#########']);
    const s = new Session(lv);
    record(s, [go(4, 1), use(), go(6, 1)]);
    const it0 = s.world.items[0];
    expect(it0.carrier).toBe(-1);
    expect(it0.x).toBeCloseTo(4.5);
    expect(it0.y).toBeCloseTo(3.5);
  });

  it("standing still after a drop doesn't pick the item back up", () => {
    const lv = lvl(['#########', '#S..T...#', '#E......#', '#########']);
    const s = new Session(lv);
    record(s, [go(4, 1), use(), wait(2)]);
    expect(s.world.items[0].carrier).toBe(-1);
    const s2 = new Session(lv);
    record(s2, [go(4, 1), use(), go(6, 1), go(4, 1), wait(0.2)]);
    expect(s2.world.items[0].carrier).toBe(0);
  });

  it('a lure sends a guard in hearing range to the bell', () => {
    const lv = lvl(['################', '#S.b..........*#', '#..............#', '#T......@.....E#', '################'], {
      triggers: { b: { type: 'lure' } },
      guards: [{ route: [[8, 3]], face: 0 }],
    });
    const s = new Session(lv);
    s.start();
    const bot = new Bot([go(3, 1), use()], lv);
    while (s.world.t < 240) s.step(bot.input(s.world));
    expect(s.phase).toBe('recording');
    const g = s.world.guards[0];
    expect(g.mode).toBe('wait');
    expect(Math.hypot(g.x - 14.5, g.y - 1.5)).toBeLessThan(1.6);
  });
});

describe('scrub performance', () => {
  it('re-simulates 600 ticks with 6 copies in under 4 ms', () => {
    const lv = levelById('1-5')!;
    const s = new Session(lv);
    const plans: Step[][] = [
      [go(2, 16)],
      [go(3, 1), use(), go(8, 18)],
      [go(7, 4), go(1, 12)],
      [go(5, 12), go(8, 2)],
      [go(1, 18), go(6, 9)],
      [go(8, 8), go(2, 2)],
    ];
    for (const p of plans) expect(record(s, p)).toBe('over');
    expect(s.lanes.length).toBe(6);
    const pv = new Preview(lv);
    pv.setPlan(s.lanes, 600);
    for (let i = 0; i < 20; i++) pv.seek(600); // warm up the JIT
    // the median of several batches, so a busy machine doesn't fail the test
    const batches: number[] = [];
    for (let b = 0; b < 7; b++) {
      const t0 = performance.now();
      for (let i = 0; i < 10; i++) pv.seek(600);
      batches.push((performance.now() - t0) / 10);
    }
    batches.sort((x, y) => x - y);
    expect(batches[3]).toBeLessThan(4);
  });
});
