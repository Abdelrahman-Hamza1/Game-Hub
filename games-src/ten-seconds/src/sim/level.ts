/**
 * Level files: an ASCII grid (`<nn>.txt`) plus settings (`<nn>.json`). Coordinates in JSON are
 * tile coordinates [x, y] (column, row); a tile's centre is (x + 0.5, y + 0.5). Angles in JSON
 * are degrees, 0 = right, 90 = down (screen coordinates).
 */
import { HEARING, LOOP_SECONDS, MAX_COPIES } from './constants';

export enum Tile {
  Floor = 0,
  Wall = 1,
  Window = 2,
  Low = 3,
  Door = 4,
  Emitter = 5,
}

export type Pt = [number, number];
export type ItemKind = 'target' | 'card' | 'mirror' | 'coin';
export type TriggerType = 'plate' | 'switch' | 'button' | 'lure' | 'shutter' | 'lever';
export type DoorRule = 'plate' | 'switch' | 'button' | 'card' | 'timer' | 'inverted' | 'cycle';
export type Dir = 'up' | 'down' | 'left' | 'right';

export interface TriggerDef {
  letter: string;
  type: TriggerType;
  tiles: Pt[];
  /** button: seconds it stays active */
  seconds: number;
  /** lure: the bell it rings (tile) */
  bell: Pt | null;
  /** shutter: index of the camera it blinds */
  camera: number;
  /** switch: starts on */
  on: boolean;
}

export interface DoorDef {
  letter: string;
  rule: DoorRule;
  wires: string[];
  invert: boolean;
  /** timer: open from open[0] to open[1] seconds */
  open: [number, number];
  /** cycle: open for `openFor` seconds every `period`, starting at `phase` */
  period: number;
  openFor: number;
  phase: number;
  tiles: Pt[];
  /** indexes into Level.triggers for `wires` */
  wireIdx: number[];
}

export interface GuardDef {
  x: number;
  y: number;
  route: Pt[];
  mode: 'pingpong' | 'loop';
  /** index of the first route point to walk to; default: the one ahead of the spawn */
  toward: number;
  /** seconds to stand at each route point */
  pause: number;
  /** auditor only: seconds to wait where the newest copy ended */
  wait: number;
  /** facing at the start (radians); defaults to toward the first route point */
  face: number | null;
  /** seconds of patrol already walked when the loop starts (shifts the guard's timing) */
  warmup: number;
  /** seconds standing at the spawn before setting off */
  start: number;
  /** per route point pause in seconds (overrides `pause` where given) */
  pauses: number[];
}

export interface CameraDef {
  x: number;
  y: number;
  from: number; // radians
  to: number;
  period: number; // seconds for a full sweep there and back
  phase: number; // 0..1
}

export interface LaserDef {
  x: number;
  y: number;
  dir: Dir;
  /** blinking: on for `on` seconds every `period` (period 0 = always on) */
  period: number;
  on: number;
  phase: number;
}

export interface LampDef {
  /** lit rectangle, tiles [x0, y0, x1, y1] inclusive */
  rect: [number, number, number, number];
  /** the pendulum's shadow: a circle swinging between two points */
  from: Pt;
  to: Pt;
  radius: number;
  period: number;
}

export interface WatchmakerDef {
  /** seconds between his rewinds */
  every: number;
  /** lever triggers that must all be held at that moment */
  levers: string[];
}

export interface Level {
  id: string;
  name: string;
  par: number;
  swiftTime: number;
  loopSeconds: number;
  maxCopies: number;
  hint: string;
  hearing: number;
  bodiesCollide: boolean;
  w: number;
  h: number;
  tiles: Uint8Array;
  doorAt: Int8Array;
  triggerAt: Int8Array;
  exitAt: Uint8Array;
  stoneAt: Uint8Array;
  start: Pt;
  exits: Pt[];
  items: { kind: ItemKind; x: number; y: number }[];
  crates: Pt[];
  bells: Pt[];
  stones: Pt[];
  doors: DoorDef[];
  triggers: TriggerDef[];
  guards: GuardDef[];
  auditors: GuardDef[];
  cameras: CameraDef[];
  lasers: LaserDef[];
  hounds: Pt[];
  lamps: LampDef[];
  watchmaker: WatchmakerDef | null;
  /** the source, for the editor and share codes */
  text: string;
  json: LevelJson;
}

/** The JSON settings file, as written by hand. */
export interface LevelJson {
  name?: string;
  /** what the target is called in messages ("the ruby") */
  targetName?: string;
  par?: number;
  swiftTime?: number;
  loopSeconds?: number;
  maxCopies?: number;
  hint?: string;
  hearing?: number;
  bodiesCollide?: boolean;
  doors?: Record<string, Partial<{ rule: DoorRule; wires: string[]; invert: boolean; open: [number, number]; period: number; openFor: number; phase: number }>>;
  triggers?: Record<string, Partial<{ type: TriggerType; seconds: number; bell: Pt; camera: number; on: boolean }>>;
  guards?: Partial<{ route: Pt[]; mode: 'pingpong' | 'loop'; toward: number; pause: number; face: number; warmup: number; start: number; pauses: number[] }>[];
  auditors?: Partial<{ route: Pt[]; mode: 'pingpong' | 'loop'; toward: number; pause: number; wait: number; face: number; warmup: number; start: number; pauses: number[] }>[];
  cameras?: Partial<{ from: number; to: number; period: number; phase: number }>[];
  lasers?: Partial<{ dir: Dir; period: number; on: number; phase: number }>[];
  lamps?: LampDef[];
  watchmaker?: WatchmakerDef;
}

const DEG = Math.PI / 180;

export function parseLevel(id: string, text: string, json: LevelJson): Level {
  const rows = text.replace(/\r/g, '').split('\n').filter((r, i, a) => r.length > 0 || i < a.length - 1);
  while (rows.length && rows[rows.length - 1] === '') rows.pop();
  const h = rows.length;
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const n = w * h;
  const tiles = new Uint8Array(n);
  const doorAt = new Int8Array(n).fill(-1);
  const triggerAt = new Int8Array(n).fill(-1);
  const exitAt = new Uint8Array(n);
  const stoneAt = new Uint8Array(n);
  const lv: Level = {
    id,
    name: json.name ?? id,
    par: json.par ?? 3,
    swiftTime: json.swiftTime ?? (json.loopSeconds ?? LOOP_SECONDS) * 0.8,
    loopSeconds: json.loopSeconds ?? LOOP_SECONDS,
    maxCopies: json.maxCopies ?? MAX_COPIES,
    hint: json.hint ?? '',
    hearing: json.hearing ?? HEARING,
    bodiesCollide: json.bodiesCollide ?? false,
    w,
    h,
    tiles,
    doorAt,
    triggerAt,
    exitAt,
    stoneAt,
    start: [-1, -1],
    exits: [],
    items: [],
    crates: [],
    bells: [],
    stones: [],
    doors: [],
    triggers: [],
    guards: [],
    auditors: [],
    cameras: [],
    lasers: [],
    hounds: [],
    lamps: json.lamps ?? [],
    watchmaker: json.watchmaker ?? null,
    text: rows.join('\n'),
    json,
  };

  const doorIdx = new Map<string, number>();
  const trigIdx = new Map<string, number>();
  const guardSpawns: Pt[] = [];
  const auditorSpawns: Pt[] = [];
  const cameraSpawns: Pt[] = [];
  const laserSpawns: Pt[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y][x] ?? '#';
      const i = y * w + x;
      let t = Tile.Floor;
      if (c === '#' || c === ' ') t = Tile.Wall;
      else if (c === '-') t = Tile.Window;
      else if (c === '_') t = Tile.Low;
      else if (c === '=') {
        t = Tile.Emitter;
        laserSpawns.push([x, y]);
      } else if (isDoorLetter(c)) {
        t = Tile.Door;
        let d = doorIdx.get(c);
        if (d === undefined) {
          d = lv.doors.length;
          doorIdx.set(c, d);
          const j = json.doors?.[c] ?? {};
          const rule = (j.rule ?? 'plate') as DoorRule;
          lv.doors.push({
            letter: c,
            rule,
            wires: j.wires ?? [],
            invert: !!j.invert,
            open: j.open ?? [0, 0],
            period: j.period ?? 4,
            openFor: j.openFor ?? 2,
            phase: j.phase ?? 0,
            tiles: [],
            wireIdx: [],
          });
        }
        lv.doors[d].tiles.push([x, y]);
        doorAt[i] = d;
      } else if (c >= 'a' && c <= 'h') {
        let g = trigIdx.get(c);
        if (g === undefined) {
          g = lv.triggers.length;
          trigIdx.set(c, g);
          const j = json.triggers?.[c] ?? {};
          lv.triggers.push({
            letter: c,
            type: (j.type ?? 'plate') as TriggerType,
            tiles: [],
            seconds: j.seconds ?? 3,
            bell: j.bell ?? null,
            camera: j.camera ?? 0,
            on: !!j.on,
          });
        }
        lv.triggers[g].tiles.push([x, y]);
        triggerAt[i] = g;
      } else {
        switch (c) {
          case 'S':
            lv.start = [x, y];
            break;
          case 'E':
            exitAt[i] = 1;
            lv.exits.push([x, y]);
            break;
          case 'T':
            lv.items.push({ kind: 'target', x, y });
            break;
          case 'K':
            lv.items.push({ kind: 'card', x, y });
            break;
          case 'M':
            lv.items.push({ kind: 'mirror', x, y });
            break;
          case '$':
            lv.items.push({ kind: 'coin', x, y });
            break;
          case 'O':
            lv.crates.push([x, y]);
            break;
          case '*':
            lv.bells.push([x, y]);
            break;
          case 'R':
            stoneAt[i] = 1;
            lv.stones.push([x, y]);
            break;
          case '@':
            guardSpawns.push([x, y]);
            break;
          case '!':
            auditorSpawns.push([x, y]);
            break;
          case '%':
            t = Tile.Wall; // cameras are mounted on a wall block
            cameraSpawns.push([x, y]);
            break;
          case '&':
            lv.hounds.push([x, y]);
            break;
          default:
            break; // '.', and anything unknown is floor
        }
      }
      tiles[i] = t;
    }
  }

  const route = (spawn: Pt, j: Partial<{ route: Pt[]; mode: 'pingpong' | 'loop'; toward: number; pause: number; wait: number; face: number; warmup: number; start: number; pauses: number[] }>): GuardDef => {
    const r = j.route && j.route.length ? j.route : [spawn];
    return {
      x: spawn[0],
      y: spawn[1],
      route: r,
      mode: j.mode ?? 'pingpong',
      toward: j.toward ?? aheadOf(spawn, r),
      pause: j.pause ?? 0,
      wait: j.wait ?? 3,
      face: j.face === undefined ? null : j.face * DEG,
      warmup: j.warmup ?? 0,
      start: j.start ?? 0,
      pauses: j.pauses ?? [],
    };
  };
  guardSpawns.forEach((s, k) => lv.guards.push(route(s, json.guards?.[k] ?? {})));
  auditorSpawns.forEach((s, k) => lv.auditors.push(route(s, json.auditors?.[k] ?? {})));
  cameraSpawns.forEach(([x, y], k) => {
    const j = json.cameras?.[k] ?? {};
    lv.cameras.push({
      x,
      y,
      from: (j.from ?? 45) * DEG,
      to: (j.to ?? 135) * DEG,
      period: j.period ?? 6,
      phase: j.phase ?? 0,
    });
  });
  laserSpawns.forEach(([x, y], k) => {
    const j = json.lasers?.[k] ?? {};
    lv.lasers.push({ x, y, dir: j.dir ?? 'right', period: j.period ?? 0, on: j.on ?? 0, phase: j.phase ?? 0 });
  });
  for (const d of lv.doors) d.wireIdx = d.wires.map((l) => lv.triggers.findIndex((t) => t.letter === l)).filter((g) => g >= 0);
  for (const t of lv.triggers) if (t.type === 'lure' && !t.bell && lv.bells.length) t.bell = lv.bells[0];
  return lv;
}

/** The route point a guard heads for first: the far end of the route segment nearest its spawn. */
function aheadOf(spawn: Pt, r: Pt[]): number {
  if (r.length < 2) return 0;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < r.length - 1; i++) {
    const d = distToSeg(spawn[0], spawn[1], r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]);
    if (d < bestD - 1e-9) {
      bestD = d;
      best = i + 1;
    }
  }
  return best;
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Problems with a level, as readable sentences. Empty means valid. */
export function validateLevel(lv: Level): string[] {
  const errs: string[] = [];
  const rows = lv.text.split('\n');
  if (rows.some((r) => r.length !== lv.w)) errs.push('The grid is not rectangular.');
  if (lv.w > 64 || lv.h > 40) errs.push(`The map is ${lv.w}×${lv.h}; the most is 64×40.`);
  const at = (x: number, y: number) => lv.tiles[y * lv.w + x];
  for (let x = 0; x < lv.w; x++) {
    if (!isBorder(rows[0]?.[x]) || !isBorder(rows[lv.h - 1]?.[x])) {
      errs.push('The border must be closed (walls all round).');
      break;
    }
  }
  for (let y = 0; y < lv.h; y++) {
    if (!isBorder(rows[y]?.[0]) || !isBorder(rows[y]?.[lv.w - 1])) {
      errs.push('The border must be closed (walls all round).');
      break;
    }
  }
  const count = (ch: string) => lv.text.split('').filter((c) => c === ch).length;
  if (count('S') !== 1) errs.push(`There must be exactly one start S (found ${count('S')}).`);
  if (!lv.exits.length) errs.push('There must be at least one exit tile E.');
  if (count('T') !== 1) errs.push(`There must be exactly one target T (found ${count('T')}).`);

  const json = lv.json;
  for (const d of lv.doors) {
    if (!json.doors?.[d.letter]) errs.push(`Door ${d.letter} has no settings in the JSON.`);
    if (d.rule === 'plate' || d.rule === 'switch' || d.rule === 'button' || d.rule === 'inverted') {
      if (!d.wires.length) errs.push(`Door ${d.letter} (${d.rule}) isn't wired to any trigger.`);
    }
    for (const wire of d.wires) {
      if (!lv.triggers.some((t) => t.letter === wire)) errs.push(`Door ${d.letter} is wired to "${wire}", which isn't on the map.`);
    }
  }
  for (const k of Object.keys(json.doors ?? {})) if (!lv.doors.some((d) => d.letter === k)) errs.push(`The JSON sets door ${k}, which isn't on the map.`);
  for (const k of Object.keys(json.triggers ?? {})) if (!lv.triggers.some((t) => t.letter === k)) errs.push(`The JSON sets trigger ${k}, which isn't on the map.`);
  for (const t of lv.triggers) {
    if (t.type === 'lure') {
      if (!t.bell) errs.push(`Lure ${t.letter} has no bell (* on the map).`);
      else if (lv.bells.length && !lv.bells.some((b) => b[0] === t.bell![0] && b[1] === t.bell![1])) errs.push(`Lure ${t.letter}'s bell [${t.bell}] isn't a * on the map.`);
    }
    if (t.type === 'shutter' && !lv.cameras[t.camera]) errs.push(`Shutter ${t.letter} points at camera ${t.camera}, which doesn't exist.`);
    const used = t.type === 'lure' || t.type === 'shutter' || lv.doors.some((d) => d.wires.includes(t.letter)) || !!lv.watchmaker?.levers.includes(t.letter);
    if (!used) errs.push(`Trigger ${t.letter} isn't wired to anything.`);
  }
  if ((json.guards?.length ?? 0) > lv.guards.length) errs.push('The JSON lists more guards than there are @ on the map.');
  if ((json.cameras?.length ?? 0) > lv.cameras.length) errs.push('The JSON lists more cameras than there are % on the map.');
  for (const g of [...lv.guards, ...lv.auditors]) {
    for (const p of g.route) {
      if (p[0] < 0 || p[1] < 0 || p[0] >= lv.w || p[1] >= lv.h || at(p[0], p[1]) === Tile.Wall) errs.push(`Guard route point [${p}] is not on the floor.`);
    }
    const pts = g.mode === 'loop' ? [...g.route, g.route[0]] : g.route;
    for (let i = 0; i + 1 < pts.length; i++) {
      if (!segmentWalkable(lv, pts[i], pts[i + 1])) errs.push(`Guard route [${pts[i]}] → [${pts[i + 1]}] runs through a wall.`);
    }
  }

  if (lv.start[0] >= 0) {
    const reach = reachable(lv, lv.start);
    const t = lv.items.find((i) => i.kind === 'target');
    if (t && !reach[t.y * lv.w + t.x]) errs.push('The target can\'t be reached from the start, even with every door open.');
    if (lv.exits.length && !lv.exits.some(([x, y]) => reach[y * lv.w + x])) errs.push('The exit can\'t be reached from the start, even with every door open.');
  }
  return errs;
}

/** Doors are A–H, except E, which is the exit. */
export function isDoorLetter(c: string): boolean {
  return c >= 'A' && c <= 'H' && c !== 'E';
}

function isBorder(c: string | undefined): boolean {
  return c === '#' || c === '=' || c === '%' || c === '-';
}

/** Flood fill from a tile with every door open and low walls passable (windows still block). */
export function reachable(lv: Level, from: Pt): Uint8Array {
  const seen = new Uint8Array(lv.w * lv.h);
  const q = [from[1] * lv.w + from[0]];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % lv.w;
    const y = (i - x) / lv.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= lv.w || ny >= lv.h) continue;
      const j = ny * lv.w + nx;
      const t = lv.tiles[j];
      if (seen[j] || t === Tile.Wall || t === Tile.Window || t === Tile.Emitter) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return seen;
}

function segmentWalkable(lv: Level, a: Pt, b: Pt): boolean {
  const ax = a[0] + 0.5;
  const ay = a[1] + 0.5;
  const bx = b[0] + 0.5;
  const by = b[1] + 0.5;
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 8) + 1;
  for (let i = 0; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n;
    const y = ay + ((by - ay) * i) / n;
    const t = lv.tiles[Math.floor(y) * lv.w + Math.floor(x)];
    if (t === Tile.Wall || t === Tile.Window || t === Tile.Low || t === Tile.Emitter) return false;
  }
  return true;
}

export const levelDeg = DEG;
