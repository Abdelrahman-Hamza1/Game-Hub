/**
 * Minecart (DESIGN.md decision 16). Stands on a rail (`=`). Pushed with E, it rolls along the rails
 * at 6 tiles/s, rumbling (radius 8 every 0.4 s), and crashes at the end of the line (radius 18).
 */
import type { Game } from '../game/game';
import { CART_CRASH_RADIUS, CART_RUMBLE_EVERY, CART_RUMBLE_RADIUS, CART_SPEED } from '../game/constants';

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

export class Cart {
  x: number;
  y: number;
  at: number;
  next = -1;
  dx = 0;
  dy = 0;
  rolling = false;
  nextRumble = 0;
  seen = 0;
  pushes = 0;

  constructor(tile: number, w: number) {
    this.at = tile;
    this.x = (tile % w) + 0.5;
    this.y = ((tile / w) | 0) + 0.5;
  }
}

function railAt(g: Game, x: number, y: number): boolean {
  const L = g.level;
  return x >= 0 && y >= 0 && x < L.w && y < L.h && L.rail[y * L.w + x] === 1;
}

/** Push the cart away from (px, py). Returns false if it can't roll that way. */
export function pushCart(g: Game, c: Cart, px: number, py: number): boolean {
  if (c.rolling) return false;
  const w = g.level.w;
  const x = c.at % w;
  const y = (c.at / w) | 0;
  const ax = c.x - px;
  const ay = c.y - py;
  let best: readonly [number, number] | null = null;
  let bestDot = 0.05;
  for (const d of ORTHO) {
    if (!railAt(g, x + d[0], y + d[1])) continue;
    const dot = d[0] * ax + d[1] * ay;
    if (dot > bestDot) {
      bestDot = dot;
      best = d;
    }
  }
  if (!best) return false;
  c.dx = best[0];
  c.dy = best[1];
  c.next = (y + c.dy) * w + (x + c.dx);
  c.rolling = true;
  c.nextRumble = g.t;
  c.pushes++;
  g.stats.sounds++;
  g.push({ type: 'cart', x: c.x, y: c.y });
  return true;
}

export function updateCart(g: Game, c: Cart, dt: number): void {
  if (!c.rolling) return;
  if (g.t >= c.nextRumble) {
    c.nextRumble = g.t + CART_RUMBLE_EVERY;
    g.emit({ kind: 'rumble', owner: 'cart', x: c.x, y: c.y, radius: CART_RUMBLE_RADIUS, hear: CART_RUMBLE_RADIUS });
  }
  const w = g.level.w;
  let step = CART_SPEED * dt;
  while (step > 0 && c.rolling) {
    const tx = (c.next % w) + 0.5;
    const ty = ((c.next / w) | 0) + 0.5;
    const d = Math.hypot(tx - c.x, ty - c.y);
    if (d > step) {
      c.x += ((tx - c.x) / d) * step;
      c.y += ((ty - c.y) / d) * step;
      step = 0;
      break;
    }
    c.x = tx;
    c.y = ty;
    c.at = c.next;
    step -= d;
    // Next rail tile: straight on if possible, otherwise the one turn that isn't backwards.
    const x = c.at % w;
    const y = (c.at / w) | 0;
    let nd: readonly [number, number] | null = null;
    if (railAt(g, x + c.dx, y + c.dy)) nd = [c.dx, c.dy];
    else {
      for (const d of ORTHO) {
        if (d[0] === -c.dx && d[1] === -c.dy) continue;
        if (d[0] === c.dx && d[1] === c.dy) continue;
        if (railAt(g, x + d[0], y + d[1])) { nd = d; break; }
      }
    }
    if (!nd) {
      c.rolling = false;
      c.next = -1;
      g.emit({ kind: 'crash', owner: 'cart', x: c.x, y: c.y, radius: CART_CRASH_RADIUS, hear: CART_CRASH_RADIUS });
      g.push({ type: 'shake', amount: 3 });
      break;
    }
    c.dx = nd[0];
    c.dy = nd[1];
    c.next = (y + c.dy) * w + (x + c.dx);
  }
}
