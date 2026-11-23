/** What a player does with their input: run, jump, grab, throw, the key, the door. */
import {
  AIR_ACCEL,
  BUFFER_TICKS,
  COYOTE_TICKS,
  DT,
  EPS,
  GRAB_REACH,
  GROUND_ACCEL,
  JUMP_CUT_V,
  JUMP_V,
  PUSH_SPEED,
  RUN_SPEED,
  THROW_VX,
  THROW_VY,
} from './constants';
import { T } from './level';
import { In, type Body } from './types';
import type { World } from './world';

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS && a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;

/** Step 1 of the tick: steering and jumping. */
export function playerControl(w: World, b: Body, inp: number): void {
  const st = b.p!;
  const pressed = inp & ~st.prev;
  if (st.pop > 0) {
    st.pop--;
    if (st.pop === 0) w.respawn(b);
    return;
  }
  if (st.inside) {
    if (pressed & In.Jump) {
      // step back out of the door
      const d = w.lv.door;
      st.inside = false;
      b.gone = false;
      b.x = d.x + (1 - b.w) / 2;
      b.y = d.y + 2 - b.h;
      b.vx = 0;
      b.vy = 0;
      w.emit('exit', b.x + b.w / 2, b.y + b.h, st.n);
    }
    return;
  }
  if (b.carrier) {
    if (pressed & In.Jump) {
      // wriggle free; a jump only if whoever holds you is standing on something
      const c = b.carrier;
      c.carrying = null;
      b.carrier = null;
      b.vx = 0;
      b.vy = c.supported ? -JUMP_V : 0;
      st.jumpHeld = true;
      w.emit('jump', b.x + b.w / 2, b.y + b.h, st.n);
    }
    return;
  }
  const dir = (inp & In.Right ? 1 : 0) - (inp & In.Left ? 1 : 0);
  if (dir) st.face = dir as 1 | -1;
  if (!st.thrown) {
    const target = dir * (st.pushing ? PUSH_SPEED : RUN_SPEED);
    const acc = (b.support ? GROUND_ACCEL : AIR_ACCEL) * DT;
    if (b.vx < target) b.vx = Math.min(target, b.vx + acc);
    else if (b.vx > target) b.vx = Math.max(target, b.vx - acc);
  }
  if (pressed & In.Jump) st.buffer = BUFFER_TICKS;
  else if (st.buffer > 0) st.buffer--;
  // you can only jump off something that's standing on something (DESIGN.md "Decisions")
  if (b.support && b.supported) st.coyote = COYOTE_TICKS;
  else if (b.support) st.coyote = 0; // on a friend who's in the air: no jump at all
  else if (st.coyote > 0) st.coyote--;
  if (st.buffer > 0 && st.coyote > 0 && !st.thrown) {
    b.vy = -JUMP_V;
    st.buffer = 0;
    st.coyote = 0;
    st.jumpHeld = true;
    b.support = null;
    w.emit('jump', b.x + b.w / 2, b.y + b.h, st.n);
  }
  if (st.jumpHeld && !(inp & In.Jump)) {
    st.jumpHeld = false;
    if (b.vy < -JUMP_CUT_V) b.vy = -JUMP_CUT_V;
  }
  if (b.vy >= 0) st.jumpHeld = false;
}

/** Step 6 of the tick: grabs, the key, the door, spikes, pits, flags. */
export function playerAfter(w: World, b: Body, inp: number): void {
  const st = b.p!;
  const pressed = inp & ~st.prev;
  st.prev = inp;
  if (st.pop > 0 || st.inside || b.carrier) return;
  const lv = w.lv;

  // pits and spikes
  if (b.y > lv.h + 1) return w.popPlayer(b);
  for (let ty = Math.floor(b.y); ty <= Math.floor(b.y + b.h - EPS); ty++) {
    for (let tx = Math.floor(b.x); tx <= Math.floor(b.x + b.w - EPS); tx++) {
      const t = w.tileAt(tx, ty);
      if (t === T.SpikeUp && overlaps(b, { x: tx + 0.1, y: ty + 0.5, w: 0.8, h: 0.5 })) return w.popPlayer(b);
      if (t === T.SpikeDown && overlaps(b, { x: tx + 0.1, y: ty, w: 0.8, h: 0.5 })) return w.popPlayer(b);
    }
  }
  if (lv.json.scroll && b.x + b.w < w.cam.scrollX) return w.popPlayer(b);

  // the key jumps into empty hands
  const k = w.key;
  if (!b.carrying && !k.carrier && !k.gone && !k.lost && overlaps(b, k)) {
    attach(w, b, k);
    w.emit('key', k.x + k.w / 2, k.y, st.n);
  }

  if (pressed & In.Grab) {
    if (b.carrying) letGo(w, b, !!(inp & In.Down));
    else grab(w, b, !!(inp & In.Down));
  }

  // the door: the key opens it; Down steps in
  const door = lv.door;
  if (!w.doorOpen && b.carrying === k && overlaps(b, door)) {
    w.doorOpen = true;
    b.carrying = null;
    k.carrier = null;
    k.gone = true;
    w.emit('open', door.x + 0.5, door.y + 1, st.n);
  }
  if (w.doorOpen && pressed & In.Down && !(pressed & In.Grab) && overlaps(b, door)) {
    if (b.carrying) w.releaseCarried(b, false);
    st.inside = true;
    b.gone = true;
    b.vx = 0;
    b.vy = 0;
    w.emit('enter', door.x + 0.5, door.y + 2, st.n);
  }

  // flags: a flag becomes the respawn point the moment someone steps onto it (standing on one
  // doesn't keep claiming it, so two players on two flags can't flip it back and forth)
  let touching = -1;
  for (let ty = Math.floor(b.y); ty <= Math.floor(b.y + b.h - EPS) && touching < 0; ty++) {
    for (let tx = Math.floor(b.x); tx <= Math.floor(b.x + b.w - EPS); tx++) {
      if (ty < 0 || ty >= lv.h || tx < 0 || tx >= lv.w || lv.rows[ty][tx] !== 'C') continue;
      touching = ty * lv.w + tx;
      break;
    }
  }
  if (touching >= 0 && touching !== st.onFlag) {
    const tx = touching % lv.w;
    const ty = (touching - tx) / lv.w;
    if (!w.flag || w.flag[0] !== tx || w.flag[1] !== ty) {
      w.flag = [tx, ty];
      w.emit('flag', tx + 0.5, ty + 1, st.n);
    }
  }
  st.onFlag = touching;
}

function attach(w: World, b: Body, c: Body): void {
  b.carrying = c;
  c.carrier = b;
  c.vx = 0;
  c.vy = 0;
  if (c.p) {
    c.p.thrown = false;
    c.p.buffer = 0;
  }
  w.placeCarried(b);
}

/** Grab what's beside you. Down+Grab instead takes the key (or lantern) off a friend's head. */
function grab(w: World, b: Body, down: boolean): void {
  const st = b.p!;
  let best: Body | null = null;
  let bestScore = Infinity;
  for (const c of w.bodies) {
    if (c === b || !c.grabbable || c.gone || c.lost) continue;
    // the key and the lantern can be taken from a friend's head; nothing else can
    const from = c.carrier;
    if (from && !(down && (c.kind === 'key' || c.kind === 'lantern') && from.kind === 'player' && from !== b)) continue;
    if (down && !from) continue;
    if (from) {
      const near = from.x < b.x + b.w + GRAB_REACH && from.x + from.w > b.x - GRAB_REACH && Math.min(from.y + from.h, b.y + b.h) - Math.max(from.y, b.y) > 0.2;
      if (!near) continue;
      const score = Math.abs(from.x - b.x);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
      continue;
    }
    if (c.kind === 'player' && (c.carrying?.kind === 'player' || c.p!.inside)) continue;
    if (b.support && b.support.body === c) continue; // not the friend you stand on
    if (c.support && c.support.body === b) continue; // nor the one on your head
    const reachX = c.x < b.x + b.w + GRAB_REACH && c.x + c.w > b.x - GRAB_REACH;
    const ovY = Math.min(c.y + c.h, b.y + b.h) - Math.max(c.y, b.y);
    if (!reachX || ovY < 0.2) continue;
    const cx = c.x + c.w / 2 - (b.x + b.w / 2);
    // prefer what's in front of you
    const score = Math.abs(cx) + (Math.sign(cx) === st.face || Math.abs(cx) < 0.3 ? 0 : 5);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best) return;
  if (best.carrier) {
    // take it off their head
    best.carrier.carrying = null;
    best.carrier = null;
  }
  const [cx, cy] = w.carriedPos(b, best);
  if (best.solid && !w.boxFree(cx, cy, best.w, best.h, best)) return; // no headroom
  attach(w, b, best);
  w.emit('grab', b.x + b.w / 2, b.y, st.n);
}

function letGo(w: World, b: Body, down: boolean): void {
  const st = b.p!;
  const c = b.carrying!;
  w.releaseCarried(b, false);
  if (down) {
    // set it down in front of you if there's room
    const nx = st.face > 0 ? b.x + b.w + 0.01 : b.x - c.w - 0.01;
    const ny = b.y + b.h - c.h;
    if (!c.solid || w.boxFree(nx, ny, c.w, c.h, c)) {
      c.x = nx;
      c.y = ny;
    }
    w.emit('drop', c.x + c.w / 2, c.y + c.h, st.n);
    return;
  }
  if (!b.support || !b.supported) {
    // in the air you can only let go: no throwing from the top of a jump (DESIGN.md "Decisions")
    c.vx = b.vx;
    c.vy = b.vy;
    w.emit('drop', c.x + c.w / 2, c.y + c.h, st.n);
    return;
  }
  c.vx = st.face * THROW_VX;
  c.vy = -THROW_VY;
  if (c.p) c.p.thrown = true;
  w.emit('throw', b.x + b.w / 2, b.y, st.n);
}

/** Back from a pop: at the last flag (or your start), or above the teammate furthest behind. */
export function respawnPlayer(w: World, p: Body): void {
  const st = p.p!;
  const lv = w.lv;
  let bx: number;
  let by: number;
  const others = w.players.filter((o) => o !== p && !o.gone);
  if (lv.json.scroll && others.length) {
    const back = others.sort((a, c) => a.x - c.x)[0];
    bx = back.x;
    by = back.y - 2;
  } else if (w.flag) {
    bx = w.flag[0] + (st.n - 1.5) * 0.95 + (1 - p.w) / 2;
    by = w.flag[1] + 1 - p.h;
    if (lv.json.scroll) w.cam.scrollX = Math.max(0, Math.min(w.cam.scrollX, w.flag[0] - 4));
  } else {
    const [sx, sy] = lv.spawns[st.n];
    bx = sx + (1 - p.w) / 2;
    by = sy + 1 - p.h;
    if (lv.json.scroll) w.cam.scrollX = 0;
  }
  let spot = freeSpotNear(w, p, bx, by);
  if (!spot) {
    // nowhere near the team (a low tunnel): back at the last flag, or your start
    const [sx, sy] = w.flag ?? lv.spawns[st.n];
    spot = freeSpotNear(w, p, sx + (1 - p.w) / 2, sy + 1 - p.h) ?? [sx + (1 - p.w) / 2, sy + 1 - p.h];
  }
  [bx, by] = spot;
  p.x = bx;
  p.y = by;
  p.vx = 0;
  p.vy = 0;
  p.gone = false;
  st.pop = 0;
  st.thrown = false;
  w.emit('respawn', bx + p.w / 2, by + p.h, st.n);
}

/** The nearest clear spot inside the map: straight up first, then a little to either side. */
function freeSpotNear(w: World, p: Body, x: number, y: number): [number, number] | null {
  for (const dx of [0, -1, 1, -2, 2, -3, 3, -4, 4, -6, 6]) {
    for (let dy = 0; dy <= 12; dy++) {
      const nx = x + dx;
      const ny = y - dy;
      if (ny < 0 || nx < 0 || nx + p.w > w.lv.w) continue;
      if (w.boxFree(nx, ny, p.w, p.h, p)) return [nx, ny];
    }
  }
  return null;
}

