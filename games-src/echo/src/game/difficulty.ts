/** Difficulty settings (brief §7). */
export type DifficultyId = 'guide' | 'blind' | 'hardcore';

export interface Difficulty {
  id: DifficultyId;
  label: string;
  blurb: string;
  /** Echo memory decay time constant, seconds. */
  memoryTau: number;
  /** Listener hearing multiplier. */
  hearing: number;
  stoneDelta: number;
  checkpoints: boolean;
  /** Fails allowed per chapter before it restarts (hard-core only). */
  chapterFails: number | null;
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  guide: {
    id: 'guide',
    label: 'Guide',
    blurb: 'Echoes linger for 30 s. Listeners hear less. +3 stones. Checkpoints at tourists.',
    memoryTau: 30,
    hearing: 0.75,
    stoneDelta: 3,
    checkpoints: true,
    chapterFails: null,
  },
  blind: {
    id: 'blind',
    label: 'Blind',
    blurb: 'The intended game. Echoes fade in about 2 s.',
    memoryTau: 2,
    hearing: 1,
    stoneDelta: 0,
    checkpoints: false,
    chapterFails: null,
  },
  hardcore: {
    id: 'hardcore',
    label: 'Hard-core',
    blurb: 'You only see while the ring passes. Listeners hear twice as far. −2 stones. 3 fails restart the chapter.',
    memoryTau: 0.08,
    hearing: 2,
    stoneDelta: -2,
    checkpoints: false,
    chapterFails: 3,
  },
};

export function stonesFor(listed: number, d: Difficulty): number {
  if (d.stoneDelta < 0) return Math.max(1, listed + d.stoneDelta);
  return listed + d.stoneDelta;
}
