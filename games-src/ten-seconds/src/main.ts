/** Boot and the screen manager: title → heists → play (pause, results, settings over it). */
import './style.css';
import { audio } from './audio/audio';
import { hubSoundOn, onHubSoundChange } from './hub';
import { Input } from './input/input';
import { CHAPTERS, LEVELS, levelById, nextLevel } from './levels';
import type { Level } from './sim/level';
import { loadProgress, loadSettings, mergeBest, read, saveProgress, saveSettings, write, type Settings } from './storage';
import { PlayScreen } from './ui/play';
import { chapterScreen, isUnlocked, pauseScreen, resultsScreen, settingsScreen, titleScreen } from './ui/screens';
import { TitleDemo } from './ui/title-demo';
import { Editor } from './ui/editor';
import { decodeLevel, type SharedLevel } from './ui/share';
import { parseLevel, validateLevel } from './sim/level';
import { clear, focusFirst } from './ui/dom';
import { startPadNav } from './ui/padnav';
import type { Session } from './game/session';
import { solutionFor } from './solutions';
import { Bot } from './solutions/dsl';

const app = document.getElementById('app')!;
const overlay = document.getElementById('screen')!;
const input = new Input();
let settings: Settings = loadSettings();
let progress = loadProgress();
let unlockAll = read<boolean>('ten-seconds:unlock') === true;
let play: PlayScreen | null = null;
let editor: Editor | null = null;
let demo: TitleDemo | null = null;
let lastLevelId: string | null = read<string>('ten-seconds:last');

const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const reduced = () => (settings.reducedMotion === 'auto' ? !!motionQuery?.matches : settings.reducedMotion === 'on');

audio.setVolume(settings.volume, settings.music);
audio.setMuted(!hubSoundOn());
onHubSoundChange((on) => audio.setMuted(!on));
const unlock = () => audio.unlock();
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });

/** What B / Esc does in the current menu. */
let menuBack: (() => void) | null = null;
startPadNav(
  () => (overlay.childElementCount ? (overlay.firstElementChild as HTMLElement) : null),
  () => menuBack?.(),
);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlay.childElementCount && menuBack && !(e.target as HTMLElement)?.closest?.('.pause')) {
    e.preventDefault();
    menuBack();
  }
});

function showOverlay(el: HTMLElement | null, kind: 'full' | 'over' = 'full'): void {
  menuBack = null;
  clear(overlay);
  overlay.className = el ? `screen ${kind}` : 'screen';
  if (el) {
    overlay.append(el);
    requestAnimationFrame(() => focusFirst(el));
  }
  void kind;
  input.enabled = !el;
}

function stopPlay(): void {
  if (play) {
    play.stop();
    play.root.remove();
    play = null;
  }
}

function stopEditor(): void {
  if (editor) {
    editor.stop();
    editor.root.remove();
    editor = null;
  }
}

/** Where a custom level came from: the editor (back goes there) or a shared link. */
let customFrom: 'editor' | 'link' | null = null;
let customShared: SharedLevel | null = null;

function toEditor(initial?: SharedLevel | null): void {
  stopPlay();
  stopDemo();
  stopEditor();
  showOverlay(null);
  input.enabled = false;
  history.replaceState(null, '', location.pathname + location.search);
  editor = new Editor({
    initial: initial ?? null,
    onExit: () => {
      stopEditor();
      toTitle();
    },
    onTest: (lv) => {
      customFrom = 'editor';
      customShared = editor ? editor.shared() : null;
      stopEditor();
      startLevel(lv);
    },
  });
  app.prepend(editor.root);
  editor.start();
}

/** Back from a custom level: to the editor (with the same level) or the title. */
function leaveCustom(): void {
  if (customFrom === 'editor' || customFrom === 'link') toEditor(customShared);
  else toTitle();
}

function stopDemo(): void {
  demo?.stop();
  demo = null;
}

// ---------- screens ----------

function toTitle(): void {
  stopPlay();
  stopEditor();
  customFrom = null;
  history.replaceState(null, '', location.pathname + location.search);
  const next = continueLevel();
  const el = titleScreen({
    continueLabel: next && Object.keys(progress.best).length ? `Continue: ${next.id} ${next.name}` : 'Start the first heist',
    onPlay: () => next && startLevel(next),
    onChapters: toChapters,
    onEditor: () => toEditor(),
    onSettings: () => toSettings(toTitle),
    hasEditor: true,
  });
  showOverlay(el);
  menuBack = null;
  stopDemo();
  demo = new TitleDemo(el);
  demo.start();
}

function continueLevel(): Level | undefined {
  const flat = CHAPTERS.flatMap((c) => c.levels);
  if (lastLevelId) {
    const last = levelById(lastLevelId);
    if (last && !progress.best[last.id]) return last;
    if (last) {
      const n = nextLevel(last.id);
      if (n) return n;
    }
  }
  return flat.find((l) => !progress.best[l.id]) ?? flat[0];
}

function toChapters(focusId?: string): void {
  stopPlay();
  stopEditor();
  stopDemo();
  history.replaceState(null, '', location.pathname + location.search);
  showOverlay(chapterScreen({ progress, unlockAll, onLevel: startLevel, onBack: toTitle, focusId: focusId ?? lastLevelId ?? undefined }));
  menuBack = toTitle;
}

function toSettings(back: () => void): void {
  const inLevel = !!play;
  showOverlay(
    settingsScreen({
      settings,
      unlockAll,
      inLevel,
      onChange: (s) => {
        settings = s;
        saveSettings(s);
        audio.setVolume(s.volume, s.music);
        play?.setColorblind(s.colorblind);
        play?.setShowPaths(s.paths);
      },
      onUnlockAll: (on) => {
        unlockAll = on;
        write('ten-seconds:unlock', on);
      },
      onBack: back,
    }),
    inLevel ? 'over' : 'full',
  );
  menuBack = back;
}

function startLevel(lv: Level): void {
  if (!isUnlocked(lv.id, progress, unlockAll) && !lv.id.startsWith('custom')) return;
  stopPlay();
  stopDemo();
  showOverlay(null);
  lastLevelId = lv.id;
  write('ten-seconds:last', lv.id);
  if (!lv.id.startsWith('custom')) {
    customFrom = null;
    history.replaceState(null, '', `#play=${lv.id}`);
  }
  play = new PlayScreen({
    level: lv,
    difficulty: settings.difficulty,
    input,
    colorblind: settings.colorblind,
    reduced,
    showPaths: settings.paths,
    onWin: (s, replay) => onWin(lv, s, replay),
    onPause: () => pause(lv),
    onPathsToggle: (on) => {
      settings.paths = on;
      saveSettings(settings);
    },
  });
  app.prepend(play.root);
  input.enabled = true;
  input.clear();
  play.start();
}

function pause(lv: Level): void {
  if (!play) return;
  play.setPaused(true);
  const resume = () => {
    showOverlay(null);
    play?.setPaused(false);
  };
  const el = pauseScreen({
    level: lv,
    onResume: resume,
    onRestart: () => startLevel(lv),
    onSettings: () => toSettings(() => pause(lv)),
    onLevels: () => (lv.id.startsWith('custom') ? leaveCustom() : toChapters(lv.id)),
    onTitle: toTitle,
    levelsLabel: lv.id.startsWith('custom') ? (customFrom === 'editor' ? 'Back to the editor' : 'Open in the editor') : 'Heists',
  });
  showOverlay(el, 'over');
  menuBack = resume;
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      resume();
    }
  });
}

function onWin(lv: Level, s: Session, replay: () => void): void {
  const r = s.result!;
  const isCustom = lv.id.startsWith('custom');
  const prev = progress.best[lv.id];
  const entry = { loops: r.loops, time: r.time, par: r.par, clean: r.clean, swift: r.swift };
  const best = mergeBest(prev, entry);
  const isNewBest = !prev || r.loops < prev.loops || (r.loops === prev.loops && r.time < prev.time - 1e-6);
  if (!isCustom) {
    progress.best[lv.id] = best;
    saveProgress(progress);
  }
  const next = isCustom ? undefined : nextLevel(lv.id);
  showOverlay(
    resultsScreen({
      level: lv,
      result: r,
      best,
      isNewBest,
      hasNext: !!next,
      onRetry: () => startLevel(lv),
      onNext: () => next && startLevel(next),
      onWatch: () => {
        showOverlay(null);
        input.enabled = true;
        replay();
      },
      onLevels: () => (isCustom ? leaveCustom() : toChapters(lv.id)),
      levelsLabel: isCustom ? (customFrom === 'editor' ? 'Back to the editor' : 'Open in the editor') : 'Heists',
    }),
    'over',
  );
}

window.addEventListener('resize', () => play?.resize());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && play && overlay.childElementCount === 0 && play.session.phase === 'recording') play.requestPause();
});

function toast(text: string): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3600);
}

// ---------- boot ----------

function boot(): void {
  const share = location.hash.match(/^#level=([A-Za-z0-9_-]+)$/);
  if (share) {
    void decodeLevel(share[1]).then((sh) => {
      const lv = sh ? parseLevel('custom', sh.text, sh.json) : null;
      if (!sh || !lv || validateLevel(lv).length) {
        toTitle();
        toast("That level link doesn't work: it may be cut short.");
        return;
      }
      customFrom = 'link';
      customShared = sh;
      startLevel(lv);
      history.replaceState(null, '', location.pathname + location.search + location.hash);
    });
    return;
  }
  const m = location.hash.match(/^#play=(\d-(?:\d|F))$/);
  const lv = m ? levelById(m[1]) : undefined;
  if (lv && isUnlocked(lv.id, progress, unlockAll)) startLevel(lv);
  else toTitle();
}

// the test hook (automated browser checks)
(window as unknown as { __tenSeconds: unknown }).__tenSeconds = {
  get play() {
    return play;
  },
  levels: LEVELS,
  audio,
  startLevel: (id: string) => {
    const lv = levelById(id);
    if (lv) startLevel(lv);
  },
  /** play loop `k` of the current level's solution (0-based) */
  autoplay: (k: number) => {
    const sol = play && solutionFor(play.session.lv.id);
    if (!play || !sol || !sol.loops[k]) return false;
    const bot = new Bot(sol.loops[k], play.session.lv);
    play.autopilot = (w) => bot.input(w);
    return true;
  },
  manual: () => {
    if (play) play.autopilot = null;
  },
};

boot();
