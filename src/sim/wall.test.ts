import { describe, expect, it } from 'vitest'
import { CRAG, CRAG_WALLS, findWallRoute, randomWall, validWall, wallRoutes } from './routes'
import { createWorld, endAttempt, stepWorld } from './world'
import { emptyInput, ownHold } from './types'
import { BODY } from './constants'

describe('gym walls', () => {
  it('every wall route has its own start, top and bolts, and the colours do not pile up', () => {
    for (const wall of CRAG_WALLS) {
      expect(validWall(wall)).toBe(true)
      for (const r of wallRoutes(wall)) {
        const own = r.holds.filter((h) => ownHold(r, h))
        expect(own.filter((h) => h.role === 'start')).toHaveLength(2)
        expect(own.filter((h) => h.role === 'top')).toHaveLength(1)
        expect(r.bolts.length).toBeGreaterThan(2)
      }
      // holds of different colours keep a little apart
      let close = 0
      for (let i = 0; i < wall.holds.length; i++)
        for (let j = i + 1; j < wall.holds.length; j++) {
          const a = wall.holds[i], b = wall.holds[j]
          if (a.r !== b.r && Math.hypot(a.x - b.x, a.y - b.y) < 0.15) close++
        }
      expect(close).toBeLessThan(3)
    }
    expect(CRAG.length).toBe(12)
  })

  it('finds a wall route by id and checks random walls', () => {
    const wall = randomWall('6b', 'Abood')
    expect(validWall(wall)).toBe(true)
    expect(wall.routes.map((r) => r.grade)).toEqual(['6a+', '6b', '6b+'])
    expect(new Set(wall.routes.map((r) => r.colour)).size).toBe(3)
    const r = findWallRoute([wall], `${wall.id}~1`)
    expect(r?.grade).toBe('6b')
    expect(r?.wall?.own).toBe(1)
  })

  it('grabbing another colour is allowed but the go is no longer a send', () => {
    // a route with a hold of another colour in reach from the start
    let route = CRAG[0]
    let idx = -1
    for (const r of CRAG) {
      const c0 = createWorld(r, { leaderMass: 70, belayerMass: 70, tired: 0, autoFeet: true, bot: true }).climber
      let bd = 9
      r.holds.forEach((h, i) => {
        if (ownHold(r, h) || h.type === 'foot') return
        const d = Math.hypot(h.x - c0.chest.x, h.y - c0.chest.y)
        // in reach, and no hold of the route's own colour close to it
        const ownNear = r.holds.some((o) => ownHold(r, o) && o.type !== 'foot' && Math.hypot(o.x - h.x, o.y - h.y) < 0.3)
        if (d < BODY.reach - 0.1 && !ownNear && d < bd) {
          bd = d
          idx = i
        }
      })
      if (idx >= 0) {
        route = r
        break
      }
    }
    const w = createWorld(route, { leaderMass: 70, belayerMass: 70, tired: 0, autoFeet: true, bot: true })
    expect(idx).toBeGreaterThanOrEqual(0)
    const h = route.holds[idx]
    const inp = emptyInput()
    inp.hands[1] = { down: true, x: h.x, y: h.y }
    for (let i = 0; i < 40; i++) stepWorld(w, 1 / 60, inp, null)
    inp.hands[1].down = false
    for (let i = 0; i < 5; i++) stepWorld(w, 1 / 60, inp, null)
    expect(w.climber.hands[1].hold).toBe(idx)
    expect(w.offRoute).toBe(true)
    expect(w.events.some((e) => e.type === 'offroute')).toBe(true)
    w.topped = true
    w.sent = !w.weighted && !w.falls.length && !w.offRoute
    endAttempt(w, 'lowered')
    expect(w.end?.sent).toBe(false)
  })
})
