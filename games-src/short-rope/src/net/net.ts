// Online play runs inside a Game Night room (room.html + shared/gamenight.js). The room page owns
// the peer-to-peer connection; this file speaks Short Rope's protocol over the room's message API.
// The room's host browser is the game host: it runs the simulation and sends snapshots at 30 Hz,
// and everyone else sends inputs. If the host leaves, Game Night closes the room.

import type { InputFrame, Route } from '../sim/types'
import type { Wall } from '../sim/routes'
import type { Snap } from '../sim/world'
import type { Lobby } from '../game/session'
import type { HubPlayer, HubRoom } from '../hub'

export interface Hello {
  name: string
  mass: number
  tried: string[]
}

export type Cmd =
  | { type: 'start'; routeId: string; leader?: string; belayer?: string }
  | { type: 'route'; route: Route }
  | { type: 'wall'; wall: Wall }
  | { type: 'giveup' }
  | { type: 'back' }
  | { type: 'newday' }
  | { type: 'autofeet'; on: boolean }

export interface NetEvents {
  onRole(isHost: boolean, hostId: string | null): void
  onLobby(lobby: Lobby, from: string): void
  onSnap(snap: Snap): void
  onInput(peer: string, frame: InputFrame): void
  onCmd(peer: string, cmd: Cmd): void
  onHello(peer: string, hello: Hello): void
  onPeerLeave(peer: string): void
  onStatus(text: string): void
}

/** Message types on the room channel. Prefixed so they never clash with the hub's own. */
const T = { lobby: 'sr:lobby', snap: 'sr:snap', inp: 'sr:inp', cmd: 'sr:cmd', hello: 'sr:hello', ping: 'sr:ping', pong: 'sr:pong' }

export class Net {
  readonly selfId: string
  isHost = false
  hostId: string | null = null
  /** round trip to the host in ms (guests), for fair catches */
  latency: number | null = null
  peers = new Set<string>()
  /** set by leave(): a closed Net never fires events again */
  closed = false
  /** the host's current lobby, so it can greet new peers straight away */
  lobbyNow: () => Lobby | null = () => null
  private offs: Array<() => void> = []
  private timers: number[] = []
  private roleSent = false

  constructor(
    readonly room: HubRoom,
    private ev: NetEvents,
  ) {
    this.selfId = room.me.id
  }

  join(hello: () => Hello): void {
    const r = this.room
    const on = (type: string, fn: (data: any, from: string) => void) =>
      this.offs.push(r.on(type, (d, from) => !this.closed && fn(d, from)))
    this.hostId = r.hostId
    this.isHost = r.isHost
    this.peers = new Set(r.players.map((p) => p.id).filter((id) => id !== this.selfId))

    if (this.isHost) {
      // become host before listening, so the session exists when queued hellos arrive
      this.role()
      on(T.hello, (d, from) => this.ev.onHello(from, d as Hello))
      on(T.inp, (d, from) => this.ev.onInput(from, d as InputFrame))
      on(T.cmd, (d, from) => this.ev.onCmd(from, d as Cmd))
      on(T.ping, (d, from) => r.sendTo(from, T.pong, d))
    } else {
      on(T.lobby, (d, from) => {
        const lobby = d as Lobby
        if (from !== this.hostId || !lobby || lobby.hostId !== from || !Array.isArray(lobby.players)) return
        this.role()
        this.ev.onLobby(lobby, from)
        if (!lobby.players.some((p) => p.id === this.selfId)) r.sendToHost(T.hello, hello())
      })
      on(T.snap, (d, from) => from === this.hostId && this.ev.onSnap(d as Snap))
      on(T.pong, (d) => {
        if (typeof d === 'number') this.latency = performance.now() - d
      })
      r.sendToHost(T.hello, hello())
      this.ev.onStatus('Waiting for the host…')
      this.timers.push(window.setInterval(() => !this.closed && r.sendToHost(T.ping, performance.now()), 2000))
    }

    this.offs.push(r.onPlayers((players) => this.syncPlayers(players)))
  }

  private role(): void {
    if (this.roleSent || this.closed) return
    this.roleSent = true
    this.ev.onRole(this.isHost, this.hostId)
  }

  private syncPlayers(players: HubPlayer[]): void {
    if (this.closed) return
    const now = new Set(players.map((p) => p.id).filter((id) => id !== this.selfId))
    for (const id of [...this.peers]) {
      if (now.has(id)) continue
      this.peers.delete(id)
      this.ev.onPeerLeave(id)
    }
    for (const id of now) {
      if (this.peers.has(id)) continue
      this.peers.add(id)
      // greet newcomers right away so they don't wait for the next lobby heartbeat
      const l = this.isHost ? this.lobbyNow() : null
      if (l) this.room.sendTo(id, T.lobby, l)
    }
    this.ev.onStatus(`${now.size + 1} in the room`)
  }

  broadcastLobby(l: Lobby): void {
    if (!this.closed && this.isHost) this.room.send(T.lobby, l)
  }
  broadcastSnap(s: Snap): void {
    if (!this.closed && this.isHost) this.room.send(T.snap, s)
  }
  sendInput(f: InputFrame): void {
    if (!this.closed && !this.isHost) this.room.sendToHost(T.inp, f)
  }
  sendCmd(c: Cmd): void {
    if (!this.closed) this.room.sendToHost(T.cmd, c)
  }

  leave(): void {
    this.closed = true
    this.offs.forEach((off) => off())
    this.offs = []
    this.timers.forEach((t) => clearInterval(t))
    this.timers = []
  }
}

/** Interpolate between two snapshots for smooth drawing on guests. */
export function lerpSnap(a: Snap, b: Snap, k: number): Snap {
  if (k >= 1 || a.rope.pts.length !== b.rope.pts.length) return b
  const L = (x: number, y: number) => x + (y - x) * k
  const P = (p: [number, number], q: [number, number]): [number, number] => [L(p[0], q[0]), L(p[1], q[1])]
  const limb = (p: [number, number, number, number], q: [number, number, number, number]): [number, number, number, number] => [
    L(p[0], q[0]),
    L(p[1], q[1]),
    q[2],
    q[3],
  ]
  return {
    ...b,
    c: {
      ...b.c,
      chest: P(a.c.chest, b.c.chest),
      pelvis: P(a.c.pelvis, b.c.pelvis),
      hands: b.c.hands.map((h, i) => limb(a.c.hands[i], h)),
      feet: b.c.feet.map((f, i) => limb(a.c.feet[i], f)),
    },
    b: { ...b.b, x: L(a.b.x, b.b.x), y: L(a.b.y, b.b.y) },
    rope: { ...b.rope, pts: b.rope.pts.map((p, i) => P(a.rope.pts[i], p)), s: b.rope.s.map((s, i) => L(a.rope.s[i], s)) },
  }
}
