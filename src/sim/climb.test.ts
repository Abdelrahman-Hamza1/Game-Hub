import { describe, expect, it } from 'vitest'
import { CRAG } from './routes'
import { createWorld, stepWorld } from './world'
import { emptyInput } from './types'
import { scriptedClimb } from './script'

describe('scripted climbing', () => {
  for (const idx of [0, 3, 7]) {
    it(`climbs ${CRAG[idx].name} (${CRAG[idx].grade}) with auto feet`, () => {
      const w = createWorld(CRAG[idx], { leaderMass: 70, belayerMass: 70, tired: 0, autoFeet: true, bot: true })
      scriptedClimb(w, 150)
      const clipped = w.draws.filter((d) => d.clipped).length
      console.log(
        `${w.route.name}: high=${w.highPoint.toFixed(1)}/${w.route.height} clipped=${clipped}/${w.draws.length} falls=${w.falls.length} topped=${w.topped} pump=${w.climber.pump.map(Math.round)}`,
      )
      if (idx < 7) expect(w.topped).toBe(true)
      else expect(w.highPoint).toBeGreaterThan(8)
    })
  }
})

describe('top out and lower', () => {
  it('a clean top, a Take! call and the bot lowers to a send', () => {
    const w = createWorld(CRAG[0], { leaderMass: 70, belayerMass: 70, tired: 0, autoFeet: true, bot: true })
    scriptedClimb(w, 150)
    expect(w.topped).toBe(true)
    const inp = emptyInput()
    inp.seq.call = 1
    inp.callId = 5
    for (let i = 0; i < 60 * 40 && !w.end; i++) stepWorld(w, 1 / 60, inp, null)
    expect(w.end?.reason).toBe('lowered')
    expect(w.end?.sent).toBe(w.falls.length === 0)
  })
})
