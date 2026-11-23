/**
 * How each level object looks. One function per Thing kind (see src/sim/objects/registry.ts);
 * a new kind of object adds its drawer here. Coordinates are tiles; the context is already
 * scaled so 1 unit = 1 tile.
 */
import type { Button } from '../sim/objects/button';
import type { Bridge } from '../sim/objects/bridge';
import type { Gate } from '../sim/objects/gate';
import type { Lift } from '../sim/objects/lift';
import type { Mover } from '../sim/objects/mover';
import type { Plate } from '../sim/objects/plate';
import type { Pan } from '../sim/objects/scale';
import type { Thing } from '../sim/types';
import type { World } from '../sim/world';
import { INK, OBJ } from './palette';

type Ctx = CanvasRenderingContext2D;

export function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number | number[]): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** A small white pill with text, for counters like "1/2". */
export function pill(g: Ctx, cx: number, cy: number, text: string, color = INK): void {
  g.font = '700 0.42px Outfit, system-ui, sans-serif';
  const tw = g.measureText(text).width;
  const w = tw + 0.36;
  g.fillStyle = 'rgba(255,255,255,0.92)';
  roundRect(g, cx - w / 2, cy - 0.27, w, 0.54, 0.27);
  g.fill();
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, cx, cy + 0.02);
}

function plate(g: Ctx, p: Plate): void {
  g.fillStyle = p.on ? OBJ.switch : OBJ.switchOff;
  const sink = p.on ? 0.08 : 0;
  g.fillRect(p.x + 0.04, p.y + 0.82 + sink, p.w - 0.08, 0.18 - sink);
  pill(g, p.x + p.w / 2, p.y + 0.4, `${Math.min(p.count, 99)}/${p.n}`, p.on ? '#c23a42' : INK);
}

function button(g: Ctx, b: Button, w: World): void {
  // the knob sits on the side that faces open air
  const lv = w.lv;
  const air = (x: number, y: number) => x >= 0 && y >= 0 && x < lv.w && y < lv.h && '#-~LMBsjo1234AEFGH'.indexOf(lv.rows[y][x]) < 0;
  const c = b.on ? OBJ.switch : OBJ.switchOff;
  g.fillStyle = '#ffffff';
  g.fillRect(b.x, b.y, 1, 1);
  g.fillStyle = c;
  if (air(b.x, b.y - 1)) roundRect(g, b.x + 0.18, b.y + 0.15, 0.64, 0.55, 0.22);
  else if (air(b.x - 1, b.y)) roundRect(g, b.x + 0.12, b.y + 0.18, 0.55, 0.64, 0.22);
  else if (air(b.x + 1, b.y)) roundRect(g, b.x + 0.33, b.y + 0.18, 0.55, 0.64, 0.22);
  else roundRect(g, b.x + 0.18, b.y + 0.3, 0.64, 0.55, 0.22);
  g.fill();
  if (b.hold > 0 && b.timer > 0) {
    // a ring that runs down with the timer
    g.strokeStyle = INK;
    g.lineWidth = 0.08;
    g.beginPath();
    g.arc(b.x + 0.5, b.y + 0.5, 0.42, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * b.timer) / Math.round(b.hold * 60));
    g.stroke();
  }
}

function gate(g: Ctx, gt: Gate): void {
  const r = gt.r;
  const k = gt.anim; // 0 closed … 1 open
  if (k > 0.98) {
    // just the frame lines where it was
    g.fillStyle = 'rgba(255,122,122,0.35)';
    if (r.h >= r.w) {
      g.fillRect(r.x, r.y, r.w, 0.1);
    } else g.fillRect(r.x, r.y, 0.1, r.h);
    letter(g, gt, 0.5);
    return;
  }
  g.fillStyle = OBJ.switch;
  if (r.h >= r.w) {
    const h = r.h * (1 - k);
    for (let i = 0; i < r.w; i++) {
      g.fillRect(r.x + i + 0.2, r.y, 0.6, h);
    }
    g.fillRect(r.x + 0.1, r.y, r.w - 0.2, 0.14);
  } else {
    const w = r.w * (1 - k);
    for (let i = 0; i < r.h; i++) g.fillRect(r.x, r.y + i + 0.2, w, 0.6);
  }
  letter(g, gt, 1);
}

function letter(g: Ctx, gt: Gate, alpha: number): void {
  const r = gt.r;
  g.globalAlpha = alpha;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(r.x + r.w / 2, r.y - 0.4, 0.3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#c23a42';
  g.font = '800 0.4px Outfit, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(gt.letter, r.x + r.w / 2, r.y - 0.38);
  g.globalAlpha = 1;
}

function bridge(g: Ctx, b: Bridge): void {
  const r = b.r;
  if (b.broken) {
    // planks fall away, then flicker back in the last second
    if (b.broken < 60 && Math.floor(b.broken / 6) % 2 === 0) {
      g.globalAlpha = 0.35;
      planks(g, r.x, r.y, r.w);
      g.globalAlpha = 1;
    }
    return;
  }
  planks(g, r.x, r.y, r.w);
  pill(g, r.x + r.w / 2, r.y - 0.45, `holds ${b.n}`);
}

function planks(g: Ctx, x: number, y: number, w: number): void {
  g.fillStyle = OBJ.plank;
  for (let i = 0; i < w; i++) g.fillRect(x + i + 0.04, y, 0.92, 0.32);
  g.fillStyle = 'rgba(61,61,92,0.18)';
  g.fillRect(x, y + 0.32, w, 0.06);
}

function lift(g: Ctx, l: Lift): void {
  // the rail it runs on
  g.strokeStyle = 'rgba(61,61,92,0.18)';
  g.lineWidth = 0.08;
  g.setLineDash([0.15, 0.2]);
  g.beginPath();
  l.path.pts.forEach(([x, y], i) => {
    const cx = x + l.box.w / 2;
    const cy = y + l.box.h / 2;
    if (i === 0) g.moveTo(cx, cy);
    else g.lineTo(cx, cy);
  });
  g.stroke();
  g.setLineDash([]);
  const b = l.box;
  g.fillStyle = OBJ.lift;
  roundRect(g, b.x, b.y, b.w, b.h, 0.12);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(b.x + 0.1, b.y + 0.1, b.w - 0.2, 0.12);
  g.fillStyle = '#ffffff';
  g.font = '800 0.5px Outfit, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(`${Math.min(l.riders, l.n)}/${l.n}`, b.x + b.w / 2, b.y + b.h / 2 + 0.04);
}

function mover(g: Ctx, m: Mover): void {
  g.strokeStyle = 'rgba(61,61,92,0.14)';
  g.lineWidth = 0.08;
  g.setLineDash([0.15, 0.2]);
  g.beginPath();
  m.path.pts.forEach(([x, y], i) => {
    const cx = x + m.box.w / 2;
    const cy = y + m.box.h / 2;
    if (i === 0) g.moveTo(cx, cy);
    else g.lineTo(cx, cy);
  });
  g.stroke();
  g.setLineDash([]);
  const b = m.box;
  g.fillStyle = OBJ.mover;
  roundRect(g, b.x, b.y, b.w, b.h, 0.12);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.3)';
  g.fillRect(b.x + 0.1, b.y + 0.1, b.w - 0.2, 0.12);
}

function pan(g: Ctx, p: Pan): void {
  const b = p.box;
  // strings up to the beam
  g.strokeStyle = 'rgba(61,61,92,0.35)';
  g.lineWidth = 0.06;
  g.beginPath();
  g.moveTo(b.x + 0.15, b.y);
  g.lineTo(b.x + b.w / 2, b.y - 1.6);
  g.lineTo(b.x + b.w - 0.15, b.y);
  g.stroke();
  g.fillStyle = OBJ.pan;
  roundRect(g, b.x, b.y, b.w, 0.4, 0.15);
  g.fill();
  g.fillStyle = 'rgba(138,127,214,0.35)';
  g.fillRect(b.x + 0.1, b.y + 0.4, b.w - 0.2, b.h - 0.4);
  pill(g, b.x + b.w / 2, b.y - 1.9, String(p.weight));
}

export function drawThing(g: Ctx, th: Thing, w: World): void {
  switch (th.kind) {
    case 'plate':
      return plate(g, th as Plate);
    case 'button':
      return button(g, th as Button, w);
    case 'gate':
      return gate(g, th as Gate);
    case 'bridge':
      return bridge(g, th as Bridge);
    case 'lift':
      return lift(g, th as Lift);
    case 'mover':
      return mover(g, th as Mover);
    case 'pan':
      return pan(g, th as Pan);
  }
}

/** Faint dotted wires from plates and buttons to the gates they open. */
export function drawWires(g: Ctx, w: World): void {
  const gates = w.things.filter((t) => t.kind === 'gate') as Gate[];
  g.lineWidth = 0.06;
  g.setLineDash([0.08, 0.22]);
  g.lineCap = 'round';
  for (const th of w.things) {
    let wires: string[] = [];
    let x = 0;
    let y = 0;
    let on = false;
    if (th.kind === 'plate') {
      const p = th as Plate;
      wires = p.wires;
      x = p.x + p.w / 2;
      y = p.y + 0.9;
      on = p.on;
    } else if (th.kind === 'button') {
      const b = th as Button;
      wires = b.wires;
      x = b.x + 0.5;
      y = b.y + 0.5;
      on = b.on;
    } else continue;
    for (const gt of gates) {
      if (!wires.includes(gt.letter)) continue;
      const tx = gt.r.x + gt.r.w / 2;
      const ty = gt.r.y - 0.4;
      g.strokeStyle = on ? 'rgba(255,122,122,0.55)' : 'rgba(61,61,92,0.16)';
      g.beginPath();
      g.moveTo(x, y);
      const my = Math.min(y, ty) - 1.2;
      g.bezierCurveTo(x, my, tx, my, tx, ty);
      g.stroke();
    }
  }
  g.setLineDash([]);
}
