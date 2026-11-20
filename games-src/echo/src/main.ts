/** Boot and screen flow. */
import './style.css';
import { Loop } from './engine/loop';
import { Input } from './engine/input';
import { Game } from './game/game';
import { DIFFICULTIES } from './game/difficulty';
import type { GameEvent } from './game/events';
import { FAIL_PAUSE } from './game/constants';
import { resultOf, formatTime } from './game/scoring';
import { Renderer, type RenderOptions } from './render/renderer';
import { LEVELS, loadLevel, type LevelEntry } from './levels';
import { loadSettings, type Settings } from './storage';
import { Hud } from './ui/hud';
import { TouchControls } from './ui/touch';
import { el, toast } from './ui/dom';
import { AudioEngine } from './audio/audio';
import { Captions } from './ui/captions';
import { hubSoundOn, onHubSoundChange } from './hub';
import type { Level } from './world/level';

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

class App {
  readonly canvas = document.getElementById('view') as HTMLCanvasElement;
  readonly screen = document.getElementById('screen')!;
  readonly renderer = new Renderer(this.canvas);
  readonly input: Input;
  readonly hud: Hud;
  readonly touch: TouchControls;
  readonly loop: Loop;
  readonly audio = new AudioEngine();
  readonly captions: Captions;
  settings: Settings = loadSettings();
  game: Game | null = null;
  level: Level | null = null;
  entry: LevelEntry | null = null;
  private frameEvents: GameEvent[] = [];
  private debug = false;
  private paused = false;
  private failShown = false;

  constructor() {
    this.input = new Input(this.canvas, {
      screenToWorld: (x, y) => this.renderer.screenToWorld(x, y),
      playerPos: () => (this.game ? { x: this.game.player.x, y: this.game.player.y } : { x: 0, y: 0 }),
      playerFacing: () => this.game?.player.facing ?? 0,
    });
    this.hud = new Hud(document.getElementById('hud')!, () => this.input.pressMeta('pause'));
    this.touch = new TouchControls(document.getElementById('touch')!, this.input);
    this.input.onDeviceChange = (d) => this.touch.show(d === 'touch' && this.isPlaying());
    if (matchMedia('(pointer: coarse)').matches) this.input.lastDevice = 'touch';
    this.captions = new Captions(document.getElementById('captions')!, this.renderer);
    this.captions.enabled = this.settings.captions;
    this.loop = new Loop((dt) => this.update(dt), (dt) => this.render(dt));
    // Audio can only start inside a user gesture.
    const unlock = () => {
      this.audio.unlock();
      this.applyVolume();
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    onHubSoundChange(() => this.applyVolume());
    new ResizeObserver(() => this.renderer.resize()).observe(this.canvas);
    this.renderer.resize();
  }

  applyVolume(): void {
    this.audio.setVolume(this.settings.volume, this.settings.muted || !hubSoundOn());
  }

  isPlaying(): boolean {
    return !!this.game && !this.game.attract && this.game.status === 'playing' && !this.paused;
  }

  renderOpts(): RenderOptions {
    return {
      highContrast: this.settings.highContrast,
      reducedMotion: reducedMotionQuery.matches,
      shake: this.settings.shake,
      debug: this.debug,
      fps: this.loop.fps,
    };
  }

  // ------------------------------------------------------------------ flow

  play(entry: LevelEntry): void {
    this.entry = entry;
    this.start(loadLevel(entry));
  }

  start(level: Level, checkpoint = false): void {
    this.level = level;
    this.game = new Game({
      level,
      difficulty: DIFFICULTIES[this.settings.difficulty],
      checkpoint: checkpoint ? this.game?.checkpoint ?? null : null,
    });
    this.paused = false;
    this.failShown = false;
    this.frameEvents = [];
    this.screen.replaceChildren();
    this.captions.clear();
    this.renderer.snapTo(this.game);
    this.input.resetHeld();
    this.input.enabled = true;
    this.hud.show(true);
    this.touch.reset();
    this.touch.show(this.input.lastDevice === 'touch');
    if (!checkpoint) this.hud.showHint(level.meta.hint);
    this.canvas.focus({ preventScroll: true });
  }

  retry(): void {
    if (!this.level) return;
    const useCheckpoint = !!this.game?.checkpoint && this.game.diff.checkpoints && this.game.status === 'failed';
    this.start(this.level, useCheckpoint);
  }

  // ------------------------------------------------------------------ loop

  private update(dt: number): void {
    for (const m of this.input.takeMeta()) {
      if (m === 'debug') this.debug = !this.debug;
      else if (m === 'retry' && this.game && !this.game.attract) this.retry();
      else if (m === 'pause') this.togglePause();
    }
    const g = this.game;
    if (!g) return;
    if (this.paused) return;
    g.update(dt, this.input.sample());
    for (const e of g.drainEvents()) this.frameEvents.push(e);
    if (g.status === 'failed' && !g.attract) {
      this.input.enabled = false;
      if (!this.failShown) this.showFail(g.failReason);
      if (g.t - g.endedAt >= FAIL_PAUSE) this.retry();
    } else if (g.status === 'won' && this.input.enabled) {
      this.input.enabled = false;
      this.showResults();
    }
  }

  private render(dt: number): void {
    const g = this.game;
    if (!g) return;
    const events = this.frameEvents;
    this.frameEvents = [];
    const opts = this.renderOpts();
    this.renderer.onEvents(events, opts);
    for (const e of events) this.onEvent(e);
    this.renderer.render(g, this.paused ? 0 : dt, opts);
    if (!g.attract) this.hud.update(g);
    const heard = this.audio.handle(g, events);
    if (!g.attract) this.captions.show(g, heard);
    this.captions.tick();
    if (!this.paused) this.audio.update(g);
  }

  private onEvent(e: GameEvent): void {
    switch (e.type) {
      case 'message': toast(e.text, 3600); break;
      case 'nostones': toast('No stones left. Find rubble and press E to pick one up.'); break;
      case 'pickup': toast(`Picked up a stone (${e.stones})`); break;
      case 'delivered': toast(`Tourist safe (${e.rescued}/${e.total})`); break;
      default: break;
    }
  }

  private togglePause(): void {
    if (!this.game || this.game.attract || this.game.status !== 'playing') return;
    this.paused = !this.paused;
    this.input.enabled = !this.paused;
    this.input.resetHeld();
    if (this.paused) {
      this.audio.stopWorld();
      this.showPause();
    } else this.screen.replaceChildren();
  }

  // ------------------------------------------------------------------ overlays (M1: minimal)

  private showFail(reason: string): void {
    this.failShown = true;
    this.hud.hideHint();
    this.screen.replaceChildren(
      el('div', { class: 'fail-word', role: 'alert' },
        el('div', {}, reason, el('small', { text: 'Press R to retry now' }))),
    );
  }

  private showPause(): void {
    this.screen.replaceChildren(
      el('div', { class: 'overlay' },
        el('div', { class: 'card' },
          el('p', { class: 'eyebrow', text: 'Paused' }),
          el('h2', { text: this.level?.meta.name ?? 'Paused' }),
          el('div', { class: 'row' },
            el('button', { class: 'btn primary', type: 'button', onclick: () => this.togglePause(), text: 'Resume' }),
            el('button', { class: 'btn', type: 'button', onclick: () => this.retry(), text: 'Restart' })))));
  }

  private showResults(): void {
    const g = this.game!;
    const r = resultOf(g);
    this.hud.hideHint();
    this.touch.show(false);
    const stat = (v: string, label: string) => el('div', { class: 'stat' }, el('b', { text: v }), el('span', { text: label }));
    this.screen.replaceChildren(
      el('div', { class: 'overlay' },
        el('div', { class: 'card' },
          el('p', { class: 'eyebrow', text: 'Escaped' }),
          el('h2', { text: g.level.meta.name }),
          el('div', { class: 'stats' },
            stat(formatTime(r.time), 'Time'),
            stat(String(r.sounds), 'Sounds'),
            stat(String(r.alerts), 'Alerts'),
            stat(r.total ? `${r.rescued}/${r.total}` : '—', 'Tourists')),
          el('div', { class: 'row' },
            el('button', { class: 'btn primary', type: 'button', onclick: () => this.retry(), text: 'Retry' })))));
  }
}

const app = new App();
app.play(LEVELS[0]);
app.loop.start();

// Handle for automated browser tests and the console (no gameplay effect).
(window as unknown as { echo: App }).echo = app;
