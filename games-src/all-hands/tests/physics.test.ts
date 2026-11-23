/**
 * The movement numbers the 48 levels are designed against (DESIGN.md "Movement numbers"): the
 * stack table, gap widths, throws, springs, pushing.
 */
import { describe, expect, it } from 'vitest';
import { In } from '../src/sim/types';
import type { World } from '../src/sim/world';
import { makeWorld, peakFeet, run } from './helpers';

const FLAT = [
  '##############################',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#....................K.......#',
  '#............................#',
  '#............................#',
  '#.S.S.S.S.................D..#',
  '#.........................D..#',
  '##############################',
];
const FLOOR = 17;
const idle = () => [0, 0, 0, 0];

/** Move players k.. out of the way, to the right end of the floor. */
function park(w: World, k: number): void {
  for (let i = k; i < 4; i++) {
    w.players[i].x = 18 + i * 1.5;
    w.players[i].y = FLOOR - w.players[i].h;
  }
  w.contacts();
}

/** Stack players 0..k-1 in a column at x=10 on the floor (player k-1 on top). */
function stack(w: World, k: number): void {
  for (let i = 0; i < 4; i++) {
    const p = w.players[i];
    if (i < k) {
      p.x = 10;
      p.y = FLOOR - p.h * (i + 1);
    } else {
      p.x = 20 + i;
      p.y = FLOOR - p.h;
    }
  }
  w.contacts();
  run(w, 5, idle);
}

describe('the stack table', () => {
  for (const [helpers, lo, hi] of [
    [0, 2, 3],
    [1, 3, 4],
    [2, 4, 5],
    [3, 5, 6],
  ] as const) {
    it(`a jump from ${helpers} friend(s) clears a ${lo}-high ledge but not ${hi}`, () => {
      const w = makeWorld(FLAT);
      stack(w, helpers + 1);
      const top = w.players[helpers];
      expect(top.supported).toBe(true);
      const feet = peakFeet(w, helpers, 60, () => {
        const i = [0, 0, 0, 0];
        i[helpers] = In.Jump;
        return i;
      });
      const height = FLOOR - feet;
      expect(height).toBeGreaterThan(lo + 0.15);
      expect(height).toBeLessThan(hi - 0.15);
    });
  }

  it("you can't jump off a friend who is in the air", () => {
    const w = makeWorld(FLAT);
    stack(w, 2);
    // the base jumps, and the rider presses jump on the same tick and after
    const feet = peakFeet(w, 1, 60, (t) => [t === 0 ? In.Jump : In.Jump, t > 0 && t < 20 ? In.Jump : 0, 0, 0]);
    // the rider is lifted with the base (0.9 + 2.5 = 3.4) but gets no jump of their own on top
    expect(FLOOR - feet).toBeLessThan(3.5);
  });

  it('a base that jumps lifts whoever stands on it', () => {
    const w = makeWorld(FLAT);
    stack(w, 2);
    const y0 = w.players[1].y;
    run(w, 10, [In.Jump, 0, 0, 0]);
    expect(w.players[1].y).toBeLessThan(y0 - 1);
  });
});

/** A floor with a gap of `gap` tiles starting at x=12. */
function gapLevel(gap: number): string[] {
  const rows = FLAT.slice(0, FLOOR).map((r) => r);
  const floor = '#'.repeat(30).split('');
  for (let x = 12; x < 12 + gap; x++) floor[x] = '.';
  rows.push(floor.join(''));
  rows.push(floor.join(''));
  return rows;
}

/** Run right from x=7 and press jump on tick `jt` (held for 20 ticks); did player 0 get across? */
function crosses(gap: number, jt: number): boolean {
  const w = makeWorld(gapLevel(gap));
  const p = w.players[0];
  p.x = 7.05;
  for (const q of w.players.slice(1)) q.x = 26;
  w.contacts();
  for (let t = 0; t < 150; t++) {
    w.step([In.Right | (t >= jt && t < jt + 20 ? In.Jump : 0), 0, 0, 0]);
    if (p.y > FLOOR + 1) return false;
  }
  return p.x > 12 + gap - 0.1 && p.y + p.h <= FLOOR + 0.01;
}

describe('gaps', () => {
  it('a running jump crosses 4 tiles', () => {
    let ok = false;
    for (let jt = 0; jt < 70 && !ok; jt++) ok = crosses(4, jt);
    expect(ok).toBe(true);
  });
  it('no jump timing crosses 5 tiles', () => {
    for (let jt = 0; jt < 70; jt++) expect(crosses(5, jt), `jump on tick ${jt}`).toBe(false);
  });
});

describe('grab and throw', () => {
  it('a thrown friend peaks about 3.8 above the floor and lands about 5 tiles away', () => {
    const w = makeWorld(FLAT);
    const [a, b] = w.players;
    park(w, 2);
    a.x = 6;
    b.x = 6 + a.w + 0.05;
    a.y = b.y = FLOOR - a.h;
    w.contacts();
    run(w, 3, idle);
    run(w, 2, [In.Grab, 0, 0, 0]);
    expect(a.carrying).toBe(b);
    run(w, 3, idle);
    const x0 = b.x;
    let peak = Infinity;
    w.step([In.Grab, 0, 0, 0]);
    expect(a.carrying).toBe(null);
    for (let i = 0; i < 120; i++) {
      w.step(idle());
      peak = Math.min(peak, b.y + b.h);
    }
    expect(FLOOR - peak).toBeGreaterThan(3.6);
    expect(FLOOR - peak).toBeLessThan(4.0);
    expect(b.x - x0).toBeGreaterThan(4);
    expect(b.x - x0).toBeLessThan(6.5);
  });

  it('the key jumps into empty hands and opens the door', () => {
    const w = makeWorld(FLAT);
    const p = w.players[0];
    park(w, 1);
    for (const q of w.players.slice(1)) q.x -= 15;
    p.x = 21;
    p.y = 12 - 0.5;
    w.contacts();
    run(w, 60, idle);
    expect(p.carrying).toBe(w.key);
    // walk to the door and step in
    for (let t = 0; t < 200 && !w.doorOpen; t++) w.step([In.Right, 0, 0, 0]);
    expect(w.doorOpen).toBe(true);
    run(w, 2, [In.Down, 0, 0, 0]);
    expect(p.p!.inside).toBe(true);
  });
});

describe('springs and pushing', () => {
  it('a spring sends your feet 5.5 above its top', () => {
    const rows = FLAT.slice();
    rows[16] = '#.........j...............D..#';
    const w = makeWorld(rows);
    const p = w.players[0];
    park(w, 1);
    p.x = 10.05;
    p.y = 13;
    p.vy = 0;
    w.contacts();
    const feet = peakFeet(w, 0, 90, idle);
    expect(16 - feet).toBeGreaterThan(5.3);
    expect(16 - feet).toBeLessThan(5.7);
  });

  it('a block marked 3 moves for three pushers in a line, not two', () => {
    const rows = FLAT.slice();
    rows[15] = '#.S.S.S.S.......B.........D..#';
    rows[16] = '#...............B.........D..#';
    const w = makeWorld(rows, { blocks: [{ n: 3 }] });
    const block = w.bodies.find((b) => b.kind === 'block')!;
    const x0 = block.x;
    // the two nearest run right into the block: not enough
    run(w, 120, [0, 0, In.Right, In.Right]);
    expect(block.x).toBeCloseTo(x0, 5);
    // a third joins the line
    run(w, 200, [0, In.Right, In.Right, In.Right]);
    expect(block.x).toBeGreaterThan(x0 + 1);
  });
});

describe('fixes from level testing', () => {
  it('a throw from the top of a jump is just letting go: no extra height', () => {
    const w = makeWorld(FLAT);
    const [a, b] = w.players;
    park(w, 2);
    a.x = 6;
    b.x = 6 + a.w + 0.05;
    a.y = b.y = FLOOR - a.h;
    w.contacts();
    run(w, 3, idle);
    run(w, 2, [In.Grab, 0, 0, 0]);
    expect(a.carrying).toBe(b);
    // jump, then Grab near the top
    let peak = Infinity;
    for (let t = 0; t < 120; t++) {
      w.step([t < 24 ? In.Jump | (t === 18 ? In.Grab : 0) : 0, 0, 0, 0]);
      peak = Math.min(peak, b.y + b.h);
    }
    expect(a.carrying).toBe(null);
    // the friend rose with the thrower (0.9 + 2.5 = 3.4) and no further
    expect(FLOOR - peak).toBeLessThan(3.5);
  });

  it('Down+Grab takes the key off a friend standing beside you (plain Grab picks up the friend)', () => {
    const w = makeWorld(FLAT);
    const [a, b] = w.players;
    park(w, 2);
    a.x = 6;
    b.x = 6 + a.w + 0.05;
    a.y = b.y = FLOOR - a.h;
    w.key.x = a.x + 0.15;
    w.key.y = a.y - 0.3;
    w.contacts();
    run(w, 3, idle);
    expect(a.carrying).toBe(w.key);
    run(w, 2, [0, In.Grab | In.Down, 0, 0]);
    expect(b.carrying).toBe(w.key);
    expect(a.carrying).toBe(null);
  });
});

describe('corner nudge', () => {
  it("a jump that only clips a rider's overhang slides past it", () => {
    const w = makeWorld(FLAT);
    const [a, b, c] = w.players;
    park(w, 3);
    // b stands on a; c stands right beside a, 0.05 under b's overhang
    a.x = 10;
    a.y = FLOOR - a.h;
    b.x = 9.93;
    b.y = a.y - b.h;
    c.x = 10 - c.w - 0.0;
    c.y = FLOOR - c.h;
    w.contacts();
    run(w, 2, idle);
    const y0 = c.y;
    run(w, 10, [0, 0, In.Jump, 0]);
    expect(c.y).toBeLessThan(y0 - 1);
  });
});
