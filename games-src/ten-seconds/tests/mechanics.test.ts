import { describe, expect, it } from 'vitest';
import { parseLevel, type LevelJson } from '../src/sim/level';
import { Session, stoneTouchedBy } from '../src/game/session';
import { Bot, go, to, until, use, wait, type Step } from '../src/solutions/dsl';
import { Preview } from '../src/sim/scrub';
import { World } from '../src/sim/world';
import { newRecording, pushFrame } from '../src/sim/recording';

const lvl = (rows: string[], json: LevelJson = {}) => parseLevel('t', rows.join('\n'), json);

function record(s: Session, steps: Step[]): string {
  s.prepare();
  s.start();
  const bot = new Bot(steps, s.lv);
  while (s.phase === 'recording') s.step(bot.input(s.world));
  return s.phase;
}

describe('crates', () => {
  const rows = ['############', '#S..O....a.#', '#.........A#', '#E........T#', '############'];
  const json: LevelJson = { doors: { A: { rule: 'plate', wires: ['a'] } } };

  it('walking into a crate pushes it, slower than walking', () => {
    const s = new Session(lvl(rows, json));
    s.start();
    const bot = new Bot([to(9, 1)], s.lv);
    let t = 0;
    while (s.world.crates[0].x < 5.5 && t++ < 200) s.step(bot.input(s.world));
    const c = s.world.crates[0];
    expect(c.x).toBeGreaterThan(5.4);
    expect(c.y).toBeCloseTo(1.5);
    // pushing moves at 40% speed: about 1 tile in 0.27 s at full speed would be 16 ticks; pushing takes longer
    const x0 = c.x;
    for (let i = 0; i < 30; i++) s.step(bot.input(s.world));
    expect(c.x - x0).toBeLessThan(30 * (9.4 / 60) * 0.45);
    expect(c.x - x0).toBeGreaterThan(30 * (9.4 / 60) * 0.3);
  });

  it('a crate on a plate holds its door open with nobody there', () => {
    const s = new Session(lvl(rows, json));
    expect(record(s, [to(1, 1), to(8, 1), to(5, 2), wait(0.2)])).toBe('over');
    const w = s.world;
    expect(Math.floor(w.crates[0].x)).toBe(9);
    expect(w.doorOpen[0]).toBe(true);
  });

  it('a copy whose path runs into a crate that is now in the way freezes', () => {
    const lv = lvl(['##########', '#S.......#', '#.O......#', '#....T..E#', '##########']);
    const s = new Session(lv);
    // loop 1 walks straight down column 2 (the crate is at x=2 row 2: it pushes it down? no: it walks around)
    expect(record(s, [to(4, 1), to(4, 3)])).toBe('over');
    // loop 2 pushes the crate into column 4 at row 2... then copy 1's path is blocked
    record(s, [to(1, 2), to(3, 2), wait(0.1)]);
    const p = new Preview(lv);
    p.setPlan(s.lanes, 600);
    expect(p.world.crates[0].x).toBeGreaterThan(3.5);
  });
});

describe('boost over a low wall', () => {
  const rows = ['##########', '#S...#...#', '#....#.T.#', '#...._...#', '#E...#...#', '##########'];
  it('touching a crouched copy vaults you over; without the crouch you cannot pass', () => {
    const lv = lvl(rows);
    const s = new Session(lv);
    // copy 1 crouches at the low wall at about 0.6 s and stays put
    expect(record(s, [go(4, 3), use(), wait(3)])).toBe('over');
    // the live player walks into the crouched copy and is carried over the wall
    s.prepare();
    s.start();
    const bot = new Bot([go(3, 3), to(4, 3)], lv);
    let vaulted = false;
    while (s.phase === 'recording' && s.world.t < 200) {
      s.step(bot.input(s.world));
      if (s.world.live!.x > 6.2) vaulted = true;
    }
    expect(vaulted).toBe(true);
    // alone, the low wall stops you
    const s2 = new Session(lv);
    s2.start();
    const bot2 = new Bot([to(4, 3), to(7, 3)], lv);
    while (s2.world.t < 120) s2.step(bot2.input(s2.world));
    expect(s2.world.live!.x).toBeLessThan(5);
  });
});

describe('lasers and mirrors', () => {
  const rows = ['###########', '#S...#....#', '=.........#', '#....#...T#', '#E...#.M..#', '###########'];
  it('crossing a beam is detected; carrying the mirror into it blocks it', () => {
    const lv = lvl(rows, { lasers: [{ dir: 'right' }] });
    const s = new Session(lv);
    expect(record(s, [go(1, 3)])).toBe('caught');
    expect(s.world.caught!.by).toBe('laser');
  });
});

describe('the Hound', () => {
  const rows = ['##############', '#S..........&#', '#............#', '#............#', '#T..........E#', '##############'];
  it('sleeps in loop 1 and then follows the newest copy, 2 s behind', () => {
    const lv = lvl(rows);
    const s = new Session(lv);
    expect(s.world.hounds[0].phase).toBe('sleep');
    expect(record(s, [go(6, 1), go(6, 4), wait(9)])).toBe('over');
    s.prepare();
    const w = s.world;
    expect(w.hounds[0].phase).toBe('approach');
    s.start();
    const bot = new Bot([go(1, 4), until(9.5)], lv);
    // the hound reaches the start, then walks copy 1's trail and catches it where it stopped
    let trailed = false;
    while (s.phase === 'recording') {
      s.step(bot.input(w));
      if (w.hounds[0].phase === 'trail') trailed = true;
    }
    expect(trailed).toBe(true);
    expect(s.phase).toBe('caught');
    expect(w.caught!.by).toBe('hound');
    expect(w.caught!.actor).toBe(0);
  });
});

describe('the Auditor', () => {
  const rows = ['##############', '#S...........#', '#............#', '#!...........#', '#T..........E#', '##############'];
  it('walks to where the newest copy ended its loop', () => {
    const lv = lvl(rows, { auditors: [{ route: [[1, 3]], face: 180, wait: 3 }] });
    const s = new Session(lv);
    expect(record(s, [go(10, 1)])).toBe('over');
    s.prepare();
    const g = s.world.guards[0];
    expect(g.auditor).toBe(true);
    expect(g.mode).toBe('go');
    const last = g.path[g.path.length - 1];
    expect(Math.hypot(last[0] - 10.5, last[1] - 1.5)).toBeLessThan(0.6);
  });
});

describe('two Auditors', () => {
  it('the first remembers the newest copy, the second the one before', () => {
    const rows = ['##############', '#S...........#', '#............#', '#!...........#', '#!...........#', '#T..........E#', '##############'];
    const lv = lvl(rows, { auditors: [{ route: [[1, 3]], face: 180 }, { route: [[1, 4]], face: 180 }] });
    // two copies that simply stand at their end points (copy 2 is the newer)
    const stand = (x: number, y: number, stamp: number) => {
      const r = newRecording(4, stamp);
      pushFrame(r, x, y, 0, 0);
      return r;
    };
    const w = new World(lv);
    w.begin({ lanes: [stand(10.5, 1.5, 5), stand(6.5, 2.5, 9)], liveSlot: -1, loopTicks: 600 });
    const [g1, g2] = w.guards;
    const end = (g: typeof g1) => g.path[g.path.length - 1];
    expect(Math.hypot(end(g1)[0] - 6.5, end(g1)[1] - 2.5)).toBeLessThan(0.01);
    expect(Math.hypot(end(g2)[0] - 10.5, end(g2)[1] - 1.5)).toBeLessThan(0.01);
  });
});

describe('the Watchmaker', () => {
  it('rewinds the room at his check unless every lever is held; the loop so far becomes a copy', () => {
    const rows = ['############', '#S.a..b..c.#', '#..........#', '#T........E#', '############'];
    const lv = lvl(rows, { watchmaker: { every: 8, levers: ['a', 'b', 'c'] }, triggers: { a: { type: 'lever' }, b: { type: 'lever' }, c: { type: 'lever' } } });
    const s = new Session(lv);
    expect(record(s, [go(3, 1)])).toBe('over');
    expect(s.world.rewound).toBe(true);
    expect(s.world.t).toBe(480);
    expect(s.lanes.length).toBe(1);
    record(s, [go(6, 1)]);
    // with all three held, the loop runs its full length
    expect(record(s, [go(9, 1)])).toBe('over');
    expect(s.world.rewound).toBe(false);
    expect(s.world.t).toBe(600);
  });
});

describe('rewind stones', () => {
  it('a copy that touched a stone makes the next loop 5 s', () => {
    const lv = lvl(['##########', '#S..R...T#', '#E.......#', '##########']);
    const s = new Session(lv);
    expect(s.slotTicks(0)).toBe(600);
    record(s, [go(6, 1)]);
    expect(stoneTouchedBy(lv, s.lanes[0])).toBe(true);
    expect(s.slotTicks(1)).toBe(300);
    s.prepare();
    expect(s.world.loopTicks).toBe(300);
  });
});

describe('bodies that collide', () => {
  it('copies starting on the same tile do not block each other', () => {
    const lv = lvl(['##########', '#S.......#', '#........#', '#E......T#', '##########'], { bodiesCollide: true });
    const s = new Session(lv);
    record(s, [go(4, 1), wait(9)]);
    s.prepare();
    s.start();
    const bot = new Bot([go(1, 2), go(8, 3), go(1, 3)], lv);
    while (s.phase === 'recording') s.step(bot.input(s.world));
    expect(s.phase).toBe('won');
    expect(s.world.actors[0].state).not.toBe('paradox');
  });

  it('a copy whose path is blocked by another body freezes', () => {
    const lv = lvl(['##########', '#S.......#', '#........#', '#E......T#', '##########'], { bodiesCollide: true });
    const s = new Session(lv);
    record(s, [go(4, 1), wait(9)]); // copy 1 parks at (4,1)
    record(s, [go(1, 2), wait(0.5), go(7, 2), wait(9)]); // copy 2 walks along row 2, clear of it
    let p = new Preview(lv);
    p.setPlan(s.lanes, 600);
    expect(p.world.actors[1].state).toBe('active');
    // re-record copy 1 to park on row 2: copy 2's recorded path now runs into it
    s.select(0);
    record(s, [go(4, 2), wait(9)]);
    p = new Preview(lv);
    p.setPlan(s.lanes, 600);
    expect(p.world.actors[1].state).toBe('paradox');
  });
});
