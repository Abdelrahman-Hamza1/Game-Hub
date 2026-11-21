/** Menus: title, chapter map, pause, results, settings. Plain DOM, keyboard and gamepad friendly. */
import { DIFFICULTY, type DifficultyId } from '../game/difficulty';
import type { WinResult } from '../game/session';
import { CHAPTERS, type Chapter } from '../levels';
import type { Level } from '../sim/level';
import type { LevelBest, Progress, Settings } from '../storage';
import { h } from './dom';
import { levelThumb } from '../render/thumb';

export function rankBadges(b: Pick<LevelBest, 'par' | 'clean' | 'swift'> | undefined, big = false): HTMLElement {
  const el = h('span', { class: `ranks${big ? ' big' : ''}` });
  const mk = (on: boolean, key: string, label: string, title: string) => h('span', { class: `rank ${key}${on ? ' on' : ''}`, title: `${title}${on ? '' : ' (not yet)'}`, 'aria-label': `${title}${on ? ': earned' : ': not yet'}` }, label);
  el.append(mk(!!b?.par, 'par', 'P', 'Par'), mk(!!b?.clean, 'clean', 'C', 'Clean'), mk(!!b?.swift, 'swift', 'S', 'Swift'));
  return el;
}

export function isUnlocked(id: string, progress: Progress, all: boolean): boolean {
  if (all) return true;
  const flat = CHAPTERS.flatMap((c) => c.levels);
  const i = flat.findIndex((l) => l.id === id);
  if (i <= 0) return true;
  // a level opens when the one before it is done; a chapter's first level opens with the previous finale
  return !!progress.best[flat[i - 1].id] || !!progress.best[id];
}

export function titleScreen(o: { onPlay: () => void; onChapters: () => void; onEditor: () => void; onSettings: () => void; continueLabel: string; hasEditor: boolean }): HTMLElement {
  return h(
    'div',
    { class: 'menu title-screen' },
    h(
      'div',
      { class: 'logo' },
      h('div', { class: 'logo-kicker' }, 'A time-loop heist'),
      h('h1', { class: 'logo-title' }, h('span', {}, 'TEN'), h('span', { class: 'logo-secs' }, 'SECONDS')),
      h('p', { class: 'logo-tag' }, "You're the whole crew. Plan it one ten-second slice at a time, then watch every copy of you pull it off in perfect sync."),
    ),
    h(
      'div',
      { class: 'menu-buttons' },
      h('button', { class: 'btn primary', onclick: o.onPlay, autofocus: true }, o.continueLabel),
      h('button', { class: 'btn', onclick: o.onChapters }, 'Heists'),
      o.hasEditor ? h('button', { class: 'btn', onclick: o.onEditor }, 'Level editor') : null,
      h('button', { class: 'btn', onclick: o.onSettings }, 'Settings'),
    ),
    h('p', { class: 'menu-foot' }, h('kbd', {}, 'WASD'), ' move · ', h('kbd', {}, 'E'), ' use · ', h('kbd', {}, 'R'), ' retry loop · ', h('kbd', {}, 'Z'), ' delete last · ', h('kbd', {}, '1–6'), ' re-record'),
  );
}

export function chapterScreen(o: { progress: Progress; unlockAll: boolean; onLevel: (lv: Level) => void; onBack: () => void; focusId?: string }): HTMLElement {
  const wrap = h('div', { class: 'menu chapters' }, h('div', { class: 'menu-head' }, h('button', { class: 'btn ghost', onclick: o.onBack, 'aria-label': 'Back to the title' }, '← Back'), h('h2', {}, 'The heists')));
  const list = h('div', { class: 'chapter-list' });
  for (const c of CHAPTERS) list.append(chapterCard(c, o));
  wrap.append(list);
  return wrap;
}

function chapterCard(c: Chapter, o: { progress: Progress; unlockAll: boolean; onLevel: (lv: Level) => void; focusId?: string }): HTMLElement {
  const done = c.levels.filter((l) => o.progress.best[l.id]).length;
  const grid = h('div', { class: 'level-grid' });
  for (const lv of c.levels) {
    const best = o.progress.best[lv.id];
    const open = isUnlocked(lv.id, o.progress, o.unlockAll);
    const finale = lv.id.endsWith('F');
    const btn = h(
      'button',
      {
        class: `level-tile${best ? ' done' : ''}${finale ? ' finale' : ''}`,
        disabled: !open,
        'data-id': lv.id,
        autofocus: o.focusId === lv.id,
        'aria-label': `${lv.id} ${lv.name}${open ? '' : ' (locked)'}${best ? `, best ${best.loops} loops` : ''}`,
        onclick: () => o.onLevel(lv),
      },
      h('img', { class: 'lt-thumb', src: levelThumb(lv, !open), alt: '', width: lv.w * 4, height: lv.h * 4 }),
      h('span', { class: 'lt-id' }, lv.id),
      h('span', { class: 'lt-name' }, open ? lv.name : 'Locked'),
      h('span', { class: 'lt-meta' }, best ? `${best.loops} loop${best.loops === 1 ? '' : 's'} · par ${lv.par}` : `par ${lv.par}`),
      open ? rankBadges(best) : null,
    );
    grid.append(btn);
  }
  return h(
    'section',
    { class: `chapter c${c.n}` },
    h('header', {}, h('span', { class: 'ch-n' }, `Chapter ${c.n}`), h('h3', {}, c.name), h('p', {}, `${c.place}. ${c.teaches}.`), h('span', { class: 'ch-done' }, `${done}/${c.levels.length}`)),
    grid,
  );
}

export function pauseScreen(o: { level: Level; onResume: () => void; onRestart: () => void; onSettings: () => void; onLevels: () => void; onTitle: () => void; levelsLabel?: string }): HTMLElement {
  return h(
    'div',
    { class: 'menu panel pause', role: 'dialog', 'aria-label': 'Paused' },
    h('h2', {}, 'Paused'),
    h('p', { class: 'muted' }, `${o.level.id} · ${o.level.name}`),
    o.level.hint ? h('p', { class: 'pause-hint' }, o.level.hint) : null,
    h(
      'div',
      { class: 'menu-buttons' },
      h('button', { class: 'btn primary', onclick: o.onResume, autofocus: true }, 'Resume'),
      h('button', { class: 'btn', onclick: o.onRestart }, 'Restart the heist (clears every copy)'),
      h('button', { class: 'btn', onclick: o.onSettings }, 'Settings'),
      h('button', { class: 'btn', onclick: o.onLevels }, o.levelsLabel ?? 'Heists'),
      h('button', { class: 'btn ghost', onclick: o.onTitle }, 'Title'),
    ),
    controlsTable(),
  );
}

export function controlsTable(): HTMLElement {
  const rows: [string, string][] = [
    ['Move', 'WASD / arrows · stick · hold a finger on the map'],
    ['Use', 'E / Space · A · Use button'],
    ['Retry this loop', 'R · Y'],
    ['Delete the last copy', 'Z · B'],
    ['Re-record copy N', '1–6 · D-pad ↑↓ · tap its lane'],
    ['Scrub the plan', ', and . · D-pad ←→ · drag the timeline'],
    ['Trim a copy', 'drag the ends of its bar'],
    ['Plan paths', 'P'],
    ['Show the next step (Assist)', 'H · ? button'],
    ['Pause', 'Esc · Start'],
  ];
  return h('table', { class: 'controls' }, h('tbody', {}, ...rows.map(([a, b]) => h('tr', {}, h('th', {}, a), h('td', {}, b)))));
}

export function resultsScreen(o: {
  level: Level;
  result: WinResult;
  best: LevelBest;
  isNewBest: boolean;
  hasNext: boolean;
  onRetry: () => void;
  onNext: () => void;
  onWatch: () => void;
  onLevels: () => void;
  levelsLabel?: string;
}): HTMLElement {
  const r = o.result;
  const lv = o.level;
  const stat = (label: string, value: string, sub: string) => h('div', { class: 'stat' }, h('span', { class: 'stat-l' }, label), h('b', {}, value), h('small', {}, sub));
  const rank = (on: boolean, best: boolean, name: string, why: string) =>
    h('li', { class: `rank-row${on ? ' on' : ''}` }, h('span', { class: 'rank-dot' }, on ? '✓' : best ? '·' : '–'), h('b', {}, name), h('span', {}, why), best && !on ? h('small', {}, 'earned before') : null);
  return h(
    'div',
    { class: 'menu panel results', role: 'dialog', 'aria-label': 'Heist complete' },
    h('div', { class: 'res-kicker' }, `${lv.id} · ${lv.name}`),
    h('h2', {}, r.par ? 'Clean getaway' : 'Out with the goods'),
    h(
      'div',
      { class: 'stats' },
      stat('Loops', String(r.loops), `par ${lv.par}`),
      stat('Time', `${r.time.toFixed(2)} s`, `swift under ${lv.swiftTime.toFixed(1)} s`),
      stat('Best', `${o.best.loops} · ${o.best.time.toFixed(2)} s`, o.isNewBest ? 'new best' : 'loops · time'),
    ),
    h(
      'ul',
      { class: 'rank-list' },
      rank(r.par, o.best.par, 'Par', `${lv.par} loops or fewer`),
      rank(r.clean, o.best.clean, 'Clean', 'no paradox in the final plan'),
      rank(r.swift, o.best.swift, 'Swift', `the target out before ${lv.swiftTime.toFixed(1)} s`),
    ),
    h(
      'div',
      { class: 'menu-buttons row' },
      o.hasNext ? h('button', { class: 'btn primary', onclick: o.onNext, autofocus: true }, 'Next heist') : null,
      h('button', { class: 'btn', onclick: o.onRetry, autofocus: !o.hasNext }, 'Play again'),
      h('button', { class: 'btn', onclick: o.onWatch }, 'Watch the plan'),
      h('button', { class: 'btn ghost', onclick: o.onLevels }, o.levelsLabel ?? 'Heists'),
    ),
  );
}

export function settingsScreen(o: { settings: Settings; unlockAll: boolean; onChange: (s: Settings) => void; onUnlockAll: (on: boolean) => void; onBack: () => void; inLevel: boolean }): HTMLElement {
  const s = { ...o.settings };
  const save = () => o.onChange({ ...s });
  const radio = (name: string, value: string, checked: boolean, label: string, sub: string, onpick: () => void) =>
    h('label', { class: 'opt' }, h('input', { type: 'radio', name, value, checked, onchange: onpick }), h('span', {}, h('b', {}, label), h('small', {}, sub)));
  const slider = (label: string, v: number, set: (x: number) => void) =>
    h('label', { class: 'slider' }, h('span', {}, label), h('input', { type: 'range', min: 0, max: 100, value: Math.round(v * 100), oninput: (e: Event) => (set(Number((e.target as HTMLInputElement).value) / 100), save()) }));
  const check = (label: string, sub: string, v: boolean, set: (x: boolean) => void) =>
    h('label', { class: 'opt check' }, h('input', { type: 'checkbox', checked: v, onchange: (e: Event) => (set((e.target as HTMLInputElement).checked), save()) }), h('span', {}, h('b', {}, label), h('small', {}, sub)));
  const diffs = (Object.keys(DIFFICULTY) as DifficultyId[]).map((id) =>
    radio('diff', id, s.difficulty === id, DIFFICULTY[id].name, DIFFICULTY[id].blurb, () => {
      s.difficulty = id;
      save();
    }),
  );
  return h(
    'div',
    { class: 'menu panel settings', role: 'dialog', 'aria-label': 'Settings' },
    h('div', { class: 'menu-head' }, h('button', { class: 'btn ghost', onclick: o.onBack, autofocus: true }, '← Back'), h('h2', {}, 'Settings')),
    h('fieldset', {}, h('legend', {}, 'Difficulty'), ...diffs, o.inLevel ? h('small', { class: 'muted' }, 'A new difficulty applies from the next heist you start.') : null),
    h('fieldset', {}, h('legend', {}, 'Sound'), slider('Volume', s.volume, (v) => (s.volume = v)), slider('Music', s.music, (v) => (s.music = v))),
    h(
      'fieldset',
      {},
      h('legend', {}, 'Display'),
      h(
        'label',
        { class: 'slider' },
        h('span', {}, 'Reduced motion'),
        h(
          'select',
          {
            onchange: (e: Event) => {
              s.reducedMotion = (e.target as HTMLSelectElement).value as Settings['reducedMotion'];
              save();
            },
          },
          ...(['auto', 'on', 'off'] as const).map((v) => h('option', { value: v, selected: s.reducedMotion === v }, v === 'auto' ? 'Follow my system' : v === 'on' ? 'On: fades instead of streaks' : 'Off')),
        ),
      ),
      check('Colour-blind shapes', 'Each copy also gets its own shape.', s.colorblind, (v) => (s.colorblind = v)),
      check('Plan paths', 'Draw every copy\'s path on the map (P).', s.paths, (v) => (s.paths = v)),
      check('Unlock every heist', 'Skip ahead without finishing the ones before.', o.unlockAll, (v) => o.onUnlockAll(v)),
    ),
    h('fieldset', {}, h('legend', {}, 'Controls'), controlsTable()),
  );
}
