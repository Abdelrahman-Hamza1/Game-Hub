/** Moving platforms (`M`): through their path's points and back to the first, forever. */
import { DT, EPS } from '../constants';
import { bounds, groups, type Level, type Rect } from '../level';
import type { Thing } from '../types';
import type { World } from '../world';
import { Path } from './path';

export class Mover implements Thing {
  kind = 'mover';
  dx = 0;
  dy = 0;
  s = 0;
  readonly box: Rect;
  constructor(
    r: Rect,
    readonly speed: number,
    readonly path: Path,
  ) {
    this.box = { ...r };
  }
  boxes() {
    return [this.box];
  }
  move(w: World): void {
    if (this.path.total < EPS) return;
    let s1 = this.s + this.speed * DT;
    if (s1 >= this.path.total) s1 -= this.path.total;
    const [tx, ty] = this.path.at(s1);
    const want = Math.hypot(tx - this.box.x, ty - this.box.y);
    const [mx, my] = w.movePlatform(this, this.box, tx - this.box.x, ty - this.box.y);
    // blocked part of the way: stay where it got to
    if (want > EPS && Math.hypot(mx, my) < want - 1e-4) {
      this.s = Math.min(this.path.total, this.s + Math.hypot(mx, my));
      return;
    }
    this.s = s1;
  }
  save() {
    return [this.box.x, this.box.y, this.s];
  }
  load(s: unknown) {
    [this.box.x, this.box.y, this.s] = s as number[];
  }
}

export function build(lv: Level): Thing[] {
  return groups(lv, 'M').map((cells, i) => {
    const r = bounds(cells);
    const d = lv.json.movers?.[i];
    const pts = d?.path?.length ? d.path : [[r.x, r.y] as [number, number]];
    return new Mover(r, d?.speed ?? 2, new Path(pts, true));
  });
}
