/**
 * Draws a World on a canvas in tile units: a cached blueprint layer (grid, walls, windows, exits,
 * fixtures), then doors, beams, cones, plan paths, items, crates, actors, threats and effects.
 * Never touches the simulation's state.
 */
import { BODY_R, CAM_HALF, CAM_LEN, CONE_HALF, CONE_LEN, CRATE_HALF, HZ } from '../sim/constants';
import { Tile, type Level } from '../sim/level';
import type { Recording } from '../sim/recording';
import { rayLength } from '../sim/vision';
import type { Caught, SimEvent, World } from '../sim/world';
import { cameraBlind } from '../sim/threats/camera';
import { triggerActive } from '../sim/objects/triggers';
import { C, FONT_MONO, FONT_UI, SHAPES, copyColor, type Shape } from './palette';

export interface DrawOpts {
  alpha: number;
  /** seconds, for animation */
  now: number;
  lanes: Recording[];
  showPaths: boolean;
  /** lane being re-recorded (-1 none) */
  selected: number;
  colorblind: boolean;
  reduced: boolean;
  debug: boolean;
  /** dim everything (pause, results) */
  dim?: number;
  /** 0..1 progress of the rewind effect, or -1 */
  rewind: number;
  /** highlight the detection */
  caught: Caught | null;
  /** extra zoom-out for the payoff replay (1 = normal) */
  zoom?: number;
  /** css px of screen shake (0 = none) */
  shake?: number;
  /** 0..1: the slow last second (a pink vignette) */
  urgency?: number;
}

interface Fx {
  kind: 'ring' | 'bell' | 'spark' | 'paradox' | 'land' | 'door';
  x: number;
  y: number;
  t0: number;
  color: string;
  life: number;
}

const TAU = Math.PI * 2;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lv: Level | null = null;
  private layer: HTMLCanvasElement | null = null;
  private layerKey = '';
  /** css px per tile */
  tile = 16;
  /** css px offset of tile (0,0) */
  ox = 0;
  oy = 0;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;
  private camX = 0;
  private camY = 0;
  private camInit = false;
  private fx: Fx[] = [];
  /** extra space kept clear at the top (HUD) and bottom, css px */
  padTop = 56;
  padBottom = 8;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  setLevel(lv: Level): void {
    this.lv = lv;
    this.layerKey = '';
    this.camInit = false;
    this.fx = [];
  }

  /** Fit the canvas to its element and pick the tile size. */
  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.cssW = Math.max(1, r.width);
    this.cssH = Math.max(1, r.height);
    const w = Math.round(this.cssW * this.dpr);
    const h = Math.round(this.cssH * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** css px → tile coordinates */
  toWorld(cx: number, cy: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [(cx - r.left - this.ox) / this.tile, (cy - r.top - this.oy) / this.tile];
  }

  private fit(zoom: number, focus: [number, number] | null): void {
    const lv = this.lv!;
    const availW = this.cssW - 16;
    const availH = this.cssH - this.padTop - this.padBottom;
    let tile = Math.min(availW / lv.w, availH / lv.h, 40);
    const minTile = this.cssW < 600 ? 11 : 14;
    tile = Math.max(tile, minTile) / zoom;
    this.tile = tile;
    const mapW = lv.w * tile;
    const mapH = lv.h * tile;
    // centre when it fits, else follow the focus with a smoothed camera
    const fx = focus ? focus[0] : lv.w / 2;
    const fy = focus ? focus[1] : lv.h / 2;
    const tx = mapW <= availW ? (this.cssW - mapW) / 2 : clamp(this.cssW / 2 - fx * tile, this.cssW - 8 - mapW, 8);
    const ty = mapH <= availH ? this.padTop + (availH - mapH) / 2 : clamp(this.padTop + availH / 2 - fy * tile, this.cssH - this.padBottom - mapH, this.padTop);
    if (!this.camInit) {
      this.camX = tx;
      this.camY = ty;
      this.camInit = true;
    } else {
      this.camX += (tx - this.camX) * 0.12;
      this.camY += (ty - this.camY) * 0.12;
      if (Math.abs(tx - this.camX) < 0.3) this.camX = tx;
      if (Math.abs(ty - this.camY) < 0.3) this.camY = ty;
    }
    this.ox = Math.round(this.camX);
    this.oy = Math.round(this.camY);
  }

  /** Effects from simulation events (called once per tick with that tick's events). */
  onEvents(evs: SimEvent[], now: number, lanes: number): void {
    for (const e of evs) {
      const col = e.actor >= 0 ? (e.actor === lanes ? C.player : copyColor(e.actor)) : C.ink;
      switch (e.kind) {
        case 'pickup':
        case 'drop':
        case 'pass':
          this.fx.push({ kind: 'spark', x: e.x, y: e.y, t0: now, color: C.target, life: 0.5 });
          break;
        case 'press':
          this.fx.push({ kind: 'ring', x: e.x, y: e.y, t0: now, color: col, life: 0.6 });
          break;
        case 'bell':
          this.fx.push({ kind: 'bell', x: e.x, y: e.y, t0: now, color: C.lure, life: 1.4 });
          break;
        case 'land':
          this.fx.push({ kind: 'bell', x: e.x, y: e.y, t0: now, color: C.coin, life: 1 });
          break;
        case 'paradox':
          this.fx.push({ kind: 'paradox', x: e.x, y: e.y, t0: now, color: C.threat, life: 0.8 });
          break;
        case 'door':
          this.fx.push({ kind: 'door', x: e.x, y: e.y, t0: now, color: e.b ? C.doorOpen : C.doorClosed, life: 0.35 });
          break;
        default:
          break;
      }
    }
  }

  /** A ring that grows from a point (a new copy appearing, a level starting). */
  ring(x: number, y: number, color: string, now: number): void {
    this.fx.push({ kind: 'paradox', x, y, t0: now, color, life: 0.7 });
    this.fx.push({ kind: 'spark', x, y, t0: now, color, life: 0.5 });
  }

  clearFx(): void {
    this.fx = [];
  }

  draw(w: World, o: DrawOpts): void {
    const lv = this.lv;
    if (!lv) return;
    const ctx = this.ctx;
    const focus = w.live ? [lerp(w.live.px, w.live.x, o.alpha), lerp(w.live.py, w.live.y, o.alpha)] as [number, number] : null;
    this.fit(o.zoom ?? 1, focus);
    if (o.shake) {
      this.ox += Math.round(Math.sin(o.now * 91) * o.shake);
      this.oy += Math.round(Math.cos(o.now * 77) * o.shake);
    }
    const d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    this.drawBackdropGrid();
    this.ensureLayer();
    if (this.layer) ctx.drawImage(this.layer, this.ox, this.oy, lv.w * this.tile, lv.h * this.tile);

    // tile space
    const s = this.tile;
    ctx.setTransform(d * s, 0, 0, d * s, d * this.ox, d * this.oy);
    const px = 1 / s;
    this.drawTriggers(w, px, o.now);
    this.drawDoors(w, px);
    this.drawLasers(w, px, o.now);
    this.drawCones(w, o.alpha, px);
    if (o.showPaths) this.drawPaths(w, o, px);
    this.drawStones(w, px, o.now);
    this.drawCrates(w, o.alpha, px);
    this.drawItems(w, o.alpha, px, o.now, false);
    this.drawActors(w, o, px);
    this.drawItems(w, o.alpha, px, o.now, true);
    this.drawThreats(w, o.alpha, px, o.now);
    this.drawFx(px, o.now);
    if (o.caught) this.drawCaught(w, o.caught, px, o.now);
    if (o.debug) this.drawDebug(w, px);

    ctx.setTransform(d, 0, 0, d, 0, 0);
    if (o.urgency) {
      const r = Math.hypot(this.cssW, this.cssH) / 2;
      const gr = ctx.createRadialGradient(this.cssW / 2, this.cssH / 2, r * 0.55, this.cssW / 2, this.cssH / 2, r);
      gr.addColorStop(0, 'rgba(255, 126, 182, 0)');
      gr.addColorStop(1, `rgba(255, 126, 182, ${0.22 * o.urgency})`);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
    if (o.rewind >= 0) this.drawRewind(o.rewind, o.reduced, o.now);
    if (o.dim) {
      ctx.fillStyle = `rgba(5, 10, 20, ${o.dim})`;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
  }

  // ---------- static layer ----------

  private drawBackdropGrid(): void {
    const ctx = this.ctx;
    const step = 16;
    ctx.strokeStyle = 'rgba(120, 165, 230, 0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ((this.ox % step) + step) % step; x < this.cssW; x += step) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, this.cssH);
    }
    for (let y = ((this.oy % step) + step) % step; y < this.cssH; y += step) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(this.cssW, Math.round(y) + 0.5);
    }
    ctx.stroke();
  }

  private ensureLayer(): void {
    const lv = this.lv!;
    const scale = this.tile * this.dpr;
    const key = `${lv.id}:${lv.text.length}:${scale.toFixed(3)}`;
    if (key === this.layerKey && this.layer) return;
    this.layerKey = key;
    const cv = this.layer ?? document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(lv.w * scale));
    cv.height = Math.max(1, Math.ceil(lv.h * scale));
    const g = cv.getContext('2d')!;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    paintLayer(g, lv, 1 / this.tile);
    this.layer = cv;
  }

  // ---------- dynamic ----------

  private drawTriggers(w: World, px: number, now: number): void {
    const ctx = this.ctx;
    const lv = w.lv;
    lv.triggers.forEach((def, g) => {
      const on = triggerActive(w, g);
      for (const [tx, ty] of def.tiles) {
        const x = tx + 0.5;
        const y = ty + 0.5;
        if (def.type === 'plate' || def.type === 'lever') {
          // multi-tile plates draw as one slab: inset only on edges that aren't shared
          const same = (dx: number, dy: number) => lv.triggerAt[(ty + dy) * lv.w + tx + dx] === g;
          const x0 = tx + (same(-1, 0) ? 0 : 0.12);
          const x1 = tx + 1 - (same(1, 0) ? 0 : 0.12);
          const y0 = ty + (same(0, -1) ? 0 : 0.12);
          const y1 = ty + 1 - (same(0, 1) ? 0 : 0.12);
          ctx.fillStyle = on ? 'rgba(255, 194, 75, 0.45)' : 'rgba(255, 194, 75, 0.08)';
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
          ctx.strokeStyle = C.plate;
          ctx.lineWidth = on ? 2.2 * px : 1.4 * px;
          ctx.beginPath();
          if (!same(0, -1)) (ctx.moveTo(x0, y0), ctx.lineTo(x1, y0));
          if (!same(0, 1)) (ctx.moveTo(x0, y1), ctx.lineTo(x1, y1));
          if (!same(-1, 0)) (ctx.moveTo(x0, y0), ctx.lineTo(x0, y1));
          if (!same(1, 0)) (ctx.moveTo(x1, y0), ctx.lineTo(x1, y1));
          ctx.stroke();
          if (def.type === 'lever') {
            ctx.beginPath();
            ctx.moveTo(x - 0.12, y + 0.2);
            ctx.lineTo(x + (on ? 0.18 : -0.18), y - 0.22);
            ctx.stroke();
          }
        } else if (def.type === 'switch') {
          ctx.strokeStyle = C.plate;
          ctx.lineWidth = 1.5 * px;
          roundRect(ctx, tx + 0.2, ty + 0.32, 0.6, 0.36, 0.18);
          ctx.stroke();
          ctx.fillStyle = on ? C.doorOpen : C.muted;
          ctx.beginPath();
          ctx.arc(on ? x + 0.12 : x - 0.12, y, 0.13, 0, TAU);
          ctx.fill();
        } else if (def.type === 'button') {
          const left = on ? (w.triggers[g].until - w.t) / (def.seconds * HZ) : 0;
          ctx.strokeStyle = C.plate;
          ctx.lineWidth = 1.5 * px;
          ctx.beginPath();
          ctx.arc(x, y, 0.3, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = on ? C.plate : 'rgba(255, 194, 75, 0.2)';
          ctx.beginPath();
          ctx.arc(x, y, 0.18, 0, TAU);
          ctx.fill();
          if (on) {
            ctx.strokeStyle = C.doorOpen;
            ctx.lineWidth = 2 * px;
            ctx.beginPath();
            ctx.arc(x, y, 0.4, -Math.PI / 2, -Math.PI / 2 + TAU * left);
            ctx.stroke();
          }
        } else if (def.type === 'lure') {
          ctx.strokeStyle = C.lure;
          ctx.fillStyle = 'rgba(255, 126, 182, 0.18)';
          ctx.lineWidth = 1.5 * px;
          ctx.beginPath();
          ctx.arc(x, y, 0.32, 0, TAU);
          ctx.fill();
          ctx.stroke();
          bellGlyph(ctx, x, y, 0.22, C.lure, px);
        } else if (def.type === 'shutter') {
          ctx.strokeStyle = C.card;
          ctx.lineWidth = 1.5 * px;
          roundRect(ctx, tx + 0.18, ty + 0.18, 0.64, 0.64, 0.12);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(tx + 0.3, ty + 0.5);
          ctx.lineTo(tx + 0.7, ty + 0.5);
          ctx.stroke();
        }
      }
      void now;
    });
  }

  private drawDoors(w: World, px: number): void {
    const ctx = this.ctx;
    const lv = w.lv;
    lv.doors.forEach((d, i) => {
      const open = w.doorOpen[i];
      for (const [tx, ty] of d.tiles) {
        const horiz = isWallish(lv, tx - 1, ty) || isWallish(lv, tx + 1, ty) || lv.doorAt[ty * lv.w + tx - 1] === i || lv.doorAt[ty * lv.w + tx + 1] === i;
        if (open) {
          ctx.strokeStyle = C.doorOpen;
          ctx.lineWidth = 2 * px;
          ctx.setLineDash([3 * px, 3 * px]);
          ctx.beginPath();
          if (horiz) {
            ctx.moveTo(tx, ty + 0.5);
            ctx.lineTo(tx + 1, ty + 0.5);
          } else {
            ctx.moveTo(tx + 0.5, ty);
            ctx.lineTo(tx + 0.5, ty + 1);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.fillStyle = C.doorClosed;
          if (horiz) ctx.fillRect(tx, ty + 0.3, 1, 0.4);
          else ctx.fillRect(tx + 0.3, ty, 0.4, 1);
          ctx.fillStyle = 'rgba(255, 77, 94, 0.15)';
          ctx.fillRect(tx, ty, 1, 1);
        }
        // the door's letter, small
        ctx.fillStyle = open ? 'rgba(91, 228, 155, 0.8)' : '#fff';
        ctx.font = `700 ${0.42}px ${FONT_MONO}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (d.tiles[0][0] === tx && d.tiles[0][1] === ty) ctx.fillText(d.letter, tx + 0.5, ty + 0.52);
      }
    });
  }

  private drawLasers(w: World, px: number, now: number): void {
    const ctx = this.ctx;
    w.lasers.forEach((L, i) => {
      const def = w.lv.lasers[i];
      ctx.fillStyle = C.laser;
      ctx.fillRect(def.x + 0.25, def.y + 0.25, 0.5, 0.5);
      if (!L.on) {
        ctx.strokeStyle = 'rgba(255, 59, 92, 0.25)';
        ctx.lineWidth = 1 * px;
        ctx.setLineDash([2 * px, 4 * px]);
        ctx.beginPath();
        ctx.moveTo(L.x0, L.y0);
        ctx.lineTo(L.fx, L.fy);
        ctx.stroke();
        ctx.setLineDash([]);
        return;
      }
      const flick = 0.85 + 0.15 * Math.sin(now * 40 + i);
      ctx.strokeStyle = `rgba(255, 59, 92, ${0.25 * flick})`;
      ctx.lineWidth = 6 * px;
      ctx.beginPath();
      ctx.moveTo(L.x0, L.y0);
      ctx.lineTo(L.x1, L.y1);
      ctx.stroke();
      ctx.strokeStyle = C.laser;
      ctx.lineWidth = 1.6 * px;
      ctx.stroke();
      if (L.blockedBy) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(L.x1, L.y1, 0.1, 0, TAU);
        ctx.fill();
      }
    });
  }

  private drawCones(w: World, a: number, px: number): void {
    for (const g of w.guards) {
      const x = lerp(g.px, g.x, a);
      const y = lerp(g.py, g.y, a);
      this.cone(w, x, y, g.face, CONE_HALF, CONE_LEN, g.alerted ? 'rgba(255, 150, 90, 0.2)' : C.cone, C.coneEdge, px);
    }
    w.cameras.forEach((c, i) => {
      const def = w.lv.cameras[i];
      if (cameraBlind(w, c)) return;
      this.cone(w, def.x + 0.5, def.y + 0.5, c.angle, CAM_HALF, CAM_LEN, C.camCone, C.coneEdge, px);
    });
    // lamps: the lit hall, with the pendulum's shadow
    const ctx = this.ctx;
    w.lamps.forEach((s, i) => {
      const d = w.lv.lamps[i];
      const [x0, y0, x1, y1] = d.rect;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
      ctx.arc(s.sx, s.sy, d.radius, 0, TAU, true);
      ctx.fillStyle = 'rgba(255, 214, 120, 0.16)';
      ctx.fill('evenodd');
      ctx.restore();
      ctx.strokeStyle = 'rgba(255, 214, 120, 0.5)';
      ctx.lineWidth = 1 * px;
      ctx.strokeRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
      ctx.beginPath();
      ctx.arc(s.sx, s.sy, d.radius, 0, TAU);
      ctx.stroke();
    });
  }

  private cone(w: World, x: number, y: number, face: number, half: number, len: number, fill: string, edge: string, px: number): void {
    const ctx = this.ctx;
    const n = 36;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = 0; i <= n; i++) {
      const ang = face - half + (2 * half * i) / n;
      const r = rayLength(w, x, y, ang, len);
      ctx.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1 * px;
    ctx.stroke();
  }

  private drawPaths(w: World, o: DrawOpts, px: number): void {
    const ctx = this.ctx;
    o.lanes.forEach((r, lane) => {
      if (lane === o.selected) return;
      const col = copyColor(lane);
      const actor = w.actors[lane];
      const frozenAt = actor && actor.state === 'paradox' ? actor.paradoxAt - r.delay : Infinity;
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.32;
      ctx.lineWidth = 1.5 * px;
      ctx.beginPath();
      const n = Math.min(r.cut, frozenAt);
      for (let f = 0; f < n; f += 2) {
        if (f === 0) ctx.moveTo(r.xs[0], r.ys[0]);
        else ctx.lineTo(r.xs[f], r.ys[f]);
      }
      if (n > 0) ctx.lineTo(r.xs[Math.max(0, n - 1)], r.ys[Math.max(0, n - 1)]);
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = col;
      for (let f = HZ - (r.delay % HZ); f < n; f += HZ) {
        ctx.beginPath();
        ctx.arc(r.xs[f], r.ys[f], 0.09, 0, TAU);
        ctx.fill();
      }
      // the rest of a path that a paradox cut off
      if (isFinite(frozenAt) && frozenAt < r.cut) {
        ctx.globalAlpha = 0.18;
        ctx.setLineDash([2 * px, 3 * px]);
        ctx.beginPath();
        for (let f = Math.max(0, frozenAt); f < r.cut; f += 3) {
          if (f === Math.max(0, frozenAt)) ctx.moveTo(r.xs[f], r.ys[f]);
          else ctx.lineTo(r.xs[f], r.ys[f]);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
    });
  }

  private drawStones(w: World, px: number, now: number): void {
    const ctx = this.ctx;
    for (const [tx, ty] of w.lv.stones) {
      const x = tx + 0.5;
      const y = ty + 0.5;
      const pulse = 0.5 + 0.5 * Math.sin(now * 3);
      ctx.fillStyle = `rgba(179, 136, 255, ${0.12 + 0.1 * pulse})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.48, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = C.stone;
      ctx.lineWidth = 1.5 * px;
      // hourglass
      ctx.beginPath();
      ctx.moveTo(x - 0.2, y - 0.28);
      ctx.lineTo(x + 0.2, y - 0.28);
      ctx.lineTo(x - 0.2, y + 0.28);
      ctx.lineTo(x + 0.2, y + 0.28);
      ctx.closePath();
      ctx.stroke();
    }
  }

  private drawCrates(w: World, a: number, px: number): void {
    const ctx = this.ctx;
    for (const c of w.crates) {
      const x = lerp(c.px, c.x, a);
      const y = lerp(c.py, c.y, a);
      const h = CRATE_HALF;
      ctx.fillStyle = '#1a3557';
      ctx.fillRect(x - h, y - h, h * 2, h * 2);
      ctx.strokeStyle = C.wall;
      ctx.lineWidth = 1.5 * px;
      ctx.strokeRect(x - h, y - h, h * 2, h * 2);
      ctx.lineWidth = 1 * px;
      ctx.beginPath();
      ctx.moveTo(x - h, y - h);
      ctx.lineTo(x + h, y + h);
      ctx.moveTo(x + h, y - h);
      ctx.lineTo(x - h, y + h);
      ctx.stroke();
    }
  }

  private drawItems(w: World, a: number, px: number, now: number, carried: boolean): void {
    const ctx = this.ctx;
    for (const it of w.items) {
      if ((it.carrier >= 0) !== carried) continue;
      let x = lerp(it.px, it.x, a);
      let y = lerp(it.py, it.y, a);
      let r = 0.3;
      if (carried) {
        x += 0.34;
        y -= 0.38;
        r = 0.22;
      }
      if (it.fly) {
        const f = it.fly;
        const k = clamp((w.t - 1 + a - f.t0) / (f.t1 - f.t0), 0, 1);
        y -= Math.sin(k * Math.PI) * 0.6;
      }
      switch (it.kind) {
        case 'target': {
          const glow = 0.5 + 0.5 * Math.sin(now * 4);
          const gr = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
          gr.addColorStop(0, `rgba(255, 194, 75, ${0.45 + 0.2 * glow})`);
          gr.addColorStop(1, 'rgba(255, 194, 75, 0)');
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.arc(x, y, r * 3, 0, TAU);
          ctx.fill();
          ctx.fillStyle = C.target;
          ctx.beginPath();
          ctx.moveTo(x, y - r);
          ctx.lineTo(x + r * 0.85, y - r * 0.2);
          ctx.lineTo(x, y + r);
          ctx.lineTo(x - r * 0.85, y - r * 0.2);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#fff3d1';
          ctx.lineWidth = 1 * px;
          ctx.beginPath();
          ctx.moveTo(x - r * 0.85, y - r * 0.2);
          ctx.lineTo(x + r * 0.85, y - r * 0.2);
          ctx.stroke();
          break;
        }
        case 'card':
          ctx.fillStyle = C.card;
          roundRect(ctx, x - r, y - r * 0.65, r * 2, r * 1.3, r * 0.2);
          ctx.fill();
          ctx.fillStyle = C.bg;
          ctx.fillRect(x - r, y - r * 0.3, r * 2, r * 0.25);
          break;
        case 'mirror':
          ctx.fillStyle = C.mirror;
          ctx.beginPath();
          ctx.ellipse(x, y, r * 0.7, r, 0, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1 * px;
          ctx.beginPath();
          ctx.moveTo(x - r * 0.2, y - r * 0.5);
          ctx.lineTo(x + r * 0.2, y - r * 0.1);
          ctx.stroke();
          break;
        case 'coin':
          ctx.fillStyle = C.coin;
          ctx.beginPath();
          ctx.arc(x, y, r * 0.7, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = '#8a6418';
          ctx.lineWidth = 1 * px;
          ctx.stroke();
          break;
      }
    }
  }

  private drawActors(w: World, o: DrawOpts, px: number): void {
    const ctx = this.ctx;
    const a = o.alpha;
    // copies first, the live player on top
    const order = [...w.actors].sort((p, q) => Number(p.live) - Number(q.live));
    for (const ac of order) {
      let x = lerp(ac.px, ac.x, a);
      let y = lerp(ac.py, ac.y, a);
      const lane = ac.idx;
      const col = ac.live ? C.player : copyColor(lane);
      const paradox = ac.state === 'paradox';
      if (paradox && !o.reduced) {
        const j = Math.sin(o.now * 53 + lane) * 0.04;
        x += j;
        y -= j * 0.6;
      }
      let r = BODY_R * 0.86;
      if (ac.crouch > 0) r *= 0.8;
      if (ac.vaultUntil > w.t) r *= 1.12;
      ctx.globalAlpha = ac.state === 'wait' ? 0.45 : 1;
      if (ac.live) {
        const gr = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.4);
        gr.addColorStop(0, 'rgba(255,255,255,0.35)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.4, 0, TAU);
        ctx.fill();
      }
      const shape: Shape = o.colorblind && !ac.live ? SHAPES[lane % SHAPES.length] : 'circle';
      ctx.fillStyle = paradox ? '#2a1420' : col;
      drawShape(ctx, shape, x, y, r);
      ctx.fill();
      if (paradox) {
        ctx.strokeStyle = C.threat;
        ctx.lineWidth = 2 * px;
        drawShape(ctx, shape, x, y, r);
        ctx.stroke();
      }
      // facing tick
      ctx.strokeStyle = ac.live ? 'rgba(9,21,38,0.7)' : 'rgba(9,21,38,0.55)';
      ctx.lineWidth = 2 * px;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(ac.face) * r * 0.45, y + Math.sin(ac.face) * r * 0.45);
      ctx.lineTo(x + Math.cos(ac.face) * r * 0.95, y + Math.sin(ac.face) * r * 0.95);
      ctx.stroke();
      // number
      ctx.fillStyle = paradox ? C.threat : '#091526';
      ctx.font = `700 ${0.5}px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ac.live ? '' : String(lane + 1), x, y + 0.03);
      if (ac.live && o.selected >= 0) {
        ctx.fillStyle = copyColor(o.selected);
        ctx.fillText(String(o.selected + 1), x, y + 0.03);
      }
      if (paradox) {
        ctx.strokeStyle = C.threat;
        ctx.lineWidth = 2.4 * px;
        const k = r * 1.25;
        ctx.beginPath();
        ctx.moveTo(x - k, y - k);
        ctx.lineTo(x + k, y + k);
        ctx.moveTo(x + k, y - k);
        ctx.lineTo(x - k, y + k);
        ctx.stroke();
        ctx.fillStyle = C.threat;
        ctx.font = `600 ${0.38}px ${FONT_MONO}`;
        ctx.fillText(`${(ac.paradoxAt / HZ).toFixed(1)}s`, x, y - r - 0.4);
      }
      if (ac.crouch > 0) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5 * px;
        ctx.beginPath();
        ctx.arc(x, y, r + 0.18, -Math.PI / 2, -Math.PI / 2 + TAU * (ac.crouch / HZ));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawThreats(w: World, a: number, px: number, now: number): void {
    const ctx = this.ctx;
    for (const g of w.guards) {
      const x = lerp(g.px, g.x, a);
      const y = lerp(g.py, g.y, a);
      const r = BODY_R * 0.82;
      ctx.fillStyle = C.threat;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x + Math.cos(g.face) * r * 0.55, y + Math.sin(g.face) * r * 0.55, r * 0.22, 0, TAU);
      ctx.fill();
      if (g.auditor) {
        ctx.strokeStyle = C.plate;
        ctx.lineWidth = 1.6 * px;
        ctx.beginPath();
        ctx.arc(x, y, r + 0.12, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(now * 2) * r * 0.7, y + Math.sin(now * 2) * r * 0.7);
        ctx.stroke();
      }
      if (g.alerted) {
        ctx.fillStyle = '#FFB36B';
        ctx.font = `800 ${0.62}px ${FONT_UI}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', x, y - r - 0.35);
      }
    }
    for (const h of w.hounds) {
      const x = lerp(h.px, h.x, a);
      const y = lerp(h.py, h.y, a);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(h.face);
      ctx.fillStyle = h.phase === 'sleep' ? '#7a3640' : '#FF6B4D';
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.45, 0.28, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0.38, 0, 0.16, 0, TAU);
      ctx.fill();
      ctx.restore();
      if (h.phase === 'sleep') {
        ctx.fillStyle = C.muted;
        ctx.font = `600 ${0.4}px ${FONT_UI}`;
        ctx.textAlign = 'center';
        ctx.fillText('z', x + 0.4, y - 0.45 - 0.08 * Math.sin(now * 2));
      }
    }
    w.cameras.forEach((c, i) => {
      const d = w.lv.cameras[i];
      const x = d.x + 0.5;
      const y = d.y + 0.5;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(c.angle);
      ctx.fillStyle = cameraBlind(w, c) ? '#55607a' : C.threat;
      ctx.fillRect(-0.18, -0.2, 0.48, 0.4);
      ctx.restore();
      if (cameraBlind(w, c)) {
        ctx.fillStyle = C.card;
        ctx.font = `600 ${0.36}px ${FONT_MONO}`;
        ctx.textAlign = 'center';
        ctx.fillText(`${((c.blindUntil - w.t) / HZ).toFixed(1)}`, x, y - 0.6);
      }
    });
  }

  private drawFx(px: number, now: number): void {
    const ctx = this.ctx;
    this.fx = this.fx.filter((f) => now - f.t0 < f.life);
    for (const f of this.fx) {
      const k = (now - f.t0) / f.life;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 2 * px;
      switch (f.kind) {
        case 'ring':
        case 'door':
          ctx.beginPath();
          ctx.arc(f.x, f.y, 0.3 + k * 0.8, 0, TAU);
          ctx.stroke();
          break;
        case 'bell':
          for (let i = 0; i < 3; i++) {
            const kk = (k * 1.6 + i * 0.25) % 1;
            ctx.globalAlpha = (1 - k) * (1 - kk);
            ctx.beginPath();
            ctx.arc(f.x, f.y, 0.4 + kk * 3, 0, TAU);
            ctx.stroke();
          }
          break;
        case 'spark':
          for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * TAU;
            ctx.beginPath();
            ctx.moveTo(f.x + Math.cos(ang) * (0.3 + k * 0.3), f.y + Math.sin(ang) * (0.3 + k * 0.3));
            ctx.lineTo(f.x + Math.cos(ang) * (0.45 + k * 0.5), f.y + Math.sin(ang) * (0.45 + k * 0.5));
            ctx.stroke();
          }
          break;
        case 'paradox':
          ctx.beginPath();
          ctx.arc(f.x, f.y, 0.5 + k * 1.4, 0, TAU);
          ctx.stroke();
          break;
        case 'land':
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawCaught(w: World, c: Caught, px: number, now: number): void {
    const ctx = this.ctx;
    const pulse = 0.6 + 0.4 * Math.sin(now * 10);
    ctx.strokeStyle = C.threat;
    ctx.lineWidth = 2.5 * px;
    ctx.globalAlpha = 0.5 + 0.5 * pulse;
    ctx.beginPath();
    ctx.moveTo(c.x0, c.y0);
    ctx.lineTo(c.x1, c.y1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c.x1, c.y1, 0.75 + 0.1 * pulse, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    void w;
  }

  private drawDebug(w: World, px: number): void {
    const ctx = this.ctx;
    ctx.lineWidth = 1 * px;
    // vision rays from each guard to each actor
    for (const g of w.guards) {
      for (const a of w.actors) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.moveTo(g.x, g.y);
        ctx.lineTo(a.x, a.y);
        ctx.stroke();
      }
      for (const p of g.path) {
        ctx.fillStyle = 'rgba(255,180,100,0.6)';
        ctx.fillRect(p[0] - 0.08, p[1] - 0.08, 0.16, 0.16);
      }
    }
    // door wiring
    const lv = w.lv;
    ctx.setLineDash([2 * px, 2 * px]);
    for (const d of lv.doors) {
      for (const g of d.wireIdx) {
        const t = lv.triggers[g].tiles[0];
        ctx.strokeStyle = 'rgba(255, 194, 75, 0.6)';
        ctx.beginPath();
        ctx.moveTo(d.tiles[0][0] + 0.5, d.tiles[0][1] + 0.5);
        ctx.lineTo(t[0] + 0.5, t[1] + 0.5);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    for (const a of w.actors) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(a.x, a.y, 0.4, 0, TAU);
      ctx.stroke();
    }
  }

  private drawRewind(k: number, reduced: boolean, now: number): void {
    const ctx = this.ctx;
    const W = this.cssW;
    const H = this.cssH;
    if (reduced) {
      ctx.fillStyle = `rgba(9, 21, 38, ${Math.sin(k * Math.PI) * 0.85})`;
      ctx.fillRect(0, 0, W, H);
      return;
    }
    const a = Math.sin(k * Math.PI);
    ctx.fillStyle = `rgba(20, 50, 90, ${0.25 * a})`;
    ctx.fillRect(0, 0, W, H);
    // scanlines
    ctx.fillStyle = `rgba(0, 0, 0, ${0.22 * a})`;
    for (let y = (now * 240) % 4; y < H; y += 4) ctx.fillRect(0, y, W, 1.5);
    // streaks flying backwards (right to left)
    ctx.strokeStyle = `rgba(160, 210, 255, ${0.35 * a})`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) {
      const y = ((i * 97.3) % 1) * H + ((i * 37) % H);
      const len = 80 + ((i * 53) % 160);
      const x = W - (((now * 2200 + i * 311) % (W + len * 2)) - len);
      ctx.beginPath();
      ctx.moveTo(x, y % H);
      ctx.lineTo(x + len, y % H);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(232, 240, 251, ${a})`;
    ctx.font = `800 ${Math.min(64, W / 9)}px "Archivo", ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('◀◀ REWIND', W / 2 + (1 - k) * 30, H / 2);
  }
}

// ---------- the blueprint layer ----------

function isWallish(lv: Level, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= lv.w || y >= lv.h) return true;
  const t = lv.tiles[y * lv.w + x];
  return t === Tile.Wall || t === Tile.Emitter;
}

function paintLayer(g: CanvasRenderingContext2D, lv: Level, px: number): void {
  // floor
  g.fillStyle = 'rgba(19, 41, 72, 0.55)';
  for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) if (!isWallish(lv, x, y)) g.fillRect(x, y, 1, 1);
  // fine grid on the floor
  g.strokeStyle = C.grid;
  g.lineWidth = px;
  g.beginPath();
  for (let x = 0; x <= lv.w; x++) {
    g.moveTo(x, 0);
    g.lineTo(x, lv.h);
  }
  for (let y = 0; y <= lv.h; y++) {
    g.moveTo(0, y);
    g.lineTo(lv.w, y);
  }
  g.stroke();
  // walls: dark fill with hatching, light outline where they meet the floor
  for (let y = 0; y < lv.h; y++) {
    for (let x = 0; x < lv.w; x++) {
      if (!isWallish(lv, x, y)) continue;
      g.fillStyle = C.wallFill;
      g.fillRect(x, y, 1, 1);
    }
  }
  g.save();
  g.beginPath();
  for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) if (isWallish(lv, x, y)) g.rect(x, y, 1, 1);
  g.clip();
  g.strokeStyle = C.hatch;
  g.lineWidth = px;
  g.beginPath();
  for (let k = -lv.h; k < lv.w + lv.h; k += 0.5) {
    g.moveTo(k, 0);
    g.lineTo(k - lv.h, lv.h);
  }
  g.stroke();
  g.restore();
  g.strokeStyle = C.wall;
  g.lineWidth = 1.6 * px;
  g.lineCap = 'square';
  g.beginPath();
  for (let y = 0; y < lv.h; y++) {
    for (let x = 0; x < lv.w; x++) {
      if (!isWallish(lv, x, y)) continue;
      if (!isWallish(lv, x, y - 1)) {
        g.moveTo(x, y);
        g.lineTo(x + 1, y);
      }
      if (!isWallish(lv, x, y + 1)) {
        g.moveTo(x, y + 1);
        g.lineTo(x + 1, y + 1);
      }
      if (!isWallish(lv, x - 1, y)) {
        g.moveTo(x, y);
        g.lineTo(x, y + 1);
      }
      if (!isWallish(lv, x + 1, y)) {
        g.moveTo(x + 1, y);
        g.lineTo(x + 1, y + 1);
      }
    }
  }
  g.stroke();

  for (let y = 0; y < lv.h; y++) {
    for (let x = 0; x < lv.w; x++) {
      const t = lv.tiles[y * lv.w + x];
      if (t === Tile.Window) {
        const horiz = isWallish(lv, x - 1, y) || isWallish(lv, x + 1, y) || lv.tiles[y * lv.w + x - 1] === Tile.Window || lv.tiles[y * lv.w + x + 1] === Tile.Window;
        g.fillStyle = 'rgba(143, 211, 255, 0.16)';
        g.strokeStyle = C.glass;
        g.lineWidth = 1.2 * px;
        g.beginPath();
        if (horiz) {
          g.fillRect(x, y + 0.3, 1, 0.4);
          g.moveTo(x, y + 0.3);
          g.lineTo(x + 1, y + 0.3);
          g.moveTo(x, y + 0.7);
          g.lineTo(x + 1, y + 0.7);
        } else {
          g.fillRect(x + 0.3, y, 0.4, 1);
          g.moveTo(x + 0.3, y);
          g.lineTo(x + 0.3, y + 1);
          g.moveTo(x + 0.7, y);
          g.lineTo(x + 0.7, y + 1);
        }
        g.stroke();
      } else if (t === Tile.Low) {
        g.fillStyle = 'rgba(215, 230, 247, 0.22)';
        g.fillRect(x + 0.1, y + 0.1, 0.8, 0.8);
        g.strokeStyle = C.wall;
        g.lineWidth = 1.2 * px;
        g.setLineDash([2 * px, 2 * px]);
        g.strokeRect(x + 0.1, y + 0.1, 0.8, 0.8);
        g.setLineDash([]);
      }
    }
  }

  // exit zone: dashed green around the E region
  g.fillStyle = 'rgba(91, 228, 155, 0.08)';
  for (const [x, y] of lv.exits) g.fillRect(x, y, 1, 1);
  g.strokeStyle = C.exit;
  g.lineWidth = 1.6 * px;
  g.setLineDash([3 * px, 2.5 * px]);
  g.beginPath();
  const isE = (x: number, y: number) => x >= 0 && y >= 0 && x < lv.w && y < lv.h && lv.exitAt[y * lv.w + x] === 1;
  for (const [x, y] of lv.exits) {
    if (!isE(x, y - 1)) {
      g.moveTo(x, y);
      g.lineTo(x + 1, y);
    }
    if (!isE(x, y + 1)) {
      g.moveTo(x, y + 1);
      g.lineTo(x + 1, y + 1);
    }
    if (!isE(x - 1, y)) {
      g.moveTo(x, y);
      g.lineTo(x, y + 1);
    }
    if (!isE(x + 1, y)) {
      g.moveTo(x + 1, y);
      g.lineTo(x + 1, y + 1);
    }
  }
  g.stroke();
  g.setLineDash([]);
  if (lv.exits.length) {
    let sx = 0;
    let sy = 0;
    for (const [x, y] of lv.exits) {
      sx += x + 0.5;
      sy += y + 0.5;
    }
    g.fillStyle = 'rgba(91, 228, 155, 0.75)';
    g.font = `700 ${0.42}px ${FONT_MONO}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('EXIT', sx / lv.exits.length, sy / lv.exits.length);
  }

  // the start tile
  const [sx, sy] = lv.start;
  if (sx >= 0) {
    g.strokeStyle = 'rgba(232, 240, 251, 0.45)';
    g.lineWidth = 1.2 * px;
    g.setLineDash([2 * px, 2 * px]);
    g.beginPath();
    g.arc(sx + 0.5, sy + 0.5, 0.46, 0, TAU);
    g.stroke();
    g.setLineDash([]);
  }
  // bells
  for (const [x, y] of lv.bells) bellGlyph(g, x + 0.5, y + 0.5, 0.32, C.lure, px);
}

function bellGlyph(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, px: number): void {
  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineWidth = 1.4 * px;
  g.beginPath();
  g.moveTo(x - r, y + r * 0.6);
  g.quadraticCurveTo(x - r * 0.8, y - r, x, y - r);
  g.quadraticCurveTo(x + r * 0.8, y - r, x + r, y + r * 0.6);
  g.closePath();
  g.globalAlpha = 0.35;
  g.fill();
  g.globalAlpha = 1;
  g.stroke();
  g.beginPath();
  g.arc(x, y + r * 0.8, r * 0.2, 0, TAU);
  g.fill();
}

function drawShape(g: CanvasRenderingContext2D, s: Shape, x: number, y: number, r: number): void {
  g.beginPath();
  if (s === 'circle') {
    g.arc(x, y, r, 0, TAU);
    return;
  }
  if (s === 'square') {
    g.rect(x - r * 0.88, y - r * 0.88, r * 1.76, r * 1.76);
    return;
  }
  const n = s === 'triangle' ? 3 : s === 'diamond' ? 4 : s === 'pentagon' ? 5 : 6;
  const k = s === 'triangle' ? 1.2 : 1.08;
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (i / n) * TAU;
    const xx = x + Math.cos(ang) * r * k;
    const yy = y + Math.sin(ang) * r * k + (s === 'triangle' ? r * 0.15 : 0);
    if (i === 0) g.moveTo(xx, yy);
    else g.lineTo(xx, yy);
  }
  g.closePath();
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

export function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
