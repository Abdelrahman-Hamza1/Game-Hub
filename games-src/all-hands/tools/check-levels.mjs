#!/usr/bin/env node
// All Hands level checker. Dependency-free (Node 18+).
//
//   node tools/check-levels.mjs              check every level, print sizes
//   node tools/check-levels.mjs 3/05         check one level (world/nn)
//   node tools/check-levels.mjs 3            check one world
//   node tools/check-levels.mjs --show 3/05  also print the grid with x/y rulers
//
// Checks the format in DESIGN.md ("Level file format" and "Decisions"): rectangular, size
// limits, closed border (pits only in the bottom row), allowed characters, exactly 4 S standing
// on something solid, one K, one two-tile door, every lettered/numbered object has its JSON
// entry (counts match in reading order), wires reference existing gates, paths stay inside the
// map, required JSON keys, no unknown JSON keys.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'levels');
const MIN_W = 30, MIN_H = 17, MAX_W = 120, MAX_H = 40;

const ALLOWED = new Set('#.-SKD^vBc_oLM~j1234Csl'.split('').concat('ABCDEFGH'.split('').filter((c) => c !== 'B' && c !== 'C' && c !== 'D')));
// Gate letters. B, C and D are taken by block, checkpoint and door, so gates use A, E, F, G, H.
const GATE_LETTERS = new Set(['A', 'E', 'F', 'G', 'H']);
// Things a spawn, key, lantern, door or plate can rest on.
const SOLID = new Set(['#', '-', 'B', 'L', 'M', '~', 'j', 's', 'o', '1', '2', '3', '4', 'A', 'E', 'F', 'G', 'H']);
const KNOWN_KEYS = new Set([
  'name', 'hint', 'par', 'blocks', 'plates', 'buttons', 'gates', 'lifts', 'movers', 'bridges',
  'scales', 'leash', 'dark', 'scroll', 'solution', 'why4',
]);

function levelFiles(filter) {
  const out = [];
  if (!existsSync(ROOT)) return out;
  for (const w of readdirSync(ROOT).sort()) {
    const wdir = join(ROOT, w);
    let entries;
    try { entries = readdirSync(wdir); } catch { continue; }
    for (const f of entries.sort()) {
      if (!f.endsWith('.txt')) continue;
      const id = `${w}/${f.slice(0, -4)}`;
      if (filter && id !== filter && w !== filter) continue;
      out.push({ id, txt: join(wdir, f), json: join(wdir, f.slice(0, -4) + '.json') });
    }
  }
  return out;
}

// Connected components (4-neighbour) of tiles equal to ch, in reading order of their first tile.
function components(grid, ch) {
  const H = grid.length, W = grid[0].length;
  const seen = grid.map((r) => r.split('').map(() => false));
  const comps = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (grid[y][x] !== ch || seen[y][x]) continue;
    const tiles = [];
    const stack = [[x, y]];
    seen[y][x] = true;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      tiles.push([cx, cy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (seen[ny][nx] || grid[ny][nx] !== ch) continue;
        seen[ny][nx] = true;
        stack.push([nx, ny]);
      }
    }
    const xs = tiles.map((t) => t[0]), ys = tiles.map((t) => t[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    const w = Math.max(...xs) - x0 + 1, h = Math.max(...ys) - y0 + 1;
    comps.push({ x: x0, y: y0, w, h, count: tiles.length, rect: tiles.length === w * h });
  }
  comps.sort((a, b) => a.y - b.y || a.x - b.x);
  return comps;
}

// Horizontal runs of ch, in reading order.
function runs(grid, ch) {
  const out = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== ch) { x++; continue; }
      const x0 = x;
      while (x < row.length && row[x] === ch) x++;
      out.push({ x: x0, y, w: x - x0 });
    }
  });
  return out;
}

function show(grid) {
  const W = grid[0].length;
  let tens = '    ', ones = '    ';
  for (let x = 0; x < W; x++) { tens += x % 10 === 0 ? String(Math.floor(x / 10) % 10) : ' '; ones += x % 10; }
  console.log(tens + '\n' + ones);
  grid.forEach((r, y) => console.log(String(y).padStart(3) + ' ' + r));
}

function checkLevel({ id, txt, json }, opts) {
  const errs = [];
  const err = (m) => errs.push(m);
  const raw = readFileSync(txt, 'utf8').replace(/\r/g, '');
  const grid = raw.split('\n');
  while (grid.length && grid[grid.length - 1] === '') grid.pop();
  const H = grid.length, W = H ? grid[0].length : 0;
  if (opts.show) show(grid);

  let meta = null;
  if (!existsSync(json)) err('missing .json');
  else {
    try { meta = JSON.parse(readFileSync(json, 'utf8')); } catch (e) { err(`bad JSON: ${e.message}`); }
  }
  if (!meta) return { errs, W, H, meta: {} };

  // Shape and size.
  grid.forEach((r, y) => { if (r.length !== W) err(`row ${y} has length ${r.length}, expected ${W}`); });
  if (W < MIN_W || H < MIN_H) err(`too small: ${W}x${H} (min ${MIN_W}x${MIN_H})`);
  if (W > MAX_W || H > MAX_H) err(`too big: ${W}x${H} (max ${MAX_W}x${MAX_H})`);
  if (errs.length) return { errs, W, H, meta };

  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '#' : grid[y][x]);
  const solidBelow = (x, y) => SOLID.has(at(x, y + 1));

  // Characters.
  grid.forEach((r, y) => r.split('').forEach((c, x) => {
    if (!ALLOWED.has(c)) err(`unknown tile '${c}' at ${x},${y}`);
  }));

  // Border: top row and side columns solid; bottom row solid or pit.
  for (let x = 0; x < W; x++) {
    if (grid[0][x] !== '#') err(`top border open at ${x},0`);
    const b = grid[H - 1][x];
    if (b !== '#' && b !== '.') err(`bottom row must be # or . (pit), got '${b}' at ${x},${H - 1}`);
  }
  for (let y = 0; y < H; y++) {
    if (grid[y][0] !== '#') err(`left border open at 0,${y}`);
    if (grid[y][W - 1] !== '#') err(`right border open at ${W - 1},${y}`);
  }
  if (grid[H - 1][0] !== '#' || grid[H - 1][W - 1] !== '#') err('bottom corners must be #');

  const find = (ch) => {
    const out = [];
    grid.forEach((r, y) => r.split('').forEach((c, x) => { if (c === ch) out.push([x, y]); }));
    return out;
  };

  // Spawns.
  const spawns = find('S');
  if (spawns.length !== 4) err(`expected 4 S, found ${spawns.length}`);
  spawns.forEach(([x, y], i) => { if (!solidBelow(x, y)) err(`S (P${i + 1}) at ${x},${y} does not stand on anything solid`); });

  // Key.
  const keys = find('K');
  if (keys.length !== 1) err(`expected exactly one K, found ${keys.length}`);
  keys.forEach(([x, y]) => { if (!solidBelow(x, y)) err(`K at ${x},${y} does not rest on anything solid`); });

  // Door.
  const doors = find('D');
  if (doors.length !== 2) err(`expected exactly two D tiles, found ${doors.length}`);
  else {
    const [[x1, y1], [x2, y2]] = doors;
    if (x1 !== x2 || y2 !== y1 + 1) err('the two D tiles must be one above the other');
    else if (!solidBelow(x2, y2)) err(`door at ${x2},${y2} does not stand on anything solid`);
  }

  // Lantern.
  const lanterns = find('l');
  if (meta.dark) { if (lanterns.length !== 1) err(`dark level needs exactly one lantern 'l', found ${lanterns.length}`); }
  else if (lanterns.length) err('lantern l in a level that is not dark');
  lanterns.forEach(([x, y]) => { if (!solidBelow(x, y)) err(`lantern at ${x},${y} does not rest on anything solid`); });

  // Crates rest on something.
  find('c').forEach(([x, y]) => { if (!solidBelow(x, y) && at(x, y + 1) !== 'c') err(`crate at ${x},${y} floats`); });

  // Gates, blocks, lifts and movers are rectangles (the engine uses each group's bounding box).
  for (const ch of ['A', 'E', 'F', 'G', 'H', 'B', 'L', 'M']) {
    for (const c of components(grid, ch)) {
      if (!c.rect) err(`${ch} at ${c.x},${c.y} is not a rectangle (${c.count} tiles in a ${c.w}x${c.h} box)`);
    }
  }

  // Gates.
  const gateLetters = new Set();
  grid.forEach((r) => r.split('').forEach((c) => { if (GATE_LETTERS.has(c)) gateLetters.add(c); }));
  const gatesJson = meta.gates || {};
  for (const g of gateLetters) if (!gatesJson[g]) err(`gate ${g} has no entry in "gates"`);
  for (const g of Object.keys(gatesJson)) if (!gateLetters.has(g)) err(`"gates" lists ${g} but the grid has no ${g}`);
  const powered = new Set();
  const checkWires = (what, wires) => {
    if (!Array.isArray(wires) || !wires.length) { err(`${what}: needs a non-empty "wires" list`); return; }
    for (const w of wires) {
      if (!gateLetters.has(w)) err(`${what}: wire to gate ${w}, which is not in the grid`);
      powered.add(w);
    }
  };

  // Rectangle objects.
  const rectObjects = (ch, key, label) => {
    const comps = components(grid, ch);
    const list = meta[key] || [];
    comps.forEach((c, i) => { if (!c.rect) err(`${label} ${i + 1} at ${c.x},${c.y} is not a filled rectangle`); });
    if (comps.length !== list.length) err(`${comps.length} ${label}(s) in the grid but ${list.length} in "${key}"`);
    return comps;
  };
  const blocks = rectObjects('B', 'blocks', 'heavy block');
  (meta.blocks || []).forEach((b, i) => { if (!(Number.isInteger(b.n) && b.n >= 1 && b.n <= 4)) err(`blocks[${i}].n must be 1..4`); });
  void blocks;

  const checkPath = (what, comp, path) => {
    if (!Array.isArray(path) || path.length < 2) { err(`${what}: path needs at least two points`); return; }
    if (!comp) return;
    const [px, py] = path[0];
    if (px !== comp.x || py !== comp.y) err(`${what}: path starts at ${px},${py} but the object's top-left is ${comp.x},${comp.y}`);
    path.forEach((p, j) => {
      if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isInteger)) { err(`${what}: path point ${j} is not [x,y]`); return; }
      const [x, y] = p;
      if (x < 1 || y < 1 || x + comp.w > W - 1 || y + comp.h > H - 1) err(`${what}: path point ${j} (${x},${y}) leaves the map`);
      if (j > 0) {
        const [qx, qy] = path[j - 1];
        if (qx !== x && qy !== y) err(`${what}: path segment ${j - 1}->${j} is diagonal`);
      }
    });
  };
  const lifts = rectObjects('L', 'lifts', 'lift');
  (meta.lifts || []).forEach((l, i) => {
    if (!(Number.isInteger(l.n) && l.n >= 1 && l.n <= 4)) err(`lifts[${i}].n must be 1..4`);
    checkPath(`lifts[${i}]`, lifts[i], l.path);
  });
  const movers = rectObjects('M', 'movers', 'mover');
  (meta.movers || []).forEach((m, i) => {
    if (!(typeof m.speed === 'number' && m.speed > 0)) err(`movers[${i}].speed must be > 0`);
    checkPath(`movers[${i}]`, movers[i], m.path);
  });

  // Run objects.
  const plates = runs(grid, '_');
  if (plates.length !== (meta.plates || []).length) err(`${plates.length} plate(s) in the grid but ${(meta.plates || []).length} in "plates"`);
  plates.forEach((p) => { for (let x = p.x; x < p.x + p.w; x++) if (!solidBelow(x, p.y)) err(`plate tile ${x},${p.y} has nothing solid under it`); });
  (meta.plates || []).forEach((p, i) => {
    if (!(Number.isInteger(p.n) && p.n >= 1)) err(`plates[${i}].n must be >= 1`);
    checkWires(`plates[${i}]`, p.wires);
  });

  const buttons = find('o');
  if (buttons.length !== (meta.buttons || []).length) err(`${buttons.length} button(s) in the grid but ${(meta.buttons || []).length} in "buttons"`);
  (meta.buttons || []).forEach((b, i) => {
    checkWires(`buttons[${i}]`, b.wires);
    const toggle = b.toggle === true, hold = typeof b.hold === 'number' && b.hold > 0;
    if (toggle === hold) err(`buttons[${i}]: needs exactly one of "toggle":true or "hold":seconds`);
  });
  buttons.forEach(([x, y]) => {
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => SOLID.has(at(x + dx, y + dy)) && at(x + dx, y + dy) !== 'o');
    if (!n) err(`button at ${x},${y} is not mounted on anything`);
  });

  const bridges = runs(grid, '~');
  if (bridges.length !== (meta.bridges || []).length) err(`${bridges.length} bridge(s) in the grid but ${(meta.bridges || []).length} in "bridges"`);
  (meta.bridges || []).forEach((b, i) => { if (!(Number.isInteger(b.n) && b.n >= 1)) err(`bridges[${i}].n must be >= 1`); });

  const pans = runs(grid, 's');
  if (pans.length % 2) err(`${pans.length} scale pans: pans come in pairs`);
  if (meta.scales && meta.scales.length !== pans.length / 2) err(`${pans.length / 2} scale(s) in the grid but ${meta.scales.length} in "scales"`);

  for (const g of gateLetters) if (!powered.has(g)) err(`gate ${g} is not wired to any plate or button`);
  for (const [g, v] of Object.entries(gatesJson)) {
    if (typeof v !== 'object' || (v.invert !== undefined && typeof v.invert !== 'boolean')) err(`gates.${g} must be {"invert":bool}`);
  }

  // Level options and text keys.
  for (const k of Object.keys(meta)) if (!KNOWN_KEYS.has(k)) err(`unknown JSON key "${k}"`);
  if (typeof meta.name !== 'string' || !meta.name) err('missing "name"');
  if (typeof meta.hint !== 'string' || !meta.hint) err('missing "hint"');
  if (!(typeof meta.par === 'number' && meta.par > 0)) err('missing "par" (seconds)');
  if (!Array.isArray(meta.solution) || !meta.solution.length || !meta.solution.every((s) => typeof s === 'string')) err('"solution" must be a list of steps');
  if (typeof meta.why4 !== 'string' || !meta.why4) err('missing "why4"');
  if (meta.leash !== undefined && !(typeof meta.leash === 'number' && meta.leash > 0)) err('"leash" must be a number > 0');
  if (meta.dark !== undefined && typeof meta.dark !== 'boolean') err('"dark" must be true/false');
  if (meta.scroll !== undefined && !(typeof meta.scroll === 'number' && meta.scroll > 0)) err('"scroll" must be a number > 0');

  return { errs, W, H, meta };
}

const args = process.argv.slice(2);
const opts = { show: args.includes('--show') };
const filter = args.find((a) => !a.startsWith('--'));
const files = levelFiles(filter);
if (!files.length) { console.error(filter ? `no level ${filter}` : `no levels under ${ROOT}`); process.exit(1); }

let bad = 0;
for (const f of files) {
  const { errs, W, H, meta } = checkLevel(f, opts);
  const flags = [meta.dark && 'dark', meta.leash && `leash ${meta.leash}`, meta.scroll && `scroll ${meta.scroll}`].filter(Boolean).join(', ');
  const status = errs.length ? 'FAIL' : 'ok  ';
  console.log(`${status} ${f.id.padEnd(5)} ${String(W).padStart(3)}x${String(H).padEnd(3)} ${(meta.name || '').padEnd(24)} ${flags}`);
  for (const e of errs) console.log(`       - ${e}`);
  if (errs.length) bad++;
}
console.log(`\n${files.length - bad}/${files.length} levels pass`);
process.exit(bad ? 1 : 0);
