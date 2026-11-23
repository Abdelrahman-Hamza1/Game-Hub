/**
 * Lifts (`L`): move toward the end of their path while at least n players ride (stacked ones
 * count), and slide back toward the start otherwise, at 2 tiles/s.
 */
import { DT, EPS, LIFT_SPEED } from '../constants';
import { bounds, groups, type Level, type Rect } from '../level';
import type { Thing } from '../types';
import type { World } from '../world';
import { Path } from './path';

export class Lift implements Thing {
  kind = 'lift';
  dx = 0;
  dy = 0;
  s = 0;
  riders = 0;
  readonly box: Rect;
  constructor(
    r: Rect,
    readonly n: number,
    readonly path: Path,
  ) {
    this.box = { ...r };
  }
  boxes() {
    return [this.box];
  }
  move(w: World): void {
    this.riders = w.playersOn(this);
    const dir = this.riders >= this.n ? 1 : -1;
    const s1 = Math.max(0, Math.min(this.path.total, this.s + dir * LIFT_SPEED * DT));
    if (Math.abs(s1 - this.s) < EPS) return;
    const [tx, ty] = this.path.at(s1);
    const [mx, my] = w.movePlatform(this, this.box, tx - this.box.x, ty - this.box.y);
    const moved = Math.hypot(mx, my);
    this.s += Math.sign(s1 - this.s) * moved;
  }
  save() {
    return [this.box.x, this.box.y, this.s, this.riders];
  }
  load(s: unknown) {
    [this.box.x, this.box.y, this.s, this.riders] = s as number[];
  }
}

export function build(lv: Level): Thing[] {
  return groups(lv, 'L').map((cells, i) => {
    const r = bounds(cells);
    const d = lv.json.lifts?.[i];
    const pts = d?.path?.length ? d.path : [[r.x, r.y] as [number, number]];
    return new Lift(r, d?.n ?? 1, new Path(pts, false));
  });
}
