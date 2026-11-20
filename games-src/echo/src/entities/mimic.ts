/**
 * Mimic (brief §3.5): invisible. 1–2 s after it hears the player clap or click, it plays a copy of
 * that sound from its own position. The copy looks the same, but it paints pits as floor
 * (DESIGN.md decision 12). Real pulses always start at Mira.
 */
import type { Game } from '../game/game';
import { MIMIC_DELAY_MAX, MIMIC_DELAY_MIN, MIMIC_HEAR_CLAP, MIMIC_HEAR_CLICK } from '../game/constants';
import type { Cone, Pulse, SoundKind } from '../sound/pulses';

interface PendingCopy {
  at: number;
  kind: SoundKind;
  radius: number;
  cone: Cone | null;
}

export class Mimic {
  readonly x: number;
  readonly y: number;
  pending: PendingCopy | null = null;
  copies = 0;

  constructor(readonly tile: number, w: number) {
    this.x = (tile % w) + 0.5;
    this.y = ((tile / w) | 0) + 0.5;
  }
}

/** Called for every real player pulse. */
export function mimicHear(g: Game, m: Mimic, p: Pulse): void {
  if (m.pending || p.fake || p.owner !== 'player') return;
  if (p.kind !== 'clap' && p.kind !== 'click') return;
  const reach = p.kind === 'clap' ? MIMIC_HEAR_CLAP : MIMIC_HEAR_CLICK;
  if (!(p.field.dist[m.tile] <= reach)) return;
  m.pending = {
    at: g.t + g.rng.range(MIMIC_DELAY_MIN, MIMIC_DELAY_MAX),
    kind: p.kind,
    radius: p.radius,
    cone: p.cone,
  };
}

export function updateMimic(g: Game, m: Mimic): void {
  if (!m.pending || g.t < m.pending.at) return;
  const c = m.pending;
  m.pending = null;
  m.copies++;
  g.emit({ kind: c.kind, owner: 'mimic', x: m.x, y: m.y, radius: c.radius, hear: 0, cone: c.cone, fake: true });
}
