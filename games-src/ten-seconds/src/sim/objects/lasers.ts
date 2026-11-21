/** Laser beams run from their emitter to the next wall; a crate or a mirror carrier stops them. */
import { BODY_R, COLLIDE_R, CRATE_HALF, HZ } from '../constants';
import type { Dir } from '../level';
import { segBoxEnter } from '../vision';
import type { Caught, World } from '../world';

const DIRS: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export function laserOn(w: World, i: number): boolean {
  const d = w.lv.lasers[i];
  if (!d.period) return true;
  const p = d.period * HZ;
  const k = (((w.t + d.phase * HZ) % p) + p) % p;
  return k < d.on * HZ;
}

export function updateLasers(w: World): void {
  for (let i = 0; i < w.lasers.length; i++) {
    const d = w.lv.lasers[i];
    const L = w.lasers[i];
    const [dx, dy] = DIRS[d.dir];
    L.on = laserOn(w, i);
    const x0 = d.x + 0.5 + dx * 0.5;
    const y0 = d.y + 0.5 + dy * 0.5;
    // run to the next opaque tile
    let tx = d.x + dx;
    let ty = d.y + dy;
    let n = 0;
    while (!w.opaque(tx, ty) && n++ < 128) {
      tx += dx;
      ty += dy;
    }
    // the far edge of the last clear tile
    const fx = dx ? tx + 0.5 - dx * 0.5 : d.x + 0.5;
    const fy = dy ? ty + 0.5 - dy * 0.5 : d.y + 0.5;
    const len = Math.abs(fx - x0) + Math.abs(fy - y0);
    let cut = len;
    let by: 'crate' | 'mirror' | null = null;
    for (const c of w.crates) {
      const k = segBoxEnter(x0, y0, fx, fy, c.x, c.y, CRATE_HALF);
      if (k >= 0 && k * len < cut) {
        cut = k * len;
        by = 'crate';
      }
    }
    for (const it of w.items) {
      if (it.kind !== 'mirror' || it.carrier < 0) continue;
      const a = w.actors[it.carrier];
      // distance from the beam's line, and how far along it
      const along = (a.x - x0) * dx + (a.y - y0) * dy;
      const side = Math.abs((a.x - x0) * dy - (a.y - y0) * dx);
      if (side < BODY_R && along > -BODY_R && along - BODY_R < cut) {
        cut = Math.max(0, along - BODY_R);
        by = 'mirror';
      }
    }
    L.x0 = x0;
    L.y0 = y0;
    L.fx = fx;
    L.fy = fy;
    L.x1 = x0 + dx * cut;
    L.y1 = y0 + dy * cut;
    L.blockedBy = by;
  }
}

export function laserDetect(w: World): Caught | null {
  for (let i = 0; i < w.lasers.length; i++) {
    const L = w.lasers[i];
    if (!L.on) continue;
    const [dx, dy] = DIRS[w.lv.lasers[i].dir];
    const len = Math.abs(L.x1 - L.x0) + Math.abs(L.y1 - L.y0);
    for (const a of w.actors) {
      const along = (a.x - L.x0) * dx + (a.y - L.y0) * dy;
      const side = Math.abs((a.x - L.x0) * dy - (a.y - L.y0) * dx);
      if (side < COLLIDE_R && along > -COLLIDE_R && along < len + COLLIDE_R * 0.5) {
        const carriesMirror = a.carry >= 0 && w.items[a.carry].kind === 'mirror';
        if (carriesMirror) continue;
        return { by: 'laser', index: i, actor: a.idx, t: w.t, x0: L.x0, y0: L.y0, x1: a.x, y1: a.y };
      }
    }
  }
  return null;
}
