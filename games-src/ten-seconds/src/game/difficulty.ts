/** Assist, Normal, Hard-core (DESIGN.md "Difficulty"). */
export type DifficultyId = 'assist' | 'normal' | 'hardcore';

export interface Difficulty {
  id: DifficultyId;
  name: string;
  blurb: string;
  /** loop length multiplier (assist: 10 s → 15 s) */
  loopScale: number;
  /** playback speed for the whole loop */
  speed: number;
  /** playback speed in the last second (1 = none) */
  lastSecond: number;
  /** scrub, trim, re-record, delete */
  timeline: boolean;
  /** the "show next step" hint */
  hints: boolean;
}

export const DIFFICULTY: Record<DifficultyId, Difficulty> = {
  assist: {
    id: 'assist',
    name: 'Assist',
    blurb: '15-second loops, the whole loop at 80% speed, and a "show next step" hint.',
    loopScale: 1.5,
    speed: 0.8,
    lastSecond: 0.8,
    timeline: true,
    hints: true,
  },
  normal: {
    id: 'normal',
    name: 'Normal',
    blurb: '10-second loops. The last second runs at 55% speed. Scrub, trim and re-record freely.',
    loopScale: 1,
    speed: 1,
    lastSecond: 0.55,
    timeline: true,
    hints: false,
  },
  hardcore: {
    id: 'hardcore',
    name: 'Hard-core',
    blurb: 'No slow motion, no scrubbing, trimming or re-recording. Every loop is final. Par + 1 loops at most.',
    loopScale: 1,
    speed: 1,
    lastSecond: 1,
    timeline: false,
    hints: false,
  },
};
