/**
 * Draws a World on a canvas in the Sorbet style. The renderer only reads the world; everything it
 * adds (smoothing, squash, particles, chat bubbles) is decoration.
 */
import { MAX_ZOOM_OUT, VIEW_H, VIEW_W } from '../sim/constants';
import { T, type Level } from '../sim/level';
import type { Body, GameEvent } from '../sim/types';
import type { World } from '../sim/world';
import { INK, OBJ, PLAYER, PLAYER_TEXT, lookFor, type WorldLook } from './palette';
import { cubeSprite, keyShape } from './sprite';
import { drawThing, drawWires, pill, roundRect } from './things';

type Ctx = CanvasRenderingContext2D;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  gravity: number;
}

export interface Chat {
  p: number;
  text: string;
  until: number;
}

export interface DrawOpts {
  /** 0..1 between the previous tick and this one (local play) */
  alpha: number;
  /** seconds */
  now: number;
  chats?: Chat[];
  /** guests smooth toward the latest snapshot instead of interpolating */
  smooth?: boolean;
  reduced?: boolean;
  /** zoom multiplier for the title demo */
  zoom?: number;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private g: Ctx;
  private dpr = 1;
  private cw = 0;
  private ch = 0;
  private lv: Level | null = null;
  private stat: HTMLCanvasElement | null = null;
  private look: WorldLook = lookFor(1);
  private prev = new Map<number, [number, number]>();
  private shown = new Map<number, [number, number]>();
  private cam = { x: 0, y: 0, zoom: 1, init: false };
  private parts: Particle[] = [];
  private squash = [0, 0, 0, 0];
  private blinkAt = [2, 3.3, 4.1, 5.7];
  private dark: HTMLCanvasElement | null = null;
  private lastNow = 0;
  /** tile size in CSS pixels at the current zoom (for the HUD) */
  scale = 32;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d')!;
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cw = Math.max(1, r.width);
    this.ch = Math.max(1, r.height);
    this.canvas.width = Math.round(this.cw * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
  }

  /** Before each sim step (local play): remember where everything was, for interpolation. */
  capture(w: World): void {
    for (const b of w.bodies) this.prev.set(b.id, [b.x, b.y]);
  }

  private setLevel(lv: Level): void {
    this.lv = lv;
    this.look = lookFor(lv.world);
    this.stat = this.buildStatic(lv);
    this.prev.clear();
    this.shown.clear();
    this.cam.init = false;
    this.parts = [];
  }

  /** The parts of the level that never change, drawn once at 32 px per tile. */
  private buildStatic(lv: Level): HTMLCanvasElement {
    const S = 32;
    const c = document.createElement('canvas');
    c.width = lv.w * S;
    c.height = lv.h * S;
    const g = c.getContext('2d')!;
    g.scale(S, S);
    const L = this.look;
    const solidAt = (x: number, y: number) => {
      if (x < 0 || x >= lv.w || y < 0) return true;
      if (y >= lv.h) return false;
      const t = lv.tiles[y * lv.w + x];
      return t === T.Solid;
    };
    for (let y = 0; y < lv.h; y++) {
      for (let x = 0; x < lv.w; x++) {
        const t = lv.tiles[y * lv.w + x];
        if (t === T.Solid) {
          g.fillStyle = L.ground;
          g.fillRect(x, y, 1.02, 1.02);
          if (!solidAt(x, y - 1)) {
            g.fillStyle = L.groundTop;
            g.fillRect(x, y, 1.02, 0.2);
          }
        } else if (t === T.OneWay) {
          g.fillStyle = L.groundTop;
          g.fillRect(x, y, 1.02, 0.28);
          g.fillStyle = L.ground;
          g.fillRect(x, y + 0.28, 1.02, 0.08);
        } else if (t === T.Spring) {
          g.fillStyle = OBJ.springShade;
          g.fillRect(x + 0.1, y + 0.35, 0.8, 0.65);
          g.fillStyle = OBJ.spring;
          roundRect(g, x + 0.05, y + 0.12, 0.9, 0.3, 0.12);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.5)';
          for (let i = 0; i < 3; i++) g.fillRect(x + 0.2, y + 0.5 + i * 0.16, 0.6, 0.05);
        } else if (t === T.SpikeUp || t === T.SpikeDown) {
          g.fillStyle = OBJ.spike;
          g.beginPath();
          for (let i = 0; i < 3; i++) {
            const x0 = x + i / 3;
            if (t === T.SpikeUp) {
              g.moveTo(x0, y + 1);
              g.lineTo(x0 + 1 / 6, y + 0.45);
              g.lineTo(x0 + 1 / 3, y + 1);
            } else {
              g.moveTo(x0, y);
              g.lineTo(x0 + 1 / 6, y + 0.55);
              g.lineTo(x0 + 1 / 3, y);
            }
          }
          g.fill();
        } else if (t >= T.Color1 && t <= T.Color4) {
          const n = t - T.Color1;
          g.fillStyle = PLAYER[n] + '40';
          g.fillRect(x, y, 1, 1);
          g.fillStyle = PLAYER[n] + '80';
          for (let i = 0; i < 3; i++) g.fillRect(x, y + 0.1 + i * 0.33, 1, 0.12);
          g.fillStyle = '#ffffff';
          g.font = '800 0.5px Outfit, system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(String(n + 1), x + 0.5, y + 0.53);
        }
      }
    }
    return c;
  }

  onEvents(evs: GameEvent[], now: number): void {
    for (const e of evs) {
      switch (e.type) {
        case 'land':
          if (e.p >= 0) this.squash[e.p] = 1;
          this.burst(e.x, e.y, 4, 'rgba(255,255,255,0.9)', 0.12, 2.5, -1.5);
          break;
        case 'jump':
          if (e.p >= 0) this.squash[e.p] = -0.8;
          this.burst(e.x, e.y, 3, 'rgba(255,255,255,0.8)', 0.1, 2, -1);
          break;
        case 'pop':
          this.burst(e.x, e.y, 14, e.p >= 0 ? PLAYER[e.p] : INK, 0.16, 6, -4);
          break;
        case 'respawn':
          this.burst(e.x, e.y - 0.5, 8, 'rgba(255,255,255,0.95)', 0.12, 3, -2);
          break;
        case 'key':
        case 'open':
          this.burst(e.x, e.y, 10, OBJ.key, 0.1, 4, -4);
          break;
        case 'enter':
          this.burst(e.x, e.y - 1, 8, e.p >= 0 ? PLAYER[e.p] : INK, 0.12, 3, -3);
          break;
        case 'spring':
          this.burst(e.x, e.y, 6, OBJ.spring, 0.12, 3, -2);
          break;
        case 'crumble':
          this.burst(e.x, e.y, 12, OBJ.plank, 0.18, 4, 1);
          break;
        case 'win':
          for (let i = 0; i < 4; i++) this.burst(e.x, e.y - 1, 16, PLAYER[i], 0.14, 9, -9);
          break;
        case 'flag':
          this.burst(e.x, e.y - 1.5, 8, OBJ.flag, 0.1, 3, -3);
          break;
      }
    }
    void now;
  }

  private burst(x: number, y: number, n: number, color: string, size: number, speed: number, up: number): void {
    // decoration only: a cheap deterministic spread is fine
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (this.parts.length % 7) * 0.3;
      const s = speed * (0.4 + ((i * 37) % 10) / 16);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 + up, life: 0, max: 0.5 + ((i * 13) % 7) / 14, size, color, gravity: 14 });
    }
  }

  // ───────────────────────── frame ─────────────────────────

  draw(w: World, o: DrawOpts): void {
    if (w.lv !== this.lv) this.setLevel(w.lv);
    const dt = Math.min(0.1, Math.max(0, o.now - this.lastNow));
    this.lastNow = o.now;
    const g = this.g;
    const lv = w.lv;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // camera: ease toward the sim's camera
    const zoomWant = Math.min(MAX_ZOOM_OUT, w.cam.zoom) * (o.zoom ?? 1);
    if (!this.cam.init) {
      this.cam.x = w.cam.x;
      this.cam.y = w.cam.y;
      this.cam.zoom = zoomWant;
      this.cam.init = true;
    } else {
      const k = 1 - Math.exp(-dt * (lv.json.scroll ? 30 : 6));
      this.cam.x += (w.cam.x - this.cam.x) * k;
      this.cam.y += (w.cam.y - this.cam.y) * k;
      this.cam.zoom += (zoomWant - this.cam.zoom) * (1 - Math.exp(-dt * 3));
    }
    const s = Math.min(this.cw / (VIEW_W * this.cam.zoom), this.ch / (VIEW_H * this.cam.zoom));
    this.scale = s;
    const ox = this.cw / 2 - this.cam.x * s;
    const oy = this.ch / 2 - this.cam.y * s;

    this.background(g, ox, oy, s, o.now);

    g.setTransform(this.dpr * s, 0, 0, this.dpr * s, this.dpr * ox, this.dpr * oy);
    // outside the map is ground
    g.fillStyle = this.look.ground;
    const vw = this.cw / s;
    const vh = this.ch / s;
    const vx0 = this.cam.x - vw / 2;
    const vy0 = this.cam.y - vh / 2;
    if (vx0 < 0) g.fillRect(vx0 - 1, vy0 - 1, -vx0 + 1, vh + 2);
    if (vx0 + vw > lv.w) g.fillRect(lv.w, vy0 - 1, vx0 + vw - lv.w + 1, vh + 2);
    if (vy0 < 0) g.fillRect(vx0 - 1, vy0 - 1, vw + 2, -vy0 + 1);
    if (this.stat) {
      g.imageSmoothingEnabled = true;
      g.drawImage(this.stat, 0, 0, lv.w, lv.h);
    }

    drawWires(g, w);
    this.flags(g, w);
    this.door(g, w);
    const alpha = o.smooth ? 1 : o.alpha;
    for (const th of w.things) {
      // platforms: draw where they were part way through the tick
      if ((th.dx || th.dy) && !o.smooth) {
        g.save();
        g.translate(-th.dx * (1 - alpha), -th.dy * (1 - alpha));
        drawThing(g, th, w);
        g.restore();
      } else drawThing(g, th, w);
    }

    // bodies: heavy things, then loose things, then players on top
    const pos = (b: Body): [number, number] => this.pos(b, alpha, !!o.smooth, dt);
    for (const b of w.bodies) if (b.kind === 'block' && !b.gone && !b.lost) this.block(g, b, pos(b));
    for (const b of w.bodies) if (b.kind === 'crate' && !b.gone && !b.lost) this.crate(g, b, pos(b));
    for (const p of w.players) if (!p.gone) this.player(g, p, pos(p), o.now, dt, w);
    if (w.lantern && !w.lantern.gone && !w.lantern.lost) this.lantern(g, pos(w.lantern), o.now);
    if (!w.key.gone && !w.key.lost) this.key(g, pos(w.key), o.now);

    this.particles(g, dt);
    if (lv.json.dark) this.darkness(w, ox, oy, s, alpha, !!o.smooth, dt);
    g.setTransform(this.dpr * s, 0, 0, this.dpr * s, this.dpr * ox, this.dpr * oy);
    this.labels(g, w, alpha, !!o.smooth, dt, o);
  }

  /** Where to draw a body: interpolated (local) or smoothed (guests). */
  private pos(b: Body, alpha: number, smooth: boolean, dt: number): [number, number] {
    if (smooth) {
      const sh = this.shown.get(b.id);
      if (!sh || Math.hypot(sh[0] - b.x, sh[1] - b.y) > 3) {
        const v: [number, number] = [b.x, b.y];
        this.shown.set(b.id, v);
        return v;
      }
      const k = 1 - Math.exp(-dt * 22);
      sh[0] += (b.x - sh[0]) * k;
      sh[1] += (b.y - sh[1]) * k;
      return sh;
    }
    const p = this.prev.get(b.id);
    if (!p || Math.hypot(p[0] - b.x, p[1] - b.y) > 3) return [b.x, b.y];
    return [p[0] + (b.x - p[0]) * alpha, p[1] + (b.y - p[1]) * alpha];
  }

  private background(g: Ctx, ox: number, oy: number, s: number, now: number): void {
    const L = this.look;
    const grad = g.createLinearGradient(0, 0, 0, this.ch);
    grad.addColorStop(0, L.skyTop);
    grad.addColorStop(1, L.skyBottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, this.cw, this.ch);
    // far hills drift slowly (parallax 0.3)
    const px = ox * 0.3;
    const py = oy * 0.15;
    g.fillStyle = L.hill;
    for (let i = -1; i < 6; i++) {
      const cx = ((i * 420 + px) % 2520) + (i < 0 ? 2520 : 0) - 300;
      g.beginPath();
      g.ellipse(cx, this.ch * 0.82 + py, 320, 170, 0, 0, Math.PI * 2);
      g.fill();
    }
    const dx = ox * 0.15;
    if (L.deco === 'stars') {
      g.fillStyle = 'rgba(255,241,201,0.8)';
      for (let i = 0; i < 40; i++) {
        const x = ((i * 173.7 + dx) % this.cw + this.cw) % this.cw;
        const y = (i * 97.3) % (this.ch * 0.6);
        const tw = 0.6 + 0.4 * Math.sin(now * 1.5 + i);
        const r = (i % 3 === 0 ? 2.2 : 1.4) * tw;
        g.fillRect(x, y, r, r);
      }
      g.fillStyle = 'rgba(255,241,201,0.9)';
      g.beginPath();
      g.arc(this.cw * 0.82 + dx * 0.2, this.ch * 0.16, 28, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 6; i++) {
        const w = 90 + (i % 3) * 40;
        const x = (((i * 331 + dx + now * 6) % (this.cw + 300)) + this.cw + 300) % (this.cw + 300) - 150;
        const y = 40 + ((i * 71) % (this.ch * 0.35));
        g.beginPath();
        g.roundRect(x, y, w, 26, 13);
        g.roundRect(x + w * 0.25, y - 14, w * 0.45, 30, 15);
        g.fill();
      }
    }
    void s;
  }

  private block(g: Ctx, b: Body, [x, y]: [number, number]): void {
    g.fillStyle = OBJ.block;
    roundRect(g, x, y, b.w, b.h, 0.1);
    g.fill();
    g.fillStyle = OBJ.blockShade;
    g.fillRect(x + 0.08, y + b.h - 0.16, b.w - 0.16, 0.1);
    g.fillStyle = '#ffffff';
    const size = Math.min(1.1, 0.55 * Math.min(b.w, b.h) + 0.15);
    g.font = `800 ${size}px Outfit, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(b.pushN), x + b.w / 2, y + b.h / 2 + 0.04);
  }

  private crate(g: Ctx, b: Body, [x, y]: [number, number]): void {
    g.fillStyle = OBJ.crate;
    roundRect(g, x, y, b.w, b.h, 0.06);
    g.fill();
    g.strokeStyle = OBJ.crateShade;
    g.lineWidth = 0.09;
    g.strokeRect(x + 0.12, y + 0.12, b.w - 0.24, b.h - 0.24);
    g.beginPath();
    g.moveTo(x + 0.14, y + 0.14);
    g.lineTo(x + b.w - 0.14, y + b.h - 0.14);
    g.stroke();
  }

  private key(g: Ctx, [x, y]: [number, number], now: number): void {
    g.save();
    const bob = Math.sin(now * 3) * 0.04;
    g.translate(x, y + bob);
    g.scale(0.6 / 9, 0.6 / 9);
    g.fillStyle = OBJ.key;
    g.fill(keyShape());
    g.restore();
  }

  private lantern(g: Ctx, [x, y]: [number, number], now: number): void {
    const glow = 0.85 + 0.15 * Math.sin(now * 5);
    g.fillStyle = `rgba(255,214,110,${0.35 * glow})`;
    g.beginPath();
    g.arc(x + 0.25, y + 0.35, 0.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = INK;
    g.fillRect(x + 0.1, y, 0.3, 0.1);
    g.fillStyle = '#ffd66e';
    roundRect(g, x + 0.05, y + 0.1, 0.4, 0.5, 0.1);
    g.fill();
  }

  private door(g: Ctx, w: World): void {
    const d = w.lv.door;
    g.fillStyle = OBJ.door;
    roundRect(g, d.x + 0.05, d.y, 0.9, 2, [0.45, 0.45, 0, 0]);
    g.fill();
    if (w.doorOpen) {
      g.fillStyle = OBJ.doorInside;
      roundRect(g, d.x + 0.2, d.y + 0.18, 0.6, 1.82, [0.3, 0.3, 0, 0]);
      g.fill();
    } else {
      g.fillStyle = INK;
      g.beginPath();
      g.arc(d.x + 0.5, d.y + 0.85, 0.12, 0, Math.PI * 2);
      g.fill();
      g.fillRect(d.x + 0.45, d.y + 0.9, 0.1, 0.3);
    }
    // who's home
    for (let i = 0; i < 4; i++) {
      const inside = w.players[i].p!.inside;
      g.fillStyle = inside ? PLAYER[i] : 'rgba(255,255,255,0.75)';
      g.fillRect(d.x + 0.5 - 0.7 + i * 0.36, d.y - 0.45, 0.26, 0.26);
    }
  }

  private flags(g: Ctx, w: World): void {
    const lv = w.lv;
    for (let y = 0; y < lv.h; y++) {
      for (let x = 0; x < lv.w; x++) {
        if (lv.rows[y][x] !== 'C') continue;
        const on = !!w.flag && w.flag[0] === x && w.flag[1] === y;
        g.fillStyle = INK;
        g.fillRect(x + 0.2, y - 0.9, 0.08, 1.9);
        g.fillStyle = on ? OBJ.flag : OBJ.flagOff;
        g.beginPath();
        g.moveTo(x + 0.28, y - 0.9);
        g.lineTo(x + 0.95, y - 0.6);
        g.lineTo(x + 0.28, y - 0.3);
        g.fill();
      }
    }
  }

  private player(g: Ctx, p: Body, [x, y]: [number, number], now: number, dt: number, w: World): void {
    const n = p.p!.n;
    // squash on landing, stretch while rising; settles quickly
    this.squash[n] *= Math.exp(-dt * 10);
    let sq = this.squash[n];
    if (p.vy < -4) sq = Math.min(sq, -0.5);
    const sx = 1 + sq * 0.12;
    const sy = 1 - sq * 0.12;
    const blink = now > this.blinkAt[n] && now < this.blinkAt[n] + 0.12;
    if (now > this.blinkAt[n] + 0.12) this.blinkAt[n] = now + 2.5 + ((n * 1.7 + now) % 3);
    const img = cubeSprite(PLAYER[n], blink);
    g.save();
    const cx = x + p.w / 2;
    const by = y + p.h;
    g.translate(cx, by);
    g.scale(p.p!.face * sx, sy);
    g.imageSmoothingEnabled = false;
    // the sprite is 12 px for a 0.9 body: 1 px of margin all round
    const size = p.w * (12 / 10.8);
    g.drawImage(img, -size / 2, -size + (1 / 12) * size * 0.0, size, size);
    g.restore();
    void w;
  }

  private particles(g: Ctx, dt: number): void {
    const keep: Particle[] = [];
    for (const q of this.parts) {
      q.life += dt;
      if (q.life >= q.max) continue;
      q.vy += q.gravity * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      g.globalAlpha = 1 - q.life / q.max;
      g.fillStyle = q.color;
      g.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      keep.push(q);
    }
    g.globalAlpha = 1;
    this.parts = keep.length > 600 ? keep.slice(-600) : keep;
  }

  private darkness(w: World, ox: number, oy: number, s: number, alpha: number, smooth: boolean, dt: number): void {
    if (!this.dark) this.dark = document.createElement('canvas');
    const d = this.dark;
    if (d.width !== this.canvas.width || d.height !== this.canvas.height) {
      d.width = this.canvas.width;
      d.height = this.canvas.height;
    }
    const dg = d.getContext('2d')!;
    dg.setTransform(1, 0, 0, 1, 0, 0);
    dg.globalCompositeOperation = 'source-over';
    dg.clearRect(0, 0, d.width, d.height);
    dg.fillStyle = 'rgba(14,14,40,0.93)';
    dg.fillRect(0, 0, d.width, d.height);
    dg.globalCompositeOperation = 'destination-out';
    const hole = (tx: number, ty: number, r: number) => {
      const X = (ox + tx * s) * this.dpr;
      const Y = (oy + ty * s) * this.dpr;
      const R = r * s * this.dpr;
      const grad = dg.createRadialGradient(X, Y, R * 0.35, X, Y, R);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      dg.fillStyle = grad;
      dg.beginPath();
      dg.arc(X, Y, R, 0, Math.PI * 2);
      dg.fill();
    };
    const L = w.lantern;
    if (L && !L.gone && !L.lost) {
      const [lx, ly] = this.pos(L, alpha, smooth, 0);
      hole(lx + L.w / 2, ly + L.h / 2, 5.5);
    }
    for (const p of w.players) {
      if (p.gone) continue;
      const [px, py] = this.pos(p, alpha, smooth, 0);
      hole(px + p.w / 2, py + p.h / 2, 1.6);
    }
    const dr = w.lv.door;
    hole(dr.x + 0.5, dr.y + 1, 1.4);
    if (!w.key.gone && !w.key.lost && !w.key.carrier) hole(w.key.x + 0.3, w.key.y + 0.2, 0.9);
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.drawImage(d, 0, 0);
    void dt;
  }

  private labels(g: Ctx, w: World, alpha: number, smooth: boolean, dt: number, o: DrawOpts): void {
    for (const p of w.players) {
      if (p.gone) continue;
      const n = p.p!.n;
      const [x, y] = this.pos(p, alpha, smooth, 0);
      const cx = x + p.w / 2;
      const top = y - (p.carrying ? p.carrying.h + (p.carrying.carrying ? p.carrying.carrying.h : 0) : 0);
      g.font = '800 0.42px Outfit, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.lineWidth = 0.14;
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.strokeText(String(n + 1), cx, top - 0.18);
      g.fillStyle = PLAYER_TEXT[n];
      g.fillText(String(n + 1), cx, top - 0.18);
    }
    for (const c of o.chats ?? []) {
      const p = w.players[c.p];
      if (!p || p.gone || o.now > c.until) continue;
      const [x, y] = this.pos(p, alpha, smooth, 0);
      const cx = x + p.w / 2;
      const top = y - (p.carrying ? p.carrying.h : 0) - 0.95;
      g.font = '700 0.42px Outfit, system-ui, sans-serif';
      const tw = g.measureText(c.text).width + 0.5;
      g.fillStyle = '#ffffff';
      roundRect(g, cx - tw / 2, top - 0.5, tw, 0.62, 0.22);
      g.fill();
      g.beginPath();
      g.moveTo(cx - 0.14, top + 0.1);
      g.lineTo(cx + 0.14, top + 0.1);
      g.lineTo(cx, top + 0.3);
      g.fill();
      g.fillStyle = PLAYER_TEXT[c.p];
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(c.text, cx, top - 0.18);
    }
    void dt;
    void pill;
  }
}
