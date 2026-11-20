// Procedural textures, generated once at startup.

import { rng } from '../sim/routes'

export function rockTexture(size = 512, seed = 7): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const c = cv.getContext('2d')!
  const r = rng(seed)
  c.fillStyle = '#B9B09F'
  c.fillRect(0, 0, size, size)
  // large tonal blotches
  for (let i = 0; i < 70; i++) {
    const x = r() * size, y = r() * size, rad = 20 + r() * 90
    const g = c.createRadialGradient(x, y, 0, x, y, rad)
    const dark = r() < 0.5
    g.addColorStop(0, dark ? 'rgba(70,60,48,0.16)' : 'rgba(255,248,235,0.14)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    c.fillStyle = g
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      c.save()
      c.translate(dx, dy)
      c.fillRect(x - rad, y - rad, rad * 2, rad * 2)
      c.restore()
    }
  }
  // speckle
  const img = c.getImageData(0, 0, size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 22
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n * 0.9
  }
  c.putImageData(img, 0, 0)
  // bedding lines and cracks
  c.lineCap = 'round'
  for (let i = 0; i < 14; i++) {
    let x = r() * size, y = r() * size
    c.strokeStyle = `rgba(55,48,40,${0.18 + r() * 0.25})`
    c.lineWidth = 0.8 + r() * 1.8
    c.beginPath()
    c.moveTo(x, y)
    const steps = 6 + Math.floor(r() * 10)
    const dir = r() < 0.6 ? 0 : Math.PI / 2
    for (let k = 0; k < steps; k++) {
      x += Math.cos(dir) * (10 + r() * 20) + (r() - 0.5) * 12
      y += Math.sin(dir) * (10 + r() * 20) + (r() - 0.5) * 12
      c.lineTo(x, y)
    }
    c.stroke()
    // highlight edge under the crack
    c.strokeStyle = 'rgba(255,250,240,0.12)'
    c.lineWidth = 1
    c.stroke()
  }
  // lichen
  for (let i = 0; i < 26; i++) {
    const x = r() * size, y = r() * size
    c.fillStyle = r() < 0.5 ? 'rgba(160,170,110,0.25)' : 'rgba(210,190,120,0.22)'
    for (let k = 0; k < 6; k++) {
      c.beginPath()
      c.arc(x + (r() - 0.5) * 14, y + (r() - 0.5) * 10, 1.5 + r() * 4, 0, Math.PI * 2)
      c.fill()
    }
  }
  return cv
}

export function grassTexture(): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = 256
  cv.height = 64
  const c = cv.getContext('2d')!
  const r = rng(99)
  const g = c.createLinearGradient(0, 0, 0, 64)
  g.addColorStop(0, '#6E7A5A')
  g.addColorStop(0.3, '#5B6649')
  g.addColorStop(1, '#4A4436')
  c.fillStyle = g
  c.fillRect(0, 0, 256, 64)
  for (let i = 0; i < 160; i++) {
    const x = r() * 256, y = 14 + r() * 50
    c.fillStyle = `rgba(${60 + r() * 50},${50 + r() * 40},${35 + r() * 30},0.5)`
    c.fillRect(x, y, 1 + r() * 3, 1 + r() * 2)
  }
  return cv
}
