/**
 * Line of sight on the tile grid. Walls, emitters, closed doors and crates block sight; windows
 * and low walls don't. The tile the viewer stands in (a camera's own wall block) never blocks.
 */
import { CRATE_HALF } from './constants';
import type { World } from './world';
import { losClearTrain, rayLengthTrain } from './train';

/** Is the straight line a→b clear? Grid traversal (Amanatides–Woo), then crates. */
export function losClear(w: World, ax: number, ay: number, bx: number, by: number): boolean {
  if (w.offs.length) return losClearTrain(w, ax, ay, bx, by);
  let tx = Math.floor(ax);
  let ty = Math.floor(ay);
  const ex = Math.floor(bx);
  const ey = Math.floor(by);
  const dx = bx - ax;
  const dy = by - ay;
  const sx = dx > 0 ? 1 : -1;
  const sy = dy > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tmx = dx !== 0 ? (dx > 0 ? tx + 1 - ax : ax - tx) * tdx : Infinity;
  let tmy = dy !== 0 ? (dy > 0 ? ty + 1 - ay : ay - ty) * tdy : Infinity;
  for (let i = 0; i < 256 && (tx !== ex || ty !== ey); i++) {
    let tEnter: number;
    if (tmx < tmy) {
      tEnter = tmx;
      tmx += tdx;
      tx += sx;
    } else {
      tEnter = tmy;
      tmy += tdy;
      ty += sy;
    }
    if (tEnter >= 1) break;
    if ((tx !== ex || ty !== ey) && w.opaque(tx, ty)) return false;
  }
  for (const c of w.crates) if (segBoxEnter(ax, ay, bx, by, c.x, c.y, CRATE_HALF) >= 0) return false;
  return true;
}

/** Distance along a→b (0..1) to the first opaque tile or crate, for drawing cones. */
export function rayLength(w: World, ax: number, ay: number, ang: number, max: number): number {
  if (w.offs.length) return rayLengthTrain(w, ax, ay, ang, max);
  const bx = ax + Math.cos(ang) * max;
  const by = ay + Math.sin(ang) * max;
  let tx = Math.floor(ax);
  let ty = Math.floor(ay);
  const dx = bx - ax;
  const dy = by - ay;
  const sx = dx > 0 ? 1 : -1;
  const sy = dy > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tmx = dx !== 0 ? (dx > 0 ? tx + 1 - ax : ax - tx) * tdx : Infinity;
  let tmy = dy !== 0 ? (dy > 0 ? ty + 1 - ay : ay - ty) * tdy : Infinity;
  let hit = 1;
  for (let i = 0; i < 256; i++) {
    let tEnter: number;
    if (tmx < tmy) {
      tEnter = tmx;
      tmx += tdx;
      tx += sx;
    } else {
      tEnter = tmy;
      tmy += tdy;
      ty += sy;
    }
    if (tEnter >= 1) break;
    if (w.opaque(tx, ty)) {
      hit = tEnter;
      break;
    }
  }
  for (const c of w.crates) {
    const k = segBoxEnter(ax, ay, bx, by, c.x, c.y, CRATE_HALF);
    if (k >= 0 && k < hit) hit = k;
  }
  return hit * max;
}

/** Shortest signed angle from a to b. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Is point (x, y) inside the cone at (ox, oy) facing `face` with half-angle `half`, length `len`, in sight? */
export function inCone(w: World, ox: number, oy: number, face: number, half: number, len: number, x: number, y: number): boolean {
  const dx = x - ox;
  const dy = y - oy;
  const d2 = dx * dx + dy * dy;
  if (d2 > len * len) return false;
  if (Math.abs(angleDiff(face, Math.atan2(dy, dx))) > half) return false;
  return losClear(w, ox, oy, x, y);
}

/** Slab test: parameter where segment a→b enters the box, or -1 if it misses. */
export function segBoxEnter(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, h: number): number {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  if (Math.abs(dx) < 1e-12) {
    if (ax < cx - h || ax > cx + h) return -1;
  } else {
    let ta = (cx - h - ax) / dx;
    let tb = (cx + h - ax) / dx;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return -1;
  }
  if (Math.abs(dy) < 1e-12) {
    if (ay < cy - h || ay > cy + h) return -1;
  } else {
    let ta = (cy - h - ay) / dy;
    let tb = (cy + h - ay) / dy;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return -1;
  }
  return t0;
}
