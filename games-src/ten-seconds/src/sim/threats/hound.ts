/**
 * The Hound can't see. It follows the trail of the most recently recorded copy, 2 s behind, at
 * 6 tiles/s, and catches anyone it touches. With no copies yet it sleeps. When its copy freezes in
 * a paradox the trail ends there, and the Hound stops 2 s short of it.
 */
import { BODY_R, HOUND_DELAY, HOUND_R, HOUND_SPEED } from '../constants';
import type { Pt } from '../level';
import { findPath } from '../path';
import type { Caught, World } from '../world';

export interface HoundState {
  x: number;
  y: number;
  px: number;
  py: number;
  face: number;
  phase: 'sleep' | 'approach' | 'trail';
  path: [number, number][];
  pathI: number;
  /** index into the followed actor's trail */
  cursor: number;
  /** the actor followed */
  target: number;
}

export function initHound(w: World, spawn: Pt): HoundState {
  const x = spawn[0] + 0.5;
  const y = spawn[1] + 0.5;
  const h: HoundState = { x, y, px: x, py: y, face: Math.PI / 2, phase: 'sleep', path: [], pathI: 0, cursor: 0, target: w.newest };
  if (w.newest >= 0) {
    const sx = w.lv.start[0] + 0.5;
    const sy = w.lv.start[1] + 0.5;
    h.path = findPath(w, x, y, sx, sy) ?? [[sx, sy]];
    h.phase = 'approach';
  }
  return h;
}

export function updateHound(w: World, h: HoundState): void {
  h.px = h.x;
  h.py = h.y;
  let budget = HOUND_SPEED;
  if (h.phase === 'approach') {
    while (budget > 1e-9 && h.pathI < h.path.length) {
      const [tx, ty] = h.path[h.pathI];
      budget = moveToward(w, h, tx, ty, budget);
      if (budget < 0) return; // blocked by a door
      if (Math.hypot(tx - h.x, ty - h.y) < 1e-6) h.pathI++;
    }
    if (h.pathI >= h.path.length) h.phase = 'trail';
  }
  if (h.phase !== 'trail') return;
  const a = w.actors[h.target];
  const end = a.state === 'paradox' ? Math.min(w.t, a.paradoxAt) : w.t;
  const limit = end - HOUND_DELAY;
  while (budget > 1e-9 && h.cursor < limit) {
    const tx = a.trailX[h.cursor + 1];
    const ty = a.trailY[h.cursor + 1];
    budget = moveToward(w, h, tx, ty, budget);
    if (budget < 0) return;
    if (Math.hypot(tx - h.x, ty - h.y) < 1e-6) h.cursor++;
  }
}

/** Move up to `budget` toward a point; returns budget left, or -1 if a closed door is in the way. */
function moveToward(w: World, h: HoundState, tx: number, ty: number, budget: number): number {
  const dx = tx - h.x;
  const dy = ty - h.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9) return budget;
  const s = Math.min(budget, d);
  const nx = h.x + (dx / d) * s;
  const ny = h.y + (dy / d) * s;
  if (w.doorClosedAt(Math.floor(nx), Math.floor(ny))) return -1;
  h.face = Math.atan2(dy, dx);
  h.x = s >= d ? tx : nx;
  h.y = s >= d ? ty : ny;
  return budget - s;
}

export function houndDetect(w: World, h: HoundState, i: number): Caught | null {
  if (h.phase === 'sleep') return null;
  for (const a of w.actors) {
    if (Math.hypot(a.x - h.x, a.y - h.y) < HOUND_R + BODY_R - 0.1) return { by: 'hound', index: i, actor: a.idx, t: w.t, x0: h.x, y0: h.y, x1: a.x, y1: a.y };
  }
  return null;
}
