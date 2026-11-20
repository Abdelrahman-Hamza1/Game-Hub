/** Tile helpers shared by the simulation: neighbours, passability, movement with collision. */

export interface Dir {
  dx: number;
  dy: number;
  cost: number;
  diag: boolean;
}

/** 8 directions: orthogonal first, then diagonal. */
export const DIRS8: readonly Dir[] = [
  { dx: 1, dy: 0, cost: 1, diag: false },
  { dx: -1, dy: 0, cost: 1, diag: false },
  { dx: 0, dy: 1, cost: 1, diag: false },
  { dx: 0, dy: -1, cost: 1, diag: false },
  { dx: 1, dy: 1, cost: Math.SQRT2, diag: true },
  { dx: -1, dy: 1, cost: Math.SQRT2, diag: true },
  { dx: 1, dy: -1, cost: Math.SQRT2, diag: true },
  { dx: -1, dy: -1, cost: Math.SQRT2, diag: true },
];

export const DIRS4: readonly Dir[] = DIRS8.slice(0, 4);

/** The minimum a grid needs for the helpers below. */
export interface GridLike {
  readonly w: number;
  readonly h: number;
  /** 1 = wall: blocks movement and sound. */
  readonly solid: Uint8Array;
}

export function inBounds(g: GridLike, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.w && y < g.h;
}

export function isSolidXY(g: GridLike, x: number, y: number): boolean {
  return !inBounds(g, x, y) || g.solid[y * g.w + x] === 1;
}

/** Tile index under a world position (tiles, floats). */
export function tileAt(g: GridLike, x: number, y: number): number {
  const tx = Math.min(g.w - 1, Math.max(0, Math.floor(x)));
  const ty = Math.min(g.h - 1, Math.max(0, Math.floor(y)));
  return ty * g.w + tx;
}

export function tileX(g: GridLike, i: number): number {
  return i % g.w;
}

export function tileY(g: GridLike, i: number): number {
  return (i / g.w) | 0;
}

/**
 * Can you step from tile (x, y) in direction d? Diagonal steps need both orthogonal neighbours
 * open (no corner cutting). `blocked` lets callers add extra obstacles (e.g. pits for walkers).
 */
export function canStep(g: GridLike, x: number, y: number, d: Dir, blocked?: Uint8Array): boolean {
  const nx = x + d.dx;
  const ny = y + d.dy;
  if (isSolidXY(g, nx, ny)) return false;
  if (blocked && blocked[ny * g.w + nx]) return false;
  if (d.diag) {
    if (isSolidXY(g, x + d.dx, y) || isSolidXY(g, x, y + d.dy)) return false;
    if (blocked && (blocked[y * g.w + x + d.dx] || blocked[(y + d.dy) * g.w + x])) return false;
  }
  return true;
}

/**
 * Move a circle by (dx, dy), sliding along solid tiles. Each axis is resolved separately so the
 * circle slides instead of sticking. Movement per tick is far below the radius, so a single
 * push-out pass per axis is enough.
 */
export function moveCircle(
  g: GridLike,
  x: number,
  y: number,
  dx: number,
  dy: number,
  r: number,
): { x: number; y: number } {
  let nx = x + dx;
  let ny = y;
  ({ x: nx, y: ny } = pushOut(g, nx, ny, r));
  ny += dy;
  ({ x: nx, y: ny } = pushOut(g, nx, ny, r));
  return { x: nx, y: ny };
}

function pushOut(g: GridLike, x: number, y: number, r: number): { x: number; y: number } {
  for (let pass = 0; pass < 2; pass++) {
    const x0 = Math.floor(x - r);
    const x1 = Math.floor(x + r);
    const y0 = Math.floor(y - r);
    const y1 = Math.floor(y + r);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!isSolidXY(g, tx, ty)) continue;
        const px = Math.max(tx, Math.min(x, tx + 1));
        const py = Math.max(ty, Math.min(y, ty + 1));
        const ox = x - px;
        const oy = y - py;
        const d2 = ox * ox + oy * oy;
        if (d2 >= r * r) continue;
        if (d2 > 1e-12) {
          const d = Math.sqrt(d2);
          x += (ox / d) * (r - d);
          y += (oy / d) * (r - d);
        } else {
          // Centre inside the tile (shouldn't happen at normal speeds): push to the nearest edge.
          const left = x - tx;
          const right = tx + 1 - x;
          const top = y - ty;
          const bottom = ty + 1 - y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) x = tx - r;
          else if (m === right) x = tx + 1 + r;
          else if (m === top) y = ty - r;
          else y = ty + 1 + r;
        }
      }
    }
  }
  return { x, y };
}

/** Angle difference in radians, wrapped to [0, π]. */
export function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}
