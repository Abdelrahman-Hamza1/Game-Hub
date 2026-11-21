import { describe, expect, it } from 'vitest';
import { levelById } from '../src/levels';
import { Session } from '../src/game/session';
import { Bot, go, until, use, type Step } from '../src/solutions/dsl';
import { Preview } from '../src/sim/scrub';

function record(s: Session, steps: Step[]): string {
  s.prepare();
  s.start();
  const bot = new Bot(steps, s.lv);
  while (s.phase === 'recording') s.step(bot.input(s.world));
  return s.phase;
}

const runner1_1: Step[] = [go(23, 5), go(1, 2)];

describe('fixing a plan on the timeline', () => {
  it('a plate holder who leaves too early is fixed by trimming its end, without re-recording', () => {
    const s = new Session(levelById('1-1')!);
    // loop 1 steps off the plate after a second: the door shuts on the runner
    expect(record(s, [go(1, 6), until(1.0), go(3, 6)])).toBe('over');
    const before = s.lanes[0];
    const sameRec = before.id;
    expect(record(s, runner1_1)).toBe('over'); // no win: stuck at the door
    s.deleteLast();
    // trim copy 1 to stop at 0.8 s, while it's standing on the plate: it holds the door all loop
    s.trim(0, 0, 48);
    expect(s.lanes[0].id).toBe(sameRec);
    expect(record(s, runner1_1)).toBe('won');
  });

  it('a plate holder who steps off too early is fixed by delaying its copy (start handle)', () => {
    const s = new Session(levelById('1-3')!);
    // the holder lets go at 2 s, while the runner is still in the gem room
    expect(record(s, [go(13, 3), until(2.0), go(11, 2)])).toBe('over');
    const runner: Step[] = [go(18, 7), go(13, 4), go(20, 3), go(25, 3)];
    expect(record(s, runner)).toBe('over');
    s.deleteLast();
    // start copy 1 0.8 s later: the whole hold slides later, and the runner gets out in time
    s.trim(0, 48, s.lanes[0].len);
    expect(record(s, runner)).toBe('won');
  });

  it('scrubbing shows the plan exactly as it plays', () => {
    const lv = levelById('1-5')!;
    const s = new Session(lv);
    record(s, [go(2, 16)]);
    record(s, [go(3, 1), use()]);
    const p = new Preview(lv);
    p.setPlan(s.lanes, 600);
    const w = p.seek(240);
    // the lure copy rang the bell: the guard is on his way or waiting at it
    expect(['go', 'wait']).toContain(w.guards[0].mode);
    expect(w.doorOpen[0]).toBe(true);
  });
});
