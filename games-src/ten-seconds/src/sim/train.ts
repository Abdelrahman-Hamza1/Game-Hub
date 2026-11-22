/**
 * The Night Train: carriages that slide along x on a schedule. Only levels with carriages use
 * this module; every other level keeps the plain tile-grid code paths (and their exact results).
 *
 * Geometry at a world point is the carriage's own tile when the point is inside a carriage,
 * else the static map, where track is solid underfoot but transparent to sight.
 */
import { CRATE_HALF, HZ } from './constants';
import { Tile, type CarriageDef } from './level';
import type { World } from './world';

/** Offset in tiles of a carriage at a tick (keyframes are [seconds, offset]). */
export function carriageOffset(c: CarriageDef, tick: number): number {
  const s = tick / HZ;
  const p = c.path;
  if (s <= p[0][0]) return p[0][1];
  for (let i = 0; i + 1 < p.length; i++) {
    const [t0, x0] = p[i];
    const [t1, x1] = p[i + 1];
    if (s <= t1) return t1 > t0 ? x0 + ((x1 - x0) * (s - t0)) / (t1 - t0) : x1;
  }
  return p[p.length - 1][1];
}

/** Which carriage (index) contains the world point, or -1. */
export function carriageAtPoint(w: World, x: number, y: number): number {
  const cs = w.lv.carriages;
  for (let k = 0; k < cs.length; k++) {
    const [x0, y0, x1, y1] = cs[k].rect;
    const o = w.offs[k];
    if (y >= y0 && y < y1 + 1 && x >= x0 + o && x < x1 + 1 + o) return k;
  }
  return -1;
}

/** The tile code at a world point, and the map tile it came from (for door/trigger lookups). */
export function tileAtPoint(w: World, x: number, y: number): { t: number; mx: number; my: number } {
  const k = carriageAtPoint(w, x, y);
  if (k >= 0) {
    const c = w.lv.carriages[k];
    const lx = Math.floor(x - w.offs[k] - c.rect[0]);
    const ly = Math.floor(y - c.rect[1]);
    return { t: c.tiles[ly * c.w + lx], mx: c.rect[0] + lx, my: c.rect[1] + ly };
  }
  const mx = Math.floor(x);
  const my = Math.floor(y);
  return { t: w.tileAt(mx, my), mx, my };
}

export function opaqueAtPoint(w: World, x: number, y: number): boolean {
  // allocation-free: this runs for every sample of every sight line on train levels
  const lv = w.lv;
  const cs = lv.carriages;
  let t: number;
  let mx: number;
  let my: number;
  let k = -1;
  for (let i = 0; i < cs.length; i++) {
    const r = cs[i].rect;
    const o = w.offs[i];
    if (y >= r[1] && y < r[3] + 1 && x >= r[0] + o && x < r[2] + 1 + o) {
      k = i;
      break;
    }
  }
  if (k >= 0) {
    const c = cs[k];
    const lx = Math.floor(x - w.offs[k] - c.rect[0]);
    const ly = Math.floor(y - c.rect[1]);
    t = c.tiles[ly * c.w + lx];
    mx = c.rect[0] + lx;
    my = c.rect[1] + ly;
  } else {
    mx = Math.floor(x);
    my = Math.floor(y);
    t = w.tileAt(mx, my);
  }
  if (t === Tile.Wall || t === Tile.Emitter) return true;
  if (t === Tile.Door) return !w.doorOpen[lv.doorAt[my * lv.w + mx]];
  return false;
}

/** How far a map tile has moved (its carriage's offset, or 0). */
export function tileDX(w: World, mx: number, my: number): number {
  if (!w.lv.carriages.length || mx < 0 || my < 0 || mx >= w.lv.w || my >= w.lv.h) return 0;
  const k = w.lv.carriageAt[my * w.lv.w + mx];
  return k >= 0 ? w.offs[k] : 0;
}

function solidCode(w: World, t: number, mx: number, my: number, vaulting: boolean): boolean {
  if (t === Tile.Floor) return false;
  if (t === Tile.Door) return !w.doorOpen[w.lv.doorAt[my * w.lv.w + mx]];
  if (t === Tile.Low) return !vaulting;
  return true;
}

/**
 * Every solid box overlapping [x0,x1]×[y0,y1], as flat [cx, cy, hx, hy, …]: static tiles, the
 * parts of track tiles no carriage covers, and carriage tiles where they are now.
 */
const SPAN = new Float64Array(64);

export function solidBoxes(w: World, x0: number, y0: number, x1: number, y1: number, vaulting: boolean, out: number[]): void {
  out.length = 0;
  const lv = w.lv;
  for (let ty = Math.floor(y0); ty <= Math.floor(y1); ty++) {
    for (let tx = Math.floor(x0); tx <= Math.floor(x1); tx++) {
      const t = w.tileAt(tx, ty);
      if (t !== Tile.Track) {
        if (solidCode(w, t, tx, ty, vaulting)) out.push(tx + 0.5, ty + 0.5, 0.5, 0.5);
        continue;
      }
      // track: solid except where a carriage covers it
      let a = tx;
      const b = tx + 1;
      let n = 0;
      for (let k = 0; k < lv.carriages.length; k++) {
        const r = lv.carriages[k].rect;
        if (ty < r[1] || ty > r[3]) continue;
        const cx0 = r[0] + w.offs[k];
        const cx1 = r[2] + 1 + w.offs[k];
        if (cx1 <= tx || cx0 >= b) continue;
        SPAN[n * 2] = Math.max(tx, cx0);
        SPAN[n * 2 + 1] = Math.min(b, cx1);
        n++;
      }
      if (n === 0) {
        out.push(tx + 0.5, ty + 0.5, 0.5, 0.5);
        continue;
      }
      // a few spans at most: insertion sort by start
      for (let i = 1; i < n; i++) {
        for (let j = i; j > 0 && SPAN[j * 2] < SPAN[(j - 1) * 2]; j--) {
          const s0 = SPAN[j * 2];
          const s1 = SPAN[j * 2 + 1];
          SPAN[j * 2] = SPAN[(j - 1) * 2];
          SPAN[j * 2 + 1] = SPAN[(j - 1) * 2 + 1];
          SPAN[(j - 1) * 2] = s0;
          SPAN[(j - 1) * 2 + 1] = s1;
        }
      }
      for (let i = 0; i < n; i++) {
        const s0 = SPAN[i * 2];
        const s1 = SPAN[i * 2 + 1];
        if (s0 > a + 1e-9) out.push((a + s0) / 2, ty + 0.5, (s0 - a) / 2, 0.5);
        a = Math.max(a, s1);
      }
      if (a < b - 1e-9) out.push((a + b) / 2, ty + 0.5, (b - a) / 2, 0.5);
    }
  }
  for (let k = 0; k < lv.carriages.length; k++) {
    const c = lv.carriages[k];
    const o = w.offs[k];
    const lx0 = Math.max(0, Math.floor(x0 - o - c.rect[0]));
    const lx1 = Math.min(c.w - 1, Math.floor(x1 - o - c.rect[0]));
    const ly0 = Math.max(0, Math.floor(y0 - c.rect[1]));
    const ly1 = Math.min(c.h - 1, Math.floor(y1 - c.rect[1]));
    for (let ly = ly0; ly <= ly1; ly++) {
      for (let lx = lx0; lx <= lx1; lx++) {
        const t = c.tiles[ly * c.w + lx];
        if (solidCode(w, t, c.rect[0] + lx, c.rect[1] + ly, vaulting)) out.push(c.rect[0] + lx + 0.5 + o, c.rect[1] + ly + 0.5, 0.5, 0.5);
      }
    }
  }
}

/** Is the straight line a→b clear for sight (ray march; carriage levels only)? */
export function losClearTrain(w: World, ax: number, ay: number, bx: number, by: number): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.ceil(d / 0.1);
  const sx = Math.floor(ax);
  const sy = Math.floor(ay);
  const ex = Math.floor(bx);
  const ey = Math.floor(by);
  for (let i = 1; i < n; i++) {
    const x = ax + ((bx - ax) * i) / n;
    const y = ay + ((by - ay) * i) / n;
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    if ((fx === sx && fy === sy) || (fx === ex && fy === ey)) continue;
    if (opaqueAtPoint(w, x, y)) return false;
  }
  for (const c of w.crates) if (segBox(ax, ay, bx, by, c.x, c.y, CRATE_HALF)) return false;
  return true;
}

export function rayLengthTrain(w: World, ax: number, ay: number, ang: number, max: number): number {
  const cx = Math.cos(ang);
  const cy = Math.sin(ang);
  const sx = Math.floor(ax);
  const sy = Math.floor(ay);
  for (let d = 0.1; d < max; d += 0.1) {
    const x = ax + cx * d;
    const y = ay + cy * d;
    if (Math.floor(x) === sx && Math.floor(y) === sy) continue;
    if (opaqueAtPoint(w, x, y)) return d;
  }
  return max;
}

function segBox(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, h: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  for (const [p, d, lo, hi] of [
    [ax, dx, cx - h, cx + h],
    [ay, dy, cy - h, cy + h],
  ]) {
    if (Math.abs(d) < 1e-12) {
      if (p < lo || p > hi) return false;
    } else {
      let ta = (lo - p) / d;
      let tb = (hi - p) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/** Move the carriages to their offsets for the next tick and carry their riders along. */
export function moveTrain(w: World): void {
  const lv = w.lv;
  for (let k = 0; k < lv.carriages.length; k++) {
    const c = lv.carriages[k];
    const before = w.offs[k];
    const after = carriageOffset(c, w.t + 1);
    const delta = after - before;
    if (delta === 0) continue;
    const [x0, y0, x1, y1] = c.rect;
    const inside = (x: number, y: number) => y >= y0 && y < y1 + 1 && x >= x0 + before && x < x1 + 1 + before;
    // live player and copies that no longer follow a recording ride along; copies that do already
    // have the ride in their recorded positions
    for (const a of w.actors) {
      const rides = a.live || a.state === 'done' || a.state === 'paradox';
      if (rides && inside(a.x, a.y)) a.x += delta;
    }
    for (const it of w.items) if (it.carrier < 0 && !it.fly && inside(it.x, it.y)) it.x += delta;
    for (const cr of w.crates) if (inside(cr.x, cr.y)) cr.x += delta;
    for (const g of w.guards) if (g.carriage === k) g.x += delta;
    w.offs[k] = after;
  }
}

/** True when the level has a train (the slower, general geometry is in use). */
export function hasTrain(w: World): boolean {
  return w.lv.carriages.length > 0;
}

/** Map coordinates of the nearest tile of a kind (static or in a carriage), as its world centre. */
export function nearestKindTrain(w: World, x: number, y: number, kind: Tile, reach: number): [number, number] | null {
  let best: [number, number] | null = null;
  let bestD = reach;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      // sample tile centres around the point in world space
      const px = Math.floor(x) + dx + 0.5;
      const py = Math.floor(y) + dy + 0.5;
      const k = carriageAtPoint(w, px, py);
      let cx = px;
      if (k >= 0) {
        const c = w.lv.carriages[k];
        cx = Math.floor(px - w.offs[k] - c.rect[0]) + c.rect[0] + 0.5 + w.offs[k];
      }
      const { t } = tileAtPoint(w, cx, py);
      if (t !== kind) continue;
      const d = Math.hypot(cx - x, py - y);
      if (d <= bestD) {
        bestD = d;
        best = [cx, py];
      }
    }
  }
  return best;
}
