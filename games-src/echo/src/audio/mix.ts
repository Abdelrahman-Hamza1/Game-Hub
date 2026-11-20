/** Pure mixing rules (brief §6), kept separate from Web Audio so they can be unit-tested. */
import type { SoundKind } from '../sound/pulses';

/** StereoPannerNode pan from the horizontal offset: clamp(dx / 12, −1, 1). */
export function panFor(dx: number): number {
  return Math.max(-1, Math.min(1, dx / 12));
}

/** How loud each kind is at the source (before distance). */
export const LOUDNESS: Record<SoundKind, number> = {
  step: 0.55, sneak: 0.22, click: 0.5, clap: 0.9, stone: 0.8, cane: 0.4,
  wind: 0.45, drip: 0.5, growl: 0.95, breath: 0.3, call: 0.8, swarm: 0.85, rumble: 0.7, crash: 1,
};

/** Path distance (tiles) beyond which a sound of this radius is silent. */
export function audibleRange(radius: number): number {
  return Math.min(22, Math.max(10, radius * 1.6) + 4);
}

/**
 * Volume by **path** distance (from the sound field), so a Listener behind a wall sounds farther
 * away than one in a straight line. Infinity → silent.
 */
export function gainFor(kind: SoundKind, radius: number, pathDist: number): number {
  if (!Number.isFinite(pathDist)) return 0;
  const k = Math.max(0, 1 - pathDist / audibleRange(radius));
  return LOUDNESS[kind] * Math.pow(k, 1.6);
}

export type RoomSize = 'small' | 'medium' | 'large';

/** Reverb by how many walkable tiles are within 6 tiles of the player. */
export function roomFor(openTiles: number): RoomSize {
  if (openTiles < 45) return 'small';
  if (openTiles < 110) return 'medium';
  return 'large';
}

/** Heartbeat rate: 60 bpm far away, 140 bpm when a Listener is right there. */
export function heartBpm(threatDist: number): number {
  if (!Number.isFinite(threatDist)) return 60;
  const t = Math.max(0, Math.min(1, (12 - threatDist) / 11));
  return 60 + 80 * t;
}

/** Heartbeat loudness: silent beyond 12 tiles, louder as it closes in. */
export function heartGain(threatDist: number): number {
  if (!Number.isFinite(threatDist) || threatDist > 12) return 0;
  return 0.15 + 0.6 * (1 - threatDist / 12);
}

/** Detune factor for a Mimic copy (−30 cents). */
export function detuneRate(cents: number): number {
  return Math.pow(2, cents / 1200);
}

const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];

/** Arrow pointing from the listener toward (dx, dy) in screen space (y down). */
export function arrowFor(dx: number, dy: number): string {
  if (Math.hypot(dx, dy) < 0.75) return '•';
  const a = Math.atan2(dy, dx);
  const i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  return ARROWS[i];
}
