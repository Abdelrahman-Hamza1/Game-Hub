/** Colours per material and sound kind (brief §3.3, §5.1). */
import { Mat } from '../world/level';
import { KIND_INFO, SOUND_KINDS } from '../sound/pulses';

export const BG = '#05060B';
export const PLAYER = '#FFC94D';
export const THREAT = '#FF4D6D';
export const EXIT = '#FFD966';
export const TOURIST = '#FFB36B';
export const SWARM = '#C77DFF';
export const PIT = '#C2304A';

export const MAT_COLOR: Record<Mat, string> = {
  [Mat.Rock]: '#4CC9F0',
  [Mat.Water]: '#3A86FF',
  [Mat.Gravel]: '#D9A86C',
  [Mat.Moss]: '#3E6B4E',
  [Mat.Metal]: '#B8C4D6',
  [Mat.Crystal]: '#C77DFF',
};

/** Moss is very dark on black; walls touching moss use a slightly lifted moss green. */
export const MOSS_WALL = '#4F8A63';

function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

/** Linear blend from a toward b by t. */
export function mix(a: string, b: string, t: number): string {
  const A = parseHex(a);
  const B = parseHex(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${a})`;
}

const wallCache = new Map<string, string>();

/**
 * Echo colour: the material decides the hue (blended 30 % toward the pulse colour); threat sounds
 * paint walls fully pink. High contrast lifts colours toward white.
 */
export function wallColor(base: string, kindIndex: number, highContrast: boolean): string {
  const key = base + kindIndex + (highContrast ? 'h' : '');
  let c = wallCache.get(key);
  if (c) return c;
  const info = KIND_INFO[SOUND_KINDS[kindIndex]];
  c = info.threat ? THREAT : mix(base, info.color, 0.3);
  if (highContrast) c = mix(c, '#FFFFFF', 0.35);
  wallCache.set(key, c);
  return c;
}

export function kindColor(kindIndex: number): string {
  return KIND_INFO[SOUND_KINDS[kindIndex]].color;
}
