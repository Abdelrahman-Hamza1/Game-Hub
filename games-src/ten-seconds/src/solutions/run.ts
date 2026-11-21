/** Play a scripted solution headlessly through the real simulation (tests, the title demo). */
import { Session, type WinResult } from '../game/session';
import type { DifficultyId } from '../game/difficulty';
import { HZ } from '../sim/constants';
import type { Level } from '../sim/level';
import type { Caught, SimEvent } from '../sim/world';
import { Bot, type Solution } from './dsl';

export interface LoopReport {
  loop: number;
  outcome: 'over' | 'won' | 'caught' | 'full';
  ticks: number;
  caught: Caught | null;
  paradoxes: { actor: number; t: number }[];
  events: SimEvent[];
}

export interface RunResult {
  won: boolean;
  result: WinResult | null;
  winTick: number;
  loopTicks: number;
  reports: LoopReport[];
  session: Session;
}

export function runSolution(lv: Level, sol: Solution, difficulty: DifficultyId = 'normal'): RunResult {
  const s = new Session(lv, difficulty);
  const reports: LoopReport[] = [];
  for (let k = 0; k < sol.loops.length; k++) {
    s.prepare();
    const bot = new Bot(sol.loops[k], lv);
    s.start();
    let n = 0;
    while (s.phase === 'recording' && n++ < 100 * HZ) s.step(bot.input(s.world));
    const w = s.world;
    reports.push({
      loop: k + 1,
      outcome: s.phase === 'over' && s.note === 'full' ? 'full' : (s.phase as LoopReport['outcome']),
      ticks: w.t,
      caught: w.caught,
      paradoxes: w.actors.filter((a) => a.state === 'paradox').map((a) => ({ actor: a.idx, t: a.paradoxAt })),
      events: w.log.slice(),
    });
    if (s.phase !== 'over') break;
  }
  return {
    won: s.phase === 'won',
    result: s.result,
    winTick: s.world.winTick,
    loopTicks: s.world.loopTicks,
    reports,
    session: s,
  };
}

/** A readable account of a run, for failing tests. */
export function describeRun(r: RunResult): string {
  return r.reports
    .map((p) => {
      const c = p.caught ? ` caught by ${p.caught.by} ${p.caught.index} (actor ${p.caught.actor}) at ${(p.caught.t / HZ).toFixed(2)}s at [${p.caught.x1.toFixed(1)}, ${p.caught.y1.toFixed(1)}]` : '';
      const px = p.paradoxes.length ? ` paradox: ${p.paradoxes.map((q) => `copy ${q.actor + 1} at ${(q.t / HZ).toFixed(2)}s`).join(', ')}` : '';
      return `loop ${p.loop}: ${p.outcome} after ${(p.ticks / HZ).toFixed(2)}s${c}${px}`;
    })
    .join('\n');
}
