import { describe, expect, it } from 'vitest'
import { CRAG } from '../sim/routes'
import { createWorld, snapshot } from '../sim/world'
import { coachTip } from './coach'

const snap = () => snapshot(createWorld(CRAG[0], { leaderMass: 70, belayerMass: 70, tired: 0, autoFeet: false, bot: true }))

describe('coach', () => {
  it('starts the leader with grabbing, then moves on', () => {
    const s = snap()
    expect(coachTip({ snap: s, leader: true, belayer: false, autoFeet: false, age: 0 }, new Set())?.id).toBe('grab')
    expect(coachTip({ snap: s, leader: true, belayer: false, autoFeet: false, age: 0 }, new Set(['grab']))).toBeNull()
  })

  it('nags about feet only when there are none and auto feet is off', () => {
    const s = snap()
    s.c.feetOn = 0
    s.high = 3
    const v = { snap: s, leader: true, belayer: false, autoFeet: false, age: 5 }
    expect(coachTip(v, new Set(['grab']))?.id).toBe('feet')
    expect(coachTip({ ...v, autoFeet: true }, new Set(['grab']))).toBeNull()
  })

  it('a clip in reach beats the pump tip; the top beats everything', () => {
    const s = snap()
    s.c.clipHint = 0
    s.c.pump = [80, 10]
    const v = { snap: s, leader: true, belayer: false, autoFeet: true, age: 5 }
    expect(coachTip(v, new Set(['grab']))?.id).toBe('clip')
    s.topped = true
    expect(coachTip(v, new Set(['grab']))?.id).toBe('top')
  })

  it('introduces belaying, and spectators get nothing', () => {
    const s = snap()
    expect(coachTip({ snap: s, leader: false, belayer: true, autoFeet: false, age: 1 }, new Set())?.id).toBe('belay-intro')
    expect(coachTip({ snap: s, leader: false, belayer: false, autoFeet: false, age: 1 }, new Set())).toBeNull()
  })
})
