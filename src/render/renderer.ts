// Canvas 2D renderer. World units are metres (x right, y up); the camera maps
// them to screen pixels. Everything drawn comes from a Snap, so the host and
// guests render the same way.

import { ANGLE_LABEL, BODY, CALL_BY_ID, GRADES, YDS } from '../sim/constants'
import type { Hold, Route } from '../sim/types'
import type { Snap } from '../sim/world'
import { belayerHome } from '../sim/world'
import type { Settings } from '../game/storage'
import { matTexture, panelTexture, PANEL_M, WALLS, type WallColor } from './textures'
import { rng } from '../sim/routes'
import type { GhostPose } from '../game/ghost'
import { fmtTime } from '../game/session'

export const PALETTE = [
  { shirt: '#FF6B1A', helmet: '#1D2125', pants: '#3B4A5C' },
  { shirt: '#0E8F9B', helmet: '#F2C14E', pants: '#2F3437' },
  { shirt: '#7B5EA7', helmet: '#F8F8F6', pants: '#3A3F2E' },
  { shirt: '#E0A800', helmet: '#D62839', pants: '#33404A' },
]

/** Gym tape colours by grade band. A route's holds all share its colour, as in a real gym. */
export function routeTape(grade: string): string {
  const i = GRADES.indexOf(grade)
  const at = (x: string) => GRADES.indexOf(x)
  if (i < at('6a')) return '#3FA34D'
  if (i < at('6b')) return '#F2B705'
  if (i < at('6c')) return '#1FA6B4'
  if (i < at('7a')) return '#FF6B1A'
  if (i < at('7b')) return '#E0344A'
  return '#9B6BD6'
}
const DECOY_COLORS = ['#3FA34D', '#F2B705', '#1FA6B4', '#FF6B1A', '#E0344A', '#9B6BD6', '#F4F4F2', '#E85D9E']

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (x: number) => Math.round(k >= 0 ? x + (255 - x) * k : x * (1 + k))
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`
}

/** HUD colours: white cards over the wall */
const HUD = { card: 'rgba(255,255,255,0.95)', text: '#1D2125', muted: '#5D646B', track: '#E7EAED', good: '#0B7A85', warn: '#C2410C', bad: '#D62839', calm: '#1FA6B4' }

const INK = '#1D2125'
const ROPE = '#FF6B1A'
const MONO = "'JetBrains Mono', ui-monospace, monospace"
const DISPLAY = "'Big Shoulders Display', 'Arial Narrow', sans-serif"
const BODY_FONT = "'Public Sans', Arial, sans-serif"

export interface Toast {
  text: string
  t: number
  kind: 'info' | 'good' | 'bad'
}

export interface RenderView {
  route: Route
  snap: Snap
  leader: { name: string; color: number }
  belayer: { name: string; color: number } | null
  spectators: { name: string; color: number }[]
  localLeader: boolean
  localBelayer: boolean
  input: { mouse: [number, number]; handsDown: [boolean, boolean] } | null
  settings: Settings
  toasts: Toast[]
  now: number
  helpOpen: boolean
  latency: number | null
  /** false for the menu backdrop: no HUD, tags or calls */
  hud: boolean
  /** a coach tip for the local player, if any */
  coach?: string | null
  /** the route's fastest send, replayed */
  ghost?: { pose: GhostPose; name: string; time: number } | null
}

const GHOST_PAL = { shirt: '#F8F8F6', helmet: '#F8F8F6', pants: '#E4EAEE' }

export class Renderer {
  readonly canvas: HTMLCanvasElement
  private c: CanvasRenderingContext2D
  private W = 0
  private H = 0
  private dpr = 1
  camX = 1
  camY = 4
  scale = 70
  private shake = 0
  /** pixels on the left covered by UI (the crag panel) */
  padLeft = 0
  private lastNow = 0
  private frameDt = 0
  /** drawn limb positions relative to the body, so steps and grabs animate instead of teleporting */
  private limbOff: [number, number][] | null = null
  private panels = new Map<WallColor, CanvasPattern>()
  private mats: CanvasPattern
  private wall: WallColor = 'charcoal'
  /** faded holds of other routes, per route */
  private decoys: { id: string; holds: { x: number; y: number; type: Hold['type']; rot: number; col: string }[] } | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.c = canvas.getContext('2d')!
    this.mats = this.c.createPattern(matTexture(), 'repeat')!
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.W = this.canvas.clientWidth || window.innerWidth
    this.H = this.canvas.clientHeight || window.innerHeight
    this.canvas.width = Math.round(this.W * this.dpr)
    this.canvas.height = Math.round(this.H * this.dpr)
    this.scale = Math.max(42, Math.min(this.H / 9.5, this.W / 7.5))
  }

  sx(x: number): number {
    return (x - this.camX) * this.scale + this.W / 2
  }
  sy(y: number): number {
    return this.H / 2 - (y - this.camY) * this.scale
  }
  toWorld = (px: number, py: number): [number, number] => {
    const r = this.canvas.getBoundingClientRect()
    const x = px - r.left, y = py - r.top
    return [(x - this.W / 2) / this.scale + this.camX, (this.H / 2 - y) / this.scale + this.camY]
  }

  /** Camera follows the leader and keeps the ground in view when low. */
  follow(route: Route, chestY: number, dt: number, snapTo = false): void {
    // a side panel covering the left of the screen pushes the route right
    const tx = route.width / 2 - 0.5 - this.padLeft / 2 / this.scale
    const half = this.H / 2 / this.scale
    const ty = Math.max(half - 0.9, Math.min(chestY + 0.6, route.height + 1 - half))
    const k = snapTo ? 1 : Math.min(1, dt * 4)
    this.camX += (tx - this.camX) * k
    this.camY += (ty - this.camY) * k
  }

  /** shake the camera, in pixels; big catches and ground falls thump */
  kick(px: number): void {
    this.shake = Math.max(this.shake, px)
  }

  render(v: RenderView): void {
    const c = this.c
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    const dt = Math.min(0.1, Math.max(0, v.now - this.lastNow))
    this.lastNow = v.now
    this.frameDt = dt
    this.shake = Math.max(0, this.shake - dt * 40)
    if (this.shake > 0.3) {
      const a = this.shake
      c.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a)
    }
    this.wall = v.settings.wall in WALLS ? v.settings.wall : 'charcoal'
    this.drawBackdrop(v.route)
    this.drawCliff(v.route)
    this.drawGround()
    this.drawHolds(v)
    this.drawDraws(v)
    this.drawGhost(v)
    this.drawSpectators(v)
    this.drawRope(v)
    this.drawBelayer(v)
    this.drawClimber(v)
    this.drawDust(v)
    if (!v.hud) return
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.drawCursor(v)
    this.drawShouts(v)
    this.drawCalls(v)
    this.drawHud(v)
    this.drawToasts(v)
    if (v.settings.debug) this.drawDebug(v)
  }

  // ---------- scenery ----------

  /** the gym hall behind and around the wall */
  private drawBackdrop(route: Route): void {
    const c = this.c
    const g = c.createLinearGradient(0, 0, 0, this.H)
    g.addColorStop(0, '#15181C')
    g.addColorStop(1, '#2A2F35')
    c.fillStyle = g
    c.fillRect(0, 0, this.W, this.H)
    // steel columns and roof trusses, a little parallax
    const par = 0.5
    c.fillStyle = '#23282E'
    for (let wx = -40; wx < 60; wx += 6) {
      const x = (wx - this.camX * par) * this.scale * 0.8 + this.W / 2
      if (x < -40 || x > this.W + 40) continue
      c.fillRect(x - 0.12 * this.scale, 0, 0.24 * this.scale, this.H)
    }
    // ceiling lights above the wall
    const ceil = this.sy(route.height + 3.2)
    if (ceil > -40) {
      for (let wx = -8; wx < 14; wx += 3.2) {
        const x = this.sx(wx)
        const lg = c.createRadialGradient(x, ceil, 2, x, ceil, 2.6 * this.scale)
        lg.addColorStop(0, 'rgba(255,250,235,0.35)')
        lg.addColorStop(1, 'rgba(255,250,235,0)')
        c.fillStyle = lg
        c.fillRect(x - 2.6 * this.scale, ceil - 2.6 * this.scale, 5.2 * this.scale, 5.2 * this.scale)
        c.fillStyle = '#FFF8E6'
        c.fillRect(x - 0.5 * this.scale, ceil - 3, this.scale, 5)
      }
    }
  }

  /** wall edges in metres: the climbing wall is a wide flat face */
  private wallX(side: number): number {
    return side < 0 ? -6.5 : 10.5
  }

  private wallPattern(): CanvasPattern {
    let p = this.panels.get(this.wall)
    if (!p) {
      p = this.c.createPattern(panelTexture(this.wall), 'repeat')!
      this.panels.set(this.wall, p)
    }
    return p
  }

  private drawCliff(route: Route): void {
    const c = this.c
    const top = route.height + 2.5
    const x0 = this.sx(this.wallX(-1)), x1 = this.sx(this.wallX(1))
    const y0 = this.sy(top), y1 = this.sy(0) + 2
    c.save()
    const pat = this.wallPattern()
    pat.setTransform(new DOMMatrix().translate(this.sx(0), this.sy(0)).scale((PANEL_M * this.scale) / 256, (PANEL_M * this.scale) / 256))
    c.fillStyle = pat
    c.fillRect(x0, y0, x1 - x0, y1 - y0)
    // light from the ceiling, and the steeper the wall the deeper the shade
    const light = c.createLinearGradient(0, y0, 0, y1)
    light.addColorStop(0, 'rgba(255,250,235,0.1)')
    light.addColorStop(1, 'rgba(0,0,0,0.12)')
    c.fillStyle = light
    c.fillRect(x0, y0, x1 - x0, y1 - y0)
    const shadeK = { slab: 0, vertical: 0.04, overhang: 0.12, steep: 0.2, roof: 0.28 }[route.angle] ?? 0
    if (shadeK > 0) {
      const g = c.createLinearGradient(0, y0, 0, y1)
      g.addColorStop(0, `rgba(10,12,16,${shadeK * 1.3})`)
      g.addColorStop(1, `rgba(10,12,16,${shadeK * 0.3})`)
      c.fillStyle = g
      c.fillRect(x0, y0, x1 - x0, y1 - y0)
    }
    // the wall's top lip and side edges
    c.fillStyle = '#1B1F24'
    c.fillRect(x0 - 6, y0 - 10, x1 - x0 + 12, 12)
    c.fillRect(x0 - 6, y0, 6, y1 - y0)
    c.fillRect(x1, y0, 6, y1 - y0)
    c.restore()
    this.drawVolumes(route)
    // height ticks along the left of the route, like a gym's metre marks
    const light2 = WALLS[this.wall].light
    c.font = `600 11px ${MONO}`
    c.fillStyle = light2 ? 'rgba(29,33,37,0.6)' : 'rgba(255,255,255,0.55)'
    c.strokeStyle = light2 ? 'rgba(29,33,37,0.4)' : 'rgba(255,255,255,0.35)'
    c.lineWidth = 1
    for (let y = 2; y <= route.height; y += 2) {
      const x = this.sx(-0.35)
      c.beginPath()
      c.moveTo(x, this.sy(y))
      c.lineTo(x + 8, this.sy(y))
      c.stroke()
      c.fillText(`${y} m`, x - 34, this.sy(y) + 4)
    }
  }

  /** big wooden volumes bolted to the wall, away from the route */
  private drawVolumes(route: Route): void {
    const c = this.c
    const r = rng((route.seed ?? 3) + 11)
    const light = WALLS[this.wall].light
    for (let k = 0; k < 4; k++) {
      const side = k % 2 ? 1 : -1
      const cx = side < 0 ? -1.6 - r() * 3.6 : route.width + 1.4 + r() * 3.5
      const cy = 1.5 + r() * Math.max(1, route.height - 1)
      const s = 0.45 + r() * 0.5
      const pts: [number, number][] = [
        [cx - s, cy - s * 0.6],
        [cx + s * 0.9, cy - s * 0.8],
        [cx + s * 0.3, cy + s * 0.9],
      ]
      const mid: [number, number] = [cx + (r() - 0.5) * s * 0.4, cy]
      const faces: [number, number][][] = [
        [pts[0], pts[1], mid],
        [pts[1], pts[2], mid],
        [pts[2], pts[0], mid],
      ]
      const base = light ? '#B9C2CA' : '#454C55'
      faces.forEach((f, i) => {
        c.fillStyle = shade(base, [0.12, -0.25, 0][i])
        c.beginPath()
        f.forEach((p, j) => (j ? c.lineTo(this.sx(p[0]), this.sy(p[1])) : c.moveTo(this.sx(p[0]), this.sy(p[1]))))
        c.closePath()
        c.fill()
      })
    }
  }

  /** crash mats along the bottom of the wall */
  private drawGround(): void {
    const c = this.c
    const y0 = this.sy(0)
    if (y0 > this.H) return
    c.save()
    c.fillStyle = '#1B1F24'
    c.fillRect(0, y0, this.W, this.H - y0)
    const x0 = Math.max(0, this.sx(this.wallX(-1) - 1)), x1 = Math.min(this.W, this.sx(this.wallX(1) + 1))
    const m = new DOMMatrix().translate(this.sx(0), y0).scale(this.scale / 60, this.scale / 60)
    this.mats.setTransform(m)
    c.fillStyle = this.mats
    c.fillRect(x0, y0 - 4, x1 - x0, Math.min(this.H - y0 + 4, 0.55 * this.scale + 4))
    c.restore()
  }

  // ---------- holds and gear ----------

  private holdPath(type: Hold['type'], s: number): void {
    const c = this.c
    c.beginPath()
    switch (type) {
      case 'jug':
        c.moveTo(-0.1 * s, 0.01 * s)
        c.quadraticCurveTo(-0.09 * s, -0.075 * s, 0, -0.07 * s)
        c.quadraticCurveTo(0.09 * s, -0.075 * s, 0.1 * s, 0.01 * s)
        c.quadraticCurveTo(0, 0.07 * s, -0.1 * s, 0.01 * s)
        break
      case 'crimp':
        c.roundRect(-0.08 * s, -0.022 * s, 0.16 * s, 0.044 * s, 0.012 * s)
        break
      case 'sloper':
        c.moveTo(-0.1 * s, 0.03 * s)
        c.bezierCurveTo(-0.09 * s, -0.1 * s, 0.09 * s, -0.1 * s, 0.1 * s, 0.03 * s)
        c.closePath()
        break
      case 'pinch':
        c.roundRect(-0.032 * s, -0.08 * s, 0.064 * s, 0.16 * s, 0.03 * s)
        break
      case 'pocket':
        c.arc(0, 0, 0.07 * s, 0, Math.PI * 2)
        break
      default:
        c.ellipse(0, 0, 0.045 * s, 0.026 * s, 0, 0, Math.PI * 2)
    }
  }

  /** a bolt-on hold: shaded plastic in the route's colour, shape by type */
  private drawHold(h: Hold, highlight: string | null, col: string, alpha = 1, label = true): void {
    const c = this.c
    const s = this.scale * 1.35
    const x = this.sx(h.x), y = this.sy(h.y)
    c.save()
    c.globalAlpha = alpha
    c.translate(x, y)
    c.rotate((h.rot * Math.PI) / 180)
    // drop shadow on the wall
    c.save()
    c.translate(0.012 * s, 0.022 * s)
    this.holdPath(h.type, s)
    c.fillStyle = 'rgba(0,0,0,0.35)'
    c.fill()
    c.restore()
    this.holdPath(h.type, s)
    const r = 0.1 * s
    const g = c.createRadialGradient(-r * 0.4, -r * 0.5, r * 0.05, 0, 0, r * 1.2)
    g.addColorStop(0, shade(col, 0.45))
    g.addColorStop(0.5, col)
    g.addColorStop(1, shade(col, -0.35))
    c.fillStyle = g
    c.fill()
    c.strokeStyle = shade(col, -0.5)
    c.lineWidth = 1
    c.stroke()
    // the grip: a dark cavity under a jug's lip, the hole of a pocket
    if (h.type === 'jug') {
      c.fillStyle = shade(col, -0.55)
      c.beginPath()
      c.ellipse(0, 0.012 * s, 0.06 * s, 0.018 * s, 0, 0, Math.PI)
      c.fill()
    } else if (h.type === 'pocket') {
      c.fillStyle = shade(col, -0.6)
      c.beginPath()
      c.ellipse(0, 0.01 * s, 0.035 * s, 0.024 * s, 0, 0, Math.PI * 2)
      c.fill()
    } else if (h.type === 'crimp') {
      c.fillStyle = shade(col, 0.5)
      c.fillRect(-0.07 * s, -0.02 * s, 0.14 * s, 0.008 * s)
    }
    // the bolt
    if (h.type !== 'foot' && h.type !== 'pocket' && h.type !== 'crimp') {
      c.fillStyle = 'rgba(20,20,20,0.6)'
      c.beginPath()
      c.arc(0, -0.02 * s, Math.max(1.2, 0.009 * s), 0, Math.PI * 2)
      c.fill()
    }
    c.restore()
    if (h.role && alpha === 1) {
      // start and top tape, in the route's colour
      const text = label ? (h.role === 'top' ? 'TOP' : 'START') : ''
      c.font = `700 9px ${MONO}`
      const w = text ? c.measureText(text).width + 10 : 16
      const ty = y + 0.075 * s
      c.save()
      c.translate(x, ty + 6)
      c.rotate(-0.06)
      c.fillStyle = col
      c.fillRect(-w / 2, -6, w, 13)
      c.fillStyle = 'rgba(0,0,0,0.75)'
      if (text) c.fillText(text, -w / 2 + 5, 4)
      c.restore()
    }
    if (highlight) {
      c.strokeStyle = highlight
      c.lineWidth = 2.5
      c.beginPath()
      c.arc(x, y, 0.13 * s, 0, Math.PI * 2)
      c.stroke()
    }
  }

  /** other routes' holds, faded, so the wall looks like a real gym wall */
  private decoyHolds(route: Route) {
    if (this.decoys?.id === route.id) return this.decoys.holds
    const r = rng((route.seed ?? 1) * 7 + 3)
    const mine = routeTape(route.grade)
    const cols = DECOY_COLORS.filter((x) => x !== mine)
    const types: Hold['type'][] = ['jug', 'crimp', 'sloper', 'pinch', 'pocket', 'foot', 'foot']
    const holds: { x: number; y: number; type: Hold['type']; rot: number; col: string }[] = []
    const lanes = 6
    for (let lane = 0; lane < lanes; lane++) {
      // each decoy route is a wandering line of one colour
      const col = cols[lane % cols.length]
      let x = this.wallX(-1) + 0.8 + lane * ((this.wallX(1) - this.wallX(-1) - 1.6) / (lanes - 1)) + (r() - 0.5) * 0.6
      for (let y = 0.4 + r() * 0.4; y < route.height + 1.6; y += 0.35 + r() * 0.45) {
        x += (r() - 0.5) * 0.5
        const clash = route.holds.some((o) => Math.hypot(o.x - x, o.y - y) < 0.5) || route.bolts.some(([bx, by]) => Math.hypot(bx - x, by - y) < 0.4)
        if (clash) continue
        holds.push({ x, y, type: types[Math.floor(r() * types.length)], rot: Math.round((r() - 0.5) * 60), col })
      }
    }
    this.decoys = { id: route.id, holds }
    return holds
  }

  private drawHolds(v: RenderView): void {
    const { route, snap } = v
    const sn = snap.c
    // which hold would a reaching hand grab?
    const targets = new Set<number>()
    sn.hands.forEach((h) => {
      if (h[2] !== 2) return
      let best = -1, bd = BODY.snap
      route.holds.forEach((o, i) => {
        if (o.type === 'foot') return
        const d = Math.hypot(o.x - h[0], o.y - h[1])
        if (d < bd) {
          bd = d
          best = i
        }
      })
      if (best >= 0) targets.add(best)
    })
    const top = this.camY + this.H / 2 / this.scale + 0.5
    const bottom = this.camY - this.H / 2 / this.scale - 0.5
    const decoyAlpha = WALLS[this.wall].light ? 0.4 : 0.3
    for (const h of this.decoyHolds(route)) {
      if (h.y < bottom || h.y > top) continue
      this.drawHold(h, null, h.col, decoyAlpha)
    }
    const col = routeTape(route.grade)
    let startLabel = false
    route.holds.forEach((h, i) => {
      if (h.y < bottom || h.y > top) return
      // the two start holds share one START label
      const label = h.role !== 'start' || !startLabel
      if (h.role === 'start') startLabel = true
      this.drawHold(h, targets.has(i) ? '#FFFFFF' : null, col, 1, label)
    })
    // foot hints for the local leader
    if (v.localLeader) {
      const c = this.c
      sn.footHint.forEach((idx, i) => {
        if (idx < 0) return
        const hx = idx === -2 ? sn.pelvis[0] + (i ? 0.16 : -0.16) : route.holds[idx].x
        const hy = idx === -2 ? 0 : route.holds[idx].y
        const x = this.sx(hx) + (i ? 9 : -21), y = this.sy(hy) + 3
        c.fillStyle = 'rgba(29,33,37,0.85)'
        c.beginPath()
        c.roundRect(x, y - 10, 13, 15, 3)
        c.fill()
        c.fillStyle = '#9FE3EA'
        c.font = `700 10px ${MONO}`
        c.fillText(i ? 'E' : 'Q', x + 3, y + 1)
      })
    }
  }

  private drawDraws(v: RenderView): void {
    const c = this.c
    const s = this.scale * 1.5
    const { route, snap } = v
    route.bolts.forEach(([bx, by], i) => {
      const [clipped, back] = snap.draws[i] ?? [0, 0]
      const x = this.sx(bx), y = this.sy(by)
      // hanger
      c.fillStyle = '#8A9096'
      c.beginPath()
      c.arc(x, y, Math.max(3, 0.025 * s), 0, Math.PI * 2)
      c.fill()
      // top biner, dogbone, rope biner
      c.strokeStyle = '#5C6168'
      c.lineWidth = 1.6
      c.beginPath()
      c.ellipse(x, y + 0.04 * s, 0.018 * s, 0.035 * s, 0, 0, Math.PI * 2)
      c.stroke()
      c.strokeStyle = back ? '#D62839' : clipped ? '#0E8F9B' : '#C9CCC7'
      c.lineWidth = Math.max(3, 0.03 * s)
      c.beginPath()
      c.moveTo(x, y + 0.075 * s)
      c.lineTo(x, y + 0.14 * s)
      c.stroke()
      c.strokeStyle = '#5C6168'
      c.lineWidth = 1.6
      c.beginPath()
      c.ellipse(x, y + 0.175 * s, 0.02 * s, 0.038 * s, 0, 0, Math.PI * 2)
      c.stroke()
      if (snap.c.clipHint === i && v.localLeader) this.badge(x + 12, y + 0.15 * s, 'F', '#FFB27A')
      if (back) this.badge(x + 12, y + 0.15 * s, '!', '#FF8A95')
    })
    // anchor: two bolts and rings
    const [ax, ay] = route.anchor
    const ai = route.bolts.length
    const clipped = snap.draws[ai]?.[0]
    for (const dx of [-0.12, 0.12]) {
      c.fillStyle = '#8A9096'
      c.beginPath()
      c.arc(this.sx(ax + dx), this.sy(ay + 0.06), Math.max(3, 0.025 * s), 0, Math.PI * 2)
      c.fill()
    }
    c.strokeStyle = '#5C6168'
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(this.sx(ax - 0.12), this.sy(ay + 0.06))
    c.lineTo(this.sx(ax), this.sy(ay - 0.08))
    c.lineTo(this.sx(ax + 0.12), this.sy(ay + 0.06))
    c.stroke()
    c.strokeStyle = clipped ? '#0E8F9B' : '#5C6168'
    c.lineWidth = 2.4
    c.beginPath()
    c.arc(this.sx(ax), this.sy(ay - 0.12), Math.max(4, 0.035 * s), 0, Math.PI * 2)
    c.stroke()
    if (snap.c.clipHint === ai && v.localLeader) this.badge(this.sx(ax) + 14, this.sy(ay - 0.12), 'F', '#FFB27A')
  }

  private badge(x: number, y: number, t: string, col: string): void {
    const c = this.c
    c.fillStyle = 'rgba(29,33,37,0.88)'
    c.beginPath()
    c.roundRect(x, y - 11, 16, 16, 3)
    c.fill()
    c.fillStyle = col
    c.font = `700 11px ${MONO}`
    c.fillText(t, x + 4, y + 1)
  }

  // ---------- rope ----------

  private drawRope(v: RenderView): void {
    const c = this.c
    const { rope } = v.snap
    const pts = rope.pts
    const width = Math.max(2.2, 0.03 * this.scale)
    c.lineCap = 'round'
    c.lineJoin = 'round'
    const path = () => {
      c.beginPath()
      c.moveTo(this.sx(pts[0][0]), this.sy(pts[0][1]))
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1]
        const d = Math.hypot(a[0] - b[0], a[1] - b[1])
        const slack = Math.max(0, rope.s[i] - d)
        const sag = Math.min(3, Math.sqrt(slack * Math.max(d, 0.2)) * 0.55 + slack * 0.25)
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - sag
        c.quadraticCurveTo(this.sx(mx), this.sy(my), this.sx(b[0]), this.sy(b[1]))
      }
    }
    path()
    c.strokeStyle = '#7A2E06'
    c.lineWidth = width + 2
    c.stroke()
    path()
    const T = v.snap.T
    c.strokeStyle = T > 2500 ? '#FFB27A' : ROPE
    c.lineWidth = width
    c.stroke()
    // rope fleck pattern
    path()
    c.setLineDash([3, 7])
    c.strokeStyle = 'rgba(29,33,37,0.45)'
    c.lineWidth = width * 0.4
    c.stroke()
    c.setLineDash([])
    // brake strand down to the rope bag
    const dv = pts[0]
    const bagX = belayerHome(v.route) - 0.6
    c.beginPath()
    c.moveTo(this.sx(dv[0]), this.sy(dv[1]))
    c.quadraticCurveTo(this.sx(dv[0] - 0.1), this.sy(0.2), this.sx(bagX + 0.15), this.sy(0.12))
    c.strokeStyle = ROPE
    c.lineWidth = width
    c.stroke()
    // coiled pile, shrinks as rope goes out
    const left = Math.max(0, 1 - rope.out / 60)
    for (let k = 0; k < 2 + Math.round(left * 5); k++) {
      c.beginPath()
      c.ellipse(this.sx(bagX + (k % 2) * 0.05), this.sy(0.06 + k * 0.025), (0.22 - k * 0.012) * this.scale, 0.05 * this.scale, 0, 0, Math.PI * 2)
      c.strokeStyle = k % 2 ? '#E8590C' : ROPE
      c.lineWidth = width * 0.9
      c.stroke()
    }
  }

  // ---------- people ----------

  private ik(ax: number, ay: number, bx: number, by: number, l1: number, l2: number, bend: number): [number, number] {
    let dx = bx - ax, dy = by - ay
    let d = Math.hypot(dx, dy)
    const max = l1 + l2 - 1e-3
    if (d > max) {
      dx *= max / d
      dy *= max / d
      d = max
    }
    d = Math.max(d, 1e-3)
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a))
    const ux = dx / d, uy = dy / d
    return [ax + ux * a - uy * h * bend, ay + uy * a + ux * h * bend]
  }

  private limb(pts: [number, number][], width: number, color: string): void {
    const c = this.c
    c.strokeStyle = color
    c.lineWidth = width
    c.lineCap = 'round'
    c.lineJoin = 'round'
    c.beginPath()
    c.moveTo(this.sx(pts[0][0]), this.sy(pts[0][1]))
    for (const p of pts.slice(1)) c.lineTo(this.sx(p[0]), this.sy(p[1]))
    c.stroke()
  }

  private drawPerson(
    chest: [number, number],
    pelvis: [number, number],
    hands: [number, number][],
    feet: [number, number][],
    colorIdx: number,
    shakeHands: [boolean, boolean],
    now: number,
    palOverride?: { shirt: string; helmet: string; pants: string },
    /** draw everything in one colour (a shadow on the wall) */
    mono?: string,
  ): void {
    const c = this.c
    const s = this.scale
    const pal = mono ? { shirt: mono, helmet: mono, pants: mono } : palOverride ?? PALETTE[colorIdx % PALETTE.length]
    const skin = mono ?? '#D9B99B'
    const ink = mono ?? INK
    const bag = mono ?? '#F8F8F6'
    const wLimb = Math.max(4, 0.09 * s)
    // legs
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1
      const hip: [number, number] = [pelvis[0] + side * 0.09, pelvis[1]]
      const f = feet[i]
      const knee = this.ik(hip[0], hip[1], f[0], f[1], BODY.thigh, BODY.shin, side > 0 ? 1 : -1)
      this.limb([hip, knee, f], wLimb * 1.15, pal.pants)
      // shoe
      c.fillStyle = ink
      c.beginPath()
      c.ellipse(this.sx(f[0] + side * 0.03), this.sy(f[1]), 0.06 * s, 0.03 * s, 0, 0, Math.PI * 2)
      c.fill()
    }
    // torso
    const dx = chest[0] - pelvis[0], dy = chest[1] - pelvis[1]
    const len = Math.hypot(dx, dy) || 1
    const px = -dy / len, py = dx / len
    const sh = 0.17, hw = 0.12
    c.fillStyle = pal.shirt
    c.beginPath()
    c.moveTo(this.sx(chest[0] + px * sh), this.sy(chest[1] + py * sh))
    c.lineTo(this.sx(chest[0] - px * sh), this.sy(chest[1] - py * sh))
    c.lineTo(this.sx(pelvis[0] - px * hw), this.sy(pelvis[1] - py * hw))
    c.lineTo(this.sx(pelvis[0] + px * hw), this.sy(pelvis[1] + py * hw))
    c.closePath()
    c.fill()
    c.strokeStyle = 'rgba(0,0,0,0.3)'
    c.lineWidth = 1
    c.stroke()
    // harness and chalk bag
    c.strokeStyle = ink
    c.lineWidth = Math.max(3, 0.05 * s)
    c.beginPath()
    c.moveTo(this.sx(pelvis[0] - px * 0.13), this.sy(pelvis[1] - py * 0.13 + 0.03))
    c.lineTo(this.sx(pelvis[0] + px * 0.13), this.sy(pelvis[1] + py * 0.13 + 0.03))
    c.stroke()
    c.fillStyle = bag
    c.beginPath()
    c.roundRect(this.sx(pelvis[0] - 0.04), this.sy(pelvis[1] + 0.0), 0.08 * s, 0.09 * s, 0.02 * s)
    c.fill()
    // arms
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1
      const shoulder: [number, number] = [chest[0] + px * sh * side * -1, chest[1] + py * sh * side * -1]
      let h = hands[i]
      if (shakeHands[i]) h = [h[0] + Math.sin(now * 70 + i) * 0.012, h[1] + Math.cos(now * 63) * 0.01]
      const elbow = this.ik(shoulder[0], shoulder[1], h[0], h[1], BODY.upperArm, BODY.foreArm, side > 0 ? -1 : 1)
      this.limb([shoulder, elbow], wLimb, pal.shirt)
      this.limb([elbow, h], wLimb * 0.85, skin)
      c.fillStyle = skin
      c.beginPath()
      c.arc(this.sx(h[0]), this.sy(h[1]), 0.04 * s, 0, Math.PI * 2)
      c.fill()
    }
    // head and helmet
    const hx = chest[0] + (dx / len) * 0.2, hy = chest[1] + (dy / len) * 0.2
    c.fillStyle = skin
    c.beginPath()
    c.arc(this.sx(hx), this.sy(hy), 0.11 * s, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = pal.helmet
    c.beginPath()
    c.arc(this.sx(hx), this.sy(hy + 0.015), 0.12 * s, Math.PI * 1.02, Math.PI * 1.98)
    c.fill()
  }

  private drawGhost(v: RenderView): void {
    const g = v.ghost
    if (!g) return
    const c = this.c
    const p = g.pose
    c.save()
    c.globalAlpha = 0.34
    this.drawPerson(p.chest, p.pelvis, p.hands, p.feet, 0, [false, false], v.now, GHOST_PAL)
    c.restore()
    if (!v.hud) return
    c.save()
    c.globalAlpha = 0.75
    c.font = `600 10px ${MONO}`
    const t = `ghost · ${g.name}`
    const w = c.measureText(t).width + 10
    const sx = this.sx(p.chest[0]) - w / 2, sy = this.sy(p.chest[1] + 0.5)
    c.fillStyle = 'rgba(248,248,246,0.8)'
    c.beginPath()
    c.roundRect(sx, sy - 11, w, 15, 3)
    c.fill()
    c.fillStyle = INK
    c.fillText(t, sx + 5, sy)
    c.restore()
  }

  /** attempt clock, top centre; races the ghost when there is one */
  private drawTimer(v: RenderView): void {
    const c = this.c
    const { snap } = v
    const t = snap.topT >= 0 ? snap.topT : snap.t
    const g = v.ghost
    const main = fmtTime(t)
    c.font = `700 20px ${MONO}`
    const mw = c.measureText(main).width
    let sub = ''
    let subCol = HUD.muted
    if (g) {
      const d = snap.c.pelvis[1] - g.pose.pelvis[1]
      if (snap.topT >= 0) {
        const diff = snap.topT - g.time
        sub = `${diff <= 0 ? 'beat' : 'missed'} ${g.name}'s ${fmtTime(g.time)} by ${Math.abs(diff).toFixed(1)} s`
        subCol = diff <= 0 ? HUD.good : HUD.bad
      } else if (t > g.time) {
        sub = `${g.name}'s ghost topped at ${fmtTime(g.time)}`
        subCol = HUD.bad
      } else {
        sub = `ghost ${g.name} · ${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} m`
        subCol = d >= 0 ? HUD.good : HUD.warn
      }
    }
    c.font = `600 11px ${MONO}`
    const sw = sub ? c.measureText(sub).width : 0
    const w = Math.max(mw, sw) + 28
    const h = sub ? 52 : 34
    const x = this.W / 2 - w / 2
    this.panel(x, 14, w, h)
    c.textAlign = 'center'
    c.font = `700 20px ${MONO}`
    c.fillStyle = snap.topT >= 0 ? HUD.good : HUD.text
    c.fillText(main, this.W / 2, 38)
    if (sub) {
      c.font = `600 11px ${MONO}`
      c.fillStyle = subCol
      c.fillText(sub, this.W / 2, 56)
    }
    c.textAlign = 'left'
  }

  private drawClimber(v: RenderView): void {
    const sn = v.snap.c
    const shake: [boolean, boolean] = [sn.pop[0] > 0 || sn.pump[0] > 88, sn.pop[1] > 0 || sn.pump[1] > 88]
    // free limbs windmill while falling
    const flail = v.snap.fall ? 1 : 0
    const wob = (l: [number, number, number, number], i: number, amp: number): [number, number] =>
      flail && l[2] === 0 ? [l[0] + Math.sin(v.now * 17 + i * 2.1) * amp, l[1] + Math.cos(v.now * 13 + i * 1.7) * amp] : [l[0], l[1]]
    const limbs = this.smoothLimbs(sn.chest, sn.pelvis, [...sn.hands.map((h, i) => wob(h, i, 0.12)), ...sn.feet.map((f, i) => wob(f, i + 2, 0.08))])
    // a soft shadow on the wall behind the climber
    const off = (p: [number, number]): [number, number] => [p[0] + 0.07, p[1] - 0.06]
    this.c.save()
    this.c.globalAlpha = 0.22
    this.drawPerson(off(sn.chest), off(sn.pelvis), limbs.slice(0, 2).map(off), limbs.slice(2).map(off), 0, [false, false], v.now, undefined, '#000')
    this.c.restore()
    this.drawPerson(
      sn.chest,
      sn.pelvis,
      limbs.slice(0, 2),
      limbs.slice(2),
      v.leader.color,
      shake,
      v.now,
    )
    if (v.hud) this.nameTag(sn.chest[0], sn.chest[1] + 0.55, v.leader.name, v.leader.color)
  }

  /**
   * Hands and feet move toward where the sim says they are at a capped speed
   * relative to the body: ordinary motion passes straight through, but a foot
   * placed on a new hold travels there (with a little lift) instead of jumping.
   */
  private smoothLimbs(chest: [number, number], pelvis: [number, number], target: [number, number][]): [number, number][] {
    const base = (i: number) => (i < 2 ? chest : pelvis)
    const want = target.map((p, i) => [p[0] - base(i)[0], p[1] - base(i)[1]] as [number, number])
    const dt = this.frameDt
    if (!this.limbOff || dt <= 0 || dt > 0.25) this.limbOff = want.map((p) => [p[0], p[1]])
    const out: [number, number][] = []
    for (let i = 0; i < want.length; i++) {
      const o = this.limbOff[i]
      const dx = want[i][0] - o[0], dy = want[i][1] - o[1]
      const d = Math.hypot(dx, dy)
      // far off (a respawn or a new attempt): just snap
      if (d > 1.5) {
        o[0] = want[i][0]
        o[1] = want[i][1]
      } else {
        const step = (i < 2 ? 9 : 4.5) * dt
        const k = d <= step ? 1 : step / d
        o[0] += dx * k
        o[1] += dy * k
      }
      const left = Math.hypot(want[i][0] - o[0], want[i][1] - o[1])
      const lift = i >= 2 ? Math.min(0.12, left * 0.35) : 0
      out.push([base(i)[0] + o[0], base(i)[1] + o[1] + lift])
    }
    return out
  }

  private drawBelayer(v: RenderView): void {
    const b = v.snap.b
    const dev: [number, number] = v.snap.rope.pts[0]
    const lifted = b.y > 1.0
    const pel: [number, number] = [b.x, b.y]
    const chest: [number, number] = [b.x - 0.05, b.y + 0.5]
    const kickT = v.now * 14
    const feet: [number, number][] = lifted
      ? [
          [b.x - 0.1 + Math.sin(kickT) * 0.12, b.y - 0.8 + Math.cos(kickT) * 0.05],
          [b.x + 0.15 - Math.sin(kickT + 1) * 0.12, b.y - 0.75],
        ]
      : [
          [b.x - 0.2, 0],
          [b.x + 0.15, 0],
        ]
    const brake: [number, number] = [b.mode === 'feed' ? b.x - 0.1 : b.x - 0.05, b.mode === 'take' ? b.y + 0.35 : b.y - 0.15]
    const guide: [number, number] = b.mode === 'feed' ? [dev[0] + 0.3, dev[1] + 0.25] : [dev[0] + 0.05, dev[1] + 0.12]
    const color = v.belayer?.color ?? 1
    this.drawPerson(chest, pel, [brake, guide], feet, color, [false, false], v.now)
    // device
    const c = this.c
    c.fillStyle = b.mode === 'lock' ? '#D62839' : '#5C6168'
    c.beginPath()
    c.roundRect(this.sx(dev[0]) - 5, this.sy(dev[1]) - 6, 10, 12, 2)
    c.fill()
    if (v.hud) this.nameTag(b.x, b.y + 1.0, v.belayer ? v.belayer.name : 'Bot belayer', color)
  }

  /** a puff of dust where the leader landed */
  private drawDust(v: RenderView): void {
    const t = v.snap.ouch
    if (t < 0 || t > 0.9) return
    const c = this.c
    const x = v.snap.c.pelvis[0]
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI
      const r = (0.25 + t * 1.3) * (0.7 + ((i * 37) % 10) / 20)
      c.globalAlpha = Math.max(0, 0.55 * (1 - t / 0.9))
      c.fillStyle = '#C8B89A'
      c.beginPath()
      c.arc(this.sx(x + Math.cos(a) * r), this.sy(0.05 + Math.sin(a) * r * 0.35), (0.1 + t * 0.25) * this.scale, 0, Math.PI * 2)
      c.fill()
    }
    c.globalAlpha = 1
  }

  /** a speech bubble in world space */
  private bubble(wx: number, wy: number, text: string, color: string, alpha = 1, size = 14): void {
    const c = this.c
    const x = this.sx(wx), y = this.sy(wy)
    c.globalAlpha = alpha
    c.font = `700 ${size}px ${MONO}`
    const w = c.measureText(text).width + 16
    c.fillStyle = '#fff'
    c.strokeStyle = INK
    c.lineWidth = 1.5
    c.beginPath()
    c.roundRect(x, y - size - 4, w, size + 10, 4)
    c.fill()
    c.stroke()
    c.fillStyle = color
    c.fillText(text, x + 8, y - 1)
    c.globalAlpha = 1
  }

  /** involuntary noises: screams on the way down, the belayer getting yanked, the landing */
  private drawShouts(v: RenderView): void {
    const sn = v.snap
    const pick = (list: string[], seed: number) => list[Math.abs(Math.floor(seed * 7.3)) % list.length]
    if (sn.fall && sn.t - sn.fall.t0 > 0.12) {
      const txt = pick(['AAAAH!', 'NOOOO!', 'WHOAAA!', 'TAKE TAKE TAKE!', 'MUMMY!', 'CATCH ME!', 'I TRUSTED YOU!'], sn.fall.t0)
      const jit = Math.sin(v.now * 40) * 0.02
      this.bubble(sn.c.chest[0] + 0.3 + jit, sn.c.chest[1] + 0.55, txt, '#D62839', 1, 16)
    }
    if (sn.b.y > 1.15) this.bubble(sn.b.x + 0.3, sn.b.y + 1.15, pick(['WHOA!', 'HNNNG!', 'UP I GO!', 'OOF!'], Math.floor(sn.t / 4)), '#0E8F9B')
    if (sn.ouch >= 0 && sn.ouch < 1.4 && sn.lastFall) {
      const txt = pick(['OOF.', 'OUCH.', 'MY ANKLES.', 'I\'M FINE. I\'M FINE.', 'ROCK, HELLO.'], sn.lastFall.t0)
      this.bubble(sn.c.pelvis[0] + 0.3, sn.c.pelvis[1] + 0.9, txt, INK, Math.min(1, 1.4 - sn.ouch + 0.3))
    }
    if (sn.lastFall && !sn.fall && sn.ouch < 0 && sn.lastFall.rating !== 'pending') {
      // the belayer's reaction to their own catch, for a moment after it
      const age = sn.t - (sn.lastFall.t0 + 1.2)
      if (age > 0 && age < 1.6) {
        const r = sn.lastFall.rating
        const txt = r === 'perfect' ? 'Got you.' : r === 'good' ? 'Got you!' : r === 'late' ? 'Sorry!!' : 'Oops.'
        this.bubble(sn.b.x + 0.3, sn.b.y + 1.15, txt, '#0E8F9B', Math.min(1, 1.6 - age))
      }
    }
  }

  private drawSpectators(v: RenderView): void {
    v.spectators.forEach((p, i) => {
      const x = belayerHome(v.route) - 1.5 - i * 0.9
      this.drawPerson([x, 1.45], [x, 0.95], [[x - 0.25, 1.0], [x + 0.25, 1.05]], [[x - 0.15, 0], [x + 0.15, 0]], p.color, [false, false], v.now)
      this.nameTag(x, 2.0, p.name, p.color)
    })
  }

  private nameTag(x: number, y: number, name: string, color: number): void {
    const c = this.c
    c.font = `600 11px ${MONO}`
    const w = c.measureText(name).width + 12
    const sx = this.sx(x) - w / 2, sy = this.sy(y)
    c.fillStyle = 'rgba(29,33,37,0.78)'
    c.beginPath()
    c.roundRect(sx, sy - 13, w, 17, 3)
    c.fill()
    c.fillStyle = PALETTE[color % PALETTE.length].shirt
    c.fillRect(sx, sy - 13, 3, 17)
    c.fillStyle = '#fff'
    c.fillText(name, sx + 7, sy)
  }

  private drawCursor(v: RenderView): void {
    if (!v.localLeader || !v.input) return
    const [down0, down1] = v.input.handsDown
    if (!down0 && !down1) return
    const c = this.c
    const sn = v.snap.c
    const [mx, my] = v.input.mouse
    const r = this.canvas.getBoundingClientRect()
    c.setLineDash([5, 5])
    c.strokeStyle = 'rgba(255,255,255,0.55)'
    c.lineWidth = 1.5
    c.beginPath()
    c.arc(this.sx(sn.chest[0]), this.sy(sn.chest[1]), (sn.hipsIn ? BODY.reachHipsIn : BODY.reach) * this.scale, 0, Math.PI * 2)
    c.stroke()
    c.setLineDash([])
    c.strokeStyle = down0 ? '#9FE3EA' : '#FFB27A'
    c.lineWidth = 2
    const x = mx - r.left, y = my - r.top
    c.beginPath()
    c.moveTo(x - 9, y)
    c.lineTo(x + 9, y)
    c.moveTo(x, y - 9)
    c.lineTo(x, y + 9)
    c.stroke()
    c.font = `700 10px ${MONO}`
    c.fillStyle = c.strokeStyle
    c.fillText(down0 && down1 ? 'L+R' : down0 ? 'L' : 'R', x + 10, y - 8)
  }

  private drawCalls(v: RenderView): void {
    const c = this.c
    const sn = v.snap
    const now = sn.t
    for (const call of sn.calls) {
      const age = now - call.t
      if (age > 3) continue
      const info = CALL_BY_ID.get(call.id)
      if (!info) continue
      const pos = call.role === 'leader' ? [sn.c.chest[0] + 0.35, sn.c.chest[1] + 0.35] : [sn.b.x + 0.3, sn.b.y + 1.1]
      const x = this.sx(pos[0]), y = this.sy(pos[1]) - Math.min(age, 0.4) * 30
      c.globalAlpha = Math.max(0, Math.min(1, 3 - age))
      c.font = `700 14px ${MONO}`
      const w = c.measureText(info.text).width + 16
      c.fillStyle = '#fff'
      c.strokeStyle = INK
      c.lineWidth = 1.5
      c.beginPath()
      c.roundRect(x, y - 18, w, 24, 4)
      c.fill()
      c.stroke()
      c.fillStyle = call.id === 6 ? '#D62839' : call.role === 'belayer' ? '#0E8F9B' : INK
      c.fillText(info.text, x + 8, y - 1)
      c.globalAlpha = 1
    }
  }

  // ---------- HUD ----------

  private panel(x: number, y: number, w: number, h: number, stripe?: string): void {
    const c = this.c
    c.fillStyle = 'rgba(0,0,0,0.28)'
    c.beginPath()
    c.roundRect(x + 1, y + 3, w, h, 10)
    c.fill()
    c.fillStyle = HUD.card
    c.beginPath()
    c.roundRect(x, y, w, h, 10)
    c.fill()
    if (stripe) {
      c.fillStyle = stripe
      c.beginPath()
      c.roundRect(x, y, 7, h, [10, 0, 0, 10])
      c.fill()
    }
  }

  /** a rounded meter bar */
  private bar(x: number, y: number, w: number, frac: number, col: string): void {
    const c = this.c
    c.fillStyle = HUD.track
    c.beginPath()
    c.roundRect(x, y, w, 11, 5.5)
    c.fill()
    if (frac <= 0) return
    c.fillStyle = col
    c.beginPath()
    c.roundRect(x, y, Math.max(11, w * Math.min(1, frac)), 11, 5.5)
    c.fill()
  }

  private drawHud(v: RenderView): void {
    const c = this.c
    const { route, snap } = v
    const yds = v.settings.grades === 'yds'
    const grade = yds ? YDS[route.grade] ?? route.grade : route.grade
    const tape = routeTape(route.grade)
    // route card, top left
    this.panel(14, 14, 256, 74, tape)
    c.fillStyle = HUD.text
    c.font = `900 24px ${DISPLAY}`
    c.fillText(route.name.toUpperCase(), 32, 42)
    c.font = `600 12px ${BODY_FONT}`
    c.fillStyle = HUD.muted
    c.fillText(`${grade} · ${ANGLE_LABEL[route.angle]}`, 32, 60)
    const hp = snap.topped ? route.anchor[1] : Math.max(0, snap.high)
    c.font = `600 11px ${MONO}`
    c.fillText(`high ${hp.toFixed(1)} / ${route.anchor[1].toFixed(0)} m · falls ${snap.falls}`, 32, 77)
    if (snap.weighted && !snap.topped) {
      c.font = `700 11px ${BODY_FONT}`
      c.fillStyle = HUD.bad
      c.fillText('not a send', 196, 60)
    }

    // leader panel, bottom left
    const sn = snap.c
    const by = this.H - 108
    this.panel(14, by, 270, 94)
    c.font = `700 10px ${BODY_FONT}`
    c.fillStyle = HUD.muted
    c.fillText(`FOREARMS · ${v.leader.name.toUpperCase()}`, 26, by + 20)
    for (let i = 0; i < 2; i++) {
      const y = by + 30 + i * 18
      const p = sn.pump[i]
      c.font = `700 11px ${BODY_FONT}`
      c.fillStyle = HUD.text
      c.fillText(i ? 'R' : 'L', 26, y + 10)
      this.bar(42, y, 160, p / 100, p > 85 ? HUD.bad : p > 60 ? ROPE : '#2FA36B')
      c.font = `600 11px ${MONO}`
      c.fillStyle = HUD.text
      c.fillText(`${p}%`, 210, y + 10)
      if (sn.chalk[i]) {
        c.fillStyle = HUD.muted
        c.fillText('chalk', 238, y + 10)
      }
    }
    c.font = `600 11px ${BODY_FONT}`
    c.fillStyle = HUD.good
    const posture = `feet ${sn.feetOn} · drain ×${sn.mult.toFixed(2)}${sn.hipsIn ? ' · hips in' : ''}`
    c.fillText(posture, 26, by + 82)
    if (sn.clip >= 0) this.bar(170, by + 72, 100, sn.clip, ROPE)

    // belay panel, bottom right
    const bx = this.W - 284
    this.panel(bx, by, 270, 94)
    c.font = `700 10px ${BODY_FONT}`
    c.fillStyle = HUD.muted
    c.fillText(`BELAY · ${(v.belayer ? v.belayer.name : 'bot').toUpperCase()}`, bx + 12, by + 20)
    const kN = snap.T / 1000
    // "Watch me!" makes the tension meter stand out for the belayer
    if (snap.calls.some((k) => k.id === 7 && snap.t - k.t < 4)) {
      c.strokeStyle = ROPE
      c.lineWidth = 3
      c.beginPath()
      c.roundRect(bx - 2, by - 2, 274, 98, 11)
      c.stroke()
      c.fillStyle = HUD.warn
      c.fillText('WATCH ME', bx + 186, by + 20)
    }
    c.font = `600 11px ${BODY_FONT}`
    c.fillStyle = HUD.text
    c.fillText('rope', bx + 12, by + 42)
    this.bar(bx + 50, by + 32, 152, kN / 7, kN > 5 ? HUD.bad : kN > 3.6 ? ROPE : HUD.calm)
    c.font = `600 11px ${MONO}`
    c.fillStyle = HUD.text
    c.fillText(`${kN.toFixed(1)} kN`, bx + 210, by + 42)
    c.fillText(`slack ${snap.slack.toFixed(1)} m`, bx + 12, by + 62)
    const modeText: Record<string, string> = { idle: 'holding', feed: 'feeding ↓', take: 'taking in ↑', lock: snap.b.soft ? 'soft catch' : 'locked' }
    c.font = `700 11px ${BODY_FONT}`
    c.fillStyle = snap.b.mode === 'lock' ? HUD.bad : HUD.good
    c.fillText(modeText[snap.b.mode] ?? snap.b.mode, bx + 140, by + 62)
    // prompts for the belayer
    let prompt = ''
    const lastCall = snap.calls.length ? snap.calls[snap.calls.length - 1] : null
    if (snap.fall) prompt = 'FALLING! Hold Enter to catch'
    else if (sn.clip >= 0) prompt = 'Clipping: feed slack ↓'
    else if (sn.clipHint >= 0 && snap.slack < 1.2) prompt = 'Clip coming: feed some slack ↓'
    else if (lastCall && snap.t - lastCall.t < 2.5 && lastCall.id === 5) prompt = 'Take! Pull in ↑ then hold Enter'
    else if (lastCall && snap.t - lastCall.t < 2.5 && lastCall.id === 4) prompt = 'Slack! Feed ↓'
    else if (snap.topped || (lastCall && lastCall.id === 8)) prompt = 'Lower: hold ↓ to pay out'
    else if (snap.hanging) prompt = 'Resting on the rope: hold them'
    else if (snap.slack < 0.15 && snap.high > 2) prompt = 'Tight! Feed ↓ or you short-rope'
    else if (snap.slack > 1.8 && sn.pelvis[1] < 6 && sn.pelvis[1] > 2 && !snap.topped) prompt = 'Too much slack! Pull in ↑'
    if (prompt && (v.localBelayer || !v.belayer)) {
      c.fillStyle = snap.fall ? HUD.bad : HUD.warn
      c.fillText(prompt, bx + 12, by + 82)
    }
    if (snap.b.alert > 0) {
      c.fillStyle = HUD.bad
      c.fillText('alert', bx + 220, by + 20)
    }

    this.drawTimer(v)
    if (v.coach) this.drawCoach(v.coach)

    // help line, bottom centre
    c.font = `600 11px ${MONO}`
    const help = v.helpOpen
      ? []
      : ['H: controls', v.latency !== null ? `ping ${Math.round(v.latency)} ms` : ''].filter(Boolean)
    if (help.length) {
      const t = help.join('  ·  ')
      const w = c.measureText(t).width + 18
      this.panel(this.W / 2 - w / 2, this.H - 34, w, 22)
      c.fillStyle = HUD.muted
      c.fillText(t, this.W / 2 - w / 2 + 9, this.H - 19)
    }
  }

  /** the coach's tip, wrapped to fit between the two bottom panels */
  private drawCoach(text: string): void {
    const c = this.c
    c.font = `600 13px ${BODY_FONT}`
    const maxW = Math.max(240, Math.min(560, this.W - 620))
    const lines: string[] = []
    let line = ''
    for (const word of text.split(' ')) {
      const t = line ? `${line} ${word}` : word
      if (c.measureText(t).width > maxW && line) {
        lines.push(line)
        line = word
      } else line = t
    }
    if (line) lines.push(line)
    const w = Math.max(...lines.map((l) => c.measureText(l).width)) + 44
    const h = lines.length * 18 + 16
    const x = this.W / 2 - w / 2, y = this.H - 46 - h
    c.fillStyle = 'rgba(248,248,246,0.96)'
    c.strokeStyle = INK
    c.lineWidth = 1.5
    c.beginPath()
    c.roundRect(x, y, w, h, 6)
    c.fill()
    c.stroke()
    c.fillStyle = ROPE
    c.beginPath()
    c.arc(x + 16, y + h / 2, 5, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = INK
    lines.forEach((l, i) => c.fillText(l, x + 30, y + 21 + i * 18))
  }

  private drawToasts(v: RenderView): void {
    const c = this.c
    let y = 104
    for (const t of v.toasts) {
      const age = v.now - t.t
      if (age > 2.6) continue
      c.globalAlpha = Math.max(0, Math.min(1, (2.6 - age) * 2))
      c.font = `900 26px ${DISPLAY}`
      const w = c.measureText(t.text).width + 30
      const x = this.W / 2 - w / 2
      c.fillStyle = t.kind === 'bad' ? 'rgba(214,40,57,0.92)' : t.kind === 'good' ? 'rgba(14,143,155,0.94)' : 'rgba(29,33,37,0.88)'
      c.beginPath()
      c.roundRect(x, y, w, 38, 4)
      c.fill()
      c.fillStyle = '#fff'
      c.fillText(t.text.toUpperCase(), x + 15, y + 28)
      c.globalAlpha = 1
      y += 46
    }
  }

  private drawDebug(v: RenderView): void {
    const c = this.c
    const sn = v.snap
    const f = sn.fall ?? sn.lastFall
    const x = this.W - 300, y = 56
    this.panel(x, y, 286, 206)
    c.font = `600 11px ${MONO}`
    c.fillStyle = HUD.muted
    c.fillText('FALL READOUT (G to hide)', x + 12, y + 20)
    if (f) {
      const h = Math.max(0, f.h)
      const L = f.C + h + 1
      const free = 2 * h + f.s
      const FF = Math.max(0, Math.min(2, free / Math.max(0.5, L)))
      const stretch = L * (0.04 + 0.06 * FF)
      const travel = f.soft ? 0.6 : 0.1
      const predDrop = free + stretch + travel
      const predF = (2.2 + 4.2 * Math.sqrt(FF)) * (f.soft ? 0.75 : 1)
      const lines = [
        `last clip C   ${f.C.toFixed(1)} m`,
        `above it h    ${h.toFixed(1)} m`,
        `slack s       ${f.s.toFixed(1)} m`,
        `fall factor   ${FF.toFixed(2)}`,
        `model drop    ${predDrop.toFixed(1)} m`,
        `sim drop      ${(f.startY - f.lowY).toFixed(1)} m`,
        `model force   ${predF.toFixed(1)} kN`,
        `sim force     ${(f.peak / 1000).toFixed(1)} kN`,
        `catch         ${f.soft ? 'soft' : 'hard'} · ${f.result}`,
      ]
      c.fillStyle = HUD.text
      lines.forEach((l, i) => c.fillText(l, x + 12, y + 42 + i * 16))
    } else {
      c.fillStyle = HUD.text
      c.fillText('No falls yet.', x + 12, y + 42)
    }
    c.fillStyle = HUD.good
    c.fillText(`sections ${sn.rope.T.map((t) => (t / 1000).toFixed(1)).join(' ')} kN`, x + 12, y + 196)
  }
}
