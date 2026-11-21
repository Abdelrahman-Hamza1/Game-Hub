import { beforeEach, describe, expect, it } from 'vitest'
import { CRAG } from '../sim/routes'
import { createWorld, snapshot } from '../sim/world'
import { scriptedClimb } from '../sim/script'
import { GhostRecorder, ghostPose, loadGhost, offerGhost } from './ghost'

const mem = new Map<string, string>()
beforeEach(() => {
  mem.clear()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  }
})

describe('ghost beta', () => {
  it('records a send and replays it, keeping only the fastest', () => {
    const w = createWorld(CRAG[0], { leaderMass: 70, belayerMass: 70, tired: 0, autoFeet: true, bot: true })
    const rec = new GhostRecorder()
    scriptedClimb(w, 150, () => rec.push(snapshot(w)), true)
    expect(w.topped).toBe(true)
    const g = rec.ghost(CRAG[0].id, 'Abood', w.topT)!
    expect(g).not.toBeNull()
    // the replay ends near the anchor, and starts near the ground
    const end = ghostPose(g, w.topT)!
    expect(end.chest[1]).toBeGreaterThan(CRAG[0].anchor[1] - 2)
    expect(ghostPose(g, 0)!.pelvis[1]).toBeLessThan(1.5)
    // mid-way it is between the two
    const mid = ghostPose(g, w.topT / 2)!
    expect(mid.pelvis[1]).toBeGreaterThan(1)
    expect(offerGhost(g).saved).toBe(true)
    expect(offerGhost({ ...g, time: g.time + 5, name: 'Slow' }).saved).toBe(false)
    expect(offerGhost({ ...g, time: g.time - 1, name: 'Quick' }).saved).toBe(true)
    expect(loadGhost(CRAG[0].id)?.name).toBe('Quick')
  })
})
