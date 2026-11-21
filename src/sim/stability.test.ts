import { describe, expect, it } from 'vitest'
import { CRAG } from './routes'
import { scriptedClimb } from './script'
import { createWorld } from './world'

// Regression tests for glitches found in play: teleporting bodies, feet
// flickering on and off a hold, clips failing with a good belayer, a belayer
// bobbing up and down while just feeding rope.
describe('stability', () => {
  for (const idx of [0, 3, 5, 6, 7]) {
    const route = CRAG[idx]
    it(`climbs ${route.name} (${route.grade}) without glitches`, () => {
      const w = createWorld(route, { leaderMass: 70, belayerMass: 70, tired: 0, autoFeet: true, bot: true })
      let prev = [w.climber.chest.x, w.climber.chest.y]
      let maxHeldSpeed = 0
      let toggles = 0
      let feet = w.climber.feet.map((f) => f.state)
      let hops = 0
      let grounded = w.belayer.grounded
      const events: Record<string, number> = {}
      let seen = 0
      scriptedClimb(
        w,
        120,
        () => {
          const c = w.climber
          const v = Math.hypot(c.chest.x - prev[0], c.chest.y - prev[1]) * 60
          prev = [c.chest.x, c.chest.y]
          if (!w.fall && c.hands.some((h) => h.state === 1)) maxHeldSpeed = Math.max(maxHeldSpeed, v)
          c.feet.forEach((f, i) => f.state !== feet[i] && toggles++)
          feet = c.feet.map((f) => f.state)
          if (!w.fall && w.belayer.grounded !== grounded) hops++
          grounded = w.belayer.grounded
          for (const e of w.events) if (e.id > seen) {
            seen = e.id
            events[e.type] = (events[e.type] ?? 0) + 1
          }
        },
        true,
      )
      expect(w.topped).toBe(true)
      // a held body moves at lunge speed at most, never teleports
      expect(maxHeldSpeed).toBeLessThan(8)
      // feet change about once per move, not every frame
      expect(toggles / w.t).toBeLessThan(1.2)
      expect(events.clipfail ?? 0).toBe(0)
      expect(events.footslip ?? 0).toBeLessThanOrEqual(2)
      if (!w.falls.length) expect(hops).toBe(0)
    })
  }
})
