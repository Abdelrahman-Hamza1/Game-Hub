/**
 * One attempt at a level: the plan (lanes of copies), which lane is being recorded, and the loop
 * phases. Pure logic, no DOM: the UI drives it, and so do the solution tests.
 *
 *   ready ──first input──▶ recording ──time up──▶ over (copy saved) ──▶ ready
 *                              │ seen ──▶ caught ──▶ ready (same loop again)
 *                              └ target out ──▶ won
 */
import { HZ, SHORT_LOOP_SECONDS } from '../sim/constants';
import type { Level } from '../sim/level';
import { newRecording, setTrim, type Recording } from '../sim/recording';
import { World } from '../sim/world';
import type { LiveInput } from '../sim/actors';
import { DIFFICULTY, type DifficultyId } from './difficulty';

export type Phase = 'ready' | 'recording' | 'caught' | 'won' | 'over';

export interface WinResult {
  loops: number;
  /** seconds into the final loop when the target reached the exit */
  time: number;
  par: boolean;
  clean: boolean;
  swift: boolean;
}

export class Session {
  readonly lv: Level;
  readonly difficulty: DifficultyId;
  lanes: Recording[] = [];
  /** lane being re-recorded, or -1 for a new loop */
  selected = -1;
  phase: Phase = 'ready';
  world: World;
  rec: Recording;
  result: WinResult | null = null;
  /** why the last loop ended without a copy (for messages) */
  note: 'full' | null = null;
  /** loops played (including retries), for stats */
  attempts = 0;
  private stamp = 0;

  constructor(lv: Level, difficulty: DifficultyId = 'normal') {
    this.lv = lv;
    this.difficulty = difficulty;
    this.world = new World(lv);
    this.rec = newRecording(1, 0);
    this.prepare();
  }

  get diff() {
    return DIFFICULTY[this.difficulty];
  }

  /** Copies allowed (lanes). Hard-core allows par + 1 loops in total. */
  maxCopies(): number {
    return this.difficulty === 'hardcore' ? Math.max(1, this.lv.par) : this.lv.maxCopies;
  }

  /** The lane the live player records into. */
  liveSlot(): number {
    return this.selected >= 0 ? this.selected : this.lanes.length;
  }

  /** Ticks in the loop played in lane `slot` (a rewind stone before it makes it short). */
  slotTicks(slot: number): number {
    const prev = slot > 0 ? this.lanes[slot - 1] : null;
    const secs = prev && stoneTouchedBy(this.lv, prev) ? SHORT_LOOP_SECONDS : this.lv.loopSeconds;
    return Math.round(secs * this.diff.loopScale * HZ);
  }

  loopTicks(): number {
    return this.world.loopTicks;
  }

  /** Reset the world to tick 0 of the next loop, with the live player at the start. */
  prepare(): void {
    const slot = this.liveSlot();
    const ticks = this.slotTicks(slot);
    this.rec = newRecording(ticks + 1, ++this.stamp);
    this.world.begin({ lanes: this.lanes, liveSlot: slot, liveRec: this.rec, loopTicks: ticks });
    this.phase = 'ready';
    this.result = null;
  }

  /** The clock starts (first input). */
  start(): void {
    if (this.phase !== 'ready') return;
    this.phase = 'recording';
    this.attempts++;
    this.note = null;
  }

  /** One tick of the live loop. */
  step(input: LiveInput): void {
    if (this.phase !== 'recording') return;
    const w = this.world;
    w.tick(input);
    if (w.status === 'won') {
      this.phase = 'won';
      const loops = w.actors.length;
      const time = w.winTick / HZ;
      this.result = {
        loops,
        time,
        par: loops <= this.lv.par,
        clean: !w.actors.some((a) => a.state === 'paradox'),
        swift: time < this.lv.swiftTime,
      };
    } else if (w.status === 'caught') {
      this.phase = 'caught';
    } else if (w.status === 'over') {
      this.commit();
      this.phase = 'over';
    }
  }

  /** Save the finished recording as a copy (unless the crew is full). */
  private commit(): void {
    const rec = this.rec;
    rec.delay = 0;
    rec.cut = rec.len;
    if (this.selected >= 0) {
      this.lanes[this.selected] = rec;
    } else if (this.lanes.length < this.maxCopies()) {
      this.lanes.push(rec);
    } else {
      this.note = 'full';
    }
    this.selected = -1;
  }

  /** R: throw away the current recording and start the loop again. */
  retry(): void {
    this.prepare();
  }

  /** Z: remove the last lane. */
  deleteLast(): boolean {
    if (!this.lanes.length || !this.diff.timeline) return false;
    this.lanes.pop();
    if (this.selected >= this.lanes.length) this.selected = -1;
    this.prepare();
    return true;
  }

  /** 1–6: record over lane n (0-based) next; select it again to go back to a new loop. */
  select(n: number): boolean {
    if (!this.diff.timeline || n < 0 || n >= this.lanes.length) return false;
    this.selected = this.selected === n ? -1 : n;
    this.prepare();
    return true;
  }

  /** Shift when a copy starts (delay) and stops (cut), in ticks. */
  trim(n: number, delay: number, cut: number): void {
    const r = this.lanes[n];
    if (!r || !this.diff.timeline) return;
    setTrim(r, delay, cut, this.slotTicks(n + 1));
    this.prepare();
  }

  /** Can a finished loop still become a copy? */
  crewFull(): boolean {
    return this.selected < 0 && this.lanes.length >= this.maxCopies();
  }
}

/** Did a copy's played path touch a rewind stone? (judged from the recording, see DESIGN.md) */
export function stoneTouchedBy(lv: Level, r: Recording): boolean {
  if (!lv.stones.length) return false;
  for (let f = 0; f < r.cut; f++) {
    for (const [sx, sy] of lv.stones) {
      if (Math.hypot(r.xs[f] - sx - 0.5, r.ys[f] - sy - 0.5) < 0.9) return true;
    }
  }
  return false;
}
