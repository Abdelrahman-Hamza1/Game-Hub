/**
 * The level editor: paint tiles from a palette, wire doors to triggers, click guard routes, set
 * the level's numbers, validate as you go, test-play, export/import the .txt + .json, and share a
 * link (#level=<code>). The draft autosaves in this browser.
 */
import { Renderer } from '../render/renderer';
import { C, FONT_MONO } from '../render/palette';
import { isDoorLetter, parseLevel, validateLevel, type DoorRule, type Level, type LevelJson, type Pt, type TriggerType } from '../sim/level';
import { World } from '../sim/world';
import { read, write } from '../storage';
import { h, clear } from './dom';
import { encodeLevel, type SharedLevel } from './share';

type Tool = 'paint' | 'select' | 'wire' | 'route';

interface Glyph {
  ch: string;
  name: string;
  group: string;
}

const GLYPHS: Glyph[] = [
  { ch: '.', name: 'Floor', group: 'Build' },
  { ch: '#', name: 'Wall', group: 'Build' },
  { ch: '-', name: 'Window', group: 'Build' },
  { ch: '_', name: 'Low wall', group: 'Build' },
  { ch: '~', name: 'Track', group: 'Build' },
  { ch: 'S', name: 'Start', group: 'Places' },
  { ch: 'E', name: 'Exit', group: 'Places' },
  { ch: 'T', name: 'Target', group: 'Items' },
  { ch: 'K', name: 'Keycard', group: 'Items' },
  { ch: 'M', name: 'Mirror', group: 'Items' },
  { ch: '$', name: 'Coin', group: 'Items' },
  { ch: 'O', name: 'Crate', group: 'Items' },
  { ch: 'R', name: 'Rewind stone', group: 'Items' },
  { ch: '*', name: 'Bell', group: 'Places' },
  ...'ABCDFGH'.split('').map((c) => ({ ch: c, name: `Door ${c}`, group: 'Doors' })),
  ...'abcdefgh'.split('').map((c) => ({ ch: c, name: `Trigger ${c}`, group: 'Triggers' })),
  { ch: '@', name: 'Guard', group: 'Threats' },
  { ch: '!', name: 'Auditor', group: 'Threats' },
  { ch: '%', name: 'Camera', group: 'Threats' },
  { ch: '=', name: 'Laser', group: 'Threats' },
  { ch: '&', name: 'Hound', group: 'Threats' },
];

type GuardProps = NonNullable<LevelJson['guards']>[number] & { wait?: number };
type CameraProps = NonNullable<LevelJson['cameras']>[number];
type LaserProps = NonNullable<LevelJson['lasers']>[number];

interface Draft {
  rows: string[];
  settings: LevelJson;
  /** per-position props for guards, auditors, cameras, lasers ("x,y") */
  props: Record<string, GuardProps | CameraProps | LaserProps>;
}

const KEY = 'ten-seconds:editor';

export interface EditorOptions {
  initial?: SharedLevel | null;
  onTest: (lv: Level) => void;
  onExit: () => void;
}

const BLANK: string[] = [
  '##############################',
  '#............................#',
  '#..S.....................T...#',
  '#............................#',
  '#EE..........................#',
  '#EE..........................#',
  '#............................#',
  '##############################',
];

export class Editor {
  readonly root: HTMLElement;
  private o: EditorOptions;
  private d: Draft;
  private canvas: HTMLCanvasElement;
  private overlay: HTMLCanvasElement;
  private renderer: Renderer;
  private world: World | null = null;
  private lv: Level | null = null;
  private tool: Tool = 'paint';
  private glyph = '#';
  private sel: { x: number; y: number } | null = null;
  private hover: [number, number] | null = null;
  private painting = false;
  private inspector: HTMLElement;
  private problems: HTMLElement;
  private palette: HTMLElement;
  private raf = 0;
  private undo: string[] = [];

  constructor(o: EditorOptions) {
    this.o = o;
    this.d = o.initial ? fromShared(o.initial) : (read<Draft>(KEY) ?? { rows: BLANK.slice(), settings: { name: 'My heist', par: 2, swiftTime: 7, hint: 'Write a hint.' }, props: {} });
    if (!Array.isArray(this.d.rows) || !this.d.rows.length) this.d = { rows: BLANK.slice(), settings: {}, props: {} };
    this.d.props ??= {};
    this.d.settings ??= {};
    this.canvas = h('canvas', { class: 'ed-map', 'aria-label': 'Level map: paint with the selected tile' });
    this.overlay = h('canvas', { class: 'ed-overlay', 'aria-hidden': 'true' });
    this.renderer = new Renderer(this.canvas);
    this.renderer.padTop = 12;
    this.palette = h('div', { class: 'ed-palette' });
    this.inspector = h('div', { class: 'ed-inspector' });
    this.problems = h('div', { class: 'ed-problems', role: 'status', 'aria-live': 'polite' });
    const stage = h('div', { class: 'ed-stage' }, this.canvas, this.overlay);
    const bar = h(
      'div',
      { class: 'ed-bar' },
      h('button', { class: 'btn ghost', onclick: () => this.o.onExit() }, '← Title'),
      this.toolButtons(),
      h('span', { class: 'ed-spacer' }),
      h('button', { class: 'btn', onclick: () => this.doUndo(), title: 'Undo (Ctrl+Z)' }, 'Undo'),
      h('button', { class: 'btn', onclick: () => this.showIO() }, 'Export / import'),
      h('button', { class: 'btn', onclick: () => void this.share() }, 'Share link'),
      h('button', { class: 'btn primary', onclick: () => this.test() }, 'Test play'),
    );
    this.root = h('div', { class: 'editor' }, bar, h('div', { class: 'ed-body' }, this.palette, stage, this.inspector), this.problems);
    this.buildPalette();
    this.bind();
    this.rebuild();
  }

  start(): void {
    const frame = () => {
      this.draw();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    window.addEventListener('keydown', this.onKey);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
  }

  /** The level as text + JSON (what Export and Share use). */
  shared(): SharedLevel {
    return { text: this.d.rows.join('\n'), json: buildJson(this.d) };
  }

  // ---------- UI ----------

  private toolButtons(): HTMLElement {
    const wrap = h('div', { class: 'ed-tools', role: 'radiogroup', 'aria-label': 'Tool' });
    const tools: [Tool, string, string][] = [
      ['paint', 'Paint', 'Paint the selected tile (right-click erases)'],
      ['select', 'Select', 'Click a door, trigger, guard, camera or laser to edit it'],
      ['wire', 'Wire', 'Click a door, then click triggers to wire or unwire them'],
      ['route', 'Route', 'Click a guard, then click tiles to add route points (right-click removes the last)'],
    ];
    for (const [t, label, title] of tools) {
      const b = h('button', { class: `btn tool${this.tool === t ? ' on' : ''}`, role: 'radio', 'aria-checked': String(this.tool === t), title, 'data-tool': t, onclick: () => this.setTool(t) }, label);
      wrap.append(b);
    }
    return wrap;
  }

  private setTool(t: Tool): void {
    this.tool = t;
    this.root.querySelectorAll<HTMLButtonElement>('.tool').forEach((b) => {
      const on = b.dataset.tool === t;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    this.renderInspector();
  }

  private buildPalette(): void {
    clear(this.palette);
    let group = '';
    let row: HTMLElement | null = null;
    for (const g of GLYPHS) {
      if (g.group !== group) {
        group = g.group;
        this.palette.append(h('div', { class: 'ed-group' }, group));
        row = h('div', { class: 'ed-swatches' });
        this.palette.append(row);
      }
      row!.append(
        h(
          'button',
          {
            class: `swatch${this.glyph === g.ch ? ' on' : ''}`,
            title: `${g.name} (${g.ch})`,
            'aria-label': g.name,
            'data-ch': g.ch,
            onclick: () => {
              this.glyph = g.ch;
              this.setTool('paint');
              this.palette.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', (s as HTMLElement).dataset.ch === g.ch));
            },
          },
          h('span', { class: `sw-${swClass(g.ch)}` }, g.ch === '.' ? '·' : g.ch),
        ),
      );
    }
  }

  private renderInspector(): void {
    const el = this.inspector;
    clear(el);
    const s = this.d.settings;
    const num = (label: string, v: number | undefined, set: (n: number | undefined) => void, step = 1, min = 0) =>
      h('label', { class: 'ed-field' }, h('span', {}, label), h('input', { type: 'number', step, min, value: v ?? '', placeholder: 'default', oninput: (e: Event) => { const t = (e.target as HTMLInputElement).value; set(t === '' ? undefined : Number(t)); this.changed(false); } }));
    const txt = (label: string, v: string | undefined, set: (s: string) => void, area = false) =>
      h('label', { class: 'ed-field' }, h('span', {}, label), h(area ? 'textarea' : 'input', { value: v ?? '', rows: area ? 3 : null, oninput: (e: Event) => { set((e.target as HTMLInputElement).value); this.changed(false); } }, area ? (v ?? '') : null));
    const sel = <T extends string>(label: string, v: T, opts: T[], set: (x: T) => void) =>
      h('label', { class: 'ed-field' }, h('span', {}, label), h('select', { onchange: (e: Event) => { set((e.target as HTMLSelectElement).value as T); this.changed(true); } }, ...opts.map((o) => h('option', { value: o, selected: o === v }, o))));
    const chk = (label: string, v: boolean, set: (b: boolean) => void) =>
      h('label', { class: 'ed-field check' }, h('input', { type: 'checkbox', checked: v, onchange: (e: Event) => { set((e.target as HTMLInputElement).checked); this.changed(false); } }), h('span', {}, label));

    // the selected object
    const p = this.sel;
    const ch = p ? this.d.rows[p.y]?.[p.x] : '';
    if (p && ch && isDoorLetter(ch)) {
      const doors = (s.doors ??= {});
      const d = (doors[ch] ??= { rule: 'plate', wires: [] });
      const letters = triggerLetters(this.d.rows);
      el.append(
        h('h3', {}, `Door ${ch}`),
        sel<DoorRule>('Rule', (d.rule ?? 'plate') as DoorRule, ['plate', 'switch', 'button', 'card', 'timer', 'inverted', 'cycle'], (r) => (d.rule = r)),
        chk('Invert (open when the rule says closed)', !!d.invert, (b) => (d.invert = b || undefined)),
      );
      if (['plate', 'switch', 'button', 'inverted'].includes(d.rule ?? 'plate')) {
        el.append(h('div', { class: 'ed-sub' }, 'Wired to'), h('div', { class: 'ed-wires' }, ...(letters.length ? letters.map((l) => chk(l, (d.wires ?? []).includes(l), (on) => { d.wires = on ? [...new Set([...(d.wires ?? []), l])] : (d.wires ?? []).filter((w) => w !== l); })) : [h('small', { class: 'muted' }, 'Paint a trigger (a–h) first.')])));
      }
      if (d.rule === 'timer') el.append(num('Opens at (s)', d.open?.[0], (n) => (d.open = [n ?? 0, d.open?.[1] ?? 5]), 0.1), num('Closes at (s)', d.open?.[1], (n) => (d.open = [d.open?.[0] ?? 0, n ?? 5]), 0.1));
      if (d.rule === 'cycle') el.append(num('Period (s)', d.period, (n) => (d.period = n), 0.1), num('Open for (s)', d.openFor, (n) => (d.openFor = n), 0.1), num('Phase (s)', d.phase, (n) => (d.phase = n), 0.1));
    } else if (p && ch && ch >= 'a' && ch <= 'h') {
      const trig = (s.triggers ??= {});
      const t = (trig[ch] ??= { type: 'plate' });
      el.append(h('h3', {}, `Trigger ${ch}`), sel<TriggerType>('Type', (t.type ?? 'plate') as TriggerType, ['plate', 'switch', 'button', 'lure', 'shutter', 'lever'], (v) => (t.type = v)));
      if (t.type === 'button') el.append(num('Seconds open', t.seconds, (n) => (t.seconds = n), 0.5));
      if (t.type === 'switch') el.append(chk('Starts on', !!t.on, (b) => (t.on = b || undefined)));
      if (t.type === 'shutter') el.append(num('Camera (0 = first in reading order)', t.camera, (n) => (t.camera = n)));
      if (t.type === 'lure') el.append(h('small', { class: 'muted' }, 'Rings the first bell (*) unless you set one in the JSON.'));
    } else if (p && (ch === '@' || ch === '!')) {
      const g = (this.d.props[`${p.x},${p.y}`] ??= { route: [], mode: 'pingpong' }) as GuardProps;
      el.append(
        h('h3', {}, ch === '@' ? 'Guard' : 'Auditor'),
        h('p', { class: 'muted small' }, `Route: ${(g.route ?? []).map((q) => `[${q}]`).join(' → ') || 'none yet. Use the Route tool.'}`),
        sel<'pingpong' | 'loop'>('Mode', g.mode ?? 'pingpong', ['pingpong', 'loop'], (m) => (g.mode = m)),
        num('First point (index)', g.toward, (n) => (g.toward = n)),
        num('Pause at points (s)', g.pause, (n) => (g.pause = n), 0.1),
        num('Head start (s)', g.warmup, (n) => (g.warmup = n), 0.1),
        num('Wait before setting off (s)', g.start, (n) => (g.start = n), 0.1),
        num('Facing (degrees)', g.face, (n) => (g.face = n), 15, -360),
        ch === '!' ? num('Waits where the newest copy ended (s)', g.wait, (n) => (g.wait = n), 0.5) : '',
        h('button', { class: 'btn', onclick: () => { g.route = []; this.changed(true); } }, 'Clear route'),
      );
    } else if (p && ch === '%') {
      const c = (this.d.props[`${p.x},${p.y}`] ??= { from: 45, to: 135, period: 6 }) as CameraProps;
      el.append(h('h3', {}, 'Camera'), num('Sweeps from (deg)', c.from, (n) => (c.from = n), 5, -360), num('to (deg)', c.to, (n) => (c.to = n), 5, -360), num('Sweep period (s)', c.period, (n) => (c.period = n), 0.5), num('Phase (0–1)', c.phase, (n) => (c.phase = n), 0.05), h('small', { class: 'muted' }, '0° is right, 90° is down.'));
    } else if (p && ch === '=') {
      const l = (this.d.props[`${p.x},${p.y}`] ??= { dir: 'right' }) as LaserProps;
      el.append(h('h3', {}, 'Laser'), sel<'up' | 'down' | 'left' | 'right'>('Beam goes', l.dir ?? 'right', ['up', 'down', 'left', 'right'], (v) => (l.dir = v)), num('Blink period (s, 0 = always on)', l.period, (n) => (l.period = n), 0.5), num('On for (s)', l.on, (n) => (l.on = n), 0.5), num('Phase (s)', l.phase, (n) => (l.phase = n), 0.1));
    } else {
      el.append(h('p', { class: 'muted small' }, this.tool === 'select' ? 'Click something on the map to edit it.' : this.tool === 'wire' ? 'Click a door, then click triggers.' : this.tool === 'route' ? 'Click a guard, then click floor tiles.' : 'Pick a tile on the left and paint. Right-click erases.'));
    }

    // the level
    el.append(
      h('h3', {}, 'Level'),
      txt('Name', s.name, (v) => (s.name = v)),
      num('Par (loops)', s.par, (n) => (s.par = n), 1, 1),
      num('Swift under (s)', s.swiftTime, (n) => (s.swiftTime = n), 0.1),
      num('Loop length (s)', s.loopSeconds, (n) => (s.loopSeconds = n), 1, 1),
      num('Most copies', s.maxCopies, (n) => (s.maxCopies = n), 1, 1),
      num('Hearing (tiles)', s.hearing, (n) => (s.hearing = n), 1, 1),
      chk('Bodies collide', !!s.bodiesCollide, (b) => (s.bodiesCollide = b || undefined)),
      txt('Hint', s.hint, (v) => (s.hint = v), true),
      h(
        'div',
        { class: 'ed-size' },
        h('span', {}, `Size ${this.d.rows[0]?.length ?? 0} × ${this.d.rows.length}`),
        h('button', { class: 'btn small', onclick: () => this.resize(1, 0), title: 'Add a column' }, 'W+'),
        h('button', { class: 'btn small', onclick: () => this.resize(-1, 0), title: 'Remove a column' }, 'W−'),
        h('button', { class: 'btn small', onclick: () => this.resize(0, 1), title: 'Add a row' }, 'H+'),
        h('button', { class: 'btn small', onclick: () => this.resize(0, -1), title: 'Remove a row' }, 'H−'),
      ),
      this.advanced(),
      h('button', { class: 'btn ghost', onclick: () => this.reset() }, 'New blank level'),
    );
  }

  /** Train carriages, tunnel blackouts, lamps and the Watchmaker are edited as JSON. */
  private advanced(): HTMLElement {
    const s = this.d.settings;
    const pick = { carriages: s.carriages, blackouts: s.blackouts, lamps: s.lamps, watchmaker: s.watchmaker };
    const note = h('small', { class: 'muted' }, 'carriages: [{ "rect": [x0, y0, x1, y1], "path": [[seconds, offset], …] }], blackouts: [[from, to]], lamps, watchmaker.');
    const area = h('textarea', {
      class: 'mono',
      rows: 5,
      spellcheck: 'false',
      oninput: (e: Event) => {
        try {
          const o = JSON.parse((e.target as HTMLTextAreaElement).value || '{}') as Partial<LevelJson>;
          for (const k of ['carriages', 'blackouts', 'lamps', 'watchmaker'] as const) {
            if (o[k] === undefined || o[k] === null) delete s[k];
            else (s as Record<string, unknown>)[k] = o[k];
          }
          note.className = 'muted';
          this.changed(false);
        } catch {
          note.className = 'bad';
        }
      },
    }, JSON.stringify(pick, null, 1));
    return h('label', { class: 'ed-field' }, h('span', {}, 'Advanced (JSON)'), area, note);
  }

  // ---------- editing ----------

  private bind(): void {
    const ov = this.overlay;
    ov.addEventListener('contextmenu', (e) => e.preventDefault());
    ov.addEventListener('pointerdown', (e) => {
      const t = this.tileAt(e);
      if (!t) return;
      ov.setPointerCapture(e.pointerId);
      const right = e.button === 2;
      if (this.tool === 'paint') {
        this.snapshot();
        this.painting = true;
        this.paint(t[0], t[1], right ? '.' : this.glyph);
      } else if (this.tool === 'select') {
        this.sel = { x: t[0], y: t[1] };
        this.renderInspector();
      } else if (this.tool === 'wire') this.wireClick(t[0], t[1]);
      else if (this.tool === 'route') this.routeClick(t[0], t[1], right);
    });
    ov.addEventListener('pointermove', (e) => {
      this.hover = this.tileAt(e);
      if (this.painting && this.hover && (e.buttons & 1 || e.buttons & 2)) this.paint(this.hover[0], this.hover[1], e.buttons & 2 ? '.' : this.glyph);
    });
    const up = () => {
      if (this.painting) this.changed(true);
      this.painting = false;
    };
    ov.addEventListener('pointerup', up);
    ov.addEventListener('pointercancel', up);
    ov.addEventListener('pointerleave', () => (this.hover = null));
  }

  private onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.doUndo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    // type a glyph to pick it
    const g = GLYPHS.find((x) => x.ch === e.key);
    if (g) {
      this.glyph = g.ch;
      this.setTool('paint');
      this.buildPalette();
    }
  };

  private tileAt(e: PointerEvent): [number, number] | null {
    const [x, y] = this.renderer.toWorld(e.clientX, e.clientY);
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || ty >= this.d.rows.length || tx >= (this.d.rows[0]?.length ?? 0)) return null;
    return [tx, ty];
  }

  private paint(x: number, y: number, ch: string): void {
    const row = this.d.rows[y];
    if (!row || row[x] === ch) return;
    // only one start and one target
    if (ch === 'S' || ch === 'T') this.d.rows = this.d.rows.map((r) => r.split(ch).join('.'));
    const r = this.d.rows[y];
    this.d.rows[y] = r.slice(0, x) + ch + r.slice(x + 1);
    if (!'@!%='.includes(ch)) delete this.d.props[`${x},${y}`];
    this.sel = { x, y };
    this.changed(false);
  }

  private wireClick(x: number, y: number): void {
    const ch = this.d.rows[y][x];
    if (isDoorLetter(ch)) {
      this.sel = { x, y };
      this.renderInspector();
      return;
    }
    const door = this.sel ? this.d.rows[this.sel.y]?.[this.sel.x] : '';
    if (ch >= 'a' && ch <= 'h' && door && isDoorLetter(door)) {
      const doors = (this.d.settings.doors ??= {});
      const d = (doors[door] ??= { rule: 'plate', wires: [] });
      const w = d.wires ?? [];
      d.wires = w.includes(ch) ? w.filter((l) => l !== ch) : [...w, ch];
      this.changed(true);
    }
  }

  private routeClick(x: number, y: number, remove: boolean): void {
    const ch = this.d.rows[y][x];
    if (ch === '@' || ch === '!') {
      this.sel = { x, y };
      this.renderInspector();
      return;
    }
    const s = this.sel;
    if (!s) return;
    const gch = this.d.rows[s.y]?.[s.x];
    if (gch !== '@' && gch !== '!') return;
    const g = (this.d.props[`${s.x},${s.y}`] ??= { route: [], mode: 'pingpong' }) as GuardProps;
    g.route ??= [];
    if (remove) g.route.pop();
    else g.route.push([x, y]);
    this.changed(true);
  }

  private resize(dw: number, dh: number): void {
    this.snapshot();
    let rows = this.d.rows;
    const w = rows[0].length;
    if (dw > 0) rows = rows.map((r, i) => (i === 0 || i === rows.length - 1 ? r + '#' : r.slice(0, -1) + '.#'));
    if (dw < 0 && w > 5) rows = rows.map((r) => r.slice(0, -2) + '#');
    if (dh > 0) rows = [...rows.slice(0, -1), '#' + '.'.repeat(rows[0].length - 2) + '#', rows[rows.length - 1]];
    if (dh < 0 && rows.length > 5) rows = [...rows.slice(0, -2), rows[rows.length - 1]];
    this.d.rows = rows.slice(0, 40).map((r) => r.slice(0, 64));
    this.changed(true);
  }

  private reset(): void {
    if (!confirm('Start a blank level? Your current draft is replaced (export it first if you want to keep it).')) return;
    this.snapshot();
    this.d = { rows: BLANK.slice(), settings: { name: 'My heist', par: 2, swiftTime: 7, hint: 'Write a hint.' }, props: {} };
    this.sel = null;
    this.changed(true);
  }

  private snapshot(): void {
    this.undo.push(JSON.stringify(this.d));
    if (this.undo.length > 60) this.undo.shift();
  }

  private doUndo(): void {
    const s = this.undo.pop();
    if (!s) return;
    this.d = JSON.parse(s) as Draft;
    this.changed(true);
  }

  /** After any change: re-parse, validate, autosave; `full` also redraws the inspector. */
  private changed(full: boolean): void {
    this.rebuild();
    write(KEY, this.d);
    if (full) this.renderInspector();
  }

  private rebuild(): void {
    const sh = this.shared();
    const lv = parseLevel('custom', sh.text, sh.json);
    this.lv = lv;
    this.world = new World(lv);
    try {
      this.world.begin({ lanes: [], liveSlot: -1, loopTicks: 600 });
    } catch {
      this.world = null;
    }
    this.renderer.setLevel(lv);
    const errs = validateLevel(lv);
    clear(this.problems);
    this.problems.className = `ed-problems ${errs.length ? 'bad' : 'ok'}`;
    this.problems.append(errs.length ? h('span', {}, `${errs.length} problem${errs.length === 1 ? '' : 's'}: `, errs.slice(0, 3).join(' '), errs.length > 3 ? ` (+${errs.length - 3} more)` : '') : h('span', {}, 'Valid. Press Test play to try it.'));
    if (!this.inspector.childElementCount) this.renderInspector();
  }

  // ---------- drawing ----------

  private draw(): void {
    this.renderer.resize();
    const r = this.overlay.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (this.overlay.width !== Math.round(r.width * dpr) || this.overlay.height !== Math.round(r.height * dpr)) {
      this.overlay.width = Math.round(r.width * dpr);
      this.overlay.height = Math.round(r.height * dpr);
    }
    if (this.world) this.renderer.draw(this.world, { alpha: 1, now: performance.now() / 1000, lanes: [], showPaths: false, selected: -1, colorblind: false, reduced: true, debug: false, rewind: -1, caught: null });
    const g = this.overlay.getContext('2d')!;
    const s = this.renderer.tile;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, r.width, r.height);
    g.setTransform(dpr * s, 0, 0, dpr * s, dpr * this.renderer.ox, dpr * this.renderer.oy);
    const px = 1 / s;
    const rows = this.d.rows;
    // letters for things the renderer draws subtly
    g.font = `700 0.5px ${FONT_MONO}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const ch = rows[y][x];
        if (ch >= 'a' && ch <= 'h') {
          g.fillStyle = 'rgba(255,255,255,0.85)';
          g.fillText(ch, x + 0.5, y + 0.53);
        }
      }
    }
    // wiring
    const lv = this.lv;
    if (lv) {
      g.lineWidth = 1.5 * px;
      g.setLineDash([3 * px, 3 * px]);
      for (const d of lv.doors) {
        for (const gi of d.wireIdx) {
          const t = lv.triggers[gi].tiles[0];
          g.strokeStyle = 'rgba(255, 194, 75, 0.7)';
          g.beginPath();
          g.moveTo(d.tiles[0][0] + 0.5, d.tiles[0][1] + 0.5);
          g.lineTo(t[0] + 0.5, t[1] + 0.5);
          g.stroke();
        }
      }
      g.setLineDash([]);
      // guard routes
      for (const gd of [...lv.guards, ...lv.auditors]) {
        const pts: Pt[] = [[gd.x, gd.y], ...gd.route];
        g.strokeStyle = 'rgba(255, 77, 94, 0.7)';
        g.lineWidth = 1.5 * px;
        g.beginPath();
        gd.route.forEach((q, i) => (i === 0 ? g.moveTo(q[0] + 0.5, q[1] + 0.5) : g.lineTo(q[0] + 0.5, q[1] + 0.5)));
        if (gd.mode === 'loop' && gd.route.length > 2) g.closePath();
        g.stroke();
        gd.route.forEach((q, i) => {
          g.fillStyle = C.threat;
          g.beginPath();
          g.arc(q[0] + 0.5, q[1] + 0.5, 0.18, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#fff';
          g.font = `700 0.32px ${FONT_MONO}`;
          g.fillText(String(i), q[0] + 0.5, q[1] + 0.12);
        });
        void pts;
      }
    }
    // selection and hover
    if (this.sel) {
      g.strokeStyle = C.plate;
      g.lineWidth = 2 * px;
      g.strokeRect(this.sel.x + 0.05, this.sel.y + 0.05, 0.9, 0.9);
    }
    if (this.hover) {
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 1.5 * px;
      g.strokeRect(this.hover[0], this.hover[1], 1, 1);
    }
  }

  // ---------- test, export, share ----------

  private test(): void {
    const lv = this.lv;
    if (!lv) return;
    const errs = validateLevel(lv);
    if (errs.length) {
      this.problems.classList.add('flash');
      setTimeout(() => this.problems.classList.remove('flash'), 600);
      return;
    }
    this.o.onTest(parseLevel('custom', lv.text, lv.json));
  }

  private showIO(): void {
    const sh = this.shared();
    const txt = h('textarea', { class: 'ed-io mono', rows: 12, spellcheck: 'false', 'aria-label': 'Level grid (.txt)' }, sh.text);
    const js = h('textarea', { class: 'ed-io mono', rows: 12, spellcheck: 'false', 'aria-label': 'Level settings (.json)' }, JSON.stringify(sh.json, null, 1));
    const msg = h('p', { class: 'muted small' }, 'Copy these into src/levels/<chapter>/<nn>.txt and .json, or paste a level here and press Import.');
    const dlg = h(
      'div',
      { class: 'ed-dialog', role: 'dialog', 'aria-label': 'Export and import' },
      h('div', { class: 'panel menu' }, h('h2', {}, 'Export / import'), msg, h('div', { class: 'ed-io-row' }, h('label', {}, h('span', {}, '.txt'), txt), h('label', {}, h('span', {}, '.json'), js)), h(
        'div',
        { class: 'menu-buttons row' },
        h('button', {
          class: 'btn primary',
          onclick: () => {
            try {
              const json = JSON.parse((js as HTMLTextAreaElement).value || '{}') as LevelJson;
              this.snapshot();
              this.d = fromShared({ text: (txt as HTMLTextAreaElement).value, json });
              this.sel = null;
              this.changed(true);
              dlg.remove();
            } catch (e) {
              msg.textContent = `That JSON doesn't parse: ${(e as Error).message}`;
              msg.className = 'bad small';
            }
          },
        }, 'Import'),
        h('button', { class: 'btn', onclick: () => void navigator.clipboard?.writeText(`${(txt as HTMLTextAreaElement).value}\n\n${(js as HTMLTextAreaElement).value}`).then(() => (msg.textContent = 'Copied both to the clipboard.')) }, 'Copy both'),
        h('button', { class: 'btn ghost', onclick: () => dlg.remove() }, 'Close'),
      )),
    );
    this.root.append(dlg);
    (txt as HTMLTextAreaElement).focus();
  }

  private async share(): Promise<void> {
    const code = await encodeLevel(this.shared());
    const url = `${location.origin}${location.pathname}${location.search}#level=${code}`;
    const field = h('input', { class: 'ed-io mono', value: url, readonly: true, 'aria-label': 'Share link' }) as HTMLInputElement;
    const note = h('p', { class: 'muted small' }, 'Anyone with this link plays your level. The whole level is in the link.');
    const dlg = h('div', { class: 'ed-dialog', role: 'dialog', 'aria-label': 'Share link' }, h('div', { class: 'panel menu' }, h('h2', {}, 'Share link'), note, field, h('div', { class: 'menu-buttons row' }, h('button', { class: 'btn primary', onclick: () => void navigator.clipboard?.writeText(url).then(() => (note.textContent = 'Copied.')) }, 'Copy link'), h('button', { class: 'btn ghost', onclick: () => dlg.remove() }, 'Close'))));
    this.root.append(dlg);
    field.select();
  }
}

function swClass(ch: string): string {
  if (ch === '#' ) return 'wall';
  if (ch === '-' || ch === '_') return 'glass';
  if (ch === 'E') return 'exit';
  if (ch === 'T' || ch === '$') return 'gold';
  if (isDoorLetter(ch)) return 'door';
  if (ch >= 'a' && ch <= 'h') return 'trig';
  if ('@!%=&'.includes(ch)) return 'threat';
  if (ch === '*') return 'lure';
  return 'plain';
}

function triggerLetters(rows: string[]): string[] {
  const set = new Set<string>();
  for (const r of rows) for (const c of r) if (c >= 'a' && c <= 'h') set.add(c);
  return [...set].sort();
}

/** Positions of a glyph in reading order. */
function positions(rows: string[], ch: string): Pt[] {
  const out: Pt[] = [];
  rows.forEach((r, y) => r.split('').forEach((c, x) => c === ch && out.push([x, y])));
  return out;
}

function buildJson(d: Draft): LevelJson {
  const s: LevelJson = JSON.parse(JSON.stringify(d.settings ?? {}));
  const rows = d.rows;
  // keep door/trigger settings only for letters on the map
  const present = new Set(rows.join(''));
  if (s.doors) for (const k of Object.keys(s.doors)) if (!present.has(k)) delete s.doors[k];
  if (s.triggers) for (const k of Object.keys(s.triggers)) if (!present.has(k)) delete s.triggers[k];
  for (const c of present) {
    if (isDoorLetter(c)) (s.doors ??= {})[c] ??= { rule: 'plate', wires: [] };
    if (c >= 'a' && c <= 'h') (s.triggers ??= {})[c] ??= { type: 'plate' };
  }
  const arr = <T>(ch: string, def: T) => positions(rows, ch).map(([x, y]) => (d.props[`${x},${y}`] as T) ?? def);
  const guards = arr<GuardProps>('@', { route: [] });
  const auditors = arr<GuardProps>('!', { route: [] });
  const cameras = arr<CameraProps>('%', {});
  const lasers = arr<LaserProps>('=', {});
  if (guards.length) s.guards = guards;
  else delete s.guards;
  if (auditors.length) s.auditors = auditors;
  else delete s.auditors;
  if (cameras.length) s.cameras = cameras;
  else delete s.cameras;
  if (lasers.length) s.lasers = lasers;
  else delete s.lasers;
  return s;
}

function fromShared(sh: SharedLevel): Draft {
  const rows = sh.text.replace(/\r/g, '').split('\n').filter((r) => r.length);
  const settings: LevelJson = { ...sh.json };
  const props: Draft['props'] = {};
  const take = <T>(ch: string, list: T[] | undefined) => positions(rows, ch).forEach(([x, y], i) => list?.[i] && (props[`${x},${y}`] = list[i] as GuardProps));
  take('@', sh.json.guards);
  take('!', sh.json.auditors);
  take('%', sh.json.cameras);
  take('=', sh.json.lasers);
  delete settings.guards;
  delete settings.auditors;
  delete settings.cameras;
  delete settings.lasers;
  return { rows: rows.length ? rows : BLANK.slice(), settings, props };
}
