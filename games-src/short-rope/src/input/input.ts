// Keyboard + mouse -> InputFrame. The game only ever reads InputFrames, so a
// touch layer for phones can be added later as another source of frames.

import { CALLS } from '../sim/constants'
import { emptyInput, type InputFrame } from '../sim/types'

const CALL_KEYS = new Map(CALLS.map((c) => [c.key, c.id]))
const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'])

export class LocalInput {
  frame: InputFrame = emptyInput()
  enabled = false
  private mx = 0
  private my = 0
  private left = false
  private right = false
  private keys = new Set<string>()
  private catchAt = 0
  private softLatch = false
  /** convert screen pixels to world metres; set by the renderer */
  toWorld: (sx: number, sy: number) => [number, number] = (x, y) => [x, y]
  /** called for keys that are UI shortcuts rather than game input */
  onShortcut: (code: string) => void = () => {}

  attach(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return
      e.preventDefault()
      if (e.button === 2 || (e.button === 0 && e.shiftKey)) this.right = true
      else if (e.button === 0) this.left = true
      this.mx = e.clientX
      this.my = e.clientY
    })
    window.addEventListener('mousemove', (e) => {
      this.mx = e.clientX
      this.my = e.clientY
    })
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.right = false
      if (e.button === 0) {
        // a shift-click started the right hand, so the left button releases it
        if (this.right && !this.left) this.right = false
        this.left = false
      }
    })
    window.addEventListener('blur', () => {
      this.left = this.right = false
      this.keys.clear()
    })
    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return
      if (!this.enabled) {
        this.onShortcut(e.code)
        return
      }
      if (GAME_KEYS.has(e.code)) e.preventDefault()
      if (e.repeat) return
      this.keys.add(e.code)
      const f = this.frame
      switch (e.code) {
        case 'KeyQ':
          f.seq.footL++
          break
        case 'KeyE':
          f.seq.footR++
          break
        case 'KeyF':
          f.seq.clip++
          break
        case 'KeyC':
          f.seq.chalk++
          break
        case 'Enter':
          f.seq.catch++
          this.catchAt = performance.now()
          this.softLatch = e.shiftKey
          break
        default: {
          const id = CALL_KEYS.get(e.key)
          if (id) {
            f.seq.call++
            f.callId = id
          } else this.onShortcut(e.code)
        }
      }
    })
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code)
      if (e.code === 'Enter') this.softLatch = false
    })
  }

  /** Build this frame's input. latency (s) is added to the catch age for remote fairness. */
  sample(latency = 0): InputFrame {
    const f = this.frame
    const [wx, wy] = this.toWorld(this.mx, this.my)
    f.hands[0] = { down: this.enabled && this.left, x: wx, y: wy }
    f.hands[1] = { down: this.enabled && this.right, x: wx, y: wy }
    const k = this.keys
    f.hipsIn = k.has('Space')
    f.shake = k.has('KeyR')
    f.feed = k.has('ArrowDown')
    f.take = k.has('ArrowUp')
    f.catchHeld = k.has('Enter')
    f.soft = f.catchHeld && this.softLatch
    const age = (performance.now() - this.catchAt) / 1000
    f.catchAge = age < 1 ? age + latency : 0
    return {
      ...f,
      hands: [{ ...f.hands[0] }, { ...f.hands[1] }],
      seq: { ...f.seq },
    }
  }

  get mouse(): [number, number] {
    return [this.mx, this.my]
  }

  get handsDown(): [boolean, boolean] {
    return [this.left, this.right]
  }
}
