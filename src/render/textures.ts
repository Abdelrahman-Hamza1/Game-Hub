// Procedural textures for the climbing gym, generated once per wall colour.

import { rng } from '../sim/routes'

export type WallColor = 'charcoal' | 'navy' | 'plywood' | 'sage' | 'white'

export const WALLS: Record<WallColor, { name: string; base: string; light: boolean }> = {
  charcoal: { name: 'Charcoal', base: '#33383F', light: false },
  navy: { name: 'Midnight blue', base: '#263A57', light: false },
  plywood: { name: 'Plywood', base: '#CDB38C', light: true },
  sage: { name: 'Sage green', base: '#5E7A69', light: false },
  white: { name: 'White', base: '#E6E9EC', light: true },
}

/** One square wall panel (PANEL_M metres a side) with seams, grain and a grid of bolt holes. */
export const PANEL_M = 1.22
export function panelTexture(color: WallColor, size = 256): HTMLCanvasElement {
  const wall = WALLS[color]
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const c = cv.getContext('2d')!
  const r = rng(17)
  c.fillStyle = wall.base
  c.fillRect(0, 0, size, size)
  // paint texture: soft tonal blotches and fine speckle
  for (let i = 0; i < 40; i++) {
    const x = r() * size, y = r() * size, rad = 20 + r() * 60
    const g = c.createRadialGradient(x, y, 0, x, y, rad)
    const a = color === 'plywood' || color === 'white' ? 0.03 : 0.05
    g.addColorStop(0, r() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    c.fillStyle = g
    c.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  if (color === 'plywood') {
    // wood grain
    for (let i = 0; i < 26; i++) {
      const y = r() * size
      c.strokeStyle = `rgba(120,80,40,${0.06 + r() * 0.08})`
      c.lineWidth = 1 + r() * 2
      c.beginPath()
      for (let x = 0; x <= size; x += 16) c.lineTo(x, y + Math.sin(x * 0.03 + i) * 3)
      c.stroke()
    }
  }
  const img = c.getImageData(0, 0, size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 8
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  c.putImageData(img, 0, 0)
  // bolt holes: a 5 x 5 grid of T-nuts
  const step = size / 5
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 5; j++) {
      const x = step * (i + 0.5), y = step * (j + 0.5)
      c.fillStyle = wall.light ? 'rgba(40,40,40,0.35)' : 'rgba(0,0,0,0.45)'
      c.beginPath()
      c.arc(x, y, 2.6, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = wall.light ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.1)'
      c.beginPath()
      c.arc(x + 0.6, y + 1.2, 2.6, 0.2, Math.PI - 0.2)
      c.fill()
    }
  // seams on two edges, so tiles join into a grid
  c.fillStyle = wall.light ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.38)'
  c.fillRect(0, 0, size, 2)
  c.fillRect(0, 0, 2, size)
  c.fillStyle = wall.light ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.07)'
  c.fillRect(0, 2, size, 1)
  c.fillRect(2, 0, 1, size)
  return cv
}

/** Crash mat texture: padded blue foam with a seam. */
export function matTexture(): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = 256
  cv.height = 64
  const c = cv.getContext('2d')!
  const g = c.createLinearGradient(0, 0, 0, 64)
  g.addColorStop(0, '#3E78C9')
  g.addColorStop(0.18, '#2F62AE')
  g.addColorStop(1, '#244C8A')
  c.fillStyle = g
  c.fillRect(0, 0, 256, 64)
  c.fillStyle = 'rgba(255,255,255,0.25)'
  c.fillRect(0, 0, 256, 2)
  c.fillStyle = 'rgba(0,0,0,0.3)'
  c.fillRect(254, 0, 2, 64)
  const r = rng(5)
  for (let i = 0; i < 200; i++) {
    c.fillStyle = `rgba(255,255,255,${r() * 0.05})`
    c.fillRect(r() * 256, 4 + r() * 60, 2, 2)
  }
  return cv
}
