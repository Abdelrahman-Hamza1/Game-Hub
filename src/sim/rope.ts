// The rope is a chain of straight sections between anchor points:
// belay device -> clipped quickdraws (in clip order) -> the leader's harness.
// Each section has an unstretched length s. When the distance d between its
// ends is larger than s the section is taut and carries tension EA*(d-s)/s.
// Rope slides through a quickdraw only when the tension on one side beats the
// other side times the capstan ratio exp(mu*theta), plus a little drag.
// That gives rope drag on zigzags, short-roping and fall forces for free.

import { ROPE } from './constants'
import type { RopeState } from './types'

export const DEVICE = -1
export const HARNESS = -2

export type PointFn = (anchor: number) => [number, number]

export function elastic(s: number, d: number): number {
  return d > s ? (ROPE.EA * (d - s)) / s : 0
}

export function createRope(device: [number, number], harness: [number, number], slack: number): RopeState {
  const d = Math.hypot(harness[0] - device[0], harness[1] - device[1])
  return { path: [DEVICE, HARNESS], s: [d + slack], dPrev: [d], T: [0], demand: 0 }
}

export function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

export function sectionDistances(rope: RopeState, pt: PointFn): number[] {
  const out: number[] = []
  for (let i = 0; i < rope.path.length - 1; i++) out.push(dist(pt(rope.path[i]), pt(rope.path[i + 1])))
  out[out.length - 1] += rope.demand
  return out
}

/** Bend angle at anchor index i (0 = straight through, PI = full U-turn) */
export function bendAngle(rope: RopeState, pt: PointFn, i: number): number {
  const a = pt(rope.path[i - 1])
  const b = pt(rope.path[i])
  const c = pt(rope.path[i + 1])
  const ux = a[0] - b[0], uy = a[1] - b[1]
  const vx = c[0] - b[0], vy = c[1] - b[1]
  const lu = Math.hypot(ux, uy) || 1e-6
  const lv = Math.hypot(vx, vy) || 1e-6
  const cos = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))
  return Math.PI - Math.acos(cos)
}

/** Rope that sits in the system without load, summed over all sections */
export function totalSlack(rope: RopeState, pt: PointFn): number {
  const d = sectionDistances(rope, pt)
  let s = 0
  for (let i = 0; i < d.length; i++) s += Math.max(0, rope.s[i] - d[i])
  return s
}

export function ropeOut(rope: RopeState): number {
  return rope.s.reduce((a, b) => a + b, 0)
}

/** Move rope between neighbouring sections a=i, b=i+1 through anchor i+1 until friction balances. */
function balanceAt(rope: RopeState, d: number[], i: number, ratio: number, drag: number): void {
  const a = i, b = i + 1
  const sa = rope.s[a], sb = rope.s[b]
  const min = ROPE.minSection
  // toward b (climber side) if b pulls harder than a can hold
  const fwd = (x: number) => elastic(sb + x, d[b]) - ratio * elastic(sa - x, d[a]) - drag
  const back = (x: number) => elastic(sa + x, d[a]) - ratio * elastic(sb - x, d[b]) - drag
  if (fwd(0) > 0) {
    const x = solveDecreasing(fwd, 0, Math.max(0, sa - min))
    rope.s[a] = sa - x
    rope.s[b] = sb + x
  } else if (back(0) > 0) {
    const x = solveDecreasing(back, 0, Math.max(0, sb - min))
    rope.s[a] = sa + x
    rope.s[b] = sb - x
  }
}

function solveDecreasing(f: (x: number) => number, lo: number, hi: number): number {
  if (f(hi) >= 0) return hi
  for (let k = 0; k < 28; k++) {
    const mid = (lo + hi) / 2
    if (f(mid) > 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export interface RopeStepResult {
  /** force on the harness (N), pointing toward the previous anchor */
  harness: [number, number]
  /** force on the belay device (N), pointing toward the first draw / climber */
  device: [number, number]
  /** rope that slipped through the device this step (m) */
  slip: number
  /** tension at the harness (N) */
  Tharness: number
}

/**
 * Advance the rope by h seconds.
 * @param hold force the belay device holds before rope slips through it (N)
 * @param payout rope deliberately paid out (+) or taken in (-) at the device this step (m)
 */
export function stepRope(rope: RopeState, pt: PointFn, h: number, hold: number, payout: number): RopeStepResult {
  const n = rope.s.length
  // belayer feeds or takes in at the device end (section 0)
  if (payout !== 0) {
    const out = ropeOut(rope)
    const add = payout > 0 ? Math.min(payout, ROPE.length - out) : payout
    rope.s[0] = Math.max(0.2, rope.s[0] + add)
  }
  const d = sectionDistances(rope, pt)
  // redistribute through every quickdraw, a forward and a backward pass
  for (let pass = 0; pass < 2; pass++) {
    const order = pass === 0 ? range(n - 1) : range(n - 1).reverse()
    for (const i of order) {
      const theta = bendAngle(rope, pt, i + 1)
      balanceAt(rope, d, i, Math.exp(ROPE.mu * theta), ROPE.dragPerRad * theta)
    }
  }
  // the device lets rope slip when its section pulls harder than it holds
  let slip = 0
  const T0 = elastic(rope.s[0], d[0])
  if (T0 > hold) {
    const s0 = (ROPE.EA * d[0]) / (ROPE.EA + hold)
    const room = ROPE.length - ropeOut(rope)
    slip = Math.min(s0 - rope.s[0], room)
    rope.s[0] += slip
  }
  // tensions with damping
  for (let i = 0; i < n; i++) {
    const e = elastic(rope.s[i], d[i])
    let T = e
    if (e > 0) {
      const rate = (d[i] - rope.dPrev[i]) / h / rope.s[i]
      T = Math.max(0, e + ROPE.damping * ROPE.EA * rate)
    }
    rope.T[i] = T
    rope.dPrev[i] = d[i]
  }
  const hp = pt(HARNESS), prev = pt(rope.path[n - 1])
  const dv = pt(DEVICE), next = pt(rope.path[1])
  return {
    harness: scaleTo(prev[0] - hp[0], prev[1] - hp[1], rope.T[n - 1]),
    device: scaleTo(next[0] - dv[0], next[1] - dv[1], rope.T[0]),
    slip,
    Tharness: rope.T[n - 1],
  }
}

function scaleTo(x: number, y: number, m: number): [number, number] {
  const l = Math.hypot(x, y)
  if (l < 1e-6) return [0, 0]
  return [(x / l) * m, (y / l) * m]
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i)
}

/** Insert a draw into the path just before the harness, splitting the last section. */
export function clipDraw(rope: RopeState, pt: PointFn, draw: number): void {
  const n = rope.s.length
  const last = rope.path[n - 1]
  const a = dist(pt(last), pt(draw))
  const total = rope.s[n - 1]
  const first = Math.min(total - ROPE.minSection, a)
  rope.path.splice(n, 0, draw)
  rope.s.splice(n - 1, 1, first, Math.max(ROPE.minSection, total - first))
  rope.dPrev.splice(n - 1, 1, a, dist(pt(draw), pt(HARNESS)))
  rope.T.splice(n - 1, 1, 0, 0)
}

/** Remove a draw from the path (it unclipped itself), merging its two sections. */
export function unclipDraw(rope: RopeState, draw: number): boolean {
  const i = rope.path.indexOf(draw)
  if (i <= 0) return false
  rope.path.splice(i, 1)
  const merged = rope.s[i - 1] + rope.s[i]
  rope.s.splice(i - 1, 2, merged)
  rope.dPrev.splice(i - 1, 2, rope.dPrev[i - 1] + rope.dPrev[i])
  rope.T.splice(i - 1, 2, Math.max(rope.T[i - 1], rope.T[i]))
  return true
}
