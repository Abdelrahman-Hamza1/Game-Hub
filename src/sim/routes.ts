// Route generator. Every route is built from the grade recipe in DESIGN.md §8:
// hold mix, reach, footholds, rests, wall angle and bolt spacing all scale with
// the grade, so a 5a and a 7b+ play by the same rules with different numbers.

import { BODY, GRADES } from './constants'
import type { Hold, HoldType, Route, WallAngle } from './types'
import { ownHold } from './types'

export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

export interface RouteSpec {
  name: string
  grade: string
  angle?: WallAngle
  height?: number
  seed: number
  /** how much the line wanders left and right (m); bigger means more rope drag */
  wander?: number
  fa?: { by: string; date: string }
}

const WIDTH = 4

export function gradeIndex(grade: string): number {
  const i = GRADES.indexOf(grade)
  return i < 0 ? 3 : i
}

export function defaultAngle(g: number): WallAngle {
  if (g <= 0) return 'slab'
  if (g <= 5) return 'vertical'
  if (g <= 8) return 'overhang'
  return 'steep'
}

function pickType(r: () => number, t: number): HoldType {
  const w: [HoldType, number][] = [
    ['jug', Math.max(0.06, 0.75 - 0.7 * t)],
    ['crimp', 0.05 + 0.38 * t],
    ['sloper', 0.07 + 0.13 * t],
    ['pinch', 0.07 + 0.08 * t],
    ['pocket', 0.04 + 0.12 * t],
  ]
  const sum = w.reduce((a, b) => a + b[1], 0)
  let x = r() * sum
  for (const [type, weight] of w) {
    x -= weight
    if (x <= 0) return type
  }
  return 'jug'
}

export function generateRoute(spec: RouteSpec): Route {
  const r = rng(spec.seed * 7919 + 13)
  const g = gradeIndex(spec.grade)
  const t = g / (GRADES.length - 1)
  const H = spec.height ?? 14
  const angle = spec.angle ?? defaultAngle(g)
  const wander = spec.wander ?? 0.25 + r() * 0.35
  const phase = r() * Math.PI * 2
  const freq = 0.25 + r() * 0.2
  const center = (y: number) => WIDTH / 2 + wander * Math.sin(y * freq + phase)
  const restEvery = [3, 3, 4, 5, 5, 6, 7, 9, 12, 14, 99, 99][g]
  const dyLo = 0.2 + 0.16 * t
  const dyHi = 0.36 + 0.3 * t
  const footChance = 0.95 - 0.6 * t

  const holds: Hold[] = []
  const add = (h: Hold) => {
    if (holds.some((o) => Math.hypot(o.x - h.x, o.y - h.y) < 0.16)) return false
    holds.push(h)
    return true
  }
  const c0 = center(1.6)
  add({ type: 'jug', x: c0 - 0.24, y: 1.6, rot: 0, role: 'start' })
  add({ type: 'jug', x: c0 + 0.24, y: 1.72, rot: 0, role: 'start' })
  add({ type: 'foot', x: c0 - 0.3, y: 0.42, rot: 0 })
  add({ type: 'foot', x: c0 + 0.25, y: 0.55, rot: 0 })
  add({ type: 'foot', x: c0 - 0.05, y: 0.9, rot: 0 })

  let prev = { x: c0 + 0.24, y: 1.72 }
  let side = -1
  let move = 0
  const maxReach = BODY.reach - 0.04
  while (prev.y < H - 1.0) {
    move++
    const rest = move % restEvery === 0
    let dy = dyLo + r() * (dyHi - dyLo)
    const cx = center(prev.y + dy)
    let x = cx + side * (0.12 + r() * 0.26)
    // a wandering line still has to stay within a reach sideways
    const maxDx = 0.3 + 0.25 * t
    if (Math.abs(x - prev.x) > maxDx) x = prev.x + Math.sign(x - prev.x) * maxDx
    const dx = Math.abs(x - prev.x)
    // the new hold must be reachable from a lock-off on the previous hold
    const lim = Math.sqrt(Math.max(0.05, maxReach * maxReach - dx * dx)) - 0.2
    dy = Math.max(0.15, Math.min(dy, lim))
    const y = prev.y + dy
    const type = rest ? 'jug' : pickType(r, t)
    if (!add({ type, x, y, rot: Math.round((r() - 0.5) * 50), role: undefined })) {
      x += side * 0.12
      add({ type, x, y: y + 0.02, rot: 0 })
    }
    // footholds roughly where the feet go when this hold is a handhold
    const feet = rest ? 2 : r() < footChance ? 1 : 0
    for (let k = 0; k < feet; k++) {
      const fx = cx + (k === 0 ? -side : side) * (0.1 + r() * 0.22)
      const fy = y - 1.0 - r() * 0.3
      if (fy > 0.3) add({ type: rest || r() < 0.5 - 0.4 * t ? 'jug' : 'foot', x: fx, y: fy, rot: 0 })
    }
    prev = { x, y }
    side = -side
  }
  const top = { type: 'jug' as HoldType, x: center(H) - side * 0.18, y: Math.max(prev.y + 0.35, H - 0.55), rot: 0, role: 'top' as const }
  holds.push(top)
  // a few extra footholds scattered around for creative beta
  const extra = Math.round(H * (1.4 - 1.0 * t))
  for (let k = 0; k < extra; k++) {
    const y = 0.6 + r() * (H - 1.5)
    add({ type: 'foot', x: center(y) + (r() - 0.5) * 1.2, y, rot: 0 })
  }

  // bolts: first one low, then a gap that grows with the grade
  const bolts: [number, number][] = []
  let by = 2.5 + r() * 0.5
  const gap = 2.0 + 1.4 * t
  let bSide = r() < 0.5 ? -1 : 1
  while (by < H - 1.6) {
    bolts.push([round(center(by) + bSide * (0.3 + r() * 0.15)), round(by)])
    by += gap + (r() - 0.5) * 0.4
    if (r() < 0.6) bSide = -bSide
  }
  const anchor: [number, number] = [round(center(H) + 0.05), round(top.y + 0.35)]

  return {
    id: `${slug(spec.name)}-${spec.seed}`,
    name: spec.name,
    grade: spec.grade,
    angle,
    width: WIDTH,
    height: round(anchor[1] + 0.6),
    holds: holds.map((h) => ({ ...h, x: round(h.x), y: round(h.y) })),
    bolts,
    anchor,
    fa: spec.fa,
    seed: spec.seed,
  }
}

function round(v: number): number {
  return Math.round(v * 100) / 100
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'route'
}

// ---------- gym walls: several colour routes on one face ----------

/** Hold colours a setter can use; orange is left out so the rope stays readable. */
export const GYM_COLOURS: Record<string, string> = {
  Green: '#3FA34D',
  Yellow: '#F2B705',
  Teal: '#1FA6B4',
  Blue: '#3D7FD9',
  Red: '#E0344A',
  Purple: '#9B6BD6',
  Pink: '#E85D9E',
  White: '#EDEDEA',
}

export interface WallRoute {
  name: string
  grade: string
  colour: string
  bolts: [number, number][]
  anchor: [number, number]
  fa?: { by: string; date: string }
}

/** A gym wall: every hold on it once, tagged with its route, and the routes. Plain JSON. */
export interface Wall {
  id: string
  name: string
  angle: WallAngle
  width: number
  height: number
  holds: Hold[]
  routes: WallRoute[]
  seed?: number
}

export interface WallSpec {
  name: string
  angle: WallAngle
  height: number
  seed: number
  routes: { name: string; grade: string; colour: string; wander?: number; fa?: { by: string; date: string } }[]
}

/** metres between neighbouring routes' centre lines: close enough that lines cross */
const LANE = 1.15
const SPACE = 0.19

export function generateWall(spec: WallSpec): Wall {
  const holds: Hold[] = []
  const routes: WallRoute[] = []
  const free = (x: number, y: number) => holds.every((o) => Math.hypot(o.x - x, o.y - y) >= SPACE)
  spec.routes.forEach((rs, k) => {
    const r = generateRoute({ name: rs.name, grade: rs.grade, angle: spec.angle, height: spec.height, seed: spec.seed * 31 + k * 7 + 1, wander: rs.wander })
    const dx = 0.3 + k * LANE
    for (const h of r.holds) {
      let x = h.x + dx
      if (!free(x, h.y)) {
        // a hold already sits here: shift sideways a little, or leave out a spare foothold
        const alt = [0.1, -0.1, 0.16, -0.16, 0.22, -0.22].map((o) => x + o).find((xx) => free(xx, h.y))
        if (alt === undefined && h.type === 'foot' && !h.role) continue
        if (alt !== undefined) x = alt
      }
      holds.push({ ...h, x: round(x), r: k })
    }
    routes.push({
      name: rs.name,
      grade: rs.grade,
      colour: rs.colour,
      bolts: r.bolts.map(([x, y]) => [round(x + dx), y]),
      anchor: [round(r.anchor[0] + dx), r.anchor[1]],
      fa: rs.fa,
    })
  })
  return {
    id: `${slug(spec.name)}-${spec.seed}`,
    name: spec.name,
    angle: spec.angle,
    width: round(WIDTH + 0.6 + (spec.routes.length - 1) * LANE),
    height: round(Math.max(...routes.map((r) => r.anchor[1])) + 0.6),
    holds,
    routes,
    seed: spec.seed,
  }
}

const wallCache = new Map<string, Route>()

/** One colour of a wall as a climbable route. All the wall's holds stay grabbable. */
export function wallRoute(wall: Wall, k: number): Route {
  const id = `${wall.id}~${k}`
  const hit = wallCache.get(id)
  if (hit) return hit
  const wr = wall.routes[k]
  const route: Route = {
    id,
    name: wr.name,
    grade: wr.grade,
    angle: wall.angle,
    width: wall.width,
    height: wall.height,
    holds: wall.holds,
    bolts: wr.bolts,
    anchor: wr.anchor,
    fa: wr.fa,
    seed: wall.seed,
    wall: {
      id: wall.id,
      name: wall.name,
      own: k,
      colours: wall.routes.map((x) => x.colour),
      grades: wall.routes.map((x) => x.grade),
      bolts: wall.routes.flatMap((x, i) => (i === k ? [] : x.bolts)),
    },
  }
  wallCache.set(id, route)
  return route
}

export function wallRoutes(wall: Wall): Route[] {
  return wall.routes.map((_, k) => wallRoute(wall, k))
}

/** Find a wall route by id among some walls. */
export function findWallRoute(walls: Wall[], id: string): Route | null {
  const cut = id.lastIndexOf('~')
  if (cut < 0) return null
  const wall = walls.find((w) => w.id === id.slice(0, cut))
  const k = Number(id.slice(cut + 1))
  return wall && wall.routes[k] ? wallRoute(wall, k) : null
}

/** The home gym: four walls, twelve colours, 5a to 7b+. */
export const CRAG_WALL_SPECS: WallSpec[] = [
  {
    name: 'The Slab',
    angle: 'slab',
    height: 12,
    seed: 11,
    routes: [
      { name: 'Warm Hands', grade: '5a', colour: 'Green', wander: 0.2 },
      { name: 'Chalk Dust', grade: '5b', colour: 'Pink' },
      { name: 'First Clip', grade: '5c', colour: 'Blue' },
    ],
  },
  {
    name: 'Main Wall',
    angle: 'vertical',
    height: 14,
    seed: 79,
    routes: [
      { name: 'Belay Glasses', grade: '6a', colour: 'Yellow' },
      { name: "Omar's Pinch", grade: '6a+', colour: 'Teal', fa: { by: 'Omar', date: '2026-11-20' } },
      { name: 'Soft Catch', grade: '6b', colour: 'Purple' },
      { name: 'Rope Drag', grade: '6b+', colour: 'Red', wander: 0.6 },
    ],
  },
  {
    name: 'The Prow',
    angle: 'overhang',
    height: 16,
    seed: 101,
    routes: [
      { name: 'Pumpkin', grade: '6c', colour: 'Green' },
      { name: 'Shake It Out', grade: '7a', colour: 'Yellow' },
      { name: 'Runout Rita', grade: '7a+', colour: 'White' },
    ],
  },
  {
    name: 'The Cave',
    angle: 'steep',
    height: 17,
    seed: 113,
    routes: [
      { name: 'Crimp Lord', grade: '7b', colour: 'Red' },
      { name: 'Last Light', grade: '7b+', colour: 'Purple' },
    ],
  },
]

export const CRAG_WALLS: Wall[] = CRAG_WALL_SPECS.map(generateWall)
/** every route in the home gym, easiest first */
export const CRAG: Route[] = CRAG_WALLS.flatMap(wallRoutes)

const NAME_A = ['Quiet', 'Greasy', 'Lucky', 'Sandbag', 'Midnight', 'Rusty', 'Crimson', 'Hollow', 'Electric', 'Lazy', 'Golden', 'Feral']
const NAME_B = ['Arete', 'Crimp', 'Dyno', 'Flake', 'Pocket', 'Sloper', 'Roof', 'Crack', 'Mantle', 'Traverse', 'Jug', 'Undercling']
const WALL_NAMES = ['The Barrel', 'Left Wing', 'The Fin', 'Back Wall', 'The Bulge', 'Comp Wall', 'The Tower', 'Right Wing']

/** A freshly set wall: three colours around the chosen grade. */
export function randomWall(grade: string, by: string): Wall {
  const seed = Math.floor(Math.random() * 1e9)
  const r = rng(seed)
  const g = gradeIndex(grade)
  const grades = [g - 1, g, g + 1].map((x) => GRADES[Math.max(0, Math.min(GRADES.length - 1, x))])
  const names = Object.keys(GYM_COLOURS).sort(() => r() - 0.5)
  const date = new Date().toISOString().slice(0, 10)
  return generateWall({
    name: WALL_NAMES[Math.floor(r() * WALL_NAMES.length)],
    angle: defaultAngle(g),
    height: 12 + Math.round(r() * 5),
    seed,
    routes: grades.map((gr, k) => ({
      name: `${NAME_A[Math.floor(r() * NAME_A.length)]} ${NAME_B[Math.floor(r() * NAME_B.length)]}`,
      grade: gr,
      colour: names[k],
      wander: 0.2 + r() * 0.6,
      fa: { by, date },
    })),
  })
}

/** Check a wall that came from a link or a friend. */
export function validWall(x: unknown): x is Wall {
  const w = x as Wall
  return (
    !!w &&
    typeof w.id === 'string' &&
    typeof w.name === 'string' &&
    Array.isArray(w.routes) &&
    w.routes.length > 0 &&
    w.routes.length <= 6 &&
    w.routes.every((r) => r && typeof r.grade === 'string' && typeof r.colour === 'string' && Array.isArray(r.bolts) && Array.isArray(r.anchor)) &&
    Array.isArray(w.holds) &&
    w.holds.length > 2 &&
    w.holds.length < 900 &&
    w.holds.every((h) => typeof h.x === 'number' && typeof h.y === 'number' && typeof h.type === 'string') &&
    typeof w.height === 'number' &&
    w.height < 60 &&
    typeof w.width === 'number'
  )
}

/** The route's own colour (hex) on a gym wall, else null. */
export function routeColourName(route: Route): string | null {
  return route.wall ? route.wall.colours[route.wall.own] ?? null : null
}

export { ownHold }

/** Check a route object that came from a link or a friend. */
export function validRoute(x: unknown): x is Route {
  const r = x as Route
  return (
    !!r &&
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.grade === 'string' &&
    Array.isArray(r.holds) &&
    r.holds.length > 2 &&
    r.holds.length < 400 &&
    r.holds.every((h) => typeof h.x === 'number' && typeof h.y === 'number' && typeof h.type === 'string') &&
    Array.isArray(r.bolts) &&
    Array.isArray(r.anchor) &&
    typeof r.height === 'number' &&
    r.height < 60
  )
}
