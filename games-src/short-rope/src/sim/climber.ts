// The climber is two physics points (chest and pelvis) joined by the torso.
// Gripping hands and planted feet are fixed to holds; arms and legs are
// max-length constraints from those holds. While at least one hand grips,
// "muscles" pull the body toward a pose computed from the holds. With no grip
// the muscles switch off and gravity and the rope take over.

import { ANGLE_MULT, BODY, G, HOLD_COST } from './constants'
import type { Climber, Hold, InputFrame, Limb, Pt, Route } from './types'
import { ownHold } from './types'

export interface ClimberEvents {
  emit: (type: string, text?: string) => void
}

const pt = (x: number, y: number): Pt => ({ x, y, px: x, py: y })

export function createClimber(route: Route, mass: number, tired: number): Climber {
  const starts = route.holds.map((h, i) => ({ h, i })).filter((o) => o.h.role === 'start' && ownHold(route, o.h))
  const L = starts[0] ?? { h: route.holds[0], i: 0 }
  const R = starts[1] ?? L
  const cx = (L.h.x + R.h.x) / 2
  const limb = (x: number, y: number, hold: number): Limb => ({ x, y, hold, state: 1 })
  return {
    mass,
    chest: pt(cx, 0.88 + BODY.torso),
    pelvis: pt(cx, 0.88),
    hands: [limb(L.h.x, L.h.y, L.i), limb(R.h.x, R.h.y, R.i)],
    feet: [limb(cx - 0.16, 0, -2), limb(cx + 0.16, 0, -2)],
    pump: [tired, tired],
    popT: [0, 0],
    chalk: [0, 0],
    chalking: null,
    hipsIn: false,
    shaking: 0,
    clip: null,
    footHint: [-1, -1],
    clipHint: -1,
    mult: 1,
    feetOn: 2,
    footCool: [0, 0],
    footCoolHold: [-1, -1],
  }
}

export function holdPos(route: Route, idx: number, x: number): [number, number] {
  if (idx === -2) return [x, 0]
  const h = route.holds[idx]
  return [h.x, h.y]
}

export function grips(c: Climber): number {
  return (c.hands[0].state === 1 ? 1 : 0) + (c.hands[1].state === 1 ? 1 : 0)
}

export function onGround(c: Climber): boolean {
  return c.feet.some((f) => f.state === 1 && f.hold === -2)
}

export function planted(c: Climber): Limb[] {
  return c.feet.filter((f) => f.state === 1)
}

function usedByHands(c: Climber, idx: number): boolean {
  return c.hands.some((h) => h.state === 1 && h.hold === idx)
}

/** Best new foothold for a foot: high enough to make progress, within leg reach, on the right side. */
export function footCandidate(c: Climber, route: Route, side: number): number {
  const p = c.pelvis
  const foot = c.feet[side < 0 ? 0 : 1]
  const other = c.feet[side < 0 ? 1 : 0]
  let best = -1
  let bestScore = Infinity
  const fi = side < 0 ? 0 : 1
  // where the muscles are taking the pelvis: a foothold out of reach from there would just come off again
  const tgt = poseTarget(c)
  const gx = tgt ? tgt.x * 0.8 + p.x * 0.2 : p.x
  const gy = tgt ? tgt.chestY - BODY.torso : p.y
  const consider = (idx: number, x: number, y: number) => {
    if (idx === foot.hold && foot.state === 1) return
    if (c.footCool[fi] > 0 && idx === c.footCoolHold[fi]) return
    if (idx !== -2 && other.state === 1 && other.hold === idx) return
    if (idx >= 0 && usedByHands(c, idx)) return
    if (y > p.y - 0.2) return
    if (Math.hypot(x - p.x, y - p.y) > BODY.leg - 0.02) return
    if (idx !== -2 && Math.hypot(x - gx, y - gy) > BODY.leg) return
    if (side < 0 ? x > p.x + 0.18 : x < p.x - 0.18) return
    const score = Math.abs(x - (p.x + side * 0.2)) + Math.abs(y - (p.y - 0.42)) * 1.2
    if (score < bestScore) {
      bestScore = score
      best = idx
    }
  }
  // feet stay on the route's own colour
  route.holds.forEach((h, i) => ownHold(route, h) && consider(i, h.x, h.y))
  if (p.y < 1.3) consider(-2, p.x + side * 0.16, 0)
  return best
}

function nearestHandHold(c: Climber, route: Route, x: number, y: number): number {
  let best = -1
  let bd = BODY.snap
  route.holds.forEach((h: Hold, i) => {
    if (h.type === 'foot') return
    // on a gym wall a hold of your own colour wins a close call against another colour
    const d = Math.hypot(h.x - x, h.y - y) - (ownHold(route, h) ? 0.06 : 0)
    if (d < bd) {
      bd = d
      best = i
    }
  })
  void c
  return best
}

export interface ControlCtx {
  route: Route
  prev: InputFrame['seq']
  autoFeet: boolean
  /** rope tension at the harness (N) */
  Tharness: number
  falling: boolean
  ev: ClimberEvents
}

/** Once-per-frame climber logic: hands, feet, chalk, pump. */
export function controlClimber(c: Climber, inp: InputFrame, ctx: ControlCtx, dt: number): void {
  const { route } = ctx
  c.hipsIn = inp.hipsIn
  c.shaking = inp.shake ? 1 : 0
  const speed = Math.hypot(c.pelvis.x - c.pelvis.px, c.pelvis.y - c.pelvis.py) / (dt / 8)
  const reachR = c.hipsIn ? BODY.reachHipsIn : BODY.reach

  // hands
  for (let i = 0; i < 2; i++) {
    const hand = c.hands[i]
    const want = inp.hands[i]
    if (c.clip && c.clip.hand === i) continue
    if (c.chalking && c.chalking.hand === i) continue
    if (want.down) {
      if (hand.state !== 2) {
        hand.state = 2
        hand.hold = -1
      }
      // move toward the target, clamped to arm reach from the chest
      let tx = want.x - c.chest.x
      let ty = want.y - c.chest.y
      const d = Math.hypot(tx, ty)
      if (d > reachR) {
        tx = (tx / d) * reachR
        ty = (ty / d) * reachR
      }
      const gx = c.chest.x + tx, gy = c.chest.y + ty
      const step = 5 * dt
      const dx = gx - hand.x, dy = gy - hand.y
      const dl = Math.hypot(dx, dy)
      if (dl <= step) {
        hand.x = gx
        hand.y = gy
      } else {
        hand.x += (dx / dl) * step
        hand.y += (dy / dl) * step
      }
    } else if (hand.state === 2) {
      const idx = speed < 3 ? nearestHandHold(c, route, hand.x, hand.y) : -1
      if (idx >= 0) {
        hand.state = 1
        hand.hold = idx
        hand.x = route.holds[idx].x
        hand.y = route.holds[idx].y
        // the hold may sit a little past full reach: start with that much give and pull in
        hand.ext = Math.max(0, Math.hypot(hand.x - c.chest.x, hand.y - c.chest.y) - BODY.reach)
        c.popT[i] = 0
        const held = route.holds[idx]
        ctx.ev.emit('grab', held.type)
        if (!ownHold(route, held)) ctx.ev.emit('offroute', `${route.wall!.colours[held.r!]}`)
        else if (held.role === 'top') ctx.ev.emit('tophold')
      } else {
        hand.state = 0
        hand.hold = -1
      }
    }
  }

  // feet: Q / E step to the best foothold, or auto feet
  c.footCool[0] = Math.max(0, c.footCool[0] - dt)
  c.footCool[1] = Math.max(0, c.footCool[1] - dt)
  c.footHint = [footCandidate(c, route, -1), footCandidate(c, route, 1)]
  const pressed = [inp.seq.footL !== ctx.prev.footL, inp.seq.footR !== ctx.prev.footR]
  for (let i = 0; i < 2; i++) {
    const foot = c.feet[i]
    const cand = i === 1 ? footCandidate(c, route, 1) : c.footHint[i]
    let go = pressed[i]
    if (ctx.autoFeet && !ctx.falling && cand !== -1) {
      const cur = foot.state === 1 ? holdPos(route, foot.hold, foot.x)[1] : -99
      const cy = holdPos(route, cand, c.pelvis.x)[1]
      if (foot.state !== 1 || cy > cur + 0.25) go = true
    }
    if (!go) continue
    if (cand !== -1 && !ctx.falling) {
      const [x, y] = holdPos(route, cand, c.pelvis.x + (i ? 0.16 : -0.16))
      foot.hold = cand
      foot.state = 1
      foot.x = x
      foot.y = y
      ctx.ev.emit('step')
    } else if (pressed[i] && foot.state === 1 && foot.hold !== -2) {
      foot.state = 0
      foot.hold = -1
    }
  }

  // chalk: a free hand dips into the bag
  if (inp.seq.chalk !== ctx.prev.chalk && !c.chalking) {
    const free = c.hands.findIndex((h, i) => h.state !== 1 && !(c.clip && c.clip.hand === i))
    if (free >= 0) {
      c.chalking = { hand: free, t: 0 }
      c.hands[free].state = 0
      ctx.ev.emit('chalk')
    } else ctx.ev.emit('hint', 'Let go with one hand to chalk up')
  }
  if (c.chalking) {
    c.chalking.t += dt
    const h = c.hands[c.chalking.hand]
    h.x += (c.pelvis.x + (c.chalking.hand ? 0.1 : -0.1) - h.x) * Math.min(1, dt * 12)
    h.y += (c.pelvis.y - 0.05 - h.y) * Math.min(1, dt * 12)
    if (c.chalking.t > 0.8) {
      c.chalk[c.chalking.hand] = 12
      c.chalking = null
    }
  }
  c.chalk[0] = Math.max(0, c.chalk[0] - dt)
  c.chalk[1] = Math.max(0, c.chalk[1] - dt)

  updatePump(c, ctx, dt)
}

function updatePump(c: Climber, ctx: ControlCtx, dt: number): void {
  const { route } = ctx
  const feetOn = planted(c).length
  c.feetOn = feetOn
  const ground = onGround(c)
  let posture = feetOn === 0 ? 2.0 : feetOn === 1 ? 1.0 : 0.75
  if (c.hipsIn) posture *= 0.85
  const angle = ANGLE_MULT[route.angle] ?? 1
  c.mult = posture * angle
  const anyGrip = grips(c) > 0
  const drag = ctx.falling ? 1 : 1 + ctx.Tharness / 500
  for (let i = 0; i < 2; i++) {
    const hand = c.hands[i]
    let rate: number
    if (hand.state === 1) {
      const hold = route.holds[hand.hold]
      const bent = Math.hypot(c.chest.x - hand.x, c.chest.y - hand.y) < 0.62
      let m = c.mult * drag * (c.chalk[i] > 0 ? 0.8 : 1)
      if (bent) m *= hold.type === 'sloper' ? 2.4 : 1.3
      rate = HOLD_COST[hold.type] * m
      if (hold.type === 'jug' && feetOn > 0) rate = c.hipsIn ? -4 : -3
      if (ground) rate = -6
    } else if (!anyGrip) {
      rate = -6
    } else {
      rate = c.shaking ? -13 : -4
    }
    c.pump[i] = Math.max(0, Math.min(100, c.pump[i] + rate * dt))
    if (hand.state === 1 && c.pump[i] >= 100) {
      c.popT[i] += dt
      if (c.popT[i] > 0.55) {
        hand.state = 0
        hand.hold = -1
        c.popT[i] = 0
        ctx.ev.emit('pop', i ? 'Right hand popped!' : 'Left hand popped!')
      }
    } else c.popT[i] = 0
  }
}

/** Pose the muscles aim for, from the holds in use. Null when nothing holds the body. */
export function poseTarget(c: Climber): { x: number; chestY: number } | null {
  const hs = c.hands.filter((h) => h.state === 1)
  const fs = planted(c)
  if (hs.length === 0 && !onGround(c)) return null
  let sx = 0, w = 0
  for (const h of hs) {
    sx += h.x
    w += 1
  }
  for (const f of fs) {
    sx += f.x * 0.6
    w += 0.6
  }
  const x = w > 0 ? sx / w : c.chest.x
  let chestY: number
  if (fs.length) {
    chestY = fs.reduce((a, f) => a + f.y, 0) / fs.length + BODY.stand + BODY.torso
    // rest on straight arms: don't stand up higher than the arms want
    if (hs.length) chestY = Math.min(chestY, Math.max(...hs.map((h) => h.y)) - 0.64)
  } else if (hs.length === 2) {
    const half = Math.hypot(hs[0].x - hs[1].x, hs[0].y - hs[1].y) / 2
    const drop = Math.sqrt(Math.max(0, BODY.reach ** 2 - Math.max(0, half - 0.15) ** 2))
    chestY = (hs[0].y + hs[1].y) / 2 - drop * 0.95
  } else {
    chestY = hs[0].y - BODY.reach * 0.95
  }
  // lock off: when one hand reaches up, pull the chest up toward the other hand
  const reaching = c.hands.find((h) => h.state === 2)
  let straining = false
  if (reaching && hs.length === 1 && reaching.y > c.chest.y + 0.15) {
    chestY = Math.max(chestY, hs[0].y - 0.2)
    // at full stretch the climber pulls through even if the feet cut loose
    straining = Math.hypot(reaching.x - c.chest.x, reaching.y - c.chest.y) > (c.hipsIn ? BODY.reachHipsIn : BODY.reach) - 0.03
  }
  // legs can only push so far; a trailing lower foot just cuts loose
  if (fs.length && !straining) {
    const f = fs.reduce((a, b) => (b.y > a.y ? b : a))
    const dx = x - f.x
    const cap = f.y + Math.sqrt(Math.max(0, BODY.leg ** 2 - dx * dx)) - 0.03 + BODY.torso
    chestY = Math.min(chestY, cap)
  }
  // no mantling in v1: the chest stays below the highest grip
  if (hs.length) chestY = Math.min(chestY, Math.max(...hs.map((h) => h.y)) + 0.1)
  return { x, chestY }
}

const MUSCLE_K = 140
const MUSCLE_C = 22
const MUSCLE_MAX = 3 * G

/** One physics substep. force is the rope pull on the harness (N). */
export function substepClimber(c: Climber, h: number, force: [number, number], ev: ClimberEvents): void {
  const target = poseTarget(c)
  const parts: [Pt, number, number][] = target
    ? [
        [c.chest, target.x, target.chestY],
        [c.pelvis, target.x * 0.8 + c.pelvis.x * 0.2, target.chestY - BODY.torso],
      ]
    : [
        [c.chest, 0, 0],
        [c.pelvis, 0, 0],
      ]
  // a stretched grab's give shrinks over about a fifth of a second
  for (const hand of c.hands) if (hand.ext) hand.ext = Math.max(0, hand.ext - 1.2 * h)
  for (const [p, tx, ty] of parts) {
    const vx = (p.x - p.px) / h
    const vy = (p.y - p.py) / h
    let ax = force[0] / c.mass
    let ay = force[1] / c.mass - G
    if (target) {
      let mx = MUSCLE_K * (tx - p.x) - MUSCLE_C * vx
      let my = G + MUSCLE_K * (ty - p.y) - MUSCLE_C * vy
      const m = Math.hypot(mx, my)
      if (m > MUSCLE_MAX) {
        mx = (mx / m) * MUSCLE_MAX
        my = (my / m) * MUSCLE_MAX
      }
      ax += mx
      ay += my
    }
    const damp = 0.9995
    p.px = p.x
    p.py = p.y
    p.x += vx * h * damp + ax * h * h
    p.y += vy * h * damp + ay * h * h
  }
  project(c, ev)
  // safety net: a body held by its hands never moves faster than a lunge.
  // Constraint corrections become velocity in this kind of solver, and a big
  // one would otherwise fling the climber across the wall.
  if (target && grips(c) > 0) {
    for (const p of [c.chest, c.pelvis]) {
      const vx = (p.x - p.px) / h, vy = (p.y - p.py) / h
      const v = Math.hypot(vx, vy)
      if (v > MAX_HELD_SPEED) {
        p.px = p.x - (vx / v) * MAX_HELD_SPEED * h
        p.py = p.y - (vy / v) * MAX_HELD_SPEED * h
      }
    }
  }
}

const MAX_HELD_SPEED = 4

function project(c: Climber, ev: ClimberEvents): void {
  for (let it = 0; it < 4; it++) {
    // torso
    const dx = c.chest.x - c.pelvis.x, dy = c.chest.y - c.pelvis.y
    const d = Math.hypot(dx, dy) || 1e-6
    const k = (d - BODY.torso) / d / 2
    c.chest.x -= dx * k
    c.chest.y -= dy * k
    c.pelvis.x += dx * k
    c.pelvis.y += dy * k
    // gripping hands hold the chest within arm reach
    for (const hand of c.hands) {
      if (hand.state !== 1) continue
      maxDist(c.chest, hand.x, hand.y, BODY.reach + (hand.ext ?? 0))
    }
    // feet can only push: when the body moves out of leg reach the foot comes off
    for (const foot of c.feet) {
      if (foot.state !== 1) continue
      const fd = Math.hypot(c.pelvis.x - foot.x, c.pelvis.y - foot.y)
      if (fd > BODY.leg + 0.04) {
        const i = c.feet.indexOf(foot)
        c.footCool[i] = 1.2
        c.footCoolHold[i] = foot.hold
        foot.state = 0
        foot.hold = -1
        // a trailing foot left behind is normal; losing the last foot is a slip
        if (foot.y > 0 && planted(c).length === 0) ev.emit('footslip')
      }
    }
    // ground
    if (c.pelvis.y < 0.3) c.pelvis.y = 0.3
    if (c.chest.y < 0.3) c.chest.y = 0.3
  }
}

function maxDist(p: Pt, x: number, y: number, max: number): void {
  const dx = p.x - x, dy = p.y - y
  const d = Math.hypot(dx, dy)
  if (d > max) {
    p.x = x + (dx / d) * max
    p.y = y + (dy / d) * max
  }
}

/** Free limbs follow the body: arms hang (or fly up in a fall), feet dangle. */
export function settleFreeLimbs(c: Climber, falling: boolean, dt: number): void {
  const k = Math.min(1, dt * 10)
  c.hands.forEach((hand, i) => {
    if (hand.state !== 0) return
    if (c.chalking && c.chalking.hand === i) return
    if (c.clip && c.clip.hand === i) return
    const s = i ? 1 : -1
    const tx = c.chest.x + s * (falling ? 0.32 : 0.2)
    const ty = c.chest.y + (falling ? 0.45 : -0.45)
    hand.x += (tx - hand.x) * k
    hand.y += (ty - hand.y) * k
  })
  c.feet.forEach((foot, i) => {
    if (foot.state !== 0) return
    const s = i ? 1 : -1
    foot.x += (c.pelvis.x + s * 0.17 - foot.x) * k
    foot.y += (c.pelvis.y - 0.82 - foot.y) * k
  })
}
