import './style.css'
import { sayCall, setAudio, sfx, unlockAudio } from './audio'
import { BOT, crewBoard, dayAwards, findRoute, fmtTime, Session, type Lobby, type Summary } from './game/session'
import { GhostRecorder, ghostPose, loadGhost, offerGhost, type Ghost } from './game/ghost'
import { decodeRoute, routeLink, baseUrl } from './game/share'
import { coachTip, LEARNED_BY, SHOW_FOR } from './game/coach'
import {
  addLog,
  bestTick,
  loadLog,
  loadSettings,
  loadSharedRoutes,
  removeSharedRoute,
  saveSettings,
  saveSharedRoute,
  triedRoutes,
  type Settings,
} from './game/storage'
import { LocalInput } from './input/input'
import { lerpSnap, Net, newRoomCode, type Cmd } from './net/net'
import { PALETTE, Renderer, routeTape, type Toast } from './render/renderer'
import { WALLS, type WallColor } from './render/textures'
import { ANGLE_LABEL, CALLS, GRADES, YDS } from './sim/constants'
import { CRAG, randomRoute, validRoute } from './sim/routes'
import type { InputFrame, Route } from './sim/types'
import { emptyInput } from './sim/types'
import { createWorld, snapshot, stepWorld, type Snap, type World } from './sim/world'

type Screen = 'menu' | 'connecting' | 'game'
type Modal = null | 'help' | 'log' | 'settings'

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

class App {
  settings: Settings = loadSettings()
  canvas = document.getElementById('game') as HTMLCanvasElement
  ui = document.getElementById('ui') as HTMLDivElement
  renderer = new Renderer(this.canvas)
  input = new LocalInput()
  screen: Screen = 'menu'
  modal: Modal = null
  session: Session | null = null
  net: Net | null = null
  lobby: Lobby | null = null
  snap: Snap | null = null
  /** host: the state one physics step before `snap`, to draw between steps */
  prevSnap: Snap | null = null
  /** guest: recent snapshots from the host, played back a little behind */
  snapBuf: Snap[] = []
  /** guest: host clock minus local clock, smoothed */
  clockOffset: number | null = null
  selfId = 'p1'
  localIds: string[] = []
  roomCode: string | null = null
  status = ''
  toasts: Toast[] = []
  seenEvent = 0
  /** coach: how often each event happened this session, and how long each tip has been up */
  coachCounts: Record<string, number> = {}
  coachShown: Record<string, number> = {}
  lastSnapT = 0
  seenCalls = new Set<string>()
  loggedSummaries = new Set<string>()
  selectedRoute: string = CRAG[3].id
  partnerName = 'Partner'
  newGrade = '6a'
  /** bumps every time a mode starts, so logbook keys never repeat across sessions */
  nonce = 0
  lastUiKey = ''
  lastLobbyV = -1
  lastLobbyBroadcast = 0
  sendAcc = 0
  acc = 0
  last = performance.now()
  preview: World
  previewRoute: Route | null = null
  previewPan = 0
  pendingRoute: Route | null = null
  /** ghost beta: this attempt being recorded, and the ghost being raced */
  recorder = new GhostRecorder()
  ghost: Ghost | null = null
  attemptKey = ''
  ghostResult: { key: string; saved: boolean; prev: Ghost | null } | null = null

  constructor() {
    this.input.attach(this.canvas)
    this.input.toWorld = this.renderer.toWorld
    this.input.onShortcut = (code) => this.shortcut(code)
    this.preview = createWorld(CRAG[3], { leaderMass: 70, belayerMass: 70, tired: 0, autoFeet: false, bot: true })
    setAudio(this.settings.sound, this.settings.voice)
    window.addEventListener('pointerdown', () => unlockAudio(), { once: false })
    this.ui.addEventListener('click', (e) => this.onClick(e))
    this.ui.addEventListener('change', (e) => this.onChange(e))
    this.ui.addEventListener('toggle', (e) => {
      const d = e.target as HTMLDetailsElement
      if (d.classList?.contains('day')) this.dayOpen = d.open
    }, true)
    void this.readUrl()
    this.renderUi(true)
    requestAnimationFrame((t) => this.frame(t))
  }

  // ---------- URL handling: ?route= and ?room= ----------

  async readUrl(): Promise<void> {
    const q = new URLSearchParams(location.search)
    const code = q.get('route')
    if (code) {
      const r = await decodeRoute(code)
      if (r) {
        saveSharedRoute(r)
        this.pendingRoute = r
        this.selectedRoute = r.id
        this.toast(`Route added: ${r.name} (${r.grade})`, 'good')
      } else this.toast('That route link is broken', 'bad')
    }
    const room = q.get('room')
    if (room) {
      this.roomCode = room.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24)
      if (this.settings.name) this.startOnline(this.roomCode)
    }
    if (code || room) history.replaceState(null, '', baseUrl() + (room && !code ? `?room=${encodeURIComponent(room)}` : ''))
    this.renderUi(true)
  }

  // ---------- starting and leaving ----------

  me(): { name: string; mass: number; tried: string[] } {
    const name = this.settings.name.trim() || 'Climber'
    return { name, mass: this.settings.mass, tried: triedRoutes(name) }
  }

  private seedRoutes(s: Session): void {
    for (const r of loadSharedRoutes()) s.addRoute(r)
    s.setAutoFeet(this.settings.autoFeet)
  }

  startSolo(): void {
    this.leave(false)
    const s = new Session('solo', 'p1')
    s.addPlayer({ id: 'p1', ...this.me() })
    this.seedRoutes(s)
    this.session = s
    this.selfId = 'p1'
    this.localIds = ['p1']
    this.enterGame()
  }

  startLocal(): void {
    this.leave(false)
    const s = new Session('local', 'p1')
    s.addPlayer({ id: 'p1', ...this.me() })
    const partner = this.partnerName.trim() || 'Partner'
    s.addPlayer({ id: 'p2', name: partner, mass: 70, tried: triedRoutes(partner) })
    this.seedRoutes(s)
    this.session = s
    this.selfId = 'p1'
    this.localIds = ['p1', 'p2']
    this.enterGame()
  }

  startOnline(code: string): void {
    this.leave(false)
    this.roomCode = code
    history.replaceState(null, '', `${baseUrl()}?room=${encodeURIComponent(code)}`)
    const live = () => this.net === net
    const net = new Net({
      onRole: (isHost) => {
        if (!live()) return
        if (isHost) {
          const old = this.lobby
          const s = new Session('online', net.selfId)
          s.addPlayer({ id: net.selfId, ...this.me() })
          if (old) {
            // host migration: keep the day going for everyone still here
            for (const p of old.players) if (p.id !== net.selfId && net.peers.has(p.id)) s.addPlayer(p)
            for (const r of old.extra) s.addRoute(r)
            s.lobby.day = old.day
            s.lobby.created = old.created
            s.lobby.history = old.history
            for (const p of s.lobby.players) p.energy = old.players.find((o) => o.id === p.id)?.energy ?? 100
          }
          this.seedRoutes(s)
          this.session = s
          this.lobby = s.lobby
        } else {
          this.session = null
        }
        this.selfId = net.selfId
        this.localIds = [net.selfId]
        this.enterGame()
      },
      onLobby: (l) => {
        if (!live()) return
        this.lobby = l
        if (this.screen !== 'game') this.enterGame()
      },
      onSnap: (sn) => {
        if (!live() || !sn || !sn.c) return
        const now = performance.now() / 1000
        const last = this.snapBuf[this.snapBuf.length - 1]
        // a new attempt restarts the clock
        if (last && sn.t < last.t) {
          this.snapBuf = []
          this.clockOffset = null
        }
        if (last && sn.t === last.t) return
        this.snapBuf.push(sn)
        if (this.snapBuf.length > 12) this.snapBuf.shift()
        const off = sn.t - now
        // follow the host clock gently, so uneven packets don't make the picture jump
        if (this.clockOffset === null || Math.abs(off - this.clockOffset) > 0.5) this.clockOffset = off
        else this.clockOffset += (off - this.clockOffset) * 0.05
        this.snap = sn
      },
      onInput: (peer, f) => {
        if (live() && validFrame(f)) this.session?.setInput(peer, f)
      },
      onCmd: (peer, c) => {
        if (live() && c && typeof c === 'object') this.handleCmd(peer, c)
      },
      onHello: (peer, h) => {
        if (!live() || !h) return
        this.session?.addPlayer({ id: peer, name: String(h.name).slice(0, 20) || 'Climber', mass: clampMass(h.mass), tried: (h.tried || []).slice(0, 200) })
      },
      onPeerLeave: (peer) => {
        if (!live()) return
        const name = this.lobby?.players.find((p) => p.id === peer)?.name
        this.session?.removePlayer(peer)
        if (name) this.toast(`${name} left`, 'info')
      },
      onStatus: (t) => {
        if (!live()) return
        this.status = t
        this.renderUi(true)
      },
    })
    net.lobbyNow = () => (this.net === net && this.session ? this.session.lobby : null)
    this.net = net
    this.selfId = net.selfId
    this.screen = 'connecting'
    net.join(code, () => this.me())
    this.renderUi(true)
  }

  enterGame(): void {
    this.screen = 'game'
    if (this.session) this.lobby = this.session.lobby
    if (this.pendingRoute && this.session) {
      this.session.addRoute(this.pendingRoute)
      this.pendingRoute = null
    } else if (this.pendingRoute && this.net) {
      this.cmd({ type: 'route', route: this.pendingRoute })
      this.pendingRoute = null
    }
    this.renderUi(true)
  }

  leave(render = true): void {
    this.net?.leave()
    this.net = null
    this.session = null
    this.lobby = null
    this.snap = this.prevSnap = null
    this.snapBuf = []
    this.clockOffset = null
    this.localIds = []
    this.screen = 'menu'
    this.modal = null
    this.status = ''
    this.roleOverride = {}
    this.seenEvent = 0
    this.lastSnapT = 0
    this.seenCalls.clear()
    this.nonce++
    if (render) {
      history.replaceState(null, '', baseUrl())
      this.roomCode = null
      this.renderUi(true)
    }
  }

  cmd(c: Cmd): void {
    if (this.session) this.handleCmd(this.selfId, c)
    else this.net?.sendCmd(c)
  }

  handleCmd(from: string, c: Cmd): void {
    const s = this.session
    if (!s) return
    void from
    switch (c.type) {
      case 'start':
        if (s.lobby.phase !== 'climb') s.start(c.routeId, c.leader, c.belayer)
        break
      case 'route':
        if (validRoute(c.route)) s.addRoute(c.route)
        break
      case 'giveup':
        s.giveUp()
        break
      case 'back':
        if (s.lobby.phase !== 'climb' || from === s.lobby.hostId) s.backToCrag()
        break
      case 'newday':
        s.newDay()
        break
      case 'autofeet':
        s.setAutoFeet(!!c.on)
        break
    }
    this.renderUi(true)
  }

  // ---------- main loop ----------

  frame(t: number): void {
    requestAnimationFrame((tt) => this.frame(tt))
    try {
      this.tick(t)
    } catch (err) {
      console.error(err)
    }
  }

  tick(t: number): void {
    const dt = Math.min(0.1, (t - this.last) / 1000)
    this.last = t
    const s = this.session
    if (s) {
      this.acc += dt
      let steps = 0
      while (this.acc >= 1 / 60 && steps < 6) {
        const f = this.input.sample()
        for (const id of this.localIds) s.setInput(id, f)
        s.step(1 / 60)
        this.acc -= 1 / 60
        steps++
        // keep the state before the newest step, to draw in between
        this.prevSnap = this.snap
        this.snap = s.snap()
      }
      if (steps === 6) this.acc = 0
      this.lobby = s.lobby
      if (!steps && !this.snap) this.snap = s.snap()
      if (this.net) {
        this.sendAcc += dt
        if (this.sendAcc >= 1 / 30 && this.snap && s.lobby.phase !== 'crag') {
          this.net.broadcastSnap(this.snap)
          this.sendAcc = 0
        }
        if (s.lobby.v !== this.lastLobbyV || t - this.lastLobbyBroadcast > 3000) {
          this.net.broadcastLobby(s.lobby)
          this.lastLobbyBroadcast = t
        }
      }
    } else if (this.net && this.net.hostId) {
      this.sendAcc += dt
      if (this.sendAcc >= 1 / 30) {
        this.net.sendInput(this.input.sample((this.net.latency ?? 0) / 2000))
        this.sendAcc = 0
      }
    }
    const lobby = this.lobby
    const playing = this.screen === 'game' && lobby && (lobby.phase === 'climb' || lobby.phase === 'summary')
    this.input.enabled = !!(playing && lobby!.phase === 'climb' && this.modal === null && (this.isLocalLeader() || this.isLocalBelayer()))
    if (lobby && lobby.v !== this.lastLobbyV) {
      this.lastLobbyV = lobby.v
      this.onLobbyChange()
    }
    this.draw(dt, !!playing)
  }

  isLocalLeader(): boolean {
    return !!this.lobby && this.localIds.includes(this.lobby.leader ?? '')
  }
  isLocalBelayer(): boolean {
    return !!this.lobby && this.localIds.includes(this.lobby.belayer ?? '')
  }

  private viewSnap(): Snap | null {
    if (!this.snap) return null
    if (this.session) {
      // host: draw between the last two physics steps
      const a = this.prevSnap
      if (!a || a.t > this.snap.t) return this.snap
      return lerpSnap(a, this.snap, Math.min(1, this.acc * 60))
    }
    // guest: play the buffer back about 80 ms behind the host
    const buf = this.snapBuf
    if (buf.length < 2 || this.clockOffset === null) return this.snap
    const at = performance.now() / 1000 + this.clockOffset - 0.08
    if (at <= buf[0].t) return buf[0]
    for (let i = buf.length - 1; i > 0; i--) {
      const a = buf[i - 1], b = buf[i]
      if (at >= a.t) return at >= b.t ? b : lerpSnap(a, b, (at - a.t) / (b.t - a.t))
    }
    return this.snap
  }

  draw(dt: number, playing: boolean): void {
    const lobby = this.lobby
    let route: Route | null = null
    let snap: Snap | null = null
    if (playing && lobby) {
      route = findRoute(lobby, lobby.routeId)
      snap = this.viewSnap()
    }
    if (!route || !snap) {
      // backdrop: the selected route with a climber waiting at the base
      const want = this.screen === 'game' && lobby ? findRoute(lobby, this.selectedRoute) ?? CRAG[3] : findRoute({ extra: loadSharedRoutes() }, this.selectedRoute) ?? CRAG[3]
      if (this.previewRoute?.id !== want.id) {
        this.preview = createWorld(want, { leaderMass: 70, belayerMass: 70, tired: 0, autoFeet: false, bot: true })
        this.previewRoute = want
        this.previewPan = 0
      }
      stepWorld(this.preview, dt, emptyInput(), null)
      const side = this.screen === 'game' ? (this.ui.querySelector('.side') as HTMLElement | null) : null
      this.renderer.padLeft = side && innerWidth > 700 ? side.offsetWidth : 0
      route = want
      snap = snapshot(this.preview)
      this.previewPan += dt
      const span = route.height - 4
      const y = 4 + (span / 2) * (1 - Math.cos(this.previewPan * 0.25))
      this.renderer.follow(route, y, dt)
    } else {
      this.renderer.padLeft = 0
      this.processEvents(snap)
      this.renderer.follow(route, snap.c.chest[1], dt)
      if (lobby!.phase === 'climb' && this.snap) this.recorder.push(this.snap)
    }
    const ghost = playing && this.ghost && this.settings.ghost && snap ? this.ghost : null
    const gp = ghost ? ghostPose(ghost, snap!.t) : null
    const players = lobby?.players ?? []
    const P = (id: string | null) => players.find((p) => p.id === id)
    const leaderP = playing ? P(lobby!.leader) : null
    const belayP = playing && lobby!.belayer !== BOT ? P(lobby!.belayer) : null
    const specs = playing ? players.filter((p) => p.id !== lobby!.leader && p.id !== lobby!.belayer) : []
    this.toasts = this.toasts.filter((x) => performance.now() / 1000 - x.t < 3)
    this.renderer.render({
      route,
      snap,
      leader: leaderP ? { name: leaderP.name, color: leaderP.color } : { name: this.me().name, color: 0 },
      belayer: belayP ? { name: belayP.name, color: belayP.color } : null,
      spectators: specs.map((p) => ({ name: p.name, color: p.color })),
      localLeader: playing && this.isLocalLeader(),
      localBelayer: playing && this.isLocalBelayer(),
      input: playing ? { mouse: this.input.mouse, handsDown: this.input.handsDown } : null,
      settings: this.settings,
      toasts: playing ? this.toasts : [],
      now: performance.now() / 1000,
      helpOpen: this.modal === 'help',
      latency: this.net && !this.net.isHost ? this.net.latency : null,
      hud: playing,
      coach: playing ? this.coachLine(snap, dt) : null,
      ghost: gp && ghost ? { pose: gp, name: ghost.name, time: ghost.time } : null,
    })
  }

  processEvents(snap: Snap): void {
    if (snap.t < this.lastSnapT) {
      this.seenEvent = 0
      this.seenCalls.clear()
    }
    this.lastSnapT = snap.t
    for (const e of snap.events) {
      if (e.id <= this.seenEvent) continue
      this.seenEvent = e.id
      if (snap.t - e.t > 1) continue
      if (this.isLocalLeader()) {
        const n = (this.coachCounts[e.type] = (this.coachCounts[e.type] ?? 0) + 1)
        for (const [id, rule] of Object.entries(LEARNED_BY)) if (rule.event === e.type && n >= rule.count) this.retireTip(id)
      }
      sfx(e.type)
      if (e.type === 'catch') this.renderer.kick(Math.min(14, (snap.lastFall?.peak ?? 2000) / 450))
      if (e.type === 'ground') this.renderer.kick(18)
      if (e.type === 'catch' && e.text)
        this.toast(e.text, /^(Late|Missed)|brutal/.test(e.text) ? 'bad' : e.text.startsWith('Perfect') ? 'good' : 'info')
      else if (e.type === 'top' && e.text) this.toast(e.text, 'good')
      else if ((e.type === 'pop' || e.type === 'clipfail' || e.type === 'ground' || e.type === 'unclip') && e.text) this.toast(e.text, 'bad')
      else if (e.type === 'clip' && e.text) this.toast(e.text, e.text.startsWith('Back') ? 'bad' : 'good')
      else if (e.type === 'hint' && e.text && this.isLocalLeader()) this.toast(e.text, 'info')
    }
    for (const c of snap.calls) {
      const key = `${c.t}-${c.id}`
      if (this.seenCalls.has(key)) continue
      this.seenCalls.add(key)
      if (snap.t - c.t > 1) continue
      sayCall(c.id, c.role)
    }
  }

  retireTip(id: string): void {
    if (this.settings.coachDone.includes(id)) return
    this.settings.coachDone.push(id)
    saveSettings(this.settings)
  }

  /** the coach's line for this frame */
  private coachLine(snap: Snap, dt: number): string | null {
    const l = this.lobby
    if (!this.settings.coach || !l || l.phase !== 'climb' || this.modal) return null
    const leader = this.isLocalLeader(), belayer = this.isLocalBelayer()
    // two people on one keyboard: coach the climber, the belay panel prompts the belayer
    const tip = coachTip({ snap, leader, belayer: belayer && !leader, autoFeet: l.autoFeet, age: snap.t }, new Set(this.settings.coachDone))
    if (!tip) return null
    const shown = (this.coachShown[tip.id] = (this.coachShown[tip.id] ?? 0) + dt)
    if (shown > SHOW_FOR) this.retireTip(tip.id)
    return tip.text
  }

  toast(text: string, kind: Toast['kind']): void {
    const now = performance.now() / 1000
    if (this.toasts.some((x) => x.text === text && now - x.t < 1.5)) return
    this.toasts.push({ text, t: now, kind })
    if (this.toasts.length > 3) this.toasts.shift()
  }

  onLobbyChange(): void {
    const l = this.lobby
    if (!l) return
    if (l.routeId && l.phase !== 'crag') this.selectedRoute = l.routeId
    const key = `${this.nonce}-${l.created}-${l.day}-${l.history.length}-${l.routeId}-${l.leader}`
    if (l.phase === 'climb' && key !== this.attemptKey) {
      // a new attempt: start recording, and bring out the ghost to race
      this.attemptKey = key
      this.recorder.reset()
      this.ghost = l.routeId ? loadGhost(l.routeId) : null
      const route = findRoute(l, l.routeId)
      this.renderer.padLeft = 0
      if (route) this.renderer.follow(route, this.snap?.c.chest[1] ?? 2, 1, true)
    }
    if (l.phase === 'summary' && l.summary?.sent && l.summary.time && this.ghostResult?.key !== this.attemptKey) {
      const s = l.summary
      const g = this.recorder.ghost(s.routeId, s.leaderName, s.time!)
      this.ghostResult = g ? { key: this.attemptKey, ...offerGhost(g) } : { key: this.attemptKey, saved: false, prev: loadGhost(s.routeId) }
    }
    // log sends and attempts for players on this machine
    const s = l.summary
    if (s && l.phase === 'summary') {
      const key = `${this.nonce}-${l.created}-${l.day}-${l.history.length}-${s.routeId}-${s.leader}`
      if (!this.loggedSummaries.has(key) && this.localIds.includes(s.leader)) {
        this.loggedSummaries.add(key)
        addLog({
          date: s.date,
          routeId: s.routeId,
          routeName: s.routeName,
          grade: s.grade,
          climber: s.leaderName,
          style: s.style,
          topped: s.topped,
          highPoint: s.highPoint,
          falls: s.falls,
        })
        const r = findRoute(l, s.routeId)
        if (r && !CRAG.some((c) => c.id === r.id)) saveSharedRoute(r)
      }
    }
    this.renderUi(true)
  }

  shortcut(code: string): void {
    if (code === 'KeyH') this.modal = this.modal === 'help' ? null : 'help'
    else if (code === 'KeyG') {
      this.settings.debug = !this.settings.debug
      saveSettings(this.settings)
    } else if (code === 'Escape') this.modal = null
    else return
    this.renderUi(true)
  }

  // ---------- UI ----------

  grade(g: string): string {
    return this.settings.grades === 'yds' ? YDS[g] ?? g : g
  }

  renderUi(force = false): void {
    const html = this.uiHtml()
    void force
    if (html === this.lastUiKey) return
    this.lastUiKey = html
    const active = document.activeElement as HTMLElement | null
    const activeId = active?.id
    this.ui.innerHTML = html
    if (activeId) document.getElementById(activeId)?.focus()
  }

  uiHtml(): string {
    let main = ''
    if (this.screen === 'menu') main = this.menuHtml()
    else if (this.screen === 'connecting') main = this.connectingHtml()
    else if (this.lobby) {
      if (this.lobby.phase === 'crag') main = this.cragHtml()
      else if (this.lobby.phase === 'climb') main = this.climbHtml()
      else main = this.climbHtml() + this.summaryHtml()
    }
    return main + this.modalHtml()
  }

  menuHtml(): string {
    const s = this.settings
    const joinCode = this.roomCode ?? ''
    return `
    <div class="menu"><div class="menu-inner">
      <div class="kicker">Co-op climbing · real rope work</div>
      <h1>Short<br><span>Rope</span></h1>
      <svg class="squiggle" viewBox="0 0 320 24" aria-hidden="true"><path d="M2 14 C 30 2, 50 24, 80 12 S 130 2, 160 12 S 210 24, 240 12 S 290 2, 318 12" /></svg>
      <p class="lede">Lead, clip and climb one limb at a time while your friend feeds slack and catches your falls. The rope is simulated, so the way you'd work together at the crag is the way you win.</p>
      <div class="form-row">
        <div class="field"><label for="f-name">Your name</label><input id="f-name" maxlength="20" value="${esc(s.name)}" placeholder="e.g. Omar"></div>
        <div class="field"><label for="f-mass">Weight (kg)</label><input id="f-mass" type="number" min="40" max="120" value="${s.mass}" style="width:90px"></div>
        <div class="field"><label for="f-partner">Partner (same computer)</label><input id="f-partner" maxlength="20" value="${esc(this.partnerName)}"></div>
      </div>
      <div class="modes">
        <button class="mode-card" data-act="solo">${ICON.solo}<b>Solo</b><span>You lead, a bot belays. Learn the moves.</span></button>
        <button class="mode-card" data-act="local">${ICON.local}<b>Two players</b><span>One computer: mouse climbs, arrow keys belay.</span></button>
        <button class="mode-card hot" data-act="host">${ICON.online}<b>Online room</b><span>Make a room and send the link to your crew.</span></button>
      </div>
      <div class="join">
        <label for="f-room">Join a room</label>
        <input id="f-room" placeholder="room code" value="${esc(joinCode)}" style="width:150px">
        <button class="btn dark" data-act="join">Join</button>
      </div>
      ${matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches ? '<p class="note"><b>On a phone?</b> Touch controls are coming later. For now, play on a computer with a mouse and keyboard.</p>' : ''}
      ${this.menuStats()}
      <div class="links">
        <button class="btn small" data-act="modal-help">How to play</button>
        <button class="btn small" data-act="modal-log">Logbook</button>
        <button class="btn small" data-act="modal-settings">Settings</button>
      </div>
    </div></div>`
  }

  /** a line of personal stats under the menu, once there are some */
  menuStats(): string {
    const log = loadLog()
    if (!log.length) return ''
    const sends = log.filter((e) => e.style)
    const hardest = sends.reduce<string | null>((a, e) => (!a || GRADES.indexOf(e.grade) > GRADES.indexOf(a) ? e.grade : a), null)
    const metres = Math.round(log.reduce((a, e) => a + e.highPoint, 0))
    return `<div class="menu-stats"><span><b>${log.length}</b> attempts</span><span><b>${sends.length}</b> sends</span><span><b>${metres}</b> m climbed</span>${hardest ? `<span>hardest <b>${esc(this.grade(hardest))}</b></span>` : ''}</div>`
  }

  connectingHtml(): string {
    return `<div class="center-card"><div>
      <div class="spinner"></div>
      <h2 style="font-size:40px">Room ${esc(this.roomCode ?? '')}</h2>
      <p class="note">${esc(this.status || 'Connecting…')}</p>
      <p class="note">If nobody else is here, you'll host the room in a few seconds.</p>
      <button class="btn" data-act="leave">Cancel</button>
    </div></div>`
  }

  cragHtml(): string {
    const l = this.lobby!
    const players = l.players
    const extra = l.extra
    const sel = findRoute(l, this.selectedRoute) ?? CRAG[0]
    const roles = this.defaultRoles()
    const routeCard = (r: Route) => {
      const tick = bestTick(r.id, this.me().name)
      const g = loadGhost(r.id)
      return `<button class="route ${r.id === sel.id ? 'on' : ''}" data-route="${esc(r.id)}" style="--band:${gradeBand(r.grade)}">
        <span class="g">${esc(this.grade(r.grade))}</span>
        <span><span class="n">${esc(r.name)}</span><br><span class="m">${esc(ANGLE_LABEL[r.angle])} · ${Math.round(r.anchor[1])} m · ${r.bolts.length} bolts${g ? ` · ⏱ ${fmtTime(g.time)}` : ''}</span></span>
        ${tick ? `<span class="tick ${tick === 'tried' ? 'tried' : ''}">${tick}</span>` : '<span></span>'}
      </button>`
    }
    const playerRow = (p: Lobby['players'][number]) => `<div class="player">
        <i style="background:${PALETTE[p.color % 4].shirt}"></i>
        <span>${esc(p.name)}${p.id === this.selfId || (l.mode === 'local' && this.localIds.includes(p.id)) ? ' <span class="kicker">you</span>' : ''}${p.id === l.hostId && l.mode === 'online' ? ' <span class="kicker">host</span>' : ''}</span>
        <span class="energy" title="Day energy ${Math.round(p.energy)}%"><span style="width:${Math.round(p.energy)}%"></span></span>
      </div>`
    const opt = (id: string, name: string, on: boolean) => `<option value="${esc(id)}" ${on ? 'selected' : ''}>${esc(name)}</option>`
    const roomBar =
      l.mode === 'online'
        ? `<div class="row"><span class="chip dark">Room ${esc(this.roomCode ?? '')}</span><button class="btn small" data-act="copy-room">Copy invite link</button></div>`
        : ''
    const isPlayer = players.some((p) => this.localIds.includes(p.id))
    const day = l.history.length && players.length > 1 ? `<details class="day" ${this.dayOpen ? 'open' : ''}><summary class="kicker">Day ${l.day} so far · ${l.history.length} attempt${l.history.length > 1 ? 's' : ''}</summary>${this.boardHtml(l)}${awardsHtml(l)}</details>` : ''
    return `<div class="side">
      <div class="side-head">
        <div class="row spread"><span class="kicker">Crag Day · day ${l.day}</span><div class="row"><button class="btn small ghost-btn" data-act="modal-help" title="How to play">?</button><button class="btn small ghost-btn" data-act="modal-log">Logbook</button><button class="btn small ghost-btn" data-act="modal-settings">Settings</button><button class="btn small" data-act="leave">Leave</button></div></div>
        <h2>The Crag</h2>
        ${roomBar}
        <div class="players">${players.map(playerRow).join('')}</div>
        ${l.mode === 'online' && players.length < 2 ? '<p class="note">Waiting for friends. Send them the invite link, or climb with the bot belayer meanwhile.</p>' : ''}
        ${day}
      </div>
      <div class="side-body">
        <div class="routes">${CRAG.map(routeCard).join('')}</div>
        ${extra.length ? `<div class="kicker sect">Shared routes</div><div class="routes">${extra.map(routeCard).join('')}</div>` : ''}
        <div class="row newroute">
          <select id="f-newgrade" aria-label="Grade for a new route">${GRADES.map((g) => opt(g, this.grade(g), g === this.newGrade)).join('')}</select>
          <button class="btn small" data-act="random-route">+ New random route</button>
        </div>
      </div>
      <div class="side-foot">
        <div class="roles">
          <div class="field"><label for="f-leader">Leader</label><select id="f-leader">${players.map((p) => opt(p.id, p.name, p.id === roles.leader)).join('')}</select></div>
          <div class="field"><label for="f-belayer">Belayer</label><select id="f-belayer">${opt(BOT, 'Bot belayer', roles.belayer === BOT)}${players.map((p) => opt(p.id, p.name, p.id === roles.belayer)).join('')}</select></div>
        </div>
        <label class="check"><input type="checkbox" id="f-autofeet" ${l.autoFeet ? 'checked' : ''}> Auto feet (feet step by themselves)</label>
        <button class="go" data-act="start" ${isPlayer ? '' : 'disabled'}>Tie in <span>→ ${esc(sel.name)}</span></button>
      </div>
    </div>
    ${this.posterHtml(sel)}`
  }

  roleOverride: { leader?: string; belayer?: string } = {}
  dayOpen = true

  /** the selected route, as a topo card over the wall */
  posterHtml(r: Route): string {
    const tick = bestTick(r.id, this.me().name)
    const g = loadGhost(r.id)
    const shared = !CRAG.some((c) => c.id === r.id)
    return `<div class="poster" style="--band:${gradeBand(r.grade)}">
      <div class="poster-grade">${esc(this.grade(r.grade))}</div>
      <div class="poster-main">
        <span class="kicker">${esc(ANGLE_LABEL[r.angle])}${r.fa ? ` · FA ${esc(r.fa.by)}${r.fa.date ? ` ${esc(r.fa.date)}` : ''}` : ''}</span>
        <h3>${esc(r.name)}</h3>
        <div class="poster-facts">
          <span><b>${Math.round(r.anchor[1])}</b> m</span><span><b>${r.bolts.length}</b> bolts</span><span><b>${r.holds.filter((h) => h.type !== 'foot').length}</b> holds</span>
        </div>
        <div class="poster-tags">
          ${tick ? `<span class="tick ${tick === 'tried' ? 'tried' : ''}">${tick === 'tried' ? 'tried' : `your ${tick}`}</span>` : '<span class="tick tried">not tried</span>'}
          ${g ? `<span class="tick ghost">⏱ ${fmtTime(g.time)} · ${esc(g.name)}</span>` : ''}
        </div>
        <div class="row">
          <button class="btn small" data-act="copy-route">Copy route link</button>
          ${shared ? '<button class="btn small" data-act="forget-route">Forget</button>' : ''}
        </div>
      </div>
    </div>`
  }

  defaultRoles(): { leader: string; belayer: string } {
    const l = this.lobby!
    const base = this.session ? this.session.nextRoles() : (l.next ?? guessRoles(l))
    const ids = new Set(l.players.map((p) => p.id))
    const leader = this.roleOverride.leader && ids.has(this.roleOverride.leader) ? this.roleOverride.leader : base.leader
    let belayer = this.roleOverride.belayer && (ids.has(this.roleOverride.belayer) || this.roleOverride.belayer === BOT) ? this.roleOverride.belayer : base.belayer
    if (belayer === leader) belayer = BOT
    return { leader, belayer }
  }

  climbHtml(): string {
    const l = this.lobby!
    const canEnd = this.isLocalLeader() || !!this.session
    const lead = l.players.find((p) => p.id === l.leader)?.name ?? ''
    return `<div class="climb-bar">
      ${l.phase === 'climb' && canEnd ? `<button class="btn small" data-act="giveup" title="Ask to be lowered; the attempt won't count as a send">Lower me off</button>` : ''}
      ${l.phase === 'climb' && this.session ? `<button class="btn small" data-act="force-end">End attempt</button>` : ''}
      <button class="btn small" data-act="modal-help">Controls (H)</button>
      <button class="btn small dark" data-act="leave">Leave</button>
    </div>
    ${l.phase === 'climb' && !this.isLocalLeader() && !this.isLocalBelayer() ? `<div class="status">Watching ${esc(lead)} climb. Your turn is coming.</div>` : ''}`
  }

  summaryHtml(): string {
    const l = this.lobby!
    const s = l.summary
    if (!s) return ''
    const title = headline(s)
    const next = this.session ? this.session.nextRoles() : (l.next ?? guessRoles(l))
    const nextName = l.players.find((p) => p.id === next.leader)?.name ?? ''
    const isPlayer = l.players.some((p) => this.localIds.includes(p.id))
    return `<div class="modal-bg summary-bg"><div class="modal summary ${s.sent ? 'sent' : ''}">
      ${s.sent ? confetti() : ''}
      <div class="kicker">${esc(s.routeName)} · ${esc(this.grade(s.grade))} · ${esc(s.leaderName)}</div>
      <h2>${title}</h2>
      <div class="stats">
        <div><span>High point</span><b>${s.highPoint.toFixed(1)} m</b></div>
        <div><span>Falls</span><b>${s.falls}</b></div>
        <div><span>Style</span><b>${s.style ?? (s.topped ? 'Topped' : '—')}</b></div>
        ${s.time != null ? `<div><span>Time</span><b>${fmtTime(s.time)}</b></div>` : `<div><span>Energy used</span><b>${s.energyCost}%</b></div>`}
      </div>
      ${this.ghostLine(s)}
      ${s.belay ? belayHtml(s.belay) : ''}
      ${this.boardHtml(l)}
      ${l.dayOver ? `<p class="note">Everyone is out of energy. That was a good day at the crag.</p>${awardsHtml(l)}` : ''}
      <div class="row">
        ${l.dayOver ? `<button class="btn primary" data-act="newday" ${isPlayer ? '' : 'disabled'}>Start a new day</button>` : `<button class="btn primary" data-act="again" ${isPlayer ? '' : 'disabled'}>Next go: ${esc(nextName)} leads</button>`}
        <button class="btn" data-act="back">Pick another route</button>
        <button class="btn" data-act="copy-route-summary">Copy route link</button>
      </div>
    </div></div>`
  }

  /** how the send compares with the route's ghost */
  ghostLine(s: Summary): string {
    const r = this.ghostResult
    if (!s.sent || !s.time || !r || r.key !== this.attemptKey) return ''
    const p = r.prev
    if (p && p.time <= s.time) return `<p class="ghost-line">${esc(p.name)}'s ghost is still faster: ${fmtTime(p.time)}, ${(s.time - p.time).toFixed(1)} s ahead.</p>`
    if (p) return `<p class="ghost-line good">Beat ${esc(p.name)}'s ghost by ${(p.time - s.time).toFixed(1)} s.${r.saved ? ' This climb is the ghost now.' : ''}</p>`
    if (r.saved) return `<p class="ghost-line good">First send recorded. Its ghost will climb beside the next leader.</p>`
    return ''
  }

  /** the crew's day so far, once there is a crew */
  boardHtml(l: Lobby): string {
    if (l.players.length < 2 || !l.history.length) return ''
    const rows = crewBoard(l)
      .map(
        (r) => `<tr><td><i class="dot" style="background:${PALETTE[r.color % PALETTE.length].shirt}"></i>${esc(r.name)}</td>
          <td>${r.sends}</td><td>${r.best ? esc(this.grade(r.best)) : '—'}</td><td>${r.belays ? `${stars(Math.round(r.stars / r.belays))} <small>${r.stars}★ / ${r.belays}</small>` : '—'}</td></tr>`,
      )
      .join('')
    return `<table class="board"><thead><tr><th>Day ${l.day}</th><th>Sends</th><th>Best</th><th>Belaying</th></tr></thead><tbody>${rows}</tbody></table>`
  }

  modalHtml(): string {
    if (!this.modal) return ''
    if (this.modal === 'help') return helpHtml()
    if (this.modal === 'log') return this.logHtml()
    return this.settingsHtml()
  }

  logHtml(): string {
    const log = loadLog().slice().reverse()
    const sends = log.filter((e) => e.style)
    const hardest = sends.reduce<string | null>((a, e) => (!a || GRADES.indexOf(e.grade) > GRADES.indexOf(a) ? e.grade : a), null)
    return `<div class="modal-bg"><div class="modal">
      <div class="row spread"><span class="kicker">Logbook · this browser</span><button class="btn small" data-act="close">Close</button></div>
      <h2>Logbook</h2>
      <div class="stats">
        <div><span>Attempts</span><b>${log.length}</b></div>
        <div><span>Sends</span><b>${sends.length}</b></div>
        <div><span>Hardest send</span><b>${hardest ? esc(this.grade(hardest)) : '—'}</b></div>
      </div>
      ${
        log.length
          ? `<div style="overflow-x:auto"><table><thead><tr><th>Date</th><th>Climber</th><th>Route</th><th>Grade</th><th>Result</th></tr></thead><tbody>
        ${log
          .slice(0, 120)
          .map(
            (e) =>
              `<tr><td>${esc(e.date)}</td><td>${esc(e.climber)}</td><td>${esc(e.routeName)}</td><td>${esc(this.grade(e.grade))}</td><td>${e.style ? `<span class="tick">${e.style}</span>` : `${e.topped ? 'topped' : `${e.highPoint.toFixed(1)} m`}${e.falls ? ` · ${e.falls} fall${e.falls > 1 ? 's' : ''}` : ''}`}</td></tr>`,
          )
          .join('')}</tbody></table></div>`
          : '<p class="note">No climbs yet. Tie in and go.</p>'
      }
    </div></div>`
  }

  settingsHtml(): string {
    const s = this.settings
    return `<div class="modal-bg"><div class="modal">
      <div class="row spread"><span class="kicker">Settings · saved in this browser</span><button class="btn small" data-act="close">Done</button></div>
      <h2>Settings</h2>
      <div class="form-row">
        <div class="field"><label for="s-name">Name</label><input id="s-name" maxlength="20" value="${esc(s.name)}"></div>
        <div class="field"><label for="s-mass">Weight (kg)</label><input id="s-mass" type="number" min="40" max="120" value="${s.mass}" style="width:90px"></div>
        <div class="field"><label for="s-wall">Wall colour</label><select id="s-wall">${(Object.keys(WALLS) as WallColor[]).map((k) => `<option value="${k}" ${s.wall === k ? 'selected' : ''}>${WALLS[k].name}</option>`).join('')}</select></div>
        <div class="field"><label for="s-grades">Grades</label><select id="s-grades"><option value="french" ${s.grades === 'french' ? 'selected' : ''}>French (6a+)</option><option value="yds" ${s.grades === 'yds' ? 'selected' : ''}>YDS (5.10b)</option></select></div>
      </div>
      <label class="check"><input type="checkbox" id="s-autofeet" ${s.autoFeet ? 'checked' : ''}> Auto feet by default (easier for non-climbers)</label>
      <label class="check"><input type="checkbox" id="s-sound" ${s.sound ? 'checked' : ''}> Sound effects</label>
      <label class="check"><input type="checkbox" id="s-voice" ${s.voice ? 'checked' : ''}> Spoken calls</label>
      <label class="check"><input type="checkbox" id="s-debug" ${s.debug ? 'checked' : ''}> Fall readout overlay (also G in game)</label>
      <label class="check"><input type="checkbox" id="s-coach" ${s.coach ? 'checked' : ''}> Coach tips for new players (turning it on shows them all again)</label>
      <label class="check"><input type="checkbox" id="s-ghost" ${s.ghost ? 'checked' : ''}> Ghost of the fastest send climbs beside you</label>
      <p class="note">Your weight matters: a lighter belayer gets lifted further on a big fall, a heavier one gives a harder catch.</p>
    </div></div>`
  }

  // ---------- UI events ----------

  onChange(e: Event): void {
    const t = e.target as HTMLInputElement
    const s = this.settings
    switch (t.id) {
      case 'f-name':
      case 's-name':
        // typing fields never re-render, or a click that blurred them gets lost
        s.name = t.value.trim().slice(0, 20)
        saveSettings(s)
        return
      case 'f-mass':
      case 's-mass':
        s.mass = clampMass(+t.value)
        saveSettings(s)
        return
      case 'f-partner':
        this.partnerName = t.value
        return
      case 's-grades':
        s.grades = t.value === 'yds' ? 'yds' : 'french'
        break
      case 's-autofeet':
        s.autoFeet = t.checked
        break
      case 's-sound':
        s.sound = t.checked
        break
      case 's-voice':
        s.voice = t.checked
        break
      case 's-debug':
        s.debug = t.checked
        break
      case 's-coach':
        s.coach = t.checked
        if (t.checked) {
          s.coachDone = []
          this.coachShown = {}
          this.coachCounts = {}
        }
        break
      case 's-wall':
        if (t.value in WALLS) s.wall = t.value as WallColor
        break
      case 's-ghost':
        s.ghost = t.checked
        break
      case 'f-autofeet':
        s.autoFeet = t.checked
        this.cmd({ type: 'autofeet', on: t.checked })
        break
      case 'f-newgrade':
        this.newGrade = t.value
        return
      case 'f-leader':
        this.roleOverride.leader = t.value
        this.renderUi(true)
        return
      case 'f-belayer':
        this.roleOverride.belayer = t.value
        this.renderUi(true)
        return
      default:
        return
    }
    saveSettings(s)
    setAudio(s.sound, s.voice)
    this.renderUi(true)
  }

  async onClick(e: Event): Promise<void> {
    const el = (e.target as HTMLElement).closest('[data-act],[data-route]') as HTMLElement | null
    if (!el) {
      if ((e.target as HTMLElement).classList.contains('modal-bg') && this.modal) {
        this.modal = null
        this.renderUi(true)
      }
      return
    }
    unlockAudio()
    const routeId = el.dataset.route
    if (routeId) {
      this.selectedRoute = routeId
      this.renderUi(true)
      return
    }
    const act = el.dataset.act!
    const needName = () => {
      if (!this.settings.name.trim()) {
        const input = document.getElementById('f-name') as HTMLInputElement | null
        if (input?.value.trim()) {
          this.settings.name = input.value.trim().slice(0, 20)
          saveSettings(this.settings)
          return false
        }
        input?.focus()
        this.toast('Pick a name first', 'info')
        input?.setAttribute('placeholder', 'Your name, please')
        return true
      }
      return false
    }
    switch (act) {
      case 'solo':
        if (!needName()) this.startSolo()
        break
      case 'local':
        if (!needName()) this.startLocal()
        break
      case 'host':
        if (!needName()) this.startOnline(newRoomCode())
        break
      case 'join': {
        const code = (document.getElementById('f-room') as HTMLInputElement).value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
        if (!code) {
          this.toast('Type the room code first', 'info')
          break
        }
        if (!needName()) this.startOnline(code)
        break
      }
      case 'leave':
        this.leave()
        break
      case 'modal-help':
        this.modal = 'help'
        break
      case 'modal-log':
        this.modal = 'log'
        break
      case 'modal-settings':
        this.modal = 'settings'
        break
      case 'close':
        this.modal = null
        break
      case 'start': {
        const roles = this.defaultRoles()
        this.cmd({ type: 'start', routeId: this.selectedRoute, leader: roles.leader, belayer: roles.belayer })
        this.roleOverride = {}
        break
      }
      case 'again': {
        const l = this.lobby!
        this.cmd({ type: 'start', routeId: l.routeId! })
        break
      }
      case 'back':
        this.cmd({ type: 'back' })
        break
      case 'newday':
        this.cmd({ type: 'newday' })
        break
      case 'giveup':
        this.cmd({ type: 'giveup' })
        break
      case 'force-end':
        this.session?.forceEnd()
        break
      case 'random-route': {
        const g = (document.getElementById('f-newgrade') as HTMLSelectElement).value
        const r = randomRoute(g, this.me().name)
        saveSharedRoute(r)
        this.cmd({ type: 'route', route: r })
        this.selectedRoute = r.id
        if (this.session) this.session.addRoute(r)
        this.toast(`New route: ${r.name}`, 'good')
        break
      }
      case 'forget-route':
        removeSharedRoute(this.selectedRoute)
        this.selectedRoute = CRAG[3].id
        break
      case 'copy-route':
      case 'copy-route-summary': {
        const l = this.lobby
        const r = l ? findRoute(l, act === 'copy-route' ? this.selectedRoute : l.routeId) : null
        if (r) await copy(await routeLink(r), 'Route link copied', this)
        break
      }
      case 'copy-room':
        await copy(`${baseUrl()}?room=${encodeURIComponent(this.roomCode ?? '')}`, 'Invite link copied', this)
        break
    }
    this.renderUi(true)
  }
}

function validFrame(f: unknown): f is InputFrame {
  const x = f as InputFrame
  return (
    !!x &&
    Array.isArray(x.hands) &&
    x.hands.length === 2 &&
    x.hands.every((h) => h && Number.isFinite(h.x) && Number.isFinite(h.y)) &&
    !!x.seq &&
    typeof x.seq === 'object'
  )
}

function clampMass(m: number): number {
  return Math.max(40, Math.min(120, Math.round(Number.isFinite(m) ? m : 70)))
}

function guessRoles(l: Lobby): { leader: string; belayer: string } {
  const ps = l.players
  if (!ps.length) return { leader: '', belayer: BOT }
  if (ps.length === 1) return { leader: ps[0].id, belayer: BOT }
  const i = Math.max(0, ps.findIndex((p) => p.id === l.leader))
  const leader = l.leader ? ps[(i + 1) % ps.length] : ps[0]
  const belayer = ps[(ps.indexOf(leader) + 1) % ps.length]
  return { leader: leader.id, belayer: belayer.id }
}

function stars(n: number): string {
  return `<span class="stars">${'★'.repeat(n)}<s>${'★'.repeat(3 - n)}</s></span>`
}

function belayHtml(b: NonNullable<Summary['belay']>): string {
  const bits: string[] = []
  if (b.catches) bits.push(`${b.catches} catch${b.catches > 1 ? 'es' : ''}${b.perfect ? ` (${b.perfect} perfect)` : ''}`)
  if (b.late) bits.push(`${b.late} late`)
  if (b.missed) bits.push(`${b.missed} missed`)
  if (b.dropped) bits.push(`<b class="bad">dropped them</b>`)
  if (b.shortRopes) bits.push(`${b.shortRopes} short-rope${b.shortRopes > 1 ? 's' : ''}`)
  if (b.looseT >= 1) bits.push(`${b.looseT.toFixed(0)} s of loose rope`)
  if (!bits.length) bits.push('tidy rope, nothing to catch')
  return `<div class="belay-card"><span class="kicker">Belay · ${esc(b.name)}</span>${stars(b.stars)}<span class="why">${bits.join(' · ')}</span></div>`
}

const gradeBand = routeTape

const svg = (body: string) => `<svg class="mode-icon" viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`
const ICON = {
  solo: svg('<circle cx="26" cy="9" r="4"/><path d="M25 14 L22 28 M22 28 L16 40 M22 28 L30 38 M24 18 L34 10 M24 19 L14 22"/><path class="r" d="M22 28 C 20 36, 30 40, 40 46"/>'),
  local: svg('<circle cx="16" cy="10" r="4"/><path d="M16 15 L16 28 M16 28 L11 40 M16 28 L21 40 M16 18 L24 12 M16 19 L9 24"/><circle cx="34" cy="20" r="4"/><path d="M34 25 L34 36 M34 36 L30 46 M34 36 L38 46 M34 28 L28 32"/><path class="r" d="M16 28 C 24 30, 26 34, 28 32"/>'),
  online: svg('<rect x="5" y="10" width="16" height="12" rx="2"/><rect x="27" y="26" width="16" height="12" rx="2"/><path class="r" d="M13 22 C 13 34, 35 14, 35 26"/><path d="M9 26 h8 M31 42 h8"/>'),
}

const AWARD_ICON: Record<string, string> = {
  metres: '▲',
  fast: '⏱',
  whip: '↯',
  soft: '◡',
  belayer: '★',
  flyer: '✈',
  short: '⟂',
  drop: '⤓',
}

/** the day's awards: serious ones and silly ones */
function awardsHtml(l: Lobby): string {
  if (l.players.length < 2) return ''
  const list = dayAwards(l)
  if (!list.length) return ''
  return `<div class="awards">${list
    .map(
      (a) => `<div class="award award-${a.id}"><i style="--c:${PALETTE[a.color % PALETTE.length].shirt}">${AWARD_ICON[a.id] ?? '★'}</i>
        <div><span class="kicker">${esc(a.title)}</span><b>${esc(a.name)}</b><small>${esc(a.detail)}</small></div></div>`,
    )
    .join('')}</div>`
}

/** a burst of paper confetti for a send */
function confetti(): string {
  const cols = ['#FF6B1A', '#0E8F9B', '#E0A800', '#7B5EA7', '#D62839', '#1D2125']
  let out = ''
  for (let i = 0; i < 36; i++) {
    const x = (i * 37) % 100
    const d = ((i * 53) % 60) / 100
    const r = (i * 71) % 360
    out += `<i style="--x:${x}%;--d:${d}s;--r:${r}deg;--c:${cols[i % cols.length]}"></i>`
  }
  return `<div class="confetti" aria-hidden="true">${out}</div>`
}

function headline(s: Summary): string {
  if (s.sent && s.style) return `Sent! <span>${s.style}</span>`
  if (s.reason === 'ground') return 'Ground <span>fall</span>'
  if (s.topped) return 'Topped, <span>not clean</span>'
  return `Lowered <span>off</span>`
}

async function copy(text: string, ok: string, app: App): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    app.toast(ok, 'good')
  } catch {
    window.prompt('Copy this link:', text)
  }
}

function helpHtml(): string {
  const calls = CALLS.map((c) => `<kbd>${c.key}</kbd> ${c.text}`).join(' · ')
  return `<div class="modal-bg"><div class="modal">
    <div class="row spread"><span class="kicker">How to play</span><button class="btn small" data-act="close">Close (H)</button></div>
    <h2>Climb <span>&amp;</span> belay</h2>
    <table>
      <thead><tr><th>Leader</th><th>Keyboard + mouse</th></tr></thead>
      <tbody>
        <tr><td>Left hand</td><td>Hold left mouse button and move; release near a hold to grab it</td></tr>
        <tr><td>Right hand</td><td>Hold right mouse button (trackpad: <kbd>Shift</kbd> + click)</td></tr>
        <tr><td>Feet</td><td><kbd>Q</kbd> / <kbd>E</kbd> step to the hold marked Q / E</td></tr>
        <tr><td>Hips to the wall</td><td>Hold <kbd>Space</kbd>: less pump, a little less reach</td></tr>
        <tr><td>Clip</td><td><kbd>F</kbd> with one hand free when a draw shows F. Top anchor too.</td></tr>
        <tr><td>Chalk / shake out</td><td><kbd>C</kbd> / hold <kbd>R</kbd> with a free hand</td></tr>
      </tbody>
    </table>
    <table>
      <thead><tr><th>Belayer</th><th>Keyboard</th></tr></thead>
      <tbody>
        <tr><td>Feed slack / lower</td><td>Hold <kbd>↓</kbd></td></tr>
        <tr><td>Take in</td><td>Hold <kbd>↑</kbd></td></tr>
        <tr><td>Catch</td><td>Hold <kbd>Enter</kbd> when they fall</td></tr>
        <tr><td>Soft catch</td><td><kbd>Shift</kbd> + <kbd>Enter</kbd>: a hop as the rope comes tight</td></tr>
      </tbody>
    </table>
    <p class="note"><b>Calls:</b> ${calls}</p>
    <p class="note"><b>Tips.</b> Feet first: step up with Q/E, then reach. Rest on jugs with your feet on. Ask for slack before you clip ("Clipping!") or you'll short-rope yourself. "Falling!" gives your belayer a bigger catch window. A send means reaching the top anchor with no falls and no rests on the rope.</p>
    <p class="note"><b>Belay stars.</b> Lock off before the rope comes tight and the catch counts; do it with Shift for a <i>perfect</i> one. Short-roping your leader, a big loop of slack near the ground, or a late catch cost stars. Dropping someone to the ground costs the lot.</p>
    <p class="note"><b>Ghost.</b> The fastest send of each route is saved in your browser and climbs beside the next leader as a see-through ghost; the clock at the top shows if you are ahead. At the end of a day the crew gets awards, serious and otherwise.</p>
    <p class="note">On one computer the mouse climbs and the arrow keys belay. <kbd>G</kbd> shows the fall readout.</p>
  </div></div>`
}

const app = new App()
// handle for automated browser tests
;(window as unknown as { __shortRope: App }).__shortRope = app
