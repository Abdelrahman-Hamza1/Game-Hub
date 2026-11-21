import { describe, expect, it } from 'vitest'
import { CRAG } from '../sim/routes'
import { endAttempt } from '../sim/world'
import { dayAwards, fmtTime, Session } from './session'

describe('day awards', () => {
  it('names the biggest whipper, softest hands, short-roper and fastest send', () => {
    const s = new Session('online', 'a')
    s.addPlayer({ id: 'a', name: 'Abood', mass: 70, tried: [] })
    s.addPlayer({ id: 'b', name: 'Omar', mass: 70, tried: [] })
    // Abood leads, Omar belays: a caught 4.2 m whipper and one short-rope
    s.start(CRAG[0].id, 'a', 'b')
    let w = s.world!
    w.highPoint = 9
    w.belay.shortRopes = 1
    w.falls.push({ C: 6, h: 1, s: 0.5, startY: 8, lowY: 3.8, peak: 2600, soft: true, result: 'gentle', unclipped: 0, t0: 3, rating: 'perfect', judgeT: 3.3, locked: true })
    endAttempt(w, 'lowered')
    s.step(1 / 60)
    // Omar sends in 41.3 s with Abood belaying
    s.start(CRAG[0].id, 'b', 'a')
    w = s.world!
    w.highPoint = 12
    w.sent = w.topped = true
    w.topT = 41.3
    endAttempt(w, 'lowered')
    s.step(1 / 60)
    expect(s.lobby.summary?.time).toBe(41.3)
    const got = Object.fromEntries(dayAwards(s.lobby).map((a) => [a.id, `${a.name}: ${a.detail}`]))
    expect(got.whip).toBe(`Abood: 4.2 m on ${CRAG[0].name}`)
    expect(got.soft).toBe('Omar: 2.6 kN catch for Abood')
    expect(got.short).toBe('Omar: short-roped Abood')
    expect(got.fast).toBe(`Omar: 0:41.3 on ${CRAG[0].name}`)
    expect(got.metres).toMatch(/^(Abood|Omar): \d+ m led$/)
  })

  it('formats times', () => {
    expect(fmtTime(5)).toBe('0:05.0')
    expect(fmtTime(83.25)).toBe('1:23.3')
  })
})
