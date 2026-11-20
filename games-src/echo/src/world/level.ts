/** Level parsing, materials and validation. */
import { DIRS8, canStep, type GridLike } from './grid';
import { MAX_LEVEL_H, MAX_LEVEL_W } from '../game/constants';

export const Mat = {
  Rock: 0,
  Water: 1,
  Gravel: 2,
  Moss: 3,
  Metal: 4,
  Crystal: 5,
} as const;
export type Mat = (typeof Mat)[keyof typeof Mat];

export const MAT_NAMES: Record<Mat, string> = {
  [Mat.Rock]: 'rock',
  [Mat.Water]: 'water',
  [Mat.Gravel]: 'gravel',
  [Mat.Moss]: 'moss',
  [Mat.Metal]: 'metal',
  [Mat.Crystal]: 'crystal',
};

/** Footstep radius multiplier per floor material (brief §3.3). */
export const STEP_MULT: Record<Mat, number> = {
  [Mat.Rock]: 1,
  [Mat.Water]: 2.25,
  [Mat.Gravel]: 1.5,
  [Mat.Moss]: 0,
  [Mat.Metal]: 2,
  [Mat.Crystal]: 1,
};

export interface TileDef {
  solid: boolean;
  mat: Mat;
  label: string;
}

/** Every legend character. Entities and sources stand on a rock floor unless noted. */
export const LEGEND: Record<string, TileDef> = {
  '#': { solid: true, mat: Mat.Rock, label: 'Rock wall' },
  '.': { solid: false, mat: Mat.Rock, label: 'Rock floor' },
  W: { solid: false, mat: Mat.Water, label: 'Water' },
  G: { solid: false, mat: Mat.Gravel, label: 'Gravel' },
  M: { solid: false, mat: Mat.Moss, label: 'Moss' },
  T: { solid: false, mat: Mat.Metal, label: 'Metal grate' },
  X: { solid: true, mat: Mat.Metal, label: 'Metal wall' },
  K: { solid: true, mat: Mat.Crystal, label: 'Crystal wall' },
  S: { solid: false, mat: Mat.Rock, label: 'Start' },
  E: { solid: false, mat: Mat.Rock, label: 'Exit' },
  D: { solid: false, mat: Mat.Rock, label: 'Drip' },
  F: { solid: false, mat: Mat.Water, label: 'Waterfall' },
  R: { solid: false, mat: Mat.Gravel, label: 'Rubble' },
  C: { solid: false, mat: Mat.Rock, label: 'Listener' },
  B: { solid: false, mat: Mat.Rock, label: 'Swarm roost' },
  Z: { solid: false, mat: Mat.Rock, label: 'Mimic' },
  P: { solid: false, mat: Mat.Rock, label: 'Tourist' },
  '~': { solid: false, mat: Mat.Rock, label: 'False floor (pit)' },
  '=': { solid: false, mat: Mat.Metal, label: 'Rail' },
  H: { solid: false, mat: Mat.Metal, label: 'Minecart' },
};

export interface LevelMeta {
  name: string;
  stones: number;
  hint: string;
  parTime: number;
}

export interface Level extends GridLike {
  id: string;
  meta: LevelMeta;
  rows: string[];
  mat: Uint8Array;
  pit: Uint8Array;
  rail: Uint8Array;
  rubble: Uint8Array;
  /** Rock walls touching moss: echo at half brightness, in moss green. */
  mossy: Uint8Array;
  /** Passable tiles touching a crystal wall (sound amplifier). */
  crystalAdj: Uint8Array;
  hasCrystal: boolean;
  start: number;
  exit: number;
  drips: number[];
  waterfalls: number[];
  listeners: number[];
  swarms: number[];
  mimics: number[];
  tourists: number[];
  carts: number[];
  /** Walls touching at least one passable tile. */
  boundary: Int32Array;
  /** For boundary wall k, its passable neighbours are nbr[nbrStart[k] .. nbrStart[k+1]). */
  nbrStart: Int32Array;
  nbr: Int32Array;
  nbrCost: Float32Array;
  /** Tile index → boundary index, or −1. */
  boundaryIndex: Int32Array;
  /** Floor features remembered like walls: pits, rubble, rails. */
  features: Int32Array;
  featureIndex: Int32Array;
}

export const DEFAULT_META: LevelMeta = { name: 'Untitled', stones: 3, hint: '', parTime: 120 };

/** Split grid text into rows, dropping \r and trailing blank lines. */
export function splitRows(text: string): string[] {
  const rows = text.replace(/\r/g, '').split('\n');
  while (rows.length && rows[rows.length - 1].trim() === '') rows.pop();
  while (rows.length && rows[0].trim() === '') rows.shift();
  return rows.map((r) => r.replace(/\s+$/, ''));
}

export function normalizeMeta(raw: unknown): LevelMeta {
  const m = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    name: typeof m.name === 'string' && m.name.trim() ? m.name.trim().slice(0, 60) : DEFAULT_META.name,
    stones: Number.isFinite(m.stones) ? Math.max(0, Math.min(20, Math.round(m.stones as number))) : DEFAULT_META.stones,
    hint: typeof m.hint === 'string' ? m.hint.slice(0, 200) : DEFAULT_META.hint,
    parTime: Number.isFinite(m.parTime) ? Math.max(5, Math.round(m.parTime as number)) : DEFAULT_META.parTime,
  };
}

/**
 * Parse a level. Unknown characters and short rows become rock walls, so a broken file still
 * loads; `validateLevel` reports those problems.
 */
export function parseLevel(text: string, meta: Partial<LevelMeta> | unknown = {}, id = 'custom'): Level {
  const rows = splitRows(text);
  const h = Math.max(1, rows.length);
  const w = Math.max(1, ...rows.map((r) => r.length));
  const n = w * h;
  const solid = new Uint8Array(n);
  const mat = new Uint8Array(n);
  const pit = new Uint8Array(n);
  const rail = new Uint8Array(n);
  const rubble = new Uint8Array(n);
  const lists = {
    drips: [] as number[], waterfalls: [] as number[], listeners: [] as number[], swarms: [] as number[],
    mimics: [] as number[], tourists: [] as number[], carts: [] as number[],
  };
  let start = -1;
  let exit = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const ch = rows[y]?.[x] ?? '#';
      const def = LEGEND[ch] ?? LEGEND['#'];
      solid[i] = def.solid ? 1 : 0;
      mat[i] = def.mat;
      switch (ch) {
        case 'S': if (start < 0) start = i; break;
        case 'E': if (exit < 0) exit = i; break;
        case 'D': lists.drips.push(i); break;
        case 'F': lists.waterfalls.push(i); break;
        case 'R': rubble[i] = 1; break;
        case 'C': lists.listeners.push(i); break;
        case 'B': lists.swarms.push(i); break;
        case 'Z': lists.mimics.push(i); break;
        case 'P': lists.tourists.push(i); break;
        case '~': pit[i] = 1; break;
        case '=': rail[i] = 1; break;
        case 'H': rail[i] = 1; lists.carts.push(i); break;
      }
    }
  }
  if (start < 0) start = firstOpen(solid);
  if (exit < 0) exit = start;

  const mossy = new Uint8Array(n);
  const crystalAdj = new Uint8Array(n);
  let hasCrystal = false;
  const boundaryList: number[] = [];
  const nbrStartList: number[] = [];
  const nbrList: number[] = [];
  const costList: number[] = [];
  const boundaryIndex = new Int32Array(n).fill(-1);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!solid[i]) continue;
      const start0 = nbrList.length;
      let touchesMoss = false;
      for (const d of DIRS8) {
        const nx = x + d.dx;
        const ny = y + d.dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (solid[j]) continue;
        nbrList.push(j);
        costList.push(d.diag ? 0.7 : 0.5);
        if (mat[j] === Mat.Moss) touchesMoss = true;
        if (mat[i] === Mat.Crystal) { crystalAdj[j] = 1; hasCrystal = true; }
      }
      if (nbrList.length > start0) {
        boundaryIndex[i] = boundaryList.length;
        boundaryList.push(i);
        nbrStartList.push(start0);
        if (touchesMoss && mat[i] === Mat.Rock) mossy[i] = 1;
      }
    }
  }
  nbrStartList.push(nbrList.length);

  const featureIndex = new Int32Array(n).fill(-1);
  const featureList: number[] = [];
  for (let i = 0; i < n; i++) {
    if (pit[i] || rubble[i] || rail[i]) {
      featureIndex[i] = featureList.length;
      featureList.push(i);
    }
  }

  return {
    id,
    meta: normalizeMeta(meta),
    rows,
    w,
    h,
    solid,
    mat,
    pit,
    rail,
    rubble,
    mossy,
    crystalAdj,
    hasCrystal,
    start,
    exit,
    ...lists,
    boundary: Int32Array.from(boundaryList),
    nbrStart: Int32Array.from(nbrStartList),
    nbr: Int32Array.from(nbrList),
    nbrCost: Float32Array.from(costList),
    boundaryIndex,
    features: Int32Array.from(featureList),
    featureIndex,
  };
}

function firstOpen(solid: Uint8Array): number {
  for (let i = 0; i < solid.length; i++) if (!solid[i]) return i;
  return 0;
}

/** Breadth-first reachability for walkers from `from`, no corner cutting, pits blocked. */
export function reachableFrom(level: Level, from: number): Uint8Array {
  const seen = new Uint8Array(level.w * level.h);
  if (from < 0 || level.solid[from]) return seen;
  const queue = [from];
  seen[from] = 1;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % level.w;
    const y = (i / level.w) | 0;
    for (const d of DIRS8) {
      if (!canStep(level, x, y, d, level.pit)) continue;
      const j = (y + d.dy) * level.w + (x + d.dx);
      if (seen[j]) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return seen;
}

export interface ValidationIssue {
  message: string;
  /** Tile (x, y) the issue points at, when there is one. */
  x?: number;
  y?: number;
}

/** Check a level's text: rectangular, size, legend, one S and one E, everything reachable. */
export function validateLevel(text: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const rows = splitRows(text);
  if (rows.length === 0) return [{ message: 'The level is empty.' }];
  const w = rows[0].length;
  rows.forEach((r, y) => {
    if (r.length !== w) issues.push({ message: `Row ${y + 1} is ${r.length} tiles wide; the first row is ${w}. The grid must be rectangular.`, y });
  });
  if (w > MAX_LEVEL_W || rows.length > MAX_LEVEL_H) {
    issues.push({ message: `The grid is ${w}×${rows.length}; the maximum is ${MAX_LEVEL_W}×${MAX_LEVEL_H}.` });
  }
  if (w < 3 || rows.length < 3) issues.push({ message: 'The grid must be at least 3×3.' });

  const counts: Record<string, number> = {};
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      const ch = r[x];
      counts[ch] = (counts[ch] ?? 0) + 1;
      if (!LEGEND[ch]) issues.push({ message: `Unknown tile "${ch}" at column ${x + 1}, row ${y + 1}.`, x, y });
    }
  });
  if ((counts.S ?? 0) !== 1) issues.push({ message: `There must be exactly one start (S); found ${counts.S ?? 0}.` });
  if ((counts.E ?? 0) !== 1) issues.push({ message: `There must be exactly one exit (E); found ${counts.E ?? 0}.` });
  if (issues.length) return issues;

  const level = parseLevel(text);
  const reach = reachableFrom(level, level.start);
  const pos = (i: number) => ({ x: i % level.w, y: (i / level.w) | 0 });
  if (!reach[level.exit]) {
    const p = pos(level.exit);
    issues.push({ message: `The exit at column ${p.x + 1}, row ${p.y + 1} can't be reached from the start.`, ...p });
  }
  for (const t of level.tourists) {
    if (!reach[t]) {
      const p = pos(t);
      issues.push({ message: `The tourist at column ${p.x + 1}, row ${p.y + 1} can't be reached from the start.`, ...p });
    }
  }
  for (const c of level.carts) {
    const x = c % level.w;
    const y = (c / level.w) | 0;
    const railNeighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < level.w && ny < level.h && level.rail[ny * level.w + nx];
    }).length;
    if (railNeighbours === 0) issues.push({ message: `The minecart at column ${x + 1}, row ${y + 1} isn't on a rail line (=).`, x, y });
  }
  return issues;
}
