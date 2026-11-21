// One attempt on one route: a leader, a belayer (human or bot) and the rope
// between them. The host runs this; guests only see snapshots of it.

import { BODY, CALL_BY_ID, DEVICE, G } from './constants'
import { controlClimber, createClimber, grips, onGround, settleFreeLimbs, substepClimber } from './climber'
import { clipDraw, createRope, DEVICE as DEV, HARNESS, ropeOut, stepRope, totalSlack, unclipDraw } from './rope'
import type { Belayer, CallEvent, CatchRating, Climber, Draw, FallRecord, InputFrame, RopeState, Route } from './types'
import { emptyInput } from './types'

export const SUBSTEPS = 8
/** where the belayer stands: a step left of the start holds */
export function belayerHome(route: Route): number {
  const starts = route.holds.filter((h) => h.role === 'start')
  const x = starts.length ? Math.min(...starts.map((h) => h.x)) : route.width / 2
  return x - 1.0
}

export interface GameEvent {
  id: number
  type: string
  text?: string
  t: number
}

/** How the belayer did on one attempt. Plain JSON: it goes into the summary. */
export interface BelayStats {
  catches: number
  perfect: number
  late: number
  missed: number
  /** ground falls with the rope clipped: the belayer let them deck */
  dropped: number
  shortRopes: number
  /** seconds with a big loop of slack while the leader was low */
  looseT: number
}

export function emptyBelayStats(): BelayStats {
  return { catches: 0, perfect: 0, late: 0, missed: 0, dropped: 0, shortRopes: 0, looseT: 0 }
}

/** 0–100 and 0–3 stars. A tidy belay with no falls is worth three stars. */
export function belayScore(s: BelayStats): { score: number; stars: number } {
  const raw = 85 + 5 * s.perfect - 20 * s.late - 30 * s.missed - 60 * s.dropped - 12 * s.shortRopes - Math.min(30, 4 * s.looseT)
  const score = Math.max(0, Math.min(100, Math.round(raw)))
  return { score, stars: score >= 85 ? 3 : score >= 65 ? 2 : score >= 40 ? 1 : 0 }
}

export const RATING_LABEL: Record<CatchRating, string> = {
  pending: 'Catch',
  perfect: 'Perfect catch',
  good: 'Good catch',
  late: 'Late catch',
  missed: 'Missed catch',
  dropped: 'Dropped',
}

export interface AttemptEnd {
  reason: 'ground' | 'lowered' | 'gaveup'
  sent: boolean
  topped: boolean
  highPoint: number
  falls: number
}

export interface World {
  t: number
  route: Route
  draws: Draw[]
  climber: Climber
  belayer: Belayer
  rope: RopeState
  topped: boolean
  sent: boolean
  weighted: boolean
  weightT: number
  falls: FallRecord[]
  fall: FallRecord | null
  fallStillT: number
  highPoint: number
  leftGround: boolean
  end: AttemptEnd | null
  calls: CallEvent[]
  events: GameEvent[]
  eventId: number
  slipLog: [number, number][]
  autoFeet: boolean
  bot: BotState | null
  lastSeq: { leader: InputFrame['seq']; belayer: InputFrame['seq'] }
  Tharness: number
  slack: number
  lowerRequested: boolean
  /** the leader sat back on the rope to be lowered; hands stay off */
  letGo: boolean
  /** hanging on the rope after a fall, until a hand grips again */
  hanging: boolean
  belay: BelayStats
  /** world time the leader hit the ground (-1 if they haven't) */
  ouchT: number
}

interface BotState {
  fallT: number
  takeUntil: number
  slackUntil: number
  hopped: boolean
}

export interface WorldOptions {
  leaderMass: number
  belayerMass: number
  tired: number
  autoFeet: boolean
  bot: boolean
}

export function createWorld(route: Route, opt: WorldOptions): World {
  const climber = createClimber(route, opt.leaderMass, opt.tired)
  const draws: Draw[] = route.bolts.map(([x, y]) => ({ x, y: y - 0.18, clipped: false, backclip: false, anchor: false }))
  draws.push({ x: route.anchor[0], y: route.anchor[1] - 0.12, clipped: false, backclip: false, anchor: true })
  const belayer: Belayer = {
    x: belayerHome(route),
    y: 0.95,
    vx: 0,
    vy: 0,
    mass: opt.belayerMass,
    grounded: true,
    mode: 'idle',
    soft: false,
    alert: 0,
    lockT: 0,
    loadT: 0,
  }
  const w: World = {
    t: 0,
    route,
    draws,
    climber,
    belayer,
    rope: null as unknown as RopeState,
    topped: false,
    sent: false,
    weighted: false,
    weightT: 0,
    falls: [],
    fall: null,
    fallStillT: 0,
    highPoint: climber.pelvis.y,
    leftGround: false,
    end: null,
    calls: [],
    events: [],
    eventId: 0,
    slipLog: [],
    autoFeet: opt.autoFeet,
    bot: opt.bot ? { fallT: -1, takeUntil: 0, slackUntil: 0, hopped: false } : null,
    lastSeq: { leader: { ...emptyInput().seq }, belayer: { ...emptyInput().seq } },
    Tharness: 0,
    slack: 1,
    lowerRequested: false,
    letGo: false,
    hanging: false,
    belay: emptyBelayStats(),
    ouchT: -1,
  }
  w.rope = createRope(devicePos(belayer), [climber.pelvis.x, climber.pelvis.y], 1.0)
  return w
}

export function devicePos(b: Belayer): [number, number] {
  return [b.x + 0.25, b.y + 0.05]
}

export function pointFn(w: World) {
  return (a: number): [number, number] => {
    if (a === DEV) return devicePos(w.belayer)
    if (a === HARNESS) return [w.climber.pelvis.x, w.climber.pelvis.y]
    const d = w.draws[a]
    return [d.x, d.y]
  }
}

export function emit(w: World, type: string, text?: string): void {
  w.events.push({ id: ++w.eventId, type, text, t: w.t })
  if (w.events.length > 60) w.events.splice(0, w.events.length - 60)
}

function addCall(w: World, id: number): void {
  const call = CALL_BY_ID.get(id)
  if (!call) return
  w.calls.push({ id, role: call.role, t: w.t })
  if (w.calls.length > 12) w.calls.shift()
  if (id === 6) w.belayer.alert = 1.6 // Falling! widens the catch window
  if (id === 8) requestLower(w)
  if (id === 5 && w.topped) w.letGo = true
  if (w.bot) {
    if (id === 4 || id === 3) w.bot.slackUntil = w.t + 2.5
    if (id === 5) w.bot.takeUntil = w.t + 999
    if (id === 8) w.bot.takeUntil = 0
    if (id === 2) w.bot.takeUntil = 0
  }
}

/** The leader asks to come down: let go and sit back on the rope. */
export function requestLower(w: World): void {
  w.lowerRequested = true
  w.letGo = true
  if (w.bot) w.bot.takeUntil = 0
}

/** Seconds of rope slip to refund when a remote belayer's catch arrives late. */
function refundSlip(w: World, age: number): void {
  const since = w.t - Math.min(0.35, age)
  let refund = 0
  for (const [t, amt] of w.slipLog) if (t >= since) refund += amt
  if (refund > 0) w.rope.s[0] = Math.max(0.3, w.rope.s[0] - refund * 0.8)
}

/** Advance the attempt by dt seconds. */
export function stepWorld(w: World, dt: number, leaderIn: InputFrame, belayIn: InputFrame | null): void {
  if (w.end) return
  const c = w.climber
  const b = w.belayer
  const pf = pointFn(w)
  w.t += dt

  // calls
  // leader calls come from the leader, belayer calls from the belayer
  const roleOf = (id: number) => CALL_BY_ID.get(id)?.role
  if (leaderIn.seq.call !== w.lastSeq.leader.call && roleOf(leaderIn.callId) === 'leader') addCall(w, leaderIn.callId)
  const bIn = belayIn ?? botInput(w)
  if (belayIn && belayIn.seq.call !== w.lastSeq.belayer.call && roleOf(belayIn.callId) === 'belayer') addCall(w, belayIn.callId)

  // belayer controls
  const catchPress = bIn.seq.catch !== w.lastSeq.belayer.catch
  const prevMode = b.mode
  if (bIn.catchHeld) b.mode = 'lock'
  else if (bIn.take) b.mode = 'take'
  else if (bIn.feed) b.mode = 'feed'
  else b.mode = 'idle'
  if (b.mode === 'lock' && prevMode !== 'lock') {
    b.lockT = 0
    b.soft = bIn.soft
    if (bIn.soft && b.grounded) {
      b.vy = 2.1
      b.grounded = false
      emit(w, 'hop')
    }
    if (catchPress && bIn.catchAge) refundSlip(w, bIn.catchAge)
  }
  if (b.mode === 'lock') {
    b.lockT += dt
    if (w.rope.T[0] > 300) b.loadT += dt
  } else b.loadT = 0
  b.alert = Math.max(0, b.alert - dt)

  // climber controls
  const falling = !!w.fall
  let lin = leaderIn
  if (w.letGo) {
    for (const hand of c.hands) if (hand.state !== 0) hand.state = 0
    for (const foot of c.feet) if (foot.hold !== -2) foot.state = 0
    lin = { ...leaderIn, hands: [{ ...leaderIn.hands[0], down: false }, { ...leaderIn.hands[1], down: false }] }
  }
  controlClimber(
    c,
    lin,
    {
      route: w.route,
      prev: w.lastSeq.leader,
      autoFeet: w.autoFeet && !w.letGo,
      Tharness: w.Tharness,
      falling,
      ev: { emit: (t, x) => emit(w, t, x) },
    },
    dt,
  )
  updateClip(w, leaderIn, dt)

  // physics
  const h = dt / SUBSTEPS
  // a soft catch lets rope slip a little while the rope comes tight
  const softSlip = b.mode === 'lock' && b.soft && b.loadT < DEVICE.softTime
  const hold =
    softSlip
      ? DEVICE.soft
      : b.mode === 'lock' || b.mode === 'take'
      ? DEVICE.locked
      : b.mode === 'feed'
        ? DEVICE.feed
        : b.alert > 0
          ? DEVICE.idleAlert
          : DEVICE.idle
  const payout = b.mode === 'feed' ? DEVICE.feedRate * h : b.mode === 'take' ? -DEVICE.takeRate * h : 0
  let force: [number, number] = [0, 0]
  let dforce: [number, number] = [0, 0]
  let slip = 0
  let Tmax = 0
  for (let s = 0; s < SUBSTEPS; s++) {
    substepClimber(c, h, force, { emit: (t, x) => emit(w, t, x) })
    substepBelayer(w, h, dforce)
    w.rope.demand = c.clip ? c.clip.demand * Math.min(1, (c.clip.t / c.clip.dur) * 1.6) : 0
    const r = stepRope(w.rope, pf, h, hold, payout)
    force = r.harness
    dforce = r.device
    slip += r.slip
    Tmax = Math.max(Tmax, r.Tharness)
  }
  w.Tharness = w.rope.T[w.rope.T.length - 1]
  if (slip > 0) {
    w.slipLog.push([w.t, slip])
  }
  while (w.slipLog.length && w.slipLog[0][0] < w.t - 1) w.slipLog.shift()
  w.slack = totalSlack(w.rope, pf)
  settleFreeLimbs(c, !!w.fall, dt)

  trackFalls(w, Tmax, dt)
  checkEnd(w, dt)
  w.lastSeq.leader = { ...leaderIn.seq }
  w.lastSeq.belayer = { ...bIn.seq }
}

function substepBelayer(w: World, h: number, F: [number, number]): void {
  const b = w.belayer
  const m = b.mass
  let ax = F[0] / m
  const ay = F[1] / m - G
  if (b.grounded) {
    const braced = b.mode === 'lock' && !b.soft
    const lift = braced ? 1.35 * m * G : m * G
    if (F[1] > lift) b.grounded = false
    else {
      b.vy = 0
      b.y = 0.95
      const N = m * G - F[1]
      if (Math.abs(F[0]) < 0.8 * N) {
        ax = 0
        b.vx = 0
      } else ax = (F[0] - Math.sign(F[0]) * 0.8 * N) / m
    }
  }
  b.vx += ax * h
  if (!b.grounded) b.vy += ay * h
  b.x += b.vx * h
  b.y += b.vy * h
  if (b.y <= 0.95) {
    if (!b.grounded && b.vy < -1) emit(w, 'land')
    b.y = 0.95
    b.vy = 0
    b.grounded = true
  }
  if (b.y > 3.2) {
    b.y = 3.2
    b.vy = Math.min(0, b.vy)
  }
  const home = belayerHome(w.route)
  b.x = Math.max(home - 1.0, Math.min(home + 1.6, b.x))
  if (b.grounded) b.vx *= 0.9
}

function nearestDraw(w: World): number {
  const c = w.climber
  let best = -1
  let bd = 0.95
  w.draws.forEach((d, i) => {
    if (d.clipped && !d.backclip) return
    const dist = Math.hypot(d.x - c.chest.x, d.y - c.chest.y)
    if (dist < bd) {
      bd = dist
      best = i
    }
  })
  return best
}

function updateClip(w: World, inp: InputFrame, dt: number): void {
  const c = w.climber
  c.clipHint = c.clip ? -1 : nearestDraw(w)
  if (!c.clip && inp.seq.clip !== w.lastSeq.leader.clip) {
    const di = c.clipHint
    if (di < 0) {
      emit(w, 'hint', 'No quickdraw in reach')
      return
    }
    if (grips(c) === 0) {
      emit(w, 'hint', 'Hold on with one hand to clip')
      return
    }
    const free = c.hands.findIndex((h) => h.state !== 1)
    if (free < 0) {
      emit(w, 'hint', 'Let go with one hand to clip')
      return
    }
    const gripHand = 1 - free
    const d = w.draws[di]
    c.hands[free].state = 0
    c.hands[free].hold = -1
    c.clip = {
      draw: di,
      hand: free,
      t: 0,
      dur: 0.85 + c.pump[gripHand] * 0.007,
      demand: Math.hypot(d.x - c.pelvis.x, d.y - c.pelvis.y) + 0.35,
    }
    if (d.clipped && d.backclip) {
      // re-clipping a back-clipped draw just fixes it
      c.clip.demand = 0
    }
    emit(w, 'clipstart')
  }
  if (!c.clip) return
  const clip = c.clip
  const hand = c.hands[clip.hand]
  const d = w.draws[clip.draw]
  const k = Math.min(1, dt * 9)
  hand.x += (d.x - hand.x) * k
  hand.y += (d.y - 0.05 - hand.y) * k
  clip.t += dt
  const pf = pointFn(w)
  if (w.Tharness > 450 && clip.demand > 0) {
    c.clip = null
    c.pump[1 - clip.hand] = Math.min(100, c.pump[1 - clip.hand] + 12)
    w.belay.shortRopes++
    emit(w, 'clipfail', 'Short-roped! Ask for slack')
    return
  }
  if (grips(c) === 0) {
    c.clip = null
    return
  }
  if (clip.t >= clip.dur) {
    c.clip = null
    if (d.clipped && d.backclip) {
      d.backclip = false
      emit(w, 'clip', 'Fixed the back-clip')
      return
    }
    clipDraw(w.rope, pf, clip.draw)
    d.clipped = true
    const gripPump = c.pump[1 - clip.hand]
    d.backclip = !d.anchor && Math.random() < (gripPump / 100) * 0.35
    emit(w, 'clip', d.backclip ? 'Back-clipped! Press F to fix it' : d.anchor ? 'Anchor clipped' : undefined)
    if (d.anchor) {
      w.topped = true
      w.sent = !w.weighted && w.falls.length === 0
      emit(w, 'top', w.sent ? 'Sent!' : 'Top! Clean it next time')
    }
  }
}

function trackFalls(w: World, Tmax: number, dt: number): void {
  const c = w.climber
  const g = grips(c)
  const ground = onGround(c)
  const pf = pointFn(w)
  w.highPoint = Math.max(w.highPoint, c.pelvis.y)
  if (c.pelvis.y > 2.0) w.leftGround = true
  if (g > 0 || ground) w.hanging = false
  // letting go on a tight rope is a rest ("Take!"), not a fall
  if (!w.fall && g === 0 && !ground && !w.hanging && w.Tharness > 0.25 * c.mass * G && w.slack < 0.15) {
    w.hanging = true
    w.weighted = true
  }
  if (!w.fall && g === 0 && !ground && c.pelvis.y > 1.1 && !w.topped && !w.letGo && !w.hanging) {
    const n = w.rope.path.length
    const last = w.rope.path[n - 2]
    const C = last >= 0 ? w.draws[last].y : 0
    w.fall = {
      C,
      h: c.pelvis.y - C,
      s: w.slack,
      startY: c.pelvis.y,
      lowY: c.pelvis.y,
      peak: 0,
      soft: false,
      result: 'pending',
      unclipped: 0,
      t0: w.t,
      rating: 'pending',
      judgeT: -1,
      locked: false,
    }
    w.weighted = true
    w.fallStillT = 0
    emit(w, 'fall')
  }
  const f = w.fall
  if (f) {
    f.lowY = Math.min(f.lowY, c.pelvis.y)
    f.peak = Math.max(f.peak, Tmax)
    if (w.belayer.soft && w.belayer.mode === 'lock') f.soft = true
    if (w.belayer.mode === 'lock') f.locked = true
    // the belayer is judged when the rope comes tight, with a moment's grace on a tight rope
    if (f.judgeT < 0 && w.rope.T[0] > 350) f.judgeT = Math.max(w.t, f.t0 + 0.3)
    if (f.rating === 'pending' && f.judgeT >= 0 && w.t >= f.judgeT) f.rating = w.belayer.mode === 'lock' ? 'good' : 'late'
    // a back-clipped draw can unclip itself under load
    if (Tmax > 2000) {
      for (let i = 0; i < w.draws.length; i++) {
        const d = w.draws[i]
        if (d.clipped && d.backclip && Math.random() < 0.5) {
          if (unclipDraw(w.rope, i)) {
            d.clipped = false
            d.backclip = false
            f.unclipped++
            emit(w, 'unclip', 'The back-clipped draw unclipped itself!')
          }
        } else if (d.backclip) d.backclip = false
      }
    }
    const vy = (c.pelvis.y - c.pelvis.py) * SUBSTEPS / dt
    if (c.pelvis.y < 0.75 && vy < -2.5) {
      f.result = 'ground'
      // decking with a clip above is on the belayer; below the first bolt it's the leader's call
      f.rating = f.C > 0.5 ? 'dropped' : 'missed'
      if (f.C > 0.5) w.belay.dropped++
      w.falls.push(f)
      w.fall = null
      emit(w, 'ground', 'Ground fall!')
      // let the landing play out before the attempt ends
      w.ouchT = w.t
      w.letGo = true
      return
    }
    const speed = Math.hypot(c.pelvis.x - c.pelvis.px, c.pelvis.y - c.pelvis.py) * SUBSTEPS / dt
    if (speed < 0.45 && w.Tharness > 150) w.fallStillT += dt
    else w.fallStillT = 0
    if (w.fallStillT > 0.35 || g > 0) {
      const kN = f.peak / 1000
      f.result = kN > 5 ? 'brutal' : kN > 3.6 ? 'firm' : 'gentle'
      const penalty = f.result === 'brutal' ? 40 : f.result === 'firm' ? 20 : 0
      c.pump[0] = Math.min(100, c.pump[0] + penalty)
      c.pump[1] = Math.min(100, c.pump[1] + penalty)
      w.falls.push(f)
      w.fall = null
      w.hanging = g === 0
      if (f.rating === 'pending') f.rating = f.locked ? 'good' : 'missed'
      if (f.rating === 'late' && !f.locked) f.rating = 'missed'
      if (f.rating === 'good' && f.soft && kN < 4) f.rating = 'perfect'
      w.belay.catches++
      if (f.rating === 'perfect') w.belay.perfect++
      if (f.rating === 'late') w.belay.late++
      if (f.rating === 'missed') w.belay.missed++
      const feel = f.result === 'brutal' ? 'brutal' : f.result === 'firm' ? 'firm' : 'gentle'
      emit(w, 'catch', `${RATING_LABEL[f.rating]} · ${feel} ${kN.toFixed(1)} kN · dropped ${(f.startY - f.lowY).toFixed(1)} m`)
    }
  }
  // resting on the rope counts as weighting it
  if (w.letGo && !w.topped) w.weighted = true
  if (!w.topped && g === 0 && !ground && w.Tharness > 0.4 * c.mass * G) {
    w.weightT += dt
    if (w.weightT > 0.3) w.weighted = true
  } else w.weightT = 0
  // a big loop of slack low on the route is how ground falls happen
  if (!w.fall && !w.topped && !w.lowerRequested && !w.hanging && !c.clip && w.leftGround && c.pelvis.y < 6 && w.slack > 1.8) w.belay.looseT += dt
  void pf
}

function checkEnd(w: World, dt: number): void {
  const c = w.climber
  void dt
  if (w.end) return
  if (w.ouchT >= 0) {
    if (w.t - w.ouchT > 1.4) endAttempt(w, 'ground')
    return
  }
  // back on the ground after leaving it: lowered or down-climbed
  if ((w.leftGround || w.lowerRequested) && !w.fall && grips(c) === 0 && c.pelvis.y < 1.05) {
    c.feet[0] = { x: c.pelvis.x - 0.16, y: 0, hold: -2, state: 1 }
    c.feet[1] = { x: c.pelvis.x + 0.16, y: 0, hold: -2, state: 1 }
    endAttempt(w, 'lowered')
  } else if (w.leftGround && onGround(c) && c.pelvis.y < 1.0 && !w.fall) {
    endAttempt(w, 'lowered')
  }
}

export function endAttempt(w: World, reason: AttemptEnd['reason']): void {
  if (w.end) return
  w.end = {
    reason,
    sent: w.sent && reason !== 'ground',
    topped: w.topped,
    highPoint: w.topped ? w.route.anchor[1] : Math.max(0, w.highPoint),
    falls: w.falls.length,
  }
  emit(w, 'end')
}

// ---------- bot belayer ----------

function botInput(w: World): InputFrame {
  const inp = emptyInput()
  inp.seq = { ...w.lastSeq.belayer }
  const bot = w.bot!
  const c = w.climber
  const g = grips(c)
  if (w.fall) {
    if (bot.fallT < 0) {
      bot.fallT = w.t
      bot.hopped = false
    }
    const since = w.t - bot.fallT
    if (since > 0.22) {
      inp.catchHeld = true
      inp.soft = true
      if (!bot.hopped) {
        inp.seq.catch++
        bot.hopped = true
      }
    }
    return inp
  }
  bot.fallT = -1
  const hanging = g === 0 && !onGround(c)
  if (w.topped || w.lowerRequested) {
    if (hanging) {
      if (w.Tharness < 0.3 * c.mass * G && w.slack > 0.2) inp.take = true
      else inp.feed = true
    } else if (w.slack > 1.5) inp.take = true
    return inp
  }
  if (hanging) {
    // resting on the rope: hold them there until they climb on or ask to come down
    inp.catchHeld = true
    return inp
  }
  if (w.t < bot.takeUntil) {
    if (w.Tharness < 0.5 * c.mass * G && hanging) inp.take = true
    else if (!hanging && w.slack > 0.4) inp.take = true
    else inp.catchHeld = true
    if (g > 0 && !hanging && w.slack < 0.3) bot.takeUntil = 0
    return inp
  }
  const want = c.clip || w.t < bot.slackUntil ? 1.6 : 0.6
  if (w.slack < want - 0.15 || (c.clip && w.Tharness > 50)) inp.feed = true
  else if (w.slack > want + 1.0 && c.pelvis.y > 1.5) inp.take = true
  return inp
}

// ---------- snapshots for the network and the renderer ----------

const r2 = (v: number) => Math.round(v * 100) / 100

export interface Snap {
  t: number
  c: {
    chest: [number, number]
    pelvis: [number, number]
    hands: [number, number, number, number][]
    feet: [number, number, number, number][]
    pump: [number, number]
    chalk: [number, number]
    clip: number
    clipDraw: number
    footHint: [number, number]
    clipHint: number
    mult: number
    feetOn: number
    hipsIn: boolean
    pop: [number, number]
  }
  b: { x: number; y: number; mode: string; soft: boolean; alert: number }
  rope: { pts: [number, number][]; s: number[]; T: number[]; out: number }
  draws: [number, number][]
  fall: FallRecord | null
  lastFall: FallRecord | null
  falls: number
  topped: boolean
  sent: boolean
  weighted: boolean
  hanging: boolean
  high: number
  slack: number
  T: number
  calls: CallEvent[]
  events: GameEvent[]
  end: AttemptEnd | null
  /** seconds since the leader hit the ground, or -1 */
  ouch: number
}

export function snapshot(w: World): Snap {
  const c = w.climber
  const pf = pointFn(w)
  const limb = (l: { x: number; y: number; state: number; hold: number }): [number, number, number, number] => [
    r2(l.x),
    r2(l.y),
    l.state,
    l.hold,
  ]
  return {
    t: r2(w.t),
    c: {
      chest: [r2(c.chest.x), r2(c.chest.y)],
      pelvis: [r2(c.pelvis.x), r2(c.pelvis.y)],
      hands: c.hands.map(limb),
      feet: c.feet.map(limb),
      pump: [Math.round(c.pump[0]), Math.round(c.pump[1])],
      chalk: [c.chalk[0] > 0 ? 1 : 0, c.chalk[1] > 0 ? 1 : 0],
      clip: c.clip ? r2(c.clip.t / c.clip.dur) : -1,
      clipDraw: c.clip ? c.clip.draw : -1,
      footHint: c.footHint,
      clipHint: c.clipHint,
      mult: r2(c.mult),
      feetOn: c.feetOn,
      hipsIn: c.hipsIn,
      pop: [r2(c.popT[0]), r2(c.popT[1])],
    },
    b: { x: r2(w.belayer.x), y: r2(w.belayer.y), mode: w.belayer.mode, soft: w.belayer.soft, alert: r2(w.belayer.alert) },
    rope: {
      pts: w.rope.path.map((a) => pf(a).map(r2) as [number, number]),
      s: w.rope.s.map(r2),
      T: w.rope.T.map((x) => Math.round(x)),
      out: r2(ropeOut(w.rope)),
    },
    draws: w.draws.map((d) => [d.clipped ? 1 : 0, d.backclip ? 1 : 0]),
    fall: w.fall,
    lastFall: w.falls.length ? w.falls[w.falls.length - 1] : null,
    falls: w.falls.length,
    topped: w.topped,
    sent: w.sent,
    weighted: w.weighted,
    hanging: w.hanging,
    high: r2(w.highPoint),
    slack: r2(w.slack),
    T: Math.round(w.Tharness),
    calls: w.calls.filter((k) => w.t - k.t < 4),
    events: w.events.filter((e) => w.t - e.t < 3),
    end: w.end,
    ouch: w.ouchT >= 0 ? r2(w.t - w.ouchT) : -1,
  }
}

export { BODY }
