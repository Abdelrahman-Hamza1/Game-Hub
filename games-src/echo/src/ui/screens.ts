/** Menu screens (brief §5.2): title, chapter select, settings, pause, results. */
import { CHAPTERS, LEVELS, type LevelEntry } from '../levels';
import { DIFFICULTIES, type DifficultyId } from '../game/difficulty';
import { RANK_INFO, formatTime } from '../game/scoring';
import type { LevelBest, Progress, Rank, Settings } from '../storage';
import { el } from './dom';

// ---------------------------------------------------------------- progress helpers

/** One level unlocks the next, straight through all chapters. */
export function isUnlocked(progress: Progress, entry: LevelEntry): boolean {
  const i = LEVELS.indexOf(entry);
  if (i <= 0) return true;
  return progress.done.includes(LEVELS[i - 1].id) || progress.done.includes(entry.id);
}

/** Where "Play" goes: the first unlocked level not yet done, else the last level. */
export function continueLevel(progress: Progress): LevelEntry {
  return LEVELS.find((l) => !progress.done.includes(l.id) && isUnlocked(progress, l)) ?? LEVELS[LEVELS.length - 1];
}

function rankChips(ranks: Rank[] | undefined, compact = false): HTMLElement {
  const wrap = el('span', { class: 'ranks' + (compact ? ' compact' : '') });
  for (const r of ['ghost', 'guide', 'survivor'] as Rank[]) {
    const on = !!ranks?.includes(r);
    wrap.append(el('span', {
      class: `rank rank-${r}${on ? ' on' : ''}`,
      title: `${RANK_INFO[r].label}: ${RANK_INFO[r].how}${on ? '' : ' (not yet)'}`,
      'aria-label': `${RANK_INFO[r].label}${on ? ' earned' : ' not earned'}`,
      text: compact ? RANK_INFO[r].label[0] : RANK_INFO[r].label,
    }));
  }
  return wrap;
}

// ---------------------------------------------------------------- title

export interface TitleActions {
  play(): void;
  chapters(): void;
  editor(): void;
  settings(): void;
}

export function titleScreen(progress: Progress, a: TitleActions): HTMLElement {
  const next = continueLevel(progress);
  const started = progress.done.length > 0;
  const playLabel = started ? `Continue · ${next.id} ${next.meta.name}` : 'Play';
  return el('div', { class: 'overlay clear title-screen' },
    el('div', { class: 'title-block' },
      el('h1', { class: 'logo', text: 'ECHO' }),
      el('p', { class: 'tagline', text: 'Sound is how you see. Sound is how you’re found.' }),
      el('div', { class: 'menu' },
        el('button', { class: 'btn primary big', type: 'button', onclick: () => a.play(), text: playLabel }),
        el('button', { class: 'btn', type: 'button', onclick: () => a.chapters(), text: 'Chapters' }),
        el('button', { class: 'btn', type: 'button', onclick: () => a.editor(), text: 'Level editor' }),
        el('button', { class: 'btn', type: 'button', onclick: () => a.settings(), text: 'Settings' })),
      el('p', { class: 'title-foot' },
        'Headphones recommended. ',
        el('span', { class: 'kbd', text: 'WASD' }), ' move · ',
        el('span', { class: 'kbd', text: 'Space' }), ' clap · ',
        el('span', { class: 'kbd', text: 'Shift' }), ' sneak')));
}

// ---------------------------------------------------------------- chapter select

export function chapterScreen(progress: Progress, onPick: (e: LevelEntry) => void, onBack: () => void): HTMLElement {
  const done = progress.done.length;
  const chapters = CHAPTERS.map((ch) => {
    const levels = LEVELS.filter((l) => l.chapter === ch.n);
    const finished = levels.filter((l) => progress.done.includes(l.id)).length;
    return el('section', { class: 'chapter' },
      el('div', { class: 'chapter-head' },
        el('p', { class: 'eyebrow', text: `Chapter ${ch.n}` }),
        el('h3', { text: ch.name }),
        el('p', { class: 'muted', text: ch.blurb }),
        el('span', { class: 'chapter-count', text: levels.length ? `${finished}/${levels.length}` : 'Coming soon' })),
      el('div', { class: 'level-grid' },
        levels.map((l) => {
          const open = isUnlocked(progress, l);
          const best = progress.best[l.id];
          return el('button', {
            class: 'level-tile' + (open ? '' : ' locked') + (best ? ' done' : ''),
            type: 'button',
            disabled: !open,
            'aria-label': `${l.id} ${l.meta.name}${open ? '' : ' (locked)'}`,
            onclick: () => onPick(l),
          },
            el('span', { class: 'lt-no', text: String(l.number).padStart(2, '0') }),
            el('span', { class: 'lt-name', text: open ? l.meta.name : 'Locked' }),
            best ? rankChips(best.ranks, true) : el('span', { class: 'lt-sub', text: open ? 'Not played' : 'Finish the one before' }));
        })));
  });
  return el('div', { class: 'overlay scroll' },
    el('div', { class: 'card wide' },
      el('div', { class: 'card-top' },
        el('div', {},
          el('p', { class: 'eyebrow', text: `${done} of ${LEVELS.length} levels escaped` }),
          el('h2', { text: 'Chapters' })),
        el('button', { class: 'btn', type: 'button', onclick: () => onBack(), text: 'Back' })),
      el('p', { class: 'muted legend' }, 'Ranks: ', rankChips(['ghost', 'guide', 'survivor'], false), ' Ghost = never heard · Guide = every tourist out · Survivor = escaped'),
      chapters));
}

// ---------------------------------------------------------------- settings

export function settingsScreen(settings: Settings, onChange: (s: Settings) => void, onBack: () => void): HTMLElement {
  const s = { ...settings };
  const commit = () => onChange({ ...s });
  const toggle = (key: 'captions' | 'shake' | 'highContrast' | 'muted', label: string, help: string) => {
    const id = 'set-' + key;
    const input = el('input', { type: 'checkbox', id, role: 'switch' }) as HTMLInputElement;
    input.checked = s[key];
    input.addEventListener('change', () => { s[key] = input.checked; commit(); });
    return el('label', { class: 'setting toggle', for: id }, el('span', {}, el('b', { text: label }), el('small', { text: help })), input);
  };
  const vol = el('input', { type: 'range', id: 'set-volume', min: 0, max: 100, step: 1, 'aria-label': 'Master volume' }) as HTMLInputElement;
  vol.value = String(Math.round(s.volume * 100));
  const volOut = el('output', { for: 'set-volume', text: vol.value + '%' });
  vol.addEventListener('input', () => { s.volume = Number(vol.value) / 100; volOut.textContent = vol.value + '%'; commit(); });

  const diffs = (Object.keys(DIFFICULTIES) as DifficultyId[]).map((id) => {
    const d = DIFFICULTIES[id];
    const input = el('input', { type: 'radio', name: 'difficulty', id: 'diff-' + id, value: id }) as HTMLInputElement;
    input.checked = s.difficulty === id;
    input.addEventListener('change', () => { if (input.checked) { s.difficulty = id; commit(); } });
    return el('label', { class: 'diff', for: 'diff-' + id }, input, el('span', {}, el('b', { text: d.label }), el('small', { text: d.blurb })));
  });

  const rows: [string, string, string, string][] = [
    ['Move', 'WASD / arrows', 'Left stick', 'Hold a finger where to walk'],
    ['Sneak', 'Hold Shift', 'Hold LT', 'Sneak button (toggle)'],
    ['Tongue click (cone ahead)', 'F', 'X', 'Click button'],
    ['Clap (all around)', 'Space', 'A', 'Clap button'],
    ['Throw a stone', 'Mouse click', 'RT (+ right stick to aim)', 'Quick tap where to throw'],
    ['Cane tap (very quiet)', 'Q', 'B', 'Cane button'],
    ['Hold hand / pick up / push cart', 'E', 'Y', 'Hand button'],
    ['Pause', 'Esc', 'Start', 'Pause button'],
    ['Retry', 'R', 'Back / Select', 'Retry in the pause menu'],
  ];
  return el('div', { class: 'overlay scroll' },
    el('div', { class: 'card wide' },
      el('div', { class: 'card-top' },
        el('h2', { text: 'Settings' }),
        el('button', { class: 'btn', type: 'button', onclick: () => onBack(), text: 'Done' })),
      el('fieldset', { class: 'group' }, el('legend', { text: 'Difficulty' }), el('div', { class: 'diffs' }, diffs),
        el('small', { class: 'muted', text: 'Applies from the next level start.' })),
      el('fieldset', { class: 'group' }, el('legend', { text: 'Sound' }),
        el('label', { class: 'setting', for: 'set-volume' }, el('span', {}, el('b', { text: 'Master volume' })), el('span', { class: 'vol' }, vol, volOut)),
        toggle('muted', 'Mute', 'Silence everything.'),
        toggle('captions', 'Captions', 'Show important sounds at the screen edge, pointing toward them.')),
      el('fieldset', { class: 'group' }, el('legend', { text: 'Display' }),
        toggle('shake', 'Screen shake', 'A small shake on claps and crashes.'),
        toggle('highContrast', 'High contrast', 'Brighter echoes and floor dots.'),
        el('small', { class: 'muted', text: 'Reduced motion follows your system setting: no shake or flashing.' })),
      el('fieldset', { class: 'group' }, el('legend', { text: 'Controls' }),
        el('div', { class: 'table-wrap' },
          el('table', { class: 'controls' },
            el('thead', {}, el('tr', {}, ...['Action', 'Keyboard & mouse', 'Gamepad', 'Touch'].map((h) => el('th', { text: h })))),
            el('tbody', {}, rows.map((r) => el('tr', {}, ...r.map((c, i) => (i === 0 ? el('th', { scope: 'row', text: c }) : el('td', { text: c })))))))))));
}

// ---------------------------------------------------------------- pause

export interface PauseActions {
  resume(): void;
  restart(): void;
  settings(): void;
  quit(): void;
}

export function pauseScreen(name: string, hint: string, quitLabel: string, a: PauseActions): HTMLElement {
  return el('div', { class: 'overlay' },
    el('div', { class: 'card' },
      el('p', { class: 'eyebrow', text: 'Paused' }),
      el('h2', { text: name }),
      hint ? el('p', { text: hint }) : null,
      el('div', { class: 'menu' },
        el('button', { class: 'btn primary', type: 'button', onclick: () => a.resume(), text: 'Resume' }),
        el('button', { class: 'btn', type: 'button', onclick: () => a.restart(), text: 'Restart' }),
        el('button', { class: 'btn', type: 'button', onclick: () => a.settings(), text: 'Settings' }),
        el('button', { class: 'btn', type: 'button', onclick: () => a.quit(), text: quitLabel }))));
}

// ---------------------------------------------------------------- results

export interface ResultsActions {
  retry(): void;
  next: (() => void) | null;
  back(): void;
  backLabel: string;
}

export function resultsScreen(name: string, r: LevelBest, prev: LevelBest | undefined, par: number, a: ResultsActions): HTMLElement {
  const better = (now: number, before: number | undefined, lower = true) =>
    before === undefined ? false : lower ? now < before : now > before;
  const stat = (value: string, label: string, best: string | null, isNew: boolean) =>
    el('div', { class: 'stat' + (isNew ? ' new' : '') },
      el('b', { text: value }),
      el('span', { text: label }),
      best ? el('span', { class: 'best', text: isNew ? 'New best' : `Best ${best}` }) : null);
  const ranks = (['ghost', 'guide', 'survivor'] as Rank[]).map((k) => {
    const on = r.ranks.includes(k);
    const unavailable = k === 'guide' && r.total === 0;
    return el('div', { class: `rank-card rank-${k}${on ? ' on' : ''}` },
      el('b', { text: RANK_INFO[k].label }),
      el('small', { text: unavailable ? 'No tourists here' : on ? RANK_INFO[k].how : k === 'ghost' ? `${r.alerts} alert${r.alerts === 1 ? '' : 's'}` : `${r.rescued}/${r.total} tourists` }));
  });
  return el('div', { class: 'overlay' },
    el('div', { class: 'card' },
      el('p', { class: 'eyebrow', text: 'Escaped' }),
      el('h2', { text: name }),
      el('div', { class: 'rank-row' }, ranks),
      el('div', { class: 'stats' },
        stat(formatTime(r.time), r.time <= par ? `Time · under par ${formatTime(par)}` : `Time · par ${formatTime(par)}`, prev ? formatTime(prev.time) : null, better(r.time, prev?.time)),
        stat(String(r.sounds), 'Sounds made', prev ? String(prev.sounds) : null, better(r.sounds, prev?.sounds)),
        stat(String(r.alerts), 'Alerts', prev ? String(prev.alerts) : null, better(r.alerts, prev?.alerts)),
        stat(r.total ? `${r.rescued}/${r.total}` : '—', 'Tourists', prev && r.total ? `${prev.rescued}/${prev.total}` : null, better(r.rescued, prev?.rescued, false))),
      el('div', { class: 'menu row' },
        a.next ? el('button', { class: 'btn primary', type: 'button', onclick: () => a.next!(), text: 'Next level' }) : null,
        el('button', { class: 'btn' + (a.next ? '' : ' primary'), type: 'button', onclick: () => a.retry(), text: 'Retry' }),
        el('button', { class: 'btn', type: 'button', onclick: () => a.back(), text: a.backLabel }))));
}

/** Focus the first button of a freshly shown screen, for keyboard and gamepad users. */
export function focusFirst(root: HTMLElement): void {
  const b = root.querySelector<HTMLElement>('button:not([disabled]), input, select');
  b?.focus({ preventScroll: true });
}
