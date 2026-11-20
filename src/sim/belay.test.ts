import { describe, expect, it } from 'vitest'
import { CRAG } from './routes'
import { clipDraw } from './rope'
import { createWorld, pointFn, stepWorld } from './world'
import { emptyInput, type InputFrame } from './types'
import { BODY } from './constants'

function setup(above: number, slack: number) {
  const w = createWorld(CRAG[3], { leaderMass: 70, belayerMass: 70, tired: 0, autoFeet: false, bot: false })
  const pf = pointFn(w)
  const draws = w.draws.map((d, i) => ({ d, i })).filter((o) => !o.d.anchor && o.d.y < 8.5)
  const c = w.climber
  for (const { d, i } of draws) {
    c.pelvis.x = c.pelvis.px = d.x
    c.pelvis.y = c.pelvis.py = d.y + 0.3
    clipDraw(w.rope, pf, i)
    d.clipped = true
  }
  const last = draws[draws.length - 1].d
  c.pelvis.x = c.pelvis.px = c.chest.x = c.chest.px = last.x + 0.2
  c.pelvis.y = c.pelvis.py = last.y + above
  c.chest.y = c.chest.py = last.y + above + BODY.torso
  const n = w.rope.path.length
  for (let i = 0; i < n - 1; i++) {
    const a = pf(w.rope.path[i]), b = pf(w.rope.path[i + 1])
    w.rope.s[i] = Math.hypot(a[0] - b[0], a[1] - b[1]) + (i === 0 ? slack : 0)
    w.rope.dPrev[i] = w.rope.s[i]
  }
  for (const h of c.hands) h.state = 0
  for (const f of c.feet) f.state = 0
  return w
}

/** belayer presses catch after `react` seconds (or never), optionally soft */
function run(react: number | null, soft: boolean) {
  const w = setup(1.6, 0.5)
  const start = w.climber.pelvis.y
  const b: InputFrame = emptyInput()
  for (let i = 0; i < 60 * 5; i++) {
    const t = i / 60
    if (react !== null && t >= react && !b.catchHeld) {
      b.catchHeld = true
      b.soft = soft
      b.seq.catch++
    }
    stepWorld(w, 1 / 60, emptyInput(), b)
  }
  const f = w.falls[0]
  return { drop: start - f.lowY, kN: f.peak / 1000, result: f.result, end: w.end?.reason }
}

describe('human belayer', () => {
  it('catch timing changes the fall', () => {
    const early = run(0.1, false)
    const soft = run(0.45, true)
    const late = run(1.15, false)
    const never = run(null, false)
    console.log(JSON.stringify({ early, soft, late, never }))
    // a late or missing catch lets rope run: longer fall, lower peak force
    expect(never.drop).toBeGreaterThan(early.drop + 0.5)
    expect(never.kN).toBeLessThan(early.kN)
    expect(soft.kN).toBeLessThan(early.kN)
    expect(soft.drop).toBeGreaterThan(early.drop)
    expect(late.drop).toBeGreaterThan(early.drop)
  })
})
