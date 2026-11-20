/**
 * Tourists (brief §3.6). They sit and breathe softly. Hold a hand and they follow a tile behind in
 * silence. Let go for more than 2 s and they panic, calling out every 2 s until held again.
 */
import type { Game } from '../game/game';
import {
  TOURIST_BREATH_EVERY, TOURIST_BREATH_RADIUS, TOURIST_CALL_EVERY, TOURIST_CALL_RADIUS,
  TOURIST_FOLLOW_GAP, TOURIST_PANIC_AFTER,
} from '../game/constants';
import type { Player } from './player';

export type TouristState = 'sitting' | 'held' | 'waiting' | 'panic' | 'safe';

export class Tourist {
  x: number;
  y: number;
  state: TouristState = 'sitting';
  releasedAt = 0;
  nextBreath: number;
  nextCall = 0;
  seen = 0;
  /** Has been held at least once (for checkpoints). */
  met = false;

  constructor(readonly index: number, tile: number, w: number, breathOffset: number) {
    this.x = (tile % w) + 0.5;
    this.y = ((tile / w) | 0) + 0.5;
    this.nextBreath = breathOffset;
  }

  get calm(): boolean {
    return this.state === 'sitting' || this.state === 'waiting';
  }
}

export function updateTourist(g: Game, T: Tourist, p: Player, dt: number): void {
  const now = g.t;
  switch (T.state) {
    case 'safe':
      return;
    case 'held': {
      if (p.holding !== T) {
        T.state = 'waiting';
        T.releasedAt = now;
        break;
      }
      if (now < p.graceUntil) break; // hand briefly free: stand still
      follow(T, p, dt);
      // Got separated (e.g. the player was moved): let go.
      if (Math.hypot(T.x - p.x, T.y - p.y) > 4) {
        g.releaseTourist(T);
      }
      break;
    }
    case 'waiting':
      if (now - T.releasedAt > TOURIST_PANIC_AFTER) {
        T.state = 'panic';
        T.nextCall = now;
        g.push({ type: 'panic', x: T.x, y: T.y });
      }
      break;
    case 'sitting':
    case 'panic':
      break;
  }

  if (T.calm && now >= T.nextBreath) {
    T.nextBreath = now + TOURIST_BREATH_EVERY;
    g.emit({ kind: 'breath', owner: 'tourist', x: T.x, y: T.y, radius: TOURIST_BREATH_RADIUS, hear: 0 });
  }
  if (T.state === 'panic' && now >= T.nextCall) {
    T.nextCall = now + TOURIST_CALL_EVERY;
    g.emit({ kind: 'call', owner: 'tourist', x: T.x, y: T.y, radius: TOURIST_CALL_RADIUS, hear: TOURIST_CALL_RADIUS });
  }
}

/** Follow the player's trail, staying about one tile behind. */
function follow(T: Tourist, p: Player, dt: number): void {
  let target = { x: T.x, y: T.y };
  let acc = 0;
  let prev = { x: p.x, y: p.y };
  const trail = p.trail;
  let found = false;
  for (let i = trail.length - 1; i >= 0; i--) {
    const pt = trail[i];
    acc += Math.hypot(pt.x - prev.x, pt.y - prev.y);
    prev = pt;
    if (acc >= TOURIST_FOLLOW_GAP) {
      target = pt;
      found = true;
      break;
    }
  }
  if (!found) return; // already close enough
  const dx = target.x - T.x;
  const dy = target.y - T.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.02) return;
  const speed = Math.max(3.6, d * 6);
  const step = Math.min(d, speed * dt);
  T.x += (dx / d) * step;
  T.y += (dy / d) * step;
}
