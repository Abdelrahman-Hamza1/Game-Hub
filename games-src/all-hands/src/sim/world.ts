/**
 * The simulation: one level, four players, fixed 60 Hz ticks, fully deterministic (no clocks, no
 * Math.random, stable orders). The host runs it; screens and guests only read its state.
 *
 * One tick, in order:
 *   1. players read input (run, jump, grab, door)       player.ts
 *   2. team pushes are counted; pushed things get speed  push()
 *   3. platforms (lifts, movers, scale pans) move,        objects/*.move
 *      pushing what's in their way
 *   4. bodies move, lowest first, riding what they stand on, then their own speed
 *   5. contacts: what each body stands on, and whether that stack reaches the ground
 *   6. grabs and throws, the key, the door, spikes, pits, flags   player.ts
 *   7. objects update: plates, buttons, bridges, scales, gates    objects/*.update
 *   8. camera
 */
import {
  CRATE_SIZE,
  DT,
  EPS,
  FALL_CAP,
  GRAVITY,
  MAX_ZOOM_OUT,
  PLAYER_H,
  PLAYER_W,
  POP_TICKS,
  PUSH_SPEED,
  SPRING_V,
  TOUCH,
  VIEW_H,
  VIEW_W,
} from './constants';
import { groups, bounds, T, type Level } from './level';
import { buildThings } from './objects/registry';
import { playerControl, playerAfter, respawnPlayer } from './player';
import type { Body, BodyKind, GameEvent, GameEventType, Solid, Thing } from './types';

export interface Camera {
  /** centre of the view, in tiles */
  x: number;
  y: number;
  /** 1 = the normal 30×17 view; up to 1.6 when the team spreads out */
  zoom: number;
  /** left edge on scroll levels */
  scrollX: number;
}

export class World {
  readonly lv: Level;
  t = 0;
  bodies: Body[] = [];
  players: Body[] = [];
  things: Thing[] = [];
  key!: Body;
  lantern: Body | null = null;
  doorOpen = false;
  /** respawn point from the last flag touched */
  flag: [number, number] | null = null;
  power: Record<string, boolean> = {};
  cam: Camera = { x: 0, y: 0, zoom: 1, scrollX: 0 };
  status: 'playing' | 'won' = 'playing';
  wonTick = -1;
  pops = 0;
  events: GameEvent[] = [];
  /** per-player input bits for the current tick */
  input = [0, 0, 0, 0];
  private nextId = 1;

  constructor(lv: Level) {
    this.lv = lv;
    lv.spawns.forEach(([x, y], n) => {
      const b = this.addBody('player', x + (1 - PLAYER_W) / 2, y + 1 - PLAYER_H, PLAYER_W, PLAYER_H);
      b.p = { n, face: 1, coyote: 0, buffer: 0, jumpHeld: false, prev: 0, inside: false, pop: 0, thrown: false, pushing: false, onFlag: -1 };
      this.players.push(b);
    });
    const [kx, ky] = lv.key;
    this.key = this.addBody('key', kx + 0.2, ky + 0.55, 0.6, 0.45);
    if (lv.lantern) this.lantern = this.addBody('lantern', lv.lantern[0] + 0.25, lv.lantern[1] + 0.35, 0.5, 0.65);
    for (const cell of groups(lv, 'c')) {
      for (const [x, y] of cell) this.addBody('crate', x + (1 - CRATE_SIZE) / 2, y + 1 - CRATE_SIZE, CRATE_SIZE, CRATE_SIZE);
    }
    groups(lv, 'B').forEach((cells, i) => {
      const r = bounds(cells);
      const b = this.addBody('block', r.x, r.y, r.w, r.h);
      b.pushN = lv.json.blocks?.[i]?.n ?? r.w * r.h;
      b.weight = b.pushN;
    });
    this.things = buildThings(lv);
    for (const th of this.things) th.update?.(this);
    this.contacts();
    this.updateCamera(true);
  }

  private addBody(kind: BodyKind, x: number, y: number, w: number, h: number): Body {
    const b: Body = {
      id: this.nextId++,
      kind,
      x,
      y,
      w,
      h,
      vx: 0,
      vy: 0,
      solid: kind === 'player' || kind === 'crate' || kind === 'block',
      pushN: kind === 'crate' ? 1 : 0,
      weight: kind === 'player' || kind === 'crate' ? 1 : 0,
      grabbable: kind !== 'block',
      carrier: null,
      carrying: null,
      support: null,
      supported: false,
      dx: 0,
      dy: 0,
      home: [x, y],
      gone: false,
      lost: false,
      moving: false,
      p: null,
    };
    this.bodies.push(b);
    return b;
  }

  emit(type: GameEventType, x: number, y: number, p = -1, on?: boolean): void {
    this.events.push({ type, x, y, p, on });
  }

  // ───────────────────────── the tick ─────────────────────────

  step(input: readonly number[]): void {
    if (this.status === 'won') {
      this.t++;
      return;
    }
    for (let i = 0; i < 4; i++) this.input[i] = input[i] | 0;
    for (const b of this.bodies) {
      b.dx = 0;
      b.dy = 0;
    }
    for (const th of this.things) {
      th.dx = 0;
      th.dy = 0;
    }
    for (const p of this.players) playerControl(this, p, this.input[p.p!.n]);
    this.push();
    for (const th of this.things) th.move?.(this);
    this.moveBodies();
    this.contacts();
    for (const p of this.players) playerAfter(this, p, this.input[p.p!.n]);
    this.lostThings();
    this.power = {};
    for (const th of this.things) th.update?.(this);
    this.updateCamera(false);
    if (this.players.every((p) => p.p!.inside)) {
      this.status = 'won';
      this.wonTick = this.t;
      const d = this.lv.door;
      this.emit('win', d.x + 0.5, d.y + 1);
    }
    this.t++;
  }

  // ───────────────────────── collision ─────────────────────────

  tileAt(x: number, y: number): T {
    if (x < 0 || x >= this.lv.w || y < 0) return T.Solid;
    if (y >= this.lv.h) return T.Air; // pits fall out of the map
    return this.lv.tiles[y * this.lv.w + x] as T;
  }

  /** Every solid overlapping the box (grown by a margin), for a moving body. */
  solidsNear(x: number, y: number, w: number, h: number, self: Body | null): Solid[] {
    const out: Solid[] = [];
    const x0 = Math.floor(x - 1);
    const x1 = Math.floor(x + w + 1);
    const y0 = Math.floor(y - 1);
    const y1 = Math.floor(y + h + 1);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = this.tileAt(tx, ty);
        if (t === T.Air || t === T.SpikeUp || t === T.SpikeDown) continue;
        out.push({ x: tx, y: ty, w: 1, h: 1, tile: t, body: null, thing: null });
      }
    }
    for (const th of this.things) {
      for (const r of th.boxes()) {
        if (r.x > x + w + 1 || r.x + r.w < x - 1 || r.y > y + h + 1 || r.y + r.h < y - 1) continue;
        out.push({ x: r.x, y: r.y, w: r.w, h: r.h, tile: null, body: null, thing: th });
      }
    }
    for (const b of this.bodies) {
      if (b === self || !b.solid || b.gone || b.lost) continue;
      if (self && (b.carrier === self || self.carrier === b)) continue;
      if (b.x > x + w + 1 || b.x + b.w < x - 1 || b.y > y + h + 1 || b.y + b.h < y - 1) continue;
      out.push({ x: b.x, y: b.y, w: b.w, h: b.h, tile: null, body: b, thing: null });
    }
    return out;
  }

  /** May `mover` (and what it carries) pass through this solid? */
  passes(mover: Body, s: Solid, axis: 'x' | 'y', d: number, prevBottom: number): boolean {
    if (s.tile === T.OneWay) return !(axis === 'y' && d > 0 && prevBottom <= s.y + EPS);
    if (s.tile !== null && s.tile >= T.Color1 && s.tile <= T.Color4) {
      const n = s.tile - T.Color1;
      const base = mover.carrier ?? mover;
      if (!base.p || base.p.n !== n) return false;
      const c = base.carrying;
      return !(c && c.p && c.p.n !== n);
    }
    if (s.body) {
      // what you carry, and who carries you, never block you
      if (s.body === mover.carrying || s.body === mover.carrier) return true;
      if (mover.carrier && s.body === mover.carrier.carrying) return true;
    }
    return false;
  }

  /**
   * How far a box can move along one axis before touching a solid.
   * Returns the allowed distance (same sign as d) and what it hit.
   */
  sweep(mover: Body, bx: number, by: number, bw: number, bh: number, axis: 'x' | 'y', d: number, ignore: Body | null): { d: number; hit: Solid | null } {
    if (d === 0) return { d: 0, hit: null };
    const sx = axis === 'x' ? Math.min(bx, bx + d) : bx;
    const sy = axis === 'y' ? Math.min(by, by + d) : by;
    const sw = axis === 'x' ? bw + Math.abs(d) : bw;
    const sh = axis === 'y' ? bh + Math.abs(d) : bh;
    let best = d;
    let hit: Solid | null = null;
    const prevBottom = by + bh;
    for (const s of this.solidsNear(sx, sy, sw, sh, mover)) {
      if (s.body && (s.body === ignore || s.body === mover)) continue;
      if (this.passes(mover, s, axis, d, prevBottom)) continue;
      if (axis === 'x') {
        if (s.y >= by + bh - EPS || s.y + s.h <= by + EPS) continue;
        if (d > 0) {
          if (s.x < bx + bw - EPS) continue; // already overlapping or behind
          const gap = s.x - (bx + bw);
          if (gap < best) {
            best = Math.max(0, gap);
            hit = s;
          }
        } else {
          if (s.x + s.w > bx + EPS) continue;
          const gap = s.x + s.w - bx;
          if (gap > best) {
            best = Math.min(0, gap);
            hit = s;
          }
        }
      } else {
        if (s.x >= bx + bw - EPS || s.x + s.w <= bx + EPS) continue;
        if (d > 0) {
          if (s.y < by + bh - EPS) continue;
          const gap = s.y - (by + bh);
          if (gap < best) {
            best = Math.max(0, gap);
            hit = s;
          }
        } else {
          if (s.y + s.h > by + EPS) continue;
          const gap = s.y + s.h - by;
          if (gap > best) {
            best = Math.min(0, gap);
            hit = s;
          }
        }
      }
    }
    return { d: best, hit };
  }

  /** The box a carried thing occupies above its carrier. */
  carriedPos(carrier: Body, c: Body): [number, number] {
    return [carrier.x + (carrier.w - c.w) / 2, carrier.y - c.h];
  }

  /** Move a body (and what it carries) along one axis; returns how far it went and what stopped it. */
  moveAxis(b: Body, axis: 'x' | 'y', d: number, limitLo = -Infinity, limitHi = Infinity): { d: number; hit: Solid | null } {
    if (d === 0) return { d: 0, hit: null };
    if (axis === 'x') {
      if (d > 0) d = Math.min(d, Math.max(0, limitHi - b.x));
      else d = Math.max(d, Math.min(0, limitLo - b.x));
    }
    let r = this.sweep(b, b.x, b.y, b.w, b.h, axis, d, null);
    const c = b.carrying;
    if (c && c.solid) {
      const [cx, cy] = this.carriedPos(b, c);
      const rc = this.sweep(b, cx, cy, c.w, c.h, axis, d, c);
      if (Math.abs(rc.d) < Math.abs(r.d)) r = rc;
    }
    if (axis === 'x') {
      b.x += r.d;
      b.dx += r.d;
    } else {
      b.y += r.d;
      b.dy += r.d;
    }
    this.placeCarried(b);
    return r;
  }

  placeCarried(b: Body): void {
    const c = b.carrying;
    if (!c) return;
    const [cx, cy] = this.carriedPos(b, c);
    c.dx += cx - c.x;
    c.dy += cy - c.y;
    c.x = cx;
    c.y = cy;
    this.placeCarried(c);
  }

  /**
   * Push a body along an axis (platforms and closing gates do this). Whatever it runs into is
   * pushed too; static things stop it. Returns how far it went.
   */
  shove(b: Body, axis: 'x' | 'y', d: number, depth = 0): number {
    if (depth > 8 || d === 0) return 0;
    let moved = 0;
    for (let i = 0; i < 4 && Math.abs(moved - d) > EPS; i++) {
      const r = this.moveAxis(b, axis, d - moved);
      moved += r.d;
      const hb = r.hit?.body;
      if (!hb || hb.carrier) break;
      const got = this.shove(hb, axis, d - moved, depth + 1);
      if (Math.abs(got) < EPS) break;
    }
    return moved;
  }

  /**
   * Move a platform by (dx, dy), shoving bodies in its way. Riders standing on it follow in
   * moveBodies(). Returns how far it went on each axis.
   */
  movePlatform(th: Thing, box: { x: number; y: number; w: number; h: number }, dx: number, dy: number): [number, number] {
    const out: [number, number] = [0, 0];
    for (const axis of ['x', 'y'] as const) {
      const d = axis === 'x' ? dx : dy;
      if (Math.abs(d) < EPS) continue;
      // bodies in the swept area get shoved first
      const sx = axis === 'x' ? Math.min(box.x, box.x + d) : box.x;
      const sy = axis === 'y' ? Math.min(box.y, box.y + d) : box.y;
      const sw = axis === 'x' ? box.w + Math.abs(d) : box.w;
      const sh = axis === 'y' ? box.h + Math.abs(d) : box.h;
      let allowed = d;
      const inWay = this.bodies
        .filter((b) => b.solid && !b.gone && !b.lost && !b.carrier && b.x < sx + sw - EPS && b.x + b.w > sx + EPS && b.y < sy + sh - EPS && b.y + b.h > sy + EPS)
        .sort((a, b) => (axis === 'x' ? (d > 0 ? a.x - b.x : b.x - a.x) : d > 0 ? a.y - b.y : b.y - a.y));
      for (const b of inWay) {
        // how far the body must go to clear the platform's new position
        let need: number;
        if (axis === 'x') need = d > 0 ? box.x + box.w + d - b.x : box.x + d - (b.x + b.w);
        else need = d > 0 ? box.y + box.h + d - b.y : box.y + d - (b.y + b.h);
        if (Math.sign(need) !== Math.sign(d)) continue;
        const got = this.shove(b, axis, need);
        const short = need - got;
        if (Math.abs(short) > EPS) allowed = d > 0 ? Math.min(allowed, d - short) : Math.max(allowed, d - short);
      }
      // static solids stop it too
      const r = this.sweepThing(th, box, axis, allowed);
      if (axis === 'x') {
        box.x += r;
        out[0] = r;
      } else {
        box.y += r;
        out[1] = r;
      }
    }
    th.dx += out[0];
    th.dy += out[1];
    return out;
  }

  /** Static tiles and other things in a platform's way (bodies were already shoved). */
  private sweepThing(th: Thing, box: { x: number; y: number; w: number; h: number }, axis: 'x' | 'y', d: number): number {
    if (d === 0) return 0;
    const sx = axis === 'x' ? Math.min(box.x, box.x + d) : box.x;
    const sy = axis === 'y' ? Math.min(box.y, box.y + d) : box.y;
    const sw = axis === 'x' ? box.w + Math.abs(d) : box.w;
    const sh = axis === 'y' ? box.h + Math.abs(d) : box.h;
    let best = d;
    for (const s of this.solidsNear(sx, sy, sw, sh, null)) {
      if (s.thing === th) continue;
      if (s.tile === T.OneWay) continue;
      if (s.body) {
        // a body that couldn't be shoved stops the platform
        if (s.body.carrier) continue;
      }
      if (axis === 'x') {
        if (s.y >= box.y + box.h - EPS || s.y + s.h <= box.y + EPS) continue;
        if (d > 0 && s.x >= box.x + box.w - EPS) best = Math.min(best, Math.max(0, s.x - (box.x + box.w)));
        if (d < 0 && s.x + s.w <= box.x + EPS) best = Math.max(best, Math.min(0, s.x + s.w - box.x));
      } else {
        if (s.x >= box.x + box.w - EPS || s.x + s.w <= box.x + EPS) continue;
        if (d > 0 && s.y >= box.y + box.h - EPS) best = Math.min(best, Math.max(0, s.y - (box.y + box.h)));
        if (d < 0 && s.y + s.h <= box.y + EPS) best = Math.max(best, Math.min(0, s.y + s.h - box.y));
      }
    }
    return best;
  }

  // ───────────────────────── pushing ─────────────────────────

  /** Players pressing toward `b` from one side, counting conga lines. */
  pushers(b: Body, dir: 1 | -1): Body[] {
    const want = dir > 0 ? 2 : 1; // In.Right : In.Left
    // a pusher stands on the floor (or a platform or block), not on a friend's head
    const presses = (p: Body) => !p.gone && !p.carrier && !p.p!.inside && p.support?.body?.kind !== 'player' && (this.input[p.p!.n] & 3) === want;
    const out: Body[] = [];
    let front: Body[] = [b];
    const seen = new Set<Body>();
    while (front.length) {
      const next: Body[] = [];
      for (const f of front) {
        for (const p of this.players) {
          if (seen.has(p) || !presses(p)) continue;
          const touching = dir > 0 ? Math.abs(p.x + p.w - f.x) <= TOUCH : Math.abs(f.x + f.w - p.x) <= TOUCH;
          const overlapY = Math.min(p.y + p.h, f.y + f.h) - Math.max(p.y, f.y);
          if (touching && overlapY > 0.3) {
            seen.add(p);
            out.push(p);
            next.push(p);
          }
        }
      }
      front = next;
    }
    return out;
  }

  private push(): void {
    for (const p of this.players) p.p!.pushing = false;
    for (const b of this.bodies) {
      if (!b.pushN || b.gone || b.lost || b.carrier) continue;
      const onGround = b.support !== null;
      if (!onGround) continue; // thrown or falling things keep their speed
      const right = this.pushers(b, 1);
      const left = this.pushers(b, -1);
      let dir = 0;
      if (right.length >= b.pushN && right.length > left.length) dir = 1;
      else if (left.length >= b.pushN && left.length > right.length) dir = -1;
      b.vx = dir * PUSH_SPEED;
      b.moving = dir !== 0;
      if (dir) {
        for (const p of dir > 0 ? right : left) {
          p.p!.pushing = true;
          p.vx = Math.max(-PUSH_SPEED, Math.min(PUSH_SPEED, p.vx));
        }
        this.emit('push', b.x + b.w / 2, b.y + b.h, -1);
      }
    }
  }

  // ───────────────────────── movement ─────────────────────────

  private moveBodies(): void {
    const order = this.bodies
      .filter((b) => !b.gone && !b.lost && !b.carrier)
      .sort((a, b) => b.y + b.h - (a.y + a.h) || b.x * Math.sign(b.vx || 0) - a.x * Math.sign(a.vx || 0) || a.id - b.id);
    const [lo, hi] = this.spanLimits();
    for (const b of order) {
      // ride whatever it stands on
      const s = b.support;
      // heavy blocks don't ride players: one player can't carry what needs several to push
      if (s && !(b.kind === 'block' && s.body?.kind === 'player')) {
        const mx = s.body ? s.body.dx : s.thing ? s.thing.dx : 0;
        const my = s.body ? s.body.dy : s.thing ? s.thing.dy : 0;
        if (mx) this.moveAxis(b, 'x', mx);
        if (my > 0) this.moveAxis(b, 'y', my);
      }
      // own speed
      if (b.kind !== 'player' || !b.p!.inside) {
        b.vy = Math.min(FALL_CAP, b.vy + GRAVITY * DT);
      }
      const isP = b.kind === 'player';
      const rx = this.moveAxis(b, 'x', b.vx * DT, isP ? lo : -Infinity, isP ? hi : Infinity);
      if (rx.hit && b.kind !== 'player') b.vx = 0;
      const vy0 = b.vy;
      let ry = this.moveAxis(b, 'y', b.vy * DT);
      // rising into whoever stands on you lifts them too (and stops if they hit the ceiling)
      let goneUp = ry.d;
      for (let i = 0; i < 4 && b.vy < 0 && ry.hit?.body && this.ridesOn(ry.hit.body, b); i++) {
        const want = b.vy * DT - goneUp;
        if (this.shove(ry.hit.body, 'y', want) === 0) break;
        ry = this.moveAxis(b, 'y', want);
        goneUp += ry.d;
      }
      // corner nudge: a head that only clips the edge of a friend above slides past instead of
      // bonking (standing next to a stack, the rider can overhang you by a few hundredths)
      if (vy0 < 0 && ry.hit?.body && !this.ridesOn(ry.hit.body, b)) {
        const o = ry.hit.body;
        const overlap = Math.min(b.x + b.w, o.x + o.w) - Math.max(b.x, o.x);
        if (overlap > 0 && overlap <= 0.15) {
          const shift = (b.x + b.w / 2 < o.x + o.w / 2 ? -1 : 1) * (overlap + 0.002);
          if (this.boxFree(b.x + shift, b.y, b.w, b.h, b)) {
            b.x += shift;
            b.dx += shift;
            this.placeCarried(b);
            const more = this.moveAxis(b, 'y', b.vy * DT - ry.d);
            ry = { d: ry.d + more.d, hit: more.hit };
          }
        }
      }
      // pushing a rider up isn't hitting a ceiling
      if (ry.hit && !(vy0 < 0 && ry.hit.body && this.ridesOn(ry.hit.body, b))) {
        if (vy0 > 0) {
          if (ry.hit.tile === T.Spring) {
            b.vy = -SPRING_V;
            this.emit('spring', b.x + b.w / 2, b.y + b.h, b.p ? b.p.n : -1);
          } else {
            b.vy = 0;
            if (vy0 > 6) this.emit('land', b.x + b.w / 2, b.y + b.h, b.p ? b.p.n : -1);
            if (b.kind !== 'player') b.vx = b.pushN && b.moving ? b.vx : 0;
            if (b.p) b.p.thrown = false;
          }
        } else b.vy = 0;
      }
    }
  }

  /**
   * Players can't spread wider than the camera allows, or twice the leash (nobody more than
   * `leash` tiles from the middle of the team), or outside the scroll window.
   */
  spanLimits(): [number, number] {
    const act = this.players.filter((p) => !p.gone && !p.carrier);
    if (this.lv.json.scroll) return [this.cam.scrollX, this.cam.scrollX + VIEW_W - PLAYER_W];
    let lo = -Infinity;
    let hi = Infinity;
    if (act.length >= 2) {
      const xs = act.map((p) => p.x);
      const leash = this.lv.json.leash ?? 0;
      const span = leash ? 2 * leash : VIEW_W * MAX_ZOOM_OUT - 2;
      hi = Math.min(...xs) + span - PLAYER_W;
      lo = Math.max(...xs) - span + PLAYER_W;
    }
    return [lo, hi];
  }

  // ───────────────────────── contacts ─────────────────────────

  /** What each body stands on, and whether its stack reaches something fixed. */
  contacts(): void {
    const order = this.bodies.filter((b) => !b.gone && !b.lost).sort((a, b) => b.y + b.h - (a.y + a.h) || a.id - b.id);
    for (const b of order) {
      if (b.carrier) {
        b.support = null;
        b.supported = b.carrier.supported;
        continue;
      }
      let best: Solid | null = null;
      let bestOverlap = 0;
      const bottom = b.y + b.h;
      for (const s of this.solidsNear(b.x, b.y, b.w, b.h, b)) {
        if (s.body && (s.body === b.carrying || !s.body.solid)) continue;
        if (Math.abs(s.y - bottom) > TOUCH) continue;
        if (s.tile !== null && s.tile >= T.Color1 && s.tile <= T.Color4 && this.passes(b, s, 'y', 1, bottom)) continue;
        const ov = Math.min(b.x + b.w, s.x + s.w) - Math.max(b.x, s.x);
        if (ov <= EPS) continue;
        if (ov > bestOverlap) {
          bestOverlap = ov;
          best = s;
        }
      }
      b.support = b.vy < -EPS ? null : best;
      if (!b.support) b.supported = false;
      else if (b.support.body) b.supported = b.support.body.supported;
      else b.supported = true;
    }
  }

  /** Does `r` stand on `base` (directly, or through whatever base carries)? */
  ridesOn(r: Body, base: Body): boolean {
    const s = r.support?.body;
    if (!s) return false;
    return s === base || s.carrier === base || (s.carrier?.carrier ?? null) === base;
  }

  /** Bodies standing directly on a body or thing. */
  ridersOf(owner: Body | Thing): Body[] {
    return this.bodies.filter((b) => !b.gone && !b.lost && b.support && (b.support.body === owner || b.support.thing === owner));
  }

  /** Weight of a body with everything on it and in its hands. */
  weightOf(b: Body, depth = 0): number {
    if (depth > 12) return 0;
    let w = b.weight;
    if (b.carrying) w += this.weightOf(b.carrying, depth + 1);
    for (const r of this.ridersOf(b)) w += this.weightOf(r, depth + 1);
    return w;
  }

  /** Players in a body's or thing's stack (riders, riders of riders, carried). */
  playersOn(owner: Body | Thing, depth = 0): number {
    if (depth > 12) return 0;
    let n = 0;
    for (const r of this.ridersOf(owner)) {
      if (r.kind === 'player') n++;
      if (r.carrying && r.carrying.kind === 'player') n++;
      n += this.playersOn(r, depth + 1);
    }
    return n;
  }

  /** Total weight resting on a tile row segment (a plate: bodies standing on the tile below it). */
  weightOnRow(x: number, w: number, floorY: number): number {
    let total = 0;
    for (const b of this.bodies) {
      if (b.gone || b.lost || b.carrier || !b.support) continue;
      if (Math.abs(b.y + b.h - floorY) > TOUCH) continue;
      if (b.support.body) continue; // counted through what it stands on
      if (Math.min(b.x + b.w, x + w) - Math.max(b.x, x) <= EPS) continue;
      total += this.weightOf(b);
    }
    return total;
  }

  // ───────────────────────── lost things ─────────────────────────

  /** Things that fell out of the map come back home once home is clear. */
  private lostThings(): void {
    for (const b of this.bodies) {
      if (b.kind === 'player' || b.carrier) continue;
      if (!b.lost && b.y > this.lv.h + 2) {
        b.lost = true;
        b.vx = 0;
        b.vy = 0;
      }
      if (!b.lost) continue;
      let [hx, hy] = b.home;
      if (this.lv.json.scroll && (b.kind === 'key' || b.kind === 'lantern')) {
        // drop in above the frontmost player
        const front = this.players.filter((p) => !p.gone).sort((a, c) => c.x - a.x)[0];
        if (front) {
          hx = front.x;
          hy = front.y - 3;
        }
      }
      if (this.boxFree(hx, hy, b.w, b.h, b)) {
        b.lost = false;
        b.x = hx;
        b.y = hy;
        b.vx = 0;
        b.vy = 0;
        this.emit('respawn', hx + b.w / 2, hy + b.h);
      }
    }
  }

  /** Is the box clear of solid tiles, things and solid bodies? */
  boxFree(x: number, y: number, w: number, h: number, self: Body | null): boolean {
    for (const s of this.solidsNear(x, y, w, h, self)) {
      if (s.tile === T.OneWay) continue;
      if (s.x < x + w - EPS && s.x + s.w > x + EPS && s.y < y + h - EPS && s.y + s.h > y + EPS) return false;
    }
    return true;
  }

  // ───────────────────────── camera ─────────────────────────

  updateCamera(snap: boolean): void {
    const lv = this.lv;
    const scroll = lv.json.scroll ?? 0;
    const act = this.players.filter((p) => !p.gone || p.carrier);
    if (scroll) {
      if (!snap) this.cam.scrollX = Math.min(Math.max(0, lv.w - VIEW_W), this.cam.scrollX + scroll * DT);
      this.cam.zoom = 1;
      this.cam.x = this.cam.scrollX + VIEW_W / 2;
      const ys = act.length ? act.map((p) => p.y + p.h / 2) : [lv.h / 2];
      this.cam.y = clamp((Math.min(...ys) + Math.max(...ys)) / 2, VIEW_H / 2, lv.h - VIEW_H / 2);
      return;
    }
    if (!act.length) return;
    const x0 = Math.min(...act.map((p) => p.x));
    const x1 = Math.max(...act.map((p) => p.x + p.w));
    const y0 = Math.min(...act.map((p) => p.y));
    const y1 = Math.max(...act.map((p) => p.y + p.h));
    const zoom = clamp(Math.max((x1 - x0 + 8) / VIEW_W, (y1 - y0 + 6) / VIEW_H), 1, MAX_ZOOM_OUT);
    const vw = VIEW_W * zoom;
    const vh = VIEW_H * zoom;
    this.cam.zoom = zoom;
    this.cam.x = lv.w <= vw ? lv.w / 2 : clamp((x0 + x1) / 2, vw / 2, lv.w - vw / 2);
    this.cam.y = lv.h <= vh ? lv.h / 2 : clamp((y0 + y1) / 2, vh / 2, lv.h - vh / 2);
  }

  // ───────────────────────── helpers for objects ─────────────────────────

  setPower(letters: readonly string[], on: boolean): void {
    if (!on) return;
    for (const l of letters) this.power[l] = true;
  }

  popPlayer(p: Body): void {
    if (p.gone && p.p!.pop) return;
    const st = p.p!;
    this.releaseCarried(p, true);
    if (p.carrier) {
      p.carrier.carrying = null;
      p.carrier = null;
    }
    this.emit('pop', p.x + p.w / 2, p.y + p.h / 2, st.n);
    this.pops++;
    p.gone = true;
    st.pop = POP_TICKS;
    p.vx = 0;
    p.vy = 0;
    st.thrown = false;
  }

  /** Let go of whatever b carries; lost keys and crates go home. */
  releaseCarried(b: Body, lost: boolean): void {
    const c = b.carrying;
    if (!c) return;
    b.carrying = null;
    c.carrier = null;
    c.vx = 0;
    c.vy = 0;
    if (lost && c.kind !== 'player') c.lost = true;
  }

  respawn(p: Body): void {
    respawnPlayer(this, p);
  }

  // ───────────────────────── save / load (online snapshots) ─────────────────────────

  save(): WorldSave {
    return {
      t: this.t,
      b: this.bodies.map((b) => [
        b.x,
        b.y,
        b.vx,
        b.vy,
        (b.gone ? 1 : 0) | (b.lost ? 2 : 0) | (b.p?.inside ? 4 : 0) | (b.p?.thrown ? 8 : 0) | (b.p?.face === -1 ? 16 : 0),
        b.carrying ? b.carrying.id : 0,
        b.p ? b.p.pop : 0,
      ]),
      th: this.things.map((th) => th.save()),
      d: this.doorOpen ? 1 : 0,
      f: this.flag,
      c: [this.cam.x, this.cam.y, this.cam.zoom, this.cam.scrollX],
      s: this.status === 'won' ? this.wonTick : -1,
      pw: Object.keys(this.power).filter((k) => this.power[k]),
      po: this.pops,
    };
  }

  load(s: WorldSave): void {
    this.t = s.t;
    const byId = new Map(this.bodies.map((b) => [b.id, b]));
    for (const b of this.bodies) b.carrier = null;
    this.bodies.forEach((b, i) => {
      const [x, y, vx, vy, f, carrying, pop] = s.b[i];
      b.x = x;
      b.y = y;
      b.vx = vx;
      b.vy = vy;
      b.gone = !!(f & 1);
      b.lost = !!(f & 2);
      if (b.p) {
        b.p.inside = !!(f & 4);
        b.p.thrown = !!(f & 8);
        b.p.face = f & 16 ? -1 : 1;
        b.p.pop = pop;
      }
      b.carrying = carrying ? byId.get(carrying) ?? null : null;
    });
    for (const b of this.bodies) if (b.carrying) b.carrying.carrier = b;
    this.things.forEach((th, i) => th.load(s.th[i]));
    this.doorOpen = !!s.d;
    this.flag = s.f;
    [this.cam.x, this.cam.y, this.cam.zoom, this.cam.scrollX] = s.c;
    this.status = s.s >= 0 ? 'won' : 'playing';
    this.wonTick = s.s;
    this.power = {};
    for (const k of s.pw) this.power[k] = true;
    this.pops = s.po;
    this.contacts();
  }
}

export interface WorldSave {
  t: number;
  b: [number, number, number, number, number, number, number][];
  th: unknown[];
  d: number;
  f: [number, number] | null;
  c: [number, number, number, number];
  s: number;
  pw: string[];
  po: number;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
