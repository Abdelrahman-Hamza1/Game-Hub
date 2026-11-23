/**
 * Buttons (`o`): solid knobs. A player touching one, or a thrown or pushed crate or key, presses it.
 * `toggle` flips on each new press; `hold: s` stays on for s seconds after the last touch;
 * neither: on while touched.
 */
import { HZ, TOUCH } from '../constants';
import type { Level } from '../level';
import type { Body, Thing } from '../types';
import type { World } from '../world';

export class Button implements Thing {
  kind = 'button';
  dx = 0;
  dy = 0;
  on = false;
  timer = 0;
  touched = false;
  constructor(
    readonly x: number,
    readonly y: number,
    readonly wires: string[],
    readonly hold: number,
    readonly toggle: boolean,
  ) {}
  boxes() {
    return []; // the knob is a static tile
  }
  private presses(b: Body): boolean {
    if (b.gone || b.lost || b.carrier) return false;
    if (b.kind === 'player') return true;
    if (b.kind === 'crate' || b.kind === 'key') return Math.abs(b.vx) > 0.01 || Math.abs(b.vy) > 0.01;
    return false;
  }
  update(w: World): void {
    let touched = false;
    for (const b of w.bodies) {
      if (!this.presses(b)) continue;
      if (b.x < this.x + 1 + TOUCH && b.x + b.w > this.x - TOUCH && b.y < this.y + 1 + TOUCH && b.y + b.h > this.y - TOUCH) {
        touched = true;
        break;
      }
    }
    const was = this.on;
    if (this.toggle) {
      if (touched && !this.touched) this.on = !this.on;
    } else if (this.hold > 0) {
      if (touched) this.timer = Math.round(this.hold * HZ);
      else if (this.timer > 0) this.timer--;
      this.on = this.timer > 0;
    } else this.on = touched;
    if (touched && !this.touched) w.emit('button', this.x + 0.5, this.y + 0.5, -1, this.on);
    else if (was !== this.on) w.emit('button', this.x + 0.5, this.y + 0.5, -1, this.on);
    this.touched = touched;
    w.setPower(this.wires, this.on);
  }
  save() {
    return [this.on ? 1 : 0, this.timer, this.touched ? 1 : 0];
  }
  load(s: unknown) {
    const [on, t, tc] = s as number[];
    this.on = !!on;
    this.timer = t;
    this.touched = !!tc;
  }
}

export function build(lv: Level): Thing[] {
  const out: Thing[] = [];
  let i = 0;
  for (let y = 0; y < lv.h; y++) {
    for (let x = 0; x < lv.w; x++) {
      if (lv.rows[y][x] !== 'o') continue;
      const d = lv.json.buttons?.[i++];
      out.push(new Button(x, y, d?.wires ?? [], d?.hold ?? 0, !!d?.toggle));
    }
  }
  return out;
}
