/** Mira: movement, footsteps, and every sound she can make (brief §3.2). */
import type { Actions } from '../game/actions';
import type { Game } from '../game/game';
import {
  CANE_CONE_DEG, CANE_COOLDOWN, CANE_HEAR, CANE_RADIUS, CLAP_COOLDOWN, CLAP_RADIUS, CLICK_CONE_DEG,
  CLICK_COOLDOWN, CLICK_HEAR, CLICK_RADIUS, HAND_GRACE, PLAYER_RADIUS, PLAYER_SPEED, SNEAK_SPEED,
  SNEAK_STEP_EVERY, SNEAK_STEP_RADIUS, STEP_EVERY, STEP_RADIUS, STONE_MAX_CARRY, STONE_MIN_RANGE,
  STONE_RADIUS, STONE_RANGE, STONE_SPEED,
} from '../game/constants';
import { moveCircle, tileAt } from '../world/grid';
import { STEP_MULT } from '../world/level';
import type { Tourist } from './tourist';

export interface Stone {
  x: number;
  y: number;
  dx: number;
  dy: number;
  left: number;
}

const DEG = Math.PI / 180;

export class Player {
  x: number;
  y: number;
  /** Facing angle in radians (0 = right). Follows the movement direction. */
  facing = 0;
  sneaking = false;
  moving = false;
  stepAccum = 0;
  cdClick = 0;
  cdClap = 0;
  cdCane = 0;
  stones: number;
  stoneCap: number;
  holding: Tourist | null = null;
  /** Clap/throw frees the hand until this time, then it's taken again. */
  graceUntil = 0;
  onExit = false;
  /** Recent positions, newest last, for tourists to follow. */
  trail: { x: number; y: number }[] = [];

  constructor(x: number, y: number, stones: number) {
    this.x = x;
    this.y = y;
    this.stones = stones;
    this.stoneCap = Math.max(STONE_MAX_CARRY, stones);
  }

  /** Is the hand free for clapping/throwing right now? */
  handBusy(now: number): boolean {
    return this.holding !== null && now >= this.graceUntil;
  }
}

/** Free the hand briefly (clap, throw). The tourist doesn't panic (DESIGN.md decision 6). */
function freeHand(g: Game, p: Player): void {
  if (p.holding) p.graceUntil = g.t + HAND_GRACE;
}

export function updatePlayer(g: Game, p: Player, a: Actions, dt: number): void {
  const level = g.level;
  p.cdClick = Math.max(0, p.cdClick - dt);
  p.cdClap = Math.max(0, p.cdClap - dt);
  p.cdCane = Math.max(0, p.cdCane - dt);

  // ---- Movement ----
  p.sneaking = a.sneak;
  let mx = a.moveX;
  let my = a.moveY;
  const mag = Math.hypot(mx, my);
  p.moving = mag > 0.15;
  if (p.moving) {
    mx /= mag;
    my /= mag;
    p.facing = Math.atan2(my, mx);
    const speed = (p.sneaking ? SNEAK_SPEED : PLAYER_SPEED) * Math.min(1, mag / 0.85);
    const before = { x: p.x, y: p.y };
    const moved = moveCircle(level, p.x, p.y, mx * speed * dt, my * speed * dt, PLAYER_RADIUS);
    p.x = moved.x;
    p.y = moved.y;
    const dist = Math.hypot(p.x - before.x, p.y - before.y);
    if (dist > 0) {
      const last = p.trail[p.trail.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.15) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 60) p.trail.shift();
      }
    }
    p.stepAccum += dist;
    const every = p.sneaking ? SNEAK_STEP_EVERY : STEP_EVERY;
    if (p.stepAccum >= every) {
      p.stepAccum -= every;
      const t = tileAt(level, p.x, p.y);
      const mat = level.mat[t] as keyof typeof STEP_MULT;
      const radius = (p.sneaking ? SNEAK_STEP_RADIUS : STEP_RADIUS) * STEP_MULT[mat];
      if (radius > 0) {
        g.emit({ kind: p.sneaking ? 'sneak' : 'step', owner: 'player', x: p.x, y: p.y, radius, hear: radius });
      }
    }
  }

  // ---- Sounds ----
  if (a.click && p.cdClick <= 0) {
    p.cdClick = CLICK_COOLDOWN;
    g.emit({
      kind: 'click', owner: 'player', x: p.x, y: p.y, radius: CLICK_RADIUS, hear: CLICK_HEAR,
      cone: { dir: p.facing, half: (CLICK_CONE_DEG / 2) * DEG },
    });
  }
  if (a.clap && p.cdClap <= 0) {
    p.cdClap = CLAP_COOLDOWN;
    freeHand(g, p);
    g.emit({ kind: 'clap', owner: 'player', x: p.x, y: p.y, radius: CLAP_RADIUS, hear: CLAP_RADIUS });
    g.push({ type: 'shake', amount: 2 });
  }
  if (a.cane && p.cdCane <= 0) {
    p.cdCane = CANE_COOLDOWN;
    g.emit({
      kind: 'cane', owner: 'player', x: p.x, y: p.y, radius: CANE_RADIUS, hear: CANE_HEAR,
      cone: { dir: p.facing, half: (CANE_CONE_DEG / 2) * DEG },
    });
  }
  if (a.throwAt || a.throwDir) {
    if (p.stones <= 0) {
      g.push({ type: 'nostones' });
    } else {
      let dx: number;
      let dy: number;
      let range = STONE_RANGE;
      if (a.throwAt) {
        dx = a.throwAt.x - p.x;
        dy = a.throwAt.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 1e-3) { dx = Math.cos(p.facing); dy = Math.sin(p.facing); }
        range = Math.max(STONE_MIN_RANGE, Math.min(STONE_RANGE, d));
      } else {
        dx = a.throwDir!.x;
        dy = a.throwDir!.y;
      }
      const len = Math.hypot(dx, dy) || 1;
      p.stones--;
      freeHand(g, p);
      g.stones.push({ x: p.x, y: p.y, dx: dx / len, dy: dy / len, left: range });
    }
  }
  if (a.hand) handAction(g, p);
}

/**
 * E / Y / Hand, in priority order: let go of a held hand, take a hand within reach, leave through
 * the exit (when tourists remain), pick up a stone on rubble, push a minecart.
 */
function handAction(g: Game, p: Player): void {
  const level = g.level;
  const here = tileAt(level, p.x, p.y);
  if (p.holding) {
    g.releaseTourist(p.holding);
    return;
  }
  if (g.tryGrabTourist(p)) return;
  if (g.tryLeave()) return;
  if (level.rubble[here]) {
    if (p.stones < p.stoneCap) {
      p.stones++;
      g.push({ type: 'pickup', stones: p.stones });
    } else {
      g.push({ type: 'message', text: `Your pockets are full (${p.stoneCap} stones).` });
    }
    return;
  }
  g.tryPushCart(p);
}

/** Advance stones in flight; a stone stops at a wall or at its range and makes a sound. */
export function updateStones(g: Game, dt: number): void {
  const level = g.level;
  for (let i = g.stones.length - 1; i >= 0; i--) {
    const s = g.stones[i];
    const step = Math.min(s.left, STONE_SPEED * dt);
    let nx = s.x + s.dx * step;
    let ny = s.y + s.dy * step;
    let landed = false;
    const t = tileAt(level, nx, ny);
    if (level.solid[t] || nx < 0 || ny < 0 || nx >= level.w || ny >= level.h) {
      nx = s.x;
      ny = s.y;
      landed = true;
    }
    s.x = nx;
    s.y = ny;
    s.left -= step;
    if (s.left <= 1e-4) landed = true;
    if (landed) {
      g.stones.splice(i, 1);
      g.emit({ kind: 'stone', owner: 'player', x: s.x, y: s.y, radius: STONE_RADIUS, hear: STONE_RADIUS });
    }
  }
}
