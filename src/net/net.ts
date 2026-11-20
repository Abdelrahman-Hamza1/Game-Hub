// Peer-to-peer rooms over WebRTC, introduced through public Nostr relays by
// Trystero. One browser is the host and runs the game; the others send inputs
// and draw the snapshots the host sends back.

import { joinRoom, selfId, type Room } from 'trystero'
import type { InputFrame, Route } from '../sim/types'
import type { Snap } from '../sim/world'
import type { Lobby } from '../game/session'

export const APP_ID = 'short-rope-crag-v1'

export interface Hello {
  name: string
  mass: number
  tried: string[]
}

export type Cmd =
  | { type: 'start'; routeId: string; leader?: string; belayer?: string }
  | { type: 'route'; route: Route }
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

export class Net {
  readonly selfId = selfId
  room: Room | null = null
  isHost = false
  hostId: string | null = null
  latency: number | null = null
  peers = new Set<string>()
  /** set by leave(): a closed Net never fires events again */
  closed = false
  /** the host's current lobby, so it can greet new peers straight away */
  lobbyNow: () => Lobby | null = () => null
  private hostCreated = Infinity
  private decided = false
  private timers: number[] = []
  private send!: {
    lobby: (d: Lobby, target?: string) => void
    snap: (d: Snap) => void
    inp: (d: InputFrame) => void
    cmd: (d: Cmd) => void
    hello: (d: Hello) => void
  }

  constructor(private ev: NetEvents) {}

  join(code: string, hello: () => Hello): void {
    const room = joinRoom({ appId: APP_ID }, code)
    this.room = room
    const lobbyA = room.makeAction<any>('lobby')
    const snapA = room.makeAction<any>('snap')
    const inpA = room.makeAction<any>('inp')
    const cmdA = room.makeAction<any>('cmd')
    const helloA = room.makeAction<any>('hello')
    this.send = {
      lobby: (d, target) => void lobbyA.send(d, target ? { target } : undefined),
      snap: (d) => void snapA.send(d),
      inp: (d) => this.hostId && void inpA.send(d, { target: this.hostId }),
      cmd: (d) => this.hostId && void cmdA.send(d, { target: this.hostId }),
      hello: (d) => this.hostId && void helloA.send(d, { target: this.hostId }),
    }

    lobbyA.onMessage = (data, { peerId }) => {
      if (this.closed) return
      const lobby = data as Lobby
      if (!lobby || lobby.hostId !== peerId || !Array.isArray(lobby.players)) return
      const older = (a: number, aid: string, b: number, bid: string) => a < b || (a === b && aid < bid)
      if (this.isHost) {
        // two hosts met: the older session keeps the room
        const mine = this.lobbyNow()
        if (mine && older(mine.created, this.selfId, lobby.created, peerId)) return
        this.becomeGuest(peerId, lobby.created)
      } else if (this.hostId !== peerId) {
        // follow a different host only if ours is gone or theirs is older
        if (this.hostId && this.peers.has(this.hostId) && !older(lobby.created, peerId, this.hostCreated, this.hostId)) return
        this.becomeGuest(peerId, lobby.created)
      }
      this.decided = true
      this.ev.onLobby(lobby, peerId)
      if (!lobby.players.some((p) => p.id === this.selfId)) this.send.hello(hello())
    }
    snapA.onMessage = (data, { peerId }) => {
      if (this.closed) return
      if (!this.isHost && peerId === this.hostId) this.ev.onSnap(data as Snap)
    }
    inpA.onMessage = (data, { peerId }) => {
      if (!this.closed && this.isHost) this.ev.onInput(peerId, data as InputFrame)
    }
    cmdA.onMessage = (data, { peerId }) => {
      if (!this.closed && this.isHost) this.ev.onCmd(peerId, data as Cmd)
    }
    helloA.onMessage = (data, { peerId }) => {
      if (!this.closed && this.isHost) this.ev.onHello(peerId, data as Hello)
    }
    room.onPeerJoin = (peerId) => {
      if (this.closed) return
      this.peers.add(peerId)
      // greet newcomers right away so they don't think the room is empty
      const l = this.isHost ? this.lobbyNow() : null
      if (l) this.send.lobby(l, peerId)
      this.ev.onStatus(`${this.peers.size + 1} in the room`)
    }
    room.onPeerLeave = (peerId) => {
      if (this.closed) return
      this.peers.delete(peerId)
      this.ev.onPeerLeave(peerId)
      this.ev.onStatus(`${this.peers.size + 1} in the room`)
      if (peerId === this.hostId) {
        // the host left: the lowest remaining id takes over
        const ids = [...this.peers, this.selfId].sort()
        if (ids[0] === this.selfId) this.becomeHost()
        else {
          this.hostId = null
          this.decided = false
          // if the new host never shows up, take over
          this.timers.push(
            window.setTimeout(() => {
              if (!this.closed && !this.decided) this.becomeHost()
            }, 5000),
          )
        }
      }
    }
    this.ev.onStatus('Looking for friends in the room…')
    // nobody answered: this browser hosts
    this.timers.push(
      window.setTimeout(() => {
        if (!this.closed && !this.decided) this.becomeHost()
      }, 4000),
    )
    // measure latency to the host for fair catches
    this.timers.push(
      window.setInterval(async () => {
        if (this.isHost || !this.hostId || !this.room) return
        try {
          this.latency = await this.room.ping(this.hostId)
        } catch {
          /* peer gone */
        }
      }, 2000),
    )
  }

  private becomeHost(): void {
    if (this.closed) return
    this.decided = true
    this.isHost = true
    this.hostId = this.selfId
    this.ev.onRole(true, this.selfId)
  }

  private becomeGuest(hostId: string, created: number): void {
    this.isHost = false
    this.hostId = hostId
    this.hostCreated = created
    this.ev.onRole(false, hostId)
  }

  broadcastLobby(l: Lobby, target?: string): void {
    this.send?.lobby(l, target)
  }
  broadcastSnap(s: Snap): void {
    this.send?.snap(s)
  }
  sendInput(f: InputFrame): void {
    this.send?.inp(f)
  }
  sendCmd(c: Cmd): void {
    this.send?.cmd(c)
  }

  leave(): void {
    this.closed = true
    this.timers.forEach((t) => {
      clearTimeout(t)
      clearInterval(t)
    })
    this.timers = []
    void this.room?.leave()
    this.room = null
  }
}

export function newRoomCode(): string {
  const words = ['crimp', 'jug', 'flake', 'pinch', 'crux', 'sloper', 'arete', 'dyno', 'smear', 'mantle', 'roof', 'chalk']
  const w = words[Math.floor(Math.random() * words.length)]
  return `${w}${Math.floor(10 + Math.random() * 90)}`
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
