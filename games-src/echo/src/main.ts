/** Boot and screen flow: title → chapters → play → results, plus settings, pause and the editor. */
import './style.css';
import { Loop } from './engine/loop';
import { Input } from './engine/input';
import { Game } from './game/game';
import { DIFFICULTIES } from './game/difficulty';
import type { GameEvent } from './game/events';
import { FAIL_PAUSE } from './game/constants';
import { resultOf } from './game/scoring';
import { Renderer, type RenderOptions } from './render/renderer';
import { LEVELS, loadLevel, nextLevel, type LevelEntry } from './levels';
import { loadProgress, loadSettings, mergeBest, saveProgress, saveSettings, type LevelBest, type Progress, type Settings } from './storage';
import { Hud } from './ui/hud';
import { TouchControls } from './ui/touch';
import { el, toast as rawToast } from './ui/dom';
import { wordFor } from './ui/wording';
import { AudioEngine } from './audio/audio';
import { Captions } from './ui/captions';
import { hubSoundOn, onHubSoundChange } from './hub';
import { parseLevel, type Level, type LevelMeta } from './world/level';
import { generateCave } from './world/cavegen';
import {
  chapterScreen, continueLevel, focusFirst, isUnlocked, pauseScreen, resultsScreen, settingsScreen, titleScreen,
} from './ui/screens';

let wording: (t: string) => string = (t) => t;
const toast = (text: string, ms?: number) => rawToast(wording(text), ms);

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

type Mode = 'menu' | 'play' | 'editor';

/** Where a custom level came from, so results and pause can send the player back there. */
interface CustomSource {
  kind: 'editor' | 'shared';
  text: string;
  meta: LevelMeta;
}

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
  progress: Progress = loadProgress();
  mode: Mode = 'menu';
  game: Game | null = null;
  level: Level | null = null;
  entry: LevelEntry | null = null;
  custom: CustomSource | null = null;
  private frameEvents: GameEvent[] = [];
  private debug = false;
  private paused = false;
  private failShown = false;
  /** Hard-core: fails in the current chapter run. */
  private chapterFails = 0;
  private chapterOfFails = 0;
  /** Escape handler for the current menu screen. */
  private onEscape: (() => void) | null = null;
  private editorHandle: { destroy(): void } | null = null;

  constructor() {
    this.input = new Input(this.canvas, {
      screenToWorld: (x, y) => this.renderer.screenToWorld(x, y),
      playerPos: () => (this.game ? { x: this.game.player.x, y: this.game.player.y } : { x: 0, y: 0 }),
      playerFacing: () => this.game?.player.facing ?? 0,
    });
    this.hud = new Hud(document.getElementById('hud')!, () => this.input.pressMeta('pause'));
    this.touch = new TouchControls(document.getElementById('touch')!, this.input, (on) => {
      this.renderer.bottomInset = on ? 170 : 0;
    });
    this.input.onDeviceChange = (d) => this.touch.show(d === 'touch' && this.mode === 'play' && !this.paused);
    if (matchMedia('(pointer: coarse)').matches) this.input.lastDevice = 'touch';
    wording = (t) => wordFor(t, this.input.lastDevice);
    this.captions = new Captions(document.getElementById('captions')!, this.renderer);
    this.captions.enabled = this.settings.captions;
    this.loop = new Loop((dt) => this.update(dt), (dt) => this.render(dt));
    new ResizeObserver(() => this.renderer.resize()).observe(this.canvas);
    this.renderer.resize();

    // Audio can only start inside a user gesture.
    const unlock = () => {
      this.audio.unlock();
      this.applyVolume();
      if (this.mode !== 'play') this.audio.drone(true);
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    onHubSoundChange(() => this.applyVolume());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.mode === 'menu' && this.onEscape) {
        e.preventDefault();
        this.onEscape();
      }
    });
    window.addEventListener('hashchange', () => void this.openFromHash());
  }

  applyVolume(): void {
    this.audio.setVolume(this.settings.volume, this.settings.muted || !hubSoundOn());
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

  private setScreen(node: HTMLElement | null, onEscape: (() => void) | null = null): void {
    this.screen.replaceChildren(...(node ? [node] : []));
    this.onEscape = onEscape;
    if (node) focusFirst(node);
  }

  // ------------------------------------------------------------------ menus

  /** A live, player-less cave behind the menus: random echoes drawing the walls. */
  private attract(): void {
    if (this.game?.attract) return;
    const level = parseLevel(generateCave(64, 40, (Math.random() * 1e9) | 0), { name: 'Title' }, 'title');
    this.game = new Game({ level, difficulty: DIFFICULTIES.blind, attract: true });
    this.level = null;
    this.renderer.snapTo(this.game);
    this.audio.stopWorld();
  }

  private enterMenu(): void {
    this.input.syncPad();
    this.mode = 'menu';
    this.paused = false;
    this.input.enabled = false;
    this.hud.show(false);
    this.touch.show(false);
    this.captions.clear();
    this.audio.drone(true);
  }

  showTitle(): void {
    this.enterMenu();
    this.attract();
    this.setScreen(titleScreen(this.progress, {
      play: () => this.play(continueLevel(this.progress)),
      chapters: () => this.showChapters(),
      editor: () => this.openEditor(),
      settings: () => this.showSettings(() => this.showTitle()),
    }));
  }

  showChapters(): void {
    this.enterMenu();
    this.attract();
    this.setScreen(chapterScreen(this.progress, (e) => this.play(e), () => this.showTitle()), () => this.showTitle());
  }

  showSettings(back: () => void): void {
    this.setScreen(settingsScreen(this.settings, (s) => {
      this.settings = s;
      saveSettings(s);
      this.captions.enabled = s.captions;
      if (!s.captions) this.captions.clear();
      this.applyVolume();
    }, back), back);
  }

  openEditor(initial?: { text: string; meta: LevelMeta }): void {
    this.enterMenu();
    this.attract();
    this.mode = 'editor';
    this.setScreen(null);
    void import('./editor/editor').then(({ mountEditor }) => {
      if (this.mode !== 'editor') return;
      this.editorHandle = mountEditor(this.screen, {
        initial,
        onPlay: (text, meta) => {
          this.closeEditor();
          this.playCustom(text, meta, 'editor');
        },
        onExit: () => {
          this.closeEditor();
          this.showTitle();
        },
      });
    }).catch(() => {
      toast('The editor could not be loaded.');
      this.showTitle();
    });
  }

  private closeEditor(): void {
    this.editorHandle?.destroy();
    this.editorHandle = null;
  }

  /** #level=<share code> opens a shared level straight away. */
  async openFromHash(): Promise<boolean> {
    const h = location.hash;
    if (!h.startsWith('#level=')) return false;
    try {
      const { decodeShare } = await import('./world/sharecode');
      const shared = decodeShare(h);
      if (!shared) {
        toast('That level link is broken or incomplete.');
        return false;
      }
      this.closeEditor();
      this.playCustom(shared.text, shared.meta, 'shared');
      return true;
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------------ play flow

  play(entry: LevelEntry): void {
    if (entry.chapter !== this.chapterOfFails) {
      this.chapterOfFails = entry.chapter;
      this.chapterFails = 0;
    }
    this.entry = entry;
    this.custom = null;
    this.start(loadLevel(entry));
  }

  /** Play a level from text (editor, share codes). Progress isn't saved for these. */
  playCustom(text: string, meta: Partial<LevelMeta> = {}, kind: CustomSource['kind'] = 'shared'): void {
    const level = parseLevel(text, meta, 'custom');
    this.entry = null;
    this.custom = { kind, text, meta: level.meta };
    this.start(level);
  }

  start(level: Level, checkpoint = false): void {
    const cp = checkpoint ? this.game?.checkpoint ?? null : null;
    this.mode = 'play';
    this.level = level;
    this.game = new Game({ level, difficulty: DIFFICULTIES[this.settings.difficulty], checkpoint: cp });
    this.paused = false;
    this.failShown = false;
    this.frameEvents = [];
    this.setScreen(null);
    this.captions.clear();
    this.audio.drone(false);
    this.audio.stopWorld();
    this.renderer.snapTo(this.game);
    this.input.resetHeld();
    this.input.enabled = true;
    this.hud.show(true);
    this.touch.reset();
    this.touch.show(this.input.lastDevice === 'touch');
    if (!cp) this.hud.showHint(wording(level.meta.hint));
    else toast('Back at your last tourist.');
    this.canvas.focus({ preventScroll: true });
  }

  retry(): void {
    if (!this.level) return;
    const g = this.game;
    const useCheckpoint = !!g?.checkpoint && g.diff.checkpoints && g.status === 'failed';
    this.start(this.level, useCheckpoint);
  }

  private onFailed(): void {
    // Hard-core: three fails in a chapter send you back to its first level (DESIGN.md decision 19).
    if (this.settings.difficulty === 'hardcore' && this.entry) {
      this.chapterFails++;
      const limit = DIFFICULTIES.hardcore.chapterFails ?? 3;
      if (this.chapterFails >= limit) {
        const first = LEVELS.find((l) => l.chapter === this.entry!.chapter);
        this.chapterFails = 0;
        if (first && first !== this.entry) {
          toast(`${limit} fails. The chapter starts over.`, 3500);
          this.play(first);
          return;
        }
      }
    }
    this.retry();
  }

  private onWon(): void {
    const g = this.game!;
    const r = resultOf(g);
    this.hud.hideHint();
    this.touch.show(false);
    this.audio.drone(true);
    let prev: LevelBest | undefined;
    let next: (() => void) | null = null;
    let back: () => void;
    let backLabel: string;
    if (this.entry) {
      const id = this.entry.id;
      prev = this.progress.best[id];
      if (!this.progress.done.includes(id)) this.progress.done.push(id);
      this.progress.best[id] = mergeBest(prev, r);
      saveProgress(this.progress);
      const n = nextLevel(id);
      if (n && isUnlocked(this.progress, n)) next = () => this.play(n);
      back = () => this.showChapters();
      backLabel = 'Chapters';
    } else if (this.custom?.kind === 'editor') {
      const c = this.custom;
      back = () => this.openEditor({ text: c.text, meta: c.meta });
      backLabel = 'Back to editor';
    } else {
      back = () => {
        history.replaceState(null, '', location.pathname + location.search);
        this.showTitle();
      };
      backLabel = 'Title';
    }
    this.mode = 'menu';
    this.input.syncPad();
    this.setScreen(resultsScreen(g.level.meta.name, r, prev, g.level.meta.parTime, {
      retry: () => {
        this.mode = 'play';
        this.retry();
      },
      next,
      back,
      backLabel,
    }));
  }

  private quitLabel(): string {
    if (this.entry) return 'Quit to chapters';
    return this.custom?.kind === 'editor' ? 'Back to editor' : 'Quit to title';
  }

  private quit(): void {
    if (this.entry) this.showChapters();
    else if (this.custom?.kind === 'editor') {
      const c = this.custom;
      this.openEditor({ text: c.text, meta: c.meta });
    } else this.showTitle();
  }

  private togglePause(): void {
    if (this.mode !== 'play' || !this.game || this.game.status !== 'playing') return;
    this.paused = !this.paused;
    this.input.enabled = !this.paused;
    this.input.resetHeld();
    if (this.paused) {
      this.audio.stopWorld();
      this.touch.show(false);
      this.showPause();
    } else {
      this.setScreen(null);
      this.touch.show(this.input.lastDevice === 'touch');
      this.canvas.focus({ preventScroll: true });
    }
  }

  private showPause(): void {
    const L = this.level!;
    this.setScreen(pauseScreen(L.meta.name, L.meta.hint, this.quitLabel(), {
      resume: () => this.togglePause(),
      restart: () => this.start(L),
      settings: () => this.showSettings(() => this.showPause()),
      quit: () => this.quit(),
    }), () => this.togglePause());
  }

  // ------------------------------------------------------------------ loop

  private update(dt: number): void {
    for (const m of this.input.takeMeta()) {
      if (m === 'debug') this.debug = !this.debug;
      else if (m === 'retry' && this.mode === 'play' && !this.paused) {
        // A retry during the fail screen still counts the fail (hard-core chapter restarts).
        if (this.game?.status === 'failed') this.onFailed();
        else this.retry();
      } else if (m === 'pause' && this.mode === 'play') {
        if (this.paused && this.onEscape) this.onEscape();
        else this.togglePause();
      }
    }
    if (this.mode !== 'play' || this.paused) this.menuGamepad();
    const g = this.game;
    if (!g || this.paused) return;
    g.update(dt, this.input.sample());
    for (const e of g.drainEvents()) this.frameEvents.push(e);
    if (g.attract || this.mode !== 'play') return;
    if (g.status === 'failed') {
      this.input.enabled = false;
      if (!this.failShown) this.showFail(g.failReason);
      if (g.t - g.endedAt >= FAIL_PAUSE) this.onFailed();
    } else if (g.status === 'won') {
      this.input.enabled = false;
      this.onWon();
    }
  }

  private render(dt: number): void {
    const g = this.game;
    if (!g) return;
    const events = this.frameEvents;
    this.frameEvents = [];
    const opts = this.renderOpts();
    this.renderer.onEvents(events, opts);
    if (!g.attract) for (const e of events) this.onEvent(e);
    this.renderer.render(g, this.paused ? 0 : dt, opts);
    if (!g.attract) this.hud.update(g);
    const heard = this.audio.handle(g, events);
    if (!g.attract && this.mode === 'play') this.captions.show(g, heard);
    this.captions.tick();
    if (!this.paused && !g.attract) this.audio.update(g);
  }

  /** Move focus between menu controls with a gamepad (spatially, by direction). */
  private menuGamepad(): void {
    for (const nav of this.input.menuNav()) {
      const items = Array.from(this.screen.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea'))
        .filter((n) => n.offsetParent !== null);
      if (!items.length) continue;
      const active = document.activeElement as HTMLElement | null;
      if (nav === 'ok') { active?.click(); continue; }
      if (nav === 'back') { this.onEscape?.(); continue; }
      if (!active || !items.includes(active)) { items[0].focus(); continue; }
      const a = active.getBoundingClientRect();
      const ax = a.left + a.width / 2;
      const ay = a.top + a.height / 2;
      let best: HTMLElement | null = null;
      let bestScore = Infinity;
      for (const n of items) {
        if (n === active) continue;
        const b = n.getBoundingClientRect();
        const dx = b.left + b.width / 2 - ax;
        const dy = b.top + b.height / 2 - ay;
        const forward = nav === 'up' ? -dy : nav === 'down' ? dy : nav === 'left' ? -dx : dx;
        const side = nav === 'up' || nav === 'down' ? Math.abs(dx) : Math.abs(dy);
        if (forward <= 4) continue;
        const score = forward + side * 2;
        if (score < bestScore) { bestScore = score; best = n; }
      }
      best?.focus();
      best?.scrollIntoView({ block: 'nearest' });
    }
  }

  private onEvent(e: GameEvent): void {
    switch (e.type) {
      case 'message': toast(e.text, 3600); break;
      case 'nostones': toast('No stones left. Stand on rubble and press E to pick one up.'); break;
      case 'pickup': toast(`Picked up a stone (${e.stones})`); break;
      case 'delivered': toast(`Tourist safe (${e.rescued}/${e.total})`); break;
      case 'panic': toast('A tourist is panicking. Take their hand again.'); break;
      default: break;
    }
  }

  private showFail(reason: string): void {
    this.failShown = true;
    this.hud.hideHint();
    const node = el('div', { class: 'fail-word', role: 'alert' },
      el('div', {}, reason, el('small', { text: wording('Press R to retry now') })));
    this.screen.replaceChildren(node);
    this.onEscape = null;
  }
}

const app = new App();
app.loop.start();
void app.openFromHash().then((opened) => {
  if (!opened) app.showTitle();
});

// Handle for automated browser tests and the console (no gameplay effect).
(window as unknown as { echo: App }).echo = app;
