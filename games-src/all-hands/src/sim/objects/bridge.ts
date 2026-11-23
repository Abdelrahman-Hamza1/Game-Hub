/** Fragile bridges (`~`): hold up to n weight; more and they crumble, then come back after 3 s. */
import { BRIDGE_RESPAWN_TICKS } from '../constants';
import { runs, type Level, type Rect } from '../level';
import type { Thing } from '../types';
import type { World } from '../world';

export class Bridge implements Thing {
  kind = 'bridge';
  dx = 0;
  dy = 0;
  broken = 0;
  load_ = 0;
  constructor(
    readonly r: Rect,
    readonly n: number,
  ) {}
  boxes() {
    return this.broken ? [] : [this.r];
  }
  update(w: World): void {
    if (this.broken) {
      this.broken--;
      if (!this.broken && !w.boxFree(this.r.x, this.r.y, this.r.w, this.r.h, null)) this.broken = 1;
      return;
    }
    this.load_ = 0;
    for (const b of w.ridersOf(this)) this.load_ += w.weightOf(b);
    if (this.load_ > this.n) {
      this.broken = BRIDGE_RESPAWN_TICKS;
      w.emit('crumble', this.r.x + this.r.w / 2, this.r.y, -1);
    }
  }
  save() {
    return [this.broken, this.load_];
  }
  load(s: unknown) {
    [this.broken, this.load_] = s as [number, number];
  }
}

export function build(lv: Level): Thing[] {
  return runs(lv, '~').map((r, i) => new Bridge(r, lv.json.bridges?.[i]?.n ?? 1));
}
