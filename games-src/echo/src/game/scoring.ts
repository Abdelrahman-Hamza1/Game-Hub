/** Results and ranks (brief §3.7). */
import type { Game } from './game';
import type { LevelBest, Rank } from '../storage';

export function resultOf(game: Game): LevelBest {
  const { stats } = game;
  const ranks: Rank[] = [];
  if (stats.alerts === 0) ranks.push('ghost');
  // Guide only means something on levels with tourists (DESIGN.md decision 8).
  if (stats.total > 0 && stats.rescued === stats.total) ranks.push('guide');
  ranks.push('survivor');
  return {
    time: Math.round(game.endedAt * 10) / 10,
    sounds: stats.sounds,
    alerts: stats.alerts,
    rescued: stats.rescued,
    total: stats.total,
    ranks,
  };
}

export const RANK_INFO: Record<Rank, { label: string; how: string }> = {
  ghost: { label: 'Ghost', how: 'No Listener ever heard you.' },
  guide: { label: 'Guide', how: 'Every tourist brought out.' },
  survivor: { label: 'Survivor', how: 'You got out.' },
};

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
}
