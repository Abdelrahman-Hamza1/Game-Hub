/**
 * Gates (A, E, F, G, H): walls that open while any of their wires is powered (or close, with
 * `invert`). A closing gate pushes whatever stands in it out to the nearer side.
 */
import { EPS } from '../constants';
import { bounds, groups, type Level, type Rect } from '../level';
import type { Thing } from '../types';
import type { World } from '../world';

export const GATE_LETTERS = ['A', 'E', 'F', 'G', 'H'];

export class Gate implements Thing {
  kind = 'gate';
  dx = 0;
  dy = 0;
  open = false;
  /** 0 closed … 1 open, for drawing */
  anim = 0;
  constructor(
    readonly letter: string,
    readonly r: Rect,
    readonly invert: boolean,
  ) {}
  boxes() {
    return this.open ? [] : [this.r];
  }
  update(w: World): void {
    const open = !!w.power[this.letter] !== this.invert;
    if (open !== this.open) {
      this.open = open;
      w.emit('gate', this.r.x + this.r.w / 2, this.r.y + this.r.h / 2, -1, open);
      if (!open) this.clear(w);
    }
    this.anim += ((this.open ? 1 : 0) - this.anim) * 0.25;
  }
  /** push bodies out of the closing gate, toward the side their centre is on */
  private clear(w: World): void {
    const r = this.r;
    const sideways = r.h >= r.w;
    for (const b of w.bodies) {
      if (b.gone || b.lost || b.carrier || !b.solid) continue;
      if (!(b.x < r.x + r.w - EPS && b.x + b.w > r.x + EPS && b.y < r.y + r.h - EPS && b.y + b.h > r.y + EPS)) continue;
      // the nearer side first; if that side is blocked, the other one; never into something solid
      const spots: [number, number][] = sideways
        ? [[r.x - b.w, b.y], [r.x + r.w, b.y]]
        : [[b.x, r.y - b.h], [b.x, r.y + r.h]];
      const nearFirst = sideways ? b.x + b.w / 2 < r.x + r.w / 2 : b.y + b.h / 2 < r.y + r.h / 2;
      if (!nearFirst) spots.reverse();
      const [nx, ny] = spots.find(([x, y]) => w.boxFree(x, y, b.w, b.h, b)) ?? spots[0];
      b.dx += nx - b.x;
      b.dy += ny - b.y;
      b.x = nx;
      b.y = ny;
      w.placeCarried(b);
    }
  }
  save() {
    return this.open ? 1 : 0;
  }
  load(s: unknown) {
    this.open = !!s;
  }
}

export function build(lv: Level): Thing[] {
  const out: Thing[] = [];
  for (const letter of GATE_LETTERS) {
    for (const cells of groups(lv, letter)) {
      out.push(new Gate(letter, bounds(cells), !!lv.json.gates?.[letter]?.invert));
    }
  }
  return out;
}
