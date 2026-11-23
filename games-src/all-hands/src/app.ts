/**
 * The app: screens, who plays which slot, and the loop. Three ways to play:
 *   local     up to four people on this computer (keyboard halves, gamepads, touch)
 *   practice  one person; Tab switches which of the four they control
 *   online    a Game Night room; the host runs everything, guests send input and draw snapshots
 */
import { Audio } from './audio/audio';
import { Session } from './game/session';
import { hostRoomUrl, hub, hubSoundOn, type HubRoom } from './hub';
import { DEVICE_KEYS, DEVICE_LABEL, Input, type DeviceId } from './input/input';
import { LEVELS, levelById, nextLevel } from './levels';
import { Net, type AppState, type Cmd, type SlotInfo, type Snap } from './net/net';
import { Renderer } from './render/renderer';
import { HZ } from './sim/constants';
import { World } from './sim/world';
import { solutionFor } from './solutions';
import { Driver } from './solutions/run';
import { clearedCount, loadSettings, nextToPlay, recordClear, saveSettings, unlocked, type Settings } from './storage';
import { h } from './ui/dom';
import { PlayView } from './ui/play';
import { clearOverlay, levelsScreen, lobbyScreen, pauseOverlay, settingsScreen, titleScreen, type SlotView } from './ui/screens';

interface Slot {
  name: string;
  /** a device on this computer */
  device: DeviceId | null;
  /** a room peer (online) */
  peer: string | null;
}

type Screen = 'title' | 'lobby' | 'levels' | 'settings' | 'play';

const LOCAL_DEVICES: DeviceId[] = ['kb1', 'kb2', 'kb3', 'kb4', 'pad0', 'pad1', 'pad2', 'pad3', 'touch'];

export class App {
  private root: HTMLElement;
  private input = new Input();
  readonly audio = new Audio();
  private settings: Settings = loadSettings();
  private screen: Screen = 'title';
  private screenEl: HTMLElement | null = null;
  private slots: (Slot | null)[] = [null, null, null, null];
  private practice = false;
  private active = 0;
  private world = 1;
  private selected = LEVELS[0].id;
  session: Session | null = null;
  play: PlayView | null = null;
  private overlay: HTMLElement | null = null;
  private paused: string | null = null;
  private result: AppState['result'] = null;
  private ready = [false, false, false, false];
  private votes = new Set<number>();
  private last = 0;
  private demo: { r: Renderer; w: World; d: Driver; acc: number; canvas: HTMLCanvasElement } | null = null;
  // online
  private net: Net | null = null;
  private room: HubRoom | null = null;
  private remote = new Map<string, number>();
  private guestState: AppState | null = null;
  private lastSnap = 0;
  private lastApp = '';
  private lastAppAt = 0;
  /** for the browser test hook: drive the four players from a solution */
  autopilot: Driver | null = null;
  /** for the browser test hook: run the game faster than real time */
  speed = 1;

  constructor(root: HTMLElement) {
    this.root = root;
    this.audio.setVolume(this.settings.volume, this.settings.music);
    this.audio.setMuted(!hubSoundOn());
    hub()?.sound.onChange((on) => this.audio.setMuted(!on));
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', (e) => {
      unlock();
      if (e.code === 'Tab' && this.practice && this.screen === 'play') {
        e.preventDefault();
        this.swap();
      }
    });
    window.addEventListener('resize', () => this.play?.resize());
    requestAnimationFrame((t) => this.frame(t));
  }

  // ───────────────────────── screens ─────────────────────────

  private show(el: HTMLElement, screen: Screen): void {
    this.screen = screen;
    this.screenEl?.remove();
    this.screenEl = el;
    this.root.append(el);
    if (screen !== 'play') {
      this.play = null;
      this.audio.stopMusic();
    }
    if (screen !== 'title') this.demo = null;
  }

  title(): void {
    if (this.room) return this.lobby();
    const canvas = h('canvas', { class: 'demo', 'aria-hidden': 'true' });
    this.show(
      titleScreen({
        demo: canvas,
        cont: nextToPlay(),
        cleared: clearedCount(),
        online: hostRoomUrl(),
        onLocal: () => {
          this.practice = false;
          this.slots = [null, null, null, null];
          this.lobby();
        },
        onPractice: () => this.startPractice(),
        onLevels: () => (this.full() ? this.levels() : this.lobby()),
        onSettings: () => this.settingsScreen(),
      }),
      'title',
    );
    this.startDemo(canvas);
  }

  private startDemo(canvas: HTMLCanvasElement): void {
    const lv = levelById('1-1');
    const sol = lv && solutionFor(lv.id);
    if (!lv || !sol) return;
    const r = new Renderer(canvas);
    this.demo = { r, w: new World(lv), d: new Driver(sol), acc: 0, canvas };
    requestAnimationFrame(() => r.resize());
  }

  private startPractice(): void {
    this.practice = true;
    this.active = 0;
    this.slots = [0, 1, 2, 3].map((i) => ({ name: i === 0 ? 'You' : `You (${i + 1})`, device: null, peer: null }));
    this.levels();
  }

  lobby(): void {
    const isHost = !this.net || this.net.isHost;
    const view = (s: Slot | null): SlotView | null =>
      s && {
        name: s.name,
        device: s.peer ? (s.peer === this.net?.self ? 'Host, this computer' : 'In the room') : s.device ? DEVICE_LABEL[s.device] : 'This computer',
        keys: s.device ? DEVICE_KEYS[s.device] : 'Their own controls',
        online: !!s.peer && s.peer !== this.net?.self,
      };
    const slots = this.guestState ? this.guestState.slots.map((s) => s && { name: s.name, device: s.device, keys: '', online: !!s.peer }) : this.slots.map(view);
    this.show(
      lobbyScreen({
        slots,
        room: this.room?.code ?? null,
        isHost,
        onLeave: (i) => {
          this.slots[i] = null;
          this.lobby();
          this.broadcast();
        },
        onGo: () => this.levels(),
        onBack: () => this.title(),
        onPractice: () => this.startPractice(),
      }),
      'lobby',
    );
  }

  levels(): void {
    const canPick = !this.net || this.net.isHost;
    const sel = levelById(this.selected) && unlocked(this.selected, this.settings) ? this.selected : nextToPlay();
    this.selected = sel;
    this.world = levelById(sel)!.world;
    const render = () =>
      this.show(
        levelsScreen({
          world: this.world,
          selected: this.selected,
          canPick,
          settings: this.settings,
          onWorld: (n) => {
            this.world = n;
            const first = LEVELS.find((l) => l.world === n && unlocked(l.id, this.settings));
            if (first) this.selected = first.id;
            render();
          },
          onSelect: (id) => {
            this.selected = id;
            render();
          },
          onPlay: (id) => this.startLevel(id),
          onBack: () => (this.room ? this.lobby() : this.practice ? this.title() : this.lobby()),
        }),
        'levels',
      );
    render();
    this.broadcast();
  }

  private settingsScreen(): void {
    this.show(
      settingsScreen({
        s: this.settings,
        onChange: (s) => {
          this.settings = s;
          saveSettings(s);
          this.audio.setVolume(s.volume, s.music);
        },
        onBack: () => this.title(),
      }),
      'settings',
    );
  }

  // ───────────────────────── playing ─────────────────────────

  private full(): boolean {
    return this.slots.every(Boolean);
  }

  names(): string[] {
    if (this.guestState) return this.guestState.slots.map((s, i) => s?.name ?? `Player ${i + 1}`);
    return this.slots.map((s, i) => s?.name ?? `Player ${i + 1}`);
  }

  startLevel(id: string): void {
    const lv = levelById(id);
    if (!lv) return;
    this.selected = id;
    this.session = new Session(lv);
    this.autopilot = null;
    this.paused = null;
    this.result = null;
    this.ready = [false, false, false, false];
    this.votes.clear();
    this.closeOverlay();
    this.mountPlay();
    this.broadcast();
  }

  private mountPlay(): void {
    const s = this.session!;
    const touch = matchMedia('(pointer: coarse)').matches || this.slots.some((x) => x?.device === 'touch');
    const remote = this.guestState ? this.guestState.slots.map((x) => !!x?.peer && x.peer !== this.net?.self) : this.slots.map((x) => !!x?.peer && x.peer !== this.net?.self);
    this.play = new PlayView(s.world, { names: this.names(), remote, practice: this.practice ? this.active : null }, this.input, { pause: () => this.requestPause(), swap: () => this.swap() }, touch);
    this.show(this.play.el, 'play');
    requestAnimationFrame(() => this.play?.resize());
    this.audio.layers = 1;
    this.audio.startMusic();
  }

  private swap(): void {
    if (!this.practice || !this.play) return;
    this.active = (this.active + 1) % 4;
    // a fresh PlayView strip update
    (this.play as unknown as { hud: { practice: number | null } }).hud.practice = this.active;
    this.play.showHint(`You're player ${this.active + 1}`, this.last / 1000);
  }

  /** The four players' input bits for this tick. */
  private gather(): number[] {
    if (this.autopilot && this.session) return this.autopilot.inputs(this.session.world);
    const out = [0, 0, 0, 0];
    if (this.practice) {
      let b = 0;
      for (const d of LOCAL_DEVICES) b |= this.input.bits(d);
      out[this.active] = b;
      return out;
    }
    const claimed = new Set(this.slots.map((s) => s?.device).filter(Boolean));
    this.slots.forEach((s, i) => {
      if (!s) return;
      if (s.device) out[i] = this.input.bits(s.device);
      else if (s.peer && s.peer === this.net?.self) {
        // the host's own player: any of this computer's devices nobody else claimed
        let b = 0;
        for (const d of LOCAL_DEVICES) if (!claimed.has(d)) b |= this.input.bits(d);
        out[i] = b;
      } else if (s.peer) out[i] = this.remote.get(s.peer) ?? 0;
    });
    return out;
  }

  private requestPause(): void {
    if (this.net && !this.net.isHost) return this.net.sendCmd({ c: this.guestState?.paused ? 'resume' : 'pause' });
    if (this.paused) this.resume();
    else this.pause(this.practice ? 'you' : 'a player');
  }

  private pause(by: string): void {
    if (!this.session || this.result) return;
    this.paused = by;
    this.showPause();
    this.broadcast();
  }

  private resume(): void {
    this.paused = null;
    this.closeOverlay();
    this.broadcast();
  }

  private humans(): number {
    return new Set(this.slots.filter(Boolean).map((s) => s!.peer ?? 'local')).size;
  }

  private votesNeeded(): number {
    return this.net ? Math.min(3, this.humans()) : 1;
  }

  private showPause(): void {
    const lv = this.session!.lv;
    const st = this.guestState;
    this.setOverlay(
      pauseOverlay({
        by: this.paused ?? st?.paused ?? 'someone',
        hint: lv.hint,
        votes: st ? st.votes.length : this.votes.size,
        needed: this.votesNeeded(),
        online: !!this.net,
        onResume: () => (this.net && !this.net.isHost ? this.net.sendCmd({ c: 'resume' }) : this.resume()),
        onRestart: () => (this.net && !this.net.isHost ? this.net.sendCmd({ c: 'vote' }) : this.vote(this.net ? 'host' : 'local')),
        onLevels: () => {
          if (this.net && !this.net.isHost) return;
          this.closeOverlay();
          this.paused = null;
          this.levels();
        },
        onSettings: () => undefined,
        controls: this.names().map((n, i) => ({ name: n, keys: this.slots[i]?.device ? DEVICE_KEYS[this.slots[i]!.device!] : this.practice ? 'Your keys; Tab switches player' : 'Their own controls' })),
      }),
    );
  }

  private vote(who: string): void {
    const i = this.slots.findIndex((s) => (s?.peer ?? 'local') === who || (who === 'host' && s?.peer === this.net?.self));
    this.votes.add(i >= 0 ? i : 0);
    if (this.votes.size >= this.votesNeeded()) {
      this.votes.clear();
      this.startLevel(this.session!.lv.id);
    } else {
      this.showPause();
      this.broadcast();
    }
  }

  private setOverlay(el: HTMLElement): void {
    this.overlay?.remove();
    this.overlay = el;
    this.play?.el.append(el);
    (el.querySelector('[autofocus]') as HTMLElement | null)?.focus();
  }

  private closeOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  private onWin(): void {
    const s = this.session!;
    const lv = s.lv;
    const time = s.time;
    const pops = s.world.pops;
    const r = recordClear(lv.id, time, lv.par, pops);
    this.result = { time, pops, best: r.best };
    this.ready = [false, false, false, false];
    setTimeout(() => this.showClear(), 900);
    this.broadcast();
  }

  private showClear(): void {
    if (!this.session || !this.result) return;
    const lv = this.session.lv;
    const canPick = !this.net || this.net.isHost;
    this.setOverlay(
      clearOverlay({
        id: lv.id,
        name: lv.name,
        time: this.result.time,
        par: lv.par,
        pops: this.result.pops,
        best: this.result.best,
        ready: this.guestState ? this.guestState.ready : this.ready,
        names: this.names(),
        hasNext: !!nextLevel(lv.id),
        canPick,
        onNext: () => this.next(),
        onAgain: () => this.startLevel(lv.id),
        onLevels: () => {
          this.closeOverlay();
          this.levels();
        },
      }),
    );
  }

  private next(): void {
    const n = this.session && nextLevel(this.session.lv.id);
    if (n && (unlocked(n.id, this.settings) || n.world === this.session!.lv.world)) this.startLevel(n.id);
    else {
      this.closeOverlay();
      this.levels();
    }
  }

  // ───────────────────────── the loop ─────────────────────────

  private frame(t: number): void {
    requestAnimationFrame((tt) => this.frame(tt));
    const now = t / 1000;
    const dt = this.last ? Math.min(0.1, (t - this.last) / 1000) : 0;
    this.last = t;

    this.input.poll();
    if (this.input.pause() && this.screen === 'play' && !this.result) this.requestPause();

    // joining from the title or lobby: press Jump on any device
    const joins = this.input.joins();
    if (!this.practice && (this.screen === 'lobby' || this.screen === 'title') && (!this.net || this.net.isHost) && joins.length) {
      for (const d of joins) this.join(d);
    }

    if (this.demo) this.tickDemo(dt, now);
    if (this.net?.isHost && t - this.lastAppAt > 1000) this.broadcast(true);

    // taps are spent by sim ticks; on any frame without ticks they're spent here
    const ticking = this.screen === 'play' && !!this.session && !this.paused && !this.result && !(this.net && !this.net.isHost);
    if (!ticking) queueMicrotask(() => this.input.used());

    if (this.screen === 'play' && this.session && this.play) {
      const guest = !!this.net && !this.net.isHost;
      if (guest) {
        let b = 0;
        for (const d of LOCAL_DEVICES) b |= this.input.bits(d);
        this.net!.sendInput(b, t);
        this.input.used();
        if (this.result) this.readyPresses(joins);
        this.play.update(this.session.world, this.session.time, now);
        this.play.draw(this.session.world, 1, now, this.session.chats, true, this.reduced());
        return;
      }
      if (!this.paused && !this.result) {
        const { alpha, events } = this.session.advance(
          dt * this.speed,
          () => {
            const g = this.gather();
            this.input.used();
            return g;
          },
          now,
          () => this.play!.renderer.capture(this.session!.world),
        );
        this.audio.play(events);
        this.play.renderer.onEvents(events, now);
        for (const e of events) if (e.type === 'enter' || e.type === 'exit') this.audio.layers = 1 + this.session.world.players.filter((p) => p.p!.inside).length;
        for (const c of this.session.chats) if (c.until > now + 1.99) this.audio.chat(c.p);
        if (this.session.world.status === 'won') this.onWin();
        this.play.update(this.session.world, this.session.time, now);
        this.play.draw(this.session.world, alpha, now, this.session.chats, false, this.reduced());
      } else {
        if (this.result) this.readyPresses(joins);
        this.play.update(this.session.world, this.session.time, now);
        this.play.draw(this.session.world, 1, now, this.session.chats, false, this.reduced());
      }
      if (this.net && t - this.lastSnap > 33) {
        this.lastSnap = t;
        this.net.sendSnap({ s: this.session.world.save(), e: this.session.takeEvents(), c: this.session.chats });
      }
    }
  }

  private reduced(): boolean {
    if (this.settings.reducedMotion === 'on') return true;
    if (this.settings.reducedMotion === 'off') return false;
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private tickDemo(dt: number, now: number): void {
    const d = this.demo!;
    d.acc = Math.min(d.acc + dt, 0.2);
    while (d.acc >= 1 / HZ) {
      d.acc -= 1 / HZ;
      d.r.capture(d.w);
      d.w.step(d.d.inputs(d.w));
      d.r.onEvents(d.w.events, now);
      d.w.events.length = 0;
      if (d.w.status === 'won' && d.w.t - d.w.wonTick > 120) {
        d.w = new World(d.w.lv);
        d.d = new Driver(solutionFor(d.w.lv.id)!);
      }
    }
    d.r.draw(d.w, { alpha: d.acc * HZ, now, zoom: 1, reduced: this.reduced() });
  }

  /** On the clear screen, each player's Jump marks them ready. */
  private readyPresses(joins: DeviceId[]): void {
    if (this.net && !this.net.isHost) {
      if (joins.length) this.net.sendCmd({ c: 'ready' });
      return;
    }
    if (this.practice) {
      if (joins.length) this.ready = [true, true, true, true];
    } else {
      for (const d of joins) {
        const i = this.slots.findIndex((s) => s?.device === d);
        if (i >= 0) this.ready[i] = true;
        else {
          const own = this.slots.findIndex((s) => s?.peer && s.peer === this.net?.self);
          if (own >= 0) this.ready[own] = true;
        }
      }
    }
    // online players without a device here are marked by their 'ready' command
    if (this.overlay && this.result) this.showClear();
    if (this.ready.every(Boolean)) this.next();
    this.broadcast();
  }

  private join(d: DeviceId): void {
    if (this.slots.some((s) => s?.device === d)) return;
    // the host's own player already listens to every free device
    if (this.net && this.slots.some((s) => s?.peer === this.net!.self) && !this.slots.some((s) => s?.device)) {
      // a second person at the host's computer: give them their own slot
    }
    const i = this.slots.findIndex((s) => !s);
    if (i < 0) return;
    const name = i === 0 && !this.net ? hubName() : `Player ${i + 1}`;
    this.slots[i] = { name, device: d, peer: null };
    this.audio.unlock();
    this.audio.play([{ type: 'enter', x: 0, y: 0, p: i }]);
    if (this.screen === 'title') this.lobby();
    else this.lobby();
    this.broadcast();
  }

  // ───────────────────────── online ─────────────────────────

  startOnline(room: HubRoom): void {
    this.room = room;
    this.net = new Net(room, {
      onApp: (s) => this.guestApp(s),
      onSnap: (s) => this.guestSnap(s),
      onInput: (peer, b) => this.remote.set(peer, b),
      onCmd: (peer, c) => this.hostCmd(peer, c),
      onPeers: () => this.syncPeers(),
    });
    if (room.isHost) this.syncPeers();
    this.lobby();
  }

  /** Host: room members fill slots in join order; local extra players keep theirs. */
  private syncPeers(): void {
    if (!this.net || !this.net.isHost || !this.room) return;
    const players = this.room.players;
    const ids = new Set(players.map((p) => p.id));
    // drop slots of people who left
    this.slots = this.slots.map((s) => (s && s.peer && !ids.has(s.peer) ? null : s));
    for (const p of players) {
      if (this.slots.some((s) => s?.peer === p.id)) continue;
      const i = this.slots.findIndex((s) => !s);
      if (i < 0) break;
      this.slots[i] = { name: p.name, device: null, peer: p.id };
    }
    if (this.screen === 'lobby') this.lobby();
    this.broadcast();
  }

  private appState(): AppState {
    const screen: AppState['screen'] = this.screen === 'play' ? (this.result ? 'clear' : 'play') : this.screen === 'levels' ? 'levels' : 'lobby';
    const slots: (SlotInfo | null)[] = this.slots.map((s) => s && { name: s.name, peer: s.peer, device: s.peer ? (s.peer === this.net?.self ? 'Host' : 'In the room') : s.device ? DEVICE_LABEL[s.device] : '' });
    return { screen, slots, level: this.session?.lv.id ?? null, paused: this.paused, votes: [...this.votes], ready: this.ready.slice(), result: this.result };
  }

  /** Host: share the app state when it changes, and every second anyway (for late joiners). */
  private broadcast(force = false): void {
    if (!this.net || !this.net.isHost) return;
    const s = this.appState();
    const key = JSON.stringify(s);
    if (key === this.lastApp && !force) return;
    this.lastApp = key;
    this.lastAppAt = performance.now();
    this.net.sendApp(s);
  }

  private hostCmd(peer: string, c: Cmd): void {
    const i = this.slots.findIndex((s) => s?.peer === peer);
    if (i < 0) return;
    switch (c.c) {
      case 'chat':
        this.session?.chat(i, c.text, this.last / 1000);
        break;
      case 'ready':
        if (this.result) {
          this.ready[i] = true;
          this.showClear();
          if (this.ready.every(Boolean)) this.next();
          this.broadcast();
        }
        break;
      case 'pause':
        this.pause(this.slots[i]!.name);
        break;
      case 'resume':
        this.resume();
        break;
      case 'vote':
        this.votes.add(i);
        if (this.votes.size >= this.votesNeeded()) {
          this.votes.clear();
          this.startLevel(this.session!.lv.id);
        } else {
          this.showPause();
          this.broadcast();
        }
        break;
    }
  }

  private guestApp(s: AppState): void {
    const prev = this.guestState;
    this.guestState = s;
    if (s.screen === 'lobby') {
      if (this.screen !== 'lobby' || JSON.stringify(prev?.slots) !== JSON.stringify(s.slots)) this.lobby();
      return;
    }
    if (s.screen === 'levels') {
      if (this.screen !== 'levels') this.levels();
      return;
    }
    // play / clear
    if (s.level && (!this.session || this.session.lv.id !== s.level || prev?.screen === 'clear' && s.screen === 'play' && !s.result)) {
      const lv = levelById(s.level);
      if (!lv) return;
      this.session = new Session(lv);
      this.result = null;
      this.closeOverlay();
      this.mountPlay();
    }
    if (s.paused && !this.overlay) this.showPause();
    if (s.paused && this.overlay && !s.result) this.showPause();
    if (!s.paused && this.overlay && !s.result) this.closeOverlay();
    if (s.result && (!this.result || JSON.stringify(prev?.ready) !== JSON.stringify(s.ready))) {
      if (!this.result) recordClear(this.session!.lv.id, s.result.time, this.session!.lv.par, s.result.pops);
      this.result = s.result;
      this.showClear();
    }
  }

  private guestSnap(s: Snap): void {
    if (!this.session || !this.play) return;
    this.session.world.load(s.s);
    this.session.chats = s.c;
    this.audio.play(s.e);
    this.play.renderer.onEvents(s.e, this.last / 1000);
    this.audio.layers = 1 + this.session.world.players.filter((p) => p.p!.inside).length;
  }
}

function hubName(): string {
  try {
    const n = (window as unknown as { GameNight?: { playerName?: () => string } }).GameNight?.playerName?.();
    return n && n.trim() ? n.trim().slice(0, 16) : 'Player 1';
  } catch {
    return 'Player 1';
  }
}

