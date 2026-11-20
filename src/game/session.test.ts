import { describe, expect, it } from 'vitest'
import { CRAG } from '../sim/routes'
import { endAttempt } from '../sim/world'
import { BOT, Session } from './session'

function crew(n: number): Session {
  const s = new Session('online', 'a')
  const names = ['Abood', 'Omar', 'Sara', 'Lina']
  for (let i = 0; i < n; i++) s.addPlayer({ id: 'abcd'[i], name: names[i], mass: 70, tried: [] })
  return s
}

function finish(s: Session, sent: boolean) {
  const w = s.world!
  w.sent = sent
  w.topped = sent
  endAttempt(w, 'lowered')
  s.step(1 / 60)
}

describe('session', () => {
  it('solo always has the bot belaying', () => {
    const s = new Session('solo', 'a')
    s.addPlayer({ id: 'a', name: 'A', mass: 70, tried: [] })
    expect(s.nextRoles()).toEqual({ leader: 'a', belayer: BOT })
  })

  it('rotates leader and belayer through three players', () => {
    const s = crew(3)
    const seen: string[] = []
    for (let i = 0; i < 3; i++) {
      expect(s.start(CRAG[0].id)).toBe(true)
      const { leader, belayer } = s.lobby
      expect(leader).not.toBe(belayer)
      seen.push(`${leader}>${belayer}`)
      finish(s, false)
    }
    expect(seen).toEqual(['a>b', 'b>c', 'c>a'])
  })

  it('awards onsight, flash and redpoint correctly', () => {
    const s = crew(2)
    s.start(CRAG[1].id, 'a', 'b')
    finish(s, true)
    expect(s.lobby.summary?.style).toBe('onsight')
    s.start(CRAG[1].id, 'b', 'a')
    finish(s, true)
    expect(s.lobby.summary?.style).toBe('flash')
    s.start(CRAG[1].id, 'a', 'b')
    finish(s, true)
    expect(s.lobby.summary?.style).toBe('redpoint')
  })

  it('spends day energy and ends the day', () => {
    const s = crew(1)
    for (let i = 0; i < 30 && !s.lobby.dayOver; i++) {
      s.start(CRAG[0].id)
      s.world!.highPoint = 12
      finish(s, false)
    }
    expect(s.lobby.dayOver).toBe(true)
    s.newDay()
    expect(s.lobby.players[0].energy).toBe(100)
    expect(s.lobby.day).toBe(2)
  })

  it('a climber leaving mid-attempt sends everyone back to the crag', () => {
    const s = crew(3)
    s.start(CRAG[0].id, 'a', 'b')
    s.removePlayer('b')
    expect(s.lobby.phase).toBe('crag')
    expect(s.world).toBeNull()
    expect(s.start(CRAG[0].id)).toBe(true)
  })
})
