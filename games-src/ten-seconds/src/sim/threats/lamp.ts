/**
 * The Clocktower's lit hall: a lamp lights a rectangle; a swinging pendulum casts the only shadow.
 * Anyone in the light and outside the shadow is seen (like a camera).
 */
import { HZ } from '../constants';
import type { Caught, World } from '../world';

export interface LampState {
  /** shadow centre */
  sx: number;
  sy: number;
}

export function updateLamps(w: World): void {
  w.lamps.forEach((s, i) => {
    const d = w.lv.lamps[i];
    const k = 0.5 - 0.5 * Math.cos((w.t / HZ / d.period) * Math.PI * 2);
    s.sx = d.from[0] + 0.5 + (d.to[0] - d.from[0]) * k;
    s.sy = d.from[1] + 0.5 + (d.to[1] - d.from[1]) * k;
  });
}

export function lit(w: World, i: number, x: number, y: number): boolean {
  const d = w.lv.lamps[i];
  const [x0, y0, x1, y1] = d.rect;
  if (x < x0 || y < y0 || x >= x1 + 1 || y >= y1 + 1) return false;
  const s = w.lamps[i];
  return Math.hypot(x - s.sx, y - s.sy) > d.radius;
}

export function lampDetect(w: World): Caught | null {
  for (let i = 0; i < w.lamps.length; i++) {
    for (const a of w.actors) {
      if (lit(w, i, a.x, a.y)) {
        const d = w.lv.lamps[i];
        return { by: 'lamp', index: i, actor: a.idx, t: w.t, x0: (d.rect[0] + d.rect[2] + 1) / 2, y0: d.rect[1], x1: a.x, y1: a.y };
      }
    }
  }
  return null;
}
