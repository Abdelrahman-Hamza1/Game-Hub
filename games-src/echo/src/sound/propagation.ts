/**
 * Sound propagation: Dijkstra distance fields over passable tiles (brief §3.1).
 *
 * - 8 directions, orthogonal cost 1, diagonal √2, no corner cutting.
 * - Expansion stops past `limit`.
 * - Crystal amplification (DESIGN.md decision 10): once sound reaches a tile touching crystal, the
 *   rest of its path costs half, so it travels twice as far beyond. This is a two-layer search:
 *   layer 0 = not yet amplified, layer 1 = amplified. The field is the minimum of the two.
 */
import { DIRS8 } from '../world/grid';
import type { Level } from '../world/level';

export interface Field {
  /** Path distance from the source per tile; Infinity where sound doesn't reach. */
  readonly dist: Float32Array;
  readonly source: number;
  readonly limit: number;
}

/** Binary min-heap of (key, node) pairs with lazy deletion. */
class MinHeap {
  private keys = new Float64Array(256);
  private nodes = new Int32Array(256);
  size = 0;

  clear(): void {
    this.size = 0;
  }

  push(key: number, node: number): void {
    if (this.size === this.keys.length) {
      const k = new Float64Array(this.size * 2);
      k.set(this.keys);
      this.keys = k;
      const n = new Int32Array(this.size * 2);
      n.set(this.nodes);
      this.nodes = n;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.keys[i] = this.keys[p];
      this.nodes[i] = this.nodes[p];
      i = p;
    }
    this.keys[i] = key;
    this.nodes[i] = node;
  }

  /** Pops the smallest; returns its node and leaves its key in `lastKey`. */
  lastKey = 0;
  pop(): number {
    const topNode = this.nodes[0];
    this.lastKey = this.keys[0];
    const key = this.keys[--this.size];
    const node = this.nodes[this.size];
    let i = 0;
    const half = this.size >> 1;
    while (i < half) {
      let c = 2 * i + 1;
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++;
      if (this.keys[c] >= key) break;
      this.keys[i] = this.keys[c];
      this.nodes[i] = this.nodes[c];
      i = c;
    }
    this.keys[i] = key;
    this.nodes[i] = node;
    return topNode;
  }
}

const heap = new MinHeap();

/**
 * Compute the distance field from `source` out to `limit` tiles of path distance. `blocked` marks
 * extra tiles to treat as walls (e.g. pits, for walking paths instead of sound).
 */
export function computeField(
  level: Level, source: number, limit: number, blocked?: Uint8Array, amplify = true,
): Field {
  const { w, h, solid } = level;
  const n = w * h;
  const amp = level.hasCrystal && amplify;
  const L = amp ? 2 : 1;
  const d = new Float64Array(n * L).fill(Infinity);
  heap.clear();
  if (source < 0 || source >= n || solid[source]) {
    return { dist: new Float32Array(n).fill(Infinity), source, limit };
  }
  d[source * L] = 0;
  heap.push(0, source * L);

  while (heap.size > 0) {
    const s = heap.pop();
    const k = heap.lastKey;
    if (k > d[s]) continue;
    const node = amp ? s >> 1 : s;
    const layer = amp ? s & 1 : 0;
    if (amp && layer === 0 && level.crystalAdj[node] && k < d[s + 1]) {
      d[s + 1] = k;
      heap.push(k, s + 1);
    }
    const x = node % w;
    const y = (node / w) | 0;
    const scale = layer ? 0.5 : 1;
    for (const dir of DIRS8) {
      const nx = x + dir.dx;
      const ny = y + dir.dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (solid[ni] || (blocked && blocked[ni])) continue;
      if (dir.diag && (solid[y * w + nx] || solid[ny * w + x])) continue;
      if (dir.diag && blocked && (blocked[y * w + nx] || blocked[ny * w + x])) continue;
      const nk = k + dir.cost * scale;
      if (nk > limit) continue;
      const ns = amp ? ni * 2 + layer : ni;
      if (nk < d[ns]) {
        d[ns] = nk;
        heap.push(nk, ns);
      }
    }
  }

  const dist = new Float32Array(n);
  if (amp) {
    for (let i = 0; i < n; i++) dist[i] = Math.min(d[2 * i], d[2 * i + 1]);
  } else {
    for (let i = 0; i < n; i++) dist[i] = d[i];
  }
  return { dist, source, limit };
}

/** Caches fields for sources that never move (ambient emitters, patrol targets). */
export class FieldCache {
  private map = new Map<string, Field>();
  hits = 0;
  misses = 0;

  constructor(private readonly level: Level) {}

  /** `amplify = false` gives plain walking distance (crystal only amplifies sound). */
  get(source: number, limit: number, amplify = true): Field {
    const key = source + ':' + limit + (amplify ? '' : ':w');
    let f = this.map.get(key);
    if (f) {
      this.hits++;
      return f;
    }
    this.misses++;
    f = computeField(this.level, source, limit, undefined, amplify);
    if (this.map.size > 400) this.map.clear();
    this.map.set(key, f);
    return f;
  }
}

/** Distance from the field to boundary wall k: min over passable neighbours of field + 0.5/0.7. */
export function wallDistance(level: Level, field: Field, k: number): number {
  let best = Infinity;
  for (let j = level.nbrStart[k]; j < level.nbrStart[k + 1]; j++) {
    const v = field.dist[level.nbr[j]] + level.nbrCost[j];
    if (v < best) best = v;
  }
  return best;
}

/**
 * The next tile when walking downhill on a field from tile `at`: the passable neighbour (no corner
 * cutting) with the lowest distance, if it is lower than here. Returns −1 at the bottom.
 */
export function downhill(level: Level, field: Field, at: number, blocked?: Uint8Array): number {
  const { w, h, solid } = level;
  const x = at % w;
  const y = (at / w) | 0;
  const here = field.dist[at];
  let best = -1;
  let bestD = here;
  for (const dir of DIRS8) {
    const nx = x + dir.dx;
    const ny = y + dir.dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const ni = ny * w + nx;
    if (solid[ni] || (blocked && blocked[ni])) continue;
    if (dir.diag && (solid[y * w + nx] || solid[ny * w + x])) continue;
    if (dir.diag && blocked && (blocked[y * w + nx] || blocked[ny * w + x])) continue;
    const v = field.dist[ni];
    if (v < bestD - 1e-6) {
      bestD = v;
      best = ni;
    }
  }
  return best;
}

/** Full downhill path from `from` to the field's source (for tests and the debug overlay). */
export function pathDownhill(level: Level, field: Field, from: number, maxSteps = 500): number[] {
  const path = [from];
  let at = from;
  for (let s = 0; s < maxSteps; s++) {
    const next = downhill(level, field, at);
    if (next < 0) break;
    path.push(next);
    at = next;
  }
  return path;
}
