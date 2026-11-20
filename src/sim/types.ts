// Shared data types. Everything here is plain JSON-able data so the host can
// send it to guests as-is.

export type HoldType = 'jug' | 'crimp' | 'sloper' | 'pinch' | 'pocket' | 'foot'
export type WallAngle = 'slab' | 'vertical' | 'overhang' | 'steep' | 'roof'

export interface Hold {
  type: HoldType
  x: number
  y: number
  rot: number
  role?: 'start' | 'top'
}

export interface Route {
  id: string
  name: string
  /** French grade, e.g. "6a+" */
  grade: string
  angle: WallAngle
  /** route-local width in metres (x from 0 to width) */
  width: number
  height: number
  holds: Hold[]
  /** bolt hanger positions; a quickdraw hangs from each */
  bolts: [number, number][]
  anchor: [number, number]
  fa?: { by: string; date: string }
  seed?: number
}

export interface Pt {
  x: number
  y: number
  px: number
  py: number
}

/** Limb state: 0 = free, 1 = gripping/planted, 2 = reaching (hands only) */
export type LimbState = 0 | 1 | 2

export interface Limb {
  x: number
  y: number
  /** hold index, -1 = none, -2 = ground */
  hold: number
  state: LimbState
}

export interface ClipAction {
  draw: number
  hand: number
  t: number
  dur: number
  demand: number
}

export interface Climber {
  mass: number
  chest: Pt
  pelvis: Pt
  hands: [Limb, Limb]
  feet: [Limb, Limb]
  pump: [number, number]
  /** seconds a hand has been at 100% pump */
  popT: [number, number]
  chalk: [number, number]
  chalking: { hand: number; t: number } | null
  hipsIn: boolean
  shaking: number
  clip: ClipAction | null
  footHint: [number, number]
  clipHint: number
  /** drain multiplier from posture, for the HUD */
  mult: number
  feetOn: number
}

export interface Draw {
  x: number
  y: number
  clipped: boolean
  backclip: boolean
  anchor: boolean
}

export interface RopeState {
  /** path of anchor points: -1 = belay device, k >= 0 = draw k, -2 = harness */
  path: number[]
  /** unstretched rope length in each section (path.length - 1 sections) */
  s: number[]
  /** last distance of each section, for damping */
  dPrev: number[]
  /** last tension of each section (N), elastic + damping */
  T: number[]
  /** extra rope the leader is holding up to clip (m) */
  demand: number
}

export type DeviceMode = 'idle' | 'feed' | 'take' | 'lock'

export interface Belayer {
  x: number
  y: number
  vx: number
  vy: number
  mass: number
  grounded: boolean
  mode: DeviceMode
  soft: boolean
  /** seconds left of the "Falling!" alert that widens the catch window */
  alert: number
  /** seconds since lock started */
  lockT: number
  /** seconds the rope has been loaded while locked (for the soft catch) */
  loadT: number
}

export interface FallRecord {
  /** height of the last clip above ground at fall start (m) */
  C: number
  /** distance above that clip (m) */
  h: number
  /** slack in the system (m) */
  s: number
  startY: number
  lowY: number
  peak: number
  soft: boolean
  result: 'ground' | 'brutal' | 'firm' | 'gentle' | 'pending'
  unclipped: number
}

export interface CallEvent {
  id: number
  role: 'leader' | 'belayer'
  t: number
}

export interface InputHand {
  down: boolean
  x: number
  y: number
}

/** One player's input for a frame. Discrete presses are counters so they survive dropped packets. */
export interface InputFrame {
  hands: [InputHand, InputHand]
  hipsIn: boolean
  shake: boolean
  feed: boolean
  take: boolean
  catchHeld: boolean
  soft: boolean
  seq: { footL: number; footR: number; clip: number; chalk: number; call: number; catch: number }
  callId: number
  /** belayer only: how long ago the latest catch press happened on the sender (s) */
  catchAge?: number
}

export function emptyInput(): InputFrame {
  return {
    hands: [
      { down: false, x: 0, y: 0 },
      { down: false, x: 0, y: 0 },
    ],
    hipsIn: false,
    shake: false,
    feed: false,
    take: false,
    catchHeld: false,
    soft: false,
    seq: { footL: 0, footR: 0, clip: 0, chalk: 0, call: 0, catch: 0 },
    callId: 0,
  }
}
