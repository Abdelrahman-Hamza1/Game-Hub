// Ghost beta: the fastest send of each route is recorded from the snapshots
// this machine saw, kept in the browser, and replayed as a see-through climber
// on later attempts. Every player who watched the send gets the ghost.

import type { Snap } from '../sim/world'

/** values per frame: t, chest, pelvis, two hands, two feet (cm / centiseconds) */
const N = 13
const STEP = 0.1
const MAX_FRAMES = 3600
const KEY = 'short-rope:ghosts'
const KEEP = 25

export interface Ghost {
  routeId: string
  name: string
  /** seconds from tie-in to the anchor */
  time: number
  date: string
  frames: number[]
}

export interface GhostPose {
  chest: [number, number]
  pelvis: [number, number]
  hands: [number, number][]
  feet: [number, number][]
}

export class GhostRecorder {
  frames: number[] = []
  private last = -1

  reset(): void {
    this.frames = []
    this.last = -1
  }

  push(s: Snap): void {
    // a new attempt restarts the world clock
    if (s.t < this.last - 0.5) this.reset()
    if (this.last >= 0 && s.t - this.last < STEP - 1e-6) return
    if (this.frames.length / N >= MAX_FRAMES) return
    // nothing after the anchor: the ghost stops at the top
    if (s.topT >= 0 && s.t > s.topT + 0.5) return
    this.last = s.t
    const c = s.c
    const q = (x: number) => Math.round(x * 100)
    this.frames.push(q(s.t), q(c.chest[0]), q(c.chest[1]), q(c.pelvis[0]), q(c.pelvis[1]))
    for (const l of [...c.hands, ...c.feet]) this.frames.push(q(l[0]), q(l[1]))
  }

  /** a ghost of this attempt, if the recording covers it from the start */
  ghost(routeId: string, name: string, time: number): Ghost | null {
    if (this.frames.length < N * 10 || this.frames[0] > 150) return null
    return { routeId, name, time, date: new Date().toISOString().slice(0, 10), frames: this.frames.slice() }
  }
}

/** Where the ghost is at time t (seconds since tie-in). */
export function ghostPose(g: Ghost, t: number): GhostPose | null {
  const f = g.frames
  const n = Math.floor(f.length / N)
  if (!n) return null
  const T = (i: number) => f[i * N] / 100
  let lo = 0, hi = n - 1
  if (t >= T(hi)) lo = hi
  else if (t <= T(0)) hi = 0
  else {
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (T(mid) <= t) lo = mid
      else hi = mid
    }
  }
  const k = hi === lo ? 0 : (t - T(lo)) / (T(hi) - T(lo))
  const v = (j: number) => (f[lo * N + j] + (f[hi * N + j] - f[lo * N + j]) * k) / 100
  const p = (j: number): [number, number] => [v(j), v(j + 1)]
  return { chest: p(1), pelvis: p(3), hands: [p(5), p(7)], feet: [p(9), p(11)] }
}

type Store = Record<string, Ghost>

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    const s = raw ? (JSON.parse(raw) as Store) : {}
    return s && typeof s === 'object' ? s : {}
  } catch {
    return {}
  }
}

export function loadGhost(routeId: string): Ghost | null {
  const g = load()[routeId]
  return g && Array.isArray(g.frames) && typeof g.time === 'number' ? g : null
}

/** Keep the ghost if it is the fastest send of its route. Returns the time it beat, or null if it didn't. */
export function offerGhost(g: Ghost): { saved: boolean; prev: Ghost | null } {
  const s = load()
  const prev = s[g.routeId] ?? null
  if (prev && prev.time <= g.time) return { saved: false, prev }
  s[g.routeId] = g
  // keep the most recent few routes
  const ids = Object.keys(s).sort((a, b) => (s[b].date > s[a].date ? 1 : -1))
  for (const id of ids.slice(KEEP)) if (id !== g.routeId) delete s[id]
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    return { saved: false, prev }
  }
  return { saved: true, prev }
}
