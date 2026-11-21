import { describe, expect, it } from 'vitest'
import { CRAG } from '../sim/routes'
import { endAttempt } from '../sim/world'
import { BOT, crewBoard, Session } from './session'

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

  it('the bot takes the rope when the belayer leaves mid-climb', () => {
    const s = crew(3)
    s.start(CRAG[0].id, 'a', 'b')
    s.removePlayer('b')
    expect(s.lobby.phase).toBe('climb')
    expect(s.lobby.belayer).toBe(BOT)
    expect(s.world?.bot).toBeTruthy()
  })

  it('the leader leaving mid-climb sends everyone back to the crag', () => {
    const s = crew(3)
    s.start(CRAG[0].id, 'a', 'b')
    s.removePlayer('a')
    expect(s.lobby.phase).toBe('crag')
    expect(s.world).toBeNull()
    expect(s.start(CRAG[0].id)).toBe(true)
  })

  it('old presses do not replay at the start of a new attempt', () => {
    const s = crew(2)
    s.start(CRAG[0].id, 'a', 'b')
    const f = s.world!.lastSeq.leader
    const inp = { ...s.world!.lastSeq }
    void inp
    // the leader called Lower! (8) at the end of the last attempt
    const frame = { hands: [{ down: false, x: 0, y: 0 }, { down: false, x: 0, y: 0 }], hipsIn: false, shake: false, feed: false, take: false, catchHeld: false, soft: false, seq: { ...f, call: 7 }, callId: 8 } as const
    s.setInput('a', JSON.parse(JSON.stringify(frame)))
    s.step(1 / 60)
    finish(s, false)
    s.start(CRAG[0].id, 'a', 'b')
    s.setInput('a', JSON.parse(JSON.stringify(frame)))
    s.step(1 / 60)
    expect(s.world!.letGo).toBe(false)
    expect(s.world!.calls.length).toBe(0)
  })

  it('a tired player can still belay', () => {
    const s = crew(2)
    s.lobby.players[1].energy = 5
    expect(s.nextRoles()).toEqual({ leader: 'a', belayer: 'b' })
  })

  it('scores the belayer and builds the day board', () => {
    const s = crew(2)
    s.start(CRAG[2].id, 'a', 'b')
    s.world!.belay.shortRopes = 2
    s.world!.highPoint = 8
    finish(s, true)
    expect(s.lobby.summary?.belay?.name).toBe('Omar')
    expect(s.lobby.summary?.belay?.stars).toBe(1)
    s.start(CRAG[0].id, 'b', 'a')
    s.world!.highPoint = 8
    finish(s, true)
    const board = crewBoard(s.lobby)
    expect(board.find((r) => r.id === 'a')).toMatchObject({ sends: 1, best: '5c', stars: 3, belays: 1 })
    expect(board.find((r) => r.id === 'b')).toMatchObject({ sends: 1, best: '5a', stars: 1 })
  })

  it('the bot belayer gets no score', () => {
    const s = new Session('solo', 'a')
    s.addPlayer({ id: 'a', name: 'A', mass: 70, tried: [] })
    s.start(CRAG[0].id)
    finish(s, false)
    expect(s.lobby.summary?.belay).toBeNull()
  })
})
