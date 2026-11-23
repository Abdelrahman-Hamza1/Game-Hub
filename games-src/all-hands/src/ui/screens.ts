/** Menus, built as DOM to match the "All Hands · Sorbet" mock-ups. */
import { LEVELS, WORLDS, worldLevels } from '../levels';
import { PLAYER, PLAYER_TEXT } from '../render/palette';
import { loadProgress, unlocked, type Settings } from '../storage';
import { DEVICE_KEYS } from '../input/input';
import { fmtTime, h } from './dom';

export interface SlotView {
  name: string;
  device: string;
  keys: string;
  online: boolean;
}

// ───────────────────────── title ─────────────────────────

export function titleScreen(o: {
  demo: HTMLCanvasElement;
  cont: string;
  cleared: number;
  online: string | null;
  onLocal(): void;
  onPractice(): void;
  onLevels(): void;
  onSettings(): void;
}): HTMLElement {
  return h(
    'div',
    { class: 'screen title' },
    h('div', { class: 'title-demo' }, o.demo),
    h(
      'div',
      { class: 'title-copy' },
      h('p', { class: 'kicker' }, 'A co-op platformer for four'),
      h('h1', { class: 'logo' }, 'All Hands'),
      h('p', { class: 'tagline' }, 'One key, one door, four friends.', h('br'), 'The level clears when everyone is home.'),
      h(
        'nav',
        { class: 'menu', 'aria-label': 'Main menu' },
        h('button', { class: 'pill primary', onclick: o.onLocal }, 'Play on this computer'),
        o.online ? h('a', { class: 'pill', href: o.online, target: '_top' }, 'Play online') : null,
        h('button', { class: 'pill', onclick: o.onLevels }, 'Levels'),
        h('button', { class: 'pill', onclick: o.onPractice }, 'Practice alone'),
        h('button', { class: 'pill', onclick: o.onSettings }, 'Settings'),
      ),
      h('p', { class: 'sub' }, o.cleared ? `Continue: level ${o.cont} · ${o.cleared} of ${LEVELS.length} cleared` : `${LEVELS.length} levels in six worlds. Everyone needs everyone.`),
    ),
    h('p', { class: 'join-hint' }, 'Press Jump on any keyboard, gamepad or phone to join'),
  );
}

// ───────────────────────── lobby ─────────────────────────

export function lobbyScreen(o: {
  slots: (SlotView | null)[];
  room: string | null;
  isHost: boolean;
  onLeave(i: number): void;
  onGo(): void;
  onBack(): void;
  onPractice(): void;
}): HTMLElement {
  const n = o.slots.filter(Boolean).length;
  const cards = o.slots.map((s, i) => {
    const tag = h('span', { class: 'slot-n', style: { color: s ? PLAYER_TEXT[i] : '#b9a2ad' } }, String(i + 1));
    if (!s)
      return h(
        'div',
        { class: 'slot empty' },
        tag,
        h('span', { class: 'slot-plus', 'aria-hidden': 'true' }, '+'),
        h('b', {}, 'Press Jump to join'),
        h('span', { class: 'slot-sub' }, 'A keyboard half, a gamepad, a phone, or a friend in the room'),
      );
    return h(
      'div',
      { class: 'slot' },
      tag,
      h('span', { class: 'slot-cube hop', style: { '--c': PLAYER[i] } as unknown as Record<string, string> }, cubeEl(PLAYER[i])),
      h('b', { class: 'slot-name' }, s.name),
      h('span', { class: 'slot-sub' }, s.device, s.online ? ' · online' : ''),
      h('span', { class: 'slot-keys' }, s.keys),
      h(
        'span',
        { class: 'slot-foot' },
        h('span', { class: 'ready', style: { background: PLAYER[i], color: i === 3 ? '#3d3d5c' : '#fff' } }, 'Ready'),
        o.isHost && !s.online ? h('button', { class: 'slot-x', 'aria-label': `Remove player ${i + 1}`, onclick: () => o.onLeave(i) }, '×') : null,
      ),
    );
  });
  return h(
    'div',
    { class: 'screen lobby' },
    h(
      'header',
      { class: 'row' },
      h('div', {}, h('p', { class: 'kicker' }, 'All hands on deck'), h('h1', {}, "Who's playing?")),
      o.room
        ? h('div', { class: 'room-code' }, h('span', {}, 'Room'), h('b', {}, o.room))
        : h('button', { class: 'pill', onclick: o.onBack }, 'Back'),
    ),
    h('div', { class: 'slots' }, cards),
    h(
      'footer',
      { class: 'row' },
      h(
        'p',
        { class: 'sub' },
        'Every level needs all four. Mix freely: keyboard halves (WASD, arrows, IJKL, numpad), gamepads, phones in a room. ',
        !o.room ? h('button', { class: 'linkish', onclick: o.onPractice }, 'Alone? Practice and switch between all four.') : null,
      ),
      !o.isHost
        ? h('span', { class: 'waiting' }, 'The host starts the game')
        : n === 4
          ? h('button', { class: 'pill primary big', onclick: o.onGo }, "Everyone's here. Let's go")
          : h('span', { class: 'waiting', role: 'status' }, n === 3 ? 'Waiting for 1 more friend' : `Waiting for ${4 - n} more friends`),
    ),
  );
}

export function cubeEl(color: string, size = 120): HTMLElement {
  // the same 12×12 cube as the game, drawn with CSS pixels via an SVG
  const map = ['............', '..BBBBBBBB..', '.BBBBBBBBBB.', '.BBBBBBBBBB.', '.BBBBBDBBDB.', '.BBBBBDBBDB.', '.BBBBBBBBBB.', '.BBBBBBBBBB.', '.SBBBBBBBBB.', '.SSBBBBBBBB.', '..BBBBBBBB..', '..DD....DD..'];
  const paths: Record<string, string> = { B: '', S: '', D: '' };
  map.forEach((row, y) => [...row].forEach((c, x) => c !== '.' && (paths[c] += `M${x} ${y}h1v1h-1z`)));
  const n = parseInt(color.slice(1), 16);
  const sh = `rgb(${(((n >> 16) & 255) * 0.82) | 0},${(((n >> 8) & 255) * 0.82) | 0},${((n & 255) * 0.82) | 0})`;
  const wrap = h('span', { class: 'cube', style: { width: `${size}px`, height: `${size}px` } });
  wrap.innerHTML = `<svg viewBox="0 0 12 12" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true"><path d="${paths.S}" fill="${sh}"/><path d="${paths.B}" fill="${color}"/><path d="${paths.D}" fill="#2b2b3a"/></svg>`;
  return wrap;
}

// ───────────────────────── level select ─────────────────────────

export function levelsScreen(o: { world: number; selected: string; canPick: boolean; onWorld(n: number): void; onSelect(id: string): void; onPlay(id: string): void; onBack(): void; settings: Settings }): HTMLElement {
  const best = loadProgress().best;
  const cleared = LEVELS.filter((l) => best[l.id]).length;
  const tabs = WORLDS.map((w) => {
    const open = unlocked(`${w.n}-1`, o.settings);
    return h(
      'button',
      { class: 'tab' + (w.n === o.world ? ' on' : '') + (open ? '' : ' locked'), 'aria-current': w.n === o.world ? 'page' : null, onclick: () => open && o.onWorld(w.n), disabled: !open },
      h('span', { class: 'dot', style: { background: open ? w.color : '#cdbfc6' } }),
      `${w.n}  ${w.name}`,
      open ? '' : '  ·  locked',
    );
  });
  const levels = worldLevels(o.world);
  const sel = LEVELS.find((l) => l.id === o.selected) ?? levels[0];
  const tiles = levels.map((l) => {
    const open = unlocked(l.id, o.settings);
    const b = best[l.id];
    return h(
      'button',
      {
        class: 'lvl' + (l.id === sel.id ? ' on' : '') + (open ? '' : ' locked'),
        'aria-label': `Level ${l.id}, ${open ? l.name : 'locked'}${b ? ', cleared' : ''}`,
        onclick: () => open && o.onSelect(l.id),
        ondblclick: () => open && o.canPick && o.onPlay(l.id),
        disabled: !open,
      },
      h('span', { class: 'lvl-n' }, String(l.index)),
      h('span', { class: 'lvl-name' }, open ? l.name : 'Locked'),
      h(
        'span',
        { class: 'medals' },
        b ? [h('span', { class: 'm crown', title: 'Cleared' }), h('span', { class: 'm fast' + (b.fast ? ' got' : ''), title: 'Fast medal' }), h('span', { class: 'm nopop' + (b.noPop ? ' got' : ''), title: 'Nobody fell' })] : null,
      ),
    );
  });
  const sb = best[sel.id];
  const w = WORLDS[o.world - 1];
  return h(
    'div',
    { class: 'screen levels' },
    h('header', { class: 'row' }, h('h1', {}, 'Levels'), h('div', { class: 'row gap' }, h('span', { class: 'sub-pill' }, `${cleared} of ${LEVELS.length} cleared`), h('button', { class: 'pill', onclick: o.onBack }, 'Back'))),
    h('nav', { class: 'tabs', 'aria-label': 'Worlds' }, tabs),
    h(
      'div',
      { class: 'levels-body' },
      h('section', { class: 'grid', 'aria-label': `World ${w.n}, ${w.name}` }, tiles),
      h(
        'aside',
        { class: 'panel', 'aria-label': 'Selected level' },
        h('p', { class: 'kicker' }, `Level ${sel.id}`),
        h('h2', {}, sel.name),
        h('p', { class: 'sub' }, sel.hint),
        h('p', { class: 'world-blurb' }, `${w.name}: ${w.blurb}`),
        h(
          'dl',
          { class: 'stats' },
          h('div', {}, h('dt', {}, 'Best time'), h('dd', {}, sb ? fmtTime(sb.time) : '—')),
          h('div', {}, h('dt', {}, 'Fast medal under'), h('dd', {}, fmtTime(sel.par))),
        ),
        o.canPick ? h('button', { class: 'pill primary big', onclick: () => o.onPlay(sel.id) }, `Play ${sel.id}`) : h('p', { class: 'waiting' }, 'The host picks the level'),
      ),
    ),
  );
}

// ───────────────────────── settings ─────────────────────────

export function settingsScreen(o: { s: Settings; onChange(s: Settings): void; onBack(): void }): HTMLElement {
  const s = { ...o.s };
  const slider = (label: string, key: 'volume' | 'music') =>
    h(
      'label',
      { class: 'set-row' },
      h('span', {}, label),
      h('input', {
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        value: s[key],
        oninput: (e: Event) => {
          s[key] = Number((e.target as HTMLInputElement).value);
          o.onChange({ ...s });
        },
      }),
    );
  const motion = h(
    'select',
    {
      onchange: (e: Event) => {
        s.reducedMotion = (e.target as HTMLSelectElement).value as Settings['reducedMotion'];
        o.onChange({ ...s });
      },
    },
    ...(['auto', 'on', 'off'] as const).map((v) => h('option', { value: v, selected: s.reducedMotion === v }, v === 'auto' ? 'Follow the system' : v === 'on' ? 'Reduce' : 'Full')),
  );
  return h(
    'div',
    { class: 'screen settings' },
    h('header', { class: 'row' }, h('h1', {}, 'Settings'), h('button', { class: 'pill', onclick: o.onBack }, 'Back')),
    h(
      'div',
      { class: 'panel set' },
      slider('Sound', 'volume'),
      slider('Music', 'music'),
      h('label', { class: 'set-row' }, h('span', {}, 'Motion'), motion),
      h(
        'label',
        { class: 'set-row' },
        h('span', {}, 'Open every level'),
        h('input', {
          type: 'checkbox',
          checked: s.unlockAll,
          onchange: (e: Event) => {
            s.unlockAll = (e.target as HTMLInputElement).checked;
            o.onChange({ ...s });
          },
        }),
      ),
      h('h2', {}, 'Controls'),
      h(
        'ul',
        { class: 'keys' },
        (['kb1', 'kb2', 'kb3', 'kb4', 'pad0', 'touch'] as const).map((d) => h('li', {}, h('b', {}, d === 'pad0' ? 'Gamepad' : d === 'touch' ? 'Phone' : d === 'kb1' ? 'Keyboard left' : d === 'kb2' ? 'Keyboard right' : d === 'kb3' ? 'Keyboard middle' : 'Numpad'), ' ', DEVICE_KEYS[d])),
        h('li', {}, h('b', {}, 'Everyone'), ' Esc or Start pauses. Quick chat: Q, ., U, numpad 7, or Y on a gamepad.'),
      ),
    ),
  );
}

// ───────────────────────── overlays ─────────────────────────

export function pauseOverlay(o: { by: string; hint: string; votes: number; needed: number; online: boolean; onResume(): void; onRestart(): void; onLevels(): void; onSettings(): void; controls: { name: string; keys: string }[] }): HTMLElement {
  return h(
    'div',
    { class: 'overlay dim' },
    h(
      'section',
      { class: 'card pause', 'aria-label': 'Paused' },
      h('p', { class: 'kicker ink' }, `Paused by ${o.by}`),
      h('h1', {}, 'Breather'),
      h('button', { class: 'row-btn primary', onclick: o.onResume, autofocus: true }, 'Keep playing'),
      h('button', { class: 'row-btn', onclick: o.onRestart }, 'Restart level', o.online ? h('span', { class: 'note' }, `${o.votes} of ${o.needed} votes`) : null),
      h('button', { class: 'row-btn', onclick: o.onLevels }, 'Levels'),
      h('p', { class: 'sub' }, h('b', {}, 'Hint: '), o.hint),
    ),
    h(
      'section',
      { class: 'card controls', 'aria-label': 'Controls' },
      h('h2', {}, 'Controls'),
      h(
        'ul',
        { class: 'keys' },
        o.controls.map((c, i) => h('li', {}, h('b', { style: { color: PLAYER_TEXT[i] } }, `${i + 1} ${c.name}`), ' ', c.keys)),
      ),
      h(
        'div',
        { class: 'tips' },
        h('div', {}, h('b', {}, 'Stand on friends'), 'Everyone is solid. A head is a step.'),
        h('div', {}, h('b', {}, 'Grab a friend'), 'Grab picks up what is beside you; Grab again throws it.'),
        h('div', {}, h('b', {}, 'Into the door'), 'Bring the key to the door, then everyone presses Down at it.'),
      ),
    ),
  );
}

export function clearOverlay(o: { id: string; name: string; time: number; par: number; pops: number; best: boolean; ready: boolean[]; names: string[]; hasNext: boolean; canPick: boolean; onNext(): void; onAgain(): void; onLevels(): void }): HTMLElement {
  const fast = o.time <= o.par;
  return h(
    'div',
    { class: 'overlay soft' },
    h('div', { class: 'cheer', 'aria-hidden': 'true' }, PLAYER.map((c, i) => h('span', { class: `cheer-${i}` }, cubeEl(c, 72)))),
    h(
      'section',
      { class: 'card clear', 'aria-label': 'Level cleared' },
      h('p', { class: 'kicker' }, `${o.id} · ${o.name}`),
      h('h1', {}, "Everyone's home!"),
      h(
        'div',
        { class: 'tiles' },
        h('div', {}, h('span', {}, 'Time'), h('b', {}, fmtTime(o.time)), h('em', { class: o.best ? 'good' : '' }, o.best ? 'New best' : ' ')),
        h('div', {}, h('span', {}, 'Fast medal'), h('b', { class: fast ? 'good' : 'dim' }, fmtTime(o.par)), h('em', {}, fast ? 'Earned' : `${Math.ceil(o.time - o.par)} s off`)),
        h('div', {}, h('span', {}, 'Nobody fell'), h('b', { class: o.pops ? 'dim' : 'good' }, o.pops ? `${o.pops} fell` : 'Yes'), h('em', {}, o.pops ? 'Next time' : 'Earned')),
      ),
      h(
        'div',
        { class: 'row' },
        h('div', { class: 'row gap' }, o.canPick ? h('button', { class: 'pill soft', onclick: o.onAgain }, 'Play again') : null, o.canPick ? h('button', { class: 'pill soft', onclick: o.onLevels }, 'Levels') : null),
        o.canPick
          ? h(
              'button',
              { class: 'pill primary big', onclick: o.onNext },
              o.hasNext ? 'Next level ' : 'Back to levels ',
              h(
                'span',
                { class: 'ready-pips', 'aria-label': `${o.ready.filter(Boolean).length} of 4 ready` },
                o.ready.map((r, i) => h('span', { style: { background: r ? PLAYER[i] : 'transparent', borderColor: PLAYER[i] } })),
              ),
            )
          : h('span', { class: 'waiting' }, 'Press Jump when you are ready'),
      ),
      h('p', { class: 'sub right' }, 'Everyone presses Jump to go on', o.ready.some((r) => !r) ? `: waiting for ${o.names.filter((_, i) => !o.ready[i]).join(', ')}` : ''),
    ),
  );
}
