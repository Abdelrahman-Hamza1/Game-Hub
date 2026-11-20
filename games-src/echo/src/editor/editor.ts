/**
 * In-browser level editor (brief §4.4): paint a grid with the legend tiles, edit the meta, see
 * validation inline, then play, export or share the level.
 *
 * The lead mounts it into `#screen`; it owns its DOM and listeners and removes them in destroy().
 */
import './editor.css';
import { el, toast } from '../ui/dom';
import { LEGEND, DEFAULT_META, normalizeMeta, splitRows, validateLevel, type LevelMeta, type ValidationIssue } from '../world/level';
import { MAX_LEVEL_H, MAX_LEVEL_W } from '../game/constants';
import { encodeShare, decodeShare } from '../world/sharecode';
import { LEVELS } from '../levels';
import { BG, EXIT, MAT_COLOR, MOSS_WALL, PIT, PLAYER, SWARM, THREAT, TOURIST, mix } from '../render/palette';

export interface EditorOptions {
  initial?: { text: string; meta: LevelMeta };
  onPlay(text: string, meta: LevelMeta): void;
  onExit(): void;
}

export const DRAFT_KEY = 'echo:editor-draft';
const MIN_W = 3;
const MIN_H = 3;
const MAX_HISTORY = 200;
const MIN_ZOOM = 3;
const MAX_ZOOM = 72;

// ---------- tile appearance ----------

type TileKind = 'wall' | 'floor' | 'thing';
interface TileLook {
  kind: TileKind;
  color: string;
}

const LOOK: Record<string, TileLook> = {
  '#': { kind: 'wall', color: MAT_COLOR[0] },
  '.': { kind: 'floor', color: MAT_COLOR[0] },
  W: { kind: 'floor', color: MAT_COLOR[1] },
  G: { kind: 'floor', color: MAT_COLOR[2] },
  M: { kind: 'floor', color: MOSS_WALL },
  T: { kind: 'floor', color: MAT_COLOR[4] },
  X: { kind: 'wall', color: MAT_COLOR[4] },
  K: { kind: 'wall', color: MAT_COLOR[5] },
  S: { kind: 'thing', color: PLAYER },
  E: { kind: 'thing', color: EXIT },
  D: { kind: 'thing', color: '#7FB2FF' },
  F: { kind: 'thing', color: MAT_COLOR[1] },
  R: { kind: 'thing', color: MAT_COLOR[2] },
  C: { kind: 'thing', color: THREAT },
  B: { kind: 'thing', color: SWARM },
  Z: { kind: 'thing', color: SWARM },
  P: { kind: 'thing', color: TOURIST },
  '~': { kind: 'thing', color: PIT },
  '=': { kind: 'floor', color: MAT_COLOR[4] },
  H: { kind: 'thing', color: MAT_COLOR[4] },
  '!': { kind: 'thing', color: THREAT },
};
const UNKNOWN_LOOK: TileLook = { kind: 'wall', color: '#666A7A' };

function look(ch: string): TileLook {
  return LOOK[ch] ?? (LEGEND[ch] ? { kind: LEGEND[ch].solid ? 'wall' : 'floor', color: MAT_COLOR[LEGEND[ch].mat] } : UNKNOWN_LOOK);
}

/** Background fill of a tile on the canvas. */
function tileFill(ch: string): string {
  const l = look(ch);
  if (l.kind === 'wall') return mix(l.color, BG, 0.5);
  if (l.kind === 'floor') return mix(l.color, BG, ch === '.' ? 0.9 : 0.72);
  // Things stand on the floor of their material.
  const floor = LEGEND[ch] ? MAT_COLOR[LEGEND[ch].mat] : MAT_COLOR[0];
  return mix(floor, BG, 0.9);
}

/** Glyph colour drawn on a tile. */
function glyphColor(ch: string): string {
  const l = look(ch);
  if (l.kind === 'wall') return mix(l.color, '#FFFFFF', 0.55);
  if (l.kind === 'floor') return ch === '.' ? 'rgba(141,151,181,0.55)' : mix(l.color, '#FFFFFF', 0.35);
  return '#05060B';
}

const UNIQUE = new Set(['S', 'E']);

// ---------- grid state ----------

interface Grid {
  w: number;
  h: number;
  cells: string[];
}

interface Snapshot extends Grid {
  meta?: MetaFields;
}

/** Raw meta as typed in the fields; normalised only when used. */
interface MetaFields {
  name: string;
  stones: string;
  hint: string;
  parTime: string;
  chase: boolean;
}

function metaToFields(m: LevelMeta): MetaFields {
  return { name: m.name, stones: String(m.stones), hint: m.hint, parTime: String(m.parTime), chase: m.chase === true };
}

function fieldsToMeta(f: MetaFields): LevelMeta {
  const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
  return normalizeMeta({ name: f.name, stones: num(f.stones), hint: f.hint, parTime: num(f.parTime), chase: f.chase });
}

function gridFromText(text: string): Grid {
  const rows = splitRows(text);
  const h = rows.length;
  const w = Math.max(0, ...rows.map((r) => r.length));
  const cells: string[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push(rows[y][x] ?? '#');
  return { w, h, cells };
}

function gridToText(g: Grid): string {
  const rows: string[] = [];
  for (let y = 0; y < g.h; y++) rows.push(g.cells.slice(y * g.w, (y + 1) * g.w).join(''));
  return rows.join('\n');
}

function blankGrid(w: number, h: number): Grid {
  const cells: string[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) cells.push(x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '.');
  }
  cells[Math.floor(h / 2) * w + 2] = 'S';
  cells[Math.floor(h / 2) * w + (w - 3)] = 'E';
  return { w, h, cells };
}

function resizeGrid(g: Grid, w: number, h: number): Grid {
  const cells: string[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push(x < g.w && y < g.h ? g.cells[y * g.w + x] : '#');
  return { w, h, cells };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Check pasted grid text: returns the grid (ragged rows padded with walls) or a reason it can't be
 * used. Validation problems (no exit etc.) are fine here; the editor lists them afterwards.
 */
export function importGrid(text: string): { grid: Grid; note?: string } | { error: string } {
  const rows = splitRows(text);
  if (rows.length === 0) return { error: 'Paste a grid first: one line per row, one character per tile.' };
  const w = Math.max(...rows.map((r) => r.length));
  if (w > MAX_LEVEL_W || rows.length > MAX_LEVEL_H) {
    return { error: `That grid is ${w}×${rows.length}; the editor's limit is ${MAX_LEVEL_W}×${MAX_LEVEL_H}.` };
  }
  if (w < MIN_W || rows.length < MIN_H) return { error: `That grid is ${w}×${rows.length}; it must be at least ${MIN_W}×${MIN_H}.` };
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (!LEGEND[ch]) {
        const shown = ch === ' ' ? 'space' : ch === '\t' ? 'tab' : `"${ch}"`;
        return { error: `Unknown tile ${shown} at column ${x + 1}, row ${y + 1}. Use only the palette characters.` };
      }
    }
  }
  const ragged = rows.some((r) => r.length !== w);
  return { grid: gridFromText(text), note: ragged ? 'Short rows were padded with rock walls (#).' : undefined };
}

// ---------- storage ----------

function loadDraft(): { text: string; meta: LevelMeta } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as unknown;
    if (!d || typeof d !== 'object') return null;
    const rec = d as Record<string, unknown>;
    if (typeof rec.text !== 'string') return null;
    const res = importGrid(rec.text);
    if ('error' in res) return null;
    return { text: gridToText(res.grid), meta: normalizeMeta(rec.meta) };
  } catch {
    return null;
  }
}

function saveDraft(text: string, meta: LevelMeta): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, meta }));
  } catch {
    /* storage unavailable: the draft lives only in memory */
  }
}

// ---------- clipboard ----------

/** Copy text; on failure select it in `field` so the player can copy by hand. Call from a click. */
function copyText(text: string, field: HTMLInputElement | HTMLTextAreaElement | null, what: string): void {
  const fallback = () => {
    if (field) {
      field.focus();
      field.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      toast(ok ? `${what} copied` : `Select all and copy the ${what.toLowerCase()} by hand`);
    } else {
      toast(`Couldn't copy the ${what.toLowerCase()}`);
    }
  };
  try {
    const clip = navigator.clipboard;
    if (!clip || typeof clip.writeText !== 'function') {
      fallback();
      return;
    }
    clip.writeText(text).then(() => toast(`${what} copied`), fallback);
  } catch {
    fallback();
  }
}

// ---------- the editor ----------

export function mountEditor(root: HTMLElement, opts: EditorOptions): { destroy(): void } {
  const start = opts.initial ?? loadDraft() ?? { text: gridToText(blankGrid(40, 24)), meta: { ...DEFAULT_META } };
  const startGrid = importGrid(start.text);
  let grid: Grid = 'grid' in startGrid ? startGrid.grid : blankGrid(40, 24);
  let fields: MetaFields = metaToFields(normalizeMeta(start.meta));

  let tool = '#';
  let erasing = false;
  let issues: ValidationIssue[] = [];
  const undoStack: Snapshot[] = [];
  const redoStack: Snapshot[] = [];

  // View: tile size in CSS px and the grid origin inside the canvas.
  let zoom = 16;
  let ox = 0;
  let oy = 0;
  let fitMode = true;
  let hover: { x: number; y: number } | null = null;

  const cleanups: (() => void)[] = [];
  const on = <K extends keyof WindowEventMap>(target: Window, type: K, fn: (e: WindowEventMap[K]) => void, o?: AddEventListenerOptions) => {
    target.addEventListener(type, fn, o);
    cleanups.push(() => target.removeEventListener(type, fn, o));
  };

  // ----- DOM -----

  const canvas = el('canvas', { class: 'ed-canvas', 'aria-label': 'Level grid. Click or drag to paint; right-click to erase.', tabindex: '0' });
  const ctx = canvas.getContext('2d');
  const stage = el('div', { class: 'ed-stage' }, canvas);
  const hoverInfo = el('span', { class: 'ed-hover', 'aria-live': 'off' });

  const btn = (label: string, onClick: () => void, cls = 'btn', extra: Record<string, string> = {}) => {
    const b = el('button', { class: cls, type: 'button', ...extra }, label);
    b.addEventListener('click', onClick);
    return b;
  };

  const undoBtn = btn('Undo', () => undo(), 'btn ed-sm', { title: 'Undo (Ctrl+Z)' });
  const redoBtn = btn('Redo', () => redo(), 'btn ed-sm', { title: 'Redo (Ctrl+Shift+Z)' });
  const shareBtn = btn('Copy share link', () => share(), 'btn ed-sm');
  const playBtn = btn('Play', () => play(), 'btn primary ed-play');
  const playReason = el('span', { class: 'ed-reason', id: 'ed-play-reason' });
  playBtn.setAttribute('aria-describedby', 'ed-play-reason');

  const top = el(
    'header',
    { class: 'ed-top' },
    btn('← Exit', () => exit(), 'btn ed-sm', { title: 'Back to the title screen' }),
    el('div', { class: 'ed-title' }, el('span', { class: 'eyebrow' }, 'Echo'), el('h1', {}, 'Level editor')),
    el('div', { class: 'ed-top-actions' }, undoBtn, redoBtn, shareBtn, el('div', { class: 'ed-playwrap' }, playBtn, playReason)),
  );

  // Palette
  const paletteButtons = new Map<string, HTMLButtonElement>();
  const palette = el('div', { class: 'ed-palette', role: 'group', 'aria-label': 'Tiles' });
  for (const [ch, def] of Object.entries(LEGEND)) {
    const sw = el('span', { class: 'ed-swatch', 'aria-hidden': 'true' }, ch);
    const l = look(ch);
    sw.style.background = l.kind === 'thing' ? l.color : tileFill(ch);
    sw.style.color = l.kind === 'thing' ? '#05060B' : glyphColor(ch);
    if (l.kind === 'floor' && ch !== '.') sw.style.boxShadow = `inset 0 0 0 1.5px ${l.color}`;
    const b = el(
      'button',
      { class: 'ed-tile', type: 'button', title: `${def.label} — key ${ch}`, 'aria-label': `${def.label} (${ch})`, 'aria-pressed': 'false' },
      sw,
      el('span', { class: 'ed-tile-label' }, def.label),
    );
    b.addEventListener('click', () => selectTool(ch));
    paletteButtons.set(ch, b);
    palette.append(b);
  }
  const eraserBtn = el('button', { class: 'btn ed-sm ed-eraser', type: 'button', 'aria-pressed': 'false', title: 'Eraser: paints rock floor (.). Right-click also erases.' }, 'Eraser');
  eraserBtn.addEventListener('click', () => setErasing(!erasing));
  const toolInfo = el('div', { class: 'ed-toolinfo' });

  const paletteCol = el(
    'section',
    { class: 'ed-pal', 'aria-label': 'Palette' },
    el('div', { class: 'ed-pal-head' }, el('h2', { class: 'eyebrow' }, 'Tiles'), eraserBtn),
    toolInfo,
    palette,
    el('p', { class: 'ed-tip' }, 'Press a tile’s key to pick it. Right-click erases. Drag with two fingers, the middle button or Space to pan; Ctrl+wheel or pinch to zoom.'),
  );

  const canvasBar = el(
    'div',
    { class: 'ed-canvasbar' },
    btn('−', () => zoomBy(1 / 1.25), 'btn ed-sm ed-icon', { 'aria-label': 'Zoom out', title: 'Zoom out (-)' }),
    btn('Fit', () => fit(), 'btn ed-sm', { title: 'Zoom to fit (0)' }),
    btn('+', () => zoomBy(1.25), 'btn ed-sm ed-icon', { 'aria-label': 'Zoom in', title: 'Zoom in (+)' }),
    hoverInfo,
  );
  const canvasCol = el('section', { class: 'ed-canvascol', 'aria-label': 'Grid' }, canvasBar, stage);

  // Side panel: level fields
  const nameIn = el('input', { type: 'text', maxlength: '60', autocomplete: 'off', spellcheck: 'false' });
  const stonesIn = el('input', { type: 'number', min: '0', max: '20', step: '1', inputmode: 'numeric' });
  const parIn = el('input', { type: 'number', min: '5', step: '1', inputmode: 'numeric' });
  const hintIn = el('textarea', { rows: '2', maxlength: '200' });
  const chaseIn = el('input', { type: 'checkbox' });
  const wIn = el('input', { type: 'number', min: String(MIN_W), max: String(MAX_LEVEL_W), step: '1', inputmode: 'numeric' });
  const hIn = el('input', { type: 'number', min: String(MIN_H), max: String(MAX_LEVEL_H), step: '1', inputmode: 'numeric' });

  const field = (label: string, input: HTMLElement, cls = 'ed-field') => el('label', { class: cls }, el('span', {}, label), input);

  const levelSec = el(
    'section',
    { class: 'ed-sec' },
    el('h2', { class: 'eyebrow' }, 'Level'),
    field('Name', nameIn),
    el('div', { class: 'ed-pair' }, field('Stones', stonesIn), field('Par time (s)', parIn)),
    field('Hint', hintIn),
    el('label', { class: 'ed-check' }, chaseIn, el('span', {}, 'Final chase level', el('small', {}, 'Listeners hunt once Mira steps on a chase trigger (!), or from the start if there is none.'))),
    el('div', { class: 'ed-pair' }, field(`Width (${MIN_W}–${MAX_LEVEL_W})`, wIn), field(`Height (${MIN_H}–${MAX_LEVEL_H})`, hIn)),
  );

  const statusEl = el('div', { class: 'ed-status', role: 'status', 'aria-live': 'polite' });
  const issueList = el('ul', { class: 'ed-issues' });
  const checkSec = el('section', { class: 'ed-sec' }, el('h2', { class: 'eyebrow' }, 'Check'), statusEl, issueList);

  const levelSelect = el('select', { 'aria-label': 'Start from a game level' });
  levelSelect.append(el('option', { value: '' }, 'Copy a game level…'));
  for (const l of LEVELS) levelSelect.append(el('option', { value: l.id }, `${l.id} · ${l.meta.name}`));
  levelSelect.addEventListener('change', () => {
    const entry = LEVELS.find((l) => l.id === levelSelect.value);
    levelSelect.value = '';
    if (!entry) return;
    const res = importGrid(entry.text);
    if ('error' in res) {
      toast(res.error);
      return;
    }
    replaceAll(res.grid, metaToFields(normalizeMeta(entry.meta)));
    toast(`Loaded ${entry.id} · ${entry.meta.name}. Undo to go back.`);
  });

  const fileSec = el(
    'section',
    { class: 'ed-sec' },
    el('h2', { class: 'eyebrow' }, 'File'),
    el(
      'div',
      { class: 'ed-btnrow' },
      btn('New', () => {
        replaceAll(blankGrid(40, 24), metaToFields({ ...DEFAULT_META }));
        toast('New level. Undo to go back.');
      }),
      btn('Import', () => openImport()),
      btn('Export', () => openExport()),
    ),
    levelSelect,
    el('p', { class: 'ed-tip' }, 'Your draft saves automatically in this browser.'),
  );

  const side = el('aside', { class: 'ed-side', 'aria-label': 'Level settings' }, levelSec, checkSec, fileSec);
  const main = el('div', { class: 'ed-main' }, paletteCol, canvasCol, side);
  const modalHost = el('div', { class: 'ed-modalhost' });
  const shell = el('div', { class: 'ed', role: 'application', 'aria-label': 'Echo level editor' }, top, main, modalHost);
  root.append(shell);

  // ----- meta fields -----

  function syncFieldInputs(): void {
    nameIn.value = fields.name;
    stonesIn.value = fields.stones;
    parIn.value = fields.parTime;
    hintIn.value = fields.hint;
    chaseIn.checked = fields.chase;
  }
  function syncSizeInputs(): void {
    wIn.value = String(grid.w);
    hIn.value = String(grid.h);
  }
  const readFields = () => {
    fields = { name: nameIn.value, stones: stonesIn.value, hint: hintIn.value, parTime: parIn.value, chase: chaseIn.checked };
    changed(false);
  };
  for (const input of [nameIn, stonesIn, parIn, hintIn]) input.addEventListener('input', readFields);
  chaseIn.addEventListener('change', readFields);
  // Show the normalised value once the player leaves a number field.
  for (const input of [stonesIn, parIn]) {
    input.addEventListener('change', () => {
      const m = fieldsToMeta(fields);
      fields = { ...fields, stones: String(m.stones), parTime: String(m.parTime) };
      syncFieldInputs();
    });
  }
  const applySize = () => {
    const w = clamp(Math.round(Number(wIn.value) || grid.w), MIN_W, MAX_LEVEL_W);
    const h = clamp(Math.round(Number(hIn.value) || grid.h), MIN_H, MAX_LEVEL_H);
    syncSizeInputsTo(w, h);
    if (w === grid.w && h === grid.h) return;
    pushUndo(false);
    grid = resizeGrid(grid, w, h);
    if (fitMode) fit();
    changed(true);
  };
  const syncSizeInputsTo = (w: number, h: number) => {
    wIn.value = String(w);
    hIn.value = String(h);
  };
  wIn.addEventListener('change', applySize);
  hIn.addEventListener('change', applySize);

  // ----- tools -----

  function selectTool(ch: string): void {
    tool = ch;
    setErasing(false);
  }
  function setErasing(v: boolean): void {
    erasing = v;
    eraserBtn.setAttribute('aria-pressed', String(v));
    for (const [ch, b] of paletteButtons) b.setAttribute('aria-pressed', String(!v && ch === tool));
    const ch = v ? '.' : tool;
    toolInfo.textContent = v ? 'Eraser · paints rock floor (.)' : `${LEGEND[ch].label} (${ch})${UNIQUE.has(ch) ? ' · only one; placing it moves it' : ''}`;
  }

  // ----- history -----

  function snapshot(withMeta: boolean): Snapshot {
    return { w: grid.w, h: grid.h, cells: grid.cells.slice(), ...(withMeta ? { meta: { ...fields } } : {}) };
  }
  function pushUndo(withMeta: boolean): void {
    undoStack.push(snapshot(withMeta));
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
    updateHistoryButtons();
  }
  function restore(s: Snapshot): void {
    const sizeChanged = s.w !== grid.w || s.h !== grid.h;
    grid = { w: s.w, h: s.h, cells: s.cells.slice() };
    if (s.meta) {
      fields = { ...s.meta };
      syncFieldInputs();
    }
    if (sizeChanged && fitMode) fit();
    changed(true);
  }
  function undo(): void {
    endStroke();
    const s = undoStack.pop();
    if (!s) return;
    redoStack.push(snapshot(s.meta !== undefined));
    restore(s);
  }
  function redo(): void {
    endStroke();
    const s = redoStack.pop();
    if (!s) return;
    undoStack.push(snapshot(s.meta !== undefined));
    restore(s);
  }
  function updateHistoryButtons(): void {
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  }

  function replaceAll(g: Grid, f: MetaFields): void {
    endStroke();
    pushUndo(true);
    grid = g;
    fields = f;
    syncFieldInputs();
    fit();
    changed(true);
  }

  // ----- painting -----

  let stroke: { before: Snapshot; changed: boolean; ch: string; last: { x: number; y: number } } | null = null;

  function setCell(x: number, y: number, ch: string): boolean {
    if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) return false;
    const i = y * grid.w + x;
    if (grid.cells[i] === ch) return false;
    if (UNIQUE.has(ch)) {
      for (let j = 0; j < grid.cells.length; j++) if (grid.cells[j] === ch) grid.cells[j] = '.';
    }
    grid.cells[i] = ch;
    return true;
  }

  function paintLine(x0: number, y0: number, x1: number, y1: number, ch: string): boolean {
    let any = false;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (let guard = 0; guard < 1000; guard++) {
      if (setCell(x, y, ch)) any = true;
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
    return any;
  }

  function beginStroke(t: { x: number; y: number }, ch: string): void {
    stroke = { before: snapshot(false), changed: false, ch, last: t };
    if (setCell(t.x, t.y, ch)) {
      stroke.changed = true;
      changed(true);
    }
  }
  function continueStroke(t: { x: number; y: number }): void {
    if (!stroke) return;
    if (t.x === stroke.last.x && t.y === stroke.last.y) return;
    const ch = stroke.ch;
    // Unique tiles follow the pointer rather than leaving a trail.
    const any = UNIQUE.has(ch) ? setCell(t.x, t.y, ch) : paintLine(stroke.last.x, stroke.last.y, t.x, t.y, ch);
    stroke.last = t;
    if (any) {
      stroke.changed = true;
      changed(true);
    }
  }
  function endStroke(): void {
    if (!stroke) return;
    if (stroke.changed) {
      undoStack.push(stroke.before);
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
      redoStack.length = 0;
      updateHistoryButtons();
    }
    stroke = null;
  }
  function cancelStroke(): void {
    if (!stroke) return;
    if (stroke.changed) {
      grid = { w: stroke.before.w, h: stroke.before.h, cells: stroke.before.cells };
      changed(true);
    }
    stroke = null;
  }

  // ----- view -----

  let cssW = 0;
  let cssH = 0;

  function fit(): void {
    fitMode = true;
    if (!cssW || !cssH) return;
    const pad = 12;
    zoom = clamp(Math.floor(Math.min((cssW - pad * 2) / grid.w, (cssH - pad * 2) / grid.h) * 4) / 4, MIN_ZOOM, MAX_ZOOM);
    ox = Math.round((cssW - grid.w * zoom) / 2);
    oy = Math.round((cssH - grid.h * zoom) / 2);
    requestDraw();
  }
  function zoomAt(factor: number, cx: number, cy: number): void {
    const z = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
    if (z === zoom) return;
    ox = cx - ((cx - ox) * z) / zoom;
    oy = cy - ((cy - oy) * z) / zoom;
    zoom = z;
    fitMode = false;
    clampView();
    requestDraw();
  }
  function zoomBy(factor: number): void {
    zoomAt(factor, cssW / 2, cssH / 2);
  }
  function panBy(dx: number, dy: number): void {
    ox += dx;
    oy += dy;
    fitMode = false;
    clampView();
    requestDraw();
  }
  /** Keep at least a few tiles of the grid on screen. */
  function clampView(): void {
    const keep = Math.min(cssW, cssH, 4 * zoom + 40);
    ox = clamp(ox, keep - grid.w * zoom, cssW - keep);
    oy = clamp(oy, keep - grid.h * zoom, cssH - keep);
  }
  function centerOn(x: number, y: number): void {
    if (zoom < 14) {
      zoom = Math.min(MAX_ZOOM, 20);
      fitMode = false;
    }
    ox = cssW / 2 - (x + 0.5) * zoom;
    oy = cssH / 2 - (y + 0.5) * zoom;
    clampView();
    requestDraw();
  }

  function tileAt(clientX: number, clientY: number): { x: number; y: number } {
    const r = canvas.getBoundingClientRect();
    return { x: Math.floor((clientX - r.left - ox) / zoom), y: Math.floor((clientY - r.top - oy) / zoom) };
  }
  const inGrid = (t: { x: number; y: number }) => t.x >= 0 && t.y >= 0 && t.x < grid.w && t.y < grid.h;

  const ro = new ResizeObserver(() => {
    const r = stage.getBoundingClientRect();
    cssW = Math.max(1, Math.floor(r.width));
    cssH = Math.max(1, Math.floor(r.height));
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    if (fitMode) fit();
    else clampView();
    requestDraw();
  });
  ro.observe(stage);
  cleanups.push(() => ro.disconnect());

  // ----- drawing -----

  let raf = 0;
  function requestDraw(): void {
    if (!raf) raf = requestAnimationFrame(draw);
  }
  cleanups.push(() => cancelAnimationFrame(raf));

  function draw(): void {
    raf = 0;
    if (!ctx) return;
    const dpr = canvas.width / Math.max(1, cssW);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cssW, cssH);
    const z = zoom;
    const x0 = Math.max(0, Math.floor(-ox / z));
    const y0 = Math.max(0, Math.floor(-oy / z));
    const x1 = Math.min(grid.w, Math.ceil((cssW - ox) / z));
    const y1 = Math.min(grid.h, Math.ceil((cssH - oy) / z));

    // Tiles
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const ch = grid.cells[y * grid.w + x];
        ctx.fillStyle = tileFill(ch);
        ctx.fillRect(ox + x * z, oy + y * z, z, z);
        const l = look(ch);
        if (l.kind === 'thing') {
          ctx.fillStyle = l.color;
          ctx.beginPath();
          ctx.arc(ox + (x + 0.5) * z, oy + (y + 0.5) * z, z * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // Grid lines
    if (z >= 6) {
      ctx.strokeStyle = z >= 12 ? 'rgba(124,150,200,0.16)' : 'rgba(124,150,200,0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = x0; x <= x1; x++) {
        const px = Math.round(ox + x * z) + 0.5;
        ctx.moveTo(px, oy + y0 * z);
        ctx.lineTo(px, oy + y1 * z);
      }
      for (let y = y0; y <= y1; y++) {
        const py = Math.round(oy + y * z) + 0.5;
        ctx.moveTo(ox + x0 * z, py);
        ctx.lineTo(ox + x1 * z, py);
      }
      ctx.stroke();
    }
    // Glyphs
    if (z >= 13) {
      ctx.font = `600 ${Math.round(z * 0.58)}px "Martian Mono", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const ch = grid.cells[y * grid.w + x];
          if (ch === '.' && z < 22) continue;
          ctx.fillStyle = glyphColor(ch);
          ctx.fillText(ch, ox + (x + 0.5) * z, oy + (y + 0.5) * z + z * 0.04);
        }
      }
    }
    // Grid border
    ctx.strokeStyle = 'rgba(124,150,200,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(ox) + 0.5, Math.round(oy) + 0.5, Math.round(grid.w * z), Math.round(grid.h * z));

    // Validation highlights
    ctx.lineWidth = Math.max(2, Math.min(3, z / 6));
    for (const is of issues) {
      if (is.y === undefined || is.y < 0 || is.y >= grid.h) continue;
      if (is.x === undefined) {
        ctx.strokeStyle = 'rgba(255,77,109,0.85)';
        ctx.strokeRect(ox + 1, oy + is.y * z + 1, grid.w * z - 2, z - 2);
        continue;
      }
      if (is.x < 0 || is.x >= grid.w) continue;
      const px = ox + is.x * z;
      const py = oy + is.y * z;
      ctx.fillStyle = 'rgba(255,77,109,0.28)';
      ctx.fillRect(px, py, z, z);
      ctx.strokeStyle = THREAT;
      ctx.strokeRect(px + 1, py + 1, z - 2, z - 2);
      // A ring so small tiles are still easy to spot.
      ctx.beginPath();
      ctx.arc(px + z / 2, py + z / 2, Math.max(z * 0.9, 9), 0, Math.PI * 2);
      ctx.stroke();
    }

    // Hover
    if (hover && inGrid(hover)) {
      ctx.strokeStyle = 'rgba(255,201,77,0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(ox + hover.x * z + 1, oy + hover.y * z + 1, z - 2, z - 2);
    }
  }

  // ----- pointer input -----

  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: { dist: number; cx: number; cy: number } | null = null;
  let panning: { id: number; x: number; y: number } | null = null;
  let spaceHeld = false;

  const localPt = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const gestureFrom = () => {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus({ preventScroll: true });
    pointers.set(e.pointerId, localPt(e));
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety */
    }
    e.preventDefault();
    if (pointers.size === 2) {
      // Second finger: undo the half-made stroke and switch to pan / pinch.
      cancelStroke();
      panning = null;
      gesture = gestureFrom();
      return;
    }
    if (pointers.size > 2) return;
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      panning = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.classList.add('ed-panning');
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    const t = tileAt(e.clientX, e.clientY);
    const ch = e.button === 2 || erasing ? '.' : tool;
    beginStroke(t, ch);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, localPt(e));
    if (gesture && pointers.size >= 2) {
      const g = gestureFrom();
      panBy(g.cx - gesture.cx, g.cy - gesture.cy);
      zoomAt(g.dist / gesture.dist, g.cx, g.cy);
      gesture = g;
      return;
    }
    if (panning && panning.id === e.pointerId) {
      panBy(e.clientX - panning.x, e.clientY - panning.y);
      panning.x = e.clientX;
      panning.y = e.clientY;
      return;
    }
    const t = tileAt(e.clientX, e.clientY);
    if (stroke && pointers.has(e.pointerId)) continueStroke(t);
    if (!hover || hover.x !== t.x || hover.y !== t.y) {
      hover = t;
      updateHoverInfo();
      requestDraw();
    }
  });

  const pointerEnd = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (e.pointerType !== 'mouse' && hover) {
      hover = null;
      requestDraw();
    }
    if (gesture) {
      if (pointers.size < 2) gesture = null;
      return;
    }
    if (panning && panning.id === e.pointerId) {
      panning = null;
      canvas.classList.remove('ed-panning');
      return;
    }
    if (e.type === 'pointercancel') cancelStroke();
    else endStroke();
  };
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !pointers.size) {
      hover = null;
      updateHoverInfo();
      requestDraw();
    }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? cssH : 1;
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp((-e.deltaY * scale) / 300), e.clientX - r.left, e.clientY - r.top);
      else panBy(-e.deltaX * scale, -e.deltaY * scale);
    },
    { passive: false },
  );

  function updateHoverInfo(): void {
    if (hover && inGrid(hover)) {
      const ch = grid.cells[hover.y * grid.w + hover.x];
      hoverInfo.textContent = `${hover.x + 1}, ${hover.y + 1} · ${LEGEND[ch]?.label ?? 'Unknown'} (${ch})`;
    } else {
      hoverInfo.textContent = `${grid.w} × ${grid.h}`;
    }
  }

  // ----- keyboard -----

  const isTyping = (t: EventTarget | null) =>
    t instanceof HTMLElement && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');

  on(window, 'keydown', (e) => {
    if (modalClose) {
      if (e.key === 'Escape') {
        e.preventDefault();
        modalClose();
      }
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (isTyping(e.target)) return; // let fields keep their own undo
      if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      } else if (k === 'z') {
        e.preventDefault();
        undo();
      }
      return;
    }
    if (e.altKey || isTyping(e.target)) return;
    if (e.key === ' ') {
      if (e.target === canvas || e.target === document.body || e.target === shell) {
        spaceHeld = true;
        canvas.classList.add('ed-grab');
        e.preventDefault();
      }
      return;
    }
    if (e.key === '+') { zoomBy(1.25); e.preventDefault(); return; }
    if (e.key === '-') { zoomBy(1 / 1.25); e.preventDefault(); return; }
    if (e.key === '0') { fit(); e.preventDefault(); return; }
    const ch = LEGEND[e.key] ? e.key : LEGEND[e.key.toUpperCase()] && e.key.length === 1 ? e.key.toUpperCase() : null;
    if (ch) {
      e.preventDefault();
      selectTool(ch);
    }
  });
  on(window, 'keyup', (e) => {
    if (e.key === ' ') {
      spaceHeld = false;
      canvas.classList.remove('ed-grab');
    }
  });
  on(window, 'blur', () => {
    spaceHeld = false;
    canvas.classList.remove('ed-grab');
    endStroke();
  });

  // ----- change handling, validation, autosave -----

  let checkTimer = 0;
  cleanups.push(() => clearTimeout(checkTimer));

  function changed(gridChanged: boolean): void {
    if (gridChanged) {
      canvasCol.style.setProperty('--ed-aspect', (grid.h / grid.w).toFixed(3));
      syncSizeInputs();
      updateHoverInfo();
      requestDraw();
    }
    updateHistoryButtons();
    clearTimeout(checkTimer);
    checkTimer = window.setTimeout(runCheck, 150);
  }

  const text = () => gridToText(grid);

  function runCheck(): void {
    clearTimeout(checkTimer);
    checkTimer = 0;
    const t = text();
    issues = validateLevel(t);
    saveDraft(t, fieldsToMeta(fields));
    renderIssues();
    requestDraw();
  }

  function renderIssues(): void {
    issueList.replaceChildren();
    if (issues.length === 0) {
      statusEl.className = 'ed-status ok';
      statusEl.textContent = 'Valid ✓  Ready to play.';
      playBtn.disabled = false;
      playBtn.removeAttribute('title');
      playReason.textContent = '';
      return;
    }
    statusEl.className = 'ed-status bad';
    statusEl.textContent = issues.length === 1 ? '1 issue to fix' : `${issues.length} issues to fix`;
    playBtn.disabled = true;
    const reason = issues.length === 1 ? 'Fix 1 issue to play' : `Fix ${issues.length} issues to play`;
    playBtn.title = reason;
    playReason.textContent = reason;
    for (const is of issues.slice(0, 50)) {
      const hasTile = is.x !== undefined && is.y !== undefined;
      const item = el('li', {});
      if (hasTile || is.y !== undefined) {
        const b = el('button', { type: 'button', class: 'ed-issue', title: 'Show on the grid' }, is.message);
        b.addEventListener('click', () => centerOn(is.x ?? Math.floor(grid.w / 2), is.y ?? 0));
        item.append(b);
      } else {
        item.append(el('span', { class: 'ed-issue' }, is.message));
      }
      issueList.append(item);
    }
    if (issues.length > 50) issueList.append(el('li', { class: 'ed-more' }, `…and ${issues.length - 50} more.`));
  }

  // ----- actions -----

  function play(): void {
    endStroke();
    runCheck();
    if (issues.length) {
      toast('Fix the issues listed under Check first.');
      return;
    }
    opts.onPlay(text(), fieldsToMeta(fields));
  }

  function exit(): void {
    endStroke();
    runCheck();
    opts.onExit();
  }

  function shareUrl(): string {
    const code = encodeShare({ text: text(), meta: fieldsToMeta(fields) });
    return location.origin + location.pathname + '#level=' + code;
  }

  function share(): void {
    endStroke();
    runCheck();
    const url = shareUrl();
    const linkField = el('input', { type: 'text', readonly: true, class: 'ed-mono', 'aria-label': 'Share link', value: url });
    const showModal = (msg: string) => {
      openModal('Share link', [
        el('p', {}, msg),
        linkField,
        el('div', { class: 'ed-btnrow' }, btn('Copy link', () => copyText(url, linkField, 'Share link'), 'btn primary'), btn('Done', () => modalClose?.())),
      ]);
      linkField.focus();
      linkField.select();
    };
    const warn = issues.length ? ' This level still has issues, so it can’t be played until they’re fixed.' : '';
    try {
      const clip = navigator.clipboard;
      if (!clip || typeof clip.writeText !== 'function') throw new Error('no clipboard');
      clip.writeText(url).then(
        () => toast(`Share link copied (${url.length} characters).${warn}`, warn ? 4200 : 2600),
        () => showModal(`Copy this link and send it to a friend.${warn}`),
      );
    } catch {
      showModal(`Copy this link and send it to a friend.${warn}`);
    }
  }

  // ----- modal (import / export / share fallback) -----

  let modalClose: (() => void) | null = null;

  function openModal(title: string, body: Node[]): void {
    modalClose?.();
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const titleId = 'ed-modal-title';
    const panel = el('div', { class: 'ed-modal card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, el('h2', { id: titleId }, title), ...body);
    const backdrop = el('div', { class: 'ed-backdrop' }, panel);
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) modalClose?.();
    });
    // Keep Tab inside the dialog.
    panel.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const items = [...panel.querySelectorAll<HTMLElement>('button, input, textarea, select')].filter((x) => !x.hasAttribute('disabled'));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    });
    modalHost.append(backdrop);
    modalClose = () => {
      backdrop.remove();
      modalClose = null;
      returnFocus?.focus({ preventScroll: true });
    };
    const firstField = panel.querySelector<HTMLElement>('textarea, input, button');
    firstField?.focus();
  }

  function openExport(): void {
    endStroke();
    const t = text();
    const metaJson = JSON.stringify(fieldsToMeta(fields), null, 2);
    const gridArea = el('textarea', { class: 'ed-mono ed-gridtext', readonly: true, rows: String(Math.min(14, grid.h)), spellcheck: 'false', 'aria-label': 'Grid text' });
    gridArea.value = t;
    const metaArea = el('textarea', { class: 'ed-mono', readonly: true, rows: '6', spellcheck: 'false', 'aria-label': 'Meta JSON' });
    metaArea.value = metaJson;
    openModal('Export', [
      el('p', {}, 'Save the grid as ', el('code', {}, 'src/levels/<chapter>/<nn>.txt'), ' and the meta as the matching ', el('code', {}, '.json'), '.'),
      el('div', { class: 'ed-exphead' }, el('span', { class: 'eyebrow' }, `Grid · ${grid.w}×${grid.h}`), btn('Copy grid', () => copyText(t, gridArea, 'Grid'), 'btn ed-sm')),
      gridArea,
      el('div', { class: 'ed-exphead' }, el('span', { class: 'eyebrow' }, 'Meta JSON'), btn('Copy JSON', () => copyText(metaJson, metaArea, 'Meta JSON'), 'btn ed-sm')),
      metaArea,
      el('div', { class: 'ed-btnrow' }, btn('Done', () => modalClose?.(), 'btn primary')),
    ]);
  }

  function openImport(): void {
    endStroke();
    const gridArea = el('textarea', { class: 'ed-mono ed-gridtext', rows: '10', spellcheck: 'false', 'aria-label': 'Grid text or share link', placeholder: '########\n#S....E#\n########' });
    const metaArea = el('textarea', { class: 'ed-mono', rows: '4', spellcheck: 'false', 'aria-label': 'Meta JSON (optional)', placeholder: '{ "name": "My level", "stones": 3, "hint": "", "parTime": 90 }' });
    const err = el('p', { class: 'ed-error', role: 'alert' });
    const load = () => {
      err.textContent = '';
      const raw = gridArea.value;
      // A share code or link works too.
      if (/E1\.[A-Za-z0-9_-]/.test(raw) && !/[#.]{3}/.test(raw.replace(/E1\.[A-Za-z0-9_-]+/g, ''))) {
        const shared = decodeShare(raw);
        if (!shared) {
          err.textContent = 'That share link is damaged or incomplete.';
          return;
        }
        const res = importGrid(shared.text);
        if ('error' in res) {
          err.textContent = res.error;
          return;
        }
        modalClose?.();
        replaceAll(res.grid, metaToFields(shared.meta));
        toast('Imported from the share link. Undo to go back.');
        return;
      }
      const res = importGrid(raw);
      if ('error' in res) {
        err.textContent = res.error;
        return;
      }
      let f = fields;
      if (metaArea.value.trim()) {
        try {
          f = metaToFields(normalizeMeta(JSON.parse(metaArea.value) as unknown));
        } catch {
          err.textContent = 'The meta isn’t valid JSON. Fix it or leave it empty to keep the current name and settings.';
          return;
        }
      }
      modalClose?.();
      replaceAll(res.grid, f);
      toast(res.note ? `Imported. ${res.note}` : 'Imported. Undo to go back.');
    };
    openModal('Import', [
      el('p', {}, 'Paste a level grid (or a share link). Meta JSON is optional.'),
      field('Grid', gridArea, 'ed-field'),
      field('Meta JSON (optional)', metaArea, 'ed-field'),
      err,
      el('div', { class: 'ed-btnrow' }, btn('Load', load, 'btn primary'), btn('Cancel', () => modalClose?.())),
    ]);
  }

  // ----- start -----

  syncFieldInputs();
  canvasCol.style.setProperty('--ed-aspect', (grid.h / grid.w).toFixed(3));
  syncSizeInputs();
  setErasing(false);
  updateHistoryButtons();
  updateHoverInfo();
  runCheck();

  let destroyed = false;
  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      endStroke();
      if (checkTimer) runCheck();
      for (const c of cleanups.splice(0)) c();
      modalClose = null;
      shell.remove();
    },
  };
}
