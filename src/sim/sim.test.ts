import { describe, expect, it } from 'vitest'
import { CRAG, generateRoute } from './routes'
import { clipDraw, elastic, stepRope, createRope, DEVICE, HARNESS } from './rope'
import { createWorld, pointFn, stepWorld } from './world'
import { emptyInput } from './types'
import { BODY, ROPE } from './constants'

function fallSetup(above: number, slack: number, catchSoft = true) {
  const route = CRAG[3]
  const w = createWorld(route, { leaderMass: 70, belayerMass: 70, tired: 0, autoFeet: false, bot: true })
  const pf = pointFn(w)
  // clip every draw below 8 m, then put the climber `above` metres over the last one
  const draws = w.draws.map((d, i) => ({ d, i })).filter((o) => !o.d.anchor && o.d.y < 8.5)
  const last = draws[draws.length - 1].d
  const c = w.climber
  for (const { d, i } of draws) {
    c.pelvis.x = c.pelvis.px = d.x
    c.pelvis.y = c.pelvis.py = d.y + 0.3
    clipDraw(w.rope, pf, i)
    d.clipped = true
  }
  const y = last.y + above
  c.pelvis.x = c.pelvis.px = last.x + 0.2
  c.pelvis.y = c.pelvis.py = y
  c.chest.x = c.chest.px = last.x + 0.2
  c.chest.y = c.chest.py = y + BODY.torso
  // tidy the rope: every section snug, plus the requested slack at the device end
  const n = w.rope.path.length
  for (let i = 0; i < n - 1; i++) {
    const a = pf(w.rope.path[i]), b = pf(w.rope.path[i + 1])
    w.rope.s[i] = Math.hypot(a[0] - b[0], a[1] - b[1]) + (i === 0 ? slack : 0)
    w.rope.dPrev[i] = w.rope.s[i]
  }
  for (const hand of c.hands) {
    hand.state = 0
    hand.hold = -1
  }
  for (const foot of c.feet) {
    foot.state = 0
    foot.hold = -1
  }
  void catchSoft
  return { w, C: last.y }
}

describe('rope', () => {
  it('has no tension when slack and EA*strain when stretched', () => {
    expect(elastic(10, 9)).toBe(0)
    expect(elastic(10, 11)).toBeCloseTo(ROPE.EA / 10, 0)
  })

  it('friction at a draw holds more on one side than the other', () => {
    const pts: Record<number, [number, number]> = { [DEVICE]: [0, 1], 0: [0, 10], [HARNESS]: [0.2, 6] }
    const pf = (a: number) => pts[a]
    const rope = createRope(pts[DEVICE], [0, 10], 0)
    clipDraw(rope, pf, 0)
    rope.s[0] = 9
    rope.s[1] = 3.8
    for (let i = 0; i < 20; i++) stepRope(rope, pf, 1 / 480, 1e9, 0)
    // climber hanging below the draw: the U-turn makes the climber side pull harder
    expect(rope.T[1]).toBeGreaterThan(rope.T[0])
  })
})

describe('lead fall', () => {
  it('is caught with a plausible drop and force', () => {
    const { w, C } = fallSetup(1.6, 0.5)
    const startY = w.climber.pelvis.y
    const inp = emptyInput()
    for (let i = 0; i < 60 * 5; i++) stepWorld(w, 1 / 60, inp, null)
    const f = w.falls[0]
    expect(f).toBeTruthy()
    const drop = startY - f.lowY
    // reference model (DESIGN.md §7.1): free fall 2h+s = 3.7 m, plus stretch and belayer travel
    expect(drop).toBeGreaterThan(3.5)
    expect(drop).toBeLessThan(7)
    expect(f.peak / 1000).toBeGreaterThan(1.8)
    expect(f.peak / 1000).toBeLessThan(6.5)
    expect(f.result).not.toBe('ground')
    expect(f.lowY).toBeGreaterThan(0.6)
    console.log(`C=${C.toFixed(1)} drop=${drop.toFixed(2)} m peak=${(f.peak / 1000).toFixed(2)} kN result=${f.result}`)
  })

  it('ends in a ground fall low on the route with lots of slack', () => {
    const route = generateRoute({ name: 't', grade: '6a', seed: 5 })
    const w = createWorld(route, { leaderMass: 70, belayerMass: 70, tired: 0, autoFeet: false, bot: true })
    const c = w.climber
    c.pelvis.y = c.pelvis.py = 2.6
    c.chest.y = c.chest.py = 3.1
    w.rope.s[0] += 3
    for (const hand of c.hands) hand.state = 0
    for (const foot of c.feet) foot.state = 0
    for (let i = 0; i < 60 * 3; i++) stepWorld(w, 1 / 60, emptyInput(), null)
    expect(w.end?.reason).toBe('ground')
  })

  it('a hanging climber stays put at about body weight', () => {
    const { w } = fallSetup(0.5, 0.2)
    for (let i = 0; i < 60 * 6; i++) stepWorld(w, 1 / 60, emptyInput(), null)
    const T = w.Tharness
    expect(T).toBeGreaterThan(0.5 * 70 * 9.81)
    expect(T).toBeLessThan(1.6 * 70 * 9.81)
  })
})

describe('routes', () => {
  it('generates a climbable crag', () => {
    for (const r of CRAG) {
      expect(r.holds.length).toBeGreaterThan(15)
      expect(r.bolts.length).toBeGreaterThan(2)
      expect(r.holds.some((h) => h.role === 'top')).toBe(true)
      // consecutive handholds of the generated line stay within reach
      const hands = r.holds.filter((h) => h.type !== 'foot').sort((a, b) => a.y - b.y)
      for (let i = 1; i < hands.length; i++) {
        const gap = hands[i].y - hands[i - 1].y
        expect(gap).toBeLessThan(BODY.reach + 0.3)
      }
    }
  })
})
