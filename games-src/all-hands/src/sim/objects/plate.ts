/** Plates (`_`): on while enough weight rests on them. A run of `_` is one plate. */
import { runs, type Level } from '../level';
import type { Thing } from '../types';
import type { World } from '../world';

export class Plate implements Thing {
  kind = 'plate';
  dx = 0;
  dy = 0;
  count = 0;
  on = false;
  constructor(
    readonly x: number,
    readonly y: number,
    readonly w: number,
    readonly n: number,
    readonly wires: string[],
  ) {}
  boxes() {
    return [];
  }
  update(w: World): void {
    // heights are measured from the tile under the plate
    this.count = w.weightOnRow(this.x, this.w, this.y + 1);
    const on = this.count >= this.n;
    if (on !== this.on) w.emit('plate', this.x + this.w / 2, this.y + 1, -1, on);
    this.on = on;
    w.setPower(this.wires, on);
  }
  save() {
    return [this.count, this.on ? 1 : 0];
  }
  load(s: unknown) {
    const [c, on] = s as [number, number];
    this.count = c;
    this.on = !!on;
  }
}

export function build(lv: Level): Thing[] {
  return runs(lv, '_').map((r, i) => {
    const def = lv.json.plates?.[i];
    return new Plate(r.x, r.y, r.w, def?.n ?? 1, def?.wires ?? []);
  });
}
