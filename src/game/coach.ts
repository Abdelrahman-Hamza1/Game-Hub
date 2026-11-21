// A one-line coach for new players. It watches the snapshot and says the one
// thing worth knowing right now; each tip retires once the player has done
// the thing (or has seen it long enough), and retired tips are remembered.

import type { Snap } from '../sim/world'

export interface Tip {
  id: string
  text: string
}

export interface CoachView {
  snap: Snap
  leader: boolean
  belayer: boolean
  autoFeet: boolean
  /** seconds since this attempt started on this screen */
  age: number
}

/** The tip for this moment, or null. `done` holds retired tip ids. */
export function coachTip(v: CoachView, done: ReadonlySet<string>): Tip | null {
  const s = v.snap
  const c = s.c
  const tips: (Tip & { when: boolean })[] = v.leader
    ? [
        {
          id: 'hanging',
          when: s.hanging && !s.topped,
          text: 'Resting on the rope. Grab a hold to climb on, or call Lower! (8) to come down.',
        },
        {
          id: 'top',
          when: s.topped,
          text: 'Anchor clipped! Call Take! (5), let go, and your belayer lowers you.',
        },
        {
          id: 'grab',
          when: true,
          text: 'Hold the left mouse button, drag the hand onto a hold above, let go to grab. Right button is the right hand.',
        },
        {
          id: 'feet',
          when: !v.autoFeet && c.feetOn === 0 && s.high > 1.4,
          text: 'No feet! Press Q / E to step onto the footholds marked Q and E. Hanging on your arms pumps you fast.',
        },
        {
          id: 'clip',
          when: c.clipHint >= 0 && c.clip < 0,
          text: 'A quickdraw is in reach: call Clipping! (3) so your belayer feeds rope, then press F.',
        },
        {
          id: 'pump',
          when: Math.max(c.pump[0], c.pump[1]) > 65,
          text: 'Getting pumped. Rest on a jug with your feet on: R shakes a free hand out, C chalks it.',
        },
      ]
    : v.belayer
      ? [
          {
            id: 'belay-intro',
            when: v.age < 12,
            text: "You're belaying. Hold ↓ to feed slack as they climb, ↑ to take in, Enter the moment they fall.",
          },
          {
            id: 'belay-soft',
            when: !!s.lastFall && !s.fall && s.lastFall.rating === 'good',
            text: 'Nice catch. Shift + Enter gives a soft catch: gentler on them, and worth a perfect rating.',
          },
        ]
      : []
  for (const t of tips) if (t.when && !done.has(t.id)) return { id: t.id, text: t.text }
  return null
}

/** Events that mean a tip has been learned. */
export const LEARNED_BY: Record<string, { event: string; count: number }> = {
  grab: { event: 'grab', count: 3 },
  feet: { event: 'step', count: 3 },
  clip: { event: 'clip', count: 1 },
}

/** Tips that retire after being on screen this long (seconds). */
export const SHOW_FOR = 9
