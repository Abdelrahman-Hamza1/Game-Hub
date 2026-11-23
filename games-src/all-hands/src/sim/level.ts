/**
 * Level files: `levels/<world>/<nn>.txt` (the grid) + `<nn>.json` (settings). See DESIGN.md
 * "Level file format". This module turns them into plain data; the world builds its bodies and
 * objects from it (src/sim/objects/registry.ts says which tile makes which object).
 */

/** Static tile codes. Everything that moves or changes is an object, not a tile. */
export const enum T {
  Air = 0,
  Solid = 1,
  OneWay = 2,
  Spring = 3,
  Button = 4,
  Color1 = 5,
  Color2 = 6,
  Color3 = 7,
  Color4 = 8,
  SpikeUp = 9,
  SpikeDown = 10,
}

export interface LevelJson {
  name: string;
  hint?: string;
  par?: number;
  blocks?: { n: number }[];
  plates?: { n: number; wires: string[] }[];
  buttons?: { wires: string[]; hold?: number; toggle?: boolean }[];
  gates?: Record<string, { invert?: boolean }>;
  lifts?: { n: number; path: [number, number][] }[];
  movers?: { path: [number, number][]; speed?: number }[];
  bridges?: { n: number }[];
  scales?: Record<string, unknown>[];
  leash?: number;
  dark?: boolean;
  scroll?: number;
  solution?: string[];
  why4?: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Level {
  /** "1-3", "6-8" */
  id: string;
  world: number;
  index: number;
  name: string;
  hint: string;
  par: number;
  w: number;
  h: number;
  rows: string[];
  tiles: Uint8Array;
  spawns: [number, number][];
  key: [number, number];
  lantern: [number, number] | null;
  door: Rect;
  json: LevelJson;
}

const STATIC: Record<string, T> = {
  '#': T.Solid,
  '-': T.OneWay,
  j: T.Spring,
  o: T.Button,
  '1': T.Color1,
  '2': T.Color2,
  '3': T.Color3,
  '4': T.Color4,
  '^': T.SpikeUp,
  v: T.SpikeDown,
};

export class LevelError extends Error {}

export function parseLevel(id: string, txt: string, json: LevelJson): Level {
  const rows = txt.replace(/\r/g, '').split('\n').filter((r) => r.length > 0);
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  if (!h || rows.some((r) => r.length !== w)) throw new LevelError(`${id}: the grid must be a rectangle`);
  const tiles = new Uint8Array(w * h);
  const spawns: [number, number][] = [];
  let key: [number, number] | null = null;
  let lantern: [number, number] | null = null;
  const doorCells: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y][x];
      tiles[y * w + x] = STATIC[c] ?? T.Air;
      if (c === 'S') spawns.push([x, y]);
      else if (c === 'K') key = [x, y];
      else if (c === 'l') lantern = [x, y];
      else if (c === 'D') doorCells.push([x, y]);
    }
  }
  if (spawns.length !== 4) throw new LevelError(`${id}: needs exactly four S, found ${spawns.length}`);
  if (!key) throw new LevelError(`${id}: no key (K)`);
  if (doorCells.length !== 2 || doorCells[0][0] !== doorCells[1][0] || doorCells[1][1] !== doorCells[0][1] + 1)
    throw new LevelError(`${id}: the door is two D tiles, one above the other`);
  const [world, index] = id.split('-');
  return {
    id,
    world: Number(world),
    index: index === 'F' ? 9 : Number(index),
    name: json.name,
    hint: json.hint ?? '',
    par: json.par ?? 120,
    w,
    h,
    rows,
    tiles,
    spawns,
    key,
    lantern,
    door: { x: doorCells[0][0], y: doorCells[0][1], w: 1, h: 2 },
    json,
  };
}

/** 4-connected groups of one character, in reading order of their first tile. */
export function groups(lv: Level, ch: string): [number, number][][] {
  const seen = new Uint8Array(lv.w * lv.h);
  const out: [number, number][][] = [];
  for (let y = 0; y < lv.h; y++) {
    for (let x = 0; x < lv.w; x++) {
      if (lv.rows[y][x] !== ch || seen[y * lv.w + x]) continue;
      const cells: [number, number][] = [];
      const stack: [number, number][] = [[x, y]];
      seen[y * lv.w + x] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        cells.push([cx, cy]);
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < 0 || ny < 0 || nx >= lv.w || ny >= lv.h) continue;
          if (lv.rows[ny][nx] !== ch || seen[ny * lv.w + nx]) continue;
          seen[ny * lv.w + nx] = 1;
          stack.push([nx, ny]);
        }
      }
      cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      out.push(cells);
    }
  }
  return out;
}

/** Horizontal runs of one character, in reading order. */
export function runs(lv: Level, ch: string): Rect[] {
  const out: Rect[] = [];
  for (let y = 0; y < lv.h; y++) {
    let x = 0;
    while (x < lv.w) {
      if (lv.rows[y][x] !== ch) {
        x++;
        continue;
      }
      const x0 = x;
      while (x < lv.w && lv.rows[y][x] === ch) x++;
      out.push({ x: x0, y, w: x - x0, h: 1 });
    }
  }
  return out;
}

/** The bounding rectangle of a group of cells. */
export function bounds(cells: [number, number][]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of cells) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
