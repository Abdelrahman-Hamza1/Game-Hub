import { describe, expect, it } from 'vitest';
import { parseLevel, validateLevel, type LevelJson } from '../src/sim/level';
import { Session } from '../src/game/session';
import { Bot, go, inCar, to, until, type Step } from '../src/solutions/dsl';
import { Preview } from '../src/sim/scrub';
import { hashWorld } from '../src/sim/hash';
import { carriageOffset } from '../src/sim/train';

// a north platform, a track with one carriage, a south platform with the gem and the exit
const rows = [
  '##################################',
  '#................................#',
  '#.....S..........................#',
  '#................................#',
  '######.###########################',
  '#~#######~~~~~~~~~~~~~~~~~~~~~~~~#',
  '#~#......~~~~~~~~~~~~~~~~~~~~~~~~#',
  '#~######.~~~~~~~~~~~~~~~~~~~~~~~~#',
  '##################.###############',
  '#................................#',
  '#.......................T.....EE.#',
  '#.............................EE.#',
  '##################################',
];
// the carriage is drawn at x 2..9 (doors: top at x 6, bottom at x 8... see below)
const carRows = rows.slice();
carRows[5] = '#~####.###~~~~~~~~~~~~~~~~~~~~~~~#';
carRows[6] = '#~#......#~~~~~~~~~~~~~~~~~~~~~~~#';
carRows[7] = '#~######.#~~~~~~~~~~~~~~~~~~~~~~~#';
const json: LevelJson = { carriages: [{ rect: [2, 5, 9, 7], path: [[0, 0], [1.5, 0], [4.5, 10], [10, 10]] }] };
const lv = () => parseLevel('t', carRows.join('\n'), json);

function record(s: Session, steps: Step[]): string {
  s.prepare();
  s.start();
  const bot = new Bot(steps, s.lv);
  while (s.phase === 'recording') s.step(bot.input(s.world));
  return s.phase;
}

const ride: Step[] = [go(6, 3), to(6, 4), inCar(0, 6, 6), inCar(0, 8, 6), until(4.6), inCar(0, 8, 7), to(18, 9), go(24, 10), go(31, 10)];

describe('the train', () => {
  it('parses a carriage and leaves track where it was drawn', () => {
    const l = lv();
    expect(validateLevel(l), validateLevel(l).join(" ")).toEqual([]);
    expect(l.carriages.length).toBe(1);
    expect(l.carriages[0].w).toBe(8);
    expect(carriageOffset(l.carriages[0], 0)).toBe(0);
    expect(carriageOffset(l.carriages[0], 3 * 60)).toBeCloseTo(5);
    expect(carriageOffset(l.carriages[0], 9 * 60)).toBe(10);
  });

  it('you board through a lined-up door, ride, and get off at the far platform', () => {
    const s = new Session(lv());
    expect(record(s, ride)).toBe('won');
  });

  it('the track is solid where no carriage is', () => {
    const s = new Session(lv());
    s.start();
    const bot = new Bot([until(2.5), go(6, 3), to(6, 6)], s.lv);
    while (s.world.t < 300) s.step(bot.input(s.world));
    expect(s.world.live!.y).toBeLessThan(4.61); // the carriage has left: the gap opens onto track
  });

  it('a recorded ride replays exactly as a copy', () => {
    const l = lv();
    const s = new Session(l);
    record(s, ride.slice(0, -1).concat([until(9.9)]));
    const p = new Preview(l);
    p.setPlan(s.lanes, 600);
    const a = [0, 200, 400, 599].map((n) => hashWorld(p.seek(n)));
    const b = [0, 200, 400, 599].map((n) => hashWorld(p.seek(n)));
    expect(a).toEqual(b);
    expect(p.seek(600).actors[0].state).not.toBe('paradox');
  });

  it('things drawn in a carriage start where the carriage is at tick 0', () => {
    const l = parseLevel('t', carRows.map((r, y) => (y === 6 ? r.slice(0, 4) + 'K' + r.slice(5) : r)).join('\n'), { carriages: [{ rect: [2, 5, 9, 7], path: [[0, 3], [2, 3]] }] });
    const s = new Session(l);
    expect(s.world.items.find((i) => i.kind === 'card')!.x).toBeCloseTo(4.5 + 3);
  });

  it('missing the train strands the copy on the platform', () => {
    const s = new Session(lv());
    // too late: the doors have moved on
    expect(record(s, [until(2.0), go(6, 3), to(6, 4), to(6, 6)])).toBe('over');
    expect(s.lanes[0].ys[s.lanes[0].len - 1]).toBeLessThan(4.61);
  });
});
