/**
 * Scales: two pans (`s` runs, paired in reading order). The heavier pan sinks by the weight
 * difference, up to 3 tiles, and the other rises as much. A pan never crushes: it stops on
 * whatever is under it.
 */
import { DT, EPS, SCALE_MAX, SCALE_SPEED } from '../constants';
import { runs, type Level, type Rect } from '../level';
import type { Thing } from '../types';
import type { World } from '../world';

export class Pan implements Thing {
  kind = 'pan';
  dx = 0;
  dy = 0;
  weight = 0;
  other!: Pan;
  readonly box: Rect;
  constructor(readonly rest: Rect) {
    this.box = { ...rest };
  }
  boxes() {
    return [this.box];
  }
  move(w: World): void {
    // both pans read their weights first (the first pan of a pair does it for both)
    if (this.isFirst) {
      this.weight = this.load_(w);
      this.other.weight = this.other.load_(w);
    }
    const target = this.rest.y + Math.max(-SCALE_MAX, Math.min(SCALE_MAX, this.weight - this.other.weight));
    const d = target - this.box.y;
    if (Math.abs(d) < EPS) return;
    const step = Math.sign(d) * Math.min(Math.abs(d), SCALE_SPEED * DT);
    w.movePlatform(this, this.box, 0, step);
  }
  isFirst = false;
  private load_(w: World): number {
    let t = 0;
    for (const b of w.ridersOf(this)) t += w.weightOf(b);
    return t;
  }
  save() {
    return [this.box.y, this.weight];
  }
  load(s: unknown) {
    [this.box.y, this.weight] = s as number[];
  }
}

export function build(lv: Level): Thing[] {
  const pans = runs(lv, 's').map((r) => new Pan(r));
  for (let i = 0; i + 1 < pans.length; i += 2) {
    pans[i].other = pans[i + 1];
    pans[i + 1].other = pans[i];
    pans[i].isFirst = true;
  }
  // an unpaired pan balances against nothing
  if (pans.length % 2) {
    const last = pans[pans.length - 1];
    last.other = new Pan(last.rest);
    last.isFirst = true;
  }
  return pans;
}
