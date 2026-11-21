/**
 * The timeline strip: one lane per copy plus the live recording. Bars show when each copy is
 * active (trim handles at both ends), markers show what it did, the playhead shows the tick.
 */
import { HZ } from '../sim/constants';
import type { Recording } from '../sim/recording';
import type { EventKind, SimEvent } from '../sim/world';
import { C, FONT_MONO, FONT_UI, SHAPES, copyColor, type Shape } from './palette';

function shapePath(g: CanvasRenderingContext2D, s: Shape, x: number, y: number, r: number): void {
  g.beginPath();
  if (s === 'circle') return void g.arc(x, y, r, 0, Math.PI * 2);
  if (s === 'square') return void g.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
  const n = s === 'triangle' ? 3 : s === 'diamond' ? 4 : s === 'pentagon' ? 5 : 6;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const k = s === 'triangle' ? 1.2 : 1.08;
    const px = x + Math.cos(a) * r * k;
    const py = y + Math.sin(a) * r * k + (s === 'triangle' ? r * 0.15 : 0);
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

export interface TimelineState {
  lanes: Recording[];
  loopTicks: number;
  /** the playhead */
  t: number;
  /** lane the live player records into */
  liveSlot: number;
  /** lane picked for re-recording, or -1 */
  selected: number;
  recording: boolean;
  /** markers for every lane (plan preview or live loop) */
  events: SimEvent[];
  /** copies' planned markers still ahead of the playhead (drawn faint) */
  upcoming: SimEvent[];
  /** the marker under the pointer */
  tip: SimEvent | null;
  /** words for a marker ("rings the bell") */
  describe: (e: SimEvent) => string;
  /** colour-blind mode: lane chips get their copy's shape */
  colorblind: boolean;
  /** lanes that ended in a paradox, with the tick */
  paradox: Map<number, number>;
  /** can the player scrub/trim/re-record (not in hard-core) */
  editable: boolean;
  maxCopies: number;
  hover: Hit | null;
  drag: Hit | null;
}

export type Hit =
  | { kind: 'chip'; lane: number }
  | { kind: 'start'; lane: number }
  | { kind: 'end'; lane: number }
  | { kind: 'bar'; lane: number }
  | { kind: 'ruler' }
  | { kind: 'lane'; lane: number };

const VERB: Partial<Record<EventKind, string>> = {
  press: 'presses',
  pickup: 'picks up',
  drop: 'drops',
  pass: 'passes through a window',
  throw: 'throws a coin',
  crouch: 'crouches',
  vault: 'vaults',
  paradox: 'breaks (paradox)',
  seen: 'is seen',
  win: 'gets out',
};

const MARK: Partial<Record<EventKind, string>> = {
  press: '●',
  pickup: '▲',
  drop: '▼',
  pass: '◆',
  throw: '➚',
  crouch: '◡',
  vault: '⌃',
  paradox: '✕',
  seen: '!',
  win: '★',
};

export class Timeline {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;
  rowH = 24;
  rulerH = 22;
  gutter = 70;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  /** css height wanted for this many rows (copies + the live lane) */
  heightFor(rows: number, narrow: boolean): number {
    this.rowH = narrow ? 21 : 24;
    this.gutter = narrow ? 56 : 70;
    return this.rulerH + rows * this.rowH + 8;
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    const W = Math.round(this.w * this.dpr);
    const H = Math.round(this.h * this.dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
  }

  private x0(): number {
    return this.gutter;
  }
  private x1(): number {
    return this.w - 14;
  }
  xOf(tick: number, loopTicks: number): number {
    return this.x0() + (Math.max(0, Math.min(loopTicks, tick)) / loopTicks) * (this.x1() - this.x0());
  }
  tickAt(cx: number, loopTicks: number): number {
    const r = this.canvas.getBoundingClientRect();
    const x = cx - r.left;
    return Math.round(Math.max(0, Math.min(1, (x - this.x0()) / (this.x1() - this.x0()))) * loopTicks);
  }
  private rowY(row: number): number {
    return this.rulerH + row * this.rowH;
  }

  hit(cx: number, cy: number, s: TimelineState): Hit | null {
    const r = this.canvas.getBoundingClientRect();
    const x = cx - r.left;
    const y = cy - r.top;
    if (y < this.rulerH) return x >= this.x0() - 6 ? { kind: 'ruler' } : null;
    const row = Math.floor((y - this.rulerH) / this.rowH);
    const rows = this.rowCount(s);
    if (row < 0 || row >= rows) return null;
    const lane = row;
    if (x < this.x0() - 4) return { kind: 'chip', lane };
    const rec = s.lanes[lane];
    if (rec && lane !== s.liveSlot && s.editable) {
      const xs = this.xOf(rec.delay, s.loopTicks);
      const xe = this.xOf(rec.delay + rec.cut, s.loopTicks);
      if (Math.abs(x - xs) <= 9) return { kind: 'start', lane };
      if (Math.abs(x - xe) <= 9) return { kind: 'end', lane };
      if (x > xs && x < xe) return { kind: 'bar', lane };
    }
    return { kind: 'lane', lane };
  }

  /** The marker under the pointer, if any. */
  markerAt(cx: number, cy: number, s: TimelineState): SimEvent | null {
    const r = this.canvas.getBoundingClientRect();
    const x = cx - r.left;
    const y = cy - r.top;
    const row = Math.floor((y - this.rulerH) / this.rowH);
    let best: SimEvent | null = null;
    let bestD = 7;
    for (const e of [...s.events, ...s.upcoming]) {
      if (e.actor !== row || !MARK[e.kind]) continue;
      const d = Math.abs(this.xOf(e.t, s.loopTicks) - x);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private tipBox(text: string, x: number, rowY: number): void {
    const ctx = this.ctx;
    ctx.font = `600 11px ${FONT_UI}`;
    const w = ctx.measureText(text).width + 14;
    const bx = Math.max(4, Math.min(this.w - w - 4, x - w / 2));
    const by = Math.max(2, rowY - 20);
    ctx.fillStyle = 'rgba(232, 240, 251, 0.95)';
    ctx.beginPath();
    ctx.roundRect?.(bx, by, w, 18, 5);
    if (!ctx.roundRect) ctx.rect(bx, by, w, 18);
    ctx.fill();
    ctx.fillStyle = '#091526';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 7, by + 9.5);
    ctx.textAlign = 'center';
  }

  rowCount(s: TimelineState): number {
    return Math.max(s.lanes.length, s.liveSlot + 1);
  }

  draw(s: TimelineState): void {
    const ctx = this.ctx;
    const d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = 'rgba(6, 14, 28, 0.96)';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.strokeStyle = 'rgba(143, 163, 192, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0.5);
    ctx.lineTo(this.w, 0.5);
    ctx.stroke();

    const L = s.loopTicks;
    const secs = Math.round(L / HZ);
    // ruler
    ctx.font = `500 11px ${FONT_MONO}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const phx = this.xOf(s.t, L);
    for (let i = 0; i <= secs; i++) {
      const x = this.xOf(i * HZ, L);
      ctx.fillStyle = i >= secs - 1 && i < secs ? 'rgba(255, 126, 182, 0.8)' : C.muted;
      const lx = x + (this.xOf(HZ, L) - this.xOf(0, L)) / 2;
      // keep clear of the playhead's time label
      const near = lx > phx - 10 && lx < phx + 48;
      if (i < secs && !near) ctx.fillText(String(i), lx, this.rulerH / 2 + 1);
      ctx.strokeStyle = 'rgba(143, 163, 192, 0.22)';
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, this.rulerH - 4);
      ctx.lineTo(Math.round(x) + 0.5, this.h - 6);
      ctx.stroke();
    }
    // the last second runs slow: shade it
    ctx.fillStyle = 'rgba(255, 126, 182, 0.05)';
    ctx.fillRect(this.xOf(L - HZ, L), this.rulerH - 2, this.xOf(L, L) - this.xOf(L - HZ, L), this.h - this.rulerH - 4);
    ctx.textAlign = 'left';
    ctx.fillStyle = C.muted;
    ctx.font = `600 10px ${FONT_UI}`;
    ctx.fillText('SEC', 10, this.rulerH / 2 + 1);

    const rows = this.rowCount(s);
    for (let lane = 0; lane < rows; lane++) {
      const y = this.rowY(lane);
      const isLive = lane === s.liveSlot;
      const rec = s.lanes[lane];
      const col = isLive && s.selected < 0 ? C.player : copyColor(lane);
      const mid = y + this.rowH / 2;
      // track
      ctx.fillStyle = isLive ? 'rgba(255,255,255,0.05)' : 'rgba(143, 163, 192, 0.05)';
      ctx.fillRect(this.x0(), y + 3, this.x1() - this.x0(), this.rowH - 6);
      const hov = s.hover && 'lane' in s.hover && s.hover.lane === lane;
      // chip
      ctx.fillStyle = col;
      if (s.colorblind && !(isLive && s.selected < 0)) {
        shapePath(ctx, SHAPES[lane % SHAPES.length], 18, mid, 8.5);
      } else {
        ctx.beginPath();
        ctx.arc(18, mid, 8, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.fillStyle = '#091526';
      ctx.font = `700 10px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText(isLive && s.selected < 0 ? '●' : String(lane + 1), 18, mid + 1);
      ctx.textAlign = 'left';
      ctx.font = `600 10px ${FONT_UI}`;
      ctx.fillStyle = isLive ? '#fff' : hov && s.editable ? C.ink : C.muted;
      const label = isLive ? (s.recording ? 'REC' : s.selected >= 0 ? 'REDO' : 'NEXT') : s.paradox.has(lane) ? 'BREAK' : 'COPY';
      if (this.gutter >= 64 || isLive) ctx.fillText(label, 31, mid + 1);
      if (isLive) {
        ctx.fillStyle = s.recording ? 'rgba(255, 77, 94, 0.9)' : 'rgba(255,255,255,0.5)';
        if (s.recording && Math.floor(performance.now() / 400) % 2 === 0) {
          ctx.beginPath();
          ctx.arc(this.gutter - 9, mid, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (isLive) {
        // the recording so far
        const x = this.xOf(s.recording ? s.t : 0, L);
        ctx.fillStyle = s.selected >= 0 ? copyColor(s.selected) : '#ffffff';
        ctx.globalAlpha = 0.75;
        ctx.fillRect(this.x0(), y + 6, Math.max(0, x - this.x0()), this.rowH - 12);
        ctx.globalAlpha = 1;
        if (!s.recording) {
          ctx.fillStyle = 'rgba(232, 240, 251, 0.55)';
          ctx.font = `500 11px ${FONT_UI}`;
          ctx.fillText(s.selected >= 0 ? `Recording over copy ${s.selected + 1}: move to start` : s.lanes.length >= s.maxCopies ? 'Crew full: this loop won\'t be kept unless it wins' : 'Move to start the clock', this.x0() + 8, mid + 1);
        }
      } else if (rec) {
        const xs = this.xOf(rec.delay, L);
        const xe = this.xOf(rec.delay + rec.cut, L);
        const pAt = s.paradox.get(lane);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(xs, y + 6, Math.max(2, (pAt !== undefined ? this.xOf(pAt, L) : xe) - xs), this.rowH - 12);
        ctx.globalAlpha = 1;
        if (pAt !== undefined) {
          ctx.fillStyle = 'rgba(255, 77, 94, 0.25)';
          ctx.fillRect(this.xOf(pAt, L), y + 6, Math.max(0, xe - this.xOf(pAt, L)), this.rowH - 12);
        }
        // waiting at the start, and standing after the end
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.35;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        if (rec.delay > 0) {
          ctx.moveTo(this.x0(), mid);
          ctx.lineTo(xs, mid);
        }
        if (xe < this.x1()) {
          ctx.moveTo(xe, mid);
          ctx.lineTo(this.x1(), mid);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        if (s.editable) {
          for (const [kind, x] of [
            ['start', xs],
            ['end', xe],
          ] as const) {
            const active = (s.drag && s.drag.kind === kind && s.drag.lane === lane) || (s.hover && s.hover.kind === kind && s.hover.lane === lane);
            ctx.fillStyle = active ? '#fff' : col;
            ctx.fillRect(x - (active ? 2.5 : 1.5), y + 3, active ? 5 : 3, this.rowH - 6);
          }
        }
        if (lane === s.selected) {
          ctx.strokeStyle = '#fff';
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(this.x0() + 0.5, y + 3.5, this.x1() - this.x0() - 1, this.rowH - 7);
          ctx.setLineDash([]);
        }
      }
    }

    // markers
    ctx.font = `700 11px ${FONT_UI}`;
    ctx.textAlign = 'center';
    const mark = (e: SimEvent, alpha: number) => {
      if (e.actor < 0 || e.actor >= rows) return;
      const g = MARK[e.kind];
      if (!g) return;
      const x = this.xOf(e.t, L);
      const y = this.rowY(e.actor) + this.rowH / 2 + 1;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = e.kind === 'paradox' || e.kind === 'seen' ? C.threat : e.kind === 'win' ? C.target : '#fff';
      ctx.fillText(g, x, y);
      ctx.globalAlpha = 1;
    };
    for (const e of s.upcoming) mark(e, 0.35);
    for (const e of s.events) mark(e, 1);

    // trim times while dragging a handle
    if (s.drag && (s.drag.kind === 'start' || s.drag.kind === 'end')) {
      const rec = s.lanes[s.drag.lane];
      if (rec) {
        const t = s.drag.kind === 'start' ? rec.delay : rec.delay + rec.cut;
        const x = this.xOf(t, L);
        const label = s.drag.kind === 'start' ? `starts ${(rec.delay / HZ).toFixed(1)}s` : `stops ${(t / HZ).toFixed(1)}s`;
        this.tipBox(label, x, this.rowY(s.drag.lane));
      }
    }
    if (s.tip) {
      const e = s.tip;
      this.tipBox(`${e.actor === s.liveSlot ? 'You' : `Copy ${e.actor + 1}`} ${s.describe(e) || VERB[e.kind] || e.kind} at ${(e.t / HZ).toFixed(2)}s`, this.xOf(e.t, L), this.rowY(e.actor));
    }

    // playhead
    const px = this.xOf(s.t, L);
    ctx.strokeStyle = s.recording ? '#fff' : C.plate;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, this.rulerH - 2);
    ctx.lineTo(px, this.rulerH + rows * this.rowH);
    ctx.stroke();
    ctx.fillStyle = s.recording ? '#fff' : C.plate;
    ctx.beginPath();
    ctx.moveTo(px - 6, 2);
    ctx.lineTo(px + 6, 2);
    ctx.lineTo(px, 10);
    ctx.closePath();
    ctx.fill();
    ctx.font = `600 10px ${FONT_MONO}`;
    ctx.textAlign = px > this.w - 50 ? 'right' : 'left';
    ctx.fillText(`${(s.t / HZ).toFixed(1)}s`, px + (px > this.w - 50 ? -8 : 8), 7);
  }
}
