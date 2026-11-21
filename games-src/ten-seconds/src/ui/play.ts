/**
 * The play screen: runs one level. Owns the Session (the plan), the Preview (scrubbing and plan
 * markers), the renderer, the timeline, input and sound, and walks through the loop phases:
 *
 *   ready → recording → (rewind → ready) | (caught → ready) | (won → payoff → results)
 */
import { audio } from '../audio/audio';
import { Session, stoneTouchedBy } from '../game/session';
import type { DifficultyId } from '../game/difficulty';
import { Input, type Action } from '../input/input';
import { Renderer } from '../render/renderer';
import { Timeline, type Hit, type TimelineState } from '../render/timeline';
import { HZ } from '../sim/constants';
import type { Level } from '../sim/level';
import type { Recording } from '../sim/recording';
import { Preview } from '../sim/scrub';
import type { Caught, SimEvent, World } from '../sim/world';
import type { LiveInput } from '../sim/actors';
import { h } from './dom';

export interface PlayOptions {
  level: Level;
  difficulty: DifficultyId;
  input: Input;
  colorblind: boolean;
  reduced: () => boolean;
  showPaths: boolean;
  onWin: (s: Session, replay: () => void) => void;
  onPause: () => void;
  onPathsToggle?: (on: boolean) => void;
}

type View = 'play' | 'rewind' | 'caught' | 'payoff' | 'won';

const REWIND_S = 0.65;

export class PlayScreen {
  readonly root: HTMLElement;
  readonly session: Session;
  private o: PlayOptions;
  private lv: Level;
  private renderer: Renderer;
  private timeline: Timeline;
  private preview: Preview;
  private mapCanvas: HTMLCanvasElement;
  private tlCanvas: HTMLCanvasElement;
  private hud: HTMLElement;
  private banner: HTMLElement;
  private hint: HTMLElement;
  private view: View = 'play';
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  private paused = false;
  private debug = false;
  private fps = 60;
  private viewT0 = 0;
  /** scrub playhead while ready (null = tick 0, the live view) */
  private scrubT: number | null = null;
  private history: Float32Array[] = [];
  private stride = 0;
  private hover: Hit | null = null;
  private drag: { hit: Hit; x0: number; delay0: number; cut0: number } | null = null;
  private stepTimers = new Map<number, number>();
  private caught: Caught | null = null;
  private payoff: { world: World; t0: number; stung: boolean; lanes: Recording[] } | null = null;
  private lastNote = '';
  private showPaths: boolean;
  /** drives the live player instead of the input (automated browser checks, assist demos) */
  autopilot: ((w: World) => LiveInput) | null = null;

  constructor(o: PlayOptions) {
    this.o = o;
    this.lv = o.level;
    this.showPaths = o.showPaths;
    this.session = new Session(o.level, o.difficulty);
    this.preview = new Preview(o.level);
    this.mapCanvas = h('canvas', { class: 'map', 'aria-label': `${o.level.name}: the map` }) as HTMLCanvasElement;
    this.tlCanvas = h('canvas', { class: 'timeline', 'aria-label': 'Timeline: one lane per copy' }) as HTMLCanvasElement;
    this.hud = h('div', { class: 'hud' });
    this.banner = h('div', { class: 'banner', role: 'status', 'aria-live': 'polite' });
    this.hint = h('div', { class: 'hint' });
    const stage = h('div', { class: 'stage' }, this.mapCanvas, this.hud, this.banner, this.hint);
    this.root = h('div', { class: 'play' }, stage, this.tlCanvas);
    this.renderer = new Renderer(this.mapCanvas);
    this.renderer.setLevel(o.level);
    this.timeline = new Timeline(this.tlCanvas);
    this.bindPointer();
    this.refreshPlan();
    this.showHint(true);
  }

  // ---------- lifecycle ----------

  start(): void {
    this.running = true;
    this.last = performance.now();
    this.resize();
    const frame = (now: number) => {
      if (!this.running) return;
      this.frame(now);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    audio.music?.silence();
    this.o.input.touch = null;
    this.o.input.touchDir = null;
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.last = performance.now();
    if (p) audio.music?.silence();
    else audio.music?.setLayers(this.session.lanes.length);
    this.o.input.clear();
  }

  requestPause(): void {
    this.o.onPause();
  }

  setColorblind(on: boolean): void {
    this.o.colorblind = on;
  }

  setShowPaths(on: boolean): void {
    this.showPaths = on;
  }

  resize(): void {
    const narrow = window.innerWidth < 640;
    const rows = Math.max(1, this.timeline.rowCount(this.tlState()));
    this.tlCanvas.style.height = `${this.timeline.heightFor(Math.max(rows, 2), narrow)}px`;
    this.renderer.padTop = narrow ? 64 : 58;
    this.renderer.resize();
    this.timeline.resize();
  }

  // ---------- the frame ----------

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    const s = this.session;
    if (!this.paused) {
      for (const a of this.o.input.take()) this.action(a);
      const [mx, my] = this.o.input.move();
      if (this.view === 'play' && s.phase === 'ready' && (mx || my || this.autopilot)) this.beginLoop();
      if (this.view === 'caught' && (mx || my) && now / 1000 - this.viewT0 > 0.7) this.retry();
      if (this.view === 'play' && s.phase === 'recording') {
        const left = s.loopTicks() - s.world.t;
        const rate = left <= HZ ? s.diff.lastSecond : s.diff.speed;
        this.acc += dt * rate;
        let n = 0;
        while (this.acc >= 1 / HZ && n++ < 8 && s.phase === 'recording') {
          this.acc -= 1 / HZ;
          this.tick(mx, my, rate);
        }
        if (n >= 8) this.acc = 0;
      }
      if (this.view === 'rewind' && now / 1000 - this.viewT0 >= REWIND_S) this.finishRewind();
      if (this.view === 'payoff') this.stepPayoff(dt, now / 1000);
    }
    this.draw(now / 1000);
  }

  private beginLoop(): void {
    const s = this.session;
    if (s.phase !== 'ready') return;
    this.scrubT = null;
    this.preview.seek(0);
    this.history = [];
    this.stride = 0;
    this.caught = null;
    this.acc = 1 / HZ; // the first tick runs right away
    s.start();
    this.banner.classList.remove('show');
    this.hint.classList.remove('show');
    audio.music?.setLayers(s.lanes.length);
  }

  private tick(mx: number, my: number, rate: number): void {
    const s = this.session;
    const use = this.pendingUse;
    this.pendingUse = false;
    s.step(this.autopilot ? this.autopilot(s.world) : { dx: mx, dy: my, use });
    const w = s.world;
    this.snapshot(w);
    const evs = w.events;
    w.events = [];
    this.renderer.onEvents(evs, performance.now() / 1000, w.live ? w.live.idx : -1);
    this.sounds(w, evs);
    if (w.t % 15 === 0) audio.music?.step(((w.t / 15) | 0) % 40, rate);
    if (w.t % HZ === 0 && w.t < w.loopTicks && s.phase === 'recording') audio.tick(Math.round((w.loopTicks - w.t) / HZ));
    if (s.phase === 'over') this.startRewind();
    else if (s.phase === 'caught') this.onCaught(w.caught!);
    else if (s.phase === 'won') this.onWon();
  }

  private pendingUse = false;

  private action(a: Action): void {
    const s = this.session;
    audio.unlock();
    switch (a.kind) {
      case 'use':
        if (this.view === 'caught') return this.retry();
        if (this.view !== 'play') return;
        if (s.phase === 'ready') {
          this.pendingUse = true;
          this.beginLoop();
        } else if (s.phase === 'recording') this.pendingUse = true;
        return;
      case 'retry':
        if (this.view === 'play' || this.view === 'caught') this.retry();
        return;
      case 'delete':
        if (this.view === 'rewind' || this.view === 'payoff' || this.view === 'won') return;
        if (!s.diff.timeline) return this.say('Hard-core: every loop is final.', 'warn');
        if (!s.lanes.length) return this.say('No copies to delete yet.');
        s.deleteLast();
        this.view = 'play';
        this.caught = null;
        this.say(`Deleted copy ${s.lanes.length + 1}.`);
        audio.ui();
        this.refreshPlan();
        return;
      case 'lane':
        return this.selectLane(a.n);
      case 'laneStep': {
        if (!s.lanes.length) return;
        const n = s.selected < 0 ? (a.d > 0 ? 0 : s.lanes.length - 1) : s.selected + a.d;
        if (n < 0 || n >= s.lanes.length) return this.selectLane(s.selected);
        return this.selectLane(n);
      }
      case 'pause':
        if (this.view === 'won' || this.view === 'payoff') return;
        this.o.onPause();
        return;
      case 'debug':
        this.debug = !this.debug;
        return;
      case 'scrub':
        if (s.phase !== 'ready' || this.view !== 'play') return;
        if (!s.diff.timeline) return;
        this.scrubTo((this.scrubT ?? 0) + a.d * 30);
        return;
      case 'paths':
        this.showPaths = !this.showPaths;
        this.o.onPathsToggle?.(this.showPaths);
        this.say(this.showPaths ? 'Plan paths on.' : 'Plan paths off.');
        return;
    }
  }

  private selectLane(n: number): void {
    const s = this.session;
    if (this.view === 'rewind' || this.view === 'payoff' || this.view === 'won') return;
    if (!s.diff.timeline) return this.say('Hard-core: no re-recording.', 'warn');
    if (n >= s.lanes.length) return this.say(n === s.lanes.length ? 'That lane is the next new loop.' : `There's no copy ${n + 1} yet.`);
    const was = s.selected;
    s.select(n);
    this.view = 'play';
    this.caught = null;
    this.refreshPlan();
    audio.ui();
    if (s.selected >= 0) this.say(`Re-recording copy ${n + 1}. The others stay. Press ${n + 1} again to cancel.`);
    else if (was >= 0) this.say('Back to recording a new loop.');
  }

  private retry(): void {
    const s = this.session;
    s.retry();
    this.view = 'play';
    this.caught = null;
    this.scrubT = null;
    this.renderer.clearFx();
    this.refreshPlan();
    audio.music?.silence();
  }

  // ---------- phase changes ----------

  private startRewind(): void {
    this.view = 'rewind';
    this.viewT0 = performance.now() / 1000;
    audio.rewind();
    audio.music?.silence();
  }

  private finishRewind(): void {
    const s = this.session;
    const full = s.note === 'full';
    s.prepare();
    this.view = 'play';
    this.renderer.clearFx();
    this.refreshPlan();
    if (full) {
      this.say(`The crew is full (${s.maxCopies()} copies). That loop wasn't kept: re-record a lane (1–${s.lanes.length}) or delete one (Z).`, 'warn');
      audio.denied();
    } else {
      audio.chime();
      const n = s.lanes.length;
      this.say(n === 1 ? 'Copy 1 recorded. It will repeat exactly what you did. Now loop 2.' : `Copy recorded. ${n} of you now. Loop ${n + 1}.`);
    }
  }

  private onCaught(c: Caught): void {
    this.view = 'caught';
    this.viewT0 = performance.now() / 1000;
    this.caught = c;
    audio.alarm();
    audio.music?.silence();
    this.say(caughtText(this.session.world, c) + '  Press R, Use or move to try this loop again.', 'bad', true);
  }

  private onWon(): void {
    const s = this.session;
    audio.success();
    audio.music?.silence();
    // the payoff: zoom out and replay the whole plan
    this.view = 'payoff';
    const pw = new Preview(this.lv);
    const lanes = s.lanes.slice();
    if (s.selected >= 0) lanes[s.selected] = s.rec;
    else lanes.push(s.rec);
    pw.setPlan(lanes, s.loopTicks());
    pw.seek(0);
    this.payoff = { world: pw.world, t0: performance.now() / 1000, stung: false, lanes };
    this.paybackAcc = 0;
    this.say('Clean getaway. Here\'s the whole plan.', 'good', true);
  }

  private paybackAcc = 0;

  private stepPayoff(dt: number, now: number): void {
    const p = this.payoff;
    if (!p) return;
    const w = p.world;
    if (this.o.reduced() || this.session.world.winTick < 0) return this.endPayoff();
    this.paybackAcc += dt * 1.6;
    while (this.paybackAcc >= 1 / HZ && w.status === 'running') {
      this.paybackAcc -= 1 / HZ;
      w.tick(null);
      const evs = w.events;
      w.events = [];
      this.renderer.onEvents(evs, now, -1);
      if (w.t % 15 === 0) audio.music?.step(((w.t / 15) | 0) % 40, 1.6);
    }
    if (w.status === 'won' && !p.stung) {
      p.stung = true;
      audio.sting();
      this.viewT0 = now;
    }
    if (w.status !== 'running' && now - this.viewT0 > 1.1) this.endPayoff();
  }

  private endPayoff(): void {
    if (this.view === 'won') return;
    this.view = 'won';
    audio.music?.silence();
    this.banner.classList.remove('show');
    this.o.onWin(this.session, () => this.replayPayoff());
  }

  /** "Watch again" from the results. */
  replayPayoff(): void {
    if (this.view !== 'won') return;
    this.onWon();
  }

  // ---------- plan preview ----------

  /** Re-run the plan preview (markers, paradoxes) after any change to the plan. */
  private refreshPlan(): void {
    const s = this.session;
    const lanes = s.lanes.map((r, i) => (i === s.selected ? null : r));
    // the preview plays every copy except a lane being re-recorded
    const kept = lanes.filter((r): r is NonNullable<typeof r> => !!r);
    this.preview.setPlan(kept, s.loopTicks());
    // markers and paradoxes are reported by preview actor index; map back to lanes
    const map = lanes.map((r, i) => (r ? i : -1)).filter((i) => i >= 0);
    this.planEvents = this.preview.events.map((e) => ({ ...e, actor: e.actor >= 0 ? map[e.actor] : e.actor }));
    this.planParadox = new Map();
    this.preview.world.actors.forEach((a, k) => {
      if (a.state === 'paradox') this.planParadox.set(map[k], a.paradoxAt);
    });
    const caught = this.preview.world.caught;
    this.planCaught = caught ? { ...caught, actor: caught.actor >= 0 ? map[caught.actor] : -1 } : null;
    this.resize();
    if (this.planCaught && s.phase === 'ready') {
      this.say(`Heads up: as planned, ${caughtText(this.preview.world, caught!, map).replace(/^Seen/, 'someone gets seen')}`, 'warn');
    }
  }

  private planEvents: SimEvent[] = [];
  private planParadox = new Map<number, number>();
  private planCaught: Caught | null = null;

  private scrubTo(t: number): void {
    const s = this.session;
    this.scrubT = Math.max(0, Math.min(s.loopTicks(), Math.round(t)));
    if (this.scrubT === 0) this.scrubT = null;
  }

  // ---------- drawing ----------

  private draw(now: number): void {
    const s = this.session;
    let w: World = s.world;
    let rewind = -1;
    let zoom = 1;
    if (this.view === 'rewind') {
      rewind = Math.min(1, (now - this.viewT0) / REWIND_S);
      this.restore(w, 1 - rewind);
    } else if (this.view === 'payoff' || this.view === 'won') {
      w = this.payoff?.world ?? w;
      zoom = this.o.reduced() ? 1 : 1.12;
    } else if (s.phase === 'ready' && this.scrubT !== null) {
      w = this.preview.seek(this.scrubT);
    }
    const alpha = this.view === 'play' && s.phase === 'recording' ? Math.min(1, this.acc * HZ) : 1;
    this.renderer.draw(w, {
      alpha,
      now,
      lanes: s.lanes,
      showPaths: this.showPaths && this.view !== 'payoff' && this.view !== 'won',
      selected: s.selected,
      colorblind: this.o.colorblind,
      reduced: this.o.reduced(),
      debug: this.debug,
      rewind,
      caught: this.view === 'caught' ? this.caught : null,
      zoom,
      dim: this.paused ? 0.55 : 0,
    });
    this.timeline.draw(this.tlState(w));
    this.drawHud(w);
  }

  private tlState(w: World = this.session.world): TimelineState {
    const s = this.session;
    const recording = s.phase === 'recording' || this.view === 'caught' || this.view === 'rewind';
    const liveEvents = recording || this.view === 'payoff' || this.view === 'won' ? w.log : [];
    // during a live loop, every lane's markers come from that loop
    const events = recording ? liveEvents : this.view === 'payoff' || this.view === 'won' ? liveEvents : this.planEvents;
    let t = 0;
    if (recording) t = this.view === 'rewind' ? Math.round(w.t) : w.t;
    else if (this.view === 'payoff' || this.view === 'won') t = w.t;
    else t = this.scrubT ?? 0;
    const paradox = new Map<number, number>();
    if (recording || this.view === 'payoff' || this.view === 'won') w.actors.forEach((a) => a.state === 'paradox' && paradox.set(a.idx, a.paradoxAt));
    else for (const [k, v] of this.planParadox) paradox.set(k, v);
    const done = this.view === 'payoff' || this.view === 'won';
    return {
      lanes: done && this.payoff ? this.payoff.lanes : s.lanes,
      loopTicks: s.loopTicks(),
      t,
      liveSlot: this.view === 'payoff' || this.view === 'won' ? -1 : s.liveSlot(),
      selected: s.selected,
      recording,
      events,
      paradox,
      editable: s.diff.timeline,
      maxCopies: s.maxCopies(),
      hover: this.hover,
      drag: this.drag?.hit ?? null,
    };
  }

  private hudKey = '';

  private drawHud(w: World): void {
    const s = this.session;
    const left = Math.max(0, (s.loopTicks() - (s.phase === 'recording' || this.view === 'caught' ? w.t : 0)) / HZ);
    const loopN = s.selected >= 0 ? s.selected + 1 : s.lanes.length + 1;
    const total = s.loopTicks() / HZ;
    const frac = left / total;
    const key = [left.toFixed(1), loopN, s.lanes.length, s.selected, this.view, this.debug ? this.fps.toFixed(0) + w.t : ''].join('|');
    if (key === this.hudKey) return;
    this.hudKey = key;
    const stoneNext = s.lanes.length && s.phase === 'ready' ? stoneTouchedBy(this.lv, s.lanes[s.lanes.length - 1]) : false;
    const R = 19;
    const circ = 2 * Math.PI * R;
    const urgent = left <= 2 && s.phase === 'recording';
    this.hud.innerHTML = '';
    const ring = `<svg viewBox="0 0 48 48" class="ring${urgent ? ' urgent' : ''}" aria-hidden="true"><circle cx="24" cy="24" r="${R}" class="ring-bg"/><circle cx="24" cy="24" r="${R}" class="ring-fg" stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${(circ * (1 - frac)).toFixed(2)}" transform="rotate(-90 24 24)"/></svg>`;
    this.hud.append(
      h('div', { class: 'hud-l' }, h('span', { class: 'hud-id' }, this.lv.id), h('span', { class: 'hud-name' }, this.lv.name)),
      h(
        'div',
        { class: 'hud-c' },
        h('span', { class: 'hud-loop' }, s.selected >= 0 ? `Redo ${loopN}` : `Loop ${loopN}`),
        h('span', { class: 'hud-clock', html: `${ring}<b>${left.toFixed(1)}</b>` }),
        stoneNext ? h('span', { class: 'chip stone' }, '5 s loop') : null,
      ),
      h(
        'div',
        { class: 'hud-r' },
        h('span', { class: 'chip' }, h('small', {}, 'Par '), String(this.lv.par)),
        h('span', { class: 'chip' }, h('small', {}, 'Copies '), `${s.lanes.length}/${s.maxCopies()}`),
        this.debug ? h('span', { class: 'chip mono' }, `${this.fps.toFixed(0)} fps · t ${w.t} · ${w.actors.map((a) => a.state[0]).join('')}`) : null,
      ),
    );
  }

  private say(text: string, kind: 'info' | 'warn' | 'bad' | 'good' = 'info', sticky = false): void {
    if (text === this.lastNote && this.banner.classList.contains('show')) return;
    this.lastNote = text;
    this.banner.textContent = text;
    this.banner.className = `banner show ${kind}`;
    clearTimeout(this.sayTimer);
    if (!sticky) this.sayTimer = window.setTimeout(() => this.banner.classList.remove('show'), 4200);
  }
  private sayTimer = 0;

  private showHint(first: boolean): void {
    if (!this.lv.hint) return;
    this.hint.innerHTML = '';
    this.hint.append(h('b', {}, `${this.lv.id} · ${this.lv.name}`), h('span', {}, this.lv.hint), h('small', {}, first ? 'Move to start the clock.' : ''));
    this.hint.classList.add('show');
  }

  // ---------- rewind history ----------

  private snapshot(w: World): void {
    const n = w.actors.length * 2 + w.guards.length * 3 + w.items.length * 2 + w.crates.length * 2 + w.hounds.length * 2;
    this.stride = n;
    const f = new Float32Array(n);
    let k = 0;
    for (const a of w.actors) {
      f[k++] = a.x;
      f[k++] = a.y;
    }
    for (const g of w.guards) {
      f[k++] = g.x;
      f[k++] = g.y;
      f[k++] = g.face;
    }
    for (const it of w.items) {
      f[k++] = it.x;
      f[k++] = it.y;
    }
    for (const c of w.crates) {
      f[k++] = c.x;
      f[k++] = c.y;
    }
    for (const hd of w.hounds) {
      f[k++] = hd.x;
      f[k++] = hd.y;
    }
    this.history.push(f);
  }

  /** Show the world as it was at fraction k of the loop (for the rewind streak). */
  private restore(w: World, k: number): void {
    if (!this.history.length) return;
    const f = this.history[Math.max(0, Math.min(this.history.length - 1, Math.round(k * (this.history.length - 1))))];
    if (f.length !== this.stride) return;
    let i = 0;
    for (const a of w.actors) {
      a.x = a.px = f[i++];
      a.y = a.py = f[i++];
    }
    for (const g of w.guards) {
      g.x = g.px = f[i++];
      g.y = g.py = f[i++];
      g.face = f[i++];
    }
    for (const it of w.items) {
      it.x = it.px = f[i++];
      it.y = it.py = f[i++];
    }
    for (const c of w.crates) {
      c.x = c.px = f[i++];
      c.y = c.py = f[i++];
    }
    for (const hd of w.hounds) {
      hd.x = hd.px = f[i++];
      hd.y = hd.py = f[i++];
    }
  }

  // ---------- sound from events ----------

  private sounds(w: World, evs: SimEvent[]): void {
    const pan = (x: number) => (x / this.lv.w) * 1.6 - 0.8;
    for (const e of evs) {
      const p = pan(e.x);
      switch (e.kind) {
        case 'plate':
          audio.plate(!!e.b, p);
          break;
        case 'door':
          audio.door(!!e.b, p);
          break;
        case 'press':
          audio.press(p);
          break;
        case 'bell':
          audio.bell(p);
          break;
        case 'pickup':
          audio.pickup(p);
          break;
        case 'drop':
          audio.drop(p);
          break;
        case 'pass':
        case 'throw':
        case 'vault':
          audio.whoosh(p);
          break;
        case 'land':
          audio.coinLand(p);
          break;
        case 'paradox':
          audio.paradox(p);
          break;
        case 'stone':
          audio.chime();
          break;
        default:
          break;
      }
    }
    // footsteps
    for (const a of w.actors) {
      const moved = Math.hypot(a.x - a.px, a.y - a.py);
      if (moved < 0.05) continue;
      const t = (this.stepTimers.get(a.idx) ?? 0) + 1;
      if (t >= 17) {
        this.stepTimers.set(a.idx, 0);
        audio.step(pan(a.x), a.live);
      } else this.stepTimers.set(a.idx, t);
    }
  }

  // ---------- pointer: timeline and touch walking ----------

  private bindPointer(): void {
    const tl = this.tlCanvas;
    tl.addEventListener('pointermove', (e) => {
      if (this.drag) return this.onDrag(e);
      this.hover = this.timeline.hit(e.clientX, e.clientY, this.tlState());
      tl.style.cursor = !this.hover ? 'default' : this.hover.kind === 'start' || this.hover.kind === 'end' ? 'ew-resize' : this.hover.kind === 'bar' ? 'grab' : 'pointer';
    });
    tl.addEventListener('pointerleave', () => (this.hover = null));
    tl.addEventListener('pointerdown', (e) => {
      audio.unlock();
      const s = this.session;
      const hit = this.timeline.hit(e.clientX, e.clientY, this.tlState());
      if (!hit) return;
      e.preventDefault();
      const busy = this.view !== 'play' && this.view !== 'caught';
      if (busy) return;
      if (hit.kind === 'chip' || (hit.kind === 'lane' && hit.lane < s.lanes.length && s.phase !== 'recording')) {
        if (hit.lane < s.lanes.length) this.selectLane(hit.lane);
        else if (s.selected >= 0) this.selectLane(s.selected);
        return;
      }
      if (s.phase === 'recording' || !s.diff.timeline) return;
      if (this.view === 'caught') this.retry();
      tl.setPointerCapture(e.pointerId);
      if (hit.kind === 'ruler' || hit.kind === 'lane') {
        this.drag = { hit: { kind: 'ruler' }, x0: e.clientX, delay0: 0, cut0: 0 };
        this.scrubTo(this.timeline.tickAt(e.clientX, s.loopTicks()));
        return;
      }
      const r = s.lanes[hit.lane];
      this.drag = { hit, x0: e.clientX, delay0: r.delay, cut0: r.cut };
    });
    const end = (e: PointerEvent) => {
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      try {
        tl.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      if (d.hit.kind !== 'ruler') {
        this.refreshPlan();
        audio.ui();
      }
    };
    tl.addEventListener('pointerup', end);
    tl.addEventListener('pointercancel', end);

    // touch: hold a finger on the map to walk toward it
    const map = this.mapCanvas;
    map.addEventListener('pointerdown', (e) => {
      audio.unlock();
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.pointerType === 'mouse') return; // mouse users walk with the keyboard
      this.o.input.last = 'touch';
      this.o.input.touch = { x: e.clientX, y: e.clientY, id: e.pointerId };
      map.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    map.addEventListener('pointermove', (e) => {
      const t = this.o.input.touch;
      if (t && t.id === e.pointerId) {
        t.x = e.clientX;
        t.y = e.clientY;
      }
    });
    const up = (e: PointerEvent) => {
      const t = this.o.input.touch;
      if (t && t.id === e.pointerId) this.o.input.touch = null;
    };
    map.addEventListener('pointerup', up);
    map.addEventListener('pointercancel', up);
    this.o.input.touchDir = (cx, cy) => {
      const live = this.session.world.live;
      if (!live) return [0, 0];
      const [wx, wy] = this.renderer.toWorld(cx, cy);
      const dx = wx - live.x;
      const dy = wy - live.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.25) return [0, 0];
      const m = Math.min(1, d / 0.8);
      return [(dx / d) * m, (dy / d) * m];
    };
  }

  private onDrag(e: PointerEvent): void {
    const d = this.drag!;
    const s = this.session;
    const L = s.loopTicks();
    if (d.hit.kind === 'ruler') {
      this.scrubTo(this.timeline.tickAt(e.clientX, L));
      return;
    }
    const lane = 'lane' in d.hit ? d.hit.lane : -1;
    const r = s.lanes[lane];
    if (!r) return;
    const dt = this.timeline.tickAt(e.clientX, L) - this.timeline.tickAt(d.x0, L);
    // snap to tenths of a second
    const snap = (v: number) => Math.round(v / 6) * 6;
    if (d.hit.kind === 'start') {
      // the start handle delays the copy (the bar slides right); the end stays where it was
      const end = d.delay0 + d.cut0;
      const delay = Math.max(0, Math.min(end - 6, snap(d.delay0 + dt)));
      s.trim(lane, delay, Math.min(r.len, end - delay));
    } else if (d.hit.kind === 'end') {
      s.trim(lane, d.delay0, Math.max(6, snap(d.cut0 + dt)));
    } else if (d.hit.kind === 'bar') {
      s.trim(lane, Math.max(0, snap(d.delay0 + dt)), d.cut0);
    }
    this.refreshPlan();
  }
}

/** "Seen: copy 3 at 4.2 s, by the guard." */
export function caughtText(w: World, c: Caught, map?: number[]): string {
  const who = c.actor < 0 ? 'everyone' : w.actors[c.actor]?.live ? 'you' : `copy ${(map ? map[c.actor] : c.actor) + 1}`;
  const by: Record<string, string> = {
    guard: 'the guard',
    auditor: 'the Auditor',
    camera: 'a camera',
    laser: 'a laser',
    hound: 'the Hound',
    lamp: 'the lamp',
    watchmaker: 'the Watchmaker',
  };
  if (c.by === 'watchmaker') return `The Watchmaker rewound the room at ${(c.t / HZ).toFixed(1)} s: the levers weren't all held.`;
  return `Seen: ${who} at ${(c.t / HZ).toFixed(1)} s, by ${by[c.by]}${w.guards.length + w.cameras.length > 1 && (c.by === 'guard' || c.by === 'camera') ? ` ${c.index + 1}` : ''}.`;
}

