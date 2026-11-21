// A scripted leader for tests: reaches the lower hand to the best hold above and clips when it can.

import { BODY } from './constants'
import { emptyInput, type InputFrame } from './types'
import { stepWorld, type World } from './world'

/** A simple scripted leader: moves the lower hand to the best reachable hold above, clips when it can. */
export function scriptedClimb(w: World, seconds: number, onFrame?: () => void, stopAtTop = false) {
  const inp: InputFrame = emptyInput()
  let phase: 'idle' | 'reach' | 'wait' = 'idle'
  let hand = 0
  let timer = 0
  let target = -1
  const route = w.route
  const dt = 1 / 60
  for (let f = 0; f < seconds * 60 && !w.end && !(stopAtTop && w.topped); f++) {
    const c = w.climber
    if (w.climber.clipHint >= 0 && !c.clip && c.hands.some((h) => h.state === 1) && c.hands.some((h) => h.state !== 1)) {
      inp.seq.clip++
    }
    if (phase === 'idle' && !c.clip) {
      // lower gripping hand moves
      const hs = c.hands
      hand = hs[0].state === 1 && hs[1].state === 1 ? (hs[0].y <= hs[1].y ? 0 : 1) : hs[0].state === 1 ? 1 : 0
      const other = hs[1 - hand]
      let best = -1
      let bestY = -1
      route.holds.forEach((h, i) => {
        if (h.type === 'foot') return
        if (h.y <= Math.max(hs[hand].y, other.y - 0.3) + 0.05) return
        const lockY = other.state === 1 ? other.y - 0.2 : c.chest.y
        const d = Math.hypot(h.x - other.x, h.y - lockY)
        if (d > BODY.reach - 0.03) return
        if (h.y > bestY) {
          bestY = h.y
          best = i
        }
      })
      if (best >= 0) {
        target = best
        phase = 'reach'
        timer = 0
      }
    }
    if (phase === 'reach') {
      timer += dt
      inp.hands[hand].down = true
      inp.hands[hand].x = route.holds[target].x
      inp.hands[hand].y = route.holds[target].y
      if (timer > 0.6) {
        inp.hands[hand].down = false
        phase = 'wait'
        timer = 0
      }
    } else if (phase === 'wait') {
      timer += dt
      if (timer > 0.35) phase = 'idle'
    }
    stepWorld(w, dt, inp, null)
    onFrame?.()
  }
}
