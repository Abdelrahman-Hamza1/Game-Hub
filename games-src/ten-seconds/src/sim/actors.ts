/**
 * The player and copies: movement, collision, crate pushing, replay with paradox checks, and the
 * per-tick actions (use, pick up). The live player and its later copy run the same code paths in
 * the same order, so a recording replays exactly.
 */
import { BODY_R, COLLIDE_R, CRATE_HALF, CRATE_PUSH, CROUCH_TICKS, LOWWALL_REACH, PICKUP_R, SPEED, VAULT_TICKS } from './constants';
import { Tile } from './level';
import { ACT_USE, pushFrame } from './recording';
import { useAction } from './objects/items';
import type { Actor, World } from './world';

export interface LiveInput {
  /** direction, magnitude ≤ 1 */
  dx: number;
  dy: number;
  /** Use was pressed this tick */
  use: boolean;
}

const EPS = 0.02;

export function stepLive(w: World, a: Actor, inp: LiveInput): void {
  const t = w.t;
  let act = 0;
  if (a.vaultUntil > t) {
    // vaulting: carried over the low wall, input ignored
    const k = Math.min(1, (t - a.vaultT0) / VAULT_TICKS);
    a.x = a.vaultFx + (a.vaultTx - a.vaultFx) * k;
    a.y = a.vaultFy + (a.vaultTy - a.vaultFy) * k;
  } else if (a.crouch > 0) {
    // crouched: holding still
  } else {
    let dx = inp.dx;
    let dy = inp.dy;
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    if (m > 1e-6) a.face = Math.atan2(dy, dx);
    if (m > 0) {
      let vx = dx * SPEED;
      let vy = dy * SPEED;
      if (crateAhead(w, a.x + vx, a.y + vy, vx, vy)) {
        vx *= CRATE_PUSH;
        vy *= CRATE_PUSH;
      }
      const nx = a.x + vx;
      const ny = a.y + vy;
      pushCrates(w, a.x, a.y, nx, ny);
      a.x = nx;
      a.y = ny;
      resolve(w, a);
    }
    if (inp.use) act |= ACT_USE;
  }
  if (a.crouch > 0) a.crouch--;
  pushFrame(a.rec, a.x, a.y, a.face, act);
  if (act & ACT_USE) useAction(w, a);
  afterMove(w, a);
}

export function stepCopy(w: World, a: Actor): void {
  if (a.state === 'paradox') return;
  const r = a.rec;
  const f = w.t - r.delay;
  if (f < 0) {
    a.state = 'wait';
    return;
  }
  if (f >= r.cut) {
    a.state = 'done';
    if (a.crouch > 0) a.crouch--;
    return;
  }
  a.state = 'active';
  const nx = r.xs[f];
  const ny = r.ys[f];
  const vaulting = a.vaultUntil > w.t;
  pushCrates(w, a.x, a.y, nx, ny);
  if (blockedAt(w, a, nx, ny, vaulting)) {
    a.state = 'paradox';
    a.paradoxAt = w.t;
    a.crouch = 0;
    w.emit('paradox', a.idx, a.x, a.y);
    return;
  }
  a.x = nx;
  a.y = ny;
  a.face = r.face[f];
  if (a.crouch > 0) a.crouch--;
  if (r.act[f] & ACT_USE) useAction(w, a);
  afterMove(w, a);
}

/** Pickups, vault starts and stones after an actor has moved and acted. */
function afterMove(w: World, a: Actor): void {
  const t = w.t;
  // a dropped item can be re-picked by its dropper once they've stepped away from it
  for (const it of w.items) {
    if (it.noPick === a.idx && it.mustLeave && Math.hypot(it.x - a.x, it.y - a.y) >= PICKUP_R) it.mustLeave = false;
  }
  if (a.carry < 0 && a.vaultUntil <= t) {
    for (let i = 0; i < w.items.length; i++) {
      const it = w.items[i];
      if (it.carrier >= 0 || it.fly) continue;
      if (it.noPick === a.idx && (t < it.noPickUntil || it.mustLeave)) continue;
      if (Math.hypot(it.x - a.x, it.y - a.y) < PICKUP_R) {
        it.carrier = a.idx;
        it.noPick = -1;
        it.mustLeave = false;
        a.carry = i;
        it.x = a.x;
        it.y = a.y;
        w.emit('pickup', a.idx, a.x, a.y, i);
        break;
      }
    }
  }
  if (a.vaultUntil <= t && a.crouch === 0) tryVault(w, a);
  if (a.live && !w.stoneTouched) {
    const tx = Math.floor(a.x);
    const ty = Math.floor(a.y);
    for (let y = ty - 1; y <= ty + 1; y++) {
      for (let x = tx - 1; x <= tx + 1; x++) {
        if (x < 0 || y < 0 || x >= w.lv.w || y >= w.lv.h || !w.lv.stoneAt[y * w.lv.w + x]) continue;
        if (Math.hypot(x + 0.5 - a.x, y + 0.5 - a.y) < BODY_R + 0.4) {
          w.stoneTouched = true;
          w.emit('stone', a.idx, x + 0.5, y + 0.5);
        }
      }
    }
  }
}

/** Crouch at an adjacent low wall (called from useAction). */
export function tryCrouch(w: World, a: Actor): boolean {
  const low = nearestTile(w, a.x, a.y, Tile.Low, LOWWALL_REACH);
  if (!low) return false;
  a.crouch = CROUCH_TICKS;
  a.crouchTx = low[0];
  a.crouchTy = low[1];
  w.emit('crouch', a.idx, a.x, a.y);
  return true;
}

/** Touching a crouched actor next to a low wall carries you over it. */
function tryVault(w: World, a: Actor): void {
  for (const c of w.actors) {
    if (c === a || c.crouch <= 0 || c.state === 'paradox') continue;
    if (Math.hypot(c.x - a.x, c.y - a.y) >= BODY_R * 2) continue;
    const lx = c.crouchTx + 0.5;
    const ly = c.crouchTy + 0.5;
    const ddx = lx - c.x;
    const ddy = ly - c.y;
    let nx = 0;
    let ny = 0;
    if (Math.abs(ddx) >= Math.abs(ddy)) nx = Math.sign(ddx);
    else ny = Math.sign(ddy);
    const tx = c.crouchTx + nx;
    const ty = c.crouchTy + ny;
    if (w.solidFor(tx, ty, false)) continue;
    a.vaultT0 = w.t;
    a.vaultUntil = w.t + VAULT_TICKS + 1;
    a.vaultFx = a.x;
    a.vaultFy = a.y;
    a.vaultTx = tx + 0.5;
    a.vaultTy = ty + 0.5;
    w.emit('vault', a.idx, a.x, a.y, c.idx);
    return;
  }
}

export function nearestTile(w: World, x: number, y: number, kind: Tile, reach: number): [number, number] | null {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  let best: [number, number] | null = null;
  let bestD = reach;
  for (let yy = ty - 2; yy <= ty + 2; yy++) {
    for (let xx = tx - 2; xx <= tx + 2; xx++) {
      if (w.tileAt(xx, yy) !== kind) continue;
      const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
      if (d <= bestD) {
        bestD = d;
        best = [xx, yy];
      }
    }
  }
  return best;
}

// ---------- collision ----------

/** Would a moving circle at (x, y) run head-on into a crate? (then the player slows to push it) */
function crateAhead(w: World, x: number, y: number, vx: number, vy: number): boolean {
  for (const c of w.crates) {
    if (!circleBox(x, y, COLLIDE_R, c.x, c.y, CRATE_HALF)) continue;
    if (Math.abs(vx) >= Math.abs(vy) ? Math.abs(c.y - y) < CRATE_HALF + COLLIDE_R * 0.5 : Math.abs(c.x - x) < CRATE_HALF + COLLIDE_R * 0.5) return true;
  }
  return false;
}

/** Push crates the moving circle (x0,y0)→(x1,y1) runs into, along its main axis, if they can move. */
export function pushCrates(w: World, x0: number, y0: number, x1: number, y1: number): void {
  const mx = x1 - x0;
  const my = y1 - y0;
  if (Math.abs(mx) < 1e-9 && Math.abs(my) < 1e-9) return;
  const alongX = Math.abs(mx) >= Math.abs(my);
  for (const c of w.crates) {
    if (!circleBox(x1, y1, COLLIDE_R, c.x, c.y, CRATE_HALF)) continue;
    let ox = 0;
    let oy = 0;
    if (alongX) {
      if (Math.abs(c.y - y1) >= CRATE_HALF + COLLIDE_R * 0.5) continue;
      ox = mx > 0 ? x1 + COLLIDE_R - (c.x - CRATE_HALF) : x1 - COLLIDE_R - (c.x + CRATE_HALF);
      if (mx > 0 ? ox <= 0 : ox >= 0) continue;
    } else {
      if (Math.abs(c.x - x1) >= CRATE_HALF + COLLIDE_R * 0.5) continue;
      oy = my > 0 ? y1 + COLLIDE_R - (c.y - CRATE_HALF) : y1 - COLLIDE_R - (c.y + CRATE_HALF);
      if (my > 0 ? oy <= 0 : oy >= 0) continue;
    }
    const nx = c.x + ox;
    const ny = c.y + oy;
    if (crateFree(w, c, nx, ny)) {
      c.x = nx;
      c.y = ny;
    }
  }
}

function crateFree(w: World, self: { x: number; y: number }, x: number, y: number): boolean {
  const h = CRATE_HALF;
  for (let ty = Math.floor(y - h); ty <= Math.floor(y + h - 1e-9); ty++) {
    for (let tx = Math.floor(x - h); tx <= Math.floor(x + h - 1e-9); tx++) {
      if (w.solidFor(tx, ty, false)) return false;
    }
  }
  for (const o of w.crates) {
    if (o === self) continue;
    if (Math.abs(o.x - x) < h * 2 && Math.abs(o.y - y) < h * 2) return false;
  }
  return true;
}

export function circleBox(cx: number, cy: number, r: number, bx: number, by: number, h: number): boolean {
  const px = Math.max(bx - h, Math.min(cx, bx + h));
  const py = Math.max(by - h, Math.min(cy, by + h));
  const dx = cx - px;
  const dy = cy - py;
  return dx * dx + dy * dy < r * r;
}

/** Would a copy at (x, y) be inside something solid? (paradox) */
export function blockedAt(w: World, a: Actor, x: number, y: number, vaulting: boolean): boolean {
  const r = COLLIDE_R - EPS;
  for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) {
    for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
      if (!w.solidFor(tx, ty, vaulting)) continue;
      if (circleBox(x, y, r, tx + 0.5, ty + 0.5, 0.5)) return true;
    }
  }
  for (const c of w.crates) if (circleBox(x, y, r, c.x, c.y, CRATE_HALF)) return true;
  if (w.lv.bodiesCollide) {
    for (const o of w.actors) {
      if (o === a) continue;
      if (Math.hypot(o.x - x, o.y - y) < (COLLIDE_R - EPS) * 2) return true;
    }
  }
  return false;
}

/** Push the live player out of walls, closed doors, crates (and bodies where they collide). */
export function resolve(w: World, a: Actor): void {
  const r = COLLIDE_R;
  const vaulting = a.vaultUntil > w.t;
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (let ty = Math.floor(a.y - r); ty <= Math.floor(a.y + r); ty++) {
      for (let tx = Math.floor(a.x - r); tx <= Math.floor(a.x + r); tx++) {
        if (!w.solidFor(tx, ty, vaulting)) continue;
        if (pushOut(a, tx + 0.5, ty + 0.5, 0.5, r)) moved = true;
      }
    }
    for (const c of w.crates) if (pushOut(a, c.x, c.y, CRATE_HALF, r)) moved = true;
    if (w.lv.bodiesCollide) {
      for (const o of w.actors) {
        if (o === a) continue;
        const dx = a.x - o.x;
        const dy = a.y - o.y;
        const d = Math.hypot(dx, dy);
        if (d < r * 2) {
          if (d < 1e-9) {
            a.y -= r * 2;
          } else {
            a.x = o.x + (dx / d) * r * 2;
            a.y = o.y + (dy / d) * r * 2;
          }
          moved = true;
        }
      }
    }
    if (!moved) return;
  }
}

/** Push a circle out of a box. True if it moved. */
function pushOut(a: { x: number; y: number }, bx: number, by: number, h: number, r: number): boolean {
  const px = Math.max(bx - h, Math.min(a.x, bx + h));
  const py = Math.max(by - h, Math.min(a.y, by + h));
  const dx = a.x - px;
  const dy = a.y - py;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    a.x = px + (dx / d) * r;
    a.y = py + (dy / d) * r;
    return true;
  }
  // centre inside the box: out along the shallowest side
  const l = a.x - (bx - h);
  const ri = bx + h - a.x;
  const u = a.y - (by - h);
  const dn = by + h - a.y;
  const m = Math.min(l, ri, u, dn);
  if (m === l) a.x = bx - h - r;
  else if (m === ri) a.x = bx + h + r;
  else if (m === u) a.y = by - h - r;
  else a.y = by + h + r;
  return true;
}

/** After a door closes on the live player: move them to the nearest spot that's free. */
export function unstick(w: World, a: Actor): void {
  if (!blockedAt(w, a, a.x, a.y, a.vaultUntil > w.t)) return;
  for (let ring = 1; ring <= 12; ring++) {
    const d = ring * 0.25;
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2;
      const x = a.x + Math.cos(ang) * d;
      const y = a.y + Math.sin(ang) * d;
      if (!blockedAt(w, a, x, y, false)) {
        a.x = x;
        a.y = y;
        return;
      }
    }
  }
}
