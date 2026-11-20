// Everything kept in this browser: settings, the logbook and routes friends shared.

import { validRoute } from '../sim/routes'
import type { Route } from '../sim/types'
import type { Style } from './session'

export interface Settings {
  name: string
  mass: number
  grades: 'french' | 'yds'
  autoFeet: boolean
  voice: boolean
  sound: boolean
  debug: boolean
}

export interface LogEntry {
  date: string
  routeId: string
  routeName: string
  grade: string
  climber: string
  style: Style | null
  topped: boolean
  highPoint: number
  falls: number
}

const KEY_SETTINGS = 'short-rope:settings'
const KEY_LOG = 'short-rope:logbook'
const KEY_ROUTES = 'short-rope:routes'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked: the game still works, it just forgets */
  }
}

const DEFAULT_SETTINGS: Settings = {
  name: '',
  mass: 70,
  grades: 'french',
  autoFeet: false,
  voice: true,
  sound: true,
  debug: false,
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(KEY_SETTINGS, {}) }
}

export function saveSettings(s: Settings): void {
  write(KEY_SETTINGS, s)
}

export function loadLog(): LogEntry[] {
  return read<LogEntry[]>(KEY_LOG, [])
}

export function addLog(e: LogEntry): void {
  const log = loadLog()
  log.push(e)
  write(KEY_LOG, log.slice(-500))
}

export function triedRoutes(name?: string): string[] {
  const ids = new Set<string>()
  for (const e of loadLog()) if (!name || e.climber === name) ids.add(e.routeId)
  return [...ids]
}

export function loadSharedRoutes(): Route[] {
  return read<unknown[]>(KEY_ROUTES, []).filter(validRoute)
}

export function saveSharedRoute(r: Route): void {
  const list = loadSharedRoutes().filter((x) => x.id !== r.id)
  list.unshift(r)
  write(KEY_ROUTES, list.slice(0, 40))
}

export function removeSharedRoute(id: string): void {
  write(
    KEY_ROUTES,
    loadSharedRoutes().filter((x) => x.id !== id),
  )
}

const RANK: Record<string, number> = { onsight: 3, flash: 2, redpoint: 1 }

/** Best tick for a route in this browser, for the crag list. */
export function bestTick(routeId: string, climber: string): Style | 'tried' | null {
  let best: Style | 'tried' | null = null
  for (const e of loadLog()) {
    if (e.routeId !== routeId || e.climber !== climber) continue
    if (e.style && (!best || best === 'tried' || RANK[e.style] > RANK[best])) best = e.style
    else if (!best) best = 'tried'
  }
  return best
}
