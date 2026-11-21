/**
 * Grid paths for threats (guards walking to a noise, the Auditor, the Hound reaching a trail).
 * 8-way moves without cutting corners; diagonal steps cost √2. Closed doors, windows, low walls
 * and walls block. Paths are smoothed so walkers go straight where they can.
 */
import { Tile } from './level';
import type { World } from './world';

const SQ2 = Math.SQRT2;
const NB: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQ2],
  [1, -1, SQ2],
  [-1, 1, SQ2],
  [-1, -1, SQ2],
];

function passable(w: World, tx: number, ty: number): boolean {
  const t = w.tileAt(tx, ty);
  if (t === Tile.Floor) return true;
  if (t === Tile.Door) return !w.doorClosedAt(tx, ty);
  return false;
}

/** Dijkstra distances (in tiles) from a tile, up to `max`. Unreached = Infinity. */
export function distances(w: World, sx: number, sy: number, max = Infinity): Float64Array {
  const W = w.lv.w;
  const H = w.lv.h;
  const dist = new Float64Array(W * H).fill(Infinity);
  if (!passable(w, sx, sy)) return dist;
  const start = sy * W + sx;
  dist[start] = 0;
  // small binary heap
  const heap: number[] = [start];
  const pri: number[] = [0];
  const pop = (): number => {
    const top = heap[0];
    const lastI = heap.pop()!;
    const lastP = pri.pop()!;
    if (heap.length) {
      let i = 0;
      heap[0] = lastI;
      pri[0] = lastP;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && pri[l] < pri[m]) m = l;
        if (r < heap.length && pri[r] < pri[m]) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]];
        [pri[i], pri[m]] = [pri[m], pri[i]];
        i = m;
      }
    }
    return top;
  };
  const push = (n: number, p: number) => {
    heap.push(n);
    pri.push(p);
    let i = heap.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (pri[par] <= pri[i]) break;
      [heap[i], heap[par]] = [heap[par], heap[i]];
      [pri[i], pri[par]] = [pri[par], pri[i]];
      i = par;
    }
  };
  while (heap.length) {
    const cur = pop();
    const cx = cur % W;
    const cy = (cur - cx) / W;
    const cd = dist[cur];
    if (cd > max) break;
    for (const [dx, dy, c] of NB) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!passable(w, nx, ny)) continue;
      if (dx && dy && (!passable(w, cx + dx, cy) || !passable(w, cx, cy + dy))) continue;
      const n = ny * W + nx;
      const nd = cd + c;
      if (nd < dist[n]) {
        dist[n] = nd;
        push(n, nd);
      }
    }
  }
  return dist;
}

/** Path distance in tiles between two points (tile centres), or Infinity. */
export function pathDistance(w: World, ax: number, ay: number, bx: number, by: number, max = Infinity): number {
  const d = distances(w, Math.floor(bx), Math.floor(by), max);
  return d[Math.floor(ay) * w.lv.w + Math.floor(ax)];
}

/**
 * Path from (ax, ay) to the tile containing (bx, by), as points (tile centres, smoothed; the first
 * point is the next one to walk to). `stopShort` ends the path one tile before the goal.
 * Null if there is no way.
 */
export function findPath(w: World, ax: number, ay: number, bx: number, by: number, stopShort = false): [number, number][] | null {
  const W = w.lv.w;
  const gx = Math.floor(bx);
  const gy = Math.floor(by);
  const dist = distances(w, gx, gy);
  let cx = Math.floor(ax);
  let cy = Math.floor(ay);
  if (!isFinite(dist[cy * W + cx])) {
    // standing somewhere odd (a doorway that just closed): start from the best neighbour
    let best = Infinity;
    let bx2 = cx;
    let by2 = cy;
    for (const [dx, dy] of NB) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= w.lv.h) continue;
      const v = dist[ny * W + nx];
      if (v < best) {
        best = v;
        bx2 = nx;
        by2 = ny;
      }
    }
    if (!isFinite(best)) return null;
    cx = bx2;
    cy = by2;
  }
  const tiles: [number, number][] = [];
  let guard = 0;
  while ((cx !== gx || cy !== gy) && guard++ < W * w.lv.h) {
    let bestN: [number, number] | null = null;
    let bestD = dist[cy * W + cx];
    for (const [dx, dy, c] of NB) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= w.lv.h) continue;
      if (dx && dy && (!passable(w, cx + dx, cy) || !passable(w, cx, cy + dy))) continue;
      const v = dist[ny * W + nx] + c * 1e-6;
      if (v < bestD) {
        bestD = v;
        bestN = [nx, ny];
      }
    }
    if (!bestN) break;
    [cx, cy] = bestN;
    tiles.push([cx, cy]);
  }
  if (stopShort && tiles.length) tiles.pop();
  const pts = tiles.map(([x, y]) => [x + 0.5, y + 0.5] as [number, number]);
  if (!stopShort && pts.length) pts[pts.length - 1] = [bx, by];
  return smooth(w, ax, ay, pts);
}

/** Drop path points that can be skipped with a clear, wide-enough straight line. */
function smooth(w: World, ax: number, ay: number, pts: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let ox = ax;
  let oy = ay;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !clearWide(w, ox, oy, pts[j][0], pts[j][1])) j--;
    out.push(pts[j]);
    [ox, oy] = pts[j];
    i = j + 1;
  }
  return out;
}

/** Straight walk a→b stays clear of blocking tiles with a 0.35 margin. */
export function clearWide(w: World, ax: number, ay: number, bx: number, by: number): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.ceil(d * 6) + 1;
  const m = 0.35;
  for (let i = 0; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n;
    const y = ay + ((by - ay) * i) / n;
    for (const [ox, oy] of [
      [-m, -m],
      [m, -m],
      [-m, m],
      [m, m],
    ]) {
      if (!passable(w, Math.floor(x + ox), Math.floor(y + oy))) return false;
    }
  }
  return true;
}
