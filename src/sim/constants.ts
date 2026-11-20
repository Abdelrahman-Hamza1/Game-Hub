import type { HoldType, WallAngle } from './types'

export const G = 9.81

/** Body dimensions (m) */
export const BODY = {
  torso: 0.5,
  upperArm: 0.31,
  foreArm: 0.31,
  /** max distance from chest (shoulder centre) to a gripping hand */
  reach: 0.85,
  reachHipsIn: 0.78,
  thigh: 0.46,
  shin: 0.46,
  /** max distance from pelvis to a planted foot */
  leg: 0.92,
  /** pelvis height above feet when standing on holds */
  stand: 0.8,
  /** distance within which a released hand grabs a hold */
  snap: 0.2,
}

/** Rope: a dynamic single rope, roughly 9.5 mm */
export const ROPE = {
  /** axial stiffness EA (N) */
  EA: 26000,
  /** damping as a fraction of EA per unit strain rate (s) */
  damping: 0.012,
  length: 60,
  /** carabiner friction coefficient for the capstan ratio exp(mu * theta) */
  mu: 0.17,
  /** extra friction per radian of bend (N), gives rope drag on zigzags */
  dragPerRad: 12,
  minSection: 0.05,
}

/** Belay device hold force by mode (N) */
export const DEVICE = {
  /** a relaxed brake hand: holds a hanging climber, lets a real fall run */
  idle: 600,
  /** after a "Falling!" call the belayer is ready */
  idleAlert: 1500,
  /** a soft catch lets rope slip at this force for a moment */
  soft: 1100,
  softTime: 0.45,
  feed: 700,
  locked: 1e9,
  feedRate: 1.4,
  takeRate: 1.0,
}

/** Pump drain per second while gripping (% / s) */
export const HOLD_COST: Record<HoldType, number> = {
  jug: 3,
  pinch: 9,
  sloper: 10,
  pocket: 12,
  crimp: 14,
  foot: 20,
}

export const ANGLE_MULT: Record<WallAngle, number> = {
  slab: 0.8,
  vertical: 1.0,
  overhang: 1.3,
  steep: 1.6,
  roof: 2.0,
}

export const ANGLE_LABEL: Record<WallAngle, string> = {
  slab: 'Slab',
  vertical: 'Vertical',
  overhang: 'Slight overhang · 20°',
  steep: 'Steep overhang · 45°',
  roof: 'Roof',
}

/** French grades used by the crag, easiest first */
export const GRADES = ['5a', '5b', '5c', '6a', '6a+', '6b', '6b+', '6c', '7a', '7a+', '7b', '7b+']

export const YDS: Record<string, string> = {
  '5a': '5.7',
  '5b': '5.8',
  '5c': '5.9',
  '6a': '5.10a',
  '6a+': '5.10b',
  '6b': '5.10c',
  '6b+': '5.10d',
  '6c': '5.11a/b',
  '7a': '5.11d',
  '7a+': '5.12a',
  '7b': '5.12b',
  '7b+': '5.12c',
}

export const CALLS: { id: number; text: string; role: 'leader' | 'belayer'; key: string }[] = [
  { id: 1, text: 'On belay?', role: 'leader', key: '1' },
  { id: 2, text: 'Climbing!', role: 'leader', key: '2' },
  { id: 3, text: 'Clipping!', role: 'leader', key: '3' },
  { id: 4, text: 'Slack!', role: 'leader', key: '4' },
  { id: 5, text: 'Take!', role: 'leader', key: '5' },
  { id: 6, text: 'Falling!', role: 'leader', key: '6' },
  { id: 7, text: 'Watch me!', role: 'leader', key: '7' },
  { id: 8, text: 'Lower!', role: 'leader', key: '8' },
  { id: 9, text: 'Belay on!', role: 'belayer', key: '9' },
  { id: 10, text: 'Got you!', role: 'belayer', key: '0' },
]

export const CALL_BY_ID = new Map(CALLS.map((c) => [c.id, c]))
