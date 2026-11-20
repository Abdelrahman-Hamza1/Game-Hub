// The crag day: who is here, who leads and belays, which route, day energy,
// send styles. The host (or the local machine) owns this; guests receive the
// Lobby as data and send commands back.

import { CRAG } from '../sim/routes'
import type { InputFrame, Route } from '../sim/types'
import { emptyInput } from '../sim/types'
import { createWorld, endAttempt, requestLower, snapshot, stepWorld, type Snap, type World } from '../sim/world'

export type Mode = 'solo' | 'local' | 'online'
export type Phase = 'crag' | 'climb' | 'summary'
export type Style = 'onsight' | 'flash' | 'redpoint'

export interface PlayerInfo {
  id: string
  name: string
  mass: number
  energy: number
  color: number
  /** routes this player has tried before, from their logbook */
  tried: string[]
}

export interface Summary {
  routeId: string
  routeName: string
  grade: string
  leader: string
  leaderName: string
  belayer: string
  sent: boolean
  style: Style | null
  topped: boolean
  highPoint: number
  falls: number
  reason: 'ground' | 'lowered' | 'gaveup'
  energyCost: number
  date: string
}

export interface Lobby {
  v: number
  mode: Mode
  phase: Phase
  players: PlayerInfo[]
  hostId: string
  /** routes shared into this session beyond the home crag */
  extra: Route[]
  routeId: string | null
  leader: string | null
  /** player id or 'bot' */
  belayer: string | null
  summary: Summary | null
  history: { routeId: string; leader: string; sent: boolean }[]
  autoFeet: boolean
  day: number
  dayOver: boolean
}

export const BOT = 'bot'
export const PLAYER_COLORS = [0, 1, 2, 3]

export function findRoute(lobby: Pick<Lobby, 'extra'>, id: string | null): Route | null {
  if (!id) return null
  return CRAG.find((r) => r.id === id) ?? lobby.extra.find((r) => r.id === id) ?? null
}

export class Session {
  lobby: Lobby
  world: World | null = null
  private inputs = new Map<string, InputFrame>()

  constructor(mode: Mode, hostId: string) {
    this.lobby = {
      v: 1,
      mode,
      phase: 'crag',
      players: [],
      hostId,
      extra: [],
      routeId: null,
      leader: null,
      belayer: null,
      summary: null,
      history: [],
      autoFeet: false,
      day: 1,
      dayOver: false,
    }
  }

  private bump(): void {
    this.lobby.v++
  }

  addPlayer(p: Omit<PlayerInfo, 'energy' | 'color'>): void {
    const existing = this.lobby.players.find((x) => x.id === p.id)
    if (existing) {
      Object.assign(existing, p)
    } else {
      const used = new Set(this.lobby.players.map((x) => x.color))
      const color = PLAYER_COLORS.find((c) => !used.has(c)) ?? this.lobby.players.length % 4
      this.lobby.players.push({ ...p, energy: 100, color })
    }
    this.bump()
  }

  removePlayer(id: string): void {
    this.lobby.players = this.lobby.players.filter((p) => p.id !== id)
    this.inputs.delete(id)
    const { leader, belayer } = this.lobby
    if (this.lobby.phase === 'climb' && (leader === id || belayer === id)) {
      this.world = null
      this.lobby.phase = 'crag'
    }
    this.bump()
  }

  addRoute(r: Route): void {
    if (CRAG.some((x) => x.id === r.id) || this.lobby.extra.some((x) => x.id === r.id)) return
    this.lobby.extra.push(r)
    if (this.lobby.extra.length > 30) this.lobby.extra.shift()
    this.bump()
  }

  setAutoFeet(on: boolean): void {
    this.lobby.autoFeet = on
    if (this.world) this.world.autoFeet = on
    this.bump()
  }

  setInput(id: string, inp: InputFrame): void {
    this.inputs.set(id, inp)
  }

  /** Default roles: rotate through players so everyone leads and belays. */
  nextRoles(): { leader: string; belayer: string } {
    const ps = this.lobby.players.filter((p) => p.energy >= 10 || this.lobby.players.length === 1)
    const all = ps.length ? ps : this.lobby.players
    if (all.length === 1 || this.lobby.mode === 'solo') return { leader: all[0].id, belayer: BOT }
    const prev = this.lobby.leader
    const i = Math.max(0, all.findIndex((p) => p.id === prev))
    const leader = prev ? all[(i + 1) % all.length] : all[0]
    const li = all.indexOf(leader)
    const belayer = all[(li + 1) % all.length]
    return { leader: leader.id, belayer: belayer.id === leader.id ? BOT : belayer.id }
  }

  start(routeId: string, leader?: string, belayer?: string): boolean {
    const route = findRoute(this.lobby, routeId)
    if (!route || !this.lobby.players.length) return false
    const roles = this.nextRoles()
    const L = this.lobby.players.find((p) => p.id === (leader ?? roles.leader)) ?? this.lobby.players[0]
    let B = belayer ?? roles.belayer
    if (B === L.id) B = BOT
    if (B !== BOT && !this.lobby.players.some((p) => p.id === B)) B = BOT
    const bp = this.lobby.players.find((p) => p.id === B)
    this.world = createWorld(route, {
      leaderMass: L.mass,
      belayerMass: bp ? bp.mass : 72,
      tired: Math.max(0, (100 - L.energy) * 0.25),
      autoFeet: this.lobby.autoFeet,
      bot: B === BOT,
    })
    this.lobby.phase = 'climb'
    this.lobby.routeId = route.id
    this.lobby.leader = L.id
    this.lobby.belayer = B
    this.lobby.summary = null
    this.inputs.clear()
    this.bump()
    return true
  }

  giveUp(): void {
    if (!this.world) return
    // lowering off is a normal end; the attempt just doesn't count as a send
    requestLower(this.world)
    if (this.world.climber.pelvis.y < 1.3) endAttempt(this.world, 'gaveup')
  }

  forceEnd(): void {
    if (this.world) endAttempt(this.world, 'gaveup')
  }

  backToCrag(): void {
    this.world = null
    this.lobby.phase = 'crag'
    this.lobby.summary = null
    this.bump()
  }

  newDay(): void {
    for (const p of this.lobby.players) p.energy = 100
    this.lobby.day++
    this.lobby.dayOver = false
    this.lobby.history = []
    this.backToCrag()
  }

  step(dt: number): void {
    const w = this.world
    if (!w || this.lobby.phase !== 'climb') return
    const { leader, belayer } = this.lobby
    const li = this.inputs.get(leader!) ?? emptyInput()
    const bi = belayer === BOT ? null : (this.inputs.get(belayer!) ?? emptyInput())
    stepWorld(w, dt, li, bi)
    if (w.end && !this.lobby.summary) this.finish()
  }

  private finish(): void {
    const w = this.world!
    const end = w.end!
    const L = this.lobby.players.find((p) => p.id === this.lobby.leader)
    const route = w.route
    const cost = Math.round(8 + 0.5 * end.highPoint + 3 * end.falls)
    let style: Style | null = null
    if (end.sent && L) {
      const triedBefore = L.tried.includes(route.id) || this.lobby.history.some((h) => h.routeId === route.id && h.leader === L.id)
      const someoneTried = this.lobby.history.some((h) => h.routeId === route.id && h.leader !== L.id)
      style = triedBefore ? 'redpoint' : someoneTried ? 'flash' : 'onsight'
    }
    if (L) {
      L.energy = Math.max(0, L.energy - cost)
      if (!L.tried.includes(route.id)) L.tried.push(route.id)
    }
    this.lobby.history.push({ routeId: route.id, leader: this.lobby.leader!, sent: end.sent })
    this.lobby.summary = {
      routeId: route.id,
      routeName: route.name,
      grade: route.grade,
      leader: this.lobby.leader!,
      leaderName: L?.name ?? 'Climber',
      belayer: this.lobby.belayer!,
      sent: end.sent,
      style,
      topped: end.topped,
      highPoint: Math.round(end.highPoint * 10) / 10,
      falls: end.falls,
      reason: end.reason,
      energyCost: cost,
      date: new Date().toISOString().slice(0, 10),
    }
    this.lobby.phase = 'summary'
    this.lobby.dayOver = this.lobby.players.every((p) => p.energy < 15)
    this.bump()
  }

  snap(): Snap | null {
    return this.world ? snapshot(this.world) : null
  }

  get route(): Route | null {
    return findRoute(this.lobby, this.lobby.routeId)
  }
}
