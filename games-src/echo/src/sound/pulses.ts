/**
 * Pulses: one per sound. A pulse owns its field and a precomputed, sorted list of the walls and
 * floor tiles it can reach, so each tick only touches the tiles near the ring.
 */
import { angleDiff } from '../world/grid';
import { Mat, type Level } from '../world/level';
import type { Field } from './propagation';
import { wallDistance } from './propagation';
import { FLOOR_BAND, RING_END_PAD, RING_SPEED, WALL_BAND, WALL_REACH_PAD } from '../game/constants';

export const SOUND_KINDS = [
  'step', 'sneak', 'click', 'clap', 'stone', 'cane',
  'wind', 'drip', 'growl', 'breath', 'call', 'swarm', 'rumble', 'crash',
] as const;
export type SoundKind = (typeof SOUND_KINDS)[number];

export type Owner = 'player' | 'ambient' | 'listener' | 'tourist' | 'swarm' | 'mimic' | 'cart' | 'attract';

export interface KindInfo {
  /** Pulse colour (floor wavefront dots; walls blend 30 % toward it). */
  color: string;
  /** How bright this kind of sound makes an echo. */
  bright: number;
  /** Threat sounds paint walls fully in their own colour. */
  threat: boolean;
}

export const KIND_INFO: Record<SoundKind, KindInfo> = {
  step: { color: '#DDEBFF', bright: 0.75, threat: false },
  sneak: { color: '#DDEBFF', bright: 0.5, threat: false },
  click: { color: '#E6FFF6', bright: 0.9, threat: false },
  clap: { color: '#FFFFFF', bright: 1, threat: false },
  stone: { color: '#FFE6BF', bright: 1, threat: false },
  cane: { color: '#DDEBFF', bright: 0.6, threat: false },
  wind: { color: '#BFF4FF', bright: 0.6, threat: false },
  drip: { color: '#3A86FF', bright: 0.65, threat: false },
  growl: { color: '#FF4D6D', bright: 0.95, threat: true },
  breath: { color: '#FFD9A8', bright: 0.45, threat: false },
  call: { color: '#FFB36B', bright: 0.85, threat: false },
  swarm: { color: '#C77DFF', bright: 1, threat: false },
  rumble: { color: '#B8C4D6', bright: 0.8, threat: false },
  crash: { color: '#FFFFFF', bright: 1, threat: false },
};

export const KIND_INDEX: Record<SoundKind, number> = Object.fromEntries(
  SOUND_KINDS.map((k, i) => [k, i]),
) as Record<SoundKind, number>;

export interface Cone {
  /** Facing angle in radians. */
  dir: number;
  /** Half-width in radians. */
  half: number;
}

export interface Pulse {
  id: number;
  kind: SoundKind;
  owner: Owner;
  /** World position of the source (tiles). */
  x: number;
  y: number;
  tile: number;
  /** Reveal radius. */
  radius: number;
  /** Hearing radius for threats; 0 = threats ignore it. Already includes waterfall masking. */
  hear: number;
  start: number;
  field: Field;
  cone: Cone | null;
  /** A Mimic's copy: paints pits as floor. */
  fake: boolean;
  /** Floor material at the source (for audio recipes). */
  mat: Mat;
  bright: number;
  /** Boundary-wall indices (into level.boundary) this pulse can light, sorted by wallDist. */
  walls: Int32Array;
  wallDist: Float32Array;
  /** Floor tiles within the reveal radius, sorted by distance. */
  floor: Int32Array;
  floorDist: Float32Array;
  /** Sliding window start into walls / floor (everything before is behind the ring). */
  wallLo: number;
  floorLo: number;
  done: boolean;
}

export function ringRadius(p: Pulse, now: number): number {
  return (now - p.start) * RING_SPEED;
}

export function pulseFinished(p: Pulse, now: number): boolean {
  return ringRadius(p, now) > p.radius + RING_END_PAD;
}

/** Wall brightness at ring radius r (brief §3.1). */
export function wallBrightness(r: number, radius: number): number {
  return 1 - 0.55 * Math.min(1, r / (radius + 1));
}

function inCone(cone: Cone | null, ox: number, oy: number, tx: number, ty: number): boolean {
  if (!cone) return true;
  const dx = tx - ox;
  const dy = ty - oy;
  if (dx * dx + dy * dy < 0.8 * 0.8) return true;
  return angleDiff(Math.atan2(dy, dx), cone.dir) <= cone.half;
}

/** Sort parallel arrays (indices, distances) by distance. */
function sortedPair(idx: number[], dist: number[]): { idx: Int32Array; dist: Float32Array } {
  const order = idx.map((_, i) => i).sort((a, b) => dist[a] - dist[b]);
  return {
    idx: Int32Array.from(order, (i) => idx[i]),
    dist: Float32Array.from(order, (i) => dist[i]),
  };
}

export interface PulseInit {
  id: number;
  kind: SoundKind;
  owner: Owner;
  x: number;
  y: number;
  tile: number;
  radius: number;
  hear: number;
  start: number;
  field: Field;
  cone: Cone | null;
  fake: boolean;
  mat: Mat;
}

/** Build a pulse, precomputing which walls and floor tiles it reaches and when. */
export function createPulse(level: Level, init: PulseInit): Pulse {
  const { field, radius, cone, x, y } = init;
  const w = level.w;
  const wallIdx: number[] = [];
  const wallD: number[] = [];
  for (let k = 0; k < level.boundary.length; k++) {
    const wd = wallDistance(level, field, k);
    if (wd > radius + WALL_REACH_PAD) continue;
    const t = level.boundary[k];
    if (!inCone(cone, x, y, (t % w) + 0.5, ((t / w) | 0) + 0.5)) continue;
    wallIdx.push(k);
    wallD.push(wd);
  }
  const floorIdx: number[] = [];
  const floorD: number[] = [];
  const dist = field.dist;
  for (let i = 0; i < dist.length; i++) {
    const d = dist[i];
    if (d > radius) continue;
    if (!inCone(cone, x, y, (i % w) + 0.5, ((i / w) | 0) + 0.5)) continue;
    floorIdx.push(i);
    floorD.push(d);
  }
  const walls = sortedPair(wallIdx, wallD);
  const floor = sortedPair(floorIdx, floorD);
  return {
    ...init,
    bright: KIND_INFO[init.kind].bright,
    walls: walls.idx,
    wallDist: walls.dist,
    floor: floor.idx,
    floorDist: floor.dist,
    wallLo: 0,
    floorLo: 0,
    done: false,
  };
}

/** Visit the walls currently inside the ring band, calling fn(boundaryIndex, wallDist). */
export function forEachLitWall(p: Pulse, r: number, fn: (k: number, wd: number) => void): void {
  while (p.wallLo < p.walls.length && p.wallDist[p.wallLo] <= r - WALL_BAND) p.wallLo++;
  for (let i = p.wallLo; i < p.walls.length; i++) {
    const wd = p.wallDist[i];
    if (wd >= r + WALL_BAND) break;
    fn(p.walls[i], wd);
  }
}

/** Visit floor tiles on the wavefront (|r − field| < band). Doesn't advance the window. */
export function forEachWaveTile(p: Pulse, r: number, band: number, fn: (tile: number, d: number) => void): void {
  let lo = p.floorLo;
  while (lo < p.floor.length && p.floorDist[lo] <= r - band) lo++;
  for (let i = lo; i < p.floor.length; i++) {
    const d = p.floorDist[i];
    if (d >= r + band) break;
    fn(p.floor[i], d);
  }
}

/** Advance the floor window past tiles the ring has fully passed (call once per tick). */
export function advanceFloorWindow(p: Pulse, r: number): void {
  const band = Math.max(FLOOR_BAND, 1.2);
  while (p.floorLo < p.floor.length && p.floorDist[p.floorLo] <= r - band) p.floorLo++;
}

/** Is tile `t` inside this pulse's cone (always true without a cone)? */
export function tileInCone(level: Level, p: Pulse, t: number): boolean {
  return inCone(p.cone, p.x, p.y, (t % level.w) + 0.5, ((t / level.w) | 0) + 0.5);
}
