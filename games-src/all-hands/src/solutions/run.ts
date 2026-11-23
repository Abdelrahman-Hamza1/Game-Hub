/** Play a scripted solution headlessly (tests) or live (the title demo, the browser test hook). */
import type { Level } from '../sim/level';
import { World } from '../sim/world';
import type { Action, Solution } from './dsl';

export interface RunResult {
  won: boolean;
  ticks: number;
  pops: number;
  /** where it got stuck, if it did */
  stuck: string | null;
  world: World;
}

/** Drives four bots through a solution, one tick at a time. */
export class Driver {
  private si = 0;
  private queues: (Action[] | null)[] = [null, null, null, null];
  private t0 = [0, 0, 0, 0];
  private scratch: Record<string, number>[] = [{}, {}, {}, {}];
  stuck: string | null = null;

  constructor(private readonly sol: Solution) {
    this.load();
  }

  get done(): boolean {
    return this.si >= this.sol.steps.length;
  }

  private load(): void {
    const s = this.sol.steps[this.si];
    for (let i = 0; i < 4; i++) {
      this.queues[i] = s?.[i as 0 | 1 | 2 | 3]?.slice() ?? null;
      this.t0[i] = -1;
      this.scratch[i] = {};
    }
  }

  /** The four inputs for this tick. */
  inputs(w: World): number[] {
    const out = [0, 0, 0, 0];
    for (let guard = 0; guard < 4 && !this.done; guard++) {
      let busy = false;
      for (let i = 0; i < 4; i++) {
        const q = this.queues[i];
        while (q && q.length) {
          const a = q[0];
          if (this.t0[i] < 0) {
            this.t0[i] = w.t;
            this.scratch[i] = {};
          }
          const t = w.t - this.t0[i];
          if (a.limit && t > a.limit) {
            this.stuck = `step ${this.si + 1}, player ${i + 1}: ${a.name} timed out`;
            this.si = this.sol.steps.length;
            return out;
          }
          const inp = a.tick({ w, me: w.players[i], t, s: this.scratch[i] });
          if (inp === null) {
            q.shift();
            this.t0[i] = -1;
            continue;
          }
          out[i] = inp;
          busy = true;
          break;
        }
      }
      if (busy) return out;
      this.si++;
      this.load();
    }
    return out;
  }

  where(): string {
    const s = this.sol.steps[this.si];
    if (!s) return 'done';
    return `step ${this.si + 1}: ` + [0, 1, 2, 3].map((i) => (this.queues[i]?.[0] ? `P${i + 1} ${this.queues[i]![0].name}` : '')).filter(Boolean).join(', ');
  }
}

export function runSolution(lv: Level, sol: Solution, maxSeconds = 600): RunResult {
  const w = new World(lv);
  const d = new Driver(sol);
  const max = maxSeconds * 60;
  let after = 0;
  while (w.t < max && w.status !== 'won') {
    w.step(d.inputs(w));
    w.events.length = 0;
    if (d.done) after++;
    if (d.stuck || after > 120) break;
  }
  return {
    won: w.status === 'won',
    ticks: w.status === 'won' ? w.wonTick : w.t,
    pops: w.pops,
    stuck: w.status === 'won' ? null : d.stuck ?? `ran out: ${d.where()}`,
    world: w,
  };
}
