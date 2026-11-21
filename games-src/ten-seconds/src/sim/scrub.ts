/**
 * Plan previews: re-simulate the copies (no live player) from tick 0 to any tick. Used for
 * scrubbing the timeline and for the plan's event markers. Must stay well under 4 ms for 600
 * ticks and 6 copies (tests/sim.test.ts checks).
 */
import type { Level } from './level';
import type { Recording } from './recording';
import { World, type SimEvent } from './world';

export class Preview {
  readonly world: World;
  /** the whole plan's outcome, from the last full run */
  events: SimEvent[] = [];
  endTick = 0;
  private lanes: Recording[] = [];
  private loopTicks = 600;

  constructor(lv: Level) {
    this.world = new World(lv);
  }

  /** Run the whole plan once to collect its markers (paradoxes, detections, uses…). */
  setPlan(lanes: Recording[], loopTicks: number): void {
    this.lanes = lanes;
    this.loopTicks = loopTicks;
    this.seek(loopTicks);
    this.events = this.world.log.slice();
    this.endTick = this.world.t;
  }

  /** World state at tick n of the plan (stops early if the plan gets caught or wins). */
  seek(n: number): World {
    const w = this.world;
    w.begin({ lanes: this.lanes, liveSlot: -1, loopTicks: this.loopTicks });
    const end = Math.min(n, this.loopTicks);
    while (w.t < end && w.status === 'running') w.tick(null);
    return w;
  }
}
