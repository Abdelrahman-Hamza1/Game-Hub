/**
 * Draws a Game: floor wavefronts, remembered echoes, entities, effects and the debug overlay.
 * Nothing in the cave is drawn unless sound has reached it (pillar 1). The player, the known exit
 * and a held tourist (touch) are the only exceptions.
 */
import type { Game } from '../game/game';
import type { GameEvent } from '../game/events';
import { forEachWaveTile, ringRadius, KIND_INDEX } from '../sound/pulses';
import { pathDownhill } from '../sound/propagation';
import { tileAt } from '../world/grid';
import { Mat, type Level } from '../world/level';
import {
  BG, EXIT, MAT_COLOR, MOSS_WALL, PIT, PLAYER, SWARM, THREAT, TOURIST, kindColor, mix, rgba, wallColor,
} from './palette';
import { FLOOR_ALPHA, FLOOR_BAND } from '../game/constants';

export interface RenderOptions {
  highContrast: boolean;
  reducedMotion: boolean;
  shake: boolean;
  debug: boolean;
  fps: number;
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  /** CSS pixels. */
  width = 0;
  height = 0;
  dpr = 1;
  /** CSS pixels per tile. */
  scale = 24;
  camX = 0;
  camY = 0;
  private shakeT = 0;
  private shakeAmt = 0;
  private alertT = 0;
  private sprites = new Map<string, HTMLCanvasElement>();
  private spriteScale = 0;
  /** Visible area, in tiles, for screen ↔ world. */
  private viewW = 40;
  private viewH = 22;
  private time = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available.');
    this.ctx = ctx;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    // ~26 tiles across a portrait phone, 40 on desktop (brief §5.1).
    const portrait = this.height > this.width;
    const across = portrait ? 26 : this.width < 900 ? 32 : 40;
    this.scale = this.width / across;
    this.viewW = this.width / this.scale;
    this.viewH = this.height / this.scale;
  }

  /** Jump the camera to the player (new level, retry). */
  snapTo(game: Game): void {
    const t = this.cameraTarget(game);
    this.camX = t.x;
    this.camY = t.y;
    this.shakeT = 0;
    this.alertT = 0;
  }

  private cameraTarget(game: Game): { x: number; y: number } {
    const L = game.level;
    const tx = game.attract ? L.w / 2 : game.player.x;
    const ty = game.attract ? L.h / 2 : game.player.y;
    const clampAxis = (v: number, size: number, view: number) =>
      size <= view ? size / 2 : Math.max(view / 2, Math.min(size - view / 2, v));
    return { x: clampAxis(tx, L.w, this.viewW), y: clampAxis(ty, L.h, this.viewH) };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: this.camX + (sx - this.width / 2) / this.scale,
      y: this.camY + (sy - this.height / 2) / this.scale,
    };
  }

  worldToScreen(x: number, y: number): { x: number; y: number } {
    return {
      x: (x - this.camX) * this.scale + this.width / 2,
      y: (y - this.camY) * this.scale + this.height / 2,
    };
  }

  /** React to simulation events (shake, alert flash). */
  onEvents(events: GameEvent[], opts: RenderOptions): void {
    for (const e of events) {
      if (e.type === 'shake' && opts.shake && !opts.reducedMotion) {
        this.shakeT = 0.18;
        this.shakeAmt = Math.max(this.shakeAmt * (this.shakeT > 0 ? 1 : 0), e.amount);
      } else if (e.type === 'alert' || e.type === 'caught') {
        this.alertT = 0.7;
      }
    }
  }

  // ------------------------------------------------------------------ sprites

  /** Rounded wall tile with glow and a small white highlight, cached per colour and size. */
  private wallSprite(color: string): HTMLCanvasElement {
    const tile = Math.round(this.scale * this.dpr);
    if (tile !== this.spriteScale) {
      this.sprites.clear();
      this.spriteScale = tile;
    }
    let c = this.sprites.get(color);
    if (c) return c;
    const pad = Math.ceil(tile * 0.6);
    c = document.createElement('canvas');
    c.width = c.height = tile + pad * 2;
    const g = c.getContext('2d')!;
    const inset = (2 / 16) * tile;
    const rad = (3 / 16) * tile;
    const x = pad + inset;
    const y = pad + inset;
    const s = tile - inset * 2;
    g.shadowColor = color;
    g.shadowBlur = (10 / 16) * tile;
    g.fillStyle = color;
    roundRect(g, x, y, s, s, rad);
    g.fill();
    g.shadowBlur = 0;
    // second pass to firm up the core
    g.globalAlpha = 0.85;
    roundRect(g, x, y, s, s, rad);
    g.fill();
    // highlight
    g.globalAlpha = 0.45;
    g.strokeStyle = '#FFFFFF';
    g.lineWidth = Math.max(1, tile / 16);
    g.beginPath();
    g.moveTo(x + rad, y + g.lineWidth);
    g.lineTo(x + s * 0.55, y + g.lineWidth);
    g.stroke();
    this.sprites.set(color, c);
    return c;
  }

  private glowDot(color: string, radiusTiles: number): HTMLCanvasElement {
    const key = 'dot' + color + radiusTiles;
    const tile = Math.round(this.scale * this.dpr);
    if (tile !== this.spriteScale) {
      this.sprites.clear();
      this.spriteScale = tile;
    }
    let c = this.sprites.get(key);
    if (c) return c;
    const r = radiusTiles * tile;
    const size = Math.ceil(r * 5);
    c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, rgba(color, 0.55));
    grad.addColorStop(0.35, rgba(color, 0.18));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    g.fillStyle = color;
    g.beginPath();
    g.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    g.fill();
    this.sprites.set(key, c);
    return c;
  }

  // ------------------------------------------------------------------ frame

  render(game: Game, frameDt: number, opts: RenderOptions): void {
    const ctx = this.ctx;
    const L = game.level;
    this.time += frameDt;

    // Camera follows with smoothing.
    const target = this.cameraTarget(game);
    const k = 1 - Math.exp(-frameDt * 6);
    this.camX += (target.x - this.camX) * k;
    this.camY += (target.y - this.camY) * k;

    let ox = 0;
    let oy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= frameDt;
      ox = (Math.random() * 2 - 1) * this.shakeAmt;
      oy = (Math.random() * 2 - 1) * this.shakeAmt;
      if (this.shakeT <= 0) this.shakeAmt = 0;
    }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.width, this.height);

    const s = this.scale;
    const left = this.camX - this.width / 2 / s;
    const top = this.camY - this.height / 2 / s;
    const x0 = Math.max(0, Math.floor(left) - 1);
    const y0 = Math.max(0, Math.floor(top) - 1);
    const x1 = Math.min(L.w - 1, Math.ceil(left + this.width / s) + 1);
    const y1 = Math.min(L.h - 1, Math.ceil(top + this.height / s) + 1);
    const sx = (x: number) => (x - left) * s + ox;
    const sy = (y: number) => (y - top) * s + oy;
    const hc = opts.highContrast;

    // ---- Waterfall zones: faint shimmer (constant noise is constant faint sight) ----
    if (L.waterfalls.length) this.drawZones(game, x0, y0, x1, y1, sx, sy, opts);

    // ---- Floor wavefronts ----
    for (const p of game.pulses) {
      const r = ringRadius(p, game.t);
      const color = kindColor(KIND_INDEX[p.kind]);
      forEachWaveTile(p, r, FLOOR_BAND, (tile, d) => {
        const tx = tile % L.w;
        const ty = (tile / L.w) | 0;
        if (tx < x0 || tx > x1 || ty < y0 || ty > y1) return;
        if (L.pit[tile] && !p.fake) return; // a drop: nothing to reflect off
        const a = Math.min(1, (1 - d / p.radius) * FLOOR_ALPHA * (hc ? 2 : 1));
        if (a <= 0.01) return;
        this.drawFloorDot(L, tile, sx(tx), sy(ty), a, color, p.fake);
      });
    }

    // ---- Remembered floor features: pits, rubble, rails ----
    this.drawFeatures(game, x0, y0, x1, y1, sx, sy, hc);

    // ---- Walls (additive glow) ----
    ctx.globalCompositeOperation = 'lighter';
    const mem = game.memory;
    const pad = Math.ceil(this.scale * this.dpr * 0.6) / this.dpr;
    const size = s + pad * 2;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = ty * L.w + tx;
        const kb = L.boundaryIndex[t];
        if (kb < 0) continue;
        const b = mem.bright[kb];
        if (b < 0.012) continue;
        const base = L.mossy[t] ? MOSS_WALL : MAT_COLOR[L.mat[t] as Mat];
        const color = wallColor(base, mem.kind[kb], hc);
        ctx.globalAlpha = Math.min(1, hc ? b * 1.35 + 0.05 : b);
        ctx.drawImage(this.wallSprite(color), sx(tx) - pad, sy(ty) - pad, size, size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // ---- Exit ----
    if (game.exitKnown && !game.attract) {
      const ex = L.exit % L.w;
      const ey = (L.exit / L.w) | 0;
      const pulse = opts.reducedMotion ? 0.8 : 0.65 + 0.35 * Math.sin(this.time * 3);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = rgba(EXIT, 0.22);
      ctx.strokeStyle = EXIT;
      ctx.lineWidth = Math.max(1.5, s / 12);
      roundRect(ctx, sx(ex) + 2, sy(ey) + 2, s - 4, s - 4, s / 6);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = EXIT;
      ctx.font = `700 ${Math.max(8, s * 0.32)}px "Martian Mono", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('EXIT', sx(ex) + s / 2, sy(ey) - 2);
    }

    // ---- Entities ----
    for (const c of game.carts) {
      if (c.seen < 0.02) continue;
      ctx.globalAlpha = Math.min(1, c.seen);
      ctx.fillStyle = MAT_COLOR[Mat.Metal];
      roundRect(ctx, sx(c.x) - s * 0.36, sy(c.y) - s * 0.28, s * 0.72, s * 0.56, s * 0.1);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const sw of game.swarms) {
      if (sw.state === 'roosted' && sw.seen > 0.02) {
        ctx.globalAlpha = Math.min(1, sw.seen);
        ctx.fillStyle = SWARM;
        for (let i = 0; i < 14; i++) {
          const a = i * 2.4;
          const rr = (0.12 + (i % 4) * 0.07) * s;
          ctx.fillRect(sx(sw.x) + Math.cos(a) * rr - 1, sy(sw.y) + Math.sin(a) * rr - 1, 2, 2);
        }
        ctx.globalAlpha = 1;
      }
      if (sw.state === 'flying') {
        ctx.strokeStyle = SWARM;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        for (const f of sw.flecks) {
          const fx = sx(f.x);
          const fy = sy(f.y);
          const flap = Math.sin(this.time * 30 + f.speed * 10) * 2;
          ctx.moveTo(fx - 3, fy + flap);
          ctx.lineTo(fx, fy);
          ctx.lineTo(fx + 3, fy + flap);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    const p = game.player;
    for (const T of game.tourists) {
      if (T.state === 'safe') continue;
      const held = p.holding === T;
      const a = held ? Math.max(0.6, T.seen) : T.seen;
      if (a < 0.02) continue;
      ctx.globalAlpha = Math.min(1, a);
      const panic = T.state === 'panic' && !opts.reducedMotion ? 1 + 0.15 * Math.sin(this.time * 14) : 1;
      ctx.drawImage(this.glowDot(TOURIST, 0.2), sx(T.x) - this.glowSize(0.2) / 2 * panic, sy(T.y) - this.glowSize(0.2) / 2 * panic, this.glowSize(0.2) * panic, this.glowSize(0.2) * panic);
      ctx.globalAlpha = 1;
      if (held) {
        ctx.strokeStyle = rgba(TOURIST, 0.5);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx(T.x), sy(T.y));
        ctx.lineTo(sx(p.x), sy(p.y));
        ctx.stroke();
      }
    }
    for (const Ls of game.listeners) {
      if (Ls.seen < 0.02) continue;
      ctx.globalAlpha = Math.min(1, Ls.seen);
      const gs = this.glowSize(0.3);
      ctx.drawImage(this.glowDot(THREAT, 0.3), sx(Ls.x) - gs / 2, sy(Ls.y) - gs / 2, gs, gs);
      if (Ls.state === 'hunt' || Ls.state === 'search') {
        ctx.fillStyle = THREAT;
        ctx.font = `800 ${Math.max(10, s * 0.6)}px "Syne", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(Ls.state === 'hunt' ? '!' : '?', sx(Ls.x), sy(Ls.y) - s * 0.35);
      }
      ctx.globalAlpha = 1;
    }

    // ---- Player: always visible ----
    if (!game.attract) {
      const gs = this.glowSize(0.22);
      const fade = game.status === 'failed' ? Math.max(0, 1 - (game.t - game.endedAt)) : 1;
      ctx.globalAlpha = fade;
      ctx.drawImage(this.glowDot(PLAYER, 0.22), sx(p.x) - gs / 2, sy(p.y) - gs / 2, gs, gs);
      ctx.strokeStyle = PLAYER;
      ctx.lineWidth = Math.max(1.5, s / 14);
      ctx.beginPath();
      const fx = Math.cos(p.facing);
      const fy = Math.sin(p.facing);
      ctx.moveTo(sx(p.x) + fx * s * 0.3, sy(p.y) + fy * s * 0.3);
      ctx.lineTo(sx(p.x) + fx * s * 0.48, sy(p.y) + fy * s * 0.48);
      ctx.stroke();
      if (p.sneaking) {
        ctx.strokeStyle = rgba(PLAYER, 0.35);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx(p.x), sy(p.y), s * 0.42, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ---- Effects ----
    this.drawEffects(game, frameDt, opts);
    if (opts.debug) this.drawDebug(game, x0, y0, x1, y1, sx, sy, opts);
  }

  private glowSize(radiusTiles: number): number {
    return Math.ceil(radiusTiles * Math.round(this.scale * this.dpr) * 5) / this.dpr;
  }

  private drawFloorDot(L: Level, tile: number, px: number, py: number, a: number, color: string, fake: boolean): void {
    const ctx = this.ctx;
    const s = this.scale;
    const cx = px + s / 2;
    const cy = py + s / 2;
    const mat = (fake && L.pit[tile] ? Mat.Rock : L.mat[tile]) as Mat;
    ctx.globalAlpha = a;
    switch (mat) {
      case Mat.Water: {
        ctx.strokeStyle = MAT_COLOR[Mat.Water];
        ctx.lineWidth = Math.max(1, s / 16);
        ctx.globalAlpha = Math.min(1, a * 2);
        ctx.beginPath();
        ctx.arc(cx, cy + s * 0.1, s * 0.3, Math.PI * 1.15, Math.PI * 1.85);
        ctx.moveTo(cx - s * 0.15 + s * 0.15 * Math.cos(Math.PI * 1.2), cy + s * 0.35);
        ctx.arc(cx, cy + s * 0.38, s * 0.18, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();
        break;
      }
      case Mat.Gravel: {
        ctx.fillStyle = MAT_COLOR[Mat.Gravel];
        ctx.globalAlpha = Math.min(1, a * 1.6);
        const d = Math.max(1, s / 12);
        ctx.fillRect(cx - s * 0.2, cy - s * 0.1, d, d);
        ctx.fillRect(cx + s * 0.12, cy - s * 0.18, d, d);
        ctx.fillRect(cx - s * 0.02, cy + s * 0.16, d, d);
        ctx.fillRect(cx + s * 0.2, cy + s * 0.12, d, d);
        break;
      }
      case Mat.Moss: {
        ctx.fillStyle = MOSS_WALL;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.12, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case Mat.Metal: {
        ctx.strokeStyle = MAT_COLOR[Mat.Metal];
        ctx.lineWidth = 1;
        ctx.globalAlpha = Math.min(1, a * 1.4);
        ctx.strokeRect(cx - s * 0.3, cy - s * 0.3, s * 0.6, s * 0.6);
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.3, cy);
        ctx.lineTo(cx + s * 0.3, cy);
        ctx.moveTo(cx, cy - s * 0.3);
        ctx.lineTo(cx, cy + s * 0.3);
        ctx.stroke();
        break;
      }
      default: {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1, s * 0.09), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawFeatures(
    game: Game, x0: number, y0: number, x1: number, y1: number,
    sx: (x: number) => number, sy: (y: number) => number, hc: boolean,
  ): void {
    const ctx = this.ctx;
    const L = game.level;
    const s = this.scale;
    const mem = game.memory;
    for (let f = 0; f < L.features.length; f++) {
      const b = mem.featBright[f];
      if (b < 0.015) continue;
      const t = L.features[f];
      const tx = t % L.w;
      const ty = (t / L.w) | 0;
      if (tx < x0 || tx > x1 || ty < y0 || ty > y1) continue;
      const px = sx(tx);
      const py = sy(ty);
      ctx.globalAlpha = Math.min(1, hc ? b * 1.4 : b);
      if (L.pit[t]) {
        // The drop: a dim red dashed rim on each side that borders solid ground.
        ctx.strokeStyle = PIT;
        ctx.lineWidth = Math.max(1, s / 12);
        ctx.setLineDash([s / 6, s / 8]);
        ctx.beginPath();
        const edge = (nx: number, ny: number) => nx < 0 || ny < 0 || nx >= L.w || ny >= L.h || !L.pit[ny * L.w + nx];
        const i = s * 0.12;
        if (edge(tx, ty - 1)) { ctx.moveTo(px + i, py + i); ctx.lineTo(px + s - i, py + i); }
        if (edge(tx, ty + 1)) { ctx.moveTo(px + i, py + s - i); ctx.lineTo(px + s - i, py + s - i); }
        if (edge(tx - 1, ty)) { ctx.moveTo(px + i, py + i); ctx.lineTo(px + i, py + s - i); }
        if (edge(tx + 1, ty)) { ctx.moveTo(px + s - i, py + i); ctx.lineTo(px + s - i, py + s - i); }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = rgba(PIT, 0.12);
        ctx.fillRect(px + i, py + i, s - 2 * i, s - 2 * i);
      } else if (L.rubble[t]) {
        ctx.fillStyle = MAT_COLOR[Mat.Gravel];
        for (let k = 0; k < 6; k++) {
          const a = k * 1.9 + tx;
          const rr = s * (0.12 + (k % 3) * 0.08);
          const d = Math.max(2, s * (0.08 + (k % 2) * 0.05));
          ctx.fillRect(px + s / 2 + Math.cos(a) * rr - d / 2, py + s / 2 + Math.sin(a) * rr - d / 2, d, d);
        }
      } else if (L.rail[t]) {
        ctx.strokeStyle = MAT_COLOR[Mat.Metal];
        ctx.lineWidth = Math.max(1, s / 14);
        ctx.beginPath();
        const cx = px + s / 2;
        const cy = py + s / 2;
        const rail = (nx: number, ny: number) => nx >= 0 && ny >= 0 && nx < L.w && ny < L.h && L.rail[ny * L.w + nx] === 1;
        const gap = s * 0.2;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (!rail(tx + dx, ty + dy)) continue;
          const ex = cx + dx * s * 0.5;
          const ey = cy + dy * s * 0.5;
          ctx.moveTo(cx - dy * gap, cy - dx * gap);
          ctx.lineTo(ex - dy * gap, ey - dx * gap);
          ctx.moveTo(cx + dy * gap, cy + dx * gap);
          ctx.lineTo(ex + dy * gap, ey + dx * gap);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawZones(
    game: Game, x0: number, y0: number, x1: number, y1: number,
    sx: (x: number) => number, sy: (y: number) => number, opts: RenderOptions,
  ): void {
    const ctx = this.ctx;
    const L = game.level;
    const s = this.scale;
    ctx.strokeStyle = MAT_COLOR[Mat.Water];
    ctx.lineWidth = 1;
    const t = opts.reducedMotion ? 0 : this.time;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const i = ty * L.w + tx;
        if (!game.zone[i] || L.solid[i]) continue;
        const ph = ((tx * 7 + ty * 3) % 10) / 10;
        const a = 0.05 + 0.05 * Math.sin((t * 2 + ph * 6.28));
        ctx.globalAlpha = opts.highContrast ? a * 2.2 : a;
        const off = ((t * s * 1.4 + ph * s) % s);
        ctx.beginPath();
        ctx.moveTo(sx(tx) + s * 0.3, sy(ty) + off * 0.5);
        ctx.lineTo(sx(tx) + s * 0.3, sy(ty) + off * 0.5 + s * 0.35);
        ctx.moveTo(sx(tx) + s * 0.7, sy(ty) + ((off + s * 0.5) % s) * 0.5);
        ctx.lineTo(sx(tx) + s * 0.7, sy(ty) + ((off + s * 0.5) % s) * 0.5 + s * 0.35);
        ctx.stroke();
      }
    }
    for (const f of L.waterfalls) {
      const fx = f % L.w;
      const fy = (f / L.w) | 0;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = mix(MAT_COLOR[Mat.Water], '#FFFFFF', 0.3);
      for (let k = 0; k < 4; k++) {
        const yy = ((t * 3 + k / 4) % 1) * s;
        ctx.fillRect(sx(fx) + s * (0.2 + k * 0.18), sy(fy) + yy * 0.8, 1.5, s * 0.25);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawEffects(game: Game, frameDt: number, opts: RenderOptions): void {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    if (this.alertT > 0) {
      this.alertT -= frameDt;
      const a = Math.max(0, this.alertT / 0.7);
      if (opts.reducedMotion) {
        // No flashing: a steady thin border while it lasts.
        ctx.strokeStyle = rgba(THREAT, 0.55);
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, w - 6, h - 6);
      } else {
        const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
        g.addColorStop(0, rgba(THREAT, 0));
        g.addColorStop(1, rgba(THREAT, 0.45 * a));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
    }
    if (game.status === 'failed') {
      const k = opts.reducedMotion ? 0.75 : Math.min(0.92, (game.t - game.endedAt) * 0.92);
      ctx.fillStyle = `rgba(0,0,0,${k})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private drawDebug(
    game: Game, x0: number, y0: number, x1: number, y1: number,
    sx: (x: number) => number, sy: (y: number) => number, opts: RenderOptions,
  ): void {
    const ctx = this.ctx;
    const L = game.level;
    const s = this.scale;
    const f = game.lastField;
    if (f) {
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const d = f.dist[ty * L.w + tx];
          if (!Number.isFinite(d)) continue;
          const v = Math.min(1, d / Math.max(1, f.limit));
          ctx.fillStyle = `hsla(${200 - v * 200}, 90%, 55%, 0.22)`;
          ctx.fillRect(sx(tx), sy(ty), s, s);
        }
      }
    }
    // Faint full map so paths read.
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (L.solid[ty * L.w + tx]) ctx.strokeRect(sx(tx) + 0.5, sy(ty) + 0.5, s - 1, s - 1);
      }
    }
    ctx.font = `600 ${Math.max(9, s * 0.38)}px "Martian Mono", ui-monospace, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (const Ls of game.listeners) {
      ctx.strokeStyle = 'rgba(255,77,109,0.9)';
      ctx.fillStyle = 'rgba(255,77,109,0.9)';
      ctx.beginPath();
      ctx.arc(sx(Ls.x), sy(Ls.y), s * 0.35, 0, Math.PI * 2);
      ctx.stroke();
      if (Ls.field) {
        const path = pathDownhill(L, Ls.field, tileAt(L, Ls.x, Ls.y), 80);
        ctx.beginPath();
        path.forEach((t, i) => {
          const px = sx(t % L.w) + s / 2;
          const py = sy((t / L.w) | 0) + s / 2;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }
      ctx.fillText(Ls.state, sx(Ls.x) + s * 0.4, sy(Ls.y) + s * 0.3);
    }
    for (const m of game.mimics) {
      ctx.fillStyle = 'rgba(199,125,255,0.9)';
      ctx.fillText('Z', sx(m.x) - 3, sy(m.y) - 6);
    }
    const lines = [
      `${opts.fps.toFixed(0)} fps`,
      `pulses ${game.pulses.length}`,
      `t ${game.t.toFixed(1)}s  sounds ${game.stats.sounds}  alerts ${game.stats.alerts}`,
      `threat ${Number.isFinite(game.nearestThreat) ? game.nearestThreat.toFixed(1) : '—'}  room ${game.roomSize}`,
      `fields cached ${game.fields.hits}/${game.fields.hits + game.fields.misses}`,
    ];
    ctx.fillStyle = 'rgba(5,6,11,0.8)';
    ctx.fillRect(8, this.height - 14 - lines.length * 16, 330, lines.length * 16 + 8);
    ctx.fillStyle = '#9BE7FF';
    ctx.font = '600 12px "Martian Mono", ui-monospace, monospace';
    lines.forEach((l, i) => ctx.fillText(l, 14, this.height - 10 - (lines.length - i) * 16));
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
