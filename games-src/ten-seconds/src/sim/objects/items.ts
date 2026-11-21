/** Use, carried items, windows and coins. */
import { COIN_RANGE, COIN_SPEED, DROP_COOLDOWN, HZ, PLATE_MARGIN, SHUTTER_TICKS, WINDOW_REACH } from '../constants';
import { Tile } from '../level';
import { nearestTile, tryCrouch } from '../actors';
import { hearNoise } from '../threats/guard';
import type { Actor, World } from '../world';

/** The trigger whose tile this point stands on (with a small margin), or -1. */
export function triggerUnder(w: World, x: number, y: number): number {
  const lv = w.lv;
  for (let ty = Math.floor(y - PLATE_MARGIN); ty <= Math.floor(y + PLATE_MARGIN); ty++) {
    for (let tx = Math.floor(x - PLATE_MARGIN); tx <= Math.floor(x + PLATE_MARGIN); tx++) {
      if (tx < 0 || ty < 0 || tx >= lv.w || ty >= lv.h) continue;
      const g = lv.triggerAt[ty * lv.w + tx];
      if (g >= 0) return g;
    }
  }
  return -1;
}

/**
 * Use, in priority order: press the switch/button/lure/shutter underfoot; pass the carried item
 * through an adjacent window; throw a coin; drop the item; crouch at an adjacent low wall.
 */
export function useAction(w: World, a: Actor): void {
  const g = triggerUnder(w, a.x, a.y);
  if (g >= 0 && pressTrigger(w, a, g)) return;
  if (a.carry >= 0) {
    if (passThroughWindow(w, a)) return;
    if (w.items[a.carry].kind === 'coin') {
      throwCoin(w, a);
      return;
    }
    drop(w, a);
    return;
  }
  tryCrouch(w, a);
}

function pressTrigger(w: World, a: Actor, g: number): boolean {
  const def = w.lv.triggers[g];
  const st = w.triggers[g];
  switch (def.type) {
    case 'switch':
      st.on = !st.on;
      w.emit('press', a.idx, a.x, a.y, g, st.on ? 1 : 0);
      return true;
    case 'button':
      st.until = w.t + Math.round(def.seconds * HZ);
      w.emit('press', a.idx, a.x, a.y, g, 1);
      return true;
    case 'lure':
      w.emit('press', a.idx, a.x, a.y, g, 1);
      if (def.bell) {
        const bx = def.bell[0] + 0.5;
        const by = def.bell[1] + 0.5;
        w.emit('bell', a.idx, bx, by, g);
        for (const gs of w.guards) hearNoise(w, gs, bx, by);
      }
      return true;
    case 'shutter': {
      const cam = w.cameras[def.camera];
      if (cam) cam.blindUntil = w.t + SHUTTER_TICKS;
      w.emit('press', a.idx, a.x, a.y, g, 1);
      w.emit('shutter', a.idx, a.x, a.y, def.camera);
      return true;
    }
    default:
      return false; // plates and levers are held, not pressed
  }
}

function drop(w: World, a: Actor): void {
  const i = a.carry;
  const it = w.items[i];
  it.carrier = -1;
  it.x = a.x;
  it.y = a.y;
  it.noPick = a.idx;
  it.noPickUntil = w.t + DROP_COOLDOWN;
  it.mustLeave = true;
  a.carry = -1;
  w.emit('drop', a.idx, a.x, a.y, i);
}

function passThroughWindow(w: World, a: Actor): boolean {
  const win = nearestTile(w, a.x, a.y, Tile.Window, WINDOW_REACH);
  if (!win) return false;
  const dx = win[0] + 0.5 - a.x;
  const dy = win[1] + 0.5 - a.y;
  let tx = win[0];
  let ty = win[1];
  if (Math.abs(dx) >= Math.abs(dy)) tx += Math.sign(dx) || 1;
  else ty += Math.sign(dy) || 1;
  if (w.solidFor(tx, ty, true)) return false;
  const i = a.carry;
  const it = w.items[i];
  it.carrier = -1;
  it.x = tx + 0.5;
  it.y = ty + 0.5;
  it.noPick = a.idx;
  it.noPickUntil = w.t + DROP_COOLDOWN;
  it.mustLeave = false;
  a.carry = -1;
  w.emit('pass', a.idx, a.x, a.y, i);
  return true;
}

function throwCoin(w: World, a: Actor): void {
  const i = a.carry;
  const it = w.items[i];
  const cx = Math.cos(a.face);
  const cy = Math.sin(a.face);
  // fly until just before something that stops it (walls, closed doors, crates); windows and low walls don't
  let d = 0;
  const step = 0.1;
  while (d + step <= COIN_RANGE) {
    const x = a.x + cx * (d + step);
    const y = a.y + cy * (d + step);
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const t = w.tileAt(tx, ty);
    if (t === Tile.Wall || t === Tile.Emitter || (t === Tile.Door && w.doorClosedAt(tx, ty))) break;
    if (w.crates.some((c) => Math.abs(c.x - x) < 0.45 && Math.abs(c.y - y) < 0.45)) break;
    d += step;
  }
  d = Math.max(0, d - 0.15);
  const x1 = a.x + cx * d;
  const y1 = a.y + cy * d;
  it.carrier = -1;
  it.noPick = a.idx;
  it.noPickUntil = w.t + DROP_COOLDOWN;
  it.mustLeave = false;
  it.fly = { x0: a.x, y0: a.y, x1, y1, t0: w.t, t1: w.t + Math.max(1, Math.ceil(d / COIN_SPEED)), by: a.idx };
  a.carry = -1;
  w.emit('throw', a.idx, a.x, a.y, i);
}

/** Thrown coins move through the air; landing makes a noise guards come to check. */
export function landCoins(w: World): void {
  for (let i = 0; i < w.items.length; i++) {
    const it = w.items[i];
    const f = it.fly;
    if (!f) continue;
    const k = Math.min(1, (w.t + 1 - f.t0) / (f.t1 - f.t0));
    it.x = f.x0 + (f.x1 - f.x0) * k;
    it.y = f.y0 + (f.y1 - f.y0) * k;
    if (k >= 1) {
      it.fly = null;
      w.emit('land', f.by, it.x, it.y, i);
      for (const g of w.guards) hearNoise(w, g, it.x, it.y);
    }
  }
}
