/**
 * Scripted solutions: per loop, a list of steps a bot performs through the real simulation.
 *
 *   go(x, y)     walk to the centre of tile (x, y), pathing round walls (doors count as open, so
 *                a closed door on the way means waiting at it)
 *   at(x, y)     walk to an exact point (pathing like go)
 *   to(x, y)     walk in a straight line to the centre of tile (x, y), no pathing
 *   wait(s)      stand still for s seconds
 *   until(s)     stand still until the loop clock reads s seconds
 *   use()        press Use once
 *   face(deg)    turn to face a direction without moving (0 = right, 90 = down)
 *   inCar(k,x,y) walk straight to tile (x, y) of carriage k as drawn; the target rides the train
 */
import { COLLIDE_R, HZ, SPEED } from '../sim/constants';
import { Tile, type Level } from '../sim/level';
import type { LiveInput } from '../sim/actors';
import type { World } from '../sim/world';

export type Step =
  | { kind: 'go'; x: number; y: number; plan: boolean }
  | { kind: 'car'; k: number; x: number; y: number }
  | { kind: 'wait'; s: number }
  | { kind: 'until'; s: number }
  | { kind: 'use' }
  | { kind: 'face'; deg: number };

export interface Solution {
  /** one list of steps per loop, in recording order (the last loop is the winning one) */
  loops: Step[][];
  /** optional notes on the intended plan */
  note?: string;
}

export const go = (x: number, y: number): Step => ({ kind: 'go', x: x + 0.5, y: y + 0.5, plan: true });
export const at = (x: number, y: number): Step => ({ kind: 'go', x, y, plan: true });
export const to = (x: number, y: number): Step => ({ kind: 'go', x: x + 0.5, y: y + 0.5, plan: false });
export const wait = (s: number): Step => ({ kind: 'wait', s });
export const until = (s: number): Step => ({ kind: 'until', s });
export const use = (): Step => ({ kind: 'use' });
export const face = (deg: number): Step => ({ kind: 'face', deg });
/** walk straight to tile (x, y) of carriage k, as it was drawn (the target moves with the train) */
export const inCar = (k: number, x: number, y: number): Step => ({ kind: 'car', k, x, y });

const ZERO: LiveInput = { dx: 0, dy: 0, use: false };

/** Turns a step list into per-tick input by watching the world. */
export class Bot {
  private i = 0;
  private t0 = -1;
  private route: [number, number][] | null = null;
  private ri = 0;

  constructor(private readonly steps: Step[], private readonly lv: Level) {}

  get done(): boolean {
    return this.i >= this.steps.length;
  }

  input(w: World): LiveInput {
    const a = w.live;
    if (!a) return ZERO;
    for (let guard = 0; guard < 8 && this.i < this.steps.length; guard++) {
      const s = this.steps[this.i];
      if (this.t0 < 0) this.t0 = w.t;
      switch (s.kind) {
        case 'wait':
          if (w.t - this.t0 < Math.round(s.s * HZ)) return ZERO;
          break;
        case 'until':
          if (w.t < Math.round(s.s * HZ)) return ZERO;
          break;
        case 'use':
          this.next();
          return { dx: 0, dy: 0, use: true };
        case 'car': {
          const tx = s.x + 0.5 + (w.offs[s.k] ?? 0);
          const ty = s.y + 0.5;
          const dx = tx - a.x;
          const dy = ty - a.y;
          const d = Math.hypot(dx, dy);
          if (d >= 1e-3) {
            const m = Math.min(1, d / SPEED);
            return { dx: (dx / d) * m, dy: (dy / d) * m, use: false };
          }
          break;
        }
        case 'face':
          this.next();
          return { dx: Math.cos((s.deg * Math.PI) / 180) * 1e-3, dy: Math.sin((s.deg * Math.PI) / 180) * 1e-3, use: false };
        case 'go': {
          if (!this.route) {
            this.route = s.plan ? planRoute(this.lv, a.x, a.y, s.x, s.y) : [[s.x, s.y]];
            this.ri = 0;
          }
          while (this.ri < this.route.length) {
            const [tx, ty] = this.route[this.ri];
            const last = this.ri === this.route.length - 1;
            const dx = tx - a.x;
            const dy = ty - a.y;
            const d = Math.hypot(dx, dy);
            if (last ? d < 1e-4 : d < 0.3) {
              this.ri++;
              continue;
            }
            const m = last ? Math.min(1, d / SPEED) : 1;
            return { dx: (dx / d) * m, dy: (dy / d) * m, use: false };
          }
          break;
        }
      }
      this.next();
    }
    return ZERO;
  }

  private next(): void {
    this.i++;
    this.t0 = -1;
    this.route = null;
  }
}

/** A walking route on the static map (doors open, low walls and windows solid), smoothed. */
export function planRoute(lv: Level, ax: number, ay: number, bx: number, by: number): [number, number][] {
  const W = lv.w;
  const H = lv.h;
  const ok = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const t = lv.tiles[y * W + x];
    return t === Tile.Floor || t === Tile.Door;
  };
  const start = Math.floor(ay) * W + Math.floor(ax);
  const goal = Math.floor(by) * W + Math.floor(bx);
  const dist = new Float64Array(W * H).fill(Infinity);
  const prev = new Int32Array(W * H).fill(-1);
  dist[start] = 0;
  const open = [start];
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (dist[open[k]] < dist[open[bi]]) bi = k;
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) break;
    const cx = cur % W;
    const cy = (cur - cx) / W;
    for (const [dx, dy, c] of [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, Math.SQRT2],
      [1, -1, Math.SQRT2],
      [-1, 1, Math.SQRT2],
      [-1, -1, Math.SQRT2],
    ]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!ok(nx, ny)) continue;
      if (dx && dy && (!ok(cx + dx, cy) || !ok(cx, cy + dy))) continue;
      const n = ny * W + nx;
      const nd = dist[cur] + c;
      if (nd < dist[n] - 1e-9) {
        if (!isFinite(dist[n])) open.push(n);
        dist[n] = nd;
        prev[n] = cur;
      }
    }
  }
  if (!isFinite(dist[goal])) return [[bx, by]];
  const tiles: [number, number][] = [];
  for (let c = goal; c !== start && c >= 0; c = prev[c]) tiles.unshift([(c % W) + 0.5, Math.floor(c / W) + 0.5]);
  if (tiles.length) tiles[tiles.length - 1] = [bx, by];
  else tiles.push([bx, by]);
  // smooth: skip points while a straight walk stays clear
  const out: [number, number][] = [];
  let ox = ax;
  let oy = ay;
  let i = 0;
  while (i < tiles.length) {
    let j = tiles.length - 1;
    while (j > i && !clearWalk(lv, ox, oy, tiles[j][0], tiles[j][1], ok)) j--;
    out.push(tiles[j]);
    [ox, oy] = tiles[j];
    i = j + 1;
  }
  return out;
}

function clearWalk(lv: Level, ax: number, ay: number, bx: number, by: number, ok: (x: number, y: number) => boolean): boolean {
  const r = COLLIDE_R + 0.06;
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 8) + 1;
  for (let i = 0; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n;
    const y = ay + ((by - ay) * i) / n;
    for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) {
      for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
        if (ok(tx, ty)) continue;
        const px = Math.max(tx, Math.min(x, tx + 1));
        const py = Math.max(ty, Math.min(y, ty + 1));
        if ((x - px) ** 2 + (y - py) ** 2 < r * r) return false;
      }
    }
  }
  void lv;
  return true;
}
