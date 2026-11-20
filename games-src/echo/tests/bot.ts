/**
 * A headless playtester. It sneaks along the shortest walkable path to each tourist and then to the
 * exit, never making a deliberate sound, and steps away from any Listener that gets close. If it
 * escapes with 0 alerts on some seed, the level is beatable with a Ghost rank.
 */
import { Game } from '../src/game/game';
import { DIFFICULTIES, type DifficultyId } from '../src/game/difficulty';
import { noActions } from '../src/game/actions';
import { SIM_DT } from '../src/game/constants';
import { computeField, downhill, type Field } from '../src/sound/propagation';
import { tileAt } from '../src/world/grid';
import type { Level } from '../src/world/level';

export interface BotResult {
  seed: number;
  status: 'won' | 'failed' | 'timeout';
  reason: string;
  alerts: number;
  time: number;
  rescued: number;
  total: number;
}

export interface BotOptions {
  difficulty?: DifficultyId;
  maxTime?: number;
  /** Euclidean distance at which the bot backs away from a Listener. */
  evade?: number;
}

export function playGhost(level: Level, seed: number, opts: BotOptions = {}): BotResult {
  const g = new Game({ level, difficulty: DIFFICULTIES[opts.difficulty ?? 'blind'], seed });
  const maxTime = opts.maxTime ?? 300;
  const evade = opts.evade ?? 3.2;
  const fields = new Map<number, Field>();
  const walkField = (t: number) => {
    let f = fields.get(t);
    if (!f) {
      f = computeField(level, t, 400, level.pit);
      fields.set(t, f);
    }
    return f;
  };
  let lastPos = { x: g.player.x, y: g.player.y, t: 0 };
  let nudge = 0;

  while (g.status === 'playing' && g.t < maxTime) {
    const a = noActions();
    a.sneak = true;
    const p = g.player;
    const here = tileAt(level, p.x, p.y);

    // Goal: a tourist to fetch, else the exit.
    let goal = level.exit;
    let goalTourist = null as null | (typeof g.tourists)[number];
    if (!p.holding) {
      let best = Infinity;
      for (const T of g.tourists) {
        if (T.state === 'safe') continue;
        const d = walkField(tileAt(level, T.x, T.y)).dist[here];
        if (d < best) { best = d; goalTourist = T; }
      }
      if (goalTourist) goal = tileAt(level, goalTourist.x, goalTourist.y);
    }

    if (goalTourist && Math.hypot(goalTourist.x - p.x, goalTourist.y - p.y) < 1.0) {
      a.hand = true;
    } else {
      const f = walkField(goal);
      let next = downhill(level, f, here);
      if (next < 0) {
        next = goal;
      }
      const tx = (next % level.w) + 0.5;
      const ty = ((next / level.w) | 0) + 0.5;
      const mx = tx - p.x;
      const my = ty - p.y;
      const m = Math.hypot(mx, my);
      if (m > 0.02) { a.moveX = mx / m; a.moveY = my / m; }
    }

    // Back away from a nearby Listener.
    for (const L of g.listeners) {
      const dx = p.x - L.x;
      const dy = p.y - L.y;
      const d = Math.hypot(dx, dy);
      if (d < evade) {
        a.moveX = dx / d;
        a.moveY = dy / d;
        a.hand = false;
      }
    }

    // Unstick: if we haven't moved for a while, wiggle.
    if (g.t - lastPos.t > 1.5) {
      if (Math.hypot(p.x - lastPos.x, p.y - lastPos.y) < 0.1) nudge = 0.6;
      lastPos = { x: p.x, y: p.y, t: g.t };
    }
    if (nudge > 0) {
      nudge -= SIM_DT;
      a.moveX += Math.cos(g.t * 7) * 0.8;
      a.moveY += Math.sin(g.t * 5) * 0.8;
    }

    g.update(SIM_DT, a);
  }

  return {
    seed,
    status: g.status === 'playing' ? 'timeout' : g.status,
    reason: g.failReason,
    alerts: g.stats.alerts,
    time: g.t,
    rescued: g.stats.rescued,
    total: g.stats.total,
  };
}

/** Run several seeds; returns every result and whether any was a clean Ghost escape. */
export function ghostCheck(level: Level, seeds: number[], opts?: BotOptions): { ok: boolean; results: BotResult[] } {
  const results = seeds.map((s) => playGhost(level, s, opts));
  const ok = results.some((r) => r.status === 'won' && r.alerts === 0 && r.rescued === r.total);
  return { ok, results };
}
