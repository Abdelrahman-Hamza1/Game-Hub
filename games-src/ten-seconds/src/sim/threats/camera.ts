/** Cameras: fixed, sweeping between two angles; a shutter blinds one for 3 s. */
import { CAM_HALF, CAM_LEN, HZ } from '../constants';
import { inCone } from '../vision';
import type { Caught, World } from '../world';

export interface CameraState {
  angle: number;
  blindUntil: number;
}

export function updateCamera(w: World, c: CameraState, i: number): void {
  const def = w.lv.cameras[i];
  const k = 0.5 - 0.5 * Math.cos((w.t / HZ / def.period + def.phase) * Math.PI * 2);
  c.angle = def.from + (def.to - def.from) * k;
}

export function cameraBlind(w: World, c: CameraState): boolean {
  return w.t < c.blindUntil;
}

export function cameraDetect(w: World, c: CameraState, i: number): Caught | null {
  if (cameraBlind(w, c)) return null;
  const def = w.lv.cameras[i];
  const ox = def.x + 0.5;
  const oy = def.y + 0.5;
  for (const a of w.actors) {
    if (inCone(w, ox, oy, c.angle, CAM_HALF, CAM_LEN, a.x, a.y)) return { by: 'camera', index: i, actor: a.idx, t: w.t, x0: ox, y0: oy, x1: a.x, y1: a.y };
  }
  return null;
}
